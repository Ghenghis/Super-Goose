//! AdversarialCore — wraps the adversarial/ Coach/Player review system.
//!
//! Best for code review, security audits, and high-quality output tasks
//! where a Coach agent reviews all Player agent work before it reaches
//! the user.
//!
//! Phase 1.6: Now wired to real ReviewCycle with Coach/Player interaction.

use anyhow::Result;
use async_trait::async_trait;

use super::context::{AgentContext, TaskCategory, TaskHint};
use super::metrics::{CoreMetrics, CoreMetricsSnapshot};
use super::{truncate, AgentCore, CoreCapabilities, CoreOutput, CoreType};

use crate::agents::adversarial::{
    AdversarialConfig, ReviewCycle, ReviewOutcome, ReviewStats,
};

/// Adversarial Coach/Player execution core.
///
/// Wraps `ReviewCycle` to execute tasks where a Player agent does the work
/// and a Coach agent reviews it. Nothing reaches the user without Coach
/// approval (unless max_review_cycles exhausted). Supports self-improvement
/// where Player learns from Coach feedback between cycles.
pub struct AdversarialCore {
    metrics: CoreMetrics,
}

impl AdversarialCore {
    pub fn new() -> Self {
        Self {
            metrics: CoreMetrics::new(),
        }
    }

    pub fn metrics_ref(&self) -> &CoreMetrics {
        &self.metrics
    }
}

impl Default for AdversarialCore {
    fn default() -> Self {
        Self::new()
    }
}

/// Determine quality level from task description.
fn determine_quality_level(task: &str) -> QualityLevel {
    let lower = task.to_lowercase();

    if lower.contains("production") || lower.contains("security audit")
        || lower.contains("release") || lower.contains("critical")
        || lower.contains("strict")
    {
        QualityLevel::Strict
    } else if lower.contains("prototype") || lower.contains("draft")
        || lower.contains("quick") || lower.contains("rough")
        || lower.contains("relaxed")
    {
        QualityLevel::Relaxed
    } else {
        QualityLevel::Default
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum QualityLevel {
    Relaxed,
    Default,
    Strict,
}

/// Build AdversarialConfig from task analysis.
fn build_adversarial_config(task: &str) -> AdversarialConfig {
    let quality = determine_quality_level(task);

    // Determine max review cycles based on quality level derived from task analysis
    let max_cycles = match quality {
        QualityLevel::Strict => 5,  // Security, audit, critical tasks
        QualityLevel::Default => 3, // Normal tasks
        QualityLevel::Relaxed => 2, // Simple or low-risk tasks
    };

    // Enable self-improvement for multi-cycle tasks
    let enable_self_improvement = max_cycles > 1;

    AdversarialConfig {
        max_review_cycles: max_cycles,
        require_approval: true,
        enable_self_improvement,
        ..Default::default()
    }
}

/// Build a summary from review stats.
fn build_review_summary(task: &str, stats: &ReviewStats, quality: QualityLevel) -> String {
    let quality_label = match quality {
        QualityLevel::Relaxed => "relaxed",
        QualityLevel::Default => "default",
        QualityLevel::Strict => "strict",
    };

    let outcome_str = match &stats.final_outcome {
        ReviewOutcome::Approved => "APPROVED",
        ReviewOutcome::Rejected => "REJECTED",
        ReviewOutcome::MaxCyclesReached => "MAX CYCLES REACHED",
        ReviewOutcome::Error => "ERROR",
    };

    let trend = stats.improvement_trend();
    let trend_str = if trend > 0.1 {
        format!(" (improving: +{:.0}%)", trend * 100.0)
    } else if trend < -0.1 {
        format!(" (declining: {:.0}%)", trend * 100.0)
    } else {
        String::new()
    };

    let cycle_details: Vec<String> = stats
        .all_feedback
        .iter()
        .map(|f| {
            format!(
                "  Cycle {}: {:?} — quality {:.0}%{}",
                f.cycle,
                f.outcome,
                f.coach_review.quality_score * 100.0,
                if !f.coach_review.suggestions.is_empty() {
                    format!(" ({} suggestions)", f.coach_review.suggestions.len())
                } else {
                    String::new()
                },
            )
        })
        .collect();

    format!(
        "Adversarial review of: {}\n\
         Outcome: {} after {} cycle(s)\n\
         Quality: {:.0}% avg ({} standards){}\n\
         Duration: {}ms\n\
         {}",
        truncate(task, 60),
        outcome_str,
        stats.total_cycles,
        stats.avg_quality_score * 100.0,
        quality_label,
        trend_str,
        stats.total_duration_ms,
        cycle_details.join("\n"),
    )
}

#[async_trait]
impl AgentCore for AdversarialCore {
    fn name(&self) -> &str {
        "adversarial"
    }

    fn core_type(&self) -> CoreType {
        CoreType::Adversarial
    }

    fn capabilities(&self) -> CoreCapabilities {
        CoreCapabilities {
            code_generation: true,
            testing: true,
            multi_agent: true,
            parallel_execution: false,
            workflow_templates: false,
            adversarial_review: true,
            freeform_chat: false,
            state_machine: false,
            persistent_learning: true,
            max_concurrent_tasks: 2, // Player + Coach
        }
    }

    fn description(&self) -> &str {
        "Coach/Player adversarial review — security audits, code review, high-quality output"
    }

    fn suitability_score(&self, hint: &TaskHint) -> f32 {
        match hint.category {
            TaskCategory::Review => 0.95,
            TaskCategory::CodeTestFix => 0.6,
            TaskCategory::MultiFileComplex => 0.5,
            TaskCategory::DevOps => 0.4,
            TaskCategory::LargeRefactor => 0.5,
            TaskCategory::Documentation => 0.4,
            TaskCategory::Pipeline => 0.3,
            TaskCategory::General => 0.3,
        }
    }

    async fn execute(&self, _ctx: &mut AgentContext, task: &str) -> Result<CoreOutput> {
        let start = std::time::Instant::now();

        // 1. Determine quality level and build config
        let quality = determine_quality_level(task);
        let config = build_adversarial_config(task);

        // 2. Create review cycle with config
        let mut cycle = ReviewCycle::with_config(config);

        // 3. Execute with review (Player does work, Coach reviews)
        let stats = cycle.execute_with_review(task).await?;

        // 4. Determine completion status
        let completed = stats.final_outcome == ReviewOutcome::Approved;

        // 5. Build summary
        let summary = build_review_summary(task, &stats, quality);

        // 6. Collect artifacts
        let mut artifacts: Vec<String> = Vec::new();

        // Add file changes from player results
        for feedback in &stats.all_feedback {
            for file in &feedback.player_result.files_changed {
                let path_str = file.to_string_lossy().to_string();
                if !artifacts.contains(&path_str) {
                    artifacts.push(path_str);
                }
            }
        }

        // Add suggestions from coach reviews
        for feedback in &stats.all_feedback {
            for suggestion in &feedback.coach_review.suggestions {
                artifacts.push(format!("suggestion: {}", suggestion));
            }
        }

        let elapsed = start.elapsed();
        self.metrics.record_execution(
            completed,
            stats.total_cycles as u32,
            0,
            elapsed.as_millis() as u64,
        );

        Ok(CoreOutput {
            completed,
            summary,
            turns_used: stats.total_cycles as u32,
            artifacts,
            metrics: CoreMetricsSnapshot::default(),
        })
    }

    fn metrics(&self) -> CoreMetricsSnapshot {
        self.metrics.snapshot()
    }

    fn reset_metrics(&self) {
        self.metrics.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use crate::agents::core::context::AgentContext;
    use crate::agents::extension_manager::ExtensionManager;
    use crate::session::SessionManager;
    use crate::agents::observability::CostTracker;
    use crate::conversation::Conversation;

    async fn create_test_context() -> AgentContext {
        AgentContext::new(
            Arc::new(tokio::sync::Mutex::new(None)),
            Arc::new(ExtensionManager::new(
                Arc::new(tokio::sync::Mutex::new(None)),
                Arc::new(SessionManager::instance()),
            )),
            Arc::new(CostTracker::with_default_pricing()),
            Conversation::empty(),
            "test-adversarial".to_string(),
        )
    }

    #[test]
    fn test_adversarial_core_basics() {
        let core = AdversarialCore::new();
        assert_eq!(core.name(), "adversarial");
        assert_eq!(core.core_type(), CoreType::Adversarial);
        assert!(core.capabilities().adversarial_review);
        assert!(core.capabilities().multi_agent);
        assert_eq!(core.capabilities().max_concurrent_tasks, 2);
    }

    #[test]
    fn test_adversarial_suitability() {
        let core = AdversarialCore::new();

        let review = TaskHint {
            category: TaskCategory::Review,
            ..Default::default()
        };
        assert!(core.suitability_score(&review) > 0.9);

        let general = TaskHint {
            category: TaskCategory::General,
            ..Default::default()
        };
        assert!(core.suitability_score(&general) < 0.4);
    }

    #[test]
    fn test_determine_quality_strict() {
        assert_eq!(
            determine_quality_level("production security audit"),
            QualityLevel::Strict
        );
        assert_eq!(
            determine_quality_level("critical release review"),
            QualityLevel::Strict
        );
    }

    #[test]
    fn test_determine_quality_relaxed() {
        assert_eq!(
            determine_quality_level("quick prototype review"),
            QualityLevel::Relaxed
        );
        assert_eq!(
            determine_quality_level("rough draft check"),
            QualityLevel::Relaxed
        );
    }

    #[test]
    fn test_determine_quality_default() {
        assert_eq!(
            determine_quality_level("review the code changes"),
            QualityLevel::Default
        );
    }

    #[test]
    fn test_build_config_security() {
        let config = build_adversarial_config("security audit of the auth module");
        assert_eq!(config.max_review_cycles, 5);
        assert!(config.enable_self_improvement);
        assert!(config.require_approval);
    }

    #[test]
    fn test_build_config_review() {
        let config = build_adversarial_config("code review the PR changes");
        assert_eq!(config.max_review_cycles, 3);
    }

    #[test]
    fn test_build_config_default() {
        let config = build_adversarial_config("check this function");
        assert_eq!(config.max_review_cycles, 3);
    }

    #[tokio::test]
    async fn test_adversarial_core_execute_review() {
        let core = AdversarialCore::new();
        let mut ctx = create_test_context().await;

        let output = core
            .execute(&mut ctx, "review the authentication module")
            .await
            .unwrap();

        assert!(output.completed);
        assert!(output.summary.contains("APPROVED"));
        assert!(output.summary.contains("Adversarial review"));
        assert!(output.turns_used > 0);
    }

    #[tokio::test]
    async fn test_adversarial_core_execute_security() {
        let core = AdversarialCore::new();
        let mut ctx = create_test_context().await;

        let output = core
            .execute(&mut ctx, "security audit of the API endpoints")
            .await
            .unwrap();

        assert!(output.completed);
        assert!(output.summary.contains("APPROVED"));
    }

    #[tokio::test]
    async fn test_adversarial_core_metrics_recorded() {
        let core = AdversarialCore::new();
        let mut ctx = create_test_context().await;

        let _ = core.execute(&mut ctx, "review some code").await;
        let snap = core.metrics_ref().snapshot();
        assert!(snap.total_executions > 0);
    }
}
