//! Admin web world-map editor routes (`service::world_editor`).
//!
//! Writes go to `assets/map/<id>.json`. After a successful write/delete the
//! client is expected to run the `refresh_world_map_cache` maintenance
//! operation so the running server re-parses the maps; the response's
//! `reloadHint` reminds the UI to do so.

use rocket::http::CookieJar;
use rocket::serde::json::Json;
use rocket::{delete, get, post, State};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ArcError;
use crate::route::common::{success_return, RouteResult};
use crate::service::world_editor::{self, MapSummary, MapWriteResult};
use crate::DbPool;

use super::session::require_admin_api;

fn anyhow_to_arc(e: anyhow::Error) -> ArcError {
    ArcError::input(e.to_string())
}

#[get("/api/world-maps")]
pub(super) async fn admin_api_world_maps(
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Vec<MapSummary>> {
    require_admin_api(cookies, pool.inner()).await?;
    let maps = world_editor::list_maps().map_err(anyhow_to_arc)?;
    Ok(success_return(maps))
}

#[get("/api/world-maps/entry?<id>")]
pub(super) async fn admin_api_world_map_get(
    id: &str,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Value> {
    require_admin_api(cookies, pool.inner()).await?;
    let map = world_editor::get_map(id).map_err(anyhow_to_arc)?;
    Ok(success_return(map))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorldMapWriteResponse {
    #[serde(flatten)]
    result: MapWriteResult,
    /// True to remind the UI that a cache refresh is needed to apply changes.
    reload_hint: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminWorldMapUpsertPayload {
    map_id: String,
    entry: Value,
    #[serde(default)]
    overwrite: bool,
}

#[post("/api/world-maps", format = "json", data = "<payload>")]
pub(super) async fn admin_api_world_map_upsert(
    payload: Json<AdminWorldMapUpsertPayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<WorldMapWriteResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let payload = payload.into_inner();
    let result = world_editor::write_map(&payload.map_id, payload.entry, payload.overwrite)
        .map_err(anyhow_to_arc)?;
    Ok(success_return(WorldMapWriteResponse {
        result,
        reload_hint: true,
    }))
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminWorldMapDeletePayload {
    map_id: String,
}

#[delete("/api/world-maps", format = "json", data = "<payload>")]
pub(super) async fn admin_api_world_map_delete(
    payload: Json<AdminWorldMapDeletePayload>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<WorldMapWriteResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let result = world_editor::delete_map(&payload.into_inner().map_id).map_err(anyhow_to_arc)?;
    Ok(success_return(WorldMapWriteResponse {
        result,
        reload_hint: true,
    }))
}
