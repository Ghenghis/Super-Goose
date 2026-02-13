//! TimeWarpEventStore -- SQLite-backed event store for TimeWarp timeline events.
//!
//! Stores session events (messages, tool calls, edits, checkpoints, etc.) and branches
//! to enable Fusion 360-style time-travel through AI sessions. Each session can have
//! multiple branches forked from any event, with exactly one active branch at a time.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// A single event in the TimeWarp timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeWarpEvent {
    /// Unique identifier for this event.
    pub id: String,
    /// Session this event belongs to.
    pub session_id: String,
    /// Branch this event is on.
    pub branch_id: String,
    /// Type of event: "message", "tool_call", "edit", "checkpoint", "branch_point", "error", "milestone".
    pub event_type: String,
    /// Short human-readable label for display.
    pub label: String,
    /// Longer description or content of the event.
    pub detail: String,
    /// Optional agent identifier (for multi-agent sessions).
    pub agent_id: Option<String>,
    /// ISO 8601 timestamp.
    pub timestamp: String,
    /// Optional JSON string for extra data (tool params, diff content, etc.).
    pub metadata: Option<String>,
}

/// A branch in the TimeWarp timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeWarpBranch {
    /// Unique identifier for this branch.
    pub id: String,
    /// Session this branch belongs to.
    pub session_id: String,
    /// Human-readable name (e.g. "main", "try-alternative-approach").
    pub name: String,
    /// The branch this was forked from, if any.
    pub parent_branch_id: Option<String>,
    /// The event at which this branch was forked, if any.
    pub fork_event_id: Option<String>,
    /// ISO 8601 timestamp of branch creation.
    pub created_at: String,
    /// Whether this is the currently active branch for its session.
    pub is_active: bool,
}

/// Aggregate statistics for a TimeWarp session.
#[derive(Debug, Serialize)]
pub struct TimeWarpStats {
    /// Total number of events across all branches.
    pub total_events: u64,
    /// Total number of branches.
    pub total_branches: u64,
    /// Count of events grouped by event_type.
    pub events_by_type: HashMap<String, u64>,
}

/// SQLite-backed event store for TimeWarp timeline data.
///
/// Uses a persistent connection behind a Mutex for thread safety.
/// For file-backed databases the path is stored for reference; for in-memory
/// databases the single connection is the sole handle to the data.
pub struct TimeWarpEventStore {
    #[allow(dead_code)]
    db_path: String,
    conn: Mutex<Connection>,
}

impl TimeWarpEventStore {
    /// Create a new TimeWarpEventStore backed by the given SQLite database file.
    /// Creates tables if they do not already exist.
    pub fn new(db_path: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        let store = Self {
            db_path: db_path.to_string(),
            conn: Mutex::new(conn),
        };
        store.init_schema()?;
        Ok(store)
    }

    /// Create an in-memory store (for testing).
    pub fn in_memory() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let conn = Connection::open_in_memory()?;
        let store = Self {
            db_path: ":memory:".to_string(),
            conn: Mutex::new(conn),
        };
        store.init_schema()?;
        Ok(store)
    }

    /// Initialize the database schema (idempotent).
    fn init_schema(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS timewarp_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                label TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                agent_id TEXT,
                timestamp TEXT NOT NULL,
                metadata TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tw_events_session
                ON timewarp_events(session_id, branch_id);

            CREATE TABLE IF NOT EXISTS timewarp_branches (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                parent_branch_id TEXT,
                fork_event_id TEXT,
                created_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_tw_branches_session
                ON timewarp_branches(session_id);
            "#,
        )?;
        Ok(())
    }

    // ---- Event operations ----

    /// Record a new event.
    pub fn record_event(
        &self,
        event: &TimeWarpEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        conn.execute(
            r#"INSERT INTO timewarp_events
                (id, session_id, branch_id, event_type, label, detail, agent_id, timestamp, metadata)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
            params![
                event.id,
                event.session_id,
                event.branch_id,
                event.event_type,
                event.label,
                event.detail,
                event.agent_id,
                event.timestamp,
                event.metadata,
            ],
        )?;
        Ok(())
    }

    /// Retrieve events for a session, optionally filtered by branch, with pagination.
    pub fn get_events(
        &self,
        session_id: &str,
        branch_id: Option<&str>,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<Vec<TimeWarpEvent>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        let limit_val = limit.unwrap_or(1000);
        let offset_val = offset.unwrap_or(0);

        let mut events = Vec::new();

        if let Some(bid) = branch_id {
            let mut stmt = conn.prepare(
                r#"SELECT id, session_id, branch_id, event_type, label, detail, agent_id, timestamp, metadata
                   FROM timewarp_events
                   WHERE session_id = ?1 AND branch_id = ?2
                   ORDER BY timestamp ASC
                   LIMIT ?3 OFFSET ?4"#,
            )?;
            let rows = stmt.query_map(params![session_id, bid, limit_val, offset_val], |row| {
                Ok(TimeWarpEvent {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    branch_id: row.get(2)?,
                    event_type: row.get(3)?,
                    label: row.get(4)?,
                    detail: row.get(5)?,
                    agent_id: row.get(6)?,
                    timestamp: row.get(7)?,
                    metadata: row.get(8)?,
                })
            })?;
            for row in rows {
                events.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                r#"SELECT id, session_id, branch_id, event_type, label, detail, agent_id, timestamp, metadata
                   FROM timewarp_events
                   WHERE session_id = ?1
                   ORDER BY timestamp ASC
                   LIMIT ?2 OFFSET ?3"#,
            )?;
            let rows =
                stmt.query_map(params![session_id, limit_val, offset_val], |row| {
                    Ok(TimeWarpEvent {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        branch_id: row.get(2)?,
                        event_type: row.get(3)?,
                        label: row.get(4)?,
                        detail: row.get(5)?,
                        agent_id: row.get(6)?,
                        timestamp: row.get(7)?,
                        metadata: row.get(8)?,
                    })
                })?;
            for row in rows {
                events.push(row?);
            }
        }

        Ok(events)
    }

    /// Retrieve a single event by its ID.
    pub fn get_event(
        &self,
        event_id: &str,
    ) -> Result<Option<TimeWarpEvent>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        let mut stmt = conn.prepare(
            r#"SELECT id, session_id, branch_id, event_type, label, detail, agent_id, timestamp, metadata
               FROM timewarp_events
               WHERE id = ?1"#,
        )?;
        let mut rows = stmt.query_map(params![event_id], |row| {
            Ok(TimeWarpEvent {
                id: row.get(0)?,
                session_id: row.get(1)?,
                branch_id: row.get(2)?,
                event_type: row.get(3)?,
                label: row.get(4)?,
                detail: row.get(5)?,
                agent_id: row.get(6)?,
                timestamp: row.get(7)?,
                metadata: row.get(8)?,
            })
        })?;
        match rows.next() {
            Some(Ok(event)) => Ok(Some(event)),
            Some(Err(e)) => Err(Box::new(e)),
            None => Ok(None),
        }
    }

    /// Delete an event by its ID. Returns true if a row was deleted.
    pub fn delete_event(
        &self,
        event_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        let deleted = conn.execute(
            "DELETE FROM timewarp_events WHERE id = ?1",
            params![event_id],
        )?;
        Ok(deleted > 0)
    }

    // ---- Branch operations ----

    /// Create a new branch.
    pub fn create_branch(
        &self,
        branch: &TimeWarpBranch,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        conn.execute(
            r#"INSERT INTO timewarp_branches
                (id, session_id, name, parent_branch_id, fork_event_id, created_at, is_active)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
            params![
                branch.id,
                branch.session_id,
                branch.name,
                branch.parent_branch_id,
                branch.fork_event_id,
                branch.created_at,
                branch.is_active as i32,
            ],
        )?;
        Ok(())
    }

    /// Get all branches for a session.
    pub fn get_branches(
        &self,
        session_id: &str,
    ) -> Result<Vec<TimeWarpBranch>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        let mut stmt = conn.prepare(
            r#"SELECT id, session_id, name, parent_branch_id, fork_event_id, created_at, is_active
               FROM timewarp_branches
               WHERE session_id = ?1
               ORDER BY created_at ASC"#,
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let is_active_int: i32 = row.get(6)?;
            Ok(TimeWarpBranch {
                id: row.get(0)?,
                session_id: row.get(1)?,
                name: row.get(2)?,
                parent_branch_id: row.get(3)?,
                fork_event_id: row.get(4)?,
                created_at: row.get(5)?,
                is_active: is_active_int != 0,
            })
        })?;
        let mut branches = Vec::new();
        for row in rows {
            branches.push(row?);
        }
        Ok(branches)
    }

    /// Set the active branch for a session. Deactivates all other branches in the session first.
    pub fn set_active_branch(
        &self,
        session_id: &str,
        branch_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;
        // Deactivate all branches in this session.
        conn.execute(
            "UPDATE timewarp_branches SET is_active = 0 WHERE session_id = ?1",
            params![session_id],
        )?;
        // Activate the target branch.
        conn.execute(
            "UPDATE timewarp_branches SET is_active = 1 WHERE id = ?1 AND session_id = ?2",
            params![branch_id, session_id],
        )?;
        Ok(())
    }

    // ---- Statistics ----

    /// Get aggregate statistics for a session.
    pub fn get_stats(
        &self,
        session_id: &str,
    ) -> Result<TimeWarpStats, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().map_err(|e| format!("lock poisoned: {}", e))?;

        let total_events: u64 = conn.query_row(
            "SELECT COUNT(*) FROM timewarp_events WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;

        let total_branches: u64 = conn.query_row(
            "SELECT COUNT(*) FROM timewarp_branches WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;

        let mut stmt = conn.prepare(
            "SELECT event_type, COUNT(*) FROM timewarp_events WHERE session_id = ?1 GROUP BY event_type",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let event_type: String = row.get(0)?;
            let count: u64 = row.get(1)?;
            Ok((event_type, count))
        })?;
        let mut events_by_type = HashMap::new();
        for row in rows {
            let (event_type, count) = row?;
            events_by_type.insert(event_type, count);
        }

        Ok(TimeWarpStats {
            total_events,
            total_branches,
            events_by_type,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a test event with sensible defaults.
    fn make_event(id: &str, session: &str, branch: &str, event_type: &str, label: &str) -> TimeWarpEvent {
        TimeWarpEvent {
            id: id.to_string(),
            session_id: session.to_string(),
            branch_id: branch.to_string(),
            event_type: event_type.to_string(),
            label: label.to_string(),
            detail: String::new(),
            agent_id: None,
            timestamp: format!("2026-02-12T00:00:0{}Z", id.chars().last().unwrap_or('0')),
            metadata: None,
        }
    }

    /// Helper: create a test branch.
    fn make_branch(id: &str, session: &str, name: &str, active: bool) -> TimeWarpBranch {
        TimeWarpBranch {
            id: id.to_string(),
            session_id: session.to_string(),
            name: name.to_string(),
            parent_branch_id: None,
            fork_event_id: None,
            created_at: "2026-02-12T00:00:00Z".to_string(),
            is_active: active,
        }
    }

    #[test]
    fn test_create_store() {
        let store = TimeWarpEventStore::in_memory().unwrap();
        // Verify tables exist by running queries that would fail if tables are missing.
        let events = store.get_events("nonexistent", None, None, None).unwrap();
        assert!(events.is_empty());
        let branches = store.get_branches("nonexistent").unwrap();
        assert!(branches.is_empty());
    }

    #[test]
    fn test_record_and_get_event() {
        let store = TimeWarpEventStore::in_memory().unwrap();
        let event = TimeWarpEvent {
            id: "evt-1".to_string(),
            session_id: "sess-1".to_string(),
            branch_id: "branch-main".to_string(),
            event_type: "message".to_string(),
            label: "User greeting".to_string(),
            detail: "Hello, how can you help?".to_string(),
            agent_id: Some("agent-0".to_string()),
            timestamp: "2026-02-12T10:00:00Z".to_string(),
            metadata: Some(r#"{"role":"user"}"#.to_string()),
        };

        store.record_event(&event).unwrap();

        // Retrieve by ID.
        let loaded = store.get_event("evt-1").unwrap().expect("event should exist");
        assert_eq!(loaded.id, "evt-1");
        assert_eq!(loaded.session_id, "sess-1");
        assert_eq!(loaded.branch_id, "branch-main");
        assert_eq!(loaded.event_type, "message");
        assert_eq!(loaded.label, "User greeting");
        assert_eq!(loaded.detail, "Hello, how can you help?");
        assert_eq!(loaded.agent_id.as_deref(), Some("agent-0"));
        assert_eq!(loaded.timestamp, "2026-02-12T10:00:00Z");
        assert_eq!(loaded.metadata.as_deref(), Some(r#"{"role":"user"}"#));

        // Non-existent ID returns None.
        assert!(store.get_event("nonexistent").unwrap().is_none());
    }

    #[test]
    fn test_get_events_filtered() {
        let store = TimeWarpEventStore::in_memory().unwrap();

        // Session 1, branch A.
        store.record_event(&make_event("e1", "s1", "brA", "message", "msg1")).unwrap();
        store.record_event(&make_event("e2", "s1", "brA", "tool_call", "tool1")).unwrap();
        // Session 1, branch B.
        store.record_event(&make_event("e3", "s1", "brB", "edit", "edit1")).unwrap();
        // Session 2.
        store.record_event(&make_event("e4", "s2", "brC", "message", "msg2")).unwrap();

        // All events for session 1 (both branches).
        let all_s1 = store.get_events("s1", None, None, None).unwrap();
        assert_eq!(all_s1.len(), 3);

        // Events for session 1, branch A only.
        let s1_br_a = store.get_events("s1", Some("brA"), None, None).unwrap();
        assert_eq!(s1_br_a.len(), 2);
        assert!(s1_br_a.iter().all(|e| e.branch_id == "brA"));

        // Events for session 2.
        let all_s2 = store.get_events("s2", None, None, None).unwrap();
        assert_eq!(all_s2.len(), 1);
        assert_eq!(all_s2[0].id, "e4");
    }

    #[test]
    fn test_get_events_paginated() {
        let store = TimeWarpEventStore::in_memory().unwrap();

        // Insert 5 events with increasing timestamps.
        for i in 1..=5 {
            let event = TimeWarpEvent {
                id: format!("evt-{}", i),
                session_id: "s1".to_string(),
                branch_id: "br1".to_string(),
                event_type: "message".to_string(),
                label: format!("Event {}", i),
                detail: String::new(),
                agent_id: None,
                timestamp: format!("2026-02-12T10:00:{:02}Z", i),
                metadata: None,
            };
            store.record_event(&event).unwrap();
        }

        // Page 1: limit 2, offset 0.
        let page1 = store.get_events("s1", None, Some(2), Some(0)).unwrap();
        assert_eq!(page1.len(), 2);
        assert_eq!(page1[0].id, "evt-1");
        assert_eq!(page1[1].id, "evt-2");

        // Page 2: limit 2, offset 2.
        let page2 = store.get_events("s1", None, Some(2), Some(2)).unwrap();
        assert_eq!(page2.len(), 2);
        assert_eq!(page2[0].id, "evt-3");
        assert_eq!(page2[1].id, "evt-4");

        // Page 3: limit 2, offset 4.
        let page3 = store.get_events("s1", None, Some(2), Some(4)).unwrap();
        assert_eq!(page3.len(), 1);
        assert_eq!(page3[0].id, "evt-5");

        // Beyond end: limit 2, offset 10.
        let page_empty = store.get_events("s1", None, Some(2), Some(10)).unwrap();
        assert!(page_empty.is_empty());
    }

    #[test]
    fn test_delete_event() {
        let store = TimeWarpEventStore::in_memory().unwrap();

        store.record_event(&make_event("e1", "s1", "br1", "message", "msg")).unwrap();
        store.record_event(&make_event("e2", "s1", "br1", "edit", "edt")).unwrap();

        assert!(store.get_event("e1").unwrap().is_some());

        // Delete e1.
        let deleted = store.delete_event("e1").unwrap();
        assert!(deleted);

        // Verify gone.
        assert!(store.get_event("e1").unwrap().is_none());

        // e2 still present.
        assert!(store.get_event("e2").unwrap().is_some());

        // Deleting non-existent returns false.
        let deleted_again = store.delete_event("e1").unwrap();
        assert!(!deleted_again);
    }

    #[test]
    fn test_create_and_get_branches() {
        let store = TimeWarpEventStore::in_memory().unwrap();

        let main_branch = make_branch("br-main", "s1", "main", true);
        let alt_branch = TimeWarpBranch {
            id: "br-alt".to_string(),
            session_id: "s1".to_string(),
            name: "try-alternative".to_string(),
            parent_branch_id: Some("br-main".to_string()),
            fork_event_id: Some("evt-5".to_string()),
            created_at: "2026-02-12T01:00:00Z".to_string(),
            is_active: false,
        };

        store.create_branch(&main_branch).unwrap();
        store.create_branch(&alt_branch).unwrap();

        let branches = store.get_branches("s1").unwrap();
        assert_eq!(branches.len(), 2);

        let main = branches.iter().find(|b| b.id == "br-main").unwrap();
        assert_eq!(main.name, "main");
        assert!(main.is_active);
        assert!(main.parent_branch_id.is_none());

        let alt = branches.iter().find(|b| b.id == "br-alt").unwrap();
        assert_eq!(alt.name, "try-alternative");
        assert!(!alt.is_active);
        assert_eq!(alt.parent_branch_id.as_deref(), Some("br-main"));
        assert_eq!(alt.fork_event_id.as_deref(), Some("evt-5"));

        // Different session returns empty.
        let other = store.get_branches("s2").unwrap();
        assert!(other.is_empty());
    }

    #[test]
    fn test_set_active_branch() {
        let store = TimeWarpEventStore::in_memory().unwrap();

        store.create_branch(&make_branch("br-1", "s1", "main", true)).unwrap();
        store.create_branch(&make_branch("br-2", "s1", "experiment", false)).unwrap();
        store.create_branch(&make_branch("br-3", "s1", "rollback", false)).unwrap();

        // Verify initial state: br-1 is active.
        let branches = store.get_branches("s1").unwrap();
        assert!(branches.iter().find(|b| b.id == "br-1").unwrap().is_active);
        assert!(!branches.iter().find(|b| b.id == "br-2").unwrap().is_active);
        assert!(!branches.iter().find(|b| b.id == "br-3").unwrap().is_active);

        // Switch active to br-2.
        store.set_active_branch("s1", "br-2").unwrap();
        let branches = store.get_branches("s1").unwrap();
        assert!(!branches.iter().find(|b| b.id == "br-1").unwrap().is_active);
        assert!(branches.iter().find(|b| b.id == "br-2").unwrap().is_active);
        assert!(!branches.iter().find(|b| b.id == "br-3").unwrap().is_active);

        // Switch active to br-3.
        store.set_active_branch("s1", "br-3").unwrap();
        let branches = store.get_branches("s1").unwrap();
        assert!(!branches.iter().find(|b| b.id == "br-1").unwrap().is_active);
        assert!(!branches.iter().find(|b| b.id == "br-2").unwrap().is_active);
        assert!(branches.iter().find(|b| b.id == "br-3").unwrap().is_active);
    }

    #[test]
    fn test_get_stats() {
        let store = TimeWarpEventStore::in_memory().unwrap();

        // Create branches.
        store.create_branch(&make_branch("br-1", "s1", "main", true)).unwrap();
        store.create_branch(&make_branch("br-2", "s1", "alt", false)).unwrap();

        // Create events of different types.
        store.record_event(&make_event("e1", "s1", "br-1", "message", "msg1")).unwrap();
        store.record_event(&make_event("e2", "s1", "br-1", "message", "msg2")).unwrap();
        store.record_event(&make_event("e3", "s1", "br-1", "tool_call", "tc1")).unwrap();
        store.record_event(&make_event("e4", "s1", "br-2", "edit", "ed1")).unwrap();
        store.record_event(&make_event("e5", "s1", "br-2", "checkpoint", "cp1")).unwrap();

        let stats = store.get_stats("s1").unwrap();
        assert_eq!(stats.total_events, 5);
        assert_eq!(stats.total_branches, 2);
        assert_eq!(stats.events_by_type.len(), 4);
        assert_eq!(*stats.events_by_type.get("message").unwrap(), 2);
        assert_eq!(*stats.events_by_type.get("tool_call").unwrap(), 1);
        assert_eq!(*stats.events_by_type.get("edit").unwrap(), 1);
        assert_eq!(*stats.events_by_type.get("checkpoint").unwrap(), 1);

        // Stats for empty session.
        let empty = store.get_stats("nonexistent").unwrap();
        assert_eq!(empty.total_events, 0);
        assert_eq!(empty.total_branches, 0);
        assert!(empty.events_by_type.is_empty());
    }
}
