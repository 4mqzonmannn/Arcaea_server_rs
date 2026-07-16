//! Content bundle builder. Produces `.cb` + `.json` content bundle pairs
//! compatible with the client's
//! `cocos2d::ContentBundleManager::processContentBundle` wire format,
//! without depending on any external bookkeeping file.
//!
//! The diff base is derived directly from the highest-`versionNumber`
//! `.json` already present in `--bundles` (its own `pathToHash` field is a
//! complete snapshot of the previously-deployed state), so re-running this
//! tool from a fresh checkout or a different machine always produces a
//! correct incremental diff.
//!
//! Confirmed via reverse-engineering the Arc-mobile client (2026-07-10/12):
//! - `partIndex` is parsed but never read downstream; every entry uses
//!   `partIndex: 0`.
//! - The extracted file bytes are not re-verified against
//!   `sha256HashBase64Encoded` at apply time; `pathToHash` is still computed
//!   correctly regardless, since it's cheap and keeps the wire format
//!   faithful to the original tool for any future client that might check it.
//! - `previousVersionNumber` must be JSON `null` (not the string `"0.0.0"`)
//!   for the very first bundle in a chain -- a non-null value makes the
//!   client attempt a write-then-immediately-readback verification of a
//!   local cache file (`cb/meta.cb`) that fails with ENOENT due to a
//!   client-side path-resolution bug, blocking the bundle from ever
//!   applying (root-caused this session by diffing against real production
//!   bundle JSON pulled from a working server).
//! - `uuid` must be exactly 9 lowercase hex characters (e.g. `"5bd410c17"`),
//!   matching real production bundles -- not a full 32-character hex string.
//!
//! This module only computes and (optionally) writes the bundle; it does
//! not print anything -- callers (the CLI binary, or an admin web route)
//! are responsible for presenting `BuildResult`.

use anyhow::Result;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// HMAC-SHA256 key used for `pathToDetails`, matching `arcaea_bundler.main.FileParser.KEY`.
const PATH_TO_DETAILS_KEY: [u8; 64] = [
    0xd4, 0x1f, 0xdb, 0xe3, 0x37, 0xd0, 0x01, 0x68, 0x0c, 0x2a, 0x4d, 0x43, 0xaf, 0xe5, 0x70, 0xc7,
    0x1f, 0xde, 0x85, 0xd8, 0xf3, 0xd4, 0xc4, 0x6f, 0x37, 0x99, 0xc1, 0x8f, 0x1f, 0x50, 0x82, 0x77,
    0xac, 0xa7, 0xab, 0x63, 0x32, 0x83, 0x71, 0x0c, 0x2b, 0xb4, 0x1a, 0x07, 0x8e, 0xfb, 0xe7, 0xc1,
    0x9c, 0xf0, 0x87, 0xa7, 0xe1, 0x37, 0x75, 0x2a, 0xb7, 0x58, 0x1c, 0x8d, 0x9c, 0x0e, 0x3d, 0xe9,
];

/// The three files whose HMAC gets recorded under `pathToDetails`.
const PATH_TO_DETAILS_FILES: [&str; 3] = ["songs/unlocks", "songs/packlist", "songs/songlist"];

pub struct BuildArgs {
    pub songs: PathBuf,
    pub bundles: PathBuf,
    pub img: Option<PathBuf>,
    pub app_version: String,
    pub bundle_version: Option<String>,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub version_number: String,
    pub previous_version_number: Option<String>,
    pub added_count: usize,
    pub changed_count: usize,
    pub unchanged_count: usize,
    pub removed_count: usize,
    pub bundle_bytes: u64,
    pub dry_run: bool,
    /// `Some((cb_path, json_path))` when files were actually written (i.e. not dry-run).
    pub written_files: Option<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AddedEntry {
    path: String,
    #[serde(rename = "byteOffset")]
    byte_offset: u64,
    length: u64,
    #[serde(rename = "partIndex", default)]
    part_index: u32,
    #[serde(rename = "sha256HashBase64Encoded")]
    sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct BundleJson {
    #[serde(rename = "versionNumber")]
    version_number: String,
    #[serde(rename = "previousVersionNumber")]
    previous_version_number: Option<String>,
    #[serde(rename = "applicationVersionNumber")]
    application_version_number: String,
    uuid: String,
    removed: Vec<String>,
    added: Vec<AddedEntry>,
    #[serde(rename = "pathToHash")]
    path_to_hash: BTreeMap<String, String>,
    #[serde(rename = "pathToDetails")]
    path_to_details: BTreeMap<String, String>,
    #[serde(rename = "generatedUnixTimestamp", default)]
    generated_unix_timestamp: i64,
    #[serde(rename = "totalPartitions", default)]
    total_partitions: u32,
}

pub fn build(cli: &BuildArgs) -> Result<BuildResult> {
    if !cli.songs.is_dir() {
        anyhow::bail!("songs dir `{}` does not exist", cli.songs.display());
    }
    for required in PATH_TO_DETAILS_FILES {
        let rel = required.strip_prefix("songs/").unwrap();
        if !cli.songs.join(rel).is_file() {
            anyhow::bail!("required file `{required}` not found under songs dir");
        }
    }

    let prev = find_latest_bundle_json(&cli.bundles, &cli.app_version)?;
    let prev_path_to_hash: BTreeMap<String, String> = prev
        .as_ref()
        .map(|(_, json)| json.path_to_hash.clone())
        .unwrap_or_default();
    let prev_version = prev.as_ref().map(|(_, json)| json.version_number.clone());

    let version_number = cli
        .bundle_version
        .clone()
        .unwrap_or_else(|| next_version(prev_version.as_deref()));
    let previous_version_number = prev_version.clone();

    if let Some((_, prev_json)) = &prev {
        if prev_json.version_number == version_number {
            anyhow::bail!(
                "new versionNumber `{version_number}` matches the existing latest bundle; pass --bundle-version explicitly"
            );
        }
    }

    let mut relative_paths: Vec<String> = Vec::new();
    for required in PATH_TO_DETAILS_FILES {
        relative_paths.push(required.to_string());
    }
    let mut walked = Vec::new();
    walk_dir(&cli.songs, &cli.songs, &mut walked)?;
    walked.sort();
    for rel in walked {
        let bundle_path = format!("songs/{rel}");
        if !relative_paths.contains(&bundle_path) {
            relative_paths.push(bundle_path);
        }
    }
    if let Some(img_dir) = &cli.img {
        let mut walked_img = Vec::new();
        walk_dir(img_dir, img_dir, &mut walked_img)?;
        walked_img.sort();
        for rel in walked_img {
            relative_paths.push(format!("img/{rel}"));
        }
    }

    let mut added = Vec::new();
    let mut path_to_hash = BTreeMap::new();
    let mut cb_bytes: Vec<u8> = Vec::new();
    let mut counts = (0usize, 0usize, 0usize, 0usize); // added, changed, unchanged, removed

    for bundle_path in &relative_paths {
        let abs_path = if let Some(rel) = bundle_path.strip_prefix("songs/") {
            cli.songs.join(rel)
        } else if let Some(rel) = bundle_path.strip_prefix("img/") {
            cli.img
                .as_ref()
                .expect("img/ path only appears when --img was given")
                .join(rel)
        } else {
            unreachable!("relative_paths only ever contains songs/ or img/ entries")
        };
        let data = fs::read(&abs_path)?;
        let hash_b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            Sha256::digest(&data),
        );

        match prev_path_to_hash.get(bundle_path) {
            Some(prev_hash) if prev_hash == &hash_b64 => {
                counts.2 += 1;
            }
            prev_hash => {
                if prev_hash.is_some() {
                    counts.1 += 1;
                } else {
                    counts.0 += 1;
                }
                let offset = cb_bytes.len() as u64;
                let length = data.len() as u64;
                cb_bytes.extend_from_slice(&data);
                added.push(AddedEntry {
                    path: bundle_path.clone(),
                    byte_offset: offset,
                    length,
                    part_index: 0,
                    sha256: hash_b64.clone(),
                });
            }
        }
        path_to_hash.insert(bundle_path.clone(), hash_b64);
    }

    let managed_prefix = |p: &str| p.starts_with("songs/") || (cli.img.is_some() && p.starts_with("img/"));
    let current_set: std::collections::HashSet<&String> = relative_paths.iter().collect();
    let mut removed = Vec::new();
    for prev_path in prev_path_to_hash.keys() {
        if managed_prefix(prev_path) && !current_set.contains(prev_path) {
            removed.push(prev_path.clone());
            counts.3 += 1;
        }
    }
    for (prev_path, prev_hash) in &prev_path_to_hash {
        if !managed_prefix(prev_path) {
            path_to_hash.insert(prev_path.clone(), prev_hash.clone());
        }
    }

    let mut path_to_details = BTreeMap::new();
    for detail_path in PATH_TO_DETAILS_FILES {
        let rel = detail_path.strip_prefix("songs/").unwrap();
        let data = fs::read(cli.songs.join(rel))?;
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&PATH_TO_DETAILS_KEY)
            .expect("HMAC accepts any key length");
        mac.update(&data);
        let hmac_b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            mac.finalize().into_bytes(),
        );
        path_to_details.insert(detail_path.to_string(), hmac_b64);
    }

    let uuid = generate_uuid();
    let bundle_json = BundleJson {
        version_number: version_number.clone(),
        previous_version_number: previous_version_number.clone(),
        application_version_number: cli.app_version.clone(),
        uuid,
        removed,
        added,
        path_to_hash,
        path_to_details,
        generated_unix_timestamp: chrono::Utc::now().timestamp(),
        total_partitions: 1,
    };

    let bundle_bytes = cb_bytes.len() as u64;

    if cli.dry_run {
        return Ok(BuildResult {
            version_number,
            previous_version_number,
            added_count: counts.0,
            changed_count: counts.1,
            unchanged_count: counts.2,
            removed_count: counts.3,
            bundle_bytes,
            dry_run: true,
            written_files: None,
        });
    }

    fs::create_dir_all(&cli.bundles)?;
    let cb_path = cli.bundles.join(format!("{version_number}.cb"));
    let json_path = cli.bundles.join(format!("{version_number}.json"));
    if cb_path.exists() || json_path.exists() {
        anyhow::bail!(
            "`{}` or `{}` already exists; refusing to overwrite",
            cb_path.display(),
            json_path.display()
        );
    }
    let json_bytes = serde_json::to_vec_pretty(&bundle_json)?;
    fs::File::create(&cb_path)?.write_all(&cb_bytes)?;
    fs::write(&json_path, &json_bytes)?;

    Ok(BuildResult {
        version_number,
        previous_version_number,
        added_count: counts.0,
        changed_count: counts.1,
        unchanged_count: counts.2,
        removed_count: counts.3,
        bundle_bytes,
        dry_run: false,
        written_files: Some((cb_path.display().to_string(), json_path.display().to_string())),
    })
}

fn find_latest_bundle_json(
    bundles_dir: &Path,
    app_version: &str,
) -> Result<Option<(PathBuf, BundleJson)>> {
    if !bundles_dir.is_dir() {
        return Ok(None);
    }
    let mut best: Option<(PathBuf, BundleJson, (u32, u32, u32, u32))> = None;
    for entry in fs::read_dir(bundles_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let data = fs::read(&path)?;
        let Ok(json) = serde_json::from_slice::<BundleJson>(&data) else {
            continue;
        };
        if json.application_version_number != app_version {
            continue;
        }
        let key = version_tuple(&json.version_number);
        if best.as_ref().is_none_or(|(_, _, best_key)| key > *best_key) {
            best = Some((path, json, key));
        }
    }
    Ok(best.map(|(path, json, _)| (path, json)))
}

fn version_tuple(version: &str) -> (u32, u32, u32, u32) {
    let mut parts = version.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

fn next_version(prev: Option<&str>) -> String {
    let Some(prev) = prev else {
        return "1.0.0".to_string();
    };
    let mut parts: Vec<u32> = prev.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    if let Some(last) = parts.last_mut() {
        *last += 1;
    }
    parts
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(".")
}

fn walk_dir(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        // Everything walked here ships to clients inside the bundle, so
        // dot-entries are always excluded: the songlist editor's `.backups/`
        // dir and `.songlist.tmp` files, macOS `.DS_Store`, etc.
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            walk_dir(root, &path, out)?;
        } else if path.is_file() {
            let rel = path.strip_prefix(root)?.to_string_lossy().replace('\\', "/");
            out.push(rel);
        }
    }
    Ok(())
}

fn generate_uuid() -> String {
    // Real production bundles use a 9-character uuid (e.g. "5bd410c17"),
    // not a full 32-character hex string -- matching that exactly here to
    // rule out any client-side length/format expectation.
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    hex[..9].to_string()
}
