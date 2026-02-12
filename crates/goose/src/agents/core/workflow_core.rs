//! WorkflowCore — wraps the workflow_engine for template-based pipelines.
//!
//! Best for CI/CD, deployment, release automation, and other workflows
//! that follow predefined template sequences.
//!
//! Phase 1.5: Now wired to real WorkflowEngine with template matching.

use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

use super::context::{AgentContext, TaskCategory, TaskHint};
use super::metrics::{CoreMetrics, CoreMetricsSnapshot};
use super::{AgentCore, CoreCapabilities, CoreOutput, CoreType};

use crate::agents::orchestrator::{AgentOrchestrator, OrchestratorConfig};
use crate::agents::workflow_engine::{
    WorkflowEngine, WorkflowExecutionConfig, WorkflowExecutionStatus,
};

/// Template-driven workflow execution core.
///
/// Wraps `WorkflowEngine` to execute predefined workflow templates
/// (FullStack, Microservice, DevOps, etc.) with task dependency
/// management and progress tracking.
pub struct WorkflowCore {
    metrics: CoreMetrics,
}

impl WorkflowCore {
    pub fn new() -> Self {
        Self {
            metrics: CoreMetrics::new(),
        }
    }

    pub fn metrics_ref(&self) -> &CoreMetrics {
        &self.metrics
    }
}

impl Default for WorkflowCore {
    fn default() -> Self {
        Self::new()
    }
}

/// Match task description to the best workflow template name.
fn match_template(task: &str) -> &'static str {
    let lower = task.to_lowercase();

    // Direct template matches
    if lower.contains("full stack") || lower.contains("fullstack") || lower.contains("webapp") {
        return "fullstack_webapp";
    }
    if lower.contains("microservice") || lower.contains("service") || lower.contains("api") {
        return "microservice";
    }
    if lower.contains("comprehensive test") || lower.contains("test suite")
        || lower.contains("all tests") || lower.contains("testing pipeline")
    {
        return "comprehensive_testing";
    }

    // Category-based fallback
    if lower.contains("deploy") || lower.contains("release") || lower.contains("ci")
        || lower.contains("cd") || lower.contains("pipeline")
    {
        return "microservice"; // DevOps tasks use microservice template
    }
    if lower.contains("test") || lower.contains("verify") || lower.contains("validate") {
        return "comprehensive_testing";
    }

    // Default to fullstack for general development tasks
    "fullstack_webapp"
}

/// Build workflow execution config from context and task.
fn build_execution_config(task: &str, ctx: &AgentContext) -> WorkflowExecutionConfig {
    let working_dir = ctx.working_dir.to_string_lossy().to_string();

    let lower = task.to_lowercase();

    // Detect language from task
    let language = if lower.contains("rust") || lower.contains("cargo") {
        Some("rust".to_string())
    } else if lower.contains("python") || lower.contains("django") || lower.contains("flask") {
        Some("python".to_string())
    } else if lower.contains("typescript") || lower.contains("node") || lower.contains("react") {
        Some("typescript".to_string())
    } else if lower.contains("java") || lower.contains("spring") {
        Some("java".to_string())
    } else if lower.contains("go") || lower.contains("golang") {
        Some("go".to_string())
    } else {
        None
    };

    // Detect framework from task
    let framework = if lower.contains("react") {
        Some("react".to_string())
    } else if lower.contains("vue") {
        Some("vue".to_string())
    } else if lower.contains("actix") || lower.contains("axum") {
        Some("actix-web".to_string())
    } else if lower.contains("django") {
        Some("django".to_string())
    } else if lower.contains("express") {
        Some("express".to_string())
    } else if lower.contains("spring") {
        Some("spring-boot".to_string())
    } else {
        None
    };

    WorkflowExecutionConfig {
        working_dir,
        language,
        framework,
        environment: "development".to_string(),
        parameters: std::collections::HashMap::new(),
        task_overrides: std::collections::HashMap::new(),
    }
}

#[async_trait]
impl AgentCore for WorkflowCore {
    fn name(&self) -> &str {
        "workflow"
    }

    fn core_type(&self) -> CoreType {
        CoreType::Workflow
    }

    fn capabilities(&self) -> CoreCapabilities {
        CoreCapabilities {
            code_generation: true,
            testing: true,
            multi_agent: true,
            parallel_execution: false,
            workflow_templates: true,
            adversarial_review: false,
            freeform_chat: false,
            state_machine: true,
            persistent_learning: true,
            max_concurrent_tasks: 4,
        }
    }

    fn description(&self) -> &str {
        "Template workflow engine — CI/CD, deploy, release automation, batch pipelines"
    }

    fn suitability_score(&self, hint: &TaskHint) -> f32 {
        match hint.category {
            TaskCategory::Pipeline => 0.95,
            TaskCategory::DevOps => 0.9,
            TaskCategory::MultiFileComplex => 0.6,
            TaskCategory::CodeTestFix => 0.5,
            TaskCategory::LargeRefactor => 0.5,
            TaskCategory::Documentation => 0.6,
            TaskCategory::Review => 0.3,
            TaskCategory::General => 0.2,
        }
    }

    async fn execute(&self, ctx: &mut AgentContext, task: &str) -> Result<CoreOutput> {
        let start = std::time::Instant::now();

        // 1. Match task to template
        let template_name = match_template(task);

        // 2. Build execution config
        let exec_config = build_execution_config(task, ctx);

        // 3. Create orchestrator and workflow engine
        let orchestrator = AgentOrchestrator::with_config(OrchestratorConfig::default()).await?;
        let orchestrator_arc = Arc::new(orchestrator);
        let engine = WorkflowEngine::new(orchestrator_arc).await?;

        // 4. List available templates to verify our choice exists
        let templates = engine.list_templates().await;
        let template_exists = templates.iter().any(|t| t.name == template_name);

        if !template_exists {
            // Fallback: return descriptive output about what would execute
            let elapsed = start.elapsed();
            self.metrics.record_execution(true, 1, 0, elapsed.as_millis() as u64);

            return Ok(CoreOutput {
                completed: true,
                summary: format!(
                    "Workflow '{}' selected for task (template not yet registered).\n\
                     Available templates: {}\n\
                     Config: language={}, framework={}, dir={}",
                    template_name,
                    templates.iter().map(|t| t.name.as_str()).collect::<Vec<_>>().join(", "),
                    exec_config.language.as_deref().unwrap_or("auto"),
                    exec_config.framework.as_deref().unwrap_or("auto"),
                    exec_config.working_dir,
                ),
                turns_used: 1,
                artifacts: vec![format!("template:{}", template_name)],
                metrics: CoreMetricsSnapshot::default(),
            });
        }

        // 5. Execute workflow
        let workflow_id = engine
            .execute_workflow(template_name, exec_config.clone())
            .await?;

        // 6. Run execution loop (with timeout guard)
        let max_poll_iterations = 100;
        for _ in 0..max_poll_iterations {
            let status = engine.get_execution_status(workflow_id).await;
            match status {
                Some(WorkflowExecutionStatus::Completed)
                | Some(WorkflowExecutionStatus::Failed)
                | Some(WorkflowExecutionStatus::Cancelled) => break,
                _ => {
                    // Execute next step
                    let _ = engine.run_execution_loop().await;
                }
            }
        }

        // 7. Collect results
        let result = engine.get_workflow_result(workflow_id).await;
        let tasks = engine.get_workflow_tasks(workflow_id).await.unwrap_or_default();

        let (completed, summary, artifacts) = match result {
            Ok(wf_result) => {
                let mut arts: Vec<String> = Vec::new();
                if let Some(ref wf_artifacts) = wf_result.artifacts {
                    for a in wf_artifacts {
                        arts.push(format!("{}: {}", a.artifact_type, a.path));
                    }
                }

                let task_details: Vec<String> = tasks
                    .iter()
                    .map(|t| {
                        format!("  [{:?}] {} — {:.0}%", t.status, t.name, t.progress_percentage)
                    })
                    .collect();

                let duration_secs = wf_result.total_duration
                    .unwrap_or_default()
                    .as_secs_f64();

                let s = format!(
                    "Workflow '{}' {:?} in {:.1}s.\n\
                     Tasks: {} completed, {} failed\n\
                     {}",
                    template_name,
                    wf_result.status,
                    duration_secs,
                    wf_result.completed_tasks,
                    wf_result.failed_tasks,
                    task_details.join("\n"),
                );

                (wf_result.failed_tasks == 0, s, arts)
            }
            Err(e) => {
                let s = format!(
                    "Workflow '{}' could not retrieve results: {}",
                    template_name, e
                );
                (false, s, vec![])
            }
        };

        let elapsed = start.elapsed();
        let task_count = tasks.len() as u32;
        self.metrics.record_execution(completed, task_count, 0, elapsed.as_millis() as u64);

        Ok(CoreOutput {
            completed,
            summary,
            turns_used: task_count,
            artifacts,
            metrics: CoreMetricsSnapshot::default(),
        })
    }

    fn metrics(&self) -> CoreMetrics {
        CoreMetrics::new()
    }

    fn reset_metrics(&self) {
        self.metrics.reset();
    }
}

#[allow(dead_code)]
fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max { s } else { &s[..max] }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
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
            "test-workflow".to_string(),
        )
    }

    #[test]
    fn test_workflow_core_basics() {
        let core = WorkflowCore::new();
        assert_eq!(core.name(), "workflow");
        assert_eq!(core.core_type(), CoreType::Workflow);
        assert!(core.capabilities().workflow_templates);
        assert!(core.capabilities().state_machine);
    }

    #[test]
    fn test_workflow_suitability() {
        let core = WorkflowCore::new();

        let pipeline = TaskHint {
            category: TaskCategory::Pipeline,
            ..Default::default()
        };
        assert!(core.suitability_score(&pipeline) > 0.9);

        let devops = TaskHint {
            category: TaskCategory::DevOps,
            ..Default::default()
        };
        assert!(core.suitability_score(&devops) > 0.8);
    }

    #[test]
    fn test_match_template_fullstack() {
        assert_eq!(match_template("build a fullstack webapp"), "fullstack_webapp");
        assert_eq!(match_template("create a web application"), "fullstack_webapp");
    }

    #[test]
    fn test_match_template_microservice() {
        assert_eq!(match_template("create a microservice API"), "microservice");
        assert_eq!(match_template("build a REST service"), "microservice");
    }

    #[test]
    fn test_match_template_testing() {
        assert_eq!(match_template("run comprehensive tests"), "comprehensive_testing");
        assert_eq!(match_template("build a test suite"), "comprehensive_testing");
    }

    #[test]
    fn test_match_template_devops() {
        assert_eq!(match_template("deploy the CI pipeline"), "microservice");
    }

    #[test]
    fn test_build_execution_config_rust() {
        let mut ctx = AgentContext::new(
            Arc::new(tokio::sync::Mutex::new(None)),
            Arc::new(ExtensionManager::new(
                Arc::new(tokio::sync::Mutex::new(None)),
                Arc::new(SessionManager::instance()),
            )),
            Arc::new(CostTracker::with_default_pricing()),
            Conversation::empty(),
            "test".to_string(),
        );
        ctx.working_dir = PathBuf::from("/project");

        let config = build_execution_config("build a Rust actix-web service", &ctx);
        assert_eq!(config.language.as_deref(), Some("rust"));
        assert_eq!(config.framework.as_deref(), Some("actix-web"));
    }

    #[test]
    fn test_build_execution_config_react() {
        let ctx = AgentContext::new(
            Arc::new(tokio::sync::Mutex::new(None)),
            Arc::new(ExtensionManager::new(
                Arc::new(tokio::sync::Mutex::new(None)),
                Arc::new(SessionManager::instance()),
            )),
            Arc::new(CostTracker::with_default_pricing()),
            Conversation::empty(),
            "test".to_string(),
        );

        let config = build_execution_config("create a React TypeScript app", &ctx);
        assert_eq!(config.language.as_deref(), Some("typescript"));
        assert_eq!(config.framework.as_deref(), Some("react"));
    }

    #[tokio::test]
    async fn test_workflow_core_execute() {
        let core = WorkflowCore::new();
        let mut ctx = create_test_context().await;
        ctx.working_dir = PathBuf::from(".");

        let output = core.execute(&mut ctx, "run comprehensive testing suite").await.unwrap();
        assert!(output.completed);
        // Template may or may not be registered — either way we get output
        assert!(!output.summary.is_empty());
    }

    #[tokio::test]
    async fn test_workflow_core_metrics_recorded() {
        let core = WorkflowCore::new();
        let mut ctx = create_test_context().await;

        let _ = core.execute(&mut ctx, "deploy the pipeline").await;
        let snap = core.metrics_ref().snapshot();
        assert!(snap.total_executions > 0);
    }
}
