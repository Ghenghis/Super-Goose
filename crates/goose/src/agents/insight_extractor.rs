//! InsightExtractor — ExpeL-style insight extraction from accumulated experiences.
//!
//! Analyzes patterns across stored experiences to extract reusable insights:
//! - Which cores work best for which task categories
//! - Common failure patterns and how to avoid them
//! - Cost/time optimization strategies
//! - Task decomposition patterns that lead to success
//!
//! Based on the ExpeL (Experience Learning) paradigm: accumulate experiences,
//! extract insights, apply insights to future tasks.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::agents::core::CoreType;
use crate::agents::experience_store::{CoreStats, ExperienceStore};

/// A single extracted insight with confidence and applicability.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insight {
    /// Unique identifier
    pub id: String,
    /// The insight text (human-readable recommendation)
    pub text: String,
    /// Category of insight (core-selection, failure-pattern, optimization, etc.)
    pub category: InsightCategory,
    /// How confident we are in this insight (0.0 - 1.0)
    pub confidence: f32,
    /// How many experiences support this insight
    pub evidence_count: u32,
    /// Which task categories this insight applies to
    pub applies_to: Vec<String>,
    /// Which core type this insight relates to (if any)
    pub related_core: Option<CoreType>,
}

/// Categories of insights that can be extracted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum InsightCategory {
    /// Which core to use for which task type
    CoreSelection,
    /// Patterns that lead to failures
    FailurePattern,
    /// How to optimize cost/time
    Optimization,
    /// Task decomposition strategies
    TaskDecomposition,
    /// General best practices
    BestPractice,
}

impl std::fmt::Display for InsightCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InsightCategory::CoreSelection => write!(f, "core-selection"),
            InsightCategory::FailurePattern => write!(f, "failure-pattern"),
            InsightCategory::Optimization => write!(f, "optimization"),
            InsightCategory::TaskDecomposition => write!(f, "task-decomposition"),
            InsightCategory::BestPractice => write!(f, "best-practice"),
        }
    }
}

impl Insight {
    /// Format this insight as a readable string for injection into prompts.
    pub fn as_prompt_context(&self) -> String {
        let confidence_label = match (self.confidence * 10.0) as u32 {
            0..=3 => "low confidence",
            4..=6 => "moderate confidence",
            _ => "high confidence",
        };
        format!(
            "- [{}] {} ({}, {} evidence runs)",
            self.category, self.text, confidence_label, self.evidence_count,
        )
    }
}

/// Extracts actionable insights from accumulated experiences.
pub struct InsightExtractor;

impl InsightExtractor {
    /// Extract all insights from the experience store.
    pub async fn extract(store: &ExperienceStore) -> Result<Vec<Insight>> {
        let mut insights = Vec::new();

        // 1. Core selection insights
        insights.extend(Self::extract_core_selection_insights(store).await?);

        // 2. Failure pattern insights
        insights.extend(Self::extract_failure_patterns(store).await?);

        // 3. Optimization insights
        insights.extend(Self::extract_optimization_insights(store).await?);

        // 4. Stored insights from experiences
        insights.extend(Self::extract_stored_insights(store).await?);

        Ok(insights)
    }

    /// Extract insights about which core works best for which task category.
    async fn extract_core_selection_insights(
        store: &ExperienceStore,
    ) -> Result<Vec<Insight>> {
        let cat_stats = store.get_category_core_stats().await?;
        let mut insights = Vec::new();

        // Group by category
        let mut by_category: HashMap<String, Vec<_>> = HashMap::new();
        for stat in &cat_stats {
            by_category
                .entry(stat.task_category.clone())
                .or_default()
                .push(stat);
        }

        for (category, stats) in &by_category {
            if stats.len() < 2 {
                continue; // Need at least 2 cores tried to compare
            }

            // Find best and worst
            let best = stats
                .iter()
                .max_by(|a, b| {
                    a.success_rate
                        .partial_cmp(&b.success_rate)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap();

            let worst = stats
                .iter()
                .min_by(|a, b| {
                    a.success_rate
                        .partial_cmp(&b.success_rate)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap();

            if best.success_rate > worst.success_rate + 0.2 {
                let total_evidence: u64 = stats.iter().map(|s| s.total_executions).sum();
                insights.push(Insight {
                    id: format!("cs-{}", category),
                    text: format!(
                        "For '{}' tasks, use {} ({}% success) instead of {} ({}% success)",
                        category,
                        best.core_type,
                        (best.success_rate * 100.0) as u32,
                        worst.core_type,
                        (worst.success_rate * 100.0) as u32,
                    ),
                    category: InsightCategory::CoreSelection,
                    confidence: (total_evidence as f32 / 20.0).min(1.0),
                    evidence_count: total_evidence as u32,
                    applies_to: vec![category.clone()],
                    related_core: Some(CoreType::from_str(&best.core_type)),
                });
            }
        }

        Ok(insights)
    }

    /// Extract insights about failure patterns.
    async fn extract_failure_patterns(store: &ExperienceStore) -> Result<Vec<Insight>> {
        let core_stats = store.get_core_stats().await?;
        let mut insights = Vec::new();

        for stat in &core_stats {
            if stat.total_executions < 3 {
                continue;
            }

            // High failure rate pattern
            if stat.success_rate < 0.5 {
                insights.push(Insight {
                    id: format!("fp-low-sr-{}", stat.core_type),
                    text: format!(
                        "{} core has a low success rate ({}%). Consider using a different core or investigating common failure causes.",
                        stat.core_type,
                        (stat.success_rate * 100.0) as u32,
                    ),
                    category: InsightCategory::FailurePattern,
                    confidence: (stat.total_executions as f32 / 10.0).min(1.0),
                    evidence_count: stat.total_executions as u32,
                    applies_to: vec![],
                    related_core: Some(CoreType::from_str(&stat.core_type)),
                });
            }

            // High turn count suggests inefficiency
            if stat.avg_turns > 15.0 && stat.success_rate > 0.5 {
                insights.push(Insight {
                    id: format!("fp-high-turns-{}", stat.core_type),
                    text: format!(
                        "{} core succeeds but uses many turns ({:.0} avg). Tasks may need better decomposition.",
                        stat.core_type, stat.avg_turns,
                    ),
                    category: InsightCategory::FailurePattern,
                    confidence: 0.6,
                    evidence_count: stat.total_executions as u32,
                    applies_to: vec![],
                    related_core: Some(CoreType::from_str(&stat.core_type)),
                });
            }
        }

        Ok(insights)
    }

    /// Extract cost/time optimization insights.
    async fn extract_optimization_insights(
        store: &ExperienceStore,
    ) -> Result<Vec<Insight>> {
        let core_stats = store.get_core_stats().await?;
        let mut insights = Vec::new();

        // Find cheapest effective core
        let effective: Vec<&CoreStats> = core_stats
            .iter()
            .filter(|s| s.success_rate >= 0.7 && s.total_executions >= 3)
            .collect();

        if effective.len() >= 2 {
            let cheapest = effective
                .iter()
                .min_by(|a, b| {
                    a.avg_cost
                        .partial_cmp(&b.avg_cost)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap();

            let most_expensive = effective
                .iter()
                .max_by(|a, b| {
                    a.avg_cost
                        .partial_cmp(&b.avg_cost)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap();

            if most_expensive.avg_cost > cheapest.avg_cost * 2.0 {
                insights.push(Insight {
                    id: "opt-cost".to_string(),
                    text: format!(
                        "{} is {:.1}x cheaper than {} with similar success rates ({:.0}% vs {:.0}%). Consider for budget-sensitive tasks.",
                        cheapest.core_type,
                        most_expensive.avg_cost / cheapest.avg_cost.max(0.001),
                        most_expensive.core_type,
                        cheapest.success_rate * 100.0,
                        most_expensive.success_rate * 100.0,
                    ),
                    category: InsightCategory::Optimization,
                    confidence: 0.7,
                    evidence_count: (cheapest.total_executions + most_expensive.total_executions) as u32,
                    applies_to: vec![],
                    related_core: Some(CoreType::from_str(&cheapest.core_type)),
                });
            }

            // Speed insight
            let fastest = effective
                .iter()
                .min_by(|a, b| {
                    a.avg_time_ms
                        .partial_cmp(&b.avg_time_ms)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap();

            let slowest = effective
                .iter()
                .max_by(|a, b| {
                    a.avg_time_ms
                        .partial_cmp(&b.avg_time_ms)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap();

            if slowest.avg_time_ms > fastest.avg_time_ms * 2.0 {
                insights.push(Insight {
                    id: "opt-speed".to_string(),
                    text: format!(
                        "{} is {:.1}x faster than {} with similar success rates. Consider for time-sensitive tasks.",
                        fastest.core_type,
                        slowest.avg_time_ms / fastest.avg_time_ms.max(1.0),
                        slowest.core_type,
                    ),
                    category: InsightCategory::Optimization,
                    confidence: 0.7,
                    evidence_count: (fastest.total_executions + slowest.total_executions) as u32,
                    applies_to: vec![],
                    related_core: Some(CoreType::from_str(&fastest.core_type)),
                });
            }
        }

        Ok(insights)
    }

    /// Collect and deduplicate stored insights from experiences.
    async fn extract_stored_insights(store: &ExperienceStore) -> Result<Vec<Insight>> {
        let raw_insights = store.get_insights(None).await?;
        let mut seen = std::collections::HashSet::new();
        let mut insights = Vec::new();

        for (i, text) in raw_insights.into_iter().enumerate() {
            let normalized = text.to_lowercase();
            if seen.insert(normalized) {
                insights.push(Insight {
                    id: format!("stored-{}", i),
                    text,
                    category: InsightCategory::BestPractice,
                    confidence: 0.5,
                    evidence_count: 1,
                    applies_to: vec![],
                    related_core: None,
                });
            }
        }

        Ok(insights)
    }

    /// Format insights as a human-readable summary.
    pub fn format_insights(insights: &[Insight]) -> String {
        if insights.is_empty() {
            return "No insights extracted yet. Run more tasks to build experience.".to_string();
        }

        let mut sections: HashMap<InsightCategory, Vec<&Insight>> = HashMap::new();
        for insight in insights {
            sections.entry(insight.category).or_default().push(insight);
        }

        let mut output = String::new();
        output.push_str(&format!("=== {} Insights Extracted ===\n\n", insights.len()));

        let order = [
            InsightCategory::CoreSelection,
            InsightCategory::FailurePattern,
            InsightCategory::Optimization,
            InsightCategory::TaskDecomposition,
            InsightCategory::BestPractice,
        ];

        for cat in &order {
            if let Some(items) = sections.get(cat) {
                output.push_str(&format!("## {}\n", cat));
                for insight in items {
                    let confidence_bar = match (insight.confidence * 10.0) as u32 {
                        0..=3 => "LOW",
                        4..=6 => "MED",
                        _ => "HIGH",
                    };
                    output.push_str(&format!(
                        "  [{}] {} (evidence: {} runs)\n",
                        confidence_bar, insight.text, insight.evidence_count,
                    ));
                }
                output.push('\n');
            }
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::experience_store::Experience;

    fn make_exp(
        task: &str,
        core: CoreType,
        ok: bool,
        turns: u32,
        cost: f64,
        time: u64,
        cat: &str,
    ) -> Experience {
        Experience::new(task, core, ok, turns, cost, time).with_category(cat)
    }

    #[tokio::test]
    async fn test_extract_core_selection_insights() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Structured excels at code-test-fix
        for _ in 0..5 {
            store
                .store(&make_exp("fix", CoreType::Structured, true, 5, 0.02, 1000, "code-test-fix"))
                .await.unwrap();
        }

        // Freeform struggles at code-test-fix
        for i in 0..5 {
            store
                .store(&make_exp("fix", CoreType::Freeform, i < 1, 12, 0.05, 3000, "code-test-fix"))
                .await.unwrap();
        }

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let core_sel: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::CoreSelection)
            .collect();

        assert!(!core_sel.is_empty());
        assert!(core_sel[0].text.contains("structured"));
        assert!(core_sel[0].text.contains("code-test-fix"));
    }

    #[tokio::test]
    async fn test_extract_failure_patterns() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Swarm has low success rate
        for i in 0..6 {
            store
                .store(&make_exp("task", CoreType::Swarm, i < 2, 8, 0.05, 2000, "general"))
                .await.unwrap();
        }

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let failures: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::FailurePattern)
            .collect();

        assert!(!failures.is_empty());
        assert!(failures[0].text.contains("swarm"));
        assert!(failures[0].text.contains("low success rate"));
    }

    #[tokio::test]
    async fn test_extract_optimization_insights() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Freeform: cheap and effective
        for _ in 0..5 {
            store
                .store(&make_exp("task", CoreType::Freeform, true, 4, 0.01, 500, "general"))
                .await.unwrap();
        }

        // Orchestrator: expensive but also effective
        for _ in 0..5 {
            store
                .store(&make_exp("task", CoreType::Orchestrator, true, 8, 0.10, 3000, "general"))
                .await.unwrap();
        }

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let opts: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::Optimization)
            .collect();

        // Should have cost + speed insights
        assert!(opts.len() >= 1);
    }

    #[tokio::test]
    async fn test_extract_stored_insights() {
        let store = ExperienceStore::in_memory().await.unwrap();

        let exp = Experience::new("task", CoreType::Freeform, true, 3, 0.01, 500)
            .with_insights(vec![
                "Always run tests before committing".into(),
                "Break complex tasks into subtasks".into(),
            ]);
        store.store(&exp).await.unwrap();

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let stored: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::BestPractice)
            .collect();

        assert_eq!(stored.len(), 2);
    }

    #[tokio::test]
    async fn test_format_insights() {
        let insights = vec![
            Insight {
                id: "test-1".into(),
                text: "Use structured for CTF tasks".into(),
                category: InsightCategory::CoreSelection,
                confidence: 0.9,
                evidence_count: 15,
                applies_to: vec!["code-test-fix".into()],
                related_core: Some(CoreType::Structured),
            },
            Insight {
                id: "test-2".into(),
                text: "Freeform is 3x cheaper".into(),
                category: InsightCategory::Optimization,
                confidence: 0.7,
                evidence_count: 10,
                applies_to: vec![],
                related_core: Some(CoreType::Freeform),
            },
        ];

        let formatted = InsightExtractor::format_insights(&insights);
        assert!(formatted.contains("2 Insights Extracted"));
        assert!(formatted.contains("Use structured for CTF tasks"));
        assert!(formatted.contains("Freeform is 3x cheaper"));
    }

    #[tokio::test]
    async fn test_empty_store_no_insights() {
        let store = ExperienceStore::in_memory().await.unwrap();
        let insights = InsightExtractor::extract(&store).await.unwrap();
        assert!(insights.is_empty());
    }

    #[tokio::test]
    async fn test_deduplicates_stored_insights() {
        let store = ExperienceStore::in_memory().await.unwrap();

        // Same insight in two experiences
        let e1 = Experience::new("task1", CoreType::Freeform, true, 3, 0.01, 500)
            .with_insights(vec!["Always run tests".into()]);
        let e2 = Experience::new("task2", CoreType::Freeform, true, 3, 0.01, 500)
            .with_insights(vec!["Always run tests".into()]);
        store.store(&e1).await.unwrap();
        store.store(&e2).await.unwrap();

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let stored: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::BestPractice)
            .collect();

        // Should be deduplicated to 1
        assert_eq!(stored.len(), 1);
    }

    // ── Edge-case tests ────────────────────────────────────────────────

    #[tokio::test]
    async fn test_no_core_selection_insight_with_single_core() {
        // Core selection requires at least 2 cores tried in a category
        let store = ExperienceStore::in_memory().await.unwrap();
        for _ in 0..5 {
            store
                .store(&make_exp("task", CoreType::Structured, true, 5, 0.02, 1000, "coding"))
                .await.unwrap();
        }
        let insights = InsightExtractor::extract(&store).await.unwrap();
        let cs: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::CoreSelection)
            .collect();
        assert!(cs.is_empty(), "No core selection insight with only one core tried");
    }

    #[tokio::test]
    async fn test_no_failure_pattern_below_threshold() {
        // Failure patterns require at least 3 executions per core
        let store = ExperienceStore::in_memory().await.unwrap();
        // Only 2 executions — under threshold
        store.store(&make_exp("task", CoreType::Swarm, false, 8, 0.05, 2000, "x")).await.unwrap();
        store.store(&make_exp("task", CoreType::Swarm, false, 8, 0.05, 2000, "x")).await.unwrap();

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let fp: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::FailurePattern)
            .collect();
        assert!(fp.is_empty(), "No failure pattern with < 3 executions");
    }

    #[tokio::test]
    async fn test_no_optimization_with_single_effective_core() {
        // Optimization insights need >= 2 effective (>=70% success, >=3 runs) cores
        let store = ExperienceStore::in_memory().await.unwrap();
        for _ in 0..5 {
            store
                .store(&make_exp("task", CoreType::Freeform, true, 4, 0.01, 500, "general"))
                .await.unwrap();
        }
        // A second core that doesn't meet threshold (low success rate)
        for i in 0..5 {
            store
                .store(&make_exp("task", CoreType::Swarm, i < 1, 8, 0.05, 2000, "general"))
                .await.unwrap();
        }

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let opts: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::Optimization)
            .collect();
        assert!(opts.is_empty(), "No optimization insight with only one effective core");
    }

    #[tokio::test]
    async fn test_case_insensitive_dedup_stored_insights() {
        let store = ExperienceStore::in_memory().await.unwrap();
        let e1 = Experience::new("task1", CoreType::Freeform, true, 3, 0.01, 500)
            .with_insights(vec!["Always Run Tests".into()]);
        let e2 = Experience::new("task2", CoreType::Freeform, true, 3, 0.01, 500)
            .with_insights(vec!["always run tests".into()]);
        store.store(&e1).await.unwrap();
        store.store(&e2).await.unwrap();

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let stored: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::BestPractice)
            .collect();
        // Case-insensitive dedup → should be 1
        assert_eq!(stored.len(), 1);
    }

    #[test]
    fn test_format_empty_insights() {
        let out = InsightExtractor::format_insights(&[]);
        assert_eq!(out, "No insights extracted yet. Run more tasks to build experience.");
    }

    #[tokio::test]
    async fn test_core_selection_not_triggered_with_small_difference() {
        // Two cores with similar success rates (< 0.2 gap) → no insight
        let store = ExperienceStore::in_memory().await.unwrap();
        for _ in 0..5 {
            store
                .store(&make_exp("task", CoreType::Structured, true, 5, 0.02, 1000, "coding"))
                .await.unwrap();
        }
        // Freeform: 4/5 = 0.8, Structured: 5/5 = 1.0 → gap = 0.2, need > 0.2
        for i in 0..5 {
            store
                .store(&make_exp("task", CoreType::Freeform, i < 4, 5, 0.02, 1000, "coding"))
                .await.unwrap();
        }

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let cs: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::CoreSelection)
            .collect();
        // 1.0 vs 0.8 = 0.2 difference, condition is > 0.2 so no insight
        assert!(cs.is_empty(), "No core selection insight with gap == 0.2");
    }

    #[test]
    fn test_insight_category_display() {
        assert_eq!(InsightCategory::CoreSelection.to_string(), "core-selection");
        assert_eq!(InsightCategory::FailurePattern.to_string(), "failure-pattern");
        assert_eq!(InsightCategory::Optimization.to_string(), "optimization");
        assert_eq!(InsightCategory::TaskDecomposition.to_string(), "task-decomposition");
        assert_eq!(InsightCategory::BestPractice.to_string(), "best-practice");
    }

    #[tokio::test]
    async fn test_high_turn_count_insight() {
        // High avg turns (>15) with decent success rate triggers a failure pattern
        let store = ExperienceStore::in_memory().await.unwrap();
        for _ in 0..5 {
            store
                .store(&make_exp("task", CoreType::Orchestrator, true, 25, 0.10, 5000, "complex"))
                .await.unwrap();
        }

        let insights = InsightExtractor::extract(&store).await.unwrap();
        let fp: Vec<_> = insights
            .iter()
            .filter(|i| i.category == InsightCategory::FailurePattern && i.text.contains("turns"))
            .collect();
        assert!(!fp.is_empty(), "High turn count should generate a failure pattern insight");
    }

    #[test]
    fn test_insight_as_prompt_context_confidence_labels() {
        // Low confidence (0.2)
        let low = Insight {
            id: "l".into(), text: "test".into(),
            category: InsightCategory::BestPractice,
            confidence: 0.2, evidence_count: 1,
            applies_to: vec![], related_core: None,
        };
        assert!(low.as_prompt_context().contains("low confidence"));

        // Moderate confidence (0.5)
        let med = Insight {
            id: "m".into(), text: "test".into(),
            category: InsightCategory::BestPractice,
            confidence: 0.5, evidence_count: 5,
            applies_to: vec![], related_core: None,
        };
        assert!(med.as_prompt_context().contains("moderate confidence"));

        // High confidence (0.9)
        let high = Insight {
            id: "h".into(), text: "test".into(),
            category: InsightCategory::BestPractice,
            confidence: 0.9, evidence_count: 20,
            applies_to: vec![], related_core: None,
        };
        assert!(high.as_prompt_context().contains("high confidence"));
    }

    #[test]
    fn test_insight_serialization_roundtrip() {
        let insight = Insight {
            id: "test-ser".into(),
            text: "Serialize me".into(),
            category: InsightCategory::Optimization,
            confidence: 0.75,
            evidence_count: 10,
            applies_to: vec!["coding".into()],
            related_core: Some(CoreType::Structured),
        };
        let json = serde_json::to_string(&insight).unwrap();
        let back: Insight = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "test-ser");
        assert_eq!(back.evidence_count, 10);
        assert_eq!(back.category, InsightCategory::Optimization);
    }

    #[test]
    fn test_format_insights_groups_by_category() {
        let insights = vec![
            Insight {
                id: "a".into(), text: "Core A is best".into(),
                category: InsightCategory::CoreSelection,
                confidence: 0.8, evidence_count: 10,
                applies_to: vec![], related_core: None,
            },
            Insight {
                id: "b".into(), text: "Failure X".into(),
                category: InsightCategory::FailurePattern,
                confidence: 0.6, evidence_count: 5,
                applies_to: vec![], related_core: None,
            },
            Insight {
                id: "c".into(), text: "Best practice Y".into(),
                category: InsightCategory::BestPractice,
                confidence: 0.4, evidence_count: 2,
                applies_to: vec![], related_core: None,
            },
        ];
        let formatted = InsightExtractor::format_insights(&insights);
        assert!(formatted.contains("3 Insights Extracted"));
        // Sections appear in order
        let cs_pos = formatted.find("core-selection").unwrap();
        let fp_pos = formatted.find("failure-pattern").unwrap();
        let bp_pos = formatted.find("best-practice").unwrap();
        assert!(cs_pos < fp_pos);
        assert!(fp_pos < bp_pos);
    }
}
