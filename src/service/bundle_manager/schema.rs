//! songlist/unlocks/packlist parsing, richer than the runtime server's
//! `service::asset_manager::SongInfo` (which intentionally only models what
//! the live server logic needs). This tool's job is reading and
//! cross-validating the full catalog, so it models every field observed in
//! real data rather than the runtime's minimal subset.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Filenames tried in order when auto-detecting each catalog file. "slst" is
/// a nickname some tooling/users use for the songlist file; same format.
const SONGLIST_CANDIDATES: [&str; 2] = ["songlist", "slst"];
const UNLOCKS_CANDIDATES: [&str; 1] = ["unlocks"];
const PACKLIST_CANDIDATES: [&str; 1] = ["packlist"];

// Several fields below aren't read by any check yet but are kept because
// they're part of the real schema this tool aims to model faithfully --
// silencing dead_code rather than deleting them, since future checks (e.g.
// "Beyond difficulty missing a chartDesigner") are likely to want them.
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Difficulty {
    #[serde(rename = "ratingClass")]
    pub rating_class: i32,
    pub rating: Option<i32>,
    #[serde(rename = "chartDesigner")]
    pub chart_designer: Option<String>,
    #[serde(rename = "jacketDesigner")]
    pub jacket_designer: Option<String>,
    #[serde(rename = "audioOverride")]
    pub audio_override: Option<bool>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AdditionalFile {
    #[serde(rename = "fileName")]
    pub file_name: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SongEntry {
    pub id: String,
    pub set: Option<String>,
    pub purchase: Option<String>,
    pub remote_dl: Option<bool>,
    #[serde(rename = "worldUnlock")]
    pub world_unlock: Option<bool>,
    pub difficulties: Option<Vec<Difficulty>>,
    #[serde(rename = "additionalFiles")]
    pub additional_files: Option<Vec<AdditionalFile>>,
    // Everything else (title_localized, artist, bpm, bpm_base, audioPreview,
    // audioPreviewEnd, side, bg, date, version, ...) isn't needed for
    // cross-validation; serde ignores unknown fields by default so this
    // struct stays focused without a `deny_unknown_fields` mismatch risk.
}

#[derive(Debug, Deserialize)]
struct SonglistRoot {
    songs: Vec<SongEntry>,
}

/// One `conditions[]` entry inside an unlocks record. Condition shape varies
/// significantly by `type_` (0=credit cost, 1=song-clear requirement,
/// 2=song-played requirement, 101=rating/PTT range, 104=special flag-only —
/// the latter two are vs/finale-pack-specific). Modeling every variant as a
/// distinct struct would be a lot of ceremony for a read-only validator, so
/// only `type_` is strongly typed and the rest is kept as a flattened map,
/// inspected on demand by whichever check needs a specific field.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UnlockCondition {
    #[serde(rename = "type")]
    pub type_: i32,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UnlockEntry {
    #[serde(rename = "songId")]
    pub song_id: String,
    #[serde(rename = "ratingClass")]
    pub rating_class: i32,
    pub conditions: Vec<UnlockCondition>,
}

#[derive(Debug, Deserialize)]
struct UnlocksRoot {
    unlocks: Vec<UnlockEntry>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PackEntry {
    pub id: String,
    pub section: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PacklistRoot {
    packs: Vec<PackEntry>,
}

pub struct Catalog {
    pub songlist_path: std::path::PathBuf,
    pub songs: Vec<SongEntry>,
    pub songs_by_id: HashMap<String, SongEntry>,
    pub unlocks_path: std::path::PathBuf,
    pub unlocks: Vec<UnlockEntry>,
    pub packlist_path: std::path::PathBuf,
    pub packs: Vec<PackEntry>,
}

/// Find the first existing file among `candidates` directly under `dir`.
fn detect_file(dir: &Path, candidates: &[&str], kind: &str) -> Result<std::path::PathBuf> {
    for name in candidates {
        let path = dir.join(name);
        if path.is_file() {
            return Ok(path);
        }
    }
    anyhow::bail!(
        "could not find a {kind} file under `{}` (tried: {})",
        dir.display(),
        candidates.join(", ")
    );
}

/// Locate the songlist file under `songs_dir` (used by the raw-JSON editor,
/// which needs the path itself rather than the parsed `Catalog`).
pub fn detect_songlist_path(songs_dir: &Path) -> Result<std::path::PathBuf> {
    detect_file(songs_dir, &SONGLIST_CANDIDATES, "songlist")
}

/// Like `detect_songlist_path` but optional: cascade deletion of unlocks is
/// best-effort and simply skipped when no unlocks file exists.
pub fn detect_unlocks_path(songs_dir: &Path) -> Option<std::path::PathBuf> {
    detect_file(songs_dir, &UNLOCKS_CANDIDATES, "unlocks").ok()
}

/// Locate the unlocks file (required form, for the editor).
pub fn detect_unlocks_path_required(songs_dir: &Path) -> Result<std::path::PathBuf> {
    detect_file(songs_dir, &UNLOCKS_CANDIDATES, "unlocks")
}

/// Locate the packlist file (for the editor).
pub fn detect_packlist_path(songs_dir: &Path) -> Result<std::path::PathBuf> {
    detect_file(songs_dir, &PACKLIST_CANDIDATES, "packlist")
}

pub fn load_catalog(songs_dir: &Path) -> Result<Catalog> {
    let songlist_path = detect_file(songs_dir, &SONGLIST_CANDIDATES, "songlist")?;
    let unlocks_path = detect_file(songs_dir, &UNLOCKS_CANDIDATES, "unlocks")?;
    let packlist_path = detect_file(songs_dir, &PACKLIST_CANDIDATES, "packlist")?;

    let songlist_data = fs::read(&songlist_path)
        .with_context(|| format!("reading {}", songlist_path.display()))?;
    let songlist: SonglistRoot = serde_json::from_slice(&songlist_data)
        .with_context(|| format!("parsing {} as songlist JSON", songlist_path.display()))?;

    let unlocks_data =
        fs::read(&unlocks_path).with_context(|| format!("reading {}", unlocks_path.display()))?;
    let unlocks: UnlocksRoot = serde_json::from_slice(&unlocks_data)
        .with_context(|| format!("parsing {} as unlocks JSON", unlocks_path.display()))?;

    let packlist_data = fs::read(&packlist_path)
        .with_context(|| format!("reading {}", packlist_path.display()))?;
    let packlist: PacklistRoot = serde_json::from_slice(&packlist_data)
        .with_context(|| format!("parsing {} as packlist JSON", packlist_path.display()))?;

    let songs_by_id = songlist
        .songs
        .iter()
        .map(|s| (s.id.clone(), s.clone()))
        .collect();

    Ok(Catalog {
        songlist_path,
        songs: songlist.songs,
        songs_by_id,
        unlocks_path,
        unlocks: unlocks.unlocks,
        packlist_path,
        packs: packlist.packs,
    })
}
