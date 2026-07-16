//! Shared logic behind the `bundle_manager` CLI (`src/bin/bundle_manager/`)
//! and the admin web `/web/api/bundle-manager/*` routes
//! (`src/route/admin/bundle_manager.rs`). Lives under `service/` (rather
//! than only inside the CLI binary) so both callers can invoke it
//! in-process without duplicating logic, following this codebase's existing
//! convention of binaries calling into `Arcaea_server_rs::service::*`.

pub mod build;
pub mod catalog_edit;
pub mod import;
pub mod schema;
pub mod scan;
pub mod songlist;
