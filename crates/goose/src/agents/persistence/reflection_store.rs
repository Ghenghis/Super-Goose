//! SQLite-based reflection storage for durable Reflexion persistence
//!
//! Persists `Reflection` objects to SQLite so they survive across restarts,
//! enabling persistent cross-session learning from past failures.

use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::Path;

use crate::agents::reflexion::{AttemptOutcome, Reflection};

/// SQLite-backed store for Reflexion reflections.
///
/// Provides durable persistence so reflections survive across restarts,
/// enabling the agent to learn from past failures across sessions.
pub struct SqliteReflectionStore {
    pool: Pool<Sqlite>,
}

impl SqliteReflectionStore {
    /// Create a new store with the given database path.
    pub async fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        // Create the database file if it doesn't exist
        if !path.exists() {
            std::fs::File::create(path)?;
        }

        let database_url = format!("sqlite:{}", path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .with_context(|| {
                format!(
                    "Failed to connect to reflection store at {:?}",
                    path
                )
            })?;

        let store = Self { pool };
        store.init_schema().await?;
        Ok(store)
    }

    /// Create an in-memory store (for testing).
    pub async fn in_memory() -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;

        let store = Self { pool };
        store.init_schema().await?;
        Ok(store)
    }

    /// Initialize the database schema.
    async fn init_schema(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS reflections (
                reflection_id TEXT PRIMARY KEY,
                task TEXT NOT NULL,
                attempt_summary TEXT NOT NULL,
                outcome TEXT NOT NULL,
                diagnosis TEXT NOT NULL DEFAULT '',
                reflection_text TEXT NOT NULL DEFAULT '',
                lessons TEXT NOT NULL DEFAULT '[]',
                improvements TEXT NOT NULL DEFAULT '[]',
                confidence REAL NOT NULL DEFAULT 1.0,
                created_at INTEGER NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]'
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Index for keyword search on task field
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_reflections_created_at
                ON reflections(created_at DESC)
            "#,
        )
        .execute(&self.pool)
        .await?;

        // FTS5 virtual table for full-text search on task + diagnosis
        // Wrapped in a try — FTS5 may not be available on all SQLite builds
        let fts_result = sqlx::query(
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS reflections_fts
            USING fts5(
                reflection_id,
                task,
                diagnosis,
                content=reflections,
                content_rowid=rowid
            )
            "#,
        )
        .execute(&self.pool)
        .await;

        if fts_result.is_err() {
            // FTS5 not available — fall back to LIKE-based search (still works)
            tracing::debug!("FTS5 not available, using LIKE-based reflection search");
        }

        Ok(())
    }

    /// Store a reflection.
    pub async fn store(&self, reflection: &Reflection) -> Result<()> {
        let lessons_json = serde_json::to_string(&reflection.lessons)?;
        let improvements_json = serde_json::to_string(&reflection.improvements)?;
        let tags_json = serde_json::to_string(&reflection.tags)?;
        let created_at = reflection.created_at.timestamp();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO reflections
                (reflection_id, task, attempt_summary, outcome, diagnosis,
                 reflection_text, lessons, improvements, confidence, created_at, tags)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(&reflection.reflection_id)
        .bind(&reflection.task)
        .bind(&reflection.attempt_summary)
        .bind(reflection.outcome.to_string())
        .bind(&reflection.diagnosis)
        .bind(&reflection.reflection_text)
        .bind(&lessons_json)
        .bind(&improvements_json)
        .bind(reflection.confidence)
        .bind(created_at)
        .bind(&tags_json)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Load all reflections, ordered by most recent first.
    pub async fn load_all(&self) -> Result<Vec<Reflection>> {
        let rows = sqlx::query(
            r#"
            SELECT reflection_id, task, attempt_summary, outcome, diagnosis,
                   reflection_text, lessons, improvements, confidence, created_at, tags
            FROM reflections
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut reflections = Vec::with_capacity(rows.len());
        for row in rows {
            reflections.push(self.row_to_reflection(&row)?);
        }
        Ok(reflections)
    }

    /// Find reflections relevant to a task using keyword matching.
    /// Returns up to `limit` results scored by keyword overlap.
    pub async fn find_relevant(&self, task: &str, limit: usize) -> Result<Vec<Reflection>> {
        // Extract keywords (words >3 chars)
        let keywords: Vec<String> = task
            .split_whitespace()
            .filter(|w| w.len() > 3)
            .map(|w| w.to_lowercase())
            .collect();

        if keywords.is_empty() {
            return Ok(Vec::new());
        }

        // Build a LIKE-based query that scores by keyword overlap
        // Each matching keyword adds 1 to the score
        let mut score_parts: Vec<String> = Vec::new();
        let mut params: Vec<String> = Vec::new();
        for kw in &keywords {
            score_parts.push(format!(
                "(CASE WHEN LOWER(task) LIKE '%' || ?{p} || '%' THEN 1 ELSE 0 END + \
                 CASE WHEN LOWER(diagnosis) LIKE '%' || ?{p} || '%' THEN 1 ELSE 0 END)",
                p = params.len() + 1
            ));
            params.push(kw.clone());
        }

        let score_expr = score_parts.join(" + ");
        let query = format!(
            "SELECT *, ({score_expr}) AS relevance_score \
             FROM reflections \
             WHERE ({score_expr}) > 0 \
             ORDER BY relevance_score DESC, created_at DESC \
             LIMIT {limit}"
        );

        // Use sqlx::query with dynamic bindings
        let mut q = sqlx::query(&query);
        // Bind parameters twice (once for SELECT, once for WHERE)
        for param in &params {
            q = q.bind(param);
        }
        for param in &params {
            q = q.bind(param);
        }

        let rows = q.fetch_all(&self.pool).await?;

        let mut reflections = Vec::with_capacity(rows.len());
        for row in rows {
            reflections.push(self.row_to_reflection(&row)?);
        }
        Ok(reflections)
    }

    /// Find reflections by tag.
    pub async fn find_by_tag(&self, tag: &str) -> Result<Vec<Reflection>> {
        let pattern = format!("%\"{}\"%" , tag);
        let rows = sqlx::query(
            r#"
            SELECT reflection_id, task, attempt_summary, outcome, diagnosis,
                   reflection_text, lessons, improvements, confidence, created_at, tags
            FROM reflections
            WHERE tags LIKE ?1
            ORDER BY created_at DESC
            "#,
        )
        .bind(&pattern)
        .fetch_all(&self.pool)
        .await?;

        let mut reflections = Vec::with_capacity(rows.len());
        for row in rows {
            reflections.push(self.row_to_reflection(&row)?);
        }
        Ok(reflections)
    }

    /// Get the count of stored reflections.
    pub async fn count(&self) -> Result<usize> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM reflections")
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("cnt");
        Ok(count as usize)
    }

    /// Delete a specific reflection.
    pub async fn delete(&self, reflection_id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM reflections WHERE reflection_id = ?1")
            .bind(reflection_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all reflections.
    pub async fn clear(&self) -> Result<usize> {
        let result = sqlx::query("DELETE FROM reflections")
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() as usize)
    }

    /// Convert a database row to a Reflection.
    fn row_to_reflection(&self, row: &sqlx::sqlite::SqliteRow) -> Result<Reflection> {
        let reflection_id: String = row.get("reflection_id");
        let task: String = row.get("task");
        let attempt_summary: String = row.get("attempt_summary");
        let outcome_str: String = row.get("outcome");
        let diagnosis: String = row.get("diagnosis");
        let reflection_text: String = row.get("reflection_text");
        let lessons_json: String = row.get("lessons");
        let improvements_json: String = row.get("improvements");
        let confidence: f64 = row.get("confidence");
        let created_at: i64 = row.get("created_at");
        let tags_json: String = row.get("tags");

        let outcome = match outcome_str.as_str() {
            "success" => AttemptOutcome::Success,
            "failure" => AttemptOutcome::Failure,
            "partial" => AttemptOutcome::Partial,
            "timeout" => AttemptOutcome::Timeout,
            "aborted" => AttemptOutcome::Aborted,
            _ => AttemptOutcome::Failure,
        };

        let lessons: Vec<String> = serde_json::from_str(&lessons_json).unwrap_or_default();
        let improvements: Vec<String> =
            serde_json::from_str(&improvements_json).unwrap_or_default();
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

        Ok(Reflection {
            reflection_id,
            task,
            attempt_summary,
            outcome,
            diagnosis,
            reflection_text,
            lessons,
            improvements,
            confidence: confidence as f32,
            created_at: Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now),
            tags,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_reflection(task: &str, outcome: AttemptOutcome) -> Reflection {
        Reflection::new(task, "some actions taken", outcome)
            .with_diagnosis("Test diagnosis")
            .with_reflection("Test reflection text")
            .with_lessons(vec!["lesson one".into(), "lesson two".into()])
            .with_improvements(vec!["improvement one".into()])
            .with_confidence(0.8)
    }

    #[tokio::test]
    async fn test_store_and_load() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();
        let r = make_reflection("Fix authentication bug", AttemptOutcome::Failure);
        store.store(&r).await.unwrap();

        let all = store.load_all().await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].task, "Fix authentication bug");
        assert_eq!(all[0].lessons.len(), 2);
        assert_eq!(all[0].improvements.len(), 1);
        assert!((all[0].confidence - 0.8).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_find_relevant() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();

        let r1 = make_reflection("Fix authentication token refresh", AttemptOutcome::Failure);
        let r2 = make_reflection("Optimize database query performance", AttemptOutcome::Partial);
        let r3 = make_reflection("Debug authentication login flow", AttemptOutcome::Failure);
        store.store(&r1).await.unwrap();
        store.store(&r2).await.unwrap();
        store.store(&r3).await.unwrap();

        let results = store.find_relevant("authentication error", 5).await.unwrap();
        assert!(!results.is_empty());
        // Both auth-related reflections should be found
        assert!(results.iter().any(|r| r.task.contains("authentication")));
    }

    #[tokio::test]
    async fn test_find_by_tag() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();

        let mut r1 = make_reflection("Task A", AttemptOutcome::Failure);
        r1.tags = vec!["auth".into(), "security".into()];
        let mut r2 = make_reflection("Task B", AttemptOutcome::Failure);
        r2.tags = vec!["database".into()];

        store.store(&r1).await.unwrap();
        store.store(&r2).await.unwrap();

        let auth = store.find_by_tag("auth").await.unwrap();
        assert_eq!(auth.len(), 1);
        assert_eq!(auth[0].task, "Task A");
    }

    #[tokio::test]
    async fn test_count_and_clear() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();

        for i in 0..5 {
            let r = make_reflection(&format!("Task {}", i), AttemptOutcome::Failure);
            store.store(&r).await.unwrap();
        }

        assert_eq!(store.count().await.unwrap(), 5);

        let deleted = store.clear().await.unwrap();
        assert_eq!(deleted, 5);
        assert_eq!(store.count().await.unwrap(), 0);
    }

    #[tokio::test]
    async fn test_delete_single() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();

        let r = make_reflection("Delete me", AttemptOutcome::Failure);
        let id = r.reflection_id.clone();
        store.store(&r).await.unwrap();
        assert_eq!(store.count().await.unwrap(), 1);

        assert!(store.delete(&id).await.unwrap());
        assert_eq!(store.count().await.unwrap(), 0);

        // Deleting non-existent returns false
        assert!(!store.delete("nonexistent").await.unwrap());
    }

    #[tokio::test]
    async fn test_outcome_roundtrip() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();

        let outcomes = vec![
            AttemptOutcome::Success,
            AttemptOutcome::Failure,
            AttemptOutcome::Partial,
            AttemptOutcome::Timeout,
            AttemptOutcome::Aborted,
        ];

        for outcome in &outcomes {
            let r = make_reflection("roundtrip test", *outcome);
            store.store(&r).await.unwrap();
        }

        let all = store.load_all().await.unwrap();
        assert_eq!(all.len(), 5);

        // Verify all outcomes survived the roundtrip (order is reversed — most recent first)
        let stored_outcomes: Vec<AttemptOutcome> = all.iter().map(|r| r.outcome).collect();
        for outcome in &outcomes {
            assert!(stored_outcomes.contains(outcome));
        }
    }

    #[tokio::test]
    async fn test_upsert_on_duplicate_id() {
        let store = SqliteReflectionStore::in_memory().await.unwrap();

        let mut r = make_reflection("Original task", AttemptOutcome::Failure);
        let id = r.reflection_id.clone();
        store.store(&r).await.unwrap();

        // Update the reflection with same ID
        r.task = "Updated task".to_string();
        r.reflection_id = id;
        store.store(&r).await.unwrap();

        let all = store.load_all().await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].task, "Updated task");
    }
}
