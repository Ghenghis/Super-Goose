use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

use super::messages::{AgentId, AgentRole, AgentStatus, TeamId};

// ---------------------------------------------------------------------------
// AgentRecord — the persistent view of a registered agent
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRecord {
    pub id: AgentId,
    pub display_name: String,
    pub role: AgentRole,
    pub team: Option<TeamId>,
    pub status: AgentStatus,
    pub capabilities: Vec<String>,
    pub registered_at: DateTime<Utc>,
    pub last_heartbeat: Option<DateTime<Utc>>,
    pub metadata: serde_json::Value,
}

// ---------------------------------------------------------------------------
// AgentRegistry
// ---------------------------------------------------------------------------

/// SQLite-backed registry of all known agents.
///
/// Thread-safe via `Mutex<Connection>`.  The connection may be in-memory
/// (for tests) or on-disk.
pub struct AgentRegistry {
    conn: Mutex<Connection>,
}

impl AgentRegistry {
    // -- constructors -------------------------------------------------------

    /// Open (or create) a registry backed by a file.
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        let registry = Self {
            conn: Mutex::new(conn),
        };
        registry.init_tables()?;
        Ok(registry)
    }

    /// Create an in-memory registry (useful for tests).
    pub fn in_memory() -> anyhow::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let registry = Self {
            conn: Mutex::new(conn),
        };
        registry.init_tables()?;
        Ok(registry)
    }

    fn init_tables(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS agents (
                id              TEXT PRIMARY KEY,
                display_name    TEXT NOT NULL,
                role            TEXT NOT NULL,
                team            TEXT,
                status          TEXT NOT NULL DEFAULT 'Offline',
                capabilities    TEXT NOT NULL DEFAULT '[]',
                registered_at   TEXT NOT NULL,
                last_heartbeat  TEXT,
                metadata        TEXT NOT NULL DEFAULT '{}'
            );",
        )?;
        Ok(())
    }

    // -- mutations -----------------------------------------------------------

    /// Register a new agent or update an existing one.
    pub fn register_agent(&self, record: &AgentRecord) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        conn.execute(
            "INSERT INTO agents (id, display_name, role, team, status, capabilities, registered_at, last_heartbeat, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                display_name   = excluded.display_name,
                role           = excluded.role,
                team           = excluded.team,
                status         = excluded.status,
                capabilities   = excluded.capabilities,
                last_heartbeat = excluded.last_heartbeat,
                metadata       = excluded.metadata",
            params![
                record.id.0,
                record.display_name,
                serde_json::to_string(&record.role)?,
                record.team.as_ref().map(|t| &t.0),
                serde_json::to_string(&record.status)?,
                serde_json::to_string(&record.capabilities)?,
                record.registered_at.to_rfc3339(),
                record.last_heartbeat.map(|t| t.to_rfc3339()),
                record.metadata.to_string(),
            ],
        )?;
        Ok(())
    }

    /// Remove an agent from the registry.
    pub fn unregister_agent(&self, id: &AgentId) -> anyhow::Result<bool> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let changed = conn.execute("DELETE FROM agents WHERE id = ?1", params![id.0])?;
        Ok(changed > 0)
    }

    /// Set the status of an agent.
    pub fn update_status(&self, id: &AgentId, status: AgentStatus) -> anyhow::Result<bool> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let changed = conn.execute(
            "UPDATE agents SET status = ?1 WHERE id = ?2",
            params![serde_json::to_string(&status)?, id.0],
        )?;
        Ok(changed > 0)
    }

    /// Touch the heartbeat timestamp for an agent.
    pub fn record_heartbeat(&self, id: &AgentId) -> anyhow::Result<bool> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let now = Utc::now().to_rfc3339();
        let changed = conn.execute(
            "UPDATE agents SET last_heartbeat = ?1 WHERE id = ?2",
            params![now, id.0],
        )?;
        Ok(changed > 0)
    }

    // -- queries ------------------------------------------------------------

    /// Retrieve a single agent by id.
    pub fn get_agent(&self, id: &AgentId) -> anyhow::Result<Option<AgentRecord>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, display_name, role, team, status, capabilities, registered_at, last_heartbeat, metadata FROM agents WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id.0])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_record(row)?))
        } else {
            Ok(None)
        }
    }

    /// List all agents, optionally filtering by status.
    pub fn list_agents(&self, status_filter: Option<AgentStatus>) -> anyhow::Result<Vec<AgentRecord>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let records = if let Some(status) = status_filter {
            let status_str = serde_json::to_string(&status)?;
            let mut stmt = conn.prepare(
                "SELECT id, display_name, role, team, status, capabilities, registered_at, last_heartbeat, metadata FROM agents WHERE status = ?1 ORDER BY id",
            )?;
            let mut rows = stmt.query(params![status_str])?;
            let mut out = Vec::new();
            while let Some(row) = rows.next()? {
                out.push(row_to_record(row)?);
            }
            out
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, display_name, role, team, status, capabilities, registered_at, last_heartbeat, metadata FROM agents ORDER BY id",
            )?;
            let mut rows = stmt.query([])?;
            let mut out = Vec::new();
            while let Some(row) = rows.next()? {
                out.push(row_to_record(row)?);
            }
            out
        };
        Ok(records)
    }

    /// List agents that have a specific role.
    pub fn agents_by_role(&self, role: &AgentRole) -> anyhow::Result<Vec<AgentRecord>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let role_str = serde_json::to_string(role)?;
        let mut stmt = conn.prepare(
            "SELECT id, display_name, role, team, status, capabilities, registered_at, last_heartbeat, metadata FROM agents WHERE role = ?1 ORDER BY id",
        )?;
        let mut rows = stmt.query(params![role_str])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(row_to_record(row)?);
        }
        Ok(out)
    }

    /// List agents belonging to a specific team.
    pub fn agents_by_team(&self, team: &TeamId) -> anyhow::Result<Vec<AgentRecord>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, display_name, role, team, status, capabilities, registered_at, last_heartbeat, metadata FROM agents WHERE team = ?1 ORDER BY id",
        )?;
        let mut rows = stmt.query(params![team.0])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(row_to_record(row)?);
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Row mapping helper
// ---------------------------------------------------------------------------

fn row_to_record(row: &rusqlite::Row<'_>) -> anyhow::Result<AgentRecord> {
    let id_str: String = row.get(0)?;
    let display_name: String = row.get(1)?;
    let role_str: String = row.get(2)?;
    let team_str: Option<String> = row.get(3)?;
    let status_str: String = row.get(4)?;
    let caps_str: String = row.get(5)?;
    let registered_str: String = row.get(6)?;
    let heartbeat_str: Option<String> = row.get(7)?;
    let meta_str: String = row.get(8)?;

    Ok(AgentRecord {
        id: AgentId::new(id_str),
        display_name,
        role: serde_json::from_str(&role_str)?,
        team: team_str.map(TeamId::new),
        status: serde_json::from_str(&status_str)?,
        capabilities: serde_json::from_str(&caps_str)?,
        registered_at: DateTime::parse_from_rfc3339(&registered_str)?
            .with_timezone(&Utc),
        last_heartbeat: heartbeat_str
            .map(|s| DateTime::parse_from_rfc3339(&s).map(|d| d.with_timezone(&Utc)))
            .transpose()?,
        metadata: serde_json::from_str(&meta_str)?,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(id: &str, role: AgentRole) -> AgentRecord {
        AgentRecord {
            id: AgentId::new(id),
            display_name: id.to_string(),
            role,
            team: None,
            status: AgentStatus::Online,
            capabilities: vec!["code".into()],
            registered_at: Utc::now(),
            last_heartbeat: None,
            metadata: serde_json::json!({}),
        }
    }

    #[test]
    fn register_and_get() {
        let reg = AgentRegistry::in_memory().unwrap();
        let rec = make_record("coder-1", AgentRole::Coder);
        reg.register_agent(&rec).unwrap();

        let fetched = reg.get_agent(&AgentId::new("coder-1")).unwrap().unwrap();
        assert_eq!(fetched.id.0, "coder-1");
        assert_eq!(fetched.display_name, "coder-1");
        assert_eq!(fetched.status, AgentStatus::Online);
    }

    #[test]
    fn register_upsert() {
        let reg = AgentRegistry::in_memory().unwrap();
        let mut rec = make_record("coder-1", AgentRole::Coder);
        reg.register_agent(&rec).unwrap();

        rec.display_name = "Coder One".into();
        rec.status = AgentStatus::Busy;
        reg.register_agent(&rec).unwrap();

        let fetched = reg.get_agent(&AgentId::new("coder-1")).unwrap().unwrap();
        assert_eq!(fetched.display_name, "Coder One");
        assert_eq!(fetched.status, AgentStatus::Busy);
    }

    #[test]
    fn unregister() {
        let reg = AgentRegistry::in_memory().unwrap();
        let rec = make_record("temp", AgentRole::Monitor);
        reg.register_agent(&rec).unwrap();

        assert!(reg.unregister_agent(&AgentId::new("temp")).unwrap());
        assert!(reg.get_agent(&AgentId::new("temp")).unwrap().is_none());
        assert!(!reg.unregister_agent(&AgentId::new("temp")).unwrap());
    }

    #[test]
    fn update_status() {
        let reg = AgentRegistry::in_memory().unwrap();
        reg.register_agent(&make_record("a", AgentRole::Coder)).unwrap();

        reg.update_status(&AgentId::new("a"), AgentStatus::Maintenance).unwrap();
        let fetched = reg.get_agent(&AgentId::new("a")).unwrap().unwrap();
        assert_eq!(fetched.status, AgentStatus::Maintenance);
    }

    #[test]
    fn record_heartbeat() {
        let reg = AgentRegistry::in_memory().unwrap();
        reg.register_agent(&make_record("a", AgentRole::Coder)).unwrap();

        let before = reg.get_agent(&AgentId::new("a")).unwrap().unwrap();
        assert!(before.last_heartbeat.is_none());

        reg.record_heartbeat(&AgentId::new("a")).unwrap();

        let after = reg.get_agent(&AgentId::new("a")).unwrap().unwrap();
        assert!(after.last_heartbeat.is_some());
    }

    #[test]
    fn list_agents_all() {
        let reg = AgentRegistry::in_memory().unwrap();
        reg.register_agent(&make_record("a", AgentRole::Coder)).unwrap();
        reg.register_agent(&make_record("b", AgentRole::Tester)).unwrap();
        reg.register_agent(&make_record("c", AgentRole::Reviewer)).unwrap();

        let all = reg.list_agents(None).unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn list_agents_by_status() {
        let reg = AgentRegistry::in_memory().unwrap();
        reg.register_agent(&make_record("a", AgentRole::Coder)).unwrap();
        let mut b = make_record("b", AgentRole::Tester);
        b.status = AgentStatus::Offline;
        reg.register_agent(&b).unwrap();

        let online = reg.list_agents(Some(AgentStatus::Online)).unwrap();
        assert_eq!(online.len(), 1);
        assert_eq!(online[0].id.0, "a");

        let offline = reg.list_agents(Some(AgentStatus::Offline)).unwrap();
        assert_eq!(offline.len(), 1);
        assert_eq!(offline[0].id.0, "b");
    }

    #[test]
    fn agents_by_role() {
        let reg = AgentRegistry::in_memory().unwrap();
        reg.register_agent(&make_record("c1", AgentRole::Coder)).unwrap();
        reg.register_agent(&make_record("c2", AgentRole::Coder)).unwrap();
        reg.register_agent(&make_record("t1", AgentRole::Tester)).unwrap();

        let coders = reg.agents_by_role(&AgentRole::Coder).unwrap();
        assert_eq!(coders.len(), 2);
    }

    #[test]
    fn agents_by_team() {
        let reg = AgentRegistry::in_memory().unwrap();
        let mut rec_a = make_record("a", AgentRole::Coder);
        rec_a.team = Some(TeamId::new("alpha"));
        let mut rec_b = make_record("b", AgentRole::Tester);
        rec_b.team = Some(TeamId::new("alpha"));
        let rec_c = make_record("c", AgentRole::Reviewer); // no team

        reg.register_agent(&rec_a).unwrap();
        reg.register_agent(&rec_b).unwrap();
        reg.register_agent(&rec_c).unwrap();

        let alpha = reg.agents_by_team(&TeamId::new("alpha")).unwrap();
        assert_eq!(alpha.len(), 2);
    }

    #[test]
    fn get_nonexistent_returns_none() {
        let reg = AgentRegistry::in_memory().unwrap();
        assert!(reg.get_agent(&AgentId::new("ghost")).unwrap().is_none());
    }
}
