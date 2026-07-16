//! Admin web image serving: song jackets and pack select images, read from
//! the same `./songs` tree the bundle is built from, so the editor UI can
//! show thumbnails.
//!
//! Ids are validated to `[a-z0-9_]+` before being used as path segments (no
//! separators, no traversal), and each endpoint only ever looks inside a
//! fixed set of candidate filenames under `./songs`.

use std::path::PathBuf;

use rocket::fs::NamedFile;
use rocket::http::{CookieJar, Header};
use rocket::response::Responder;
use rocket::{get, post, Request, State};

use crate::error::ArcError;
use crate::DbPool;

use super::session::require_admin_api;

fn songs_dir() -> PathBuf {
    PathBuf::from("./songs")
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// A served image with a short cache lifetime (thumbnails rarely change and
/// the list re-renders often).
pub(super) struct ImageFile(NamedFile);

impl<'r> Responder<'r, 'static> for ImageFile {
    fn respond_to(self, request: &'r Request<'_>) -> rocket::response::Result<'static> {
        let mut response = self.0.respond_to(request)?;
        response.set_header(Header::new("Cache-Control", "private, max-age=300"));
        Ok(response)
    }
}

async fn first_existing(candidates: &[PathBuf]) -> Option<NamedFile> {
    for path in candidates {
        if let Ok(file) = NamedFile::open(path).await {
            return Some(file);
        }
    }
    None
}

/// Jacket for a song, preferring the small 256px variant. Looks in both the
/// full-data folder and the `dl_` preview folder (remote_dl songs keep their
/// jacket there).
#[get("/api/asset/jacket?<song>")]
pub(super) async fn admin_api_asset_jacket(
    song: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> Result<ImageFile, ArcError> {
    require_admin_api(cookies, pool.inner()).await?;
    if !valid_id(song) {
        return Err(ArcError::input("invalid song id"));
    }
    let dir = songs_dir();
    let candidates: Vec<PathBuf> = [
        format!("{song}/1080_base_256.jpg"),
        format!("{song}/base_256.jpg"),
        format!("{song}/1080_base.jpg"),
        format!("{song}/base.jpg"),
        format!("dl_{song}/1080_base_256.jpg"),
        format!("dl_{song}/1080_base.jpg"),
        format!("dl_{song}/base.jpg"),
    ]
    .iter()
    .map(|rel| dir.join(rel))
    .collect();

    first_existing(&candidates)
        .await
        .map(ImageFile)
        .ok_or_else(|| ArcError::no_data("jacket not found", -1))
}

/// Pack select image (`songs/pack/1080_select_<id>.png`), with small variants
/// as fallback.
#[get("/api/asset/pack?<id>")]
pub(super) async fn admin_api_asset_pack(
    id: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> Result<ImageFile, ArcError> {
    require_admin_api(cookies, pool.inner()).await?;
    if !valid_id(id) {
        return Err(ArcError::input("invalid pack id"));
    }
    let dir = songs_dir().join("pack");
    let candidates: Vec<PathBuf> = [
        format!("1080_select_{id}.png"),
        format!("1080_small_{id}.png"),
        format!("select_{id}.png"),
        format!("1080_select_{id}.jpg"),
    ]
    .iter()
    .map(|rel| dir.join(rel))
    .collect();

    first_existing(&candidates)
        .await
        .map(ImageFile)
        .ok_or_else(|| ArcError::no_data("pack image not found", -1))
}

// ---- pack image upload (from the pack-image studio) ----
//
// Saves a generated PNG as `songs/pack/1080_select_<id>.png` (the pack select
// image the client uses). Path-safe id; PNG magic-byte checked. The songs
// mount is read-write in the deploy compose.

#[derive(rocket::FromForm)]
pub(super) struct PackImageForm<'r> {
    id: String,
    /// also write the small variant name (some packs reference it)
    #[field(default = false)]
    also_small: bool,
    file: rocket::fs::TempFile<'r>,
}

#[post("/api/pack-image", data = "<form>")]
pub(super) async fn admin_api_pack_image_save(
    mut form: rocket::form::Form<PackImageForm<'_>>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> crate::route::common::RouteResult<Vec<String>> {
    require_admin_api(cookies, pool.inner()).await?;
    let form = &mut *form;
    if !valid_id(&form.id) {
        return Err(ArcError::input(
            "invalid pack id (allowed: lowercase letters, digits, underscore)",
        ));
    }
    // PNG signature check on the uploaded temp file.
    {
        use tokio::io::AsyncReadExt;
        let path = form
            .file
            .path()
            .ok_or_else(|| ArcError::input("upload has no temp path"))?;
        let mut f = tokio::fs::File::open(path)
            .await
            .map_err(|e| ArcError::input(format!("reading upload: {e}")))?;
        let mut sig = [0u8; 8];
        f.read_exact(&mut sig)
            .await
            .map_err(|e| ArcError::input(format!("reading upload: {e}")))?;
        if sig != [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
            return Err(ArcError::input("file is not a PNG"));
        }
    }

    let dir = songs_dir().join("pack");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| ArcError::input(format!("creating {}: {e}", dir.display())))?;

    let mut written = Vec::new();
    let mut names = vec![format!("1080_select_{}.png", form.id)];
    if form.also_small {
        names.push(format!("1080_small_{}.png", form.id));
    }
    for name in names {
        let dest = dir.join(&name);
        form.file
            .copy_to(&dest)
            .await
            .map_err(|e| ArcError::input(format!("writing {}: {e}", dest.display())))?;
        written.push(format!("pack/{name}"));
    }
    Ok(crate::route::common::success_return(written))
}
