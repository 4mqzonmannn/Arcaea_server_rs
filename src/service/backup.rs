//! Database backup service for the admin web panel.
//!
//! Produces logical (`mariadb-dump`) snapshots of the game database on demand
//! and lists/serves the resulting files. This is deliberately a shell-out to
//! `mariadb-dump` rather than an in-process dump: reproducing mysqldump's
//! exact schema/`INSERT` output (escaping, `--single-transaction` consistency,
//! routines/triggers) by hand would be far more error-prone for something
//! whose entire job is to be a trustworthy restore point.
//!
//! Files land in `./backups/` (a read-write bind mount, alongside `./songs`
//! and `./bundles`). Scheduled backups are handled separately by the
//! `db-backup` compose service; both write to the same directory and share
//! the `arcaea_core-<unix_ts>.sql` naming + rotation convention so the admin
//! UI lists them uniformly.

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

/// Filename prefix / extension shared with the scheduled `db-backup` service.
const FILE_PREFIX: &str = "arcaea_core-";
const FILE_SUFFIX: &str = ".sql";

/// How many manual backups to keep before pruning the oldest. Scheduled
/// backups rotate independently in the compose service.
const KEEP_MANUAL: usize = 14;

/// Parsed connection parameters pulled out of `DATABASE_URL`.
struct DbTarget {
    host: String,
    port: u16,
    user: String,
    password: String,
    database: String,
}

impl DbTarget {
    fn from_env() -> Result<Self> {
        let url = std::env::var("DATABASE_URL")
            .context("DATABASE_URL is not set; cannot determine backup target")?;
        let parsed = url::Url::parse(&url).context("DATABASE_URL is not a valid URL")?;
        let database = parsed.path().trim_start_matches('/').to_string();
        if database.is_empty() {
            bail!("DATABASE_URL has no database name");
        }
        Ok(Self {
            host: parsed.host_str().unwrap_or("db").to_string(),
            port: parsed.port().unwrap_or(3306),
            user: urlencoding::decode(parsed.username())
                .map(|s| s.into_owned())
                .unwrap_or_else(|_| parsed.username().to_string()),
            password: parsed
                .password()
                .map(|p| {
                    urlencoding::decode(p)
                        .map(|s| s.into_owned())
                        .unwrap_or_else(|_| p.to_string())
                })
                .unwrap_or_default(),
            database,
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub size_bytes: u64,
    /// Unix seconds parsed from the filename (falls back to mtime).
    pub created_unix: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRunResult {
    pub name: String,
    pub size_bytes: u64,
    pub pruned: Vec<String>,
}

/// Runtime backups directory, mounted read-write (see docker-compose).
pub fn backup_dir() -> PathBuf {
    PathBuf::from("./backups")
}

/// Resolve a client-supplied backup name to a path inside `backup_dir`,
/// rejecting anything that isn't a plain backup filename (defence in depth
/// for the download endpoint -- no separators, must match our naming).
pub fn resolve_backup_path(name: &str) -> Result<PathBuf> {
    if !is_backup_name(name) {
        bail!("invalid backup name");
    }
    Ok(backup_dir().join(name))
}

fn is_backup_name(name: &str) -> bool {
    name.starts_with(FILE_PREFIX)
        && name.ends_with(FILE_SUFFIX)
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

/// List existing backups, newest first.
pub fn list_backups() -> Result<Vec<BackupFile>> {
    let dir = backup_dir();
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        // No directory yet just means no backups have been taken.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(e).with_context(|| format!("reading {}", dir.display())),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_backup_name(&name) {
            continue;
        }
        let meta = entry.metadata()?;
        out.push(BackupFile {
            created_unix: created_unix_from(&name, &meta),
            size_bytes: meta.len(),
            name,
        });
    }
    out.sort_by(|a, b| b.created_unix.cmp(&a.created_unix));
    Ok(out)
}

fn created_unix_from(name: &str, meta: &std::fs::Metadata) -> i64 {
    name.strip_prefix(FILE_PREFIX)
        .and_then(|s| s.strip_suffix(FILE_SUFFIX))
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| {
            meta.modified()
                .ok()
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0)
        })
}

/// Run `mariadb-dump` and write a new snapshot, then prune old manual backups.
pub async fn run_backup() -> Result<BackupRunResult> {
    let target = DbTarget::from_env()?;
    let dir = backup_dir();
    std::fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;

    let ts = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let name = format!("{FILE_PREFIX}{ts}{FILE_SUFFIX}");
    let final_path = dir.join(&name);
    // Write to a hidden temp file first, then rename, so a failed/partial
    // dump never appears in the listing as if it were a valid backup.
    let tmp_path = dir.join(format!(".{name}.partial"));

    let tmp_file = std::fs::File::create(&tmp_path)
        .with_context(|| format!("creating {}", tmp_path.display()))?;

    // NB: use spawn + wait_with_output, NOT .output(). `.output()` forces
    // stdout to an internal pipe, which would override the file redirect and
    // leave the backup empty. Here only stderr is piped; stdout streams into
    // the file we opened.
    let child = Command::new("mariadb-dump")
        .arg(format!("--host={}", target.host))
        .arg(format!("--port={}", target.port))
        .arg(format!("--user={}", target.user))
        // Password via env (MYSQL_PWD) rather than argv so it never shows up
        // in the container's process list.
        .env("MYSQL_PWD", &target.password)
        .arg("--single-transaction")
        .arg("--no-tablespaces")
        .arg("--routines")
        .arg("--triggers")
        .arg("--databases")
        .arg(&target.database)
        .stdout(std::process::Stdio::from(tmp_file))
        .stderr(std::process::Stdio::piped())
        .spawn()
        .context("failed to spawn mariadb-dump (is the mariadb client installed?)")?;

    let output = child
        .wait_with_output()
        .await
        .context("waiting for mariadb-dump")?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "mariadb-dump exited with {}: {}",
            output.status,
            stderr.trim()
        );
    }

    std::fs::rename(&tmp_path, &final_path)
        .with_context(|| format!("finalizing {}", final_path.display()))?;
    let size_bytes = std::fs::metadata(&final_path)?.len();

    let pruned = prune_old(&dir).unwrap_or_default();

    Ok(BackupRunResult {
        name,
        size_bytes,
        pruned,
    })
}

/// Keep only the newest `KEEP_MANUAL` backups; return the names removed.
fn prune_old(dir: &Path) -> Result<Vec<String>> {
    let mut files = list_backups()?;
    if files.len() <= KEEP_MANUAL {
        return Ok(Vec::new());
    }
    let mut pruned = Vec::new();
    for old in files.split_off(KEEP_MANUAL) {
        if std::fs::remove_file(dir.join(&old.name)).is_ok() {
            pruned.push(old.name);
        }
    }
    Ok(pruned)
}

/// Human-facing sanity check the route can call before attempting a dump, so
/// a missing client binary produces a clear message instead of a spawn error.
pub async fn ensure_dump_tool() -> Result<()> {
    Command::new("mariadb-dump")
        .arg("--version")
        .output()
        .await
        .map(|_| ())
        .map_err(|_| anyhow!("mariadb-dump is not available in this container"))
}
