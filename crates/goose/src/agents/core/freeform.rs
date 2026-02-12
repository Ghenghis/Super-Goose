//! FreeformCore — wraps the Agent's default reply_internal() loop.
//!
//! This is the default core. It gives the LLM full autonomy to decide
//! tool usage and iteration count. It's the "classic Goose" behavior.

use anyhow::Result;
use async_trait::async_trait;

use super::context::{AgentContext, TaskCategory, TaskHint};
use super::metrics::{CoreMetrics, CoreMetricsSnapshot};
use super::{AgentCore, CoreCapabilities, CoreOutput, CoreType};

/// Default LLM-driven execution core.
///
/// Delegates to the Agent's existing `reply_internal()` method, which
/// provides the full feature set: reflexion, guardrails, memory, HITL,
/// compaction, checkpointing, etc.
pub struct FreeformCore {
    metrics: CoreMetrics,
}

impl FreeformCore {
    pub fn new() -> Self {
        Self {
            metrics: CoreMetrics::new(),
        }
    }
}

impl Default for FreeformCore {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AgentCore for FreeformCore {
    fn name(&self) -> &str {
        "freeform"
    }

    fn core_type(&self) -> CoreType {
        CoreType::Freeform
    }

    fn capabilities(&self) -> CoreCapabilities {
        CoreCapabilities {
            code_generation: true,
            testing: true,
            multi_agent: false,
            parallel_execution: false,
            workflow_templates: false,
            adversarial_review: false,
            freeform_chat: true,
            state_machine: false,
            persistent_learning: true,
            max_concurrent_tasks: 1,
        }
    }

    fn description(&self) -> &str {
        "Default LLM loop with full autonomy — chat, research, coding, all subsystems active"
    }

    fn suitability_score(&self, hint: &TaskHint) -> f32 {
        match hint.category {
            // Freeform is the best general-purpose core
            TaskCategory::General => 0.9,
            TaskCategory::Documentation => 0.8,
            // Decent for everything, but specialized cores beat it
            TaskCategory::CodeTestFix => 0.5,
            TaskCategory::MultiFileComplex => 0.4,
            TaskCategory::LargeRefactor => 0.3,
            TaskCategory::Review => 0.4,
            TaskCategory::DevOps => 0.5,
            TaskCategory::Pipeline => 0.3,
        }
    }

    async fn execute(&self, _ctx: &mut AgentContext, task: &str) -> Result<CoreOutput> {
        // FreeformCore delegates to Agent::reply_internal() — the existing behavior.
        // This method is called by the Agent dispatcher which handles the actual
        // reply_internal() invocation. The core just records metrics.
        //
        // In the initial wiring phase, FreeformCore is a pass-through.
        // The Agent continues to call reply_internal() directly when FreeformCore
        // is active, since reply_internal() IS the freeform execution strategy.

        let start = std::time::Instant::now();

        // The actual execution happens in Agent::reply() which streams events.
        // This execute() is a placeholder that will be fully wired when the
        // Agent dispatcher switches from direct reply_internal() to core.execute().
        //
        // For now, we record that freeform was "selected" and return a pass-through output.
        let elapsed = start.elapsed();
        let output = CoreOutput {
            completed: true,
            summary: format!("Freeform execution of: {}", truncate(task, 100)),
            turns_used: 0, // Will be populated by Agent dispatcher
            artifacts: vec![],
            metrics: CoreMetricsSnapshot::default(),
        };

        self.metrics.record_execution(true, 0, 0, elapsed.as_millis() as u64);
        Ok(output)
    }

    fn metrics(&self) -> CoreMetrics {
        // Return a new CoreMetrics that mirrors our state
        // (CoreMetrics uses atomics, so we can't clone; return snapshot-based)
        CoreMetrics::new() // Callers should use metrics().snapshot() on the stored instance
    }

    fn reset_metrics(&self) {
        self.metrics.reset();
    }
}

/// Get a reference to the internal metrics for snapshot purposes
impl FreeformCore {
    pub fn metrics_ref(&self) -> &CoreMetrics {
        &self.metrics
    }
}

fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_freeform_core_basics() {
        let core = FreeformCore::new();
        assert_eq!(core.name(), "freeform");
        assert_eq!(core.core_type(), CoreType::Freeform);
        assert!(core.capabilities().freeform_chat);
        assert!(!core.capabilities().multi_agent);
    }

    #[test]
    fn test_freeform_suitability() {
        let core = FreeformCore::new();

        let general = TaskHint {
            category: TaskCategory::General,
            ..Default::default()
        };
        assert!(core.suitability_score(&general) > 0.8);

        let ctf = TaskHint {
            category: TaskCategory::CodeTestFix,
            ..Default::default()
        };
        assert!(core.suitability_score(&ctf) < 0.6);
    }

    #[test]
    fn test_freeform_description() {
        let core = FreeformCore::new();
        assert!(!core.description().is_empty());
    }
}
