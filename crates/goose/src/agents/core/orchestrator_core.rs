//! OrchestratorCore — wraps the orchestrator + specialists system.
//!
//! Best for complex multi-file tasks that need coordinated specialist
//! agents (CodeAgent, TestAgent, DeployAgent, SecurityAgent, DocsAgent).
//!
//! Phase 1.1: Now wired to real AgentOrchestrator with specialist DAG.

use anyhow::Result;
use async_trait::async_trait;

use super::context::{AgentContext, TaskCategory, TaskHint};
use super::metrics::{CoreMetrics, CoreMetricsSnapshot};
use super::{truncate, AgentCore, CoreCapabilities, CoreOutput, CoreType};

use crate::agents::orchestrator::{
    AgentOrchestrator, AgentRole, OrchestratorConfig, TaskPriority, WorkflowStatus,
};

/// Multi-agent orchestrator core.
///
/// Wraps `AgentOrchestrator` to decompose complex tasks into a DAG of
/// specialist sub-tasks, then coordinates execution with dependency
/// tracking and handoffs.
pub struct OrchestratorCore {
    metrics: CoreMetrics,
}

impl OrchestratorCore {
    pub fn new() -> Self {
        Self {
            metrics: CoreMetrics::new(),
        }
    }

    pub fn metrics_ref(&self) -> &CoreMetrics {
        &self.metrics
    }
}

impl Default for OrchestratorCore {
    fn default() -> Self {
        Self::new()
    }
}

/// A decomposed sub-task with role assignment and dependencies.
#[derive(Debug, Clone)]
struct DecomposedTask {
    name: String,
    description: String,
    role: AgentRole,
    priority: TaskPriority,
    /// Indices into the decomposed task list that this depends on
    depends_on: Vec<usize>,
}

/// Heuristic task decomposer: breaks a user task into specialist sub-tasks.
///
/// In Phase 2, this will be replaced by an LLM-based decomposer that
/// understands codebase structure and generates precise task descriptions.
fn decompose_task(task: &str) -> Vec<DecomposedTask> {
    let lower = task.to_lowercase();
    let mut tasks = Vec::new();

    // Always start with a code task — this is the primary work
    let has_code_work = lower.contains("implement")
        || lower.contains("create")
        || lower.contains("add")
        || lower.contains("build")
        || lower.contains("write")
        || lower.contains("fix")
        || lower.contains("refactor")
        || lower.contains("update")
        || lower.contains("modify")
        || lower.contains("change")
        || lower.contains("code");

    let has_test_request = lower.contains("test")
        || lower.contains("spec")
        || lower.contains("coverage")
        || lower.contains("verify");

    let has_docs_request = lower.contains("doc")
        || lower.contains("readme")
        || lower.contains("comment")
        || lower.contains("explain");

    let has_security_request = lower.contains("security")
        || lower.contains("audit")
        || lower.contains("vulnerab")
        || lower.contains("safe");

    let has_deploy_request = lower.contains("deploy")
        || lower.contains("release")
        || lower.contains("ship")
        || lower.contains("publish")
        || lower.contains("ci")
        || lower.contains("cd");

    // Code task — always included for development tasks
    if has_code_work || (!has_test_request && !has_docs_request && !has_security_request && !has_deploy_request) {
        tasks.push(DecomposedTask {
            name: "Code Implementation".to_string(),
            description: format!("Implement the requested changes: {}", truncate(task, 200)),
            role: AgentRole::Code,
            priority: TaskPriority::High,
            depends_on: vec![],
        });
    }

    // Test task — depends on code
    if has_test_request || has_code_work {
        let code_idx = tasks.iter().position(|t| t.role == AgentRole::Code);
        tasks.push(DecomposedTask {
            name: "Test Generation".to_string(),
            description: format!(
                "Generate and run tests for: {}",
                truncate(task, 200)
            ),
            role: AgentRole::Test,
            priority: TaskPriority::High,
            depends_on: code_idx.map(|i| vec![i]).unwrap_or_default(),
        });
    }

    // Security review — depends on code
    if has_security_request {
        let code_idx = tasks.iter().position(|t| t.role == AgentRole::Code);
        tasks.push(DecomposedTask {
            name: "Security Review".to_string(),
            description: format!(
                "Security analysis for: {}",
                truncate(task, 200)
            ),
            role: AgentRole::Security,
            priority: TaskPriority::High,
            depends_on: code_idx.map(|i| vec![i]).unwrap_or_default(),
        });
    }

    // Docs — depends on code and test
    if has_docs_request {
        let dep_indices: Vec<usize> = tasks
            .iter()
            .enumerate()
            .filter(|(_, t)| t.role == AgentRole::Code || t.role == AgentRole::Test)
            .map(|(i, _)| i)
            .collect();
        tasks.push(DecomposedTask {
            name: "Documentation".to_string(),
            description: format!(
                "Generate documentation for: {}",
                truncate(task, 200)
            ),
            role: AgentRole::Docs,
            priority: TaskPriority::Medium,
            depends_on: dep_indices,
        });
    }

    // Deploy — depends on everything else
    if has_deploy_request {
        let all_indices: Vec<usize> = (0..tasks.len()).collect();
        tasks.push(DecomposedTask {
            name: "Deployment".to_string(),
            description: format!(
                "Deploy: {}",
                truncate(task, 200)
            ),
            role: AgentRole::Deploy,
            priority: TaskPriority::Medium,
            depends_on: all_indices,
        });
    }

    // Ensure at least one task exists
    if tasks.is_empty() {
        tasks.push(DecomposedTask {
            name: "General Task".to_string(),
            description: task.to_string(),
            role: AgentRole::Code,
            priority: TaskPriority::Medium,
            depends_on: vec![],
        });
    }

    tasks
}

#[async_trait]
impl AgentCore for OrchestratorCore {
    fn name(&self) -> &str {
        "orchestrator"
    }

    fn core_type(&self) -> CoreType {
        CoreType::Orchestrator
    }

    fn capabilities(&self) -> CoreCapabilities {
        CoreCapabilities {
            code_generation: true,
            testing: true,
            multi_agent: true,
            parallel_execution: false, // Sequential DAG, not parallel
            workflow_templates: false,
            adversarial_review: false,
            freeform_chat: false,
            state_machine: false,
            persistent_learning: true,
            max_concurrent_tasks: 4,
        }
    }

    fn description(&self) -> &str {
        "Multi-agent orchestrator with specialist DAG — complex multi-file development tasks"
    }

    fn suitability_score(&self, hint: &TaskHint) -> f32 {
        match hint.category {
            TaskCategory::MultiFileComplex => 0.95,
            TaskCategory::DevOps => 0.8,
            TaskCategory::Pipeline => 0.7,
            TaskCategory::CodeTestFix => 0.6,
            TaskCategory::LargeRefactor => 0.7,
            TaskCategory::Review => 0.5,
            TaskCategory::Documentation => 0.4,
            TaskCategory::General => 0.3,
        }
    }

    async fn execute(&self, _ctx: &mut AgentContext, task: &str) -> Result<CoreOutput> {
        let start = std::time::Instant::now();

        tracing::info!("OrchestratorCore: decomposing task into specialist workflow");

        // 1. Create orchestrator with specialists
        let orchestrator = AgentOrchestrator::with_config(OrchestratorConfig::default()).await?;

        // 2. Decompose task into sub-tasks
        let decomposed = decompose_task(task);
        let task_count = decomposed.len();

        tracing::info!(
            "OrchestratorCore: decomposed into {} sub-tasks: [{}]",
            task_count,
            decomposed
                .iter()
                .map(|t| format!("{}({})", t.name, t.role))
                .collect::<Vec<_>>()
                .join(", ")
        );

        // 3. Create workflow
        let workflow_id = orchestrator
            .create_workflow(
                format!("Orchestrated: {}", truncate(task, 60)),
                task.to_string(),
            )
            .await?;

        // 4. Add tasks with dependency tracking
        //    We need to map decomposed indices → UUID task IDs
        let mut task_ids: Vec<uuid::Uuid> = Vec::new();

        for dt in &decomposed {
            let dep_ids: Vec<uuid::Uuid> = dt
                .depends_on
                .iter()
                .filter_map(|&idx| task_ids.get(idx).copied())
                .collect();

            let tid = orchestrator
                .add_task(
                    workflow_id,
                    dt.name.clone(),
                    dt.description.clone(),
                    dt.role,
                    dep_ids,
                    dt.priority,
                )
                .await?;

            task_ids.push(tid);
        }

        // 5. Start workflow execution
        orchestrator.start_workflow(workflow_id).await?;

        // 6. Execute task loop — process tasks until workflow completes
        let mut turns_used: u32 = 0;
        let max_iterations = task_count * 4; // Allow retries

        for _ in 0..max_iterations {
            let executed = orchestrator.execute_next_task().await?;
            if executed {
                turns_used += 1;
            }

            // Check if workflow is done
            if orchestrator.is_workflow_complete(workflow_id).await? {
                break;
            }

            // If nothing was executed and workflow isn't complete, we might be
            // waiting for dependencies or all tasks are done
            if !executed {
                break;
            }
        }

        // 7. Collect results
        let workflow_status = orchestrator.get_workflow_status(workflow_id).await?;
        let workflow_tasks = orchestrator.get_workflow_tasks(workflow_id).await?;
        let _stats = orchestrator.get_stats().await;

        let completed = workflow_status == WorkflowStatus::Completed;

        // Collect artifacts from all completed tasks
        let mut all_artifacts: Vec<String> = Vec::new();
        let mut summary_parts: Vec<String> = Vec::new();

        for wt in &workflow_tasks {
            if let Some(ref result) = wt.result {
                summary_parts.push(format!(
                    "  [{}] {} — {}",
                    wt.role,
                    wt.name,
                    if result.success { "OK" } else { "FAILED" }
                ));
                all_artifacts.extend(result.artifacts.clone());
                all_artifacts.extend(result.files_modified.clone());
            } else if let Some(ref err) = wt.error {
                summary_parts.push(format!(
                    "  [{}] {} — ERROR: {}",
                    wt.role, wt.name, err
                ));
            }
        }

        let summary = format!(
            "Orchestrator workflow {} ({} tasks, {} turns):\n{}",
            if completed { "COMPLETED" } else { "INCOMPLETE" },
            task_count,
            turns_used,
            summary_parts.join("\n")
        );

        tracing::info!("OrchestratorCore: {}", summary);

        let elapsed = start.elapsed();
        self.metrics.record_execution(
            completed,
            turns_used,
            0, // Cost tracking done by CostTracker
            elapsed.as_millis() as u64,
        );

        Ok(CoreOutput {
            completed,
            summary,
            turns_used,
            artifacts: all_artifacts,
            metrics: CoreMetricsSnapshot {
                total_executions: 1,
                successful: if completed { 1 } else { 0 },
                failed: if completed { 0 } else { 1 },
                success_rate: if completed { 1.0 } else { 0.0 },
                avg_turns: turns_used as f32,
                avg_cost_dollars: 0.0,
                avg_time_ms: elapsed.as_millis() as u64,
                total_cost_dollars: 0.0,
            },
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

    #[test]
    fn test_orchestrator_core_basics() {
        let core = OrchestratorCore::new();
        assert_eq!(core.name(), "orchestrator");
        assert_eq!(core.core_type(), CoreType::Orchestrator);
        assert!(core.capabilities().multi_agent);
        assert_eq!(core.capabilities().max_concurrent_tasks, 4);
    }

    #[test]
    fn test_orchestrator_suitability() {
        let core = OrchestratorCore::new();

        let complex = TaskHint {
            category: TaskCategory::MultiFileComplex,
            ..Default::default()
        };
        assert!(core.suitability_score(&complex) > 0.9);

        let general = TaskHint {
            category: TaskCategory::General,
            ..Default::default()
        };
        assert!(core.suitability_score(&general) < 0.4);
    }

    // ── Decomposer tests ──────────────────────────────────────────────

    #[test]
    fn test_decompose_code_only() {
        let tasks = decompose_task("implement a new login page");
        assert!(tasks.len() >= 2); // Code + Test (auto-added for code work)
        assert_eq!(tasks[0].role, AgentRole::Code);
        assert_eq!(tasks[0].depends_on.len(), 0); // Code has no deps
    }

    #[test]
    fn test_decompose_code_and_test() {
        let tasks = decompose_task("implement and test the auth module");
        let has_code = tasks.iter().any(|t| t.role == AgentRole::Code);
        let has_test = tasks.iter().any(|t| t.role == AgentRole::Test);
        assert!(has_code);
        assert!(has_test);

        // Test should depend on code
        let test_task = tasks.iter().find(|t| t.role == AgentRole::Test).unwrap();
        assert!(!test_task.depends_on.is_empty());
    }

    #[test]
    fn test_decompose_full_pipeline() {
        let tasks = decompose_task(
            "implement the feature, write tests, generate docs, run security audit, and deploy"
        );
        let roles: Vec<AgentRole> = tasks.iter().map(|t| t.role).collect();
        assert!(roles.contains(&AgentRole::Code));
        assert!(roles.contains(&AgentRole::Test));
        assert!(roles.contains(&AgentRole::Docs));
        assert!(roles.contains(&AgentRole::Security));
        assert!(roles.contains(&AgentRole::Deploy));

        // Deploy should depend on everything before it
        let deploy_task = tasks.iter().find(|t| t.role == AgentRole::Deploy).unwrap();
        assert!(deploy_task.depends_on.len() >= 2);
    }

    #[test]
    fn test_decompose_security_only() {
        let tasks = decompose_task("security audit of the codebase");
        let has_security = tasks.iter().any(|t| t.role == AgentRole::Security);
        assert!(has_security);
    }

    #[test]
    fn test_decompose_docs_only() {
        let tasks = decompose_task("generate documentation for the API");
        let has_docs = tasks.iter().any(|t| t.role == AgentRole::Docs);
        assert!(has_docs);
    }

    #[test]
    fn test_decompose_empty_defaults_to_code() {
        let tasks = decompose_task("do something vague");
        assert!(!tasks.is_empty());
        assert_eq!(tasks[0].role, AgentRole::Code);
    }

    #[test]
    fn test_decompose_deploy_depends_on_all() {
        let tasks = decompose_task("build, test, and deploy this service");
        let deploy_idx = tasks.iter().position(|t| t.role == AgentRole::Deploy).unwrap();
        let deploy = &tasks[deploy_idx];
        // Deploy depends on all prior tasks
        for dep_idx in &deploy.depends_on {
            assert!(*dep_idx < deploy_idx);
        }
    }

    // ── Integration test: full workflow execution ──────────────────────

    #[tokio::test]
    async fn test_orchestrator_core_execute_simple() {
        let core = OrchestratorCore::new();
        let mut ctx = create_test_context().await;

        let result = core.execute(&mut ctx, "implement a hello world function").await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.completed);
        assert!(output.turns_used > 0);
        assert!(output.summary.contains("COMPLETED"));
        assert!(!output.artifacts.is_empty());
    }

    #[tokio::test]
    async fn test_orchestrator_core_execute_with_tests() {
        let core = OrchestratorCore::new();
        let mut ctx = create_test_context().await;

        let result = core
            .execute(&mut ctx, "implement and test a calculator module")
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.completed);
        // Should have both code and test in summary
        assert!(output.summary.contains("[code]"));
        assert!(output.summary.contains("[test]"));
    }

    #[tokio::test]
    async fn test_orchestrator_core_execute_full_pipeline() {
        let core = OrchestratorCore::new();
        let mut ctx = create_test_context().await;

        let result = core
            .execute(
                &mut ctx,
                "implement the feature, write tests, generate docs, run security audit, and deploy",
            )
            .await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.completed);
        assert!(output.turns_used >= 5); // At least one turn per specialist
        assert!(output.summary.contains("[code]"));
        assert!(output.summary.contains("[test]"));
        assert!(output.summary.contains("[docs]"));
        assert!(output.summary.contains("[security]"));
        assert!(output.summary.contains("[deploy]"));
    }

    #[tokio::test]
    async fn test_orchestrator_core_metrics_recorded() {
        let core = OrchestratorCore::new();
        let mut ctx = create_test_context().await;

        let _ = core.execute(&mut ctx, "build something").await;

        let snap = core.metrics_ref().snapshot();
        assert_eq!(snap.total_executions, 1);
        assert_eq!(snap.successful, 1);
        // avg_time_ms is u64, always >= 0 — just verify it's a reasonable value (under 60s)
        assert!(snap.avg_time_ms < 60_000, "avg_time_ms should be under 60s, got {}", snap.avg_time_ms);
    }

    /// Create a minimal test AgentContext
    async fn create_test_context() -> AgentContext {
        use std::sync::Arc;
        use crate::agents::extension_manager::ExtensionManager;
        use crate::agents::observability::CostTracker;
        use crate::conversation::Conversation;
        use crate::session::SessionManager;

        AgentContext::new(
            Arc::new(tokio::sync::Mutex::new(None)),
            Arc::new(ExtensionManager::new(
                Arc::new(tokio::sync::Mutex::new(None)),
                Arc::new(SessionManager::instance()),
            )),
            Arc::new(CostTracker::with_default_pricing()),
            Conversation::empty(),
            "test-orchestrator".to_string(),
        )
    }
}
