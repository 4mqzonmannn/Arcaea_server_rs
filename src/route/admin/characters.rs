//! Admin web character management: list character definitions, view/grant/
//! revoke a player's characters. Thin wrappers over `CharacterService`, which
//! the game routes already use, so ownership bookkeeping (both `user_char` and
//! the denormalised `user_char_full`) stays in one place.

use rocket::http::CookieJar;
use rocket::serde::json::Json;
use rocket::{delete, get, post, State};
use serde::{Deserialize, Serialize};

use crate::model::character::{Character, UserCharacter};
use crate::route::common::{success_return, RouteResult};
use crate::service::CharacterService;
use crate::DbPool;

use super::helpers::resolve_admin_user_from_selector;
use super::models::AdminUserSelectorPayload;
use super::session::require_admin_api;

/// All character definitions (the `character` table).
#[get("/api/characters")]
pub(super) async fn admin_api_characters(
    character_service: &State<CharacterService>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Vec<Character>> {
    require_admin_api(cookies, pool.inner()).await?;
    let characters = character_service.get_all_characters().await?;
    Ok(success_return(characters))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AdminUserCharactersResponse {
    user_id: i32,
    name: String,
    user_code: String,
    characters: Vec<UserCharacter>,
}

/// The characters a specific player owns.
#[get("/api/user-characters?<user_id>&<name>&<user_code>")]
pub(super) async fn admin_api_user_characters(
    user_id: Option<i32>,
    name: Option<&str>,
    user_code: Option<&str>,
    character_service: &State<CharacterService>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<AdminUserCharactersResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let user = super::helpers::resolve_admin_user(user_id, name, user_code, pool.inner()).await?;
    let characters = character_service.get_user_characters(user.user_id).await?;
    Ok(success_return(AdminUserCharactersResponse {
        user_id: user.user_id,
        name: user.name,
        user_code: user.user_code,
        characters,
    }))
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminGrantCharacterPayload {
    #[serde(flatten)]
    selector: AdminUserSelectorPayload,
    character_id: i32,
}

/// Grant one character to a player (idempotent: `grant_character_by_id`
/// upserts, leaving an already-owned character's level/exp untouched).
#[post("/api/admin-actions/grant-character", format = "json", data = "<payload>")]
pub(super) async fn admin_api_grant_character(
    payload: Json<AdminGrantCharacterPayload>,
    character_service: &State<CharacterService>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<AdminUserCharactersResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let payload = payload.into_inner();
    let user = resolve_admin_user_from_selector(&payload.selector, pool.inner()).await?;
    character_service
        .grant_character_by_id(user.user_id, payload.character_id)
        .await?;
    let characters = character_service.get_user_characters(user.user_id).await?;
    Ok(success_return(AdminUserCharactersResponse {
        user_id: user.user_id,
        name: user.name,
        user_code: user.user_code,
        characters,
    }))
}

#[derive(Debug, Deserialize)]
pub(super) struct AdminRemoveCharacterPayload {
    #[serde(flatten)]
    selector: AdminUserSelectorPayload,
    character_id: i32,
}

/// Revoke a character from a player.
#[delete("/api/admin-actions/user-character", format = "json", data = "<payload>")]
pub(super) async fn admin_api_remove_character(
    payload: Json<AdminRemoveCharacterPayload>,
    character_service: &State<CharacterService>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<AdminUserCharactersResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let payload = payload.into_inner();
    let user = resolve_admin_user_from_selector(&payload.selector, pool.inner()).await?;
    character_service
        .remove_character(user.user_id, payload.character_id)
        .await?;
    let characters = character_service.get_user_characters(user.user_id).await?;
    Ok(success_return(AdminUserCharactersResponse {
        user_id: user.user_id,
        name: user.name,
        user_code: user.user_code,
        characters,
    }))
}
