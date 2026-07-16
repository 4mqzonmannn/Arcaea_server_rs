//! Admin web exposure of `service::bundle_manager` (deep songlist/unlocks/
//! packlist consistency scan + incremental content-bundle build). Mirrors
//! the CLI binary (`src/bin/bundle_manager/`) exactly, calling the same
//! in-process functions rather than shelling out.
//!
//! `build` writes files and can bypass the pre-flight scan gate via
//! `force` -- this is a genuinely dangerous admin operation, so the
//! intended client flow is: always call with `dry_run: true` first (which
//! never writes anything and is never blocked by scan errors) to show the
//! admin a real preview, then only send `dry_run: false` once they've
//! explicitly reviewed that preview and confirmed in the UI.

use std::path::PathBuf;

use rocket::form::Form;
use rocket::fs::TempFile;
use rocket::http::CookieJar;
use rocket::serde::json::Json;
use rocket::{delete, get, post, FromForm, State};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ArcError;
use crate::route::common::{success_return, RouteResult};
use crate::service::bundle_manager::{
    build,
    build::BuildArgs,
    catalog_edit::{ArrayFile, CatalogDeleteResult, CatalogKind, CatalogUpsertResult},
    import,
    import::ImportResult,
    schema,
    scan::ScanReport,
    songlist::{DeleteResult, SonglistFile, SongSummary, UpsertResult},
};
use crate::DbPool;

use super::session::require_admin_api;

/// Live paths the server actually reads bundles/songs from at runtime
/// (`src/main.rs` hardcodes these, not `config::CONFIG.*_folder_path`) --
/// the admin UI doesn't take arbitrary filesystem paths, it always operates
/// on the same directories the running server serves from.
fn songs_dir() -> PathBuf {
    PathBuf::from("./songs")
}

fn bundles_dir() -> PathBuf {
    PathBuf::from("./bundles")
}

fn anyhow_to_arc(e: anyhow::Error) -> ArcError {
    ArcError::input(e.to_string())
}

#[post("/api/bundle-manager/scan")]
pub(super) async fn admin_api_bundle_manager_scan(
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<ScanReport> {
    require_admin_api(cookies, pool.inner()).await?;

    let songs = songs_dir();
    let catalog = schema::load_catalog(&songs).map_err(anyhow_to_arc)?;
    let report = crate::service::bundle_manager::scan::scan(&songs, &catalog).map_err(anyhow_to_arc)?;
    Ok(success_return(report))
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminBundleBuildPayload {
    app_version: String,
    bundle_version: Option<String>,
    #[serde(default)]
    dry_run: bool,
    #[serde(default)]
    force: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AdminBundleBuildResponse {
    #[serde(flatten)]
    result: build::BuildResult,
    scan_error_count: usize,
    scan_warn_count: usize,
}

#[post("/api/bundle-manager/build", format = "json", data = "<payload>")]
pub(super) async fn admin_api_bundle_manager_build(
    payload: Json<AdminBundleBuildPayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<AdminBundleBuildResponse> {
    require_admin_api(cookies, pool.inner()).await?;

    let songs = songs_dir();
    let catalog = schema::load_catalog(&songs).map_err(anyhow_to_arc)?;
    let report = crate::service::bundle_manager::scan::scan(&songs, &catalog).map_err(anyhow_to_arc)?;

    // The pre-flight gate only blocks actual writes. A dry run never writes
    // anything, so it's always allowed -- that's precisely what lets the
    // frontend show a real, informative preview (including these findings)
    // before the admin decides whether to force past them.
    if !payload.dry_run && report.has_errors() && !payload.force {
        return Err(ArcError::input(format!(
            "pre-flight scan found {} error-level issue(s); pass force:true after reviewing them to build anyway",
            report.error_count
        )));
    }

    let result = build::build(&BuildArgs {
        songs,
        bundles: bundles_dir(),
        img: None,
        app_version: payload.app_version.clone(),
        bundle_version: payload.bundle_version.clone(),
        dry_run: payload.dry_run,
    })
    .map_err(anyhow_to_arc)?;

    Ok(success_return(AdminBundleBuildResponse {
        result,
        scan_error_count: report.error_count,
        scan_warn_count: report.warn_count,
    }))
}

// ---- songlist editor ----
//
// These operate on the raw songlist JSON (see `service::bundle_manager::
// songlist` for the round-trip/backup guarantees). Every mutation backs up
// the file first and returns the backup path so the UI can surface it.

#[get("/api/bundle-manager/songs")]
pub(super) async fn admin_api_bundle_manager_songs(
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Vec<SongSummary>> {
    require_admin_api(cookies, pool.inner()).await?;

    let songs = songs_dir();
    let file = SonglistFile::load(&songs).map_err(anyhow_to_arc)?;
    Ok(success_return(file.summaries(&songs).map_err(anyhow_to_arc)?))
}

#[get("/api/bundle-manager/song?<id>")]
pub(super) async fn admin_api_bundle_manager_song_get(
    id: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Value> {
    require_admin_api(cookies, pool.inner()).await?;

    let file = SonglistFile::load(&songs_dir()).map_err(anyhow_to_arc)?;
    match file.entry(id) {
        Some(entry) => Ok(success_return(entry.clone())),
        None => Err(ArcError::input(format!("song `{id}` not found in songlist"))),
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminSongUpsertPayload {
    /// `Some` = edit this existing entry (rename allowed), `None` = add new.
    original_id: Option<String>,
    entry: Value,
}

#[post("/api/bundle-manager/song", format = "json", data = "<payload>")]
pub(super) async fn admin_api_bundle_manager_song_upsert(
    payload: Json<AdminSongUpsertPayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<UpsertResult> {
    require_admin_api(cookies, pool.inner()).await?;

    let payload = payload.into_inner();
    let mut file = SonglistFile::load(&songs_dir()).map_err(anyhow_to_arc)?;
    let result = file
        .upsert(payload.original_id.as_deref(), payload.entry)
        .map_err(anyhow_to_arc)?;
    Ok(success_return(result))
}

#[derive(FromForm)]
pub(super) struct AdminSongImportForm<'r> {
    /// JSON text of the songlist entry to add/update for this song.
    entry: String,
    #[field(default = false)]
    overwrite: bool,
    files: Vec<TempFile<'r>>,
}

#[post("/api/bundle-manager/import", data = "<form>")]
pub(super) async fn admin_api_bundle_manager_import(
    form: Form<AdminSongImportForm<'_>>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<ImportResult> {
    require_admin_api(cookies, pool.inner()).await?;

    let mut form = form.into_inner();
    let entry: Value = serde_json::from_str(&form.entry)
        .map_err(|e| ArcError::input(format!("entry is not valid JSON: {e}")))?;

    // Browser-supplied file names: use the raw (unsanitized) name because
    // Rocket's sanitized `FileName::as_str` strips the extension, and the
    // whitelist in `plan_import`/`classify_file` only admits exact known
    // song-asset names (no separators), which neutralizes traversal anyway.
    let file_names: Vec<String> = form
        .files
        .iter()
        .map(|f| {
            f.raw_name()
                .map(|n| n.dangerous_unsafe_unsanitized_raw().as_str().to_string())
                .unwrap_or_default()
        })
        .collect();

    let songs = songs_dir();
    let plan = import::plan_import(&songs, &entry, &file_names, form.overwrite)
        .map_err(anyhow_to_arc)?;

    // Copy accepted files into place. Rejected names are reported, not fatal
    // (dropped folders routinely contain songlist/slst themselves, .DS_Store
    // and other tooling artifacts).
    let mut files_written = Vec::new();
    for (file, name) in form.files.iter_mut().zip(&file_names) {
        let Some(planned) = plan.files.iter().find(|p| &p.name == name) else {
            continue;
        };
        let dest = import::prepare_dest(&songs, planned).map_err(anyhow_to_arc)?;
        // copy_to (not persist_to): works for both in-memory-buffered and
        // on-disk temp files, and survives the temp dir and ./songs being
        // on different filesystems (container tmpfs vs. bind mount).
        file.copy_to(&dest)
            .await
            .map_err(|e| ArcError::input(format!("writing {}: {e}", dest.display())))?;
        files_written.push(planned.dest.clone());
    }

    // Files are on disk -- now record the song in the songlist (backup + upsert).
    let mut songlist = SonglistFile::load(&songs).map_err(anyhow_to_arc)?;
    let original_id = songlist.entry(&plan.id).map(|_| plan.id.clone());
    let created = original_id.is_none();
    let upsert = songlist
        .upsert(original_id.as_deref(), entry)
        .map_err(anyhow_to_arc)?;

    Ok(success_return(ImportResult {
        id: plan.id,
        created,
        remote_dl: plan.remote_dl,
        files_written,
        rejected: plan.rejected,
        songlist_backup_path: upsert.backup_path,
    }))
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminSongDeletePayload {
    ids: Vec<String>,
    #[serde(default)]
    cascade_unlocks: bool,
}

#[delete("/api/bundle-manager/songs", format = "json", data = "<payload>")]
pub(super) async fn admin_api_bundle_manager_songs_delete(
    payload: Json<AdminSongDeletePayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<DeleteResult> {
    require_admin_api(cookies, pool.inner()).await?;

    let payload = payload.into_inner();
    if payload.ids.is_empty() {
        return Err(ArcError::input("ids must not be empty".to_string()));
    }
    let songs = songs_dir();
    let mut file = SonglistFile::load(&songs).map_err(anyhow_to_arc)?;
    let result = file
        .delete(&songs, &payload.ids, payload.cascade_unlocks)
        .map_err(anyhow_to_arc)?;
    Ok(success_return(result))
}

// ---- packlist / unlocks editors ----
//
// Generic array-JSON editors (see service::bundle_manager::catalog_edit).
// The `<kind>` path segment selects the file: "packlist" or "unlocks".

fn parse_kind(kind: &str) -> Result<CatalogKind, ArcError> {
    match kind {
        "packlist" => Ok(CatalogKind::Packlist),
        "unlocks" => Ok(CatalogKind::Unlocks),
        _ => Err(ArcError::input("unknown catalog kind (expected packlist|unlocks)")),
    }
}

#[get("/api/bundle-manager/catalog/<kind>")]
pub(super) async fn admin_api_bundle_manager_catalog_list(
    kind: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Vec<Value>> {
    require_admin_api(cookies, pool.inner()).await?;
    let file = ArrayFile::load(&songs_dir(), parse_kind(kind)?).map_err(anyhow_to_arc)?;
    Ok(success_return(file.list()))
}

#[get("/api/bundle-manager/catalog/<kind>/entry?<id>")]
pub(super) async fn admin_api_bundle_manager_catalog_get(
    kind: &str,
    id: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Value> {
    require_admin_api(cookies, pool.inner()).await?;
    let file = ArrayFile::load(&songs_dir(), parse_kind(kind)?).map_err(anyhow_to_arc)?;
    match file.get(id) {
        Some(entry) => Ok(success_return(entry.clone())),
        None => Err(ArcError::input(format!("entry `{id}` not found"))),
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminCatalogUpsertPayload {
    original_id: Option<String>,
    entry: Value,
}

#[post("/api/bundle-manager/catalog/<kind>", format = "json", data = "<payload>")]
pub(super) async fn admin_api_bundle_manager_catalog_upsert(
    kind: &str,
    payload: Json<AdminCatalogUpsertPayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<CatalogUpsertResult> {
    require_admin_api(cookies, pool.inner()).await?;
    let payload = payload.into_inner();
    let mut file = ArrayFile::load(&songs_dir(), parse_kind(kind)?).map_err(anyhow_to_arc)?;
    let result = file
        .upsert(payload.original_id.as_deref(), payload.entry)
        .map_err(anyhow_to_arc)?;
    Ok(success_return(result))
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminCatalogDeletePayload {
    ids: Vec<String>,
}

#[delete("/api/bundle-manager/catalog/<kind>", format = "json", data = "<payload>")]
pub(super) async fn admin_api_bundle_manager_catalog_delete(
    kind: &str,
    payload: Json<AdminCatalogDeletePayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<CatalogDeleteResult> {
    require_admin_api(cookies, pool.inner()).await?;
    let payload = payload.into_inner();
    if payload.ids.is_empty() {
        return Err(ArcError::input("ids must not be empty".to_string()));
    }
    let mut file = ArrayFile::load(&songs_dir(), parse_kind(kind)?).map_err(anyhow_to_arc)?;
    let result = file.delete(&payload.ids).map_err(anyhow_to_arc)?;
    Ok(success_return(result))
}

// ---- packlist deletion with referencing-song handling ----
//
// Deleting a pack whose id is still referenced by a song's `set` leaves that
// song with a dangling pack binding, which CRASHES the client. These routes
// let the admin see which songs reference a pack and choose what happens to
// them: leave as-is (dangerous), delete them, or repoint them onto another
// pack.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PackReferencesResponse {
    pack_id: String,
    song_ids: Vec<String>,
}

#[get("/api/bundle-manager/packlist/references?<id>")]
pub(super) async fn admin_api_packlist_references(
    id: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<PackReferencesResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let songs = SonglistFile::load(&songs_dir()).map_err(anyhow_to_arc)?;
    Ok(success_return(PackReferencesResponse {
        pack_id: id.to_string(),
        song_ids: songs.ids_in_set(id),
    }))
}

#[derive(Debug, Deserialize)]
pub(super) struct PacklistDeletePayload {
    pack_id: String,
    /// "none" (leave songs -- dangerous), "delete_songs", or "reassign".
    action: String,
    /// Target pack id when action == "reassign".
    reassign_to: Option<String>,
    /// When action == "delete_songs", also drop those songs' unlocks entries.
    #[serde(default)]
    cascade_unlocks: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PacklistDeleteResponse {
    pack_id: String,
    action: String,
    referencing_song_count: usize,
    reassigned_to: Option<String>,
    deleted_songs: usize,
    removed_unlocks: usize,
    backups: Vec<String>,
}

#[post("/api/bundle-manager/packlist/delete", format = "json", data = "<payload>")]
pub(super) async fn admin_api_packlist_delete(
    payload: Json<PacklistDeletePayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<PacklistDeleteResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let payload = payload.into_inner();
    let songs = songs_dir();
    let mut backups = Vec::new();

    // Songs currently bound to this pack.
    let mut songlist = SonglistFile::load(&songs).map_err(anyhow_to_arc)?;
    let members = songlist.ids_in_set(&payload.pack_id);
    let referencing_song_count = members.len();

    let mut reassigned_to = None;
    let mut deleted_songs = 0usize;
    let mut removed_unlocks = 0usize;

    // Handle the referencing songs first (so the pack never disappears while
    // songs still point at it in a half-applied state).
    match payload.action.as_str() {
        "none" => {}
        "reassign" => {
            let to = payload
                .reassign_to
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| ArcError::input("reassign_to (付け替え先パック) を指定してください"))?;
            if to == payload.pack_id {
                return Err(ArcError::input("削除するパック自身へは付け替えられません"));
            }
            // Target must be a real pack or a non-pack sentinel, else we'd just
            // recreate the same dangling-set crash.
            let is_sentinel = to == "base" || to == "single";
            if !is_sentinel {
                let packlist = ArrayFile::load(&songs, CatalogKind::Packlist).map_err(anyhow_to_arc)?;
                if packlist.get(to).is_none() {
                    return Err(ArcError::input(format!(
                        "付け替え先パック `{to}` が packlist に存在しません"
                    )));
                }
            }
            if referencing_song_count > 0 {
                let (count, backup) = songlist
                    .reassign_set(&payload.pack_id, to)
                    .map_err(anyhow_to_arc)?;
                backups.push(backup);
                let _ = count;
            }
            reassigned_to = Some(to.to_string());
        }
        "delete_songs" => {
            if referencing_song_count > 0 {
                let result = songlist
                    .delete(&songs, &members, payload.cascade_unlocks)
                    .map_err(anyhow_to_arc)?;
                deleted_songs = result.removed_songs;
                removed_unlocks = result.removed_unlocks;
                backups.push(result.songlist_backup_path);
                if let Some(b) = result.unlocks_backup_path {
                    backups.push(b);
                }
            }
        }
        other => {
            return Err(ArcError::input(format!(
                "unknown action `{other}` (expected none|delete_songs|reassign)"
            )));
        }
    }

    // Finally remove the pack itself.
    let mut packlist = ArrayFile::load(&songs, CatalogKind::Packlist).map_err(anyhow_to_arc)?;
    let del = packlist
        .delete(&[payload.pack_id.clone()])
        .map_err(anyhow_to_arc)?;
    backups.push(del.backup_path);

    Ok(success_return(PacklistDeleteResponse {
        pack_id: payload.pack_id,
        action: payload.action,
        referencing_song_count,
        reassigned_to,
        deleted_songs,
        removed_unlocks,
        backups,
    }))
}
