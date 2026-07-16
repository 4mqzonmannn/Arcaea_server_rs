//! Generic raw-JSON editor for the array-shaped catalog files that sit next
//! to the songlist: `packlist` (`{"packs":[...]}`) and `unlocks`
//! (`{"unlocks":[...]}`).
//!
//! Same guarantees as `songlist.rs`: entries round-trip as `serde_json::Value`
//! so fields this tool doesn't model are never dropped, key order is preserved
//! (via serde_json `preserve_order`), and every write backs the file up to
//! `.backups/` first. The difference is that each entry's identity is computed
//! by a caller-supplied closure, because packlist keys on `id` while unlocks
//! has the composite `songId` + `ratingClass`.

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Which catalog file an `ArrayFile` is editing.
#[derive(Clone, Copy)]
pub enum CatalogKind {
    Packlist,
    Unlocks,
}

impl CatalogKind {
    /// Top-level object key holding the array.
    fn array_key(self) -> &'static str {
        match self {
            CatalogKind::Packlist => "packs",
            CatalogKind::Unlocks => "unlocks",
        }
    }

    /// Stable identity string for one entry (what edit/delete address by).
    fn identity(self, entry: &Value) -> Option<String> {
        match self {
            CatalogKind::Packlist => entry
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string),
            CatalogKind::Unlocks => {
                let song = entry.get("songId").and_then(Value::as_str)?;
                let rc = entry.get("ratingClass").and_then(Value::as_i64)?;
                Some(format!("{song}/{rc}"))
            }
        }
    }

    fn resolve_path(self, songs_dir: &Path) -> Result<PathBuf> {
        match self {
            CatalogKind::Packlist => super::schema::detect_packlist_path(songs_dir),
            CatalogKind::Unlocks => super::schema::detect_unlocks_path_required(songs_dir),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogUpsertResult {
    pub id: String,
    pub created: bool,
    pub backup_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogDeleteResult {
    pub removed: usize,
    pub not_found: Vec<String>,
    pub backup_path: String,
}

pub struct ArrayFile {
    kind: CatalogKind,
    path: PathBuf,
    root: Value,
}

impl ArrayFile {
    pub fn load(songs_dir: &Path, kind: CatalogKind) -> Result<Self> {
        let path = kind.resolve_path(songs_dir)?;
        let text =
            fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
        let root: Value =
            serde_json::from_str(&text).with_context(|| format!("parsing {}", path.display()))?;
        if !root
            .get(kind.array_key())
            .map(Value::is_array)
            .unwrap_or(false)
        {
            bail!(
                "{} に最上位の \"{}\" 配列がありません",
                path.display(),
                kind.array_key()
            );
        }
        Ok(Self { kind, path, root })
    }

    fn entries(&self) -> &Vec<Value> {
        self.root
            .get(self.kind.array_key())
            .unwrap()
            .as_array()
            .unwrap()
    }

    fn entries_mut(&mut self) -> &mut Vec<Value> {
        let key = self.kind.array_key();
        self.root.get_mut(key).unwrap().as_array_mut().unwrap()
    }

    /// All entries, raw, for the UI to render.
    pub fn list(&self) -> Vec<Value> {
        self.entries().clone()
    }

    fn position_of(&self, id: &str) -> Option<usize> {
        self.entries()
            .iter()
            .position(|e| self.kind.identity(e).as_deref() == Some(id))
    }

    pub fn get(&self, id: &str) -> Option<&Value> {
        self.position_of(id).map(|i| &self.entries()[i])
    }

    /// Insert or replace one entry (see `songlist::SonglistFile::upsert`).
    pub fn upsert(&mut self, original_id: Option<&str>, entry: Value) -> Result<CatalogUpsertResult> {
        if !entry.is_object() {
            bail!("エントリは JSON オブジェクトである必要があります");
        }
        let new_id = self
            .kind
            .identity(&entry)
            .ok_or_else(|| anyhow!("エントリに識別キー (packlist は id、unlocks は songId+ratingClass) がありません"))?;

        let created = match original_id {
            Some(orig) => {
                let pos = self
                    .position_of(orig)
                    .ok_or_else(|| anyhow!("エントリ `{orig}` が見つかりません"))?;
                if new_id != orig && self.position_of(&new_id).is_some() {
                    bail!("`{new_id}` へ変更できません: その識別キーは既に存在します");
                }
                self.entries_mut()[pos] = entry;
                false
            }
            None => {
                if self.position_of(&new_id).is_some() {
                    bail!("エントリ `{new_id}` は既に存在します。追加ではなく編集してください");
                }
                self.entries_mut().push(entry);
                true
            }
        };

        let backup = self.write_with_backup()?;
        Ok(CatalogUpsertResult {
            id: new_id,
            created,
            backup_path: backup.display().to_string(),
        })
    }

    pub fn delete(&mut self, ids: &[String]) -> Result<CatalogDeleteResult> {
        let not_found: Vec<String> = ids
            .iter()
            .filter(|id| self.position_of(id).is_none())
            .cloned()
            .collect();

        let before = self.entries().len();
        let kind = self.kind;
        self.entries_mut().retain(|e| {
            !matches!(kind.identity(e), Some(id) if ids.iter().any(|x| x == &id))
        });
        let removed = before - self.entries().len();
        if removed == 0 {
            bail!("指定された識別キーはいずれも存在しません");
        }
        let backup = self.write_with_backup()?;
        Ok(CatalogDeleteResult {
            removed,
            not_found,
            backup_path: backup.display().to_string(),
        })
    }

    fn write_with_backup(&self) -> Result<PathBuf> {
        let backup = backup_file(&self.path)?;
        write_json(&self.path, &self.root)?;
        Ok(backup)
    }
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
    fs::write(&tmp, serde_json::to_string(value)?)
        .with_context(|| format!("writing {}", tmp.display()))?;
    fs::rename(&tmp, path)
        .with_context(|| format!("renaming {} to {}", tmp.display(), path.display()))?;
    Ok(())
}
