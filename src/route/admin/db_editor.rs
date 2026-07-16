//! Generic database editor (admin) — browse and edit ANY table in the game DB.
//!
//! FULL-SAFETY design (per operator request):
//!  * Every identifier (table / column) is validated against
//!    `information_schema` for the CURRENT database before use, then
//!    backtick-quoted. No identifier is ever taken from raw client input into
//!    SQL without matching a real column/table name first.
//!  * Every value is bound as a parameter (`?`); the client sends all values as
//!    strings and MySQL coerces them to the column type on write.
//!  * Writes REQUIRE the table to have a PRIMARY KEY and the request to carry
//!    the full PK of the target row. A bare `UPDATE t SET ...` / `DELETE FROM t`
//!    (no PK) is impossible.
//!  * Before every write we ensure a recent full DB dump exists (restore point).
//!  * Every write is appended to an append-only JSONL audit log
//!    (`./backups/db-audit.jsonl`, host-mounted).
//!  * The read-only-by-default gate and the two-step "preview -> confirm" flow
//!    live in the web UI; the backend additionally requires `confirm: true` on
//!    every write.

use std::collections::HashMap;
use std::io::Write as _;
use std::time::{SystemTime, UNIX_EPOCH};

use rocket::http::CookieJar;
use rocket::serde::json::Json;
use rocket::{get, post, State};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;

use crate::error::ArcError;
use crate::route::common::{success_return, RouteResult};
use crate::service::backup;
use crate::DbPool;

use super::models::WebSession;
use super::session::require_admin_api;

fn err(msg: impl Into<String>) -> ArcError {
    ArcError::input(msg)
}

/// Backtick-quote an identifier (already validated against information_schema).
fn q(ident: &str) -> String {
    format!("`{}`", ident.replace('`', "``"))
}

/// Binary-ish column types are read as HEX() and treated as read-only hex.
fn is_binary_type(data_type: &str) -> bool {
    matches!(
        data_type.to_ascii_lowercase().as_str(),
        "blob" | "tinyblob" | "mediumblob" | "longblob" | "binary" | "varbinary" | "bit" | "geometry"
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TableInfo {
    name: String,
    approx_rows: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct ColumnInfo {
    name: String,
    data_type: String,
    column_type: String,
    nullable: bool,
    is_primary_key: bool,
    extra: String,
    binary: bool,
}

async fn load_columns(pool: &DbPool, table: &str) -> Result<Vec<ColumnInfo>, ArcError> {
    let rows = sqlx::query(
        "SELECT column_name AS name, data_type AS data_type, column_type AS column_type, \
                is_nullable AS is_nullable, column_key AS column_key, extra AS extra \
         FROM information_schema.columns \
         WHERE table_schema = DATABASE() AND table_name = ? \
         ORDER BY ordinal_position",
    )
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| err(format!("schema query failed: {e}")))?;

    if rows.is_empty() {
        return Err(err(format!("unknown table: {table}")));
    }
    Ok(rows
        .iter()
        .map(|r| {
            let data_type: String = r.get("data_type");
            let nullable: String = r.get("is_nullable");
            let key: String = r.get("column_key");
            ColumnInfo {
                binary: is_binary_type(&data_type),
                name: r.get("name"),
                column_type: r.get("column_type"),
                nullable: nullable.eq_ignore_ascii_case("YES"),
                is_primary_key: key == "PRI",
                extra: r.get("extra"),
                data_type,
            }
        })
        .collect())
}

fn primary_key(cols: &[ColumnInfo]) -> Vec<String> {
    cols.iter().filter(|c| c.is_primary_key).map(|c| c.name.clone()).collect()
}

fn col_names(cols: &[ColumnInfo]) -> Vec<&str> {
    cols.iter().map(|c| c.name.as_str()).collect()
}

/// Age (seconds) of the newest `*.sql` dump in the backups dir, if any.
fn newest_backup_age_secs() -> Option<u64> {
    let mut newest: Option<SystemTime> = None;
    for entry in std::fs::read_dir(backup::backup_dir()).ok()?.flatten() {
        if entry.path().extension().map_or(false, |x| x == "sql") {
            if let Ok(m) = entry.metadata().and_then(|md| md.modified()) {
                newest = Some(newest.map_or(m, |n| n.max(m)));
            }
        }
    }
    newest.map(|t| SystemTime::now().duration_since(t).map(|d| d.as_secs()).unwrap_or(0))
}

/// Ensure a restore point exists before a write: dump if the newest backup is
/// missing or older than 10 minutes. Returns true if a new dump was created.
async fn ensure_recent_backup() -> Result<bool, ArcError> {
    let stale = newest_backup_age_secs().map_or(true, |age| age > 600);
    if !stale {
        return Ok(false);
    }
    backup::ensure_dump_tool().await.map_err(|e| err(format!("backup tool unavailable: {e}")))?;
    backup::run_backup().await.map_err(|e| err(format!("pre-write backup failed: {e}")))?;
    Ok(true)
}

fn audit(session: &WebSession, table: &str, op: &str, detail: serde_json::Value) {
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let line = json!({
        "ts": ts,
        "admin": session.user.name,
        "adminId": session.user.user_id,
        "table": table,
        "op": op,
        "detail": detail,
    });
    let path = backup::backup_dir().join("db-audit.jsonl");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{line}");
    }
}

// ---------- read endpoints ----------

#[get("/api/db/tables")]
pub(super) async fn admin_api_db_tables(
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<Vec<TableInfo>> {
    require_admin_api(cookies, pool.inner()).await?;
    let rows = sqlx::query(
        "SELECT table_name AS name, CAST(IFNULL(table_rows, 0) AS SIGNED) AS approx_rows \
         FROM information_schema.tables \
         WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' \
         ORDER BY table_name",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| err(format!("db error: {e}")))?;
    let out = rows
        .iter()
        .map(|r| TableInfo {
            name: r.get("name"),
            approx_rows: r.try_get("approx_rows").unwrap_or(0),
        })
        .collect();
    Ok(success_return(out))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RowsResponse {
    columns: Vec<ColumnInfo>,
    primary_key: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
    total: i64,
    page: u32,
    size: u32,
}

#[allow(clippy::too_many_arguments)]
#[get("/api/db/table/<table>/rows?<page>&<size>&<order_by>&<order_dir>&<filter_col>&<filter_val>")]
pub(super) async fn admin_api_db_rows(
    table: &str,
    page: Option<u32>,
    size: Option<u32>,
    order_by: Option<String>,
    order_dir: Option<String>,
    filter_col: Option<String>,
    filter_val: Option<String>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<RowsResponse> {
    require_admin_api(cookies, pool.inner()).await?;
    let cols = load_columns(pool.inner(), table).await?;
    let names = col_names(&cols);

    let page = page.unwrap_or(1).max(1);
    let size = size.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * size;

    // validate optional order/filter columns against the real schema
    let order_by = match order_by {
        Some(c) if !c.is_empty() => {
            if !names.contains(&c.as_str()) {
                return Err(err(format!("unknown order column: {c}")));
            }
            Some(c)
        }
        _ => None,
    };
    let order_dir = match order_dir.as_deref() {
        Some(d) if d.eq_ignore_ascii_case("desc") => "DESC",
        _ => "ASC",
    };
    let filter_col = match filter_col {
        Some(c) if !c.is_empty() => {
            if !names.contains(&c.as_str()) {
                return Err(err(format!("unknown filter column: {c}")));
            }
            Some(c)
        }
        _ => None,
    };

    let select_list = cols
        .iter()
        .map(|c| {
            if c.binary {
                format!("HEX({}) AS {}", q(&c.name), q(&c.name))
            } else {
                format!("CAST({} AS CHAR) AS {}", q(&c.name), q(&c.name))
            }
        })
        .collect::<Vec<_>>()
        .join(", ");

    let where_clause = if let Some(fc) = &filter_col {
        format!("WHERE {} LIKE ?", q(fc))
    } else {
        String::new()
    };
    let order_clause = order_by
        .as_ref()
        .map(|c| format!("ORDER BY {} {}", q(c), order_dir))
        .unwrap_or_default();

    let sql = format!(
        "SELECT {select_list} FROM {} {where_clause} {order_clause} LIMIT ? OFFSET ?",
        q(table)
    );
    let mut query = sqlx::query(&sql);
    if filter_col.is_some() {
        let like = format!("%{}%", filter_val.clone().unwrap_or_default());
        query = query.bind(like);
    }
    query = query.bind(size).bind(offset);
    let db_rows = query
        .fetch_all(pool.inner())
        .await
        .map_err(|e| err(format!("row query failed: {e}")))?;

    let rows: Vec<Vec<Option<String>>> = db_rows
        .iter()
        .map(|r| (0..cols.len()).map(|i| r.try_get::<Option<String>, _>(i).unwrap_or(None)).collect())
        .collect();

    let count_sql = format!("SELECT CAST(COUNT(*) AS SIGNED) AS c FROM {} {where_clause}", q(table));
    let mut cq = sqlx::query(&count_sql);
    if filter_col.is_some() {
        let like = format!("%{}%", filter_val.unwrap_or_default());
        cq = cq.bind(like);
    }
    let total: i64 = cq
        .fetch_one(pool.inner())
        .await
        .map_err(|e| err(format!("count failed: {e}")))?
        .try_get("c")
        .unwrap_or(0);

    let primary_key = primary_key(&cols);
    Ok(success_return(RowsResponse { columns: cols, primary_key, rows, total, page, size }))
}

// ---------- write endpoints ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RowWrite {
    op: String, // "insert" | "update"
    #[serde(default)]
    pk: HashMap<String, Option<String>>,
    #[serde(default)]
    values: HashMap<String, Option<String>>,
    #[serde(default)]
    confirm: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WriteResult {
    rows_affected: u64,
    backup_created: bool,
}

/// Validate that `keys` are all real columns; returns them as an owned Vec in a
/// stable (map-iteration) order paired with their values.
fn validate_pairs(
    map: &HashMap<String, Option<String>>,
    cols: &[ColumnInfo],
) -> Result<Vec<(String, Option<String>)>, ArcError> {
    let names = col_names(cols);
    let mut out = Vec::with_capacity(map.len());
    for (k, v) in map {
        if !names.contains(&k.as_str()) {
            return Err(err(format!("unknown column: {k}")));
        }
        out.push((k.clone(), v.clone()));
    }
    Ok(out)
}

#[post("/api/db/table/<table>/row", format = "json", data = "<payload>")]
pub(super) async fn admin_api_db_row_write(
    table: &str,
    payload: Json<RowWrite>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<WriteResult> {
    let session = require_admin_api(cookies, pool.inner()).await?;
    if !payload.confirm {
        return Err(err("write not confirmed"));
    }
    let cols = load_columns(pool.inner(), table).await?;
    let pk_cols = primary_key(&cols);

    let set_pairs = validate_pairs(&payload.values, &cols)?;
    if set_pairs.is_empty() {
        return Err(err("no values provided"));
    }

    let backup_created = ensure_recent_backup().await?;

    let (sql, binds): (String, Vec<Option<String>>) = match payload.op.as_str() {
        "insert" => {
            let cols_sql = set_pairs.iter().map(|(k, _)| q(k)).collect::<Vec<_>>().join(", ");
            let ph = set_pairs.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            let sql = format!("INSERT INTO {} ({cols_sql}) VALUES ({ph})", q(table));
            (sql, set_pairs.iter().map(|(_, v)| v.clone()).collect())
        }
        "update" => {
            if pk_cols.is_empty() {
                return Err(err("table has no primary key; UPDATE refused for safety"));
            }
            let pk_pairs = validate_pairs(&payload.pk, &cols)?;
            let provided: std::collections::HashSet<&str> =
                pk_pairs.iter().map(|(k, _)| k.as_str()).collect();
            if !pk_cols.iter().all(|k| provided.contains(k.as_str())) {
                return Err(err("update requires the full primary key of the target row"));
            }
            let set_sql = set_pairs.iter().map(|(k, _)| format!("{} = ?", q(k))).collect::<Vec<_>>().join(", ");
            // WHERE only on the actual PK columns (ignore any extra keys sent).
            let where_pairs: Vec<&(String, Option<String>)> =
                pk_pairs.iter().filter(|(k, _)| pk_cols.iter().any(|p| p == k)).collect();
            let where_sql = where_pairs.iter().map(|(k, _)| format!("{} = ?", q(k))).collect::<Vec<_>>().join(" AND ");
            let sql = format!("UPDATE {} SET {set_sql} WHERE {where_sql}", q(table));
            let mut binds: Vec<Option<String>> = set_pairs.iter().map(|(_, v)| v.clone()).collect();
            binds.extend(where_pairs.iter().map(|(_, v)| v.clone()));
            (sql, binds)
        }
        other => return Err(err(format!("unknown op: {other}"))),
    };

    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b.clone());
    }
    let res = query.execute(pool.inner()).await.map_err(|e| err(format!("write failed: {e}")))?;

    audit(
        &session,
        table,
        &payload.op,
        json!({ "pk": payload.pk, "columns": set_pairs.iter().map(|(k, _)| k).collect::<Vec<_>>(), "rowsAffected": res.rows_affected() }),
    );
    Ok(success_return(WriteResult { rows_affected: res.rows_affected(), backup_created }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RowDelete {
    #[serde(default)]
    pk: HashMap<String, Option<String>>,
    #[serde(default)]
    confirm: bool,
}

#[post("/api/db/table/<table>/delete", format = "json", data = "<payload>")]
pub(super) async fn admin_api_db_row_delete(
    table: &str,
    payload: Json<RowDelete>,
    pool: &State<DbPool>,
    cookies: &CookieJar<'_>,
) -> RouteResult<WriteResult> {
    let session = require_admin_api(cookies, pool.inner()).await?;
    if !payload.confirm {
        return Err(err("delete not confirmed"));
    }
    let cols = load_columns(pool.inner(), table).await?;
    let pk_cols = primary_key(&cols);
    if pk_cols.is_empty() {
        return Err(err("table has no primary key; DELETE refused for safety"));
    }
    let pk_pairs = validate_pairs(&payload.pk, &cols)?;
    let provided: std::collections::HashSet<&str> = pk_pairs.iter().map(|(k, _)| k.as_str()).collect();
    if !pk_cols.iter().all(|k| provided.contains(k.as_str())) {
        return Err(err("delete requires the full primary key of the target row"));
    }
    let where_pairs: Vec<&(String, Option<String>)> =
        pk_pairs.iter().filter(|(k, _)| pk_cols.iter().any(|p| p == k)).collect();
    let where_sql = where_pairs.iter().map(|(k, _)| format!("{} = ?", q(k))).collect::<Vec<_>>().join(" AND ");

    let backup_created = ensure_recent_backup().await?;

    let sql = format!("DELETE FROM {} WHERE {where_sql}", q(table));
    let mut query = sqlx::query(&sql);
    for (_, v) in &where_pairs {
        query = query.bind(v.clone());
    }
    let res = query.execute(pool.inner()).await.map_err(|e| err(format!("delete failed: {e}")))?;

    audit(&session, table, "delete", json!({ "pk": payload.pk, "rowsAffected": res.rows_affected() }));
    Ok(success_return(WriteResult { rows_affected: res.rows_affected(), backup_created }))
}
