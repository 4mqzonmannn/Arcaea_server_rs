//! Raw-JSON songlist editing for the admin web UI.
//!
//! The real songlist has far more fields than the runtime `SongInfo` or this
//! tool's `schema::SongEntry` model (title_localized, search_title, bpm,
//! bg_inverse, per-difficulty designers, ...). To guarantee that editing one
//! entry never silently drops fields we don't model, everything here works on
//! `serde_json::Value` and writes the document back as-is except for the
//! targeted change. `serde_json`'s `preserve_order` feature keeps key order
//! stable across the round-trip.
//!
//! Every mutating operation copies the current file to a
//! `<name>.bak.<unix_ts>` sibling before writing, so any edit can be rolled
//! back by hand.

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::schema;

/// On-disk folder provisioning state for one songlist entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FolderStatus {
    /// `<id>/` with real chart data exists (no `dl_` preview folder).
    Full,
    /// only the `dl_<id>/` preview folder exists.
    Preview,
    /// both `<id>/` and `dl_<id>/` exist (normal for remote_dl songs).
    Both,
    /// neither folder exists -- the class of bug `scan` flags as an error.
    Missing,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongSummary {
    pub id: String,
    pub title: String,
    pub set: String,
    pub remote_dl: bool,
    pub folder_status: FolderStatus,
    pub rating_classes: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertResult {
    pub id: String,
    pub created: bool,
    pub backup_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub removed_songs: usize,
    pub removed_unlocks: usize,
    pub not_found: Vec<String>,
    pub songlist_backup_path: String,
    pub unlocks_backup_path: Option<String>,
}

/// A songlist document loaded as raw JSON, remembering where it came from.
pub struct SonglistFile {
    path: PathBuf,
    root: Value,
}

impl SonglistFile {
    pub fn load(songs_dir: &Path) -> Result<Self> {
        let path = schema::detect_songlist_path(songs_dir)?;
        let text = fs::read_to_string(&path)
            .with_context(|| format!("reading {}", path.display()))?;
        let root: Value = serde_json::from_str(&text)
            .with_context(|| format!("parsing {}", path.display()))?;
        if !root.get("songs").map(Value::is_array).unwrap_or(false) {
            bail!("{} に最上位の \"songs\" 配列がありません", path.display());
        }
        Ok(Self { path, root })
    }

    fn songs(&self) -> &Vec<Value> {
        // load() verified the shape, so these unwraps can't fire.
        self.root.get("songs").unwrap().as_array().unwrap()
    }

    fn songs_mut(&mut self) -> &mut Vec<Value> {
        self.root.get_mut("songs").unwrap().as_array_mut().unwrap()
    }

    fn position_of(&self, id: &str) -> Option<usize> {
        self.songs()
            .iter()
            .position(|s| s.get("id").and_then(Value::as_str) == Some(id))
    }

    pub fn entry(&self, id: &str) -> Option<&Value> {
        self.position_of(id).map(|i| &self.songs()[i])
    }

    /// Ids of songs whose `set` (pack binding) equals `set`.
    pub fn ids_in_set(&self, set: &str) -> Vec<String> {
        self.songs()
            .iter()
            .filter(|s| s.get("set").and_then(Value::as_str) == Some(set))
            .filter_map(|s| s.get("id").and_then(Value::as_str).map(str::to_string))
            .collect()
    }

    /// Repoint every song bound to pack `from` onto pack `to` (writes + backup).
    /// Used when a pack is deleted but its songs should survive under another
    /// pack rather than be removed (a dangling `set` crashes the client).
    pub fn reassign_set(&mut self, from: &str, to: &str) -> Result<(usize, String)> {
        let mut count = 0usize;
        for song in self.songs_mut() {
            if song.get("set").and_then(Value::as_str) == Some(from) {
                if let Some(obj) = song.as_object_mut() {
                    obj.insert("set".to_string(), Value::String(to.to_string()));
                    count += 1;
                }
            }
        }
        if count == 0 {
            bail!("set が `{from}` の曲がありません");
        }
        let backup = self.write_with_backup()?;
        Ok((count, backup.display().to_string()))
    }

    /// Summaries of every entry, with disk provisioning state resolved
    /// against the folders actually present under `songs_dir`.
    pub fn summaries(&self, songs_dir: &Path) -> Result<Vec<SongSummary>> {
        let mut full_folders: HashSet<String> = HashSet::new();
        let mut preview_folders: HashSet<String> = HashSet::new();
        for entry in fs::read_dir(songs_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            match name.strip_prefix("dl_") {
                Some(id) => preview_folders.insert(id.to_string()),
                None => full_folders.insert(name),
            };
        }

        Ok(self
            .songs()
            .iter()
            .map(|song| {
                let id = song
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let title = song
                    .get("title_localized")
                    .and_then(|t| t.get("ja").or_else(|| t.get("en")))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let folder_status = match (full_folders.contains(&id), preview_folders.contains(&id)) {
                    (true, true) => FolderStatus::Both,
                    (true, false) => FolderStatus::Full,
                    (false, true) => FolderStatus::Preview,
                    (false, false) => FolderStatus::Missing,
                };
                SongSummary {
                    title,
                    set: song
                        .get("set")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    remote_dl: song
                        .get("remote_dl")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    folder_status,
                    rating_classes: song
                        .get("difficulties")
                        .and_then(Value::as_array)
                        .map(|ds| {
                            ds.iter()
                                .filter_map(|d| d.get("ratingClass").and_then(Value::as_i64))
                                .collect()
                        })
                        .unwrap_or_default(),
                    id,
                }
            })
            .collect())
    }

    /// Insert or replace one entry, then write the file (with backup).
    ///
    /// `original_id: Some(_)` edits an existing entry in place (position
    /// preserved, renames allowed as long as the new id isn't taken);
    /// `None` appends a new entry, rejecting duplicate ids.
    pub fn upsert(&mut self, original_id: Option<&str>, entry: Value) -> Result<UpsertResult> {
        let Some(new_id) = entry.get("id").and_then(Value::as_str).map(str::to_string) else {
            bail!("エントリには文字列の \"id\" フィールドが必要です");
        };
        if !entry.is_object() {
            bail!("エントリは JSON オブジェクトである必要があります");
        }

        let created = match original_id {
            Some(orig) => {
                let pos = self
                    .position_of(orig)
                    .ok_or_else(|| anyhow!("曲 `{orig}` は songlist に見つかりません"))?;
                if new_id != orig && self.position_of(&new_id).is_some() {
                    bail!("`{new_id}` へ変更できません: その id は既に存在します");
                }
                self.songs_mut()[pos] = entry;
                false
            }
            None => {
                if self.position_of(&new_id).is_some() {
                    bail!("曲 `{new_id}` は既に存在します。追加ではなく編集してください");
                }
                self.songs_mut().push(entry);
                true
            }
        };

        let backup = self.write_with_backup()?;
        Ok(UpsertResult {
            id: new_id,
            created,
            backup_path: backup.display().to_string(),
        })
    }

    /// Remove entries by id. With `cascade_unlocks`, also drops unlocks
    /// entries whose `songId` matches (references from *other* songs'
    /// unlock conditions are left alone -- `scan` will flag those and they
    /// need a human decision, not silent deletion).
    pub fn delete(
        &mut self,
        songs_dir: &Path,
        ids: &[String],
        cascade_unlocks: bool,
    ) -> Result<DeleteResult> {
        let id_set: HashSet<&str> = ids.iter().map(String::as_str).collect();
        let not_found: Vec<String> = ids
            .iter()
            .filter(|id| self.position_of(id).is_none())
            .cloned()
            .collect();

        let before = self.songs().len();
        self.songs_mut()
            .retain(|s| !matches!(s.get("id").and_then(Value::as_str), Some(id) if id_set.contains(id)));
        let removed_songs = before - self.songs().len();
        if removed_songs == 0 {
            bail!("指定された id はいずれも songlist に存在しません");
        }
        let songlist_backup = self.write_with_backup()?;

        let mut removed_unlocks = 0;
        let mut unlocks_backup_path = None;
        if cascade_unlocks {
            if let Some(unlocks_path) = schema::detect_unlocks_path(songs_dir) {
                let text = fs::read_to_string(&unlocks_path)
                    .with_context(|| format!("reading {}", unlocks_path.display()))?;
                let mut root: Value = serde_json::from_str(&text)
                    .with_context(|| format!("parsing {}", unlocks_path.display()))?;
                if let Some(unlocks) = root.get_mut("unlocks").and_then(Value::as_array_mut) {
                    let before = unlocks.len();
                    unlocks.retain(|u| {
                        !matches!(u.get("songId").and_then(Value::as_str), Some(id) if id_set.contains(id))
                    });
                    removed_unlocks = before - unlocks.len();
                    if removed_unlocks > 0 {
                        let backup = backup_file(&unlocks_path)?;
                        write_json(&unlocks_path, &root)?;
                        unlocks_backup_path = Some(backup.display().to_string());
                    }
                }
            }
        }

        Ok(DeleteResult {
            removed_songs,
            removed_unlocks,
            not_found,
            songlist_backup_path: songlist_backup.display().to_string(),
            unlocks_backup_path,
        })
    }

    fn write_with_backup(&self) -> Result<PathBuf> {
        let backup = backup_file(&self.path)?;
        write_json(&self.path, &self.root)?;
        Ok(backup)
    }
}

fn backup_file(path: &Path) -> Result<PathBuf> {
    // Backups live in a dot-directory because everything else under the
    // songs dir is client-facing content: `build::walk_dir` and `scan` both
    // skip dot-entries, so nothing here can leak into a shipped bundle.
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
    // Write to a hidden sibling temp file then rename, so a crash mid-write
    // can't leave a truncated songlist, and a stale temp file (rename
    // failure) is dot-prefixed and therefore never picked up by the bundle
    // build's directory walk.
    let tmp = path.with_file_name(format!(
        ".{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    ));
    fs::write(&tmp, serde_json::to_string(value)?)
        .with_context(|| format!("writing {}", tmp.display()))?;
    fs::rename(&tmp, path)
        .with_context(|| format!("renaming {} to {}", tmp.display(), path.display()))?;
    Ok(())
}
