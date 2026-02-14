use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// MemoryEntry — a single key-value record in shared memory
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub namespace: String,
    pub key: String,
    pub value: serde_json::Value,
    pub version: u64,
    pub updated_by: String,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

/// Well-known namespace prefixes.
pub struct Namespaces;

impl Namespaces {
    /// Shared across all agents.
    pub const SHARED: &'static str = "shared";

    /// Scoped to a team, e.g. `team:alpha`.
    pub fn team(team_id: &str) -> String {
        format!("team:{team_id}")
    }

    /// Scoped to an individual agent, e.g. `agent:coder-1`.
    pub fn agent(agent_id: &str) -> String {
        format!("agent:{agent_id}")
    }
}

// ---------------------------------------------------------------------------
// SharedMemory
// ---------------------------------------------------------------------------

/// SQLite-backed key-value store with namespace scoping and version tracking.
///
/// Thread-safe via `Mutex<Connection>`.
pub struct SharedMemory {
    conn: Mutex<Connection>,
}

impl SharedMemory {
    // -- constructors -------------------------------------------------------

    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        let mem = Self {
            conn: Mutex::new(conn),
        };
        mem.init_tables()?;
        Ok(mem)
    }

    pub fn in_memory() -> anyhow::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let mem = Self {
            conn: Mutex::new(conn),
        };
        mem.init_tables()?;
        Ok(mem)
    }

    fn init_tables(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS team_memories (
                namespace   TEXT NOT NULL,
                key         TEXT NOT NULL,
                value       TEXT NOT NULL,
                version     INTEGER NOT NULL DEFAULT 1,
                updated_by  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                PRIMARY KEY (namespace, key)
            );",
        )?;
        Ok(())
    }

    // -- mutations -----------------------------------------------------------

    /// Set a key in the given namespace.
    ///
    /// If the key already exists the version is incremented.
    /// If `expected_version` is `Some(v)`, the write only succeeds when the
    /// current version equals `v` (optimistic concurrency).
    pub fn set(
        &self,
        namespace: &str,
        key: &str,
        value: serde_json::Value,
        updated_by: &str,
        expected_version: Option<u64>,
    ) -> anyhow::Result<MemoryEntry> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let now = Utc::now();

        // Check current version if optimistic concurrency is requested.
        if let Some(expected) = expected_version {
            let current: Option<u64> = conn
                .query_row(
                    "SELECT version FROM team_memories WHERE namespace = ?1 AND key = ?2",
                    params![namespace, key],
                    |row| row.get(0),
                )
                .ok();

            match current {
                Some(v) if v != expected => {
                    anyhow::bail!(
                        "version conflict: expected {expected}, found {v} for {namespace}/{key}"
                    );
                }
                None if expected != 0 => {
                    anyhow::bail!(
                        "version conflict: key {namespace}/{key} does not exist (expected version {expected})"
                    );
                }
                _ => {}
            }
        }

        let value_str = value.to_string();
        let now_str = now.to_rfc3339();

        conn.execute(
            "INSERT INTO team_memories (namespace, key, value, version, updated_by, updated_at)
             VALUES (?1, ?2, ?3, 1, ?4, ?5)
             ON CONFLICT(namespace, key) DO UPDATE SET
                value      = excluded.value,
                version    = team_memories.version + 1,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at",
            params![namespace, key, value_str, updated_by, now_str],
        )?;

        // Read back to get the actual version.
        let version: u64 = conn.query_row(
            "SELECT version FROM team_memories WHERE namespace = ?1 AND key = ?2",
            params![namespace, key],
            |row| row.get(0),
        )?;

        Ok(MemoryEntry {
            namespace: namespace.to_string(),
            key: key.to_string(),
            value,
            version,
            updated_by: updated_by.to_string(),
            updated_at: now,
        })
    }

    /// Get a key from the given namespace.
    pub fn get(&self, namespace: &str, key: &str) -> anyhow::Result<Option<MemoryEntry>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT namespace, key, value, version, updated_by, updated_at
             FROM team_memories WHERE namespace = ?1 AND key = ?2",
        )?;
        let mut rows = stmt.query(params![namespace, key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_entry(row)?))
        } else {
            Ok(None)
        }
    }

    /// Delete a key from the given namespace. Returns true if something was
    /// deleted.
    pub fn delete(&self, namespace: &str, key: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let changed = conn.execute(
            "DELETE FROM team_memories WHERE namespace = ?1 AND key = ?2",
            params![namespace, key],
        )?;
        Ok(changed > 0)
    }

    /// List all entries in a namespace.
    pub fn list_namespace(&self, namespace: &str) -> anyhow::Result<Vec<MemoryEntry>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT namespace, key, value, version, updated_by, updated_at
             FROM team_memories WHERE namespace = ?1 ORDER BY key",
        )?;
        let mut rows = stmt.query(params![namespace])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(row_to_entry(row)?);
        }
        Ok(out)
    }

    /// List all namespaces that have at least one entry.
    pub fn list_namespaces(&self) -> anyhow::Result<Vec<String>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt =
            conn.prepare("SELECT DISTINCT namespace FROM team_memories ORDER BY namespace")?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let ns: String = row.get(0)?;
            out.push(ns);
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

fn row_to_entry(row: &rusqlite::Row<'_>) -> anyhow::Result<MemoryEntry> {
    let namespace: String = row.get(0)?;
    let key: String = row.get(1)?;
    let value_str: String = row.get(2)?;
    let version: u64 = row.get(3)?;
    let updated_by: String = row.get(4)?;
    let updated_at_str: String = row.get(5)?;

    Ok(MemoryEntry {
        namespace,
        key,
        value: serde_json::from_str(&value_str)?,
        version,
        updated_by,
        updated_at: DateTime::parse_from_rfc3339(&updated_at_str)?
            .with_timezone(&Utc),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_and_get() {
        let mem = SharedMemory::in_memory().unwrap();
        let entry = mem
            .set("shared", "project_name", serde_json::json!("goose"), "coder-1", None)
            .unwrap();

        assert_eq!(entry.namespace, "shared");
        assert_eq!(entry.key, "project_name");
        assert_eq!(entry.value, serde_json::json!("goose"));
        assert_eq!(entry.version, 1);
        assert_eq!(entry.updated_by, "coder-1");

        let fetched = mem.get("shared", "project_name").unwrap().unwrap();
        assert_eq!(fetched.value, serde_json::json!("goose"));
        assert_eq!(fetched.version, 1);
    }

    #[test]
    fn set_increments_version() {
        let mem = SharedMemory::in_memory().unwrap();
        mem.set("shared", "count", serde_json::json!(1), "a", None).unwrap();
        let entry = mem
            .set("shared", "count", serde_json::json!(2), "b", None)
            .unwrap();
        assert_eq!(entry.version, 2);

        let entry = mem
            .set("shared", "count", serde_json::json!(3), "c", None)
            .unwrap();
        assert_eq!(entry.version, 3);
    }

    #[test]
    fn optimistic_concurrency_success() {
        let mem = SharedMemory::in_memory().unwrap();
        mem.set("shared", "k", serde_json::json!("v1"), "a", None).unwrap();

        // Update with correct expected version.
        let entry = mem
            .set("shared", "k", serde_json::json!("v2"), "b", Some(1))
            .unwrap();
        assert_eq!(entry.version, 2);
    }

    #[test]
    fn optimistic_concurrency_conflict() {
        let mem = SharedMemory::in_memory().unwrap();
        mem.set("shared", "k", serde_json::json!("v1"), "a", None).unwrap();

        // Update with wrong expected version should fail.
        let result = mem.set("shared", "k", serde_json::json!("v2"), "b", Some(99));
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("version conflict"));
    }

    #[test]
    fn delete_existing() {
        let mem = SharedMemory::in_memory().unwrap();
        mem.set("shared", "k", serde_json::json!("v"), "a", None).unwrap();

        assert!(mem.delete("shared", "k").unwrap());
        assert!(mem.get("shared", "k").unwrap().is_none());
    }

    #[test]
    fn delete_nonexistent() {
        let mem = SharedMemory::in_memory().unwrap();
        assert!(!mem.delete("shared", "ghost").unwrap());
    }

    #[test]
    fn list_namespace() {
        let mem = SharedMemory::in_memory().unwrap();
        mem.set("team:alpha", "a", serde_json::json!(1), "x", None).unwrap();
        mem.set("team:alpha", "b", serde_json::json!(2), "x", None).unwrap();
        mem.set("team:beta", "c", serde_json::json!(3), "x", None).unwrap();

        let alpha = mem.list_namespace("team:alpha").unwrap();
        assert_eq!(alpha.len(), 2);
        assert_eq!(alpha[0].key, "a");
        assert_eq!(alpha[1].key, "b");
    }

    #[test]
    fn list_namespaces() {
        let mem = SharedMemory::in_memory().unwrap();
        mem.set("shared", "a", serde_json::json!(1), "x", None).unwrap();
        mem.set("team:alpha", "b", serde_json::json!(2), "x", None).unwrap();
        mem.set("agent:coder-1", "c", serde_json::json!(3), "x", None).unwrap();

        let ns = mem.list_namespaces().unwrap();
        assert_eq!(ns, vec!["agent:coder-1", "shared", "team:alpha"]);
    }

    #[test]
    fn namespace_helpers() {
        assert_eq!(Namespaces::SHARED, "shared");
        assert_eq!(Namespaces::team("alpha"), "team:alpha");
        assert_eq!(Namespaces::agent("coder-1"), "agent:coder-1");
    }

    #[test]
    fn complex_json_value() {
        let mem = SharedMemory::in_memory().unwrap();
        let complex = serde_json::json!({
            "findings": [
                {"file": "main.rs", "severity": "high"},
                {"file": "lib.rs", "severity": "low"}
            ],
            "total": 2,
            "scanned_at": "2026-02-14T12:00:00Z"
        });

        mem.set("shared", "scan_results", complex.clone(), "monitor", None)
            .unwrap();

        let fetched = mem.get("shared", "scan_results").unwrap().unwrap();
        assert_eq!(fetched.value, complex);
    }

    #[test]
    fn get_nonexistent() {
        let mem = SharedMemory::in_memory().unwrap();
        assert!(mem.get("shared", "nope").unwrap().is_none());
    }

    #[test]
    fn entry_round_trip_json() {
        let entry = MemoryEntry {
            namespace: "shared".into(),
            key: "test".into(),
            value: serde_json::json!(42),
            version: 3,
            updated_by: "agent-1".into(),
            updated_at: Utc::now(),
        };

        let json = serde_json::to_string(&entry).unwrap();
        let decoded: MemoryEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.key, "test");
        assert_eq!(decoded.version, 3);
    }
}
