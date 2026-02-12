//! AgentContext — shared state passed to cores during execution.
//!
//! This avoids cores needing to own the Agent directly while still
//! providing access to provider, extensions, cost tracking, etc.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::agents::extension_manager::ExtensionManager;
use crate::agents::observability::CostTracker;
use crate::agents::types::SharedProvider;
use crate::conversation::Conversation;

/// Shared execution context passed to every core.
///
/// Contains references to the Agent's shared state so cores can
/// access the provider, extensions, cost tracker, and conversation
/// without owning the Agent.
pub struct AgentContext {
    /// LLM provider (shared, swappable)
    pub provider: SharedProvider,
    /// Extension manager for tool access
    pub extension_manager: Arc<ExtensionManager>,
    /// Cost tracker for budget enforcement
    pub cost_tracker: Arc<CostTracker>,
    /// Current conversation history
    pub conversation: Conversation,
    /// Session identifier
    pub session_id: String,
    /// Working directory for file operations
    pub working_dir: PathBuf,
    /// Cancellation token for graceful shutdown
    pub cancel_token: Option<CancellationToken>,
    /// System prompt (base + injected context)
    pub system_prompt: String,
    /// Arbitrary metadata for core-specific state
    pub metadata: HashMap<String, String>,
}

impl AgentContext {
    pub fn new(
        provider: SharedProvider,
        extension_manager: Arc<ExtensionManager>,
        cost_tracker: Arc<CostTracker>,
        conversation: Conversation,
        session_id: String,
    ) -> Self {
        Self {
            provider,
            extension_manager,
            cost_tracker,
            conversation,
            session_id,
            working_dir: PathBuf::from("."),
            cancel_token: None,
            system_prompt: String::new(),
            metadata: HashMap::new(),
        }
    }

    pub fn with_working_dir(mut self, dir: PathBuf) -> Self {
        self.working_dir = dir;
        self
    }

    pub fn with_cancel_token(mut self, token: CancellationToken) -> Self {
        self.cancel_token = Some(token);
        self
    }

    pub fn with_system_prompt(mut self, prompt: String) -> Self {
        self.system_prompt = prompt;
        self
    }

    /// Check if execution should be cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancel_token
            .as_ref()
            .map(|t| t.is_cancelled())
            .unwrap_or(false)
    }

    /// Check if we're over budget
    pub async fn is_over_budget(&self) -> bool {
        self.cost_tracker.is_over_budget().await
    }
}

/// Hint about what kind of task is being requested.
/// Used by cores for suitability scoring.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskHint {
    /// Natural language task description
    pub description: String,
    /// Detected task category (if any)
    pub category: TaskCategory,
    /// Number of files likely involved
    pub estimated_file_count: Option<u32>,
    /// Whether tests are expected
    pub requires_testing: bool,
    /// Whether multiple specialists are needed
    pub requires_specialists: bool,
    /// Whether parallel execution would help
    pub benefits_from_parallelism: bool,
    /// Explicit user preference (from /core command)
    pub user_preference: Option<super::CoreType>,
}

impl Default for TaskHint {
    fn default() -> Self {
        Self {
            description: String::new(),
            category: TaskCategory::General,
            estimated_file_count: None,
            requires_testing: false,
            requires_specialists: false,
            benefits_from_parallelism: false,
            user_preference: None,
        }
    }
}

impl TaskHint {
    pub fn from_message(message: &str) -> Self {
        let lower = message.to_lowercase();

        let category = if lower.contains("test") && lower.contains("fix") {
            TaskCategory::CodeTestFix
        } else if lower.contains("review") || lower.contains("security") {
            TaskCategory::Review
        } else if lower.contains("deploy") || lower.contains("release") || lower.contains("ci") {
            TaskCategory::DevOps
        } else if lower.contains("refactor") && (lower.contains("all") || lower.contains("many")) {
            TaskCategory::LargeRefactor
        } else if lower.contains("doc") || lower.contains("readme") {
            TaskCategory::Documentation
        } else if lower.contains("build") || lower.contains("pipeline") {
            TaskCategory::Pipeline
        } else {
            TaskCategory::General
        };

        let requires_testing = lower.contains("test");
        let requires_specialists =
            lower.contains("deploy") || lower.contains("security") || lower.contains("review");
        let benefits_from_parallelism =
            lower.contains("all files") || lower.contains("entire") || lower.contains("every");

        Self {
            description: message.to_string(),
            category,
            estimated_file_count: None,
            requires_testing,
            requires_specialists,
            benefits_from_parallelism,
            user_preference: None,
        }
    }
}

/// High-level task categories for core selection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskCategory {
    /// General chat, research, open-ended tasks
    General,
    /// Code → Test → Fix deterministic loop
    CodeTestFix,
    /// Multi-file complex tasks needing specialists
    MultiFileComplex,
    /// Large-scale refactoring across many files
    LargeRefactor,
    /// Code review or security audit
    Review,
    /// DevOps, deployment, CI/CD
    DevOps,
    /// Documentation generation
    Documentation,
    /// Template-based pipeline execution
    Pipeline,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_hint_from_message_general() {
        let hint = TaskHint::from_message("help me understand this code");
        assert_eq!(hint.category, TaskCategory::General);
        assert!(!hint.requires_testing);
    }

    #[test]
    fn test_task_hint_from_message_code_test_fix() {
        let hint = TaskHint::from_message("fix the failing tests in auth module");
        assert_eq!(hint.category, TaskCategory::CodeTestFix);
        assert!(hint.requires_testing);
    }

    #[test]
    fn test_task_hint_from_message_review() {
        let hint = TaskHint::from_message("review this PR for security issues");
        assert_eq!(hint.category, TaskCategory::Review);
        assert!(hint.requires_specialists);
    }

    #[test]
    fn test_task_hint_from_message_devops() {
        let hint = TaskHint::from_message("deploy the new release to production");
        assert_eq!(hint.category, TaskCategory::DevOps);
        assert!(hint.requires_specialists);
    }

    #[test]
    fn test_task_hint_from_message_large_refactor() {
        let hint = TaskHint::from_message("refactor every handler function across many modules");
        assert_eq!(hint.category, TaskCategory::LargeRefactor);
        assert!(hint.benefits_from_parallelism);
    }

    #[tokio::test]
    async fn test_agent_context_is_cancelled_default() {
        let ctx = AgentContext::new(
            Arc::new(tokio::sync::Mutex::new(None)),
            Arc::new(ExtensionManager::new(
                Arc::new(tokio::sync::Mutex::new(None)),
                Arc::new(crate::session::SessionManager::instance()),
            )),
            Arc::new(CostTracker::with_default_pricing()),
            Conversation::empty(),
            "test-session".to_string(),
        );
        assert!(!ctx.is_cancelled());
    }
}
