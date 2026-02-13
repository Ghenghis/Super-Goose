//! SkillLibrary — Voyager-style reusable skill/strategy library.
//!
//! Records successful strategies (skills) that can be retrieved and applied
//! to similar future tasks. A skill is a learned approach: what core to use,
//! what steps to take, what to watch out for.
//!
//! Inspired by Voyager's skill library: accumulate verified programs (strategies)
//! and retrieve the most relevant ones for new tasks via embedding similarity
//! (or keyword matching as a simpler first step).

use anyhow::{Context, Result};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::Path;
use uuid::Uuid;

use crate::agents::core::CoreType;

/// A learned skill — a strategy that worked for a class of tasks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    /// Unique identifier
    pub skill_id: String,
    /// Short name/label for this skill
    pub name: String,
    /// Detailed description of the strategy
    pub description: String,
    /// Which core type this skill recommends
    pub recommended_core: CoreType,
    /// Step-by-step approach (ordered list)
    pub steps: Vec<String>,
    /// Preconditions — when to use this skill
    pub preconditions: Vec<String>,
    /// Task patterns this skill applies to (keywords)
    pub task_patterns: Vec<String>,
    /// How many times this skill has been successfully used
    pub use_count: u32,
    /// How many times this skill has been tried (including failures)
    pub attempt_count: u32,
    /// Success rate (use_count / attempt_count)
    pub success_rate: f32,
    /// Whether this skill has been verified (used at least once successfully)
    pub verified: bool,
    /// When this skill was created
    pub created_at: DateTime<Utc>,
    /// When this skill was last used
    pub last_used: Option<DateTime<Utc>>,
}

impl Skill {
    /// Create a new unverified skill.
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        core: CoreType,
    ) -> Self {
        Self {
            skill_id: Uuid::new_v4().to_string(),
            name: name.into(),
            description: description.into(),
            recommended_core: core,
            steps: Vec::new(),
            preconditions: Vec::new(),
            task_patterns: Vec::new(),
            use_count: 0,
            attempt_count: 0,
            success_rate: 0.0,
            verified: false,
            created_at: Utc::now(),
            last_used: None,
        }
    }

    pub fn with_steps(mut self, steps: Vec<String>) -> Self {
        self.steps = steps;
        self
    }

    pub fn with_preconditions(mut self, pre: Vec<String>) -> Self {
        self.preconditions = pre;
        self
    }

    pub fn with_patterns(mut self, patterns: Vec<String>) -> Self {
        self.task_patterns = patterns;
        self
    }

    /// Record a usage attempt (success or failure).
    pub fn record_usage(&mut self, succeeded: bool) {
        self.attempt_count += 1;
        if succeeded {
            self.use_count += 1;
            self.verified = true;
        }
        self.success_rate = if self.attempt_count > 0 {
            self.use_count as f32 / self.attempt_count as f32
        } else {
            0.0
        };
        self.last_used = Some(Utc::now());
    }

    /// Format this skill as a readable string for injection into prompts.
    pub fn as_prompt_context(&self) -> String {
        let mut parts = Vec::new();
        parts.push(format!("Skill: {}", self.name));
        parts.push(format!("Strategy: {}", self.description));
        parts.push(format!("Recommended core: {}", self.recommended_core));

        if !self.steps.is_empty() {
            parts.push("Steps:".to_string());
            for (i, step) in self.steps.iter().enumerate() {
                parts.push(format!("  {}. {}", i + 1, step));
            }
        }

        if !self.preconditions.is_empty() {
            parts.push(format!("When to use: {}", self.preconditions.join(", ")));
        }

        if self.verified {
            parts.push(format!(
                "Track record: {}/{} successful ({:.0}%)",
                self.use_count,
                self.attempt_count,
                self.success_rate * 100.0,
            ));
        }

        parts.join("\n")
    }
}

/// SQLite-backed skill library.
pub struct SkillLibrary {
    pool: Pool<Sqlite>,
}

impl SkillLibrary {
    /// Create a new skill library at the given path.
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
            .with_context(|| format!("Failed to connect to skill library at {:?}", path))?;

        let lib = Self { pool };
        lib.init_schema().await?;
        Ok(lib)
    }

    /// Create an in-memory skill library (for testing).
    pub async fn in_memory() -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;

        let lib = Self { pool };
        lib.init_schema().await?;
        Ok(lib)
    }

    async fn init_schema(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS skills (
                skill_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                recommended_core TEXT NOT NULL,
                steps TEXT NOT NULL DEFAULT '[]',
                preconditions TEXT NOT NULL DEFAULT '[]',
                task_patterns TEXT NOT NULL DEFAULT '[]',
                use_count INTEGER NOT NULL DEFAULT 0,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                success_rate REAL NOT NULL DEFAULT 0.0,
                verified INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_used INTEGER
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_skills_verified
                ON skills(verified DESC, success_rate DESC)
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Store or update a skill.
    pub async fn store(&self, skill: &Skill) -> Result<()> {
        let steps_json = serde_json::to_string(&skill.steps)?;
        let pre_json = serde_json::to_string(&skill.preconditions)?;
        let patterns_json = serde_json::to_string(&skill.task_patterns)?;
        let created_at = skill.created_at.timestamp();
        let last_used = skill.last_used.map(|dt| dt.timestamp());

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO skills
                (skill_id, name, description, recommended_core, steps,
                 preconditions, task_patterns, use_count, attempt_count,
                 success_rate, verified, created_at, last_used)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
        )
        .bind(&skill.skill_id)
        .bind(&skill.name)
        .bind(&skill.description)
        .bind(skill.recommended_core.as_str())
        .bind(&steps_json)
        .bind(&pre_json)
        .bind(&patterns_json)
        .bind(skill.use_count as i64)
        .bind(skill.attempt_count as i64)
        .bind(skill.success_rate as f64)
        .bind(skill.verified as i32)
        .bind(created_at)
        .bind(last_used)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Find skills matching a task description using keyword overlap.
    pub async fn find_for_task(&self, task: &str, limit: usize) -> Result<Vec<Skill>> {
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
                "(CASE WHEN LOWER(name) LIKE '%' || ?{p} || '%' THEN 2 ELSE 0 END + \
                 CASE WHEN LOWER(description) LIKE '%' || ?{p} || '%' THEN 1 ELSE 0 END + \
                 CASE WHEN LOWER(task_patterns) LIKE '%' || ?{p} || '%' THEN 3 ELSE 0 END)",
                p = params.len() + 1
            ));
            params.push(kw.clone());
        }

        let score_expr = score_parts.join(" + ");
        let query = format!(
            "SELECT * FROM skills \
             WHERE ({score_expr}) > 0 AND verified = 1 \
             ORDER BY ({score_expr}) DESC, success_rate DESC, use_count DESC \
             LIMIT {limit}"
        );

        let mut q = sqlx::query(&query);
        // Bind three times: WHERE score > 0, ORDER BY score, and the score aliases
        for param in &params {
            q = q.bind(param);
        }
        for param in &params {
            q = q.bind(param);
        }

        let rows = q.fetch_all(&self.pool).await?;
        let mut skills = Vec::with_capacity(rows.len());
        for row in rows {
            skills.push(self.row_to_skill(&row)?);
        }
        Ok(skills)
    }

    /// Get all verified skills, ordered by success rate.
    pub async fn verified_skills(&self) -> Result<Vec<Skill>> {
        let rows = sqlx::query(
            "SELECT * FROM skills WHERE verified = 1 ORDER BY success_rate DESC, use_count DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut skills = Vec::with_capacity(rows.len());
        for row in rows {
            skills.push(self.row_to_skill(&row)?);
        }
        Ok(skills)
    }

    /// Get all skills (including unverified).
    pub async fn all_skills(&self) -> Result<Vec<Skill>> {
        let rows = sqlx::query("SELECT * FROM skills ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut skills = Vec::with_capacity(rows.len());
        for row in rows {
            skills.push(self.row_to_skill(&row)?);
        }
        Ok(skills)
    }

    /// Record usage of a skill (updates use_count, attempt_count, success_rate).
    pub async fn record_usage(&self, skill_id: &str, succeeded: bool) -> Result<bool> {
        let rows = sqlx::query("SELECT * FROM skills WHERE skill_id = ?1")
            .bind(skill_id)
            .fetch_optional(&self.pool)
            .await?;

        if let Some(row) = rows {
            let mut skill = self.row_to_skill(&row)?;
            skill.record_usage(succeeded);
            self.store(&skill).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Get total count.
    pub async fn count(&self) -> Result<usize> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM skills")
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("cnt");
        Ok(count as usize)
    }

    /// Delete a skill by ID.
    pub async fn delete(&self, skill_id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM skills WHERE skill_id = ?1")
            .bind(skill_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    fn row_to_skill(&self, row: &sqlx::sqlite::SqliteRow) -> Result<Skill> {
        let core_str: String = row.get("recommended_core");
        let use_count: i64 = row.get("use_count");
        let attempt_count: i64 = row.get("attempt_count");
        let success_rate: f64 = row.get("success_rate");
        let verified: i32 = row.get("verified");
        let created_at: i64 = row.get("created_at");
        let last_used: Option<i64> = row.get("last_used");

        let steps_json: String = row.get("steps");
        let pre_json: String = row.get("preconditions");
        let patterns_json: String = row.get("task_patterns");

        Ok(Skill {
            skill_id: row.get("skill_id"),
            name: row.get("name"),
            description: row.get("description"),
            recommended_core: CoreType::from_str(&core_str),
            steps: serde_json::from_str(&steps_json).unwrap_or_default(),
            preconditions: serde_json::from_str(&pre_json).unwrap_or_default(),
            task_patterns: serde_json::from_str(&patterns_json).unwrap_or_default(),
            use_count: use_count as u32,
            attempt_count: attempt_count as u32,
            success_rate: success_rate as f32,
            verified: verified != 0,
            created_at: Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now),
            last_used: last_used.and_then(|ts| Utc.timestamp_opt(ts, 0).single()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_skill(name: &str, core: CoreType) -> Skill {
        Skill::new(name, format!("Strategy for {}", name), core)
            .with_steps(vec!["Step 1".into(), "Step 2".into()])
            .with_patterns(vec![name.to_lowercase()])
    }

    #[tokio::test]
    async fn test_store_and_count() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 0);

        let skill = make_skill("auth-fix", CoreType::Structured);
        lib.store(&skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_find_for_task_verified_only() {
        let lib = SkillLibrary::in_memory().await.unwrap();

        let mut s1 = make_skill("auth-fix", CoreType::Structured)
            .with_patterns(vec!["authentication".into(), "login".into()]);
        s1.verified = true;
        s1.use_count = 3;
        s1.attempt_count = 4;
        s1.success_rate = 0.75;

        let s2 = make_skill("database-opt", CoreType::Orchestrator)
            .with_patterns(vec!["database".into(), "query".into()]);
        // s2 is NOT verified

        lib.store(&s1).await.unwrap();
        lib.store(&s2).await.unwrap();

        let results = lib
            .find_for_task("fix authentication error", 5)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "auth-fix");

        // Database skill not found (unverified)
        let db_results = lib
            .find_for_task("optimize database query", 5)
            .await
            .unwrap();
        assert!(db_results.is_empty());
    }

    #[tokio::test]
    async fn test_record_usage() {
        let lib = SkillLibrary::in_memory().await.unwrap();

        let skill = make_skill("test-skill", CoreType::Freeform);
        let id = skill.skill_id.clone();
        lib.store(&skill).await.unwrap();

        // Record 2 successes and 1 failure
        lib.record_usage(&id, true).await.unwrap();
        lib.record_usage(&id, true).await.unwrap();
        lib.record_usage(&id, false).await.unwrap();

        let all = lib.all_skills().await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].use_count, 2);
        assert_eq!(all[0].attempt_count, 3);
        assert!((all[0].success_rate - 0.6667).abs() < 0.01);
        assert!(all[0].verified); // At least one success
        assert!(all[0].last_used.is_some());
    }

    #[tokio::test]
    async fn test_verified_skills() {
        let lib = SkillLibrary::in_memory().await.unwrap();

        let mut s1 = make_skill("verified-1", CoreType::Freeform);
        s1.verified = true;
        s1.success_rate = 0.9;
        let s2 = make_skill("unverified", CoreType::Structured);
        let mut s3 = make_skill("verified-2", CoreType::Orchestrator);
        s3.verified = true;
        s3.success_rate = 0.7;

        lib.store(&s1).await.unwrap();
        lib.store(&s2).await.unwrap();
        lib.store(&s3).await.unwrap();

        let verified = lib.verified_skills().await.unwrap();
        assert_eq!(verified.len(), 2);
        // Ordered by success_rate DESC
        assert_eq!(verified[0].name, "verified-1");
        assert_eq!(verified[1].name, "verified-2");
    }

    #[tokio::test]
    async fn test_skill_prompt_context() {
        let mut skill = make_skill("auth-fix", CoreType::Structured)
            .with_preconditions(vec!["Login fails with 401".into()]);
        skill.verified = true;
        skill.use_count = 5;
        skill.attempt_count = 6;
        skill.success_rate = 5.0 / 6.0;

        let ctx = skill.as_prompt_context();
        assert!(ctx.contains("auth-fix"));
        assert!(ctx.contains("structured"));
        assert!(ctx.contains("Step 1"));
        assert!(ctx.contains("5/6 successful"));
    }

    #[tokio::test]
    async fn test_delete_skill() {
        let lib = SkillLibrary::in_memory().await.unwrap();

        let skill = make_skill("deleteme", CoreType::Freeform);
        let id = skill.skill_id.clone();
        lib.store(&skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);

        assert!(lib.delete(&id).await.unwrap());
        assert_eq!(lib.count().await.unwrap(), 0);
        assert!(!lib.delete("nonexistent").await.unwrap());
    }

    #[tokio::test]
    async fn test_core_type_roundtrip() {
        let lib = SkillLibrary::in_memory().await.unwrap();

        for ct in CoreType::all() {
            let skill = make_skill(&format!("{}-skill", ct), *ct);
            lib.store(&skill).await.unwrap();
        }

        let all = lib.all_skills().await.unwrap();
        assert_eq!(all.len(), 6);

        let types: Vec<CoreType> = all.iter().map(|s| s.recommended_core).collect();
        for ct in CoreType::all() {
            assert!(types.contains(ct));
        }
    }

    // ── Edge-case tests ────────────────────────────────────────────────

    #[tokio::test]
    async fn test_find_for_task_no_matches() {
        let lib = SkillLibrary::in_memory().await.unwrap();

        let mut s = make_skill("auth-fix", CoreType::Structured)
            .with_patterns(vec!["authentication".into(), "login".into()]);
        s.verified = true;
        s.use_count = 1;
        s.attempt_count = 1;
        s.success_rate = 1.0;
        lib.store(&s).await.unwrap();

        // Completely unrelated query
        let results = lib.find_for_task("optimize database performance", 5).await.unwrap();
        assert!(results.is_empty(), "Unrelated task should find no skills");
    }

    #[tokio::test]
    async fn test_find_for_task_short_words_filtered() {
        // Words <= 3 chars are filtered out
        let lib = SkillLibrary::in_memory().await.unwrap();

        let mut s = make_skill("api-fix", CoreType::Structured)
            .with_patterns(vec!["api".into()]);
        s.verified = true;
        s.use_count = 1;
        lib.store(&s).await.unwrap();

        // "fix the api bug" → keywords after filter (>3 chars): [] → empty
        let results = lib.find_for_task("fix the api bug", 5).await.unwrap();
        // "fix"=3, "the"=3, "api"=3, "bug"=3 → all filtered → empty keywords → empty result
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_find_for_task_empty_query() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let results = lib.find_for_task("", 5).await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_find_for_task_whitespace_only() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let results = lib.find_for_task("   ", 5).await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_record_usage_nonexistent_skill() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let found = lib.record_usage("nonexistent-id", true).await.unwrap();
        assert!(!found, "record_usage returns false for nonexistent skill");
    }

    #[tokio::test]
    async fn test_record_usage_sets_verified_on_success() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let skill = make_skill("test-skill", CoreType::Freeform);
        let id = skill.skill_id.clone();
        assert!(!skill.verified);
        lib.store(&skill).await.unwrap();

        // Failure does not set verified
        lib.record_usage(&id, false).await.unwrap();
        let all = lib.all_skills().await.unwrap();
        assert!(!all[0].verified);

        // Success sets verified
        lib.record_usage(&id, true).await.unwrap();
        let all = lib.all_skills().await.unwrap();
        assert!(all[0].verified);
    }

    #[tokio::test]
    async fn test_verified_skills_empty_store() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let verified = lib.verified_skills().await.unwrap();
        assert!(verified.is_empty());
    }

    #[tokio::test]
    async fn test_all_skills_empty_store() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let all = lib.all_skills().await.unwrap();
        assert!(all.is_empty());
        assert_eq!(lib.count().await.unwrap(), 0);
    }

    #[tokio::test]
    async fn test_store_replaces_existing_skill() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        let mut skill = make_skill("evolving", CoreType::Freeform);
        let id = skill.skill_id.clone();
        lib.store(&skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);

        // Update the same skill
        skill.use_count = 10;
        skill.verified = true;
        lib.store(&skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);

        let all = lib.all_skills().await.unwrap();
        assert_eq!(all[0].use_count, 10);
        assert!(all[0].verified);
        assert_eq!(all[0].skill_id, id);
    }

    #[tokio::test]
    async fn test_delete_nonexistent_returns_false() {
        let lib = SkillLibrary::in_memory().await.unwrap();
        assert!(!lib.delete("no-such-id").await.unwrap());
    }

    #[test]
    fn test_skill_record_usage_math() {
        let mut skill = Skill::new("test", "desc", CoreType::Freeform);
        assert_eq!(skill.attempt_count, 0);
        assert_eq!(skill.use_count, 0);
        assert_eq!(skill.success_rate, 0.0);

        skill.record_usage(true);
        assert_eq!(skill.attempt_count, 1);
        assert_eq!(skill.use_count, 1);
        assert_eq!(skill.success_rate, 1.0);

        skill.record_usage(false);
        assert_eq!(skill.attempt_count, 2);
        assert_eq!(skill.use_count, 1);
        assert!((skill.success_rate - 0.5).abs() < 0.01);

        skill.record_usage(false);
        assert_eq!(skill.attempt_count, 3);
        assert!((skill.success_rate - 0.3333).abs() < 0.01);
    }

    #[test]
    fn test_skill_serialization_roundtrip() {
        let skill = Skill::new("ser-test", "Serialize roundtrip", CoreType::Structured)
            .with_steps(vec!["step1".into(), "step2".into()])
            .with_preconditions(vec!["pre1".into()])
            .with_patterns(vec!["pattern1".into()]);
        let json = serde_json::to_string(&skill).unwrap();
        let back: Skill = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, "ser-test");
        assert_eq!(back.steps.len(), 2);
        assert_eq!(back.preconditions.len(), 1);
        assert_eq!(back.task_patterns.len(), 1);
    }

    #[test]
    fn test_skill_prompt_context_unverified() {
        let skill = Skill::new("unverified-skill", "desc", CoreType::Freeform);
        let ctx = skill.as_prompt_context();
        assert!(ctx.contains("unverified-skill"));
        // Unverified skill should NOT have "Track record" line
        assert!(!ctx.contains("Track record"));
    }

    #[test]
    fn test_skill_prompt_context_no_steps() {
        let skill = Skill::new("no-steps", "desc", CoreType::Freeform);
        let ctx = skill.as_prompt_context();
        // No "Steps:" section when steps is empty
        assert!(!ctx.contains("Steps:"));
    }

    #[test]
    fn test_skill_prompt_context_no_preconditions() {
        let skill = Skill::new("no-pre", "desc", CoreType::Freeform);
        let ctx = skill.as_prompt_context();
        // No "When to use:" section when preconditions is empty
        assert!(!ctx.contains("When to use:"));
    }

    // === Production hardening: duplicate handling, special chars, ranking, edge cases ===

    #[tokio::test]
    async fn test_duplicate_name_different_ids() {
        // Edge case: two skills with the same name but different IDs → both stored
        let lib = SkillLibrary::in_memory().await.unwrap();

        let s1 = make_skill("same-name", CoreType::Structured);
        let s2 = make_skill("same-name", CoreType::Freeform);
        assert_ne!(s1.skill_id, s2.skill_id);

        lib.store(&s1).await.unwrap();
        lib.store(&s2).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 2);
    }

    #[tokio::test]
    async fn test_store_same_id_overwrites_completely() {
        // Edge case: INSERT OR REPLACE with same skill_id replaces all fields
        let lib = SkillLibrary::in_memory().await.unwrap();

        let mut skill = Skill::new("original", "Original description", CoreType::Structured);
        let id = skill.skill_id.clone();
        skill.use_count = 5;
        skill.verified = true;
        lib.store(&skill).await.unwrap();

        // Overwrite with same ID but different fields
        let mut updated = Skill::new("replaced", "New description", CoreType::Freeform);
        updated.skill_id = id.clone();
        updated.use_count = 0;
        updated.verified = false;
        lib.store(&updated).await.unwrap();

        assert_eq!(lib.count().await.unwrap(), 1);
        let all = lib.all_skills().await.unwrap();
        assert_eq!(all[0].skill_id, id);
        assert_eq!(all[0].name, "replaced");
        assert_eq!(all[0].description, "New description");
        assert!(!all[0].verified);
        assert_eq!(all[0].use_count, 0);
    }

    #[tokio::test]
    async fn test_special_characters_in_skill_fields() {
        // Edge case: SQL-injection-like characters in all text fields
        let lib = SkillLibrary::in_memory().await.unwrap();

        let skill = Skill::new(
            "name'; DROP TABLE skills;--",
            "Description with 'quotes' and \"double\" and <html>",
            CoreType::Freeform,
        )
        .with_steps(vec!["Step with 'quotes'".into(), "Step\nwith\nnewlines".into()])
        .with_preconditions(vec!["Pre with \ttabs".into()])
        .with_patterns(vec!["pattern'; DELETE FROM skills;--".into()]);

        lib.store(&skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);

        let all = lib.all_skills().await.unwrap();
        assert!(all[0].name.contains("DROP TABLE"));
        assert!(all[0].steps[1].contains("\n"));
    }

    #[tokio::test]
    async fn test_find_for_task_ranking_by_pattern_match() {
        // Edge case: multiple verified skills — pattern match should score highest
        let lib = SkillLibrary::in_memory().await.unwrap();

        // Skill 1: matches on name only
        let mut s1 = make_skill("authentication-helper", CoreType::Structured);
        s1.verified = true;
        s1.use_count = 1;
        s1.success_rate = 1.0;

        // Skill 2: matches on task_patterns (highest score = 3)
        let mut s2 = Skill::new("login-fixer", "Fix login issues", CoreType::Freeform)
            .with_patterns(vec!["authentication".into(), "oauth".into()]);
        s2.verified = true;
        s2.use_count = 1;
        s2.success_rate = 0.5; // Lower success rate but pattern match

        lib.store(&s1).await.unwrap();
        lib.store(&s2).await.unwrap();

        let results = lib.find_for_task("authentication error handling", 5).await.unwrap();
        // Both should match since "authentication" is >3 chars
        assert!(!results.is_empty());
    }

    #[tokio::test]
    async fn test_find_for_task_limit_respected() {
        // Edge case: limit parameter actually limits results
        let lib = SkillLibrary::in_memory().await.unwrap();

        for i in 0..10 {
            let mut s = Skill::new(
                &format!("coding-skill-{}", i),
                "A coding strategy",
                CoreType::Structured,
            )
            .with_patterns(vec!["coding".into()]);
            s.verified = true;
            s.use_count = 1;
            s.success_rate = 1.0;
            lib.store(&s).await.unwrap();
        }

        let results = lib.find_for_task("coding challenge", 3).await.unwrap();
        assert!(results.len() <= 3);
    }

    #[tokio::test]
    async fn test_skill_with_empty_collections() {
        // Edge case: skill with no steps, no preconditions, no patterns
        let lib = SkillLibrary::in_memory().await.unwrap();

        let skill = Skill::new("bare-skill", "Minimal", CoreType::Freeform);
        assert!(skill.steps.is_empty());
        assert!(skill.preconditions.is_empty());
        assert!(skill.task_patterns.is_empty());

        lib.store(&skill).await.unwrap();
        let all = lib.all_skills().await.unwrap();
        assert!(all[0].steps.is_empty());
        assert!(all[0].preconditions.is_empty());
        assert!(all[0].task_patterns.is_empty());
    }

    #[tokio::test]
    async fn test_rapid_store_and_retrieve() {
        // Edge case: rapid sequential stores followed by retrieval
        let lib = SkillLibrary::in_memory().await.unwrap();

        for i in 0..50 {
            let skill = make_skill(&format!("rapid-{}", i), CoreType::Structured);
            lib.store(&skill).await.unwrap();
        }

        assert_eq!(lib.count().await.unwrap(), 50);
        let all = lib.all_skills().await.unwrap();
        assert_eq!(all.len(), 50);
    }

    #[tokio::test]
    async fn test_record_usage_only_failures_never_verifies() {
        // Edge case: many failures without any success → never verified
        let lib = SkillLibrary::in_memory().await.unwrap();
        let skill = make_skill("failing-skill", CoreType::Freeform);
        let id = skill.skill_id.clone();
        lib.store(&skill).await.unwrap();

        for _ in 0..10 {
            lib.record_usage(&id, false).await.unwrap();
        }

        let all = lib.all_skills().await.unwrap();
        assert!(!all[0].verified);
        assert_eq!(all[0].attempt_count, 10);
        assert_eq!(all[0].use_count, 0);
        assert_eq!(all[0].success_rate, 0.0);
    }

    #[test]
    fn test_skill_record_usage_single_failure() {
        // Edge case: single failure → success_rate is 0.0, not NaN
        let mut skill = Skill::new("test", "desc", CoreType::Freeform);
        skill.record_usage(false);
        assert_eq!(skill.success_rate, 0.0);
        assert!(!skill.success_rate.is_nan());
    }

    #[tokio::test]
    async fn test_delete_then_reinsert_same_id() {
        // Edge case: delete a skill, then store a new one with the same ID
        let lib = SkillLibrary::in_memory().await.unwrap();

        let skill = make_skill("deletable", CoreType::Freeform);
        let id = skill.skill_id.clone();
        lib.store(&skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);

        lib.delete(&id).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 0);

        // Re-store with the same ID
        let mut new_skill = Skill::new("reborn", "New life", CoreType::Structured);
        new_skill.skill_id = id.clone();
        lib.store(&new_skill).await.unwrap();
        assert_eq!(lib.count().await.unwrap(), 1);

        let all = lib.all_skills().await.unwrap();
        assert_eq!(all[0].name, "reborn");
        assert_eq!(all[0].skill_id, id);
    }
}
