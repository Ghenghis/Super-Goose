//! Swappable Agent Core System
//!
//! Provides a trait-based abstraction over different execution strategies.
//! Each core wraps an existing subsystem (state_graph, orchestrator, swarm, etc.)
//! and presents a unified interface for hot-swappable execution.
//!
//! # Architecture
//!
//! ```text
//! Agent::reply()
//!   └── AgentCoreRegistry::active_core()
//!         ├── FreeformCore      — wraps reply_internal() (default LLM loop)
//!         ├── StructuredCore    — wraps state_graph/ (Code→Test→Fix FSM)
//!         ├── OrchestratorCore  — wraps orchestrator + specialists (DAG tasks)
//!         ├── SwarmCore         — wraps swarm + team (parallel agents)
//!         ├── WorkflowCore      — wraps workflow_engine (template pipelines)
//!         └── AdversarialCore   — wraps adversarial/ (Coach/Player review)
//! ```

pub mod context;
pub mod freeform;
pub mod structured;
pub mod orchestrator_core;
pub mod swarm_core;
pub mod workflow_core;
pub mod adversarial_core;
pub mod registry;
pub mod metrics;

pub use context::{AgentContext, TaskHint, TaskCategory};
pub use freeform::FreeformCore;
pub use structured::StructuredCore;
pub use orchestrator_core::OrchestratorCore;
pub use swarm_core::SwarmCore;
pub use workflow_core::WorkflowCore;
pub use adversarial_core::AdversarialCore;
pub use registry::AgentCoreRegistry;
pub use metrics::{CoreMetrics, CoreMetricsSnapshot};

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Capabilities a core supports — used for suitability scoring and UI display
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CoreCapabilities {
    /// Can execute code generation tasks
    pub code_generation: bool,
    /// Can run test suites and validate
    pub testing: bool,
    /// Can coordinate multiple specialist agents
    pub multi_agent: bool,
    /// Can process tasks in parallel
    pub parallel_execution: bool,
    /// Can follow template-based workflows
    pub workflow_templates: bool,
    /// Can perform adversarial review cycles
    pub adversarial_review: bool,
    /// Can do open-ended chat and research
    pub freeform_chat: bool,
    /// Can handle deterministic state machines
    pub state_machine: bool,
    /// Supports persistent learning from outcomes
    pub persistent_learning: bool,
    /// Maximum recommended concurrent tasks
    pub max_concurrent_tasks: u32,
}

/// Output from a core execution
#[derive(Debug, Clone)]
pub struct CoreOutput {
    /// Whether the core considers the task complete
    pub completed: bool,
    /// Summary of what was accomplished
    pub summary: String,
    /// Number of turns/iterations used
    pub turns_used: u32,
    /// Any artifacts produced (file paths, etc.)
    pub artifacts: Vec<String>,
    /// Metrics from this execution
    pub metrics: CoreMetricsSnapshot,
}

/// Identifies a core type for serialization and command matching
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CoreType {
    Freeform,
    Structured,
    Orchestrator,
    Swarm,
    Workflow,
    Adversarial,
}

impl CoreType {
    pub fn all() -> &'static [CoreType] {
        &[
            CoreType::Freeform,
            CoreType::Structured,
            CoreType::Orchestrator,
            CoreType::Swarm,
            CoreType::Workflow,
            CoreType::Adversarial,
        ]
    }
}

impl fmt::Display for CoreType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreType::Freeform => write!(f, "freeform"),
            CoreType::Structured => write!(f, "structured"),
            CoreType::Orchestrator => write!(f, "orchestrator"),
            CoreType::Swarm => write!(f, "swarm"),
            CoreType::Workflow => write!(f, "workflow"),
            CoreType::Adversarial => write!(f, "adversarial"),
        }
    }
}

impl std::str::FromStr for CoreType {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "freeform" | "free" | "chat" | "auto" => Ok(CoreType::Freeform),
            "structured" | "struct" | "graph" | "ctf" | "code-test-fix" => {
                Ok(CoreType::Structured)
            }
            "orchestrator" | "orch" | "multi" => Ok(CoreType::Orchestrator),
            "swarm" | "parallel" => Ok(CoreType::Swarm),
            "workflow" | "wf" | "template" | "pipeline" => Ok(CoreType::Workflow),
            "adversarial" | "adv" | "coach" | "review" => Ok(CoreType::Adversarial),
            _ => Err(format!(
                "Unknown core type: '{}'. Available: freeform, structured, orchestrator, swarm, workflow, adversarial",
                s
            )),
        }
    }
}

/// The central trait for swappable agent cores.
///
/// Each implementation wraps an existing subsystem and provides a unified
/// execution interface. Cores are registered in `AgentCoreRegistry` and
/// can be hot-swapped at runtime via `/core <name>`.
#[async_trait]
pub trait AgentCore: Send + Sync {
    /// Unique name for this core (matches CoreType)
    fn name(&self) -> &str;

    /// Which CoreType this is
    fn core_type(&self) -> CoreType;

    /// What this core can do — used for auto-selection and UI display
    fn capabilities(&self) -> CoreCapabilities;

    /// Short description for `/cores` listing
    fn description(&self) -> &str;

    /// Score how suitable this core is for a given task (0.0 = terrible, 1.0 = perfect).
    /// Used by CoreSelector for auto-selection.
    fn suitability_score(&self, hint: &TaskHint) -> f32;

    /// Execute a task within this core's strategy.
    ///
    /// The `ctx` provides access to the Agent's shared state (provider, extensions,
    /// cost tracker, etc.) without the core needing to own the Agent.
    async fn execute(&self, ctx: &mut AgentContext, task: &str) -> Result<CoreOutput>;

    /// Get current metrics for this core
    fn metrics(&self) -> CoreMetrics;

    /// Reset metrics (e.g. on session start)
    fn reset_metrics(&self);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_core_type_display() {
        assert_eq!(CoreType::Freeform.to_string(), "freeform");
        assert_eq!(CoreType::Structured.to_string(), "structured");
        assert_eq!(CoreType::Orchestrator.to_string(), "orchestrator");
        assert_eq!(CoreType::Swarm.to_string(), "swarm");
        assert_eq!(CoreType::Workflow.to_string(), "workflow");
        assert_eq!(CoreType::Adversarial.to_string(), "adversarial");
    }

    #[test]
    fn test_core_type_from_str() {
        assert_eq!("freeform".parse::<CoreType>().unwrap(), CoreType::Freeform);
        assert_eq!("struct".parse::<CoreType>().unwrap(), CoreType::Structured);
        assert_eq!("orch".parse::<CoreType>().unwrap(), CoreType::Orchestrator);
        assert_eq!("swarm".parse::<CoreType>().unwrap(), CoreType::Swarm);
        assert_eq!(
            "pipeline".parse::<CoreType>().unwrap(),
            CoreType::Workflow
        );
        assert_eq!("coach".parse::<CoreType>().unwrap(), CoreType::Adversarial);
        assert!("invalid".parse::<CoreType>().is_err());
    }

    #[test]
    fn test_core_type_all() {
        assert_eq!(CoreType::all().len(), 6);
    }

    #[test]
    fn test_core_capabilities_default() {
        let caps = CoreCapabilities::default();
        assert!(!caps.code_generation);
        assert!(!caps.testing);
        assert!(!caps.multi_agent);
        assert_eq!(caps.max_concurrent_tasks, 0);
    }
}
