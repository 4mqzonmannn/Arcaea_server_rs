//! Song-folder import: classify uploaded files into the on-disk layout the
//! client/server pair actually uses, based on real observed structure:
//!
//! - non-remote_dl (bundled) song: `<id>/` holds everything -- charts
//!   (`N.aff`), audio (`base.ogg`, `3.ogg`), jackets, optional video.
//!   (e.g. `songs/clotho/`: affs + base.ogg + 1080_base.jpg variants)
//! - remote_dl song: `dl_<id>/` holds only what the bundle needs for
//!   browsing (preview.ogg + jackets); the bare `<id>/` holds charts +
//!   audio which `DownloadService` serves live per file.
//!   (e.g. `songs/dl_infinitestrife/` + `songs/lostrequiem/`)
//!
//! File names are validated against a strict whitelist -- uploads come from
//! the browser with client-controlled names, and these names become paths
//! under `./songs`, so anything unrecognized is rejected rather than copied.

use anyhow::{bail, Result};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Whether an uploaded file belongs to the bundle-preview side
/// (`dl_<id>/`), the playable-data side (`<id>/`), or both.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileRole {
    /// charts / full audio / video -- playable data.
    FullData,
    /// jackets -- needed for browsing; bundled songs keep them in the bare
    /// folder, remote_dl songs keep them in `dl_<id>/`.
    Jacket,
    /// preview.ogg -- only meaningful in `dl_<id>/` (bundled songs preview
    /// straight from base.ogg via audioPreview offsets).
    Preview,
}

/// Classify one uploaded file name, or `None` if it isn't a recognized song
/// asset (which also rejects anything path-traversal-shaped, since none of
/// the accepted patterns contain separators).
pub fn classify_file(name: &str) -> Option<FileRole> {
    // charts: 0.aff .. 4.aff
    if let Some(stem) = name.strip_suffix(".aff") {
        if matches!(stem, "0" | "1" | "2" | "3" | "4") {
            return Some(FileRole::FullData);
        }
        return None;
    }
    // audio: base.ogg, per-difficulty override 3.ogg
    if name == "base.ogg" || name == "3.ogg" {
        return Some(FileRole::FullData);
    }
    if name == "preview.ogg" {
        return Some(FileRole::Preview);
    }
    // video variants (observed in ALLOWED_FILE_NAMES)
    if matches!(
        name,
        "video.mp4" | "video_audio.ogg" | "video_720.mp4" | "video_1080.mp4"
    ) {
        return Some(FileRole::FullData);
    }
    // jackets: (1080_)?(base|0..4)(_256)?.(jpg|png)
    for ext in [".jpg", ".png"] {
        if let Some(stem) = name.strip_suffix(ext) {
            let stem = stem.strip_prefix("1080_").unwrap_or(stem);
            let stem = stem.strip_suffix("_256").unwrap_or(stem);
            if matches!(stem, "base" | "0" | "1" | "2" | "3" | "4") {
                return Some(FileRole::Jacket);
            }
        }
    }
    None
}

fn valid_song_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// Where each accepted file should be copied.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedFile {
    pub name: String,
    /// path relative to the songs dir, e.g. `dl_foo/preview.ogg`.
    pub dest: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    pub id: String,
    pub remote_dl: bool,
    pub files: Vec<PlannedFile>,
    pub rejected: Vec<String>,
    pub full_dir: String,
    pub preview_dir: Option<String>,
}

/// Compute the copy plan for an import. Pure (no filesystem access except
/// the existence check), so the route can report a precise error before any
/// file is written.
pub fn plan_import(
    songs_dir: &Path,
    entry: &Value,
    file_names: &[String],
    overwrite: bool,
) -> Result<ImportPlan> {
    let Some(id) = entry.get("id").and_then(Value::as_str) else {
        bail!("エントリには文字列の \"id\" フィールドが必要です");
    };
    if !valid_song_id(id) {
        bail!("曲 id `{id}` が不正です (使用可能: 半角小文字英字・数字・アンダースコア)");
    }
    let remote_dl = entry
        .get("remote_dl")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let mut files = Vec::new();
    let mut rejected = Vec::new();
    let mut has_chart = false;
    let mut has_base_audio = false;
    let mut has_preview = false;
    let mut has_jacket = false;

    let full_dir = id.to_string();
    let preview_dir = remote_dl.then(|| format!("dl_{id}"));

    for name in file_names {
        let Some(role) = classify_file(name) else {
            rejected.push(name.clone());
            continue;
        };
        match role {
            FileRole::FullData => {
                if name.ends_with(".aff") {
                    has_chart = true;
                }
                if name == "base.ogg" {
                    has_base_audio = true;
                }
                files.push(PlannedFile {
                    name: name.clone(),
                    dest: format!("{full_dir}/{name}"),
                });
            }
            FileRole::Jacket => {
                has_jacket = true;
                // remote_dl songs browse via the dl_ folder; bundled songs
                // keep jackets alongside the charts.
                let dir = preview_dir.as_deref().unwrap_or(&full_dir);
                files.push(PlannedFile {
                    name: name.clone(),
                    dest: format!("{dir}/{name}"),
                });
            }
            FileRole::Preview => {
                has_preview = true;
                if let Some(dir) = &preview_dir {
                    files.push(PlannedFile {
                        name: name.clone(),
                        dest: format!("{dir}/{name}"),
                    });
                }
                // bundled songs don't need preview.ogg (observed folders
                // don't ship one) -- silently skip instead of rejecting.
            }
        }
    }

    if !has_chart {
        bail!("アップロードされたファイルに譜面ファイル (0.aff〜4.aff) がありません");
    }
    if !has_base_audio {
        bail!("アップロードされたファイルに base.ogg (楽曲本体の音源) がありません");
    }
    if remote_dl {
        if !has_preview {
            bail!("remote_dl の曲には dl_{id}/ バンドルフォルダ用の preview.ogg (試聴用音源) が必要です");
        }
        if !has_jacket {
            bail!("remote_dl の曲には dl_{id}/ バンドルフォルダ用のジャケット画像が1枚以上必要です");
        }
    }

    if !overwrite {
        let full_path = songs_dir.join(&full_dir);
        if full_path.exists() {
            bail!("フォルダ `{full_dir}/` は既に存在します。上書きを有効にすると置き換えられます");
        }
        if let Some(dir) = &preview_dir {
            if songs_dir.join(dir).exists() {
                bail!("フォルダ `{dir}/` は既に存在します。上書きを有効にすると置き換えられます");
            }
        }
    }

    Ok(ImportPlan {
        id: id.to_string(),
        remote_dl,
        files,
        rejected,
        full_dir,
        preview_dir,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub id: String,
    pub created: bool,
    pub remote_dl: bool,
    pub files_written: Vec<String>,
    pub rejected: Vec<String>,
    pub songlist_backup_path: String,
}

/// Resolve a planned destination to an absolute path, creating parents.
pub fn prepare_dest(songs_dir: &Path, planned: &PlannedFile) -> Result<PathBuf> {
    let dest = songs_dir.join(&planned.dest);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(dest)
}
