//! Admin web exposure of `service::backup`: trigger a database dump, list
//! existing snapshots, and download one.
//!
//! Downloads stream a plain `.sql` file with a `Content-Disposition:
//! attachment` header. The download name is validated through
//! `service::backup::resolve_backup_path`, which only admits our own
//! `arcaea_core-<ts>.sql` naming (no path separators), so this endpoint can't
//! be coaxed into serving arbitrary files.

use std::path::PathBuf;

use rocket::fs::NamedFile;
use rocket::http::{CookieJar, Header};
use rocket::response::Responder;
use rocket::{get, post, Request, State};

use crate::error::ArcError;
use crate::route::common::{success_return, RouteResult};
use crate::service::backup::{self, BackupFile, BackupRunResult};
use crate::DbPool;

use super::session::require_admin_api;

fn anyhow_to_arc(e: anyhow::Error) -> ArcError {
    ArcError::input(e.to_string())
}

#[post("/api/backup/run")]
pub(super) async fn admin_api_backup_run(
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<BackupRunResult> {
    require_admin_api(cookies, pool.inner()).await?;
    backup::ensure_dump_tool().await.map_err(anyhow_to_arc)?;
    let result = backup::run_backup().await.map_err(anyhow_to_arc)?;
    Ok(success_return(result))
}

#[get("/api/backup/list")]
pub(super) async fn admin_api_backup_list(
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Vec<BackupFile>> {
    require_admin_api(cookies, pool.inner()).await?;
    let files = backup::list_backups().map_err(anyhow_to_arc)?;
    Ok(success_return(files))
}

/// A downloadable backup file with an attachment disposition header.
pub(super) struct BackupDownload {
    file: NamedFile,
    filename: String,
}

impl<'r> Responder<'r, 'static> for BackupDownload {
    fn respond_to(self, request: &'r Request<'_>) -> rocket::response::Result<'static> {
        let mut response = self.file.respond_to(request)?;
        response.set_header(Header::new(
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", self.filename),
        ));
        Ok(response)
    }
}

#[get("/api/backup/download?<name>")]
pub(super) async fn admin_api_backup_download(
    name: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> Result<BackupDownload, ArcError> {
    require_admin_api(cookies, pool.inner()).await?;
    let path: PathBuf = backup::resolve_backup_path(name).map_err(anyhow_to_arc)?;
    let file = NamedFile::open(&path)
        .await
        .map_err(|_| ArcError::no_data("backup file not found", -1))?;
    Ok(BackupDownload {
        file,
        filename: name.to_string(),
    })
}
