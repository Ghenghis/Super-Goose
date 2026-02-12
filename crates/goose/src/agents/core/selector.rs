//! CoreSelector — auto-selects the best core based on historical experience data.
//!
//! Uses ExperienceStore data to pick the core with the highest success rate
//! for the detected task category. Falls back to suitability scoring from
//! the AgentCoreRegistry when no historical data is available.
//!
//! # Selection Strategy
//!
//! 1. Categorize the task via keyword analysis
//! 2. Query ExperienceStore for best-performing core in that category
//! 3. If enough data points exist (>= min_experiences), use the historical winner
//! 4. Otherwise, fall back to static suitability scores from registered cores

use std::sync::Arc;

use super::context::{TaskCategory, TaskHint};
use super::registry::AgentCoreRegistry;
use super::CoreType;
use crate::agents::experience_store::ExperienceStore;

/// Result of a core selection — includes rationale for observability.
#[derive(Debug, Clone)]
pub struct SelectionResult {
    /// The selected core type
    pub core_type: CoreType,
    /// Human-readable explanation of why this core was chosen
    pub rationale: String,
    /// Whether the selection was based on historical data
    pub from_experience: bool,
    /// The detected task category
    pub category: String,
    /// Confidence (0.0 - 1.0) — higher when based on more data
    pub confidence: f64,
}

/// Auto-selects the best core for a task based on experience data + static scores.
pub struct CoreSelector {
    /// Shared experience store for querying historical performance
    experience_store: Option<Arc<ExperienceStore>>,
    /// Default core when no data and no registry available
    default_core: CoreType,
    /// Minimum data points before trusting historical stats
    min_experiences: u32,
}

impl CoreSelector {
    /// Create a new CoreSelector.
    pub fn new(
        experience_store: Option<Arc<ExperienceStore>>,
        default_core: CoreType,
        min_experiences: u32,
    ) -> Self {
        Self {
            experience_store,
            default_core,
            min_experiences,
        }
    }

    /// Create a CoreSelector with default settings (Freeform fallback, 3 min experiences).
    pub fn with_defaults(experience_store: Option<Arc<ExperienceStore>>) -> Self {
        Self::new(experience_store, CoreType::Freeform, 3)
    }

    /// Categorize a task description into a TaskCategory string for DB lookup.
    ///
    /// Returns the category string as stored in ExperienceStore
    /// (e.g. "code-test-fix", "large-refactor", "review", etc.)
    pub fn categorize_task(task: &str) -> String {
        let lower = task.to_lowercase();

        if (lower.contains("test") && lower.contains("fix"))
            || (lower.contains("code") && lower.contains("test"))
            || lower.contains("debug")
            || lower.contains("bug fix")
        {
            "code-test-fix".to_string()
        } else if lower.contains("refactor")
            && (lower.contains("all")
                || lower.contains("many")
                || lower.contains("every")
                || lower.contains("entire")
                || lower.contains("across"))
        {
            "large-refactor".to_string()
        } else if lower.contains("review") || lower.contains("security") || lower.contains("audit")
        {
            "review".to_string()
        } else if lower.contains("deploy")
            || lower.contains("release")
            || lower.contains("ci/cd")
            || lower.contains("ci ")
            || lower.contains("pipeline")
        {
            "devops".to_string()
        } else if lower.contains("doc") || lower.contains("readme") || lower.contains("comment") {
            "documentation".to_string()
        } else if lower.contains("research")
            || lower.contains("explain")
            || lower.contains("understand")
            || lower.contains("help me")
        {
            "general".to_string()
        } else {
            "general".to_string()
        }
    }

    /// Map a TaskCategory enum to the category string used in ExperienceStore.
    pub fn category_to_string(category: &TaskCategory) -> String {
        match category {
            TaskCategory::General => "general".to_string(),
            TaskCategory::CodeTestFix => "code-test-fix".to_string(),
            TaskCategory::MultiFileComplex => "multi-file-complex".to_string(),
            TaskCategory::LargeRefactor => "large-refactor".to_string(),
            TaskCategory::Review => "review".to_string(),
            TaskCategory::DevOps => "devops".to_string(),
            TaskCategory::Documentation => "documentation".to_string(),
            TaskCategory::Pipeline => "pipeline".to_string(),
        }
    }

    /// Select the best core for a task description.
    ///
    /// Strategy:
    /// 1. Categorize the task
    /// 2. Query experience store for the best core in that category
    /// 3. If historical data has enough samples, use it
    /// 4. Otherwise fall back to registry suitability scoring or default
    pub async fn select_core(
        &self,
        task: &str,
        registry: Option<&AgentCoreRegistry>,
    ) -> SelectionResult {
        let category = Self::categorize_task(task);
        self.select_for_category(&category, task, registry).await
    }

    /// Select the best core using a pre-computed TaskHint.
    ///
    /// Uses the hint's category directly (skipping keyword analysis).
    pub async fn select_with_hint(
        &self,
        hint: &TaskHint,
        registry: Option<&AgentCoreRegistry>,
    ) -> SelectionResult {
        // If the user explicitly requested a core, honor it
        if let Some(preferred) = hint.user_preference {
            return SelectionResult {
                core_type: preferred,
                rationale: format!("User explicitly requested {} core", preferred),
                from_experience: false,
                category: Self::category_to_string(&hint.category),
                confidence: 1.0,
            };
        }

        let category = Self::category_to_string(&hint.category);
        self.select_for_category(&category, &hint.description, registry)
            .await
    }

    /// Internal: select for a given category string.
    async fn select_for_category(
        &self,
        category: &str,
        task: &str,
        registry: Option<&AgentCoreRegistry>,
    ) -> SelectionResult {
        // Step 1: Try experience-based selection
        if let Some(ref store) = self.experience_store {
            match store.best_core_for_category(category).await {
                Ok(Some((core_str, success_rate))) => {
                    let core_type = CoreType::from_str(&core_str);
                    return SelectionResult {
                        core_type,
                        rationale: format!(
                            "Selected {} based on {:.0}% success rate for '{}' tasks (historical data)",
                            core_type,
                            success_rate * 100.0,
                            category
                        ),
                        from_experience: true,
                        category: category.to_string(),
                        confidence: success_rate,
                    };
                }
                Ok(None) => {
                    // No data or not enough samples — fall through to static scoring
                }
                Err(e) => {
                    tracing::warn!(
                        "CoreSelector: failed to query experience store: {}",
                        e
                    );
                    // Fall through to static scoring
                }
            }
        }

        // Step 2: Fall back to registry suitability scoring
        if let Some(reg) = registry {
            let hint = TaskHint::from_message(task);
            let (recommended, score) = reg.recommend_core(&hint);
            return SelectionResult {
                core_type: recommended,
                rationale: format!(
                    "Selected {} via suitability scoring ({:.0}% match for '{}' tasks, no historical data)",
                    recommended,
                    score * 100.0,
                    category
                ),
                from_experience: false,
                category: category.to_string(),
                confidence: score as f64,
            };
        }

        // Step 3: No store, no registry — use default
        SelectionResult {
            core_type: self.default_core,
            rationale: format!(
                "Defaulting to {} (no experience data or registry available)",
                self.default_core
            ),
            from_experience: false,
            category: category.to_string(),
            confidence: 0.5,
        }
    }

    /// Format a human-readable rationale for the last selection.
    /// Convenience wrapper — the rationale is already in SelectionResult.
    pub fn format_selection_rationale(result: &SelectionResult) -> String {
        let source = if result.from_experience {
            "historical performance data"
        } else {
            "static suitability scoring"
        };
        format!(
            "{} (category: {}, confidence: {:.0}%, source: {})",
            result.rationale,
            result.category,
            result.confidence * 100.0,
            source
        )
    }

    /// Get the configured minimum experience threshold.
    pub fn min_experiences(&self) -> u32 {
        self.min_experiences
    }

    /// Get the configured default core type.
    pub fn default_core(&self) -> CoreType {
        self.default_core
    }

    /// Update the experience store reference (e.g. after lazy initialization).
    pub fn set_experience_store(&mut self, store: Arc<ExperienceStore>) {
        self.experience_store = Some(store);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Test 1: Default fallback ──────────────────────────────────────

    #[tokio::test]
    async fn test_selector_defaults_to_freeform() {
        let selector = CoreSelector::with_defaults(None);
        let result = selector.select_core("do something", None).await;

        assert_eq!(result.core_type, CoreType::Freeform);
        assert!(!result.from_experience);
        assert!(result.rationale.contains("Defaulting to freeform"));
    }

    // ── Test 2: Task categorization — code tasks ──────────────────────

    #[test]
    fn test_selector_categorizes_code_tasks() {
        assert_eq!(
            CoreSelector::categorize_task("fix the failing test in auth"),
            "code-test-fix"
        );
        assert_eq!(
            CoreSelector::categorize_task("debug this authentication bug"),
            "code-test-fix"
        );
        assert_eq!(
            CoreSelector::categorize_task("code test and fix the parser"),
            "code-test-fix"
        );
    }

    // ── Test 3: Task categorization — refactor tasks ──────────────────

    #[test]
    fn test_selector_categorizes_refactor_tasks() {
        assert_eq!(
            CoreSelector::categorize_task("refactor all handler functions across modules"),
            "large-refactor"
        );
        assert_eq!(
            CoreSelector::categorize_task("refactor every test in the crate"),
            "large-refactor"
        );
        // Simple "refactor" without scope keywords → general
        assert_eq!(
            CoreSelector::categorize_task("refactor this function"),
            "general"
        );
    }

    // ── Test 4: Experience-based selection ─────────────────────────────

    #[tokio::test]
    async fn test_selector_uses_experience_data() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Populate: structured excels at code-test-fix (5/5 success, above threshold)
        for _ in 0..5 {
            let exp = crate::agents::experience_store::Experience::new(
                "Fix bug",
                CoreType::Structured,
                true,
                6,
                0.02,
                1000,
            )
            .with_category("code-test-fix");
            store.store(&exp).await.unwrap();
        }

        // Freeform struggles at code-test-fix (1/4 success)
        for i in 0..4 {
            let exp = crate::agents::experience_store::Experience::new(
                "Fix bug",
                CoreType::Freeform,
                i < 1,
                10,
                0.05,
                2000,
            )
            .with_category("code-test-fix");
            store.store(&exp).await.unwrap();
        }

        let selector = CoreSelector::with_defaults(Some(Arc::new(store)));
        let result = selector
            .select_core("fix the failing test suite", None)
            .await;

        assert_eq!(result.core_type, CoreType::Structured);
        assert!(result.from_experience);
        assert!(result.rationale.contains("success rate"));
        assert_eq!(result.category, "code-test-fix");
    }

    // ── Test 5: Fallback without store ────────────────────────────────

    #[tokio::test]
    async fn test_selector_falls_back_without_store() {
        // No experience store, but with registry
        let registry = AgentCoreRegistry::new();
        let selector = CoreSelector::with_defaults(None);

        let result = selector
            .select_core("fix the failing tests", Some(&registry))
            .await;

        // Should use registry suitability scoring (structured scores high for code-test-fix)
        assert_eq!(result.core_type, CoreType::Structured);
        assert!(!result.from_experience);
        assert!(result.rationale.contains("suitability scoring"));
    }

    // ── Test 6: Selection with TaskHint ───────────────────────────────

    #[tokio::test]
    async fn test_selector_with_task_hint() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Orchestrator dominates large-refactor (4/5 success)
        for i in 0..5 {
            let exp = crate::agents::experience_store::Experience::new(
                "Refactor auth",
                CoreType::Orchestrator,
                i < 4,
                12,
                0.10,
                3000,
            )
            .with_category("large-refactor");
            store.store(&exp).await.unwrap();
        }

        let selector = CoreSelector::with_defaults(Some(Arc::new(store)));
        let hint = TaskHint {
            description: "refactor all auth modules".to_string(),
            category: TaskCategory::LargeRefactor,
            ..Default::default()
        };

        let result = selector.select_with_hint(&hint, None).await;

        assert_eq!(result.core_type, CoreType::Orchestrator);
        assert!(result.from_experience);
        assert_eq!(result.category, "large-refactor");
    }

    // ── Test 7: Min experiences threshold ──────────────────────────────

    #[tokio::test]
    async fn test_selector_min_experiences_threshold() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Only 2 experiences for "review" — below the default threshold of 3
        // (ExperienceStore.best_core_for_category has HAVING COUNT(*) >= 3)
        for _ in 0..2 {
            let exp = crate::agents::experience_store::Experience::new(
                "Review PR",
                CoreType::Adversarial,
                true,
                8,
                0.05,
                2000,
            )
            .with_category("review");
            store.store(&exp).await.unwrap();
        }

        let registry = AgentCoreRegistry::new();
        let selector = CoreSelector::with_defaults(Some(Arc::new(store)));

        let result = selector
            .select_core("review this PR for security issues", Some(&registry))
            .await;

        // Should NOT use experience data (below threshold) — falls back to registry
        assert!(!result.from_experience);
        // Registry should recommend adversarial for review tasks
        assert_eq!(result.core_type, CoreType::Adversarial);
    }

    // ── Test 8: Format rationale ──────────────────────────────────────

    #[test]
    fn test_format_rationale() {
        let result = SelectionResult {
            core_type: CoreType::Orchestrator,
            rationale: "Selected orchestrator based on 85% success rate for 'large-refactor' tasks (historical data)".to_string(),
            from_experience: true,
            category: "large-refactor".to_string(),
            confidence: 0.85,
        };

        let formatted = CoreSelector::format_selection_rationale(&result);
        assert!(formatted.contains("orchestrator"));
        assert!(formatted.contains("large-refactor"));
        assert!(formatted.contains("85%"));
        assert!(formatted.contains("historical performance data"));
    }

    // ── Test 9: User preference overrides everything ──────────────────

    #[tokio::test]
    async fn test_selector_user_preference_overrides() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Even though structured dominates code-test-fix...
        for _ in 0..10 {
            let exp = crate::agents::experience_store::Experience::new(
                "Fix bug",
                CoreType::Structured,
                true,
                5,
                0.02,
                1000,
            )
            .with_category("code-test-fix");
            store.store(&exp).await.unwrap();
        }

        let selector = CoreSelector::with_defaults(Some(Arc::new(store)));

        // ...user explicitly wants swarm
        let hint = TaskHint {
            description: "fix the tests".to_string(),
            category: TaskCategory::CodeTestFix,
            user_preference: Some(CoreType::Swarm),
            ..Default::default()
        };

        let result = selector.select_with_hint(&hint, None).await;
        assert_eq!(result.core_type, CoreType::Swarm);
        assert!(!result.from_experience);
        assert!(result.rationale.contains("User explicitly requested"));
        assert_eq!(result.confidence, 1.0);
    }

    // ── Test 10: Category string mapping ──────────────────────────────

    #[test]
    fn test_category_to_string_mapping() {
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::General),
            "general"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::CodeTestFix),
            "code-test-fix"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::LargeRefactor),
            "large-refactor"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::Review),
            "review"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::DevOps),
            "devops"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::Documentation),
            "documentation"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::Pipeline),
            "pipeline"
        );
        assert_eq!(
            CoreSelector::category_to_string(&TaskCategory::MultiFileComplex),
            "multi-file-complex"
        );
    }

    // ── Test 11: Categorize edge cases ────────────────────────────────

    #[test]
    fn test_categorize_additional_patterns() {
        assert_eq!(
            CoreSelector::categorize_task("review the security audit report"),
            "review"
        );
        assert_eq!(
            CoreSelector::categorize_task("deploy the release to staging"),
            "devops"
        );
        assert_eq!(
            CoreSelector::categorize_task("write documentation for the API"),
            "documentation"
        );
        assert_eq!(
            CoreSelector::categorize_task("explain how the router works"),
            "general"
        );
        assert_eq!(
            CoreSelector::categorize_task("help me understand async"),
            "general"
        );
        assert_eq!(
            CoreSelector::categorize_task("run the CI/CD pipeline"),
            "devops"
        );
    }
}
