//! AuditLog — Persistent audit trail for all autonomous actions.
//!
//! Records every autonomous operation with timestamp, action type, outcome,
//! and details. Uses SQLite for persistence (following the ExperienceStore pattern).

use anyhow::{Context, Result};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::Path;
use uuid::Uuid;

/// The outcome of an audited action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionOutcome {
    Success,
    Failure,
    Skipped,
    Blocked,
}

impl std::fmt::Display for ActionOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionOutcome::Success => write!(f, "success"),
            ActionOutcome::Failure => write!(f, "failure"),
            ActionOutcome::Skipped => write!(f, "skipped"),
            ActionOutcome::Blocked => write!(f, "blocked"),
        }
    }
}

impl ActionOutcome {
    pub fn from_str(s: &str) -> Self {
        match s {
            "success" => ActionOutcome::Success,
            "failure" => ActionOutcome::Failure,
            "skipped" => ActionOutcome::Skipped,
            "blocked" => ActionOutcome::Blocked,
            _ => ActionOutcome::Failure,
        }
    }
}

/// A single audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    /// Unique identifier.
    pub entry_id: String,
    /// The type of action (e.g., "create_branch", "merge", "release").
    pub action_type: String,
    /// Human-readable description of what happened.
    pub description: String,
    /// The outcome of the action.
    pub outcome: ActionOutcome,
    /// Additional details (JSON-serializable).
    pub details: String,
    /// Which component initiated the action.
    pub source: String,
    /// When the action occurred.
    pub timestamp: DateTime<Utc>,
    /// Duration of the action in milliseconds (if applicable).
    pub duration_ms: Option<u64>,
    /// Error message (if outcome is Failure).
    pub error: Option<String>,
}

impl AuditEntry {
    /// Create a new audit entry.
    pub fn new(
        action_type: impl Into<String>,
        description: impl Into<String>,
        outcome: ActionOutcome,
        source: impl Into<String>,
    ) -> Self {
        Self {
            entry_id: Uuid::new_v4().to_string(),
            action_type: action_type.into(),
            description: description.into(),
            outcome,
            details: String::new(),
            source: source.into(),
            timestamp: Utc::now(),
            duration_ms: None,
            error: None,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = details.into();
        self
    }

    pub fn with_duration(mut self, ms: u64) -> Self {
        self.duration_ms = Some(ms);
        self
    }

    pub fn with_error(mut self, error: impl Into<String>) -> Self {
        self.error = Some(error.into());
        self
    }
}

/// SQLite-backed audit log.
pub struct AuditLog {
    pool: Pool<Sqlite>,
}

impl AuditLog {
    /// Create a new audit log with the given database path.
    pub async fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();

        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        if !path.exists() {
            std::fs::File::create(path)?;
        }

        let database_url = format!("sqlite:{}", path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .with_context(|| format!("Failed to connect to audit log at {:?}", path))?;

        let log = Self { pool };
        log.init_schema().await?;
        Ok(log)
    }

    /// Create an in-memory audit log (for testing).
    pub async fn in_memory() -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;

        let log = Self { pool };
        log.init_schema().await?;
        Ok(log)
    }

    /// Initialize the database schema.
    async fn init_schema(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS audit_entries (
                entry_id TEXT PRIMARY KEY,
                action_type TEXT NOT NULL,
                description TEXT NOT NULL,
                outcome TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                duration_ms INTEGER,
                error TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_audit_action_type
                ON audit_entries(action_type)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp
                ON audit_entries(timestamp DESC)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_audit_outcome
                ON audit_entries(outcome)
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Record a new audit entry.
    pub async fn record(&self, entry: &AuditEntry) -> Result<()> {
        let timestamp = entry.timestamp.timestamp();
        let duration = entry.duration_ms.map(|d| d as i64);

        sqlx::query(
            r#"
            INSERT INTO audit_entries
                (entry_id, action_type, description, outcome, details,
                 source, timestamp, duration_ms, error)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&entry.entry_id)
        .bind(&entry.action_type)
        .bind(&entry.description)
        .bind(entry.outcome.to_string())
        .bind(&entry.details)
        .bind(&entry.source)
        .bind(timestamp)
        .bind(duration)
        .bind(&entry.error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Record a success action (convenience).
    pub async fn record_success(
        &self,
        action_type: &str,
        description: &str,
        source: &str,
    ) -> Result<String> {
        let entry = AuditEntry::new(action_type, description, ActionOutcome::Success, source);
        let id = entry.entry_id.clone();
        self.record(&entry).await?;
        Ok(id)
    }

    /// Record a failure action (convenience).
    pub async fn record_failure(
        &self,
        action_type: &str,
        description: &str,
        source: &str,
        error: &str,
    ) -> Result<String> {
        let entry =
            AuditEntry::new(action_type, description, ActionOutcome::Failure, source)
                .with_error(error);
        let id = entry.entry_id.clone();
        self.record(&entry).await?;
        Ok(id)
    }

    /// Get recent audit entries.
    pub async fn recent(&self, limit: usize) -> Result<Vec<AuditEntry>> {
        let rows = sqlx::query(&format!(
            "SELECT * FROM audit_entries ORDER BY timestamp DESC, rowid DESC LIMIT {}",
            limit
        ))
        .fetch_all(&self.pool)
        .await?;

        let mut entries = Vec::with_capacity(rows.len());
        for row in rows {
            entries.push(self.row_to_entry(&row)?);
        }
        Ok(entries)
    }

    /// Get entries filtered by action type.
    pub async fn by_action_type(&self, action_type: &str, limit: usize) -> Result<Vec<AuditEntry>> {
        let rows = sqlx::query(&format!(
            "SELECT * FROM audit_entries WHERE action_type = ?1 ORDER BY timestamp DESC LIMIT {}",
            limit
        ))
        .bind(action_type)
        .fetch_all(&self.pool)
        .await?;

        let mut entries = Vec::with_capacity(rows.len());
        for row in rows {
            entries.push(self.row_to_entry(&row)?);
        }
        Ok(entries)
    }

    /// Get entries filtered by outcome.
    pub async fn by_outcome(&self, outcome: &ActionOutcome, limit: usize) -> Result<Vec<AuditEntry>> {
        let rows = sqlx::query(&format!(
            "SELECT * FROM audit_entries WHERE outcome = ?1 ORDER BY timestamp DESC LIMIT {}",
            limit
        ))
        .bind(outcome.to_string())
        .fetch_all(&self.pool)
        .await?;

        let mut entries = Vec::with_capacity(rows.len());
        for row in rows {
            entries.push(self.row_to_entry(&row)?);
        }
        Ok(entries)
    }

    /// Count total entries.
    pub async fn count(&self) -> Result<usize> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM audit_entries")
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("cnt");
        Ok(count as usize)
    }

    /// Count entries by outcome.
    pub async fn count_by_outcome(&self, outcome: &ActionOutcome) -> Result<usize> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM audit_entries WHERE outcome = ?1")
            .bind(outcome.to_string())
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("cnt");
        Ok(count as usize)
    }

    /// Clear all entries.
    pub async fn clear(&self) -> Result<usize> {
        let result = sqlx::query("DELETE FROM audit_entries")
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() as usize)
    }

    /// Convert a database row to an AuditEntry.
    fn row_to_entry(&self, row: &sqlx::sqlite::SqliteRow) -> Result<AuditEntry> {
        let timestamp: i64 = row.get("timestamp");
        let duration_ms: Option<i64> = row.get("duration_ms");
        let outcome_str: String = row.get("outcome");

        Ok(AuditEntry {
            entry_id: row.get("entry_id"),
            action_type: row.get("action_type"),
            description: row.get("description"),
            outcome: ActionOutcome::from_str(&outcome_str),
            details: row.get("details"),
            source: row.get("source"),
            timestamp: Utc
                .timestamp_opt(timestamp, 0)
                .single()
                .unwrap_or_else(Utc::now),
            duration_ms: duration_ms.map(|d| d as u64),
            error: row.get("error"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_record_and_count() {
        let log = AuditLog::in_memory().await.unwrap();
        assert_eq!(log.count().await.unwrap(), 0);

        let entry = AuditEntry::new(
            "create_branch",
            "Created branch feat/test",
            ActionOutcome::Success,
            "branch_manager",
        );
        log.record(&entry).await.unwrap();
        assert_eq!(log.count().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_record_success_convenience() {
        let log = AuditLog::in_memory().await.unwrap();
        let id = log
            .record_success("merge", "Merged feat/test into main", "branch_manager")
            .await
            .unwrap();
        assert!(!id.is_empty());
        assert_eq!(log.count().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_record_failure_convenience() {
        let log = AuditLog::in_memory().await.unwrap();
        let id = log
            .record_failure(
                "create_pr",
                "Failed to create PR",
                "branch_manager",
                "Authentication error",
            )
            .await
            .unwrap();
        assert!(!id.is_empty());

        let entries = log.recent(10).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].outcome, ActionOutcome::Failure);
        assert_eq!(entries[0].error.as_deref(), Some("Authentication error"));
    }

    #[tokio::test]
    async fn test_recent_entries() {
        let log = AuditLog::in_memory().await.unwrap();

        for i in 0..5 {
            let entry = AuditEntry::new(
                "action",
                format!("Action {}", i),
                ActionOutcome::Success,
                "test",
            );
            log.record(&entry).await.unwrap();
        }

        let recent = log.recent(3).await.unwrap();
        assert_eq!(recent.len(), 3);
    }

    #[tokio::test]
    async fn test_filter_by_action_type() {
        let log = AuditLog::in_memory().await.unwrap();

        log.record_success("branch", "Created branch", "bm").await.unwrap();
        log.record_success("merge", "Merged branch", "bm").await.unwrap();
        log.record_success("branch", "Created another branch", "bm")
            .await
            .unwrap();

        let branch_entries = log.by_action_type("branch", 10).await.unwrap();
        assert_eq!(branch_entries.len(), 2);
        assert!(branch_entries.iter().all(|e| e.action_type == "branch"));
    }

    #[tokio::test]
    async fn test_filter_by_outcome() {
        let log = AuditLog::in_memory().await.unwrap();

        log.record_success("action", "Success 1", "test").await.unwrap();
        log.record_failure("action", "Fail 1", "test", "err").await.unwrap();
        log.record_success("action", "Success 2", "test").await.unwrap();

        let failures = log.by_outcome(&ActionOutcome::Failure, 10).await.unwrap();
        assert_eq!(failures.len(), 1);

        let successes = log.by_outcome(&ActionOutcome::Success, 10).await.unwrap();
        assert_eq!(successes.len(), 2);
    }

    #[tokio::test]
    async fn test_count_by_outcome() {
        let log = AuditLog::in_memory().await.unwrap();

        log.record_success("a", "s1", "t").await.unwrap();
        log.record_success("a", "s2", "t").await.unwrap();
        log.record_failure("a", "f1", "t", "e").await.unwrap();

        assert_eq!(log.count_by_outcome(&ActionOutcome::Success).await.unwrap(), 2);
        assert_eq!(log.count_by_outcome(&ActionOutcome::Failure).await.unwrap(), 1);
        assert_eq!(log.count_by_outcome(&ActionOutcome::Skipped).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn test_entry_with_details_and_duration() {
        let log = AuditLog::in_memory().await.unwrap();

        let entry = AuditEntry::new("release", "Created v1.0.0", ActionOutcome::Success, "release_manager")
            .with_details("{\"tag\": \"v1.0.0\"}")
            .with_duration(5000);
        log.record(&entry).await.unwrap();

        let recent = log.recent(1).await.unwrap();
        assert_eq!(recent[0].details, "{\"tag\": \"v1.0.0\"}");
        assert_eq!(recent[0].duration_ms, Some(5000));
    }

    #[tokio::test]
    async fn test_clear() {
        let log = AuditLog::in_memory().await.unwrap();

        for _ in 0..5 {
            log.record_success("a", "d", "s").await.unwrap();
        }
        assert_eq!(log.count().await.unwrap(), 5);

        let deleted = log.clear().await.unwrap();
        assert_eq!(deleted, 5);
        assert_eq!(log.count().await.unwrap(), 0);
    }

    #[test]
    fn test_action_outcome_display() {
        assert_eq!(ActionOutcome::Success.to_string(), "success");
        assert_eq!(ActionOutcome::Failure.to_string(), "failure");
        assert_eq!(ActionOutcome::Skipped.to_string(), "skipped");
        assert_eq!(ActionOutcome::Blocked.to_string(), "blocked");
    }

    #[test]
    fn test_action_outcome_from_str() {
        assert_eq!(ActionOutcome::from_str("success"), ActionOutcome::Success);
        assert_eq!(ActionOutcome::from_str("failure"), ActionOutcome::Failure);
        assert_eq!(ActionOutcome::from_str("unknown"), ActionOutcome::Failure);
    }
}
