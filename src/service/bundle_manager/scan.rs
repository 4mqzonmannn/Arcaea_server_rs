//! Folder classification and cross-consistency validation between
//! songlist/unlocks/packlist and the actual files on disk under `--songs`.
//!
//! Severity model:
//! - Error: will break the client (missing folder for a referenced song,
//!   dangling unlock reference, missing chart file for a declared bundled
//!   difficulty). These are exactly the class of bug that caused real
//!   crashes this session (e.g. a removed song still referenced somewhere).
//! - Warn: suspicious but not confirmed fatal (orphaned folder, unresolved
//!   pack reference, intentional-but-worth-noting dual provisioning).
//! - Info: plain counts, no action needed.

use crate::service::bundle_manager::schema::Catalog;
use anyhow::Result;
use colored::Colorize;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use crate::service::asset_manager::ALLOWED_FILE_NAMES;

/// Pack `set` values that are known not to correspond to a real packlist
/// entry (free/base catalog, or a per-song singles bucket).
const NON_PACK_SET_VALUES: [&str; 2] = ["base", "single"];

#[derive(Debug, Default)]
struct FolderInfo {
    has_charts: HashSet<i32>, // which "{n}.aff" rating classes are present
    #[allow(dead_code)]
    has_base_audio: bool,
    #[allow(dead_code)]
    has_preview_audio: bool,
    #[allow(dead_code)]
    has_jacket: bool,
}

impl FolderInfo {
    fn scan(dir: &Path) -> Result<Self> {
        let mut info = FolderInfo::default();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if let Some(rating_class) = name
                .strip_suffix(".aff")
                .and_then(|n| n.parse::<i32>().ok())
            {
                if ALLOWED_FILE_NAMES.contains(&name.as_str()) {
                    info.has_charts.insert(rating_class);
                }
            } else if name == "base.ogg" {
                info.has_base_audio = true;
            } else if name == "preview.ogg" {
                info.has_preview_audio = true;
            } else if name.contains("base") && (name.ends_with(".jpg") || name.ends_with(".png")) {
                info.has_jacket = true;
            }
        }
        Ok(info)
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warn,
    Info,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub findings: Vec<Finding>,
    pub error_count: usize,
    pub warn_count: usize,
    pub info_count: usize,
}

impl ScanReport {
    pub fn has_errors(&self) -> bool {
        self.error_count > 0
    }

    pub fn print(&self) {
        for f in &self.findings {
            match f.severity {
                Severity::Error => println!("{} {}", "[ERROR]".red().bold(), f.message),
                Severity::Warn => println!("{} {}", "[WARN] ".yellow().bold(), f.message),
                Severity::Info => println!("{} {}", "[INFO] ".dimmed(), f.message),
            }
        }
        println!();
        let summary = format!(
            "{} error(s), {} warning(s), {} info",
            self.error_count, self.warn_count, self.info_count
        );
        if self.error_count > 0 {
            println!("{}", summary.red().bold());
        } else if self.warn_count > 0 {
            println!("{}", summary.yellow().bold());
        } else {
            println!("{}", summary.green().bold());
        }
    }
}

pub fn scan(songs_dir: &Path, catalog: &Catalog) -> Result<ScanReport> {
    let mut findings = Vec::new();

    // Classify every folder on disk under `--songs`.
    let mut full_folders: HashMap<String, FolderInfo> = HashMap::new();
    let mut preview_folders: HashMap<String, FolderInfo> = HashMap::new();
    for entry in fs::read_dir(songs_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // Dot-directories (e.g. the songlist editor's `.backups/`) are
        // tooling artifacts, not content -- skip them like `build` does.
        if name.starts_with('.') {
            continue;
        }
        let info = FolderInfo::scan(&entry.path())?;
        if let Some(id) = name.strip_prefix("dl_") {
            preview_folders.insert(id.to_string(), info);
        } else {
            full_folders.insert(name, info);
        }
    }

    let song_ids: HashSet<&str> = catalog.songs.iter().map(|s| s.id.as_str()).collect();

    // Every songlist entry must resolve to at least one folder (full or
    // preview) on disk, and non-remote_dl entries need their declared
    // difficulties' chart files present in the full folder.
    for song in &catalog.songs {
        let full = full_folders.get(&song.id);
        let preview = preview_folders.get(&song.id);
        let is_remote_dl = song.remote_dl.unwrap_or(false);

        if full.is_none() && preview.is_none() {
            findings.push(Finding {
                severity: Severity::Error,
                message: format!(
                    "曲 `{}` は songlist に登録されていますが、対応するフォルダ (`{}/` または `dl_{}/`) がディスク上にありません — クライアントがクラッシュするか正常に動作しない可能性があります",
                    song.id, song.id, song.id
                ),
            });
            continue;
        }

        if is_remote_dl {
            if preview.is_none() {
                findings.push(Finding {
                    severity: Severity::Error,
                    message: format!(
                        "曲 `{}` は remote_dl:true ですが `dl_{}/` プレビューフォルダ (ジャケット+preview.ogg) がありません — バンドル内で曲が表示できません",
                        song.id, song.id
                    ),
                });
            }
            if full.is_some() {
                findings.push(Finding {
                    severity: Severity::Warn,
                    message: format!(
                        "曲 `{}` には `{}/` (実データ) と `dl_{}/` (プレビュー) の両方があります — ダウンロード配信+バンドルプレビューの意図的な併存です (想定どおりか確認のための通知)",
                        song.id, song.id, song.id
                    ),
                });
            }
        } else if let Some(full) = full {
            if let Some(difficulties) = &song.difficulties {
                for diff in difficulties {
                    if !full.has_charts.contains(&diff.rating_class) {
                        findings.push(Finding {
                            severity: Severity::Error,
                            message: format!(
                                "曲 `{}` は難易度 ratingClass={} を宣言していますが、譜面ファイル `{}/{}.aff` がありません",
                                song.id, diff.rating_class, song.id, diff.rating_class
                            ),
                        });
                    }
                }
            }
        } else {
            findings.push(Finding {
                severity: Severity::Error,
                message: format!(
                    "曲 `{}` は remote_dl ではないのに `dl_{}/` プレビューフォルダしかなく、実データの `{}/` がありません",
                    song.id, song.id, song.id
                ),
            });
        }
    }

    // Orphaned folders: present on disk, absent from songlist entirely.
    for id in full_folders.keys() {
        if !song_ids.contains(id.as_str()) {
            findings.push(Finding {
                severity: Severity::Warn,
                message: format!(
                    "フォルダ `{id}/` はディスク上にありますが songlist に登録がありません (孤立フォルダ — 削除するか songlist にエントリを追加してください)"
                ),
            });
        }
    }
    for id in preview_folders.keys() {
        if !song_ids.contains(id.as_str()) {
            findings.push(Finding {
                severity: Severity::Warn,
                message: format!(
                    "フォルダ `dl_{id}/` はディスク上にありますが songlist に登録がありません (孤立フォルダ — 削除するか songlist にエントリを追加してください)"
                ),
            });
        }
    }

    // unlocks cross-references.
    for unlock in &catalog.unlocks {
        match catalog.songs_by_id.get(&unlock.song_id) {
            None => {
                findings.push(Finding {
                    severity: Severity::Error,
                    message: format!(
                        "unlocks のエントリが songlist に存在しない songId `{}` を参照しています (宙に浮いた参照)",
                        unlock.song_id
                    ),
                });
            }
            Some(song) => {
                let has_difficulty = song
                    .difficulties
                    .as_ref()
                    .is_some_and(|ds| ds.iter().any(|d| d.rating_class == unlock.rating_class));
                if !has_difficulty {
                    findings.push(Finding {
                        severity: Severity::Error,
                        message: format!(
                            "unlocks のエントリ `{}` が、その曲に宣言されていない難易度 ratingClass={} を参照しています",
                            unlock.song_id, unlock.rating_class
                        ),
                    });
                }
            }
        }
        // type=1 conditions reference another song by song_id -- validate that too.
        for cond in &unlock.conditions {
            if cond.type_ == 1 {
                if let Some(ref_id) = cond.extra.get("song_id").and_then(|v| v.as_str()) {
                    if !song_ids.contains(ref_id) {
                        findings.push(Finding {
                            severity: Severity::Error,
                            message: format!(
                                "unlocks のエントリ `{}` の type=1 解禁条件が、songlist に存在しない song_id `{}` を参照しています",
                                unlock.song_id, ref_id
                            ),
                        });
                    }
                }
            }
        }
    }

    // packlist cross-references (songlist.set -> packlist.id).
    //
    // A song whose `set` names a pack id that isn't in packlist CRASHES the
    // client (confirmed on-device) -- same crash class as a missing folder,
    // so this is an ERROR, not a warning. `set` is effectively 1:1 (a song
    // belongs to at most one pack). Empty/absent `set` and the sentinel
    // values base/single are legitimate non-pack bindings and are skipped
    // (e.g. `particlearts` ships with no `set` and works fine).
    let pack_ids: HashSet<&str> = catalog.packs.iter().map(|p| p.id.as_str()).collect();
    let mut unresolved: HashMap<&str, Vec<&str>> = HashMap::new();
    for song in &catalog.songs {
        if let Some(set) = &song.set {
            if set.is_empty() || NON_PACK_SET_VALUES.contains(&set.as_str()) {
                continue;
            }
            if !pack_ids.contains(set.as_str()) {
                unresolved.entry(set.as_str()).or_default().push(&song.id);
            }
        }
    }
    for (set, song_ids) in &unresolved {
        let example = song_ids
            .iter()
            .take(3)
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
        findings.push(Finding {
            severity: Severity::Error,
            message: format!(
                "{} 曲が `set` でパック `{set}` を参照していますが packlist に該当エントリがありません — この状態のバンドルはクライアントをクラッシュさせます (例: {example})",
                song_ids.len()
            ),
        });
    }

    // Summary counts.
    findings.push(Finding {
        severity: Severity::Info,
        message: format!(
            "songlist {} 件 / unlocks {} 件 / packlist {} 件",
            catalog.songs.len(),
            catalog.unlocks.len(),
            catalog.packs.len()
        ),
    });
    findings.push(Finding {
        severity: Severity::Info,
        message: format!(
            "ディスク上の実データフォルダ {} 件 / dl_ プレビューフォルダ {} 件",
            full_folders.len(),
            preview_folders.len()
        ),
    });
    findings.push(Finding {
        severity: Severity::Info,
        message: format!(
            "カタログファイル: songlist={} / unlocks={} / packlist={}",
            catalog.songlist_path.display(),
            catalog.unlocks_path.display(),
            catalog.packlist_path.display()
        ),
    });

    let error_count = findings
        .iter()
        .filter(|f| matches!(f.severity, Severity::Error))
        .count();
    let warn_count = findings
        .iter()
        .filter(|f| matches!(f.severity, Severity::Warn))
        .count();
    let info_count = findings
        .iter()
        .filter(|f| matches!(f.severity, Severity::Info))
        .count();

    Ok(ScanReport {
        findings,
        error_count,
        warn_count,
        info_count,
    })
}
