//! Bundle management CLI: deep catalog validation (`scan`) plus the
//! incremental content-bundle builder (`build`), which runs `scan` as a
//! pre-flight gate before writing anything.
//!
//! This binary is a thin wrapper over `Arcaea_server_rs::service::bundle_manager`
//! (schema/scan/build) -- the same logic is also exposed over HTTP by the
//! admin web app (`src/route/admin/bundle_manager.rs`), so it lives in the
//! shared lib crate rather than only here.

use Arcaea_server_rs::service::bundle_manager::{build, schema, scan};

use build::BuildArgs;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "bundle_manager")]
#[command(about = "Deep-validate and build Arcaea content bundles from a songs directory")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Read-only: auto-detect songlist/unlocks/packlist, classify every
    /// song folder, and report cross-consistency issues. Exits non-zero if
    /// any error-level finding is present.
    Scan {
        /// Directory containing songs/<id>/*, songlist (or slst), packlist, unlocks.
        #[arg(long, env = "BUNDLE_MANAGER_SONGS_DIR", default_value = "./database/songs")]
        songs: PathBuf,
    },
    /// Run `scan` as a pre-flight gate, then build an incremental content
    /// bundle (.cb + .json) if no error-level findings are present.
    Build {
        #[arg(long, env = "BUNDLE_MANAGER_SONGS_DIR", default_value = "./database/songs")]
        songs: PathBuf,

        /// Directory to scan for the current latest bundle and to write the new one into.
        #[arg(long, env = "BUNDLE_MANAGER_BUNDLES_DIR", default_value = "./database/bundle")]
        bundles: PathBuf,

        /// Optional directory containing `img/`-prefixed bundle content.
        #[arg(long, env = "BUNDLE_MANAGER_IMG_DIR")]
        img: Option<PathBuf>,

        /// applicationVersionNumber this bundle targets.
        #[arg(long, env = "BUNDLE_MANAGER_APP_VERSION")]
        app_version: String,

        /// Explicit versionNumber for the new bundle. Defaults to incrementing
        /// the last dot-separated component of the previous bundle's version.
        #[arg(long)]
        bundle_version: Option<String>,

        /// Print the diff summary without writing any files.
        #[arg(long, default_value_t = false)]
        dry_run: bool,

        /// Build even if the pre-flight scan reports error-level findings.
        #[arg(long, default_value_t = false)]
        force: bool,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Scan { songs } => {
            let catalog = schema::load_catalog(&songs)?;
            let report = scan::scan(&songs, &catalog)?;
            report.print();
            if report.has_errors() {
                std::process::exit(1);
            }
            Ok(())
        }
        Command::Build {
            songs,
            bundles,
            img,
            app_version,
            bundle_version,
            dry_run,
            force,
        } => {
            let catalog = schema::load_catalog(&songs)?;
            let report = scan::scan(&songs, &catalog)?;
            report.print();
            if report.has_errors() && !force {
                anyhow::bail!(
                    "pre-flight scan found error-level issues; refusing to build (pass --force to override)"
                );
            }
            println!();
            let result = build::build(&BuildArgs {
                songs,
                bundles,
                img,
                app_version,
                bundle_version,
                dry_run,
            })?;

            eprintln!(
                "diff summary: {} added, {} changed, {} unchanged, {} removed ({} bytes in this bundle)",
                result.added_count,
                result.changed_count,
                result.unchanged_count,
                result.removed_count,
                result.bundle_bytes
            );
            match &result.written_files {
                Some((cb_path, json_path)) => {
                    println!(
                        "wrote {} and {} ({} added/changed files, {} bytes)",
                        cb_path,
                        json_path,
                        result.added_count + result.changed_count,
                        result.bundle_bytes
                    );
                }
                None => {
                    eprintln!(
                        "dry run: would write {}.cb ({} bytes) and {}.json",
                        result.version_number, result.bundle_bytes, result.version_number
                    );
                }
            }
            Ok(())
        }
    }
}
