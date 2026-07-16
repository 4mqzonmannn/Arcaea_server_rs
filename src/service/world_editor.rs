//! Admin world-map editor: create/read/update/delete the per-map JSON files
//! under `assets/map/`.
//!
//! Same raw-`Value` round-trip + `.backups/` + atomic-write discipline as the
//! songlist editor, but one file per map (`<map_id>.json`) instead of one big
//! array file. After any write the caller should run the
//! `refresh_world_map_cache` operation so the running server re-parses the
//! maps (see `service::world::reload_map_parser`).
//!
//! A minimal shape check (`map_id`, `steps` array) runs before writing so a
//! malformed map can't be saved into a slot the game will then fail to parse.

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::service::runtime_assets::asset_path;

/// Directory holding the world map JSON files.
fn map_dir() -> PathBuf {
    asset_path("map")
}

/// A map id is used directly as a filename, so constrain it hard.
fn valid_map_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapSummary {
    pub map_id: String,
    pub chapter: Option<i64>,
    pub step_count: usize,
    pub is_beyond: bool,
    pub is_legacy: bool,
    pub is_repeatable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapWriteResult {
    pub map_id: String,
    pub created: bool,
    pub backup_path: Option<String>,
}

/// List every map file as a lightweight summary.
pub fn list_maps() -> Result<Vec<MapSummary>> {
    let dir = map_dir();
    let mut out = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(e).with_context(|| format!("reading {}", dir.display())),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(map_id) = name.strip_suffix(".json") else {
            continue;
        };
        if map_id.starts_with('.') {
            continue;
        }
        let text = fs::read_to_string(entry.path()).unwrap_or_default();
        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        out.push(MapSummary {
            map_id: map_id.to_string(),
            chapter: value.get("chapter").and_then(Value::as_i64),
            step_count: value
                .get("steps")
                .and_then(Value::as_array)
                .map(|s| s.len())
                .unwrap_or(0),
            is_beyond: value.get("is_beyond").and_then(Value::as_bool).unwrap_or(false),
            is_legacy: value.get("is_legacy").and_then(Value::as_bool).unwrap_or(false),
            is_repeatable: value
                .get("is_repeatable")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        });
    }
    out.sort_by(|a, b| a.map_id.cmp(&b.map_id));
    Ok(out)
}

fn map_path(map_id: &str) -> Result<PathBuf> {
    if !valid_map_id(map_id) {
        bail!("map_id `{map_id}` が不正です (使用可能: 半角小文字英字・数字・アンダースコア)");
    }
    Ok(map_dir().join(format!("{map_id}.json")))
}

/// Raw JSON of one map file, pretty-printed for the editor.
pub fn get_map(map_id: &str) -> Result<Value> {
    let path = map_path(map_id)?;
    let text = fs::read_to_string(&path)
        .with_context(|| format!("map `{map_id}` が見つかりません"))?;
    serde_json::from_str(&text).with_context(|| format!("map `{map_id}` の JSON 解析に失敗"))
}

fn validate(map_id: &str, entry: &Value) -> Result<()> {
    if !entry.is_object() {
        bail!("マップは JSON オブジェクトである必要があります");
    }
    match entry.get("map_id").and_then(Value::as_str) {
        Some(inner) if inner == map_id => {}
        Some(inner) => bail!("JSON 内の map_id (`{inner}`) がファイル名 (`{map_id}`) と一致しません"),
        None => bail!("マップに文字列の \"map_id\" フィールドが必要です"),
    }
    if !entry.get("steps").map(Value::is_array).unwrap_or(false) {
        bail!("マップに \"steps\" 配列が必要です");
    }
    Ok(())
}

/// Create or overwrite one map file (backing up an existing one first).
pub fn write_map(map_id: &str, entry: Value, overwrite: bool) -> Result<MapWriteResult> {
    let path = map_path(map_id)?;
    validate(map_id, &entry)?;

    let existed = path.exists();
    if existed && !overwrite {
        bail!("マップ `{map_id}` は既に存在します。上書きを有効にすると置き換えられます");
    }

    let backup_path = if existed {
        Some(backup_file(&path)?.display().to_string())
    } else {
        None
    };

    write_json(&path, &entry)?;
    Ok(MapWriteResult {
        map_id: map_id.to_string(),
        created: !existed,
        backup_path,
    })
}

pub fn delete_map(map_id: &str) -> Result<MapWriteResult> {
    let path = map_path(map_id)?;
    if !path.exists() {
        bail!("マップ `{map_id}` は存在しません");
    }
    let backup = backup_file(&path)?;
    fs::remove_file(&path).with_context(|| format!("deleting {}", path.display()))?;
    Ok(MapWriteResult {
        map_id: map_id.to_string(),
        created: false,
        backup_path: Some(backup.display().to_string()),
    })
}

fn backup_file(path: &Path) -> Result<PathBuf> {
    let dir = path
        .parent()
        .ok_or_else(|| anyhow!("{} has no parent directory", path.display()))?
        .join(".backups");
    fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
    let ts = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let backup = dir.join(format!(
        "{}.bak.{ts}",
        path.file_name().unwrap_or_default().to_string_lossy()
    ));
    fs::copy(path, &backup)
        .with_context(|| format!("backing up {} to {}", path.display(), backup.display()))?;
    Ok(backup)
}

fn write_json(path: &Path, value: &Value) -> Result<()> {
    let tmp = path.with_file_name(format!(
        ".{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    ));
    // Pretty-print: map files are hand-edited, keep them diff-friendly.
    fs::write(&tmp, serde_json::to_string_pretty(value)?)
        .with_context(|| format!("writing {}", tmp.display()))?;
    fs::rename(&tmp, path)
        .with_context(|| format!("renaming {} to {}", tmp.display(), path.display()))?;
    Ok(())
}
