//! SQLite-backed persistent state store.
//!
//! Stores the task queue, agent lifecycle states, and pending messages so that
//! the conductor can survive crashes and pick up where it left off.
//!
//! Uses WAL mode for crash-safe writes and concurrent readers.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use crate::config::StoreConfig;

/// Errors originating from the state store.
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("failed to create database directory: {0}")]
    Io(#[from] std::io::Error),
}

/// A queued task persisted across restarts.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[allow(dead_code)]
pub struct TaskRecord {
    pub id: String,
    pub kind: String,
    pub payload: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Snapshot of an agent's lifecycle state.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[allow(dead_code)]
pub struct AgentState {
    pub agent_id: String,
    pub status: String,
    pub pid: Option<i64>,
    pub last_health: Option<String>,
    pub updated_at: String,
}

/// A message queued for delivery to an offline agent.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PendingMessage {
    pub id: String,
    pub topic: String,
    pub sender: String,
    pub recipient: String,
    pub payload: String,
    pub created_at: String,
}

/// The persistent state store.
pub struct StateStore {
    pool: SqlitePool,
}

impl StateStore {
    /// Open (or create) the SQLite database and run migrations.
    pub async fn open(config: &StoreConfig) -> Result<Self, StoreError> {
        // Ensure parent directory exists.
        if let Some(parent) = config.db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let opts = SqliteConnectOptions::new()
            .filename(&config.db_path)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(opts)
            .await?;

        let store = Self { pool };
        store.migrate().await?;
        Ok(store)
    }

    /// Open an in-memory store (useful for tests).
    #[allow(dead_code)]
    pub async fn open_memory() -> Result<Self, StoreError> {
        let opts = SqliteConnectOptions::new()
            .filename(":memory:")
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await?;

        let store = Self { pool };
        store.migrate().await?;
        Ok(store)
    }

    /// Run the schema migrations.
    async fn migrate(&self) -> Result<(), StoreError> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS tasks (
                id          TEXT PRIMARY KEY,
                kind        TEXT NOT NULL,
                payload     TEXT NOT NULL DEFAULT '{}',
                status      TEXT NOT NULL DEFAULT 'pending',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS agent_states (
                agent_id    TEXT PRIMARY KEY,
                status      TEXT NOT NULL DEFAULT 'stopped',
                pid         INTEGER,
                last_health TEXT,
                updated_at  TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS pending_messages (
                id          TEXT PRIMARY KEY,
                topic       TEXT NOT NULL,
                sender      TEXT NOT NULL,
                recipient   TEXT NOT NULL,
                payload     TEXT NOT NULL DEFAULT '{}',
                created_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_pending_messages_recipient
                ON pending_messages(recipient);
            CREATE INDEX IF NOT EXISTS idx_pending_messages_topic
                ON pending_messages(topic);
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ----- Tasks -----

    /// Insert a new task.
    #[allow(dead_code)]
    pub async fn insert_task(&self, kind: &str, payload: &str) -> Result<String, StoreError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO tasks (id, kind, payload, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
            .bind(&id)
            .bind(kind)
            .bind(payload)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        Ok(id)
    }

    /// Update a task's status.
    #[allow(dead_code)]
    pub async fn update_task_status(&self, id: &str, status: &str) -> Result<(), StoreError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// List tasks with a given status.
    #[allow(dead_code)]
    pub async fn list_tasks(&self, status: &str) -> Result<Vec<TaskRecord>, StoreError> {
        let rows = sqlx::query_as::<_, TaskRecord>(
            "SELECT id, kind, payload, status, created_at, updated_at FROM tasks WHERE status = ? ORDER BY created_at",
        )
        .bind(status)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    // ----- Agent States -----

    /// Upsert an agent state record.
    pub async fn upsert_agent_state(
        &self,
        agent_id: &str,
        status: &str,
        pid: Option<u32>,
    ) -> Result<(), StoreError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO agent_states (agent_id, status, pid, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET
                status = excluded.status,
                pid = excluded.pid,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(agent_id)
        .bind(status)
        .bind(pid.map(|p| p as i64))
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Record a successful health check.
    pub async fn record_health(&self, agent_id: &str) -> Result<(), StoreError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE agent_states SET last_health = ?, updated_at = ? WHERE agent_id = ?")
            .bind(&now)
            .bind(&now)
            .bind(agent_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Get a single agent state.
    #[allow(dead_code)]
    pub async fn get_agent_state(&self, agent_id: &str) -> Result<Option<AgentState>, StoreError> {
        let row = sqlx::query_as::<_, AgentState>(
            "SELECT agent_id, status, pid, last_health, updated_at FROM agent_states WHERE agent_id = ?",
        )
        .bind(agent_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// List all agent states.
    #[allow(dead_code)]
    pub async fn list_agent_states(&self) -> Result<Vec<AgentState>, StoreError> {
        let rows = sqlx::query_as::<_, AgentState>(
            "SELECT agent_id, status, pid, last_health, updated_at FROM agent_states ORDER BY agent_id",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    // ----- Pending Messages -----

    /// Queue a message for later delivery.
    pub async fn queue_message(
        &self,
        topic: &str,
        sender: &str,
        recipient: &str,
        payload: &str,
    ) -> Result<String, StoreError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO pending_messages (id, topic, sender, recipient, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(topic)
        .bind(sender)
        .bind(recipient)
        .bind(payload)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    /// Drain all pending messages for a recipient (called on agent wake-up).
    pub async fn drain_messages(
        &self,
        recipient: &str,
    ) -> Result<Vec<PendingMessage>, StoreError> {
        let rows = sqlx::query_as::<_, PendingMessage>(
            "SELECT id, topic, sender, recipient, payload, created_at FROM pending_messages WHERE recipient = ? ORDER BY created_at",
        )
        .bind(recipient)
        .fetch_all(&self.pool)
        .await?;

        // Delete them now that they've been read.
        sqlx::query("DELETE FROM pending_messages WHERE recipient = ?")
            .bind(recipient)
            .execute(&self.pool)
            .await?;

        Ok(rows)
    }

    /// Count pending messages for a recipient.
    #[allow(dead_code)]
    pub async fn count_pending(&self, recipient: &str) -> Result<i64, StoreError> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM pending_messages WHERE recipient = ?")
                .bind(recipient)
                .fetch_one(&self.pool)
                .await?;
        Ok(row.0)
    }

    /// Get reference to the underlying pool (for advanced queries in tests).
    #[allow(dead_code)]
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
