//! AgentCoreRegistry — manages available cores and hot-swapping.
//!
//! The registry is the central hub for core lifecycle management.
//! It owns all core instances, tracks the active core, and handles
//! runtime switching via `/core <name>`.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use tokio::sync::RwLock;
use tracing::info;

use super::context::TaskHint;
use super::metrics::CoreMetricsSnapshot;
use super::{
    AdversarialCore, AgentCore, CoreCapabilities, CoreType, FreeformCore, OrchestratorCore,
    StructuredCore, SwarmCore, WorkflowCore,
};

/// Central registry for all agent cores.
///
/// Manages core instances, tracks the active core, and provides
/// hot-swap functionality for runtime core switching.
pub struct AgentCoreRegistry {
    /// All registered cores, keyed by CoreType
    cores: HashMap<CoreType, Arc<dyn AgentCore>>,
    /// Currently active core type
    active_core: RwLock<CoreType>,
}

impl AgentCoreRegistry {
    /// Create a new registry with all 6 default cores.
    /// FreeformCore is the default active core.
    pub fn new() -> Self {
        let mut cores: HashMap<CoreType, Arc<dyn AgentCore>> = HashMap::new();

        cores.insert(CoreType::Freeform, Arc::new(FreeformCore::new()));
        cores.insert(CoreType::Structured, Arc::new(StructuredCore::new()));
        cores.insert(CoreType::Orchestrator, Arc::new(OrchestratorCore::new()));
        cores.insert(CoreType::Swarm, Arc::new(SwarmCore::new()));
        cores.insert(CoreType::Workflow, Arc::new(WorkflowCore::new()));
        cores.insert(CoreType::Adversarial, Arc::new(AdversarialCore::new()));

        Self {
            cores,
            active_core: RwLock::new(CoreType::Freeform),
        }
    }

    /// Get the currently active core
    pub async fn active_core(&self) -> Arc<dyn AgentCore> {
        let active_type = *self.active_core.read().await;
        self.cores
            .get(&active_type)
            .cloned()
            .expect("Active core type must exist in registry")
    }

    /// Get the currently active core type
    pub async fn active_core_type(&self) -> CoreType {
        *self.active_core.read().await
    }

    /// Switch to a different core by type. Returns the new active core.
    pub async fn switch_core(&self, core_type: CoreType) -> Result<Arc<dyn AgentCore>> {
        if !self.cores.contains_key(&core_type) {
            return Err(anyhow!("Core type '{}' not registered", core_type));
        }

        let old_type = {
            let mut active = self.active_core.write().await;
            let old = *active;
            *active = core_type;
            old
        };

        info!("Core switched: {} → {}", old_type, core_type);
        self.cores
            .get(&core_type)
            .cloned()
            .ok_or_else(|| anyhow!("Core type '{}' disappeared after registration check", core_type))
    }

    /// Get a specific core by type (without switching)
    pub fn get_core(&self, core_type: CoreType) -> Option<Arc<dyn AgentCore>> {
        self.cores.get(&core_type).cloned()
    }

    /// List all registered cores with their info
    pub fn list_cores(&self) -> Vec<CoreInfo> {
        CoreType::all()
            .iter()
            .filter_map(|ct| {
                self.cores.get(ct).map(|core| CoreInfo {
                    core_type: *ct,
                    name: core.name().to_string(),
                    description: core.description().to_string(),
                    capabilities: core.capabilities(),
                })
            })
            .collect()
    }

    /// List all cores with their current metrics
    pub fn list_cores_with_metrics(&self) -> Vec<(CoreInfo, CoreMetricsSnapshot)> {
        CoreType::all()
            .iter()
            .filter_map(|ct| {
                self.cores.get(ct).map(|core| {
                    let info = CoreInfo {
                        core_type: *ct,
                        name: core.name().to_string(),
                        description: core.description().to_string(),
                        capabilities: core.capabilities(),
                    };
                    let metrics = core.metrics().snapshot();
                    (info, metrics)
                })
            })
            .collect()
    }

    /// Auto-select the best core for a task hint.
    /// Returns the recommended core type and its suitability score.
    pub fn recommend_core(&self, hint: &TaskHint) -> (CoreType, f32) {
        // If user explicitly chose a core, use it
        if let Some(preferred) = hint.user_preference {
            if self.cores.contains_key(&preferred) {
                return (preferred, 1.0);
            }
        }

        let mut best_type = CoreType::Freeform;
        let mut best_score: f32 = 0.0;

        for (core_type, core) in &self.cores {
            let score = core.suitability_score(hint);
            if score > best_score {
                best_score = score;
                best_type = *core_type;
            }
        }

        (best_type, best_score)
    }

    /// Reset metrics for all cores
    pub fn reset_all_metrics(&self) {
        for core in self.cores.values() {
            core.reset_metrics();
        }
    }

    /// Register a custom core (for user-defined YAML cores in the future)
    pub fn register_core(&mut self, core_type: CoreType, core: Arc<dyn AgentCore>) {
        info!("Registered custom core: {}", core_type);
        self.cores.insert(core_type, core);
    }

    /// Number of registered cores
    pub fn core_count(&self) -> usize {
        self.cores.len()
    }
}

impl Default for AgentCoreRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Summary info about a core for display purposes
#[derive(Debug, Clone)]
pub struct CoreInfo {
    pub core_type: CoreType,
    pub name: String,
    pub description: String,
    pub capabilities: CoreCapabilities,
}

impl std::fmt::Display for CoreInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "  {} — {}", self.name, self.description)
    }
}

/// Format a list of cores for display (used by /cores command)
pub fn format_cores_list(cores: &[CoreInfo], active: CoreType) -> String {
    let mut lines = Vec::new();
    lines.push("Available cores:".to_string());
    lines.push(String::new());

    for info in cores {
        let marker = if info.core_type == active { "▸" } else { " " };
        let active_label = if info.core_type == active {
            " (active)"
        } else {
            ""
        };
        lines.push(format!(
            " {} {} — {}{}",
            marker, info.name, info.description, active_label
        ));
    }

    lines.push(String::new());
    lines.push("Switch with: /core <name>".to_string());
    lines.push("Names: freeform, structured, orchestrator, swarm, workflow, adversarial".to_string());

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_registry_default_core() {
        let registry = AgentCoreRegistry::new();
        let active = registry.active_core_type().await;
        assert_eq!(active, CoreType::Freeform);
    }

    #[tokio::test]
    async fn test_registry_switch_core() {
        let registry = AgentCoreRegistry::new();

        let core = registry.switch_core(CoreType::Structured).await.unwrap();
        assert_eq!(core.name(), "structured");
        assert_eq!(registry.active_core_type().await, CoreType::Structured);

        let core = registry.switch_core(CoreType::Adversarial).await.unwrap();
        assert_eq!(core.name(), "adversarial");
        assert_eq!(registry.active_core_type().await, CoreType::Adversarial);
    }

    #[test]
    fn test_registry_list_cores() {
        let registry = AgentCoreRegistry::new();
        let cores = registry.list_cores();
        assert_eq!(cores.len(), 6);
    }

    #[test]
    fn test_registry_core_count() {
        let registry = AgentCoreRegistry::new();
        assert_eq!(registry.core_count(), 6);
    }

    #[test]
    fn test_registry_recommend_core() {
        let registry = AgentCoreRegistry::new();

        // General task → freeform
        let hint = TaskHint::from_message("help me understand this code");
        let (recommended, _score) = registry.recommend_core(&hint);
        assert_eq!(recommended, CoreType::Freeform);

        // Code test fix → structured
        let hint = TaskHint::from_message("fix the failing tests");
        let (recommended, _score) = registry.recommend_core(&hint);
        assert_eq!(recommended, CoreType::Structured);

        // Review → adversarial
        let hint = TaskHint::from_message("review this PR for security issues");
        let (recommended, _score) = registry.recommend_core(&hint);
        assert_eq!(recommended, CoreType::Adversarial);

        // Pipeline → workflow
        let hint = TaskHint::from_message("run the deploy pipeline");
        let (recommended, _score) = registry.recommend_core(&hint);
        assert_eq!(recommended, CoreType::Workflow);
    }

    #[test]
    fn test_registry_recommend_user_preference() {
        let registry = AgentCoreRegistry::new();

        let mut hint = TaskHint::from_message("help me");
        hint.user_preference = Some(CoreType::Swarm);
        let (recommended, score) = registry.recommend_core(&hint);
        assert_eq!(recommended, CoreType::Swarm);
        assert_eq!(score, 1.0);
    }

    #[tokio::test]
    async fn test_format_cores_list() {
        let registry = AgentCoreRegistry::new();
        let cores = registry.list_cores();
        let active = registry.active_core_type().await;
        let output = format_cores_list(&cores, active);

        assert!(output.contains("Available cores:"));
        assert!(output.contains("freeform"));
        assert!(output.contains("(active)"));
        assert!(output.contains("/core <name>"));
    }

    #[test]
    fn test_registry_get_core() {
        let registry = AgentCoreRegistry::new();

        assert!(registry.get_core(CoreType::Freeform).is_some());
        assert!(registry.get_core(CoreType::Structured).is_some());
        assert!(registry.get_core(CoreType::Orchestrator).is_some());
        assert!(registry.get_core(CoreType::Swarm).is_some());
        assert!(registry.get_core(CoreType::Workflow).is_some());
        assert!(registry.get_core(CoreType::Adversarial).is_some());
    }
}
