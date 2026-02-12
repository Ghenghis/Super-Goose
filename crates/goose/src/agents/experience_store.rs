//! ExperienceStore — SQLite-backed cross-session learning from task executions.
//!
//! Records which core was used for each task, the outcome, cost, time, and any
//! insights extracted. This enables:
//! - CoreSelector to auto-pick the best core for a given task type
//! - ExpeL-style insight extraction from accumulated experiences
//! - Cross-session learning without losing history on restart

use anyhow::{Context, Result};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::Path;
use uuid::Uuid;

use crate::agents::core::{CoreMetricsSnapshot, CoreType};

/// A single recorded experience from executing a task with a specific core.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experience {
    /// Unique identifier
    pub experience_id: String,
    /// The task description that was executed
    pub task: String,
    /// Which core type was used
    pub core_type: CoreType,
    /// Whether the task completed successfully
    pub succeeded: bool,
    /// Number of turns/steps used
    pub turns_used: u32,
    /// Cost in dollars
    pub cost_dollars: f64,
    /// Wall-clock time in milliseconds
    pub time_ms: u64,
    /// Detected task category (e.g., "code-test-fix", "large-refactor")
    pub task_category: String,
    /// Free-form insights extracted from this experience
    pub insights: Vec<String>,
    /// Tags for filtering/searching
    pub tags: Vec<String>,
    /// When this experience was recorded
    pub created_at: DateTime<Utc>,
}

impl Experience {
    /// Create a new experience record.
    pub fn new(
        task: impl Into<String>,
        core_type: CoreType,
        succeeded: bool,
        turns_used: u32,
        cost_dollars: f64,
        time_ms: u64,
    ) -> Self {
        Self {
            experience_id: Uuid::new_v4().to_string(),
            task: task.into(),
            core_type,
            succeeded,
            turns_used,
            cost_dollars,
            time_ms,
            task_category: String::new(),
            insights: Vec::new(),
            tags: Vec::new(),
            created_at: Utc::now(),
        }
    }

    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.task_category = category.into();
        self
    }

    pub fn with_insights(mut self, insights: Vec<String>) -> Self {
        self.insights = insights;
        self
    }

    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }
}

/// Aggregated statistics for a specific core type.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CoreStats {
    /// Which core these stats are for
    pub core_type: String,
    /// Total number of experiences recorded
    pub total_executions: u64,
    /// Number of successful executions
    pub successes: u64,
    /// Number of failed executions
    pub failures: u64,
    /// Success rate (0.0 - 1.0)
    pub success_rate: f64,
    /// Average turns per execution
    pub avg_turns: f64,
    /// Average cost per execution (dollars)
    pub avg_cost: f64,
    /// Average time per execution (milliseconds)
    pub avg_time_ms: f64,
    /// Total cost across all executions
    pub total_cost: f64,
}

/// Aggregated statistics for a task category + core type combination.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CategoryCoreStats {
    pub task_category: String,
    pub core_type: String,
    pub total_executions: u64,
    pub success_rate: f64,
    pub avg_turns: f64,
    pub avg_cost: f64,
    pub avg_time_ms: f64,
}

/// SQLite-backed experience store for cross-session learning.
pub struct ExperienceStore {
    pool: Pool<Sqlite>,
}

impl ExperienceStore {
    /// Create a new store with the given database path.
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
            .with_context(|| {
                format!("Failed to connect to experience store at {:?}", path)
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
            CREATE TABLE IF NOT EXISTS experiences (
                experience_id TEXT PRIMARY KEY,
                task TEXT NOT NULL,
                core_type TEXT NOT NULL,
                succeeded INTEGER NOT NULL DEFAULT 0,
                turns_used INTEGER NOT NULL DEFAULT 0,
                cost_dollars REAL NOT NULL DEFAULT 0.0,
                time_ms INTEGER NOT NULL DEFAULT 0,
                task_category TEXT NOT NULL DEFAULT '',
                insights TEXT NOT NULL DEFAULT '[]',
                tags TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_experiences_core_type
                ON experiences(core_type)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_experiences_task_category
                ON experiences(task_category)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_experiences_created_at
                ON experiences(created_at DESC)
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Store a new experience.
    pub async fn store(&self, experience: &Experience) -> Result<()> {
        let insights_json = serde_json::to_string(&experience.insights)?;
        let tags_json = serde_json::to_string(&experience.tags)?;
        let created_at = experience.created_at.timestamp();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO experiences
                (experience_id, task, core_type, succeeded, turns_used,
                 cost_dollars, time_ms, task_category, insights, tags, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(&experience.experience_id)
        .bind(&experience.task)
        .bind(experience.core_type.as_str())
        .bind(experience.succeeded as i32)
        .bind(experience.turns_used as i64)
        .bind(experience.cost_dollars)
        .bind(experience.time_ms as i64)
        .bind(&experience.task_category)
        .bind(&insights_json)
        .bind(&tags_json)
        .bind(created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Record an experience from a core execution (convenience method).
    pub async fn record(
        &self,
        task: &str,
        core_type: CoreType,
        succeeded: bool,
        metrics: &CoreMetricsSnapshot,
        task_category: &str,
    ) -> Result<String> {
        let exp = Experience::new(
            task,
            core_type,
            succeeded,
            metrics.avg_turns as u32,
            metrics.total_cost_dollars,
            metrics.avg_time_ms as u64,
        )
        .with_category(task_category);

        let id = exp.experience_id.clone();
        self.store(&exp).await?;
        Ok(id)
    }

    /// Find experiences relevant to a task using keyword matching.
    pub async fn find_relevant(&self, task: &str, limit: usize) -> Result<Vec<Experience>> {
        let keywords: Vec<String> = task
            .split_whitespace()
            .filter(|w| w.len() > 3)
            .map(|w| w.to_lowercase())
            .collect();

        if keywords.is_empty() {
            return Ok(Vec::new());
        }

        let mut score_parts: Vec<String> = Vec::new();
        let mut params: Vec<String> = Vec::new();
        for kw in &keywords {
            score_parts.push(format!(
                "(CASE WHEN LOWER(task) LIKE '%' || ?{p} || '%' THEN 1 ELSE 0 END + \
                 CASE WHEN LOWER(task_category) LIKE '%' || ?{p} || '%' THEN 1 ELSE 0 END)",
                p = params.len() + 1
            ));
            params.push(kw.clone());
        }

        let score_expr = score_parts.join(" + ");
        let query = format!(
            "SELECT * FROM experiences \
             WHERE ({score_expr}) > 0 \
             ORDER BY ({score_expr}) DESC, created_at DESC \
             LIMIT {limit}"
        );

        let mut q = sqlx::query(&query);
        // Bind twice — once for WHERE, once for ORDER BY
        for param in &params {
            q = q.bind(param);
        }
        for param in &params {
            q = q.bind(param);
        }

        let rows = q.fetch_all(&self.pool).await?;
        let mut experiences = Vec::with_capacity(rows.len());
        for row in rows {
            experiences.push(self.row_to_experience(&row)?);
        }
        Ok(experiences)
    }

    /// Get aggregate statistics per core type.
    pub async fn get_core_stats(&self) -> Result<Vec<CoreStats>> {
        let rows = sqlx::query(
            r#"
            SELECT
                core_type,
                COUNT(*) as total,
                SUM(CASE WHEN succeeded = 1 THEN 1 ELSE 0 END) as successes,
                SUM(CASE WHEN succeeded = 0 THEN 1 ELSE 0 END) as failures,
                AVG(turns_used) as avg_turns,
                AVG(cost_dollars) as avg_cost,
                AVG(time_ms) as avg_time,
                SUM(cost_dollars) as total_cost
            FROM experiences
            GROUP BY core_type
            ORDER BY total DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut stats = Vec::with_capacity(rows.len());
        for row in rows {
            let total: i64 = row.get("total");
            let successes: i64 = row.get("successes");
            stats.push(CoreStats {
                core_type: row.get("core_type"),
                total_executions: total as u64,
                successes: successes as u64,
                failures: row.get::<i64, _>("failures") as u64,
                success_rate: if total > 0 {
                    successes as f64 / total as f64
                } else {
                    0.0
                },
                avg_turns: row.get("avg_turns"),
                avg_cost: row.get("avg_cost"),
                avg_time_ms: row.get("avg_time"),
                total_cost: row.get("total_cost"),
            });
        }
        Ok(stats)
    }

    /// Get stats for a specific core type.
    pub async fn get_stats_for_core(&self, core_type: CoreType) -> Result<Option<CoreStats>> {
        let all = self.get_core_stats().await?;
        Ok(all
            .into_iter()
            .find(|s| s.core_type == core_type.as_str()))
    }

    /// Get stats broken down by task category and core type.
    /// This is the key data for CoreSelector — "which core performs best for category X?"
    pub async fn get_category_core_stats(&self) -> Result<Vec<CategoryCoreStats>> {
        let rows = sqlx::query(
            r#"
            SELECT
                task_category,
                core_type,
                COUNT(*) as total,
                AVG(CASE WHEN succeeded = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
                AVG(turns_used) as avg_turns,
                AVG(cost_dollars) as avg_cost,
                AVG(time_ms) as avg_time
            FROM experiences
            WHERE task_category != ''
            GROUP BY task_category, core_type
            ORDER BY task_category, success_rate DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut stats = Vec::with_capacity(rows.len());
        for row in rows {
            stats.push(CategoryCoreStats {
                task_category: row.get("task_category"),
                core_type: row.get("core_type"),
                total_executions: row.get::<i64, _>("total") as u64,
                success_rate: row.get("success_rate"),
                avg_turns: row.get("avg_turns"),
                avg_cost: row.get("avg_cost"),
                avg_time_ms: row.get("avg_time"),
            });
        }
        Ok(stats)
    }

    /// Find the best core type for a task category based on historical performance.
    /// Returns (core_type_str, success_rate) or None if no data.
    pub async fn best_core_for_category(
        &self,
        category: &str,
    ) -> Result<Option<(String, f64)>> {
        let row = sqlx::query(
            r#"
            SELECT
                core_type,
                AVG(CASE WHEN succeeded = 1 THEN 1.0 ELSE 0.0 END) as success_rate
            FROM experiences
            WHERE task_category = ?1
            GROUP BY core_type
            HAVING COUNT(*) >= 3
            ORDER BY success_rate DESC, AVG(cost_dollars) ASC
            LIMIT 1
            "#,
        )
        .bind(category)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| {
            let core_type: String = r.get("core_type");
            let rate: f64 = r.get("success_rate");
            (core_type, rate)
        }))
    }

    /// Get all insights across experiences, optionally filtered by core type.
    pub async fn get_insights(&self, core_type: Option<CoreType>) -> Result<Vec<String>> {
        let rows = if let Some(ct) = core_type {
            sqlx::query(
                "SELECT insights FROM experiences WHERE core_type = ?1 AND insights != '[]' ORDER BY created_at DESC",
            )
            .bind(ct.as_str())
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                "SELECT insights FROM experiences WHERE insights != '[]' ORDER BY created_at DESC",
            )
            .fetch_all(&self.pool)
            .await?
        };

        let mut all_insights = Vec::new();
        for row in rows {
            let json: String = row.get("insights");
            let parsed: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
            all_insights.extend(parsed);
        }
        Ok(all_insights)
    }

    /// Get total count of stored experiences.
    pub async fn count(&self) -> Result<usize> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM experiences")
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("cnt");
        Ok(count as usize)
    }

    /// Load recent experiences (most recent first).
    pub async fn recent(&self, limit: usize) -> Result<Vec<Experience>> {
        let rows = sqlx::query(
            &format!(
                "SELECT * FROM experiences ORDER BY created_at DESC, rowid DESC LIMIT {}",
                limit
            ),
        )
        .fetch_all(&self.pool)
        .await?;

        let mut experiences = Vec::with_capacity(rows.len());
        for row in rows {
            experiences.push(self.row_to_experience(&row)?);
        }
        Ok(experiences)
    }

    /// Delete all experiences.
    pub async fn clear(&self) -> Result<usize> {
        let result = sqlx::query("DELETE FROM experiences")
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() as usize)
    }

    /// Convert a database row to an Experience.
    fn row_to_experience(&self, row: &sqlx::sqlite::SqliteRow) -> Result<Experience> {
        let core_type_str: String = row.get("core_type");
        let core_type = CoreType::from_str(&core_type_str);
        let succeeded: i32 = row.get("succeeded");
        let turns_used: i64 = row.get("turns_used");
        let time_ms: i64 = row.get("time_ms");
        let created_at: i64 = row.get("created_at");
        let insights_json: String = row.get("insights");
        let tags_json: String = row.get("tags");

        Ok(Experience {
            experience_id: row.get("experience_id"),
            task: row.get("task"),
            core_type,
            succeeded: succeeded != 0,
            turns_used: turns_used as u32,
            cost_dollars: row.get("cost_dollars"),
            time_ms: time_ms as u64,
            task_category: row.get("task_category"),
            insights: serde_json::from_str(&insights_json).unwrap_or_default(),
            tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            created_at: Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_experience(
        task: &str,
        core_type: CoreType,
        succeeded: bool,
        turns: u32,
        cost: f64,
    ) -> Experience {
        Experience::new(task, core_type, succeeded, turns, cost, 1000)
    }

    #[tokio::test]
    async fn test_store_and_count() {
        let store = ExperienceStore::in_memory().await.unwrap();
        assert_eq!(store.count().await.unwrap(), 0);

        let exp = make_experience("Fix auth bug", CoreType::Freeform, true, 5, 0.01);
        store.store(&exp).await.unwrap();
        assert_eq!(store.count().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_store_and_load_recent() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let e1 = make_experience("Task A", CoreType::Freeform, true, 3, 0.01);
        let e2 = make_experience("Task B", CoreType::Structured, false, 10, 0.05);
        let e3 = make_experience("Task C", CoreType::Orchestrator, true, 7, 0.03);
        store.store(&e1).await.unwrap();
        store.store(&e2).await.unwrap();
        store.store(&e3).await.unwrap();

        let recent = store.recent(10).await.unwrap();
        assert_eq!(recent.len(), 3);
        // All 3 experiences should be present
        let tasks: Vec<&str> = recent.iter().map(|e| e.task.as_str()).collect();
        assert!(tasks.contains(&"Task A"));
        assert!(tasks.contains(&"Task B"));
        assert!(tasks.contains(&"Task C"));

        // Limit works
        let limited = store.recent(2).await.unwrap();
        assert_eq!(limited.len(), 2);
    }

    #[tokio::test]
    async fn test_core_stats() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // 3 freeform: 2 success, 1 fail
        for i in 0..3 {
            let exp = make_experience(
                &format!("Freeform task {}", i),
                CoreType::Freeform,
                i < 2,
                5,
                0.01,
            );
            store.store(&exp).await.unwrap();
        }

        // 2 structured: both success
        for i in 0..2 {
            let exp = make_experience(
                &format!("Structured task {}", i),
                CoreType::Structured,
                true,
                8,
                0.02,
            );
            store.store(&exp).await.unwrap();
        }

        let stats = store.get_core_stats().await.unwrap();
        assert_eq!(stats.len(), 2);

        let freeform = stats.iter().find(|s| s.core_type == "freeform").unwrap();
        assert_eq!(freeform.total_executions, 3);
        assert_eq!(freeform.successes, 2);
        assert_eq!(freeform.failures, 1);
        assert!((freeform.success_rate - 0.6667).abs() < 0.01);

        let structured = stats.iter().find(|s| s.core_type == "structured").unwrap();
        assert_eq!(structured.total_executions, 2);
        assert!((structured.success_rate - 1.0).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_category_core_stats() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Structured excels at code-test-fix
        for _ in 0..5 {
            let exp = make_experience("Fix bug", CoreType::Structured, true, 6, 0.02)
                .with_category("code-test-fix");
            store.store(&exp).await.unwrap();
        }

        // Freeform struggles with code-test-fix
        for i in 0..4 {
            let exp = make_experience("Fix bug", CoreType::Freeform, i < 1, 10, 0.05)
                .with_category("code-test-fix");
            store.store(&exp).await.unwrap();
        }

        let stats = store.get_category_core_stats().await.unwrap();
        let ctf_stats: Vec<_> = stats
            .iter()
            .filter(|s| s.task_category == "code-test-fix")
            .collect();
        assert_eq!(ctf_stats.len(), 2);

        // Structured should have higher success rate
        let structured = ctf_stats
            .iter()
            .find(|s| s.core_type == "structured")
            .unwrap();
        let freeform = ctf_stats
            .iter()
            .find(|s| s.core_type == "freeform")
            .unwrap();
        assert!(structured.success_rate > freeform.success_rate);
    }

    #[tokio::test]
    async fn test_best_core_for_category() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Orchestrator: 4/5 success for large-refactor
        for i in 0..5 {
            let exp = make_experience("Refactor auth", CoreType::Orchestrator, i < 4, 12, 0.10)
                .with_category("large-refactor");
            store.store(&exp).await.unwrap();
        }

        // Swarm: 3/5 success for large-refactor
        for i in 0..5 {
            let exp = make_experience("Refactor auth", CoreType::Swarm, i < 3, 8, 0.08)
                .with_category("large-refactor");
            store.store(&exp).await.unwrap();
        }

        // Freeform: only 2 experiences (below threshold of 3)
        for _ in 0..2 {
            let exp = make_experience("Refactor auth", CoreType::Freeform, true, 20, 0.20)
                .with_category("large-refactor");
            store.store(&exp).await.unwrap();
        }

        let best = store
            .best_core_for_category("large-refactor")
            .await
            .unwrap();
        assert!(best.is_some());
        let (core, rate) = best.unwrap();
        assert_eq!(core, "orchestrator");
        assert!((rate - 0.8).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_find_relevant() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let e1 = make_experience(
            "Fix authentication token refresh",
            CoreType::Freeform,
            true,
            5,
            0.01,
        );
        let e2 = make_experience(
            "Optimize database query performance",
            CoreType::Structured,
            true,
            8,
            0.03,
        );
        let e3 = make_experience(
            "Debug authentication login flow",
            CoreType::Orchestrator,
            false,
            15,
            0.10,
        );
        store.store(&e1).await.unwrap();
        store.store(&e2).await.unwrap();
        store.store(&e3).await.unwrap();

        let results = store
            .find_relevant("authentication error", 5)
            .await
            .unwrap();
        assert!(!results.is_empty());
        assert!(results.iter().any(|e| e.task.contains("authentication")));
        // Database task should NOT appear (no keyword overlap)
        assert!(!results.iter().any(|e| e.task.contains("database")));
    }

    #[tokio::test]
    async fn test_insights_storage() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let exp = make_experience("Complex task", CoreType::Orchestrator, true, 10, 0.05)
            .with_insights(vec![
                "Break large tasks into subtasks first".into(),
                "Test each subtask independently".into(),
            ]);
        store.store(&exp).await.unwrap();

        let insights = store.get_insights(None).await.unwrap();
        assert_eq!(insights.len(), 2);
        assert!(insights.contains(&"Break large tasks into subtasks first".to_string()));
    }

    #[tokio::test]
    async fn test_insights_filtered_by_core() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let e1 = make_experience("Task A", CoreType::Freeform, true, 3, 0.01)
            .with_insights(vec!["Freeform insight".into()]);
        let e2 = make_experience("Task B", CoreType::Structured, true, 5, 0.02)
            .with_insights(vec!["Structured insight".into()]);
        store.store(&e1).await.unwrap();
        store.store(&e2).await.unwrap();

        let freeform_insights = store.get_insights(Some(CoreType::Freeform)).await.unwrap();
        assert_eq!(freeform_insights.len(), 1);
        assert_eq!(freeform_insights[0], "Freeform insight");

        let all_insights = store.get_insights(None).await.unwrap();
        assert_eq!(all_insights.len(), 2);
    }

    #[tokio::test]
    async fn test_record_convenience() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let metrics = CoreMetricsSnapshot {
            total_executions: 1,
            successful: 1,
            failed: 0,
            success_rate: 1.0,
            avg_turns: 5.0,
            avg_cost_dollars: 0.01,
            avg_time_ms: 2000,
            total_cost_dollars: 0.01,
        };

        let id = store
            .record(
                "Fix the login bug",
                CoreType::Structured,
                true,
                &metrics,
                "code-test-fix",
            )
            .await
            .unwrap();
        assert!(!id.is_empty());
        assert_eq!(store.count().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_clear() {
        let store = ExperienceStore::in_memory().await.unwrap();

        for i in 0..5 {
            let exp = make_experience(&format!("Task {}", i), CoreType::Freeform, true, 3, 0.01);
            store.store(&exp).await.unwrap();
        }
        assert_eq!(store.count().await.unwrap(), 5);

        let deleted = store.clear().await.unwrap();
        assert_eq!(deleted, 5);
        assert_eq!(store.count().await.unwrap(), 0);
    }

    #[tokio::test]
    async fn test_core_type_roundtrip() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let types = vec![
            CoreType::Freeform,
            CoreType::Structured,
            CoreType::Orchestrator,
            CoreType::Swarm,
            CoreType::Workflow,
            CoreType::Adversarial,
        ];

        for ct in &types {
            let exp = make_experience("roundtrip", *ct, true, 3, 0.01);
            store.store(&exp).await.unwrap();
        }

        let recent = store.recent(10).await.unwrap();
        assert_eq!(recent.len(), 6);

        let stored_types: Vec<CoreType> = recent.iter().map(|e| e.core_type).collect();
        for ct in &types {
            assert!(stored_types.contains(ct));
        }
    }
}
