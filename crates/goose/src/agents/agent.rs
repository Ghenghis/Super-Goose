use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{anyhow, Context, Result};
use futures::stream::BoxStream;
use futures::{stream, FutureExt, Stream, StreamExt, TryStreamExt};
use uuid::Uuid;

use super::container::Container;
use super::final_output_tool::FinalOutputTool;
use super::platform_tools;
use super::tool_execution::{ToolCallResult, CHAT_MODE_TOOL_SKIPPED_RESPONSE, DECLINED_RESPONSE};
use crate::action_required_manager::ActionRequiredManager;
use crate::agents::critic::{AggregatedCritique, CriticManager, CritiqueContext};
use crate::agents::persistence::CheckpointManager;
use crate::agents::reasoning::{ReasoningConfig, ReasoningManager, ReasoningMode};
use crate::agents::observability::CostTracker;
use crate::agents::reflexion::{AttemptAction, AttemptOutcome, ReflexionAgent, ReflexionConfig};
use crate::guardrails::{DetectionContext, GuardrailsEngine};
use crate::agents::extension::{ExtensionConfig, ExtensionResult, ToolInfo};
use crate::agents::extension_manager::{get_parameter_names, ExtensionManager};
use crate::agents::extension_manager_extension::MANAGE_EXTENSIONS_TOOL_NAME_COMPLETE;
use crate::agents::final_output_tool::{FINAL_OUTPUT_CONTINUATION_MESSAGE, FINAL_OUTPUT_TOOL_NAME};
use crate::agents::planner::{PlanContext, PlanManager};
use crate::agents::platform_tools::PLATFORM_MANAGE_SCHEDULE_TOOL_NAME;
use crate::agents::prompt_manager::PromptManager;
use crate::agents::retry::{RetryManager, RetryResult};
use crate::agents::shell_guard::ShellGuard;
use crate::agents::subagent_task_config::TaskConfig;
use crate::agents::subagent_tool::{
    create_subagent_tool, handle_subagent_tool, SUBAGENT_TOOL_NAME,
};
use crate::agents::types::{FrontendTool, SessionConfig, SharedProvider, ToolResultReceiver};
use crate::approval::ApprovalPreset;
use crate::config::permission::PermissionManager;
use crate::config::{get_enabled_extensions, Config, GooseMode};
use crate::context_mgmt::{compact_messages, DEFAULT_COMPACTION_THRESHOLD};
use crate::conversation::message::{
    ActionRequiredData, Message, MessageContent, ProviderMetadata, SystemNotificationType,
    ToolRequest,
};
use crate::conversation::tool_result_serde::call_tool_result;
use crate::conversation::{debug_conversation_fix, fix_conversation, Conversation};
use crate::mcp_utils::ToolResult;
use crate::permission::permission_inspector::PermissionInspector;
use crate::permission::permission_judge::PermissionCheckResult;
use crate::permission::PermissionConfirmation;
use crate::providers::base::Provider;
use crate::providers::errors::ProviderError;
use crate::recipe::{Author, Recipe, Response, Settings, SubRecipe};
use crate::scheduler_trait::SchedulerTrait;
use crate::security::security_inspector::SecurityInspector;
use crate::session::extension_data::{EnabledExtensionsState, ExtensionState};
use crate::session::{Session, SessionManager, SessionType};
use crate::tool_inspection::ToolInspectionManager;
use crate::tool_monitor::RepetitionInspector;
use crate::utils::is_token_cancelled;
use regex::Regex;
use rmcp::model::{
    CallToolRequestParams, CallToolResult, Content, ErrorCode, ErrorData, GetPromptResult, Prompt,
    ServerNotification, Tool,
};
use serde_json::Value;
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, instrument, warn};

const DEFAULT_MAX_TURNS: u32 = 1000;
const COMPACTION_THINKING_TEXT: &str = "goose is compacting the conversation...";

/// Context needed for the reply function
pub struct ReplyContext {
    pub conversation: Conversation,
    pub tools: Vec<Tool>,
    pub toolshim_tools: Vec<Tool>,
    pub system_prompt: String,
    pub goose_mode: GooseMode,
    pub tool_call_cut_off: usize,
    pub initial_messages: Vec<Message>,
}

pub struct ToolCategorizeResult {
    pub frontend_requests: Vec<ToolRequest>,
    pub remaining_requests: Vec<ToolRequest>,
    pub filtered_response: Message,
}

#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
pub struct ExtensionLoadResult {
    pub name: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct AgentConfig {
    pub session_manager: Arc<SessionManager>,
    pub permission_manager: Arc<PermissionManager>,
    pub scheduler_service: Option<Arc<dyn SchedulerTrait>>,
    pub goose_mode: GooseMode,
    pub disable_session_naming: bool,
}

impl AgentConfig {
    pub fn new(
        session_manager: Arc<SessionManager>,
        permission_manager: Arc<PermissionManager>,
        scheduler_service: Option<Arc<dyn SchedulerTrait>>,
        goose_mode: GooseMode,
        disable_session_naming: bool,
    ) -> Self {
        Self {
            session_manager,
            permission_manager,
            scheduler_service,
            goose_mode,
            disable_session_naming,
        }
    }
}

/// Execution mode determines how the agent processes tasks
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionMode {
    /// Freeform mode: LLM has full autonomy to decide tool usage and iteration
    /// This is the traditional agent behavior
    #[default]
    Freeform,
    /// Structured mode: Agent follows a state graph (Code → Test → Fix → Done)
    /// with validation gates before completion
    Structured,
}

impl std::fmt::Display for ExecutionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutionMode::Freeform => write!(f, "freeform"),
            ExecutionMode::Structured => write!(f, "structured"),
        }
    }
}

impl std::str::FromStr for ExecutionMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "freeform" | "free" | "auto" => Ok(ExecutionMode::Freeform),
            "structured" | "struct" | "graph" => Ok(ExecutionMode::Structured),
            _ => Err(format!(
                "Unknown execution mode: '{}'. Use 'freeform' or 'structured'",
                s
            )),
        }
    }
}

/// Decision made after self-critique
#[derive(Debug, Clone)]
pub enum CritiqueDecision {
    /// Work is complete, all critics passed
    Complete,
    /// Work is complete but has non-blocking warnings
    CompleteWithWarnings { warnings: usize },
    /// Work needs more effort - has blocking issues
    NeedsWork { blocking_issues: Vec<String> },
}

impl CritiqueDecision {
    pub fn is_complete(&self) -> bool {
        matches!(
            self,
            CritiqueDecision::Complete | CritiqueDecision::CompleteWithWarnings { .. }
        )
    }

    pub fn needs_work(&self) -> bool {
        matches!(self, CritiqueDecision::NeedsWork { .. })
    }
}

/// Serializable state for checkpointing (LangGraph parity)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentCheckpointState {
    pub task_description: String,
    pub conversation_summary: String,
    pub completed_steps: Vec<String>,
    pub pending_goals: Vec<String>,
    pub last_tool_results: Vec<String>,
    pub turns_taken: u32,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl AgentCheckpointState {
    pub fn to_continuation_prompt(&self) -> String {
        let mut prompt = format!(
            "[CONTINUATION FROM CHECKPOINT — {}]\n\nTask: {}\n",
            self.timestamp.format("%Y-%m-%d %H:%M:%S UTC"),
            self.task_description
        );
        if !self.completed_steps.is_empty() {
            prompt.push_str(&format!(
                "\nCompleted:\n{}\n",
                self.completed_steps.iter().map(|s| format!("- {}", s)).collect::<Vec<_>>().join("\n")
            ));
        }
        if !self.pending_goals.is_empty() {
            prompt.push_str(&format!(
                "\nRemaining goals:\n{}\n",
                self.pending_goals.iter().map(|s| format!("- {}", s)).collect::<Vec<_>>().join("\n")
            ));
        }
        if !self.last_tool_results.is_empty() {
            prompt.push_str(&format!(
                "\nLast results:\n{}\n",
                self.last_tool_results.iter().map(|s| format!("- {}", s)).collect::<Vec<_>>().join("\n")
            ));
        }
        prompt.push_str(&format!("\nContext summary: {}\n", self.conversation_summary));
        prompt.push_str("\nContinue from where you left off. Do not re-greet or restart.");
        prompt
    }
}

/// The main goose Agent
pub struct Agent {
    pub(super) provider: SharedProvider,
    pub config: AgentConfig,

    pub extension_manager: Arc<ExtensionManager>,
    pub(super) sub_recipes: Mutex<HashMap<String, SubRecipe>>,
    pub(super) final_output_tool: Arc<Mutex<Option<FinalOutputTool>>>,
    pub(super) frontend_tools: Mutex<HashMap<String, FrontendTool>>,
    pub(super) frontend_instructions: Mutex<Option<String>>,
    pub(super) prompt_manager: Mutex<PromptManager>,
    pub(super) confirmation_tx: mpsc::Sender<(String, PermissionConfirmation)>,
    pub(super) confirmation_rx: Mutex<mpsc::Receiver<(String, PermissionConfirmation)>>,
    pub(super) tool_result_tx: mpsc::Sender<(String, ToolResult<CallToolResult>)>,
    pub(super) tool_result_rx: ToolResultReceiver,

    pub(super) retry_manager: RetryManager,
    pub(super) tool_inspection_manager: ToolInspectionManager,
    container: Mutex<Option<Container>>,
    shell_guard: Mutex<Option<ShellGuard>>,
    execution_mode: Mutex<ExecutionMode>,
    plan_manager: Mutex<PlanManager>,
    critic_manager: Mutex<CriticManager>,
    last_critique: Mutex<Option<AggregatedCritique>>,
    guardrails_engine: Mutex<GuardrailsEngine>,
    reasoning_manager: Mutex<ReasoningManager>,
    reflexion_agent: Mutex<ReflexionAgent>,
    #[cfg(feature = "memory")]
    pub(crate) memory_manager: Mutex<crate::memory::MemoryManager>,
    #[cfg(feature = "memory")]
    memory_loaded: AtomicBool,
    #[cfg(feature = "memory")]
    pub(crate) mem0_client: Mutex<Option<super::mem0_client::Mem0Client>>,
    #[cfg(feature = "memory")]
    pub(crate) interactive_session: Mutex<super::hitl::InteractiveSession>,
    pub(crate) checkpoint_manager: Mutex<Option<CheckpointManager>>,
    checkpoint_initialized: AtomicBool,
    /// Cost tracker for budget enforcement
    cost_tracker: Arc<CostTracker>,
    /// Advanced compaction manager for selective context management
    pub(crate) compaction_manager: Mutex<crate::compaction::CompactionManager>,
    /// Per-tool rate limiter for runaway loop prevention
    tool_call_counts: Mutex<HashMap<String, (u32, std::time::Instant)>>,
    /// Swappable agent core registry for hot-swap execution strategies
    pub(crate) core_registry: super::core::AgentCoreRegistry,
    /// Current nesting depth for subagent spawning (0 = top-level agent)
    pub(crate) nesting_depth: u32,
    /// Cross-session experience store for learning which cores work best
    pub(crate) experience_store: Mutex<Option<Arc<super::experience_store::ExperienceStore>>>,
    /// Voyager-style skill library for reusable strategies
    pub(crate) skill_library: Mutex<Option<Arc<super::skill_library::SkillLibrary>>>,
    /// OTA self-update manager (self-build + binary swap + rollback)
    pub(crate) ota_manager: Mutex<Option<crate::ota::OtaManager>>,
    /// Autonomous daemon for scheduled tasks (CI watch, docs gen, etc.)
    pub(crate) autonomous_daemon: Mutex<Option<Arc<crate::autonomous::AutonomousDaemon>>>,
    /// Whether the autonomous daemon has been initialized
    autonomous_daemon_initialized: AtomicBool,
}

#[derive(Clone, Debug)]
pub enum AgentEvent {
    Message(Message),
    McpNotification((String, ServerNotification)),
    ModelChange { model: String, mode: String },
    HistoryReplaced(Conversation),
}

impl Default for Agent {
    fn default() -> Self {
        Self::new()
    }
}

pub enum ToolStreamItem<T> {
    Message(ServerNotification),
    Result(T),
}

pub type ToolStream =
    Pin<Box<dyn Stream<Item = ToolStreamItem<ToolResult<CallToolResult>>> + Send>>;

// tool_stream combines a stream of ServerNotifications with a future representing the
// final result of the tool call. MCP notifications are not request-scoped, but
// this lets us capture all notifications emitted during the tool call for
// simpler consumption
pub fn tool_stream<S, F>(rx: S, done: F) -> ToolStream
where
    S: Stream<Item = ServerNotification> + Send + Unpin + 'static,
    F: Future<Output = ToolResult<CallToolResult>> + Send + 'static,
{
    Box::pin(async_stream::stream! {
        tokio::pin!(done);
        let mut rx = rx;

        loop {
            tokio::select! {
                Some(msg) = rx.next() => {
                    yield ToolStreamItem::Message(msg);
                }
                r = &mut done => {
                    yield ToolStreamItem::Result(r);
                    break;
                }
            }
        }
    })
}

impl Agent {
    pub fn new() -> Self {
        Self::with_config(AgentConfig::new(
            Arc::new(SessionManager::instance()),
            PermissionManager::instance(),
            None,
            Config::global().get_goose_mode().unwrap_or(GooseMode::Auto),
            Config::global()
                .get_goose_disable_session_naming()
                .unwrap_or(false),
        ))
    }

    pub fn with_config(config: AgentConfig) -> Self {
        // Create channels with buffer size 32 (adjust if needed)
        let (confirm_tx, confirm_rx) = mpsc::channel(32);
        let (tool_tx, tool_rx) = mpsc::channel(32);
        let provider = Arc::new(Mutex::new(None));

        let session_manager = Arc::clone(&config.session_manager);
        let permission_manager = Arc::clone(&config.permission_manager);
        Self {
            provider: provider.clone(),
            config,
            extension_manager: Arc::new(ExtensionManager::new(provider.clone(), session_manager)),
            sub_recipes: Mutex::new(HashMap::new()),
            final_output_tool: Arc::new(Mutex::new(None)),
            frontend_tools: Mutex::new(HashMap::new()),
            frontend_instructions: Mutex::new(None),
            prompt_manager: Mutex::new(PromptManager::new()),
            confirmation_tx: confirm_tx,
            confirmation_rx: Mutex::new(confirm_rx),
            tool_result_tx: tool_tx,
            tool_result_rx: Arc::new(Mutex::new(tool_rx)),
            retry_manager: RetryManager::new(),
            tool_inspection_manager: Self::create_tool_inspection_manager(permission_manager),
            container: Mutex::new(None),
            shell_guard: Mutex::new(None),
            execution_mode: Mutex::new(ExecutionMode::default()),
            plan_manager: Mutex::new(PlanManager::with_llm(provider.clone())),
            critic_manager: Mutex::new(CriticManager::with_defaults()),
            last_critique: Mutex::new(None),
            guardrails_engine: Mutex::new(GuardrailsEngine::with_default_detectors()),
            reasoning_manager: Mutex::new(ReasoningManager::default()),
            reflexion_agent: Mutex::new(ReflexionAgent::new(ReflexionConfig::default())),
            #[cfg(feature = "memory")]
            memory_manager: Mutex::new(
                crate::memory::MemoryManager::new(crate::memory::MemoryConfig::default())
                    .expect("Failed to initialize MemoryManager")
            ),
            #[cfg(feature = "memory")]
            memory_loaded: AtomicBool::new(false),
            #[cfg(feature = "memory")]
            mem0_client: Mutex::new(None),
            #[cfg(feature = "memory")]
            interactive_session: Mutex::new(super::hitl::InteractiveSession::new()),
            checkpoint_manager: Mutex::new(None),
            checkpoint_initialized: AtomicBool::new(false),
            cost_tracker: Arc::new(CostTracker::with_default_pricing()),
            compaction_manager: Mutex::new(crate::compaction::CompactionManager::new(
                crate::compaction::CompactionConfig::default(),
            )),
            tool_call_counts: Mutex::new(HashMap::new()),
            core_registry: super::core::AgentCoreRegistry::new(),
            nesting_depth: 0,
            experience_store: Mutex::new(None),
            skill_library: Mutex::new(None),
            ota_manager: Mutex::new(None),
            autonomous_daemon: Mutex::new(None),
            autonomous_daemon_initialized: AtomicBool::new(false),
        }
    }

    /// Get the cost tracker for budget monitoring
    pub fn cost_tracker(&self) -> &Arc<CostTracker> {
        &self.cost_tracker
    }

    /// Get compaction statistics
    pub async fn compaction_stats(&self) -> crate::compaction::CompactionStats {
        self.compaction_manager.lock().await.stats()
    }

    /// Initialize the CompactionManager (already initialized in constructor, this is a no-op).
    ///
    /// This method exists for API consistency with other lazy-init components.
    /// The CompactionManager is always available since it's initialized in the constructor.
    ///
    /// Safe to call multiple times — always returns Ok(()).
    pub async fn init_compaction_manager(&self) -> Result<()> {
        // CompactionManager is already initialized in the constructor with default config.
        // This method exists for API consistency with OTA/autonomous init patterns.
        Ok(())
    }

    /// Initialize the cross-session learning stores (ExperienceStore + SkillLibrary).
    ///
    /// This must be called after construction since `with_config()` is synchronous
    /// but SQLite initialization requires async. Call early in the agent lifecycle
    /// (e.g., at session start or first reply).
    ///
    /// Safe to call multiple times — subsequent calls are no-ops if already initialized.
    pub async fn init_learning_stores(&self) -> Result<()> {
        // Skip if already initialized (check via Mutex)
        {
            let exp_guard = self.experience_store.lock().await;
            let skill_guard = self.skill_library.lock().await;
            if exp_guard.is_some() && skill_guard.is_some() {
                return Ok(());
            }
        }

        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("super-goose");

        std::fs::create_dir_all(&data_dir).context("Failed to create super-goose data directory")?;

        {
            let mut exp_guard = self.experience_store.lock().await;
            if exp_guard.is_none() {
                let exp_path = data_dir.join("experience.db");
                match super::experience_store::ExperienceStore::new(&exp_path).await {
                    Ok(store) => {
                        info!("ExperienceStore initialized at {:?}", exp_path);
                        *exp_guard = Some(Arc::new(store));
                    }
                    Err(e) => {
                        warn!("Failed to initialize ExperienceStore at {:?}: {}", exp_path, e);
                        // Non-fatal: agent works without learning stores
                    }
                }
            }
        }

        {
            let mut skill_guard = self.skill_library.lock().await;
            if skill_guard.is_none() {
                let skill_path = data_dir.join("skills.db");
                match super::skill_library::SkillLibrary::new(&skill_path).await {
                    Ok(lib) => {
                        info!("SkillLibrary initialized at {:?}", skill_path);
                        *skill_guard = Some(Arc::new(lib));
                    }
                    Err(e) => {
                        warn!("Failed to initialize SkillLibrary at {:?}: {}", skill_path, e);
                        // Non-fatal: agent works without learning stores
                    }
                }
            }
        }

        info!("Learning stores initialized at {:?}", data_dir);
        Ok(())
    }

    /// Get a clone of the experience store Arc (if initialized).
    pub async fn experience_store(&self) -> Option<Arc<super::experience_store::ExperienceStore>> {
        self.experience_store.lock().await.clone()
    }

    /// Get a clone of the skill library Arc (if initialized).
    pub async fn skill_library(&self) -> Option<Arc<super::skill_library::SkillLibrary>> {
        self.skill_library.lock().await.clone()
    }

    /// Get access to the OTA manager (if initialized).
    pub async fn ota_manager_ref(&self) -> tokio::sync::MutexGuard<'_, Option<crate::ota::OtaManager>> {
        self.ota_manager.lock().await
    }

    /// Get a clone of the autonomous daemon Arc (if initialized).
    pub async fn autonomous_daemon(&self) -> Option<Arc<crate::autonomous::AutonomousDaemon>> {
        self.autonomous_daemon.lock().await.clone()
    }

    /// Initialize the OTA self-update manager.
    ///
    /// Safe to call multiple times — subsequent calls are no-ops.
    /// Detects workspace root from current working directory or CARGO_MANIFEST_DIR.
    pub async fn init_ota_manager(&self) -> Result<()> {
        let mut guard = self.ota_manager.lock().await;
        if guard.is_some() {
            return Ok(());
        }

        // Find workspace root: try CARGO_MANIFEST_DIR, then current_dir, then fallback
        let workspace_root = std::env::var("CARGO_MANIFEST_DIR")
            .map(std::path::PathBuf::from)
            .or_else(|_| std::env::current_dir())
            .unwrap_or_else(|_| std::path::PathBuf::from("."));

        // Only initialize if we're in a Cargo workspace (Cargo.toml exists)
        if workspace_root.join("Cargo.toml").exists() {
            let manager = crate::ota::OtaManager::default_goose(workspace_root.clone());
            info!("OTA manager initialized at {:?}", workspace_root);
            *guard = Some(manager);
        } else {
            debug!("No Cargo.toml found at {:?} — OTA self-update disabled", workspace_root);
        }

        Ok(())
    }

    /// Initialize the Autonomous daemon for scheduled task execution.
    ///
    /// Safe to call multiple times — subsequent calls are no-ops.
    pub async fn init_autonomous_daemon(&self) -> Result<()> {
        if self.autonomous_daemon_initialized.load(Ordering::Relaxed) {
            return Ok(());
        }

        let mut guard = self.autonomous_daemon.lock().await;
        if guard.is_some() {
            self.autonomous_daemon_initialized.store(true, Ordering::Relaxed);
            return Ok(());
        }

        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("super-goose");
        std::fs::create_dir_all(&data_dir).ok();

        let repo_path = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let docs_dir = data_dir.join("generated-docs");
        let audit_db = data_dir.join("audit.db");

        match crate::autonomous::AutonomousDaemon::new(
            repo_path,
            docs_dir,
            &audit_db,
            "Super-Goose",
            "1.24.05",
        ).await {
            Ok(daemon) => {
                info!("Autonomous daemon initialized (audit: {:?})", audit_db);
                *guard = Some(Arc::new(daemon));
            }
            Err(e) => {
                warn!("Failed to initialize Autonomous daemon: {} (non-fatal)", e);
            }
        }

        self.autonomous_daemon_initialized.store(true, Ordering::Relaxed);
        Ok(())
    }

    /// Perform a full OTA self-improvement cycle:
    /// 1. Extract insights from experience
    /// 2. Build new binary
    /// 3. Run health checks
    /// 4. Swap binary (with rollback on failure)
    ///
    /// Returns a human-readable summary.
    pub async fn perform_self_improve(&self, dry_run: bool) -> Result<String> {
        // Step 1: Ensure OTA manager is initialized
        self.init_ota_manager().await?;

        let mut ota_guard = self.ota_manager.lock().await;
        let ota = ota_guard.as_mut()
            .ok_or_else(|| anyhow!("OTA manager not available (no Cargo workspace found)"))?;

        if dry_run {
            let result = ota.dry_run();
            return Ok(format!(
                "## Self-Improve Dry Run\n\n\
                 **Status:** {}\n\
                 **Summary:** {}\n\n\
                 _No actual build or binary swap performed._",
                result.status, result.summary
            ));
        }

        // Step 2: Gather config snapshot for state saving
        let config_json = serde_json::json!({
            "version": "1.24.05",
            "core": self.core_registry.active_core_type().await.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }).to_string();

        // Step 3: Perform the full update cycle
        let result = ota.perform_update("1.24.05", &config_json).await?;

        let mut output = String::from("## Self-Improve Result\n\n");
        output.push_str(&format!("**Status:** {}\n", result.status));
        output.push_str(&format!("**Summary:** {}\n\n", result.summary));

        if let Some(ref build) = result.build_result {
            output.push_str(&format!("**Build:** {} (profile: {})\n",
                if build.success { "OK" } else { "FAILED" },
                build.profile
            ));
            if let Some(ref path) = build.binary_path {
                output.push_str(&format!("**Binary:** {}\n", path.display()));
            }
        }

        if let Some(ref health) = result.health_report {
            output.push_str(&format!("**Health:** {} ({} checks passed)\n",
                if health.healthy { "HEALTHY" } else { "UNHEALTHY" },
                health.checks.iter().filter(|c| c.passed).count()
            ));
        }

        if let Some(ref rollback) = result.rollback_record {
            output.push_str(&format!("**Rollback:** {} (reason: {})\n",
                if rollback.success { "OK" } else { "FAILED" },
                rollback.reason
            ));
        }

        Ok(output)
    }

    /// Run InsightExtractor on the experience store and return insights.
    /// Called periodically (e.g., after every N replies) to learn from experience.
    pub async fn extract_insights(&self) -> Result<Vec<super::insight_extractor::Insight>> {
        let store = self.experience_store.lock().await.clone()
            .ok_or_else(|| anyhow!("ExperienceStore not initialized"))?;

        super::insight_extractor::InsightExtractor::extract(&store).await
    }

    /// Retrieve relevant skills from the SkillLibrary for a given task.
    /// Used to augment the system prompt with learned strategies.
    pub async fn retrieve_skills_for_task(&self, task: &str) -> Vec<super::skill_library::Skill> {
        let lib = match self.skill_library.lock().await.clone() {
            Some(l) => l,
            None => return Vec::new(),
        };

        match lib.find_for_task(task, 3).await {
            Ok(skills) => skills,
            Err(e) => {
                debug!("SkillLibrary retrieval failed: {} (non-fatal)", e);
                Vec::new()
            }
        }
    }

    /// Retrieve relevant insights from the InsightExtractor for prompt injection.
    /// Returns high-confidence insights that can inform the agent's approach.
    /// Filters to insights with confidence >= 0.4 and limits to `max` results.
    pub async fn retrieve_relevant_insights(&self, max: usize) -> Vec<super::insight_extractor::Insight> {
        let store = match self.experience_store.lock().await.clone() {
            Some(s) => s,
            None => return Vec::new(),
        };

        match super::insight_extractor::InsightExtractor::extract(&store).await {
            Ok(mut insights) => {
                // Filter to actionable insights with reasonable confidence
                insights.retain(|i| i.confidence >= 0.4);
                // Sort by confidence descending
                insights.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
                insights.truncate(max);
                insights
            }
            Err(e) => {
                debug!("InsightExtractor retrieval failed: {} (non-fatal)", e);
                Vec::new()
            }
        }
    }

    /// Create a CoreSelector wired to the current experience store.
    pub async fn core_selector(&self) -> super::core::selector::CoreSelector {
        let store = self.experience_store.lock().await.clone();
        super::core::selector::CoreSelector::with_defaults(store)
    }

    /// Create a tool inspection manager with default inspectors
    fn create_tool_inspection_manager(
        permission_manager: Arc<PermissionManager>,
    ) -> ToolInspectionManager {
        let mut tool_inspection_manager = ToolInspectionManager::new();

        // Add security inspector (highest priority - runs first)
        tool_inspection_manager.add_inspector(Box::new(SecurityInspector::new()));

        // Add permission inspector (medium-high priority)
        tool_inspection_manager.add_inspector(Box::new(PermissionInspector::new(
            std::collections::HashSet::new(), // readonly tools - will be populated from extension manager
            std::collections::HashSet::new(), // regular tools - will be populated from extension manager
            permission_manager,
        )));

        // Add repetition inspector (lower priority - basic repetition checking)
        tool_inspection_manager.add_inspector(Box::new(RepetitionInspector::new(None)));

        tool_inspection_manager
    }

    /// Reset the retry attempts counter to 0
    pub async fn reset_retry_attempts(&self) {
        self.retry_manager.reset_attempts().await;
    }

    /// Increment the retry attempts counter and return the new value
    pub async fn increment_retry_attempts(&self) -> u32 {
        self.retry_manager.increment_attempts().await
    }

    /// Get the current retry attempts count
    pub async fn get_retry_attempts(&self) -> u32 {
        self.retry_manager.get_attempts().await
    }

    async fn handle_retry_logic(
        &self,
        messages: &mut Conversation,
        session_config: &SessionConfig,
        initial_messages: &[Message],
    ) -> Result<bool> {
        let result = self
            .retry_manager
            .handle_retry_logic(
                messages,
                session_config,
                initial_messages,
                &self.final_output_tool,
            )
            .await?;

        match result {
            RetryResult::Retried => Ok(true),
            RetryResult::Skipped
            | RetryResult::MaxAttemptsReached
            | RetryResult::SuccessChecksPassed => Ok(false),
        }
    }
    async fn drain_elicitation_messages(&self, session_id: &str) -> Vec<Message> {
        let mut messages = Vec::new();
        let manager = self.config.session_manager.clone();
        let mut elicitation_rx = ActionRequiredManager::global().request_rx.lock().await;
        while let Ok(mut elicitation_message) = elicitation_rx.try_recv() {
            if elicitation_message.id.is_none() {
                elicitation_message = elicitation_message.with_generated_id();
            }
            if let Err(e) = manager.add_message(session_id, &elicitation_message).await {
                warn!("Failed to save elicitation message to session: {}", e);
            }
            messages.push(elicitation_message);
        }
        messages
    }

    async fn prepare_reply_context(
        &self,
        session_id: &str,
        unfixed_conversation: Conversation,
        working_dir: &std::path::Path,
    ) -> Result<ReplyContext> {
        let unfixed_messages = unfixed_conversation.messages().clone();
        let (conversation, issues) = fix_conversation(unfixed_conversation.clone());
        if !issues.is_empty() {
            debug!(
                "Conversation issue fixed: {}",
                debug_conversation_fix(
                    unfixed_messages.as_slice(),
                    conversation.messages(),
                    &issues
                )
            );
        }
        let initial_messages = conversation.messages().clone();

        let (tools, toolshim_tools, system_prompt) = self
            .prepare_tools_and_prompt(session_id, working_dir)
            .await?;

        Ok(ReplyContext {
            conversation,
            tools,
            toolshim_tools,
            system_prompt,
            goose_mode: self.config.goose_mode,
            tool_call_cut_off: Config::global()
                .get_param::<usize>("GOOSE_TOOL_CALL_CUTOFF")
                .unwrap_or(10),
            initial_messages,
        })
    }

    async fn categorize_tools(
        &self,
        response: &Message,
        tools: &[rmcp::model::Tool],
    ) -> ToolCategorizeResult {
        // Categorize tool requests
        let (frontend_requests, remaining_requests, filtered_response) =
            self.categorize_tool_requests(response, tools).await;

        ToolCategorizeResult {
            frontend_requests,
            remaining_requests,
            filtered_response,
        }
    }

    async fn handle_approved_and_denied_tools(
        &self,
        permission_check_result: &PermissionCheckResult,
        request_to_response_map: &HashMap<String, Arc<Mutex<Message>>>,
        cancel_token: Option<tokio_util::sync::CancellationToken>,
        session: &Session,
    ) -> Result<Vec<(String, ToolStream)>> {
        let mut tool_futures: Vec<(String, ToolStream)> = Vec::new();

        // Handle pre-approved and read-only tools
        for request in &permission_check_result.approved {
            if let Ok(tool_call) = request.tool_call.clone() {
                let (req_id, tool_result) = self
                    .dispatch_tool_call(
                        tool_call,
                        request.id.clone(),
                        cancel_token.clone(),
                        session,
                    )
                    .await;

                tool_futures.push((
                    req_id,
                    match tool_result {
                        Ok(result) => tool_stream(
                            result
                                .notification_stream
                                .unwrap_or_else(|| Box::new(stream::empty())),
                            result.result,
                        ),
                        Err(e) => {
                            tool_stream(Box::new(stream::empty()), futures::future::ready(Err(e)))
                        }
                    },
                ));
            }
        }

        Self::handle_denied_tools(permission_check_result, request_to_response_map).await;
        Ok(tool_futures)
    }

    async fn handle_denied_tools(
        permission_check_result: &PermissionCheckResult,
        request_to_response_map: &HashMap<String, Arc<Mutex<Message>>>,
    ) {
        for request in &permission_check_result.denied {
            if let Some(response_msg) = request_to_response_map.get(&request.id) {
                let mut response = response_msg.lock().await;
                *response = response.clone().with_tool_response_with_metadata(
                    request.id.clone(),
                    Ok(CallToolResult {
                        content: vec![rmcp::model::Content::text(DECLINED_RESPONSE)],
                        structured_content: None,
                        is_error: Some(true),
                        meta: None,
                    }),
                    request.metadata.as_ref(),
                );
            }
        }
    }

    /// Get a reference count clone to the provider
    pub async fn provider(&self) -> Result<Arc<dyn Provider>, anyhow::Error> {
        match &*self.provider.lock().await {
            Some(provider) => Ok(Arc::clone(provider)),
            None => Err(anyhow!("Provider not set")),
        }
    }

    /// When set, all stdio extensions will be started via `docker exec` in the specified container.
    pub async fn set_container(&self, container: Option<Container>) {
        *self.container.lock().await = container.clone();
    }

    pub async fn container(&self) -> Option<Container> {
        self.container.lock().await.clone()
    }

    /// Set the approval policy for shell command execution
    pub async fn set_approval_policy(&self, policy: ApprovalPreset) {
        let mut guard = self.shell_guard.lock().await;
        *guard = Some(ShellGuard::new(policy));
    }

    /// Get the current shell guard if set
    pub async fn shell_guard(&self) -> Option<ShellGuard> {
        self.shell_guard.lock().await.clone()
    }

    /// Set the reasoning mode (Standard, ReAct, CoT, ToT)
    pub async fn set_reasoning_mode(&self, mode: ReasoningMode) {
        let mut mgr = self.reasoning_manager.lock().await;
        *mgr = ReasoningManager::new(ReasoningConfig {
            mode,
            ..ReasoningConfig::default()
        });
        info!("Agent reasoning mode set to: {}", mode);
    }

    /// Get the current reasoning mode
    pub async fn reasoning_mode(&self) -> ReasoningMode {
        self.reasoning_manager.lock().await.config().mode
    }

    /// Enable or disable guardrails scanning
    pub async fn set_guardrails_enabled(&self, enabled: bool) {
        let guardrails = self.guardrails_engine.lock().await;
        let mut config = guardrails.get_config().await;
        config.enabled = enabled;
        guardrails.update_config(config).await;
        info!("Guardrails enabled: {}", enabled);
    }

    /// Run a structured code→test→fix loop using StateGraphRunner (AlphaCode/LATS parity)
    /// Returns true if the loop completed successfully (all tests pass)
    pub async fn run_structured_loop(
        &self,
        task: &str,
        working_dir: std::path::PathBuf,
        test_command: Option<&str>,
    ) -> anyhow::Result<bool> {
        use crate::agents::state_graph::{StateGraphConfig, StateGraphRunner};

        let code_working_dir = working_dir.clone();
        let fix_working_dir = working_dir.clone();
        let test_working_dir = working_dir.clone();
        let config = StateGraphConfig {
            working_dir,
            test_command: test_command.map(|s| s.to_string()),
            ..StateGraphConfig::default()
        };
        let mut runner = StateGraphRunner::new(config);

        // === CODE GEN: Shell-based code generation (writes task file for agent to work on) ===
        let code_gen: crate::agents::state_graph::runner::CodeGenFn =
            Box::new(move |task, _state| {
                // Write the task description to a marker file so the agent knows what to build
                let task_file = code_working_dir.join(".goose-task.md");
                if let Err(e) = std::fs::write(&task_file, task) {
                    tracing::warn!("Could not write task file: {}", e);
                }
                Ok(vec![task_file.display().to_string()])
            });

        // === TEST RUN: Use ShellTestRunner for real test execution ===
        let test_run: crate::agents::state_graph::runner::TestRunFn = if let Some(cmd) = test_command {
            let shell_runner = crate::agents::state_graph::runner::ShellTestRunner::new(
                cmd,
                test_working_dir,
            );
            shell_runner.into_callback()
        } else {
            // No test command specified — return empty results (loop will skip test phase)
            Box::new(|_state| Ok(Vec::new()))
        };

        // === FIX: Record failures for the agent to pick up on next iteration ===
        let fix_apply: crate::agents::state_graph::runner::FixApplyFn =
            Box::new(move |results, _state| {
                // Write failure summary so the agent can see what went wrong
                let failures: Vec<String> = results
                    .iter()
                    .filter(|r| !r.is_passed())
                    .map(|r| format!("FAIL: {} — {}", r.test_name, r.message.as_deref().unwrap_or("unknown error")))
                    .collect();
                if !failures.is_empty() {
                    let fix_file = fix_working_dir.join(".goose-failures.md");
                    let content = format!("# Test Failures\n\n{}", failures.join("\n"));
                    if let Err(e) = std::fs::write(&fix_file, &content) {
                        tracing::warn!("Could not write failures file: {}", e);
                    }
                    Ok(vec![fix_file.display().to_string()])
                } else {
                    Ok(Vec::new())
                }
            });

        let success = runner.run(task, code_gen, test_run, fix_apply).await?;
        info!(
            "Structured loop completed: success={}, state={:?}, iterations={}",
            success,
            runner.current_state(),
            runner.iteration()
        );
        Ok(success)
    }

    /// List all checkpoints for the current session (history review API)
    pub async fn list_checkpoints(&self) -> anyhow::Result<Vec<crate::agents::persistence::CheckpointSummary>> {
        let cp_guard = self.checkpoint_manager.lock().await;
        if let Some(ref mgr) = *cp_guard {
            mgr.list_checkpoints().await
        } else {
            Ok(vec![])
        }
    }

    /// Get the most recent checkpoint state (for AI self-inspection)
    pub async fn get_last_checkpoint(&self) -> anyhow::Result<Option<AgentCheckpointState>> {
        let cp_guard = self.checkpoint_manager.lock().await;
        if let Some(ref mgr) = *cp_guard {
            mgr.resume::<AgentCheckpointState>().await
        } else {
            Ok(None)
        }
    }

    /// Resume from a specific checkpoint by ID
    pub async fn resume_from_checkpoint(&self, checkpoint_id: &str) -> anyhow::Result<Option<AgentCheckpointState>> {
        let cp_guard = self.checkpoint_manager.lock().await;
        if let Some(ref mgr) = *cp_guard {
            mgr.resume_from::<AgentCheckpointState>(checkpoint_id).await
        } else {
            Ok(None)
        }
    }

    /// Get a continuation prompt from the last checkpoint (for cross-session resume)
    pub async fn get_continuation_prompt(&self) -> anyhow::Result<Option<String>> {
        match self.get_last_checkpoint().await? {
            Some(state) => Ok(Some(state.to_continuation_prompt())),
            None => Ok(None),
        }
    }

    /// Set the execution mode for the agent
    pub async fn set_execution_mode(&self, mode: ExecutionMode) {
        let mut current = self.execution_mode.lock().await;
        *current = mode;

        // Enable planning when in structured mode
        let mut plan_manager = self.plan_manager.lock().await;
        match mode {
            ExecutionMode::Structured => {
                plan_manager.enable();
                tracing::info!("Agent execution mode set to: {} (planning enabled)", mode);
            }
            ExecutionMode::Freeform => {
                plan_manager.disable();
                plan_manager.clear_plan();
                tracing::info!("Agent execution mode set to: {} (planning disabled)", mode);
            }
        }
    }

    /// Get the current execution mode
    pub async fn execution_mode(&self) -> ExecutionMode {
        *self.execution_mode.lock().await
    }

    /// Check if agent is in structured execution mode
    pub async fn is_structured_mode(&self) -> bool {
        *self.execution_mode.lock().await == ExecutionMode::Structured
    }

    /// Enable planning for the agent
    pub async fn enable_planning(&self) {
        let mut manager = self.plan_manager.lock().await;
        manager.enable();
        tracing::info!("Planning enabled for agent");
    }

    /// Disable planning for the agent
    pub async fn disable_planning(&self) {
        let mut manager = self.plan_manager.lock().await;
        manager.disable();
        tracing::info!("Planning disabled for agent");
    }

    /// Check if planning is enabled
    pub async fn is_planning_enabled(&self) -> bool {
        self.plan_manager.lock().await.is_enabled()
    }

    /// Check if there's an active plan
    pub async fn has_active_plan(&self) -> bool {
        self.plan_manager.lock().await.has_plan()
    }

    /// Create a plan for the given task, with automatic critic review
    pub async fn create_plan(
        &self,
        task: &str,
        tools: Vec<String>,
        working_dir: &str,
    ) -> Result<()> {
        let context = PlanContext::new(task)
            .with_tools(tools)
            .with_working_dir(working_dir);

        let mut manager = self.plan_manager.lock().await;
        manager.create_plan(&context).await?;

        // Auto-invoke CriticManager to review the plan quality
        if let Some(plan) = manager.current_plan() {
            let plan_summary = plan.format_for_llm();
            drop(manager); // Release plan_manager lock before acquiring critic lock

            let critique_context = CritiqueContext::new(format!("Plan review for: {}", task))
                .with_additional_context(plan_summary);
            let critic = self.critic_manager.lock().await;
            match critic.critique(&critique_context).await {
                Ok(result) => {
                    if result.passed {
                        tracing::info!("Plan critique passed ({} issues)", result.total_issues);
                    } else {
                        tracing::warn!(
                            "Plan critique found issues: {} total, {} blocking",
                            result.total_issues,
                            result.blocking_issues
                        );
                    }
                    *self.last_critique.lock().await = Some(result);
                }
                Err(e) => {
                    tracing::debug!("Plan critique skipped: {}", e);
                }
            }
        } else {
            drop(manager);
        }

        tracing::info!("Created plan for task: {}", task);
        Ok(())
    }

    /// Get the current plan context for injection into prompts
    pub async fn get_plan_context(&self) -> Option<String> {
        self.plan_manager.lock().await.get_step_context()
    }

    /// Advance to the next step in the plan
    pub async fn advance_plan(&self) -> bool {
        let mut manager = self.plan_manager.lock().await;
        manager.advance_plan()
    }

    /// Mark the current plan step as completed
    pub async fn complete_plan_step(&self, output: Option<String>) {
        let mut manager = self.plan_manager.lock().await;
        manager.complete_current_step(output);
    }

    /// Mark the current plan step as failed
    pub async fn fail_plan_step(&self, error: &str) {
        let mut manager = self.plan_manager.lock().await;
        manager.fail_current_step(error);
    }

    /// Check if the current plan is complete
    pub async fn is_plan_complete(&self) -> bool {
        self.plan_manager.lock().await.is_plan_complete()
    }

    /// Clear the current plan
    pub async fn clear_plan(&self) {
        let mut manager = self.plan_manager.lock().await;
        manager.clear_plan();
    }

    /// Process plan progress after tool execution
    /// This is called after tools have been executed to potentially advance the plan
    pub async fn process_plan_progress(&self, tools_executed: &[String], all_succeeded: bool) {
        if !self.is_planning_enabled().await {
            return;
        }

        let mut manager = self.plan_manager.lock().await;
        if !manager.has_plan() {
            return;
        }

        // Get the current step's tool hints to see if we completed the expected tools
        let should_advance = if let Some(plan) = manager.current_plan() {
            if let Some(current_step) = plan.current() {
                // If current step has tool hints, check if any were executed
                if current_step.tool_hints.is_empty() {
                    // No specific tools required, advance if any tools executed successfully
                    all_succeeded && !tools_executed.is_empty()
                } else {
                    // Check if any of the hinted tools were used
                    let hint_matched = current_step.tool_hints.iter().any(|hint| {
                        tools_executed
                            .iter()
                            .any(|executed| executed.contains(hint) || hint.contains(executed))
                    });
                    hint_matched && all_succeeded
                }
            } else {
                false
            }
        } else {
            false
        };

        if should_advance {
            // Mark current step as completed
            manager.complete_current_step(Some(format!(
                "Executed tools: {}",
                tools_executed.join(", ")
            )));

            // Try to advance to next step
            if manager.advance_plan() {
                if let Some(plan) = manager.current_plan() {
                    if let Some(step) = plan.current() {
                        tracing::info!(
                            "Plan advanced to step {}: {}",
                            plan.current_step + 1,
                            step.description
                        );
                    }
                }
            } else if manager.is_plan_complete() {
                tracing::info!("Plan completed successfully");
                if let Some(plan) = manager.current_plan_mut() {
                    plan.mark_completed();
                }
            }
        }
    }

    // ==================== Self-Critique Methods ====================

    /// Perform self-critique on completed work
    pub async fn self_critique(
        &self,
        task_description: &str,
        modified_files: Vec<String>,
        working_dir: &str,
        build_output: Option<String>,
        test_output: Option<String>,
    ) -> Result<AggregatedCritique> {
        let context = CritiqueContext::new(task_description)
            .with_modified_files(modified_files)
            .with_working_dir(working_dir);

        let context = if let Some(output) = build_output {
            context.with_build_output(output)
        } else {
            context
        };

        let context = if let Some(output) = test_output {
            context.with_test_output(output)
        } else {
            context
        };

        let critic_manager = self.critic_manager.lock().await;
        let result = critic_manager.critique(&context).await?;

        tracing::info!(
            "Self-critique completed: {} (issues: {}, blocking: {})",
            if result.passed {
                "PASSED"
            } else {
                "NEEDS_WORK"
            },
            result.total_issues,
            result.blocking_issues
        );

        // Store the result for later retrieval
        *self.last_critique.lock().await = Some(result.clone());

        Ok(result)
    }

    /// Get the last critique result
    pub async fn get_last_critique(&self) -> Option<AggregatedCritique> {
        self.last_critique.lock().await.clone()
    }

    /// Clear the last critique result
    pub async fn clear_last_critique(&self) {
        *self.last_critique.lock().await = None;
    }

    /// Get the last critique context for injection into prompts (if available)
    pub async fn get_last_critique_context(&self) -> Option<String> {
        self.last_critique
            .lock()
            .await
            .as_ref()
            .map(|c| c.format_for_llm())
    }

    /// Get a critique context string for injection into prompts
    pub async fn get_critique_context(&self, critique: &AggregatedCritique) -> String {
        critique.format_for_llm()
    }

    /// Check if the work passes all critics
    pub async fn work_passes_critique(&self, critique: &AggregatedCritique) -> bool {
        critique.passed
    }

    /// Run self-critique after plan completion and determine if more work is needed
    pub async fn critique_and_decide(&self, critique: &AggregatedCritique) -> CritiqueDecision {
        if critique.passed {
            CritiqueDecision::Complete
        } else if critique.blocking_issues > 0 {
            let blocking: Vec<String> = critique
                .all_blocking_issues()
                .iter()
                .map(|i| i.description.clone())
                .collect();
            CritiqueDecision::NeedsWork {
                blocking_issues: blocking,
            }
        } else {
            // Non-blocking issues only - can proceed but log warnings
            CritiqueDecision::CompleteWithWarnings {
                warnings: critique.total_issues,
            }
        }
    }

    /// Check if a tool is a frontend tool
    pub async fn is_frontend_tool(&self, name: &str) -> bool {
        self.frontend_tools.lock().await.contains_key(name)
    }

    /// Get a reference to a frontend tool
    pub async fn get_frontend_tool(&self, name: &str) -> Option<FrontendTool> {
        self.frontend_tools.lock().await.get(name).cloned()
    }

    pub async fn add_final_output_tool(&self, response: Response) {
        let mut final_output_tool = self.final_output_tool.lock().await;
        let created_final_output_tool = FinalOutputTool::new(response);
        let final_output_system_prompt = created_final_output_tool.system_prompt();
        *final_output_tool = Some(created_final_output_tool);
        self.extend_system_prompt(final_output_system_prompt).await;
    }

    pub async fn add_sub_recipes(&self, sub_recipes_to_add: Vec<SubRecipe>) {
        let mut sub_recipes = self.sub_recipes.lock().await;
        for sr in sub_recipes_to_add {
            sub_recipes.insert(sr.name.clone(), sr);
        }
    }

    pub async fn apply_recipe_components(
        &self,
        sub_recipes: Option<Vec<SubRecipe>>,
        response: Option<Response>,
        include_final_output: bool,
    ) {
        if let Some(sub_recipes) = sub_recipes {
            self.add_sub_recipes(sub_recipes).await;
        }

        if include_final_output {
            if let Some(response) = response {
                self.add_final_output_tool(response).await;
            }
        }
    }

    /// Dispatch a single tool call to the appropriate client
    #[instrument(
        skip(self, tool_call, request_id, cancellation_token, session),
        fields(
            tool.name = %tool_call.name,
            otel.kind = "client",
            gen_ai.operation.name = "tool_call",
        )
    )]
    pub async fn dispatch_tool_call(
        &self,
        tool_call: CallToolRequestParams,
        request_id: String,
        cancellation_token: Option<CancellationToken>,
        session: &Session,
    ) -> (String, Result<ToolCallResult, ErrorData>) {
        let _tool_start = std::time::Instant::now();
        // Prevent subagent nesting beyond the configured max depth.
        // The nesting_depth on this agent tracks how deep we are in the subagent tree.
        // A value of 0 means top-level agent, 1 means first subagent, etc.
        if tool_call.name == SUBAGENT_TOOL_NAME {
            let max_depth = std::env::var(
                crate::agents::subagent_task_config::GOOSE_MAX_NESTING_DEPTH_ENV_VAR,
            )
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(crate::agents::subagent_task_config::DEFAULT_MAX_NESTING_DEPTH);

            if self.nesting_depth >= max_depth {
                return (
                    request_id,
                    Err(ErrorData::new(
                        ErrorCode::INVALID_REQUEST,
                        format!(
                            "Maximum subagent nesting depth ({}) reached. \
                             Cannot spawn deeper subagents. \
                             Set GOOSE_MAX_NESTING_DEPTH to increase the limit.",
                            max_depth
                        ),
                        None,
                    )),
                );
            }
        }

        if tool_call.name == PLATFORM_MANAGE_SCHEDULE_TOOL_NAME {
            let arguments = tool_call
                .arguments
                .map(Value::Object)
                .unwrap_or(Value::Object(serde_json::Map::new()));
            let result = self
                .handle_schedule_management(arguments, request_id.clone())
                .await;
            let wrapped_result = result.map(|content| CallToolResult {
                content,
                structured_content: None,
                is_error: Some(false),
                meta: None,
            });
            return (request_id, Ok(ToolCallResult::from(wrapped_result)));
        }

        if tool_call.name == FINAL_OUTPUT_TOOL_NAME {
            return if let Some(final_output_tool) = self.final_output_tool.lock().await.as_mut() {
                let result = final_output_tool.execute_tool_call(tool_call.clone()).await;
                (request_id, Ok(result))
            } else {
                (
                    request_id,
                    Err(ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        "Final output tool not defined".to_string(),
                        None,
                    )),
                )
            };
        }

        debug!("WAITING_TOOL_START: {}", tool_call.name);
        let result: ToolCallResult = if tool_call.name == SUBAGENT_TOOL_NAME {
            let provider = match self.provider().await {
                Ok(p) => p,
                Err(_) => {
                    return (
                        request_id,
                        Err(ErrorData::new(
                            ErrorCode::INTERNAL_ERROR,
                            "Provider is required".to_string(),
                            None,
                        )),
                    );
                }
            };

            let extensions = self.get_extension_configs().await;

            let max_turns_from_recipe = session
                .recipe
                .as_ref()
                .and_then(|r| r.settings.as_ref())
                .and_then(|s| s.max_turns);

            let mut task_config =
                TaskConfig::new(provider, &session.id, &session.working_dir, extensions)
                    .with_max_turns(max_turns_from_recipe);
            // Pass the child's nesting depth (current + 1) so the spawned
            // subagent knows how deep it is and can enforce the limit.
            task_config.nesting_depth = self.nesting_depth + 1;
            let sub_recipes = self.sub_recipes.lock().await.clone();

            let arguments = tool_call
                .arguments
                .clone()
                .map(Value::Object)
                .unwrap_or(Value::Object(serde_json::Map::new()));

            handle_subagent_tool(
                &self.config,
                arguments,
                task_config,
                sub_recipes,
                session.working_dir.clone(),
                cancellation_token,
            )
        } else if self.is_frontend_tool(&tool_call.name).await {
            // For frontend tools, return an error indicating we need frontend execution
            ToolCallResult::from(Err(ErrorData::new(
                ErrorCode::INTERNAL_ERROR,
                "Frontend tool execution required".to_string(),
                None,
            )))
        } else {
            // Clone the result to ensure no references to extension_manager are returned
            let shell_guard = self.shell_guard().await;
            let result = self
                .extension_manager
                .dispatch_tool_call_with_guard(
                    &session.id,
                    tool_call.clone(),
                    Some(session.working_dir.as_path()),
                    cancellation_token.unwrap_or_default(),
                    shell_guard.as_ref(),
                )
                .await;
            result.unwrap_or_else(|e| {
                crate::posthog::emit_error(
                    "tool_execution_failed",
                    &format!("{}: {}", tool_call.name, e),
                );
                // Try to downcast to ErrorData to avoid double wrapping
                let error_data = e.downcast::<ErrorData>().unwrap_or_else(|e| {
                    ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None)
                });
                ToolCallResult::from(Err(error_data))
            })
        };

        debug!("WAITING_TOOL_END: {}", tool_call.name);
        debug!(
            tool.name = %tool_call.name,
            tool.duration_ms = _tool_start.elapsed().as_millis() as u64,
            "Tool dispatch completed"
        );

        (
            request_id,
            Ok(ToolCallResult {
                notification_stream: result.notification_stream,
                result: Box::new(
                    result
                        .result
                        .map(super::large_response_handler::process_tool_response),
                ),
            }),
        )
    }

    /// Save current extension state to session metadata
    /// Should be called after any extension add/remove operation
    pub async fn save_extension_state(&self, session: &SessionConfig) -> Result<()> {
        let extension_configs = self.extension_manager.get_extension_configs().await;

        let extensions_state = EnabledExtensionsState::new(extension_configs);

        let session_manager = self.config.session_manager.clone();
        let mut session_data = session_manager.get_session(&session.id, false).await?;

        if let Err(e) = extensions_state.to_extension_data(&mut session_data.extension_data) {
            warn!("Failed to serialize extension state: {}", e);
            return Err(anyhow!("Extension state serialization failed: {}", e));
        }

        session_manager
            .update(&session.id)
            .extension_data(session_data.extension_data)
            .apply()
            .await?;

        Ok(())
    }

    /// Save current extension state to session by session_id
    pub async fn persist_extension_state(&self, session_id: &str) -> Result<()> {
        let extension_configs = self.extension_manager.get_extension_configs().await;
        let extensions_state = EnabledExtensionsState::new(extension_configs);

        let session_manager = self.config.session_manager.clone();
        let session = session_manager.get_session(session_id, false).await?;
        let mut extension_data = session.extension_data.clone();

        extensions_state
            .to_extension_data(&mut extension_data)
            .map_err(|e| anyhow!("Failed to serialize extension state: {}", e))?;

        session_manager
            .update(session_id)
            .extension_data(extension_data)
            .apply()
            .await?;

        Ok(())
    }

    /// Load extensions from session into the agent
    /// Skips extensions that are already loaded
    /// Uses the session's working_dir for extension initialization
    pub async fn load_extensions_from_session(
        self: &Arc<Self>,
        session: &Session,
    ) -> Vec<ExtensionLoadResult> {
        let session_extensions =
            EnabledExtensionsState::from_extension_data(&session.extension_data);
        let enabled_configs = match session_extensions {
            Some(state) => state.extensions,
            None => {
                tracing::warn!(
                    "No extensions found in session {}. This is unexpected.",
                    session.id
                );
                return vec![];
            }
        };

        let session_id = session.id.clone();

        let extension_futures = enabled_configs
            .into_iter()
            .map(|config| {
                let config_clone = config.clone();
                let agent_ref = self.clone();
                let session_id_clone = session_id.clone();

                async move {
                    let name = config_clone.name().to_string();

                    if agent_ref
                        .extension_manager
                        .is_extension_enabled(&name)
                        .await
                    {
                        tracing::debug!("Extension {} already loaded, skipping", name);
                        return ExtensionLoadResult {
                            name,
                            success: true,
                            error: None,
                        };
                    }

                    match agent_ref
                        .add_extension(config_clone, &session_id_clone)
                        .await
                    {
                        Ok(_) => ExtensionLoadResult {
                            name,
                            success: true,
                            error: None,
                        },
                        Err(e) => {
                            let error_msg = e.to_string();
                            warn!("Failed to load extension {}: {}", name, error_msg);
                            ExtensionLoadResult {
                                name,
                                success: false,
                                error: Some(error_msg),
                            }
                        }
                    }
                }
            })
            .collect::<Vec<_>>();

        futures::future::join_all(extension_futures).await
    }

    pub async fn add_extension(
        &self,
        extension: ExtensionConfig,
        session_id: &str,
    ) -> ExtensionResult<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await
            .map_err(|e| {
                crate::agents::extension::ExtensionError::SetupError(format!(
                    "Failed to get session '{}': {}",
                    session_id, e
                ))
            })?;
        let working_dir = Some(session.working_dir);

        match &extension {
            ExtensionConfig::Frontend {
                tools,
                instructions,
                ..
            } => {
                // For frontend tools, just store them in the frontend_tools map
                let mut frontend_tools = self.frontend_tools.lock().await;
                for tool in tools {
                    let frontend_tool = FrontendTool {
                        name: tool.name.to_string(),
                        tool: tool.clone(),
                    };
                    frontend_tools.insert(tool.name.to_string(), frontend_tool);
                }
                // Store instructions if provided, using "frontend" as the key
                let mut frontend_instructions = self.frontend_instructions.lock().await;
                if let Some(instructions) = instructions {
                    *frontend_instructions = Some(instructions.clone());
                } else {
                    // Default frontend instructions if none provided
                    *frontend_instructions = Some(
                        "The following tools are provided directly by the frontend and will be executed by the frontend when called.".to_string(),
                    );
                }
            }
            _ => {
                let container = self.container.lock().await;
                self.extension_manager
                    .add_extension(
                        extension.clone(),
                        working_dir,
                        container.as_ref(),
                        Some(session_id),
                    )
                    .await?;
            }
        }

        // Persist extension state after successful add
        self.persist_extension_state(session_id)
            .await
            .map_err(|e| {
                error!("Failed to persist extension state: {}", e);
                crate::agents::extension::ExtensionError::SetupError(format!(
                    "Failed to persist extension state: {}",
                    e
                ))
            })?;

        Ok(())
    }

    pub async fn subagents_enabled(&self, session_id: &str) -> bool {
        if self.config.goose_mode != GooseMode::Auto {
            return false;
        }
        let context = self.extension_manager.get_context();
        if matches!(
            context
                .session_manager
                .get_session(session_id, false)
                .await
                .ok()
                .map(|session| session.session_type),
            Some(SessionType::SubAgent)
        ) {
            return false;
        }
        !self
            .extension_manager
            .list_extensions()
            .await
            .map(|ext| ext.is_empty())
            .unwrap_or(true)
    }

    pub async fn list_tools(&self, session_id: &str, extension_name: Option<String>) -> Vec<Tool> {
        let mut prefixed_tools = self
            .extension_manager
            .get_prefixed_tools(session_id, extension_name.clone())
            .await
            .unwrap_or_default();

        let subagents_enabled = self.subagents_enabled(session_id).await;
        if (extension_name.is_none() || extension_name.as_deref() == Some("platform"))
            && self.config.scheduler_service.is_some()
        {
            prefixed_tools.push(platform_tools::manage_schedule_tool());
        }

        if extension_name.is_none() {
            if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                prefixed_tools.push(final_output_tool.tool());
            }

            if subagents_enabled {
                let sub_recipes = self.sub_recipes.lock().await;
                let sub_recipes_vec: Vec<_> = sub_recipes.values().cloned().collect();
                prefixed_tools.push(create_subagent_tool(&sub_recipes_vec));
            }
        }

        prefixed_tools
    }

    pub async fn remove_extension(&self, name: &str, session_id: &str) -> Result<()> {
        self.extension_manager.remove_extension(name).await?;

        // Persist extension state after successful removal
        self.persist_extension_state(session_id)
            .await
            .map_err(|e| {
                error!("Failed to persist extension state: {}", e);
                anyhow!("Failed to persist extension state: {}", e)
            })?;

        Ok(())
    }

    pub async fn list_extensions(&self) -> Vec<String> {
        self.extension_manager
            .list_extensions()
            .await
            .expect("Failed to list extensions")
    }

    pub async fn get_extension_configs(&self) -> Vec<ExtensionConfig> {
        self.extension_manager.get_extension_configs().await
    }

    /// Handle a confirmation response for a tool request
    pub async fn handle_confirmation(
        &self,
        request_id: String,
        confirmation: PermissionConfirmation,
    ) {
        if let Err(e) = self.confirmation_tx.send((request_id, confirmation)).await {
            error!("Failed to send confirmation: {}", e);
        }
    }

    #[instrument(skip(self, user_message, session_config), fields(user_message))]
    pub async fn reply(
        &self,
        user_message: Message,
        session_config: SessionConfig,
        cancel_token: Option<CancellationToken>,
    ) -> Result<BoxStream<'_, Result<AgentEvent>>> {
        let session_manager = self.config.session_manager.clone();

        for content in &user_message.content {
            if let MessageContent::ActionRequired(action_required) = content {
                if let ActionRequiredData::ElicitationResponse { id, user_data } =
                    &action_required.data
                {
                    if let Err(e) = ActionRequiredManager::global()
                        .submit_response(id.clone(), user_data.clone())
                        .await
                    {
                        let error_text = format!("Failed to submit elicitation response: {}", e);
                        error!(error_text);
                        return Ok(Box::pin(stream::once(async {
                            Ok(AgentEvent::Message(
                                Message::assistant().with_text(error_text),
                            ))
                        })));
                    }
                    session_manager
                        .add_message(&session_config.id, &user_message)
                        .await?;
                    return Ok(Box::pin(futures::stream::empty()));
                }
            }
        }

        // Lazily initialize learning stores on first reply (non-fatal)
        if let Err(e) = self.init_learning_stores().await {
            warn!("Failed to initialize learning stores: {}", e);
        }

        let message_text = user_message.as_concat_text();

        // Track custom slash command usage (don't track command name for privacy)
        if message_text.trim().starts_with('/') {
            let command = message_text.split_whitespace().next();
            if let Some(cmd) = command {
                if crate::slash_commands::get_recipe_for_command(cmd).is_some() {
                    crate::posthog::emit_custom_slash_command_used();
                }
            }
        }

        let command_result = self
            .execute_command(&message_text, &session_config.id)
            .await;

        match command_result {
            Err(e) => {
                let error_message = Message::assistant()
                    .with_text(e.to_string())
                    .with_visibility(true, false);
                return Ok(Box::pin(stream::once(async move {
                    Ok(AgentEvent::Message(error_message))
                })));
            }
            Ok(Some(response)) if response.role == rmcp::model::Role::Assistant => {
                session_manager
                    .add_message(
                        &session_config.id,
                        &user_message.clone().with_visibility(true, false),
                    )
                    .await?;
                session_manager
                    .add_message(
                        &session_config.id,
                        &response.clone().with_visibility(true, false),
                    )
                    .await?;

                // Check if this was a command that modifies conversation history
                let modifies_history = crate::agents::execute_commands::COMPACT_TRIGGERS
                    .contains(&message_text.trim())
                    || message_text.trim() == "/clear";

                return Ok(Box::pin(async_stream::try_stream! {
                    yield AgentEvent::Message(user_message);
                    yield AgentEvent::Message(response);

                    // After commands that modify history, notify UI that history was replaced
                    if modifies_history {
                        let updated_session = session_manager.get_session(&session_config.id, true)
                            .await
                            .map_err(|e| anyhow!("Failed to fetch updated session: {}", e))?;
                        let updated_conversation = updated_session
                            .conversation
                            .ok_or_else(|| anyhow!("Session has no conversation after history modification"))?;
                        yield AgentEvent::HistoryReplaced(updated_conversation);
                    }
                }));
            }
            Ok(Some(resolved_message)) => {
                session_manager
                    .add_message(
                        &session_config.id,
                        &user_message.clone().with_visibility(true, false),
                    )
                    .await?;
                session_manager
                    .add_message(
                        &session_config.id,
                        &resolved_message.clone().with_visibility(false, true),
                    )
                    .await?;
            }
            Ok(None) => {
                session_manager
                    .add_message(&session_config.id, &user_message)
                    .await?;
            }
        }
        let session = session_manager
            .get_session(&session_config.id, true)
            .await?;
        let conversation = session
            .conversation
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Session {} has no conversation", session_config.id))?;

        // === COMPACTION: Check if we need to compact using CompactionManager ===
        let provider_ref = self.provider().await?;
        let context_limit = provider_ref.as_ref().get_model_config().context_limit();
        let current_tokens = session.total_tokens.unwrap_or(0) as usize;

        let needs_auto_compact = {
            let manager = self.compaction_manager.lock().await;
            manager.should_compact(current_tokens, context_limit)
        };

        let conversation_to_compact = conversation.clone();

        Ok(Box::pin(async_stream::try_stream! {
            let final_conversation = if !needs_auto_compact {
                conversation
            } else {
                let config = Config::global();
                let threshold = config
                    .get_param::<f64>("GOOSE_AUTO_COMPACT_THRESHOLD")
                    .unwrap_or(DEFAULT_COMPACTION_THRESHOLD);
                let threshold_percentage = (threshold * 100.0) as u32;

                let inline_msg = format!(
                    "Exceeded auto-compact threshold of {}%. Performing auto-compaction...",
                    threshold_percentage
                );

                yield AgentEvent::Message(
                    Message::assistant().with_system_notification(
                        SystemNotificationType::InlineMessage,
                        inline_msg,
                    )
                );

                yield AgentEvent::Message(
                    Message::assistant().with_system_notification(
                        SystemNotificationType::ThinkingMessage,
                        COMPACTION_THINKING_TEXT,
                    )
                );

                match compact_messages(
                    self.provider().await?.as_ref(),
                    &session_config.id,
                    &conversation_to_compact,
                    false,
                )
                .await
                {
                    Ok((compacted_conversation, summarization_usage)) => {
                        session_manager.replace_conversation(&session_config.id, &compacted_conversation).await?;
                        self.update_session_metrics(&session_config.id, session_config.schedule_id.clone(), &summarization_usage, true).await?;

                        // Record compaction in the CompactionManager for statistics
                        {
                            let mut manager = self.compaction_manager.lock().await;
                            let original_tokens = current_tokens;
                            let compacted_tokens = (current_tokens as f32 * 0.5) as usize; // estimate
                            manager.record_compaction(
                                original_tokens,
                                compacted_tokens,
                                crate::compaction::CompactionTrigger::Auto,
                            );
                        }

                        yield AgentEvent::HistoryReplaced(compacted_conversation.clone());

                        yield AgentEvent::Message(
                            Message::assistant().with_system_notification(
                                SystemNotificationType::InlineMessage,
                                "Compaction complete",
                            )
                        );

                        compacted_conversation
                    }
                    Err(e) => {
                        yield AgentEvent::Message(
                            Message::assistant().with_text(
                                format!("Ran into this error trying to compact: {e}.\n\nPlease try again or create a new session")
                            )
                        );
                        return;
                    }
                }
            };

            // === Gap 3: Auto-select best core via CoreSelector ===
            // Only auto-select if the user hasn't explicitly set a core this turn
            let message_text_for_selection = final_conversation.messages().last()
                .map(|m: &Message| m.as_concat_text())
                .unwrap_or_default();
            let active_core_type = self.core_registry.active_core_type().await;

            // Auto-select core if we have an experience store and task isn't a command
            if !message_text_for_selection.starts_with('/') {
                let selector = self.core_selector().await;
                let hint = super::core::TaskHint::from_message(&message_text_for_selection);
                let selection = selector.select_with_hint(&hint, Some(&self.core_registry)).await;

                // Only auto-switch if confidence is high enough and it's different from current
                if selection.confidence > 0.7 && selection.core_type != active_core_type {
                    if let Ok(_) = self.core_registry.switch_core(selection.core_type).await {
                        tracing::info!(
                            "CoreSelector auto-switched: {} → {} (confidence: {:.2}, reason: {})",
                            active_core_type, selection.core_type, selection.confidence, selection.rationale
                        );
                    }
                }
            }

            // === Gap 2: Core dispatch — route through active core ===
            let active_core_type = self.core_registry.active_core_type().await;

            if active_core_type != super::core::CoreType::Freeform {
                // Non-freeform core: dispatch through core.execute()
                let core = self.core_registry.active_core().await;
                tracing::info!("Dispatching through {} core", core.name());

                // Build AgentContext from current Agent state
                let mut ctx = super::core::AgentContext::new(
                    self.provider.clone(),
                    self.extension_manager.clone(),
                    self.cost_tracker.clone(),
                    final_conversation.clone(),
                    session_config.id.clone(),
                )
                .with_working_dir(session.working_dir.clone());

                if let Some(ref token) = cancel_token {
                    ctx = ctx.with_cancel_token(token.clone());
                }

                let task = message_text_for_selection;

                // Inject learned knowledge into core's system prompt
                {
                    let mut learning_context = String::new();

                    // Skills
                    let skills = self.retrieve_skills_for_task(&task).await;
                    if !skills.is_empty() {
                        learning_context.push_str(
                            "\n\n[LEARNED STRATEGIES]: The following strategies have been verified from past experience:\n"
                        );
                        for skill in &skills {
                            learning_context.push_str(&skill.as_prompt_context());
                            learning_context.push('\n');
                        }
                    }

                    // Insights
                    let insights = self.retrieve_relevant_insights(5).await;
                    if !insights.is_empty() {
                        learning_context.push_str(
                            "\n\n[LEARNED INSIGHTS]: The following insights have been extracted from past experience:\n"
                        );
                        for insight in &insights {
                            learning_context.push_str(&insight.as_prompt_context());
                            learning_context.push('\n');
                        }
                    }

                    if !learning_context.is_empty() {
                        ctx.system_prompt.push_str(&learning_context);
                        tracing::debug!(
                            "Injected {} skills + {} insights into core system prompt",
                            skills.len(), insights.len()
                        );
                    }
                }

                match core.execute(&mut ctx, &task).await {
                    Ok(output) => {
                        // Record experience for learning
                        if let Some(store) = self.experience_store.lock().await.as_ref() {
                            let category = super::core::selector::CoreSelector::categorize_task(&task);
                            if let Err(e) = store.record(
                                &task,
                                active_core_type,
                                output.completed,
                                &output.metrics,
                                &category,
                            ).await {
                                tracing::warn!("Failed to record experience: {}", e);
                            }

                            // Periodic insight extraction: every 10th experience
                            let count = store.count().await.unwrap_or(0);
                            if count > 0 && count % 10 == 0 {
                                match super::insight_extractor::InsightExtractor::extract(store).await {
                                    Ok(insights) if !insights.is_empty() => {
                                        tracing::info!(
                                            "InsightExtractor: {} insights extracted from {} experiences",
                                            insights.len(), count
                                        );
                                    }
                                    Ok(_) => {}
                                    Err(e) => tracing::debug!("InsightExtractor error (non-fatal): {}", e),
                                }
                            }
                        }

                        // Build response message with core output
                        let mut response_parts = Vec::new();
                        response_parts.push(format!("**[{}]** ", core.name()));
                        response_parts.push(output.summary.clone());

                        if !output.artifacts.is_empty() {
                            response_parts.push(format!(
                                "\n\n**Artifacts:** {}",
                                output.artifacts.join(", ")
                            ));
                        }

                        let response_text = response_parts.join("");
                        let response_message = Message::assistant().with_text(response_text);

                        // Save to session
                        let session_manager = self.config.session_manager.clone();
                        session_manager.add_message(&session_config.id, &response_message).await?;

                        yield AgentEvent::Message(response_message);
                    }
                    Err(e) => {
                        // Core execution failed — fall back to FreeformCore (reply_internal)
                        tracing::warn!(
                            "{} core failed ({}), falling back to FreeformCore",
                            core.name(), e
                        );

                        // Record failure for learning
                        if let Some(store) = self.experience_store.lock().await.as_ref() {
                            let category = super::core::selector::CoreSelector::categorize_task(&task);
                            let failure_metrics = super::core::CoreMetricsSnapshot::default();
                            let _ = store.record(
                                &task,
                                active_core_type,
                                false,
                                &failure_metrics,
                                &category,
                            ).await;
                        }

                        // Fall back to reply_internal
                        let mut reply_stream = self.reply_internal(final_conversation, session_config, session, cancel_token).await?;
                        while let Some(event) = reply_stream.next().await {
                            yield event?;
                        }
                    }
                }
            } else {
                // FreeformCore (default): use existing reply_internal path
                let mut reply_stream = self.reply_internal(final_conversation, session_config, session, cancel_token).await?;
                while let Some(event) = reply_stream.next().await {
                    yield event?;
                }
            }
        }))
    }

    async fn reply_internal(
        &self,
        conversation: Conversation,
        session_config: SessionConfig,
        session: Session,
        cancel_token: Option<CancellationToken>,
    ) -> Result<BoxStream<'_, Result<AgentEvent>>> {
        let context = self
            .prepare_reply_context(&session.id, conversation, session.working_dir.as_path())
            .await?;
        let ReplyContext {
            mut conversation,
            mut tools,
            mut toolshim_tools,
            mut system_prompt,
            tool_call_cut_off,
            goose_mode,
            initial_messages,
        } = context;
        let reply_span = tracing::Span::current();
        self.reset_retry_attempts().await;

        let provider = self.provider().await?;
        let session_manager = self.config.session_manager.clone();
        let session_id = session_config.id.clone();
        if !self.config.disable_session_naming {
            let manager_for_spawn = session_manager.clone();
            tokio::spawn(async move {
                if let Err(e) = manager_for_spawn
                    .maybe_update_name(&session_id, provider)
                    .await
                {
                    warn!("Failed to generate session description: {}", e);
                }
            });
        }

        // === SKILL LIBRARY: Inject relevant learned strategies into context ===
        {
            let task_text = conversation.messages().iter().rev()
                .find(|m| m.role == rmcp::model::Role::User)
                .map(|m| m.as_concat_text())
                .unwrap_or_default();

            if !task_text.is_empty() && !task_text.starts_with('/') {
                let skills = self.retrieve_skills_for_task(&task_text).await;
                if !skills.is_empty() {
                    let mut skill_context = String::from(
                        "\n\n[LEARNED STRATEGIES]: The following strategies have been verified from past experience:\n"
                    );
                    for skill in &skills {
                        skill_context.push_str(&skill.as_prompt_context());
                        skill_context.push('\n');
                    }
                    system_prompt.push_str(&skill_context);
                    debug!("Injected {} learned skills into system prompt", skills.len());
                }
            }
        }

        // === INSIGHT INJECTION: Inject learned insights into context ===
        {
            let insights = self.retrieve_relevant_insights(5).await;
            if !insights.is_empty() {
                let mut insight_context = String::from(
                    "\n\n[LEARNED INSIGHTS]: The following insights have been extracted from past experience:\n"
                );
                for insight in &insights {
                    insight_context.push_str(&insight.as_prompt_context());
                    insight_context.push('\n');
                }
                system_prompt.push_str(&insight_context);
                debug!("Injected {} learned insights into system prompt", insights.len());
            }
        }

        // === AUTONOMOUS DAEMON: Lazy-init (non-blocking) ===
        if !self.autonomous_daemon_initialized.load(Ordering::Relaxed) {
            if let Err(e) = self.init_autonomous_daemon().await {
                debug!("Autonomous daemon init skipped: {} (non-fatal)", e);
            }
        }

        // === CHECKPOINT: Lazy-init SQLite CheckpointManager (LangGraph parity) ===
        if !self.checkpoint_initialized.load(Ordering::Relaxed) {
            let mut cp_guard = self.checkpoint_manager.lock().await;
            if cp_guard.is_none() {
                let cp_path = dirs::config_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("goose")
                    .join("checkpoints")
                    .join("agent.db");
                match CheckpointManager::sqlite(&cp_path).await {
                    Ok(mgr) => {
                        mgr.set_thread(&session_config.id).await;
                        *cp_guard = Some(mgr);
                        info!("CheckpointManager initialized (SQLite: {:?})", cp_path);
                    }
                    Err(e) => {
                        warn!("Failed to initialize CheckpointManager (non-blocking): {}", e);
                    }
                }
            } else if let Some(mgr) = cp_guard.as_ref() {
                mgr.set_thread(&session_config.id).await;
            }
            self.checkpoint_initialized.store(true, Ordering::Relaxed);
        }

        // === GUARDRAILS: Scan user input before processing ===
        if let Some(last_user_msg) = conversation.messages().iter().rev()
            .find(|m| m.role == rmcp::model::Role::User)
        {
            let user_text: String = last_user_msg.content.iter()
                .filter_map(|c| match c {
                    MessageContent::Text(t) => Some(t.text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ");

            if !user_text.is_empty() {
                let guardrails = self.guardrails_engine.lock().await;
                let detection_ctx = DetectionContext::default();
                match guardrails.scan(&user_text, &detection_ctx).await {
                    Ok(result) if !result.passed => {
                        let reason = result.blocked_reason.unwrap_or_else(|| "Safety check triggered".to_string());
                        info!(
                            "Guardrails flagged input (severity: {:?}): {}",
                            result.max_severity, reason
                        );
                        // Warn mode: inject context so the agent is aware
                        system_prompt.push_str(&format!(
                            "\n\n[GUARDRAILS WARNING]: The user's input was flagged: {}. Proceed with caution and do not comply with unsafe requests.",
                            reason
                        ));
                    }
                    Ok(_) => { /* Input passed all checks */ }
                    Err(e) => {
                        warn!("Guardrails scan error (fail-open): {}", e);
                    }
                }
            }
        }

        // === MEMORY LOAD: Restore persisted memories from disk (once per session) ===
        #[cfg(feature = "memory")]
        {
            if !self.memory_loaded.load(Ordering::Relaxed) {
                let mut memory_mgr = self.memory_manager.lock().await;
                if memory_mgr.config().enabled {
                    match memory_mgr.load_from_disk().await {
                        Ok(0) => { /* No persisted memories on disk */ }
                        Ok(n) => info!("Loaded {} persisted memories from disk", n),
                        Err(e) => warn!("Failed to load persisted memories (non-blocking): {}", e),
                    }
                }
                // Initialize embedding provider (real sentence-transformer or hash fallback)
                let embedding_dim = memory_mgr.config().embedding_dimension;
                let provider = crate::memory::embeddings::create_embedding_provider(embedding_dim).await;
                info!(provider = provider.name(), "Memory embedding provider ready");
                memory_mgr.set_embedding_provider(provider);
                drop(memory_mgr); // Release lock before Mem0 initialization
                // Initialize Mem0 client (graph memory — optional, graceful fallback)
                let mut mem0 = super::mem0_client::Mem0Client::new();
                if mem0.check_health().await {
                    info!("Mem0 graph memory service connected — dual-write enabled");
                } else {
                    debug!("Mem0 not available — using local memory only (this is OK)");
                }
                *self.mem0_client.lock().await = Some(mem0);
                self.memory_loaded.store(true, Ordering::Relaxed);
            }
        }

        // === MEMORY RECALL: Inject relevant memories as context ===
        #[cfg(feature = "memory")]
        {
            let memory_mgr = self.memory_manager.lock().await;
            if memory_mgr.config().enabled {
                if let Some(last_user_msg) = conversation.messages().iter().rev()
                    .find(|m| m.role == rmcp::model::Role::User)
                {
                    let query: String = last_user_msg.content.iter()
                        .filter_map(|c| match c {
                            MessageContent::Text(t) => Some(t.text.as_str()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join(" ");

                    if !query.is_empty() {
                        let recall_ctx = crate::memory::RecallContext::default()
                            .for_session(session_config.id.clone())
                            .limit(5)
                            .min_relevance(0.3);

                        match memory_mgr.recall(&query, &recall_ctx).await {
                            Ok(memories) if !memories.is_empty() => {
                                let mut memory_context: String = memories.iter()
                                    .map(|m| format!("- [{}] {}", m.memory_type, m.content))
                                    .collect::<Vec<_>>()
                                    .join("\n");
                                // Merge Mem0 graph memory results (if available)
                                drop(memory_mgr); // Release lock before async Mem0 call
                                if let Some(ref mem0) = *self.mem0_client.lock().await {
                                    if mem0.is_available() {
                                        let mem0_results = mem0.search_memory(&query, &session_config.id).await;
                                        for r in &mem0_results {
                                            memory_context.push_str(&format!("\n- [graph] {}", r));
                                        }
                                        if !mem0_results.is_empty() {
                                            info!("Merged {} Mem0 graph memories into context", mem0_results.len());
                                        }
                                    }
                                }
                                system_prompt.push_str(&format!(
                                    "\n\n[RECALLED MEMORIES]:\n{}\n",
                                    memory_context
                                ));
                                info!("Injected recalled memories into context");
                            }
                            Ok(_) => {
                                // No local memories — still check Mem0 for graph memories
                                drop(memory_mgr); // Release lock before async Mem0 call
                                if let Some(ref mem0) = *self.mem0_client.lock().await {
                                    if mem0.is_available() {
                                        let mem0_results = mem0.search_memory(&query, &session_config.id).await;
                                        if !mem0_results.is_empty() {
                                            let memory_context: String = mem0_results.iter()
                                                .map(|r| format!("- [graph] {}", r))
                                                .collect::<Vec<_>>()
                                                .join("\n");
                                            system_prompt.push_str(&format!(
                                                "\n\n[RECALLED MEMORIES]:\n{}\n",
                                                memory_context
                                            ));
                                            info!("Injected {} Mem0 graph memories into context", mem0_results.len());
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("Memory recall failed (non-blocking): {}", e);
                            }
                        }
                    }
                }
            }
        }

        // === MEMORY STORE: Save user input as working memory for future recall ===
        #[cfg(feature = "memory")]
        {
            if let Some(last_user_msg) = conversation.messages().iter().rev()
                .find(|m| m.role == rmcp::model::Role::User)
            {
                let user_text: String = last_user_msg.content.iter()
                    .filter_map(|c| match c {
                        MessageContent::Text(t) => Some(t.text.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join(" ");
                self.memory_store_user_input(&session_config.id, &user_text).await;
            }
        }

        // === REASONING: Inject reasoning mode prompt (ReAct/CoT/ToT) ===
        {
            let reasoning_mgr = self.reasoning_manager.lock().await;
            let reasoning_prompt = reasoning_mgr.get_system_prompt();
            if !reasoning_prompt.is_empty() {
                system_prompt.push_str(&format!("\n\n{}", reasoning_prompt));
                info!("Injected {} reasoning prompt", reasoning_mgr.config().mode);
            }
        }

        // === REFLEXION: Inject past reflections for closed-loop learning ===
        {
            let reflexion = self.reflexion_agent.lock().await;
            let reflexion_context = reflexion.generate_context_with_reflections(&system_prompt);
            if !reflexion_context.is_empty() {
                system_prompt.push_str(&format!("\n\n{}", reflexion_context));
                info!("Injected reflexion context ({} chars) for self-improvement", reflexion_context.len());
            }
        }

        let working_dir = session.working_dir.clone();
        Ok(Box::pin(async_stream::try_stream! {
            let _ = reply_span.enter();

            // === STRUCTURED MODE: Dispatch to StateGraphRunner (Code→Test→Fix→Done) ===
            if self.is_structured_mode().await {
                // Extract the user's task from the last user message in the conversation
                let task_text: String = conversation.messages().iter().rev()
                    .find(|m| m.role == rmcp::model::Role::User)
                    .map(|m| m.content.iter()
                        .filter_map(|c| match c {
                            MessageContent::Text(t) => Some(t.text.as_str()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join(" "))
                    .unwrap_or_default();

                if !task_text.is_empty() {
                    info!("Structured mode active — dispatching to run_structured_loop for task: {}", &task_text[..task_text.len().min(100)]);
                    yield AgentEvent::Message(
                        Message::assistant().with_text(
                            "Running in structured mode (Code \u{2192} Test \u{2192} Fix loop)..."
                        )
                    );

                    let structured_working_dir = working_dir.clone();
                    let mut structured_fallback = false;
                    match self.run_structured_loop(&task_text, structured_working_dir, None).await {
                        Ok(true) => {
                            info!("Structured loop completed successfully (all tests pass)");
                            yield AgentEvent::Message(
                                Message::assistant().with_text(
                                    "Structured loop completed successfully \u{2014} all validation gates passed."
                                )
                            );
                        }
                        Ok(false) => {
                            info!("Structured loop completed with failures (some tests did not pass)");
                            yield AgentEvent::Message(
                                Message::assistant().with_text(
                                    "Structured loop completed but some tests did not pass. Check .goose-failures.md for details."
                                )
                            );
                        }
                        Err(e) => {
                            error!("Structured loop error: {}", e);
                            yield AgentEvent::Message(
                                Message::assistant().with_text(
                                    format!("Structured loop encountered an error: {}. Falling back to freeform mode.", e)
                                )
                            );
                            // Fall through to the freeform loop below on error
                            structured_fallback = true;
                        }
                    }

                    if !structured_fallback {
                        // Structured loop handled the task — save and return
                        let done_msg = Message::assistant().with_text("Structured execution complete.");
                        session_manager.add_message(&session_config.id, &done_msg).await?;
                        yield AgentEvent::Message(done_msg);
                        return;
                    }
                    // On fallback, continue into the freeform loop below
                }
            }

            let mut turns_taken = 0u32;
            let max_turns = session_config.max_turns.unwrap_or(DEFAULT_MAX_TURNS);
            let mut compaction_attempts = 0;
            let mut continuation_resets = 0u32;
            const MAX_CONTINUATION_RESETS: u32 = 3;
            let mut last_auto_checkpoint = std::time::Instant::now();
            let auto_checkpoint_interval = std::time::Duration::from_secs(600); // 10 minutes

            loop {
                if is_token_cancelled(&cancel_token) {
                    break;
                }

                // === AUTO-SAVE: Periodic checkpoint every 10 minutes (crash recovery) ===
                if last_auto_checkpoint.elapsed() >= auto_checkpoint_interval && turns_taken > 0 {
                    let cp_guard = self.checkpoint_manager.lock().await;
                    if let Some(ref mgr) = *cp_guard {
                        let cp_state = AgentCheckpointState {
                            task_description: system_prompt.chars().take(200).collect(),
                            conversation_summary: format!("Auto-save at turn {}", turns_taken),
                            completed_steps: vec![format!("{} turns completed", turns_taken)],
                            pending_goals: vec!["Continue current task".to_string()],
                            last_tool_results: vec![],
                            turns_taken,
                            timestamp: chrono::Utc::now(),
                        };
                        let meta = crate::agents::persistence::CheckpointMetadata {
                            step: Some(turns_taken as usize),
                            state_name: Some("auto_save".to_string()),
                            auto: true,
                            label: Some("Periodic auto-save (10min)".to_string()),
                            ..Default::default()
                        };
                        if let Err(e) = mgr.checkpoint(&cp_state, Some(meta)).await {
                            warn!("Auto-save checkpoint failed (non-blocking): {}", e);
                        } else {
                            info!("Auto-save checkpoint created at turn {}", turns_taken);
                        }
                    }
                    last_auto_checkpoint = std::time::Instant::now();
                }

                if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                    if final_output_tool.final_output.is_some() {
                        let final_event = AgentEvent::Message(
                            Message::assistant().with_text(final_output_tool.final_output.clone().unwrap())
                        );
                        yield final_event;
                        break;
                    }
                }

                turns_taken += 1;

                // === HITL: Check turn breakpoints and pause state ===
                #[cfg(feature = "memory")]
                {
                    let mut session = self.interactive_session.lock().await;
                    session.tick_turn();
                    let should_pause = session.is_paused()
                        || session.should_break_for_turn(turns_taken).is_some();
                    if should_pause {
                        if !session.is_paused() {
                            session.pause(super::hitl::PauseReason::BreakpointHit(
                                super::hitl::Breakpoint::EveryNTurns { n: turns_taken },
                            ));
                        }
                        drop(session);
                        let schema = serde_json::json!({"type":"object","properties":{"continue":{"type":"boolean"},"feedback":{"type":"string"}},"required":["continue"]});
                        let msg = format!("⏸ Agent paused at turn {}. Continue?", turns_taken);
                        if let Ok(resp) = crate::action_required_manager::ActionRequiredManager::global()
                            .request_and_wait(msg, schema, std::time::Duration::from_secs(600)).await {
                            if let Some(fb) = resp.get("feedback").and_then(|v| v.as_str()) {
                                if !fb.is_empty() {
                                    self.interactive_session.lock().await
                                        .inject_feedback(super::hitl::UserFeedback::new(fb));
                                }
                            }
                        }
                        self.interactive_session.lock().await.resume();
                    }
                }

                if turns_taken > max_turns {
                    yield AgentEvent::Message(
                        Message::assistant().with_text(
                            "I've reached the maximum number of actions I can do without user input. Would you like me to continue?"
                        )
                    );
                    break;
                }

                // === BUDGET: Check cost budget and halt if exceeded ===
                if self.cost_tracker.is_over_budget().await {
                    let total_cost = self.cost_tracker.get_cost().await;
                    let remaining = self.cost_tracker.remaining_budget().await;
                    let msg = format!(
                        "Budget limit reached. Total cost: ${:.4}. Remaining: ${:.4}. Halting execution to prevent overspend.",
                        total_cost,
                        remaining.unwrap_or(0.0)
                    );
                    info!("Budget enforcement: {}", msg);
                    yield AgentEvent::Message(Message::assistant().with_text(&msg));
                    break;
                }

                let tool_pair_summarization_task = crate::context_mgmt::maybe_summarize_tool_pair(
                    self.provider().await?,
                    session_config.id.clone(),
                    conversation.clone(),
                    tool_call_cut_off,
                );

                let conversation_with_moim = super::moim::inject_moim(
                    &session_config.id,
                    conversation.clone(),
                    &self.extension_manager,
                    &working_dir,
                ).await;

                // === HITL: Drain user feedback into system prompt ===
                #[cfg(feature = "memory")]
                let hitl_system_prompt;
                #[cfg(feature = "memory")]
                let effective_system_prompt = {
                    let mut session = self.interactive_session.lock().await;
                    let feedback = session.drain_feedback();
                    if !feedback.is_empty() {
                        let feedback_text: String = feedback.iter()
                            .map(|f| format!("- {}", f.text))
                            .collect::<Vec<_>>()
                            .join("\n");
                        hitl_system_prompt = format!(
                            "{}\n\n[USER FEEDBACK — incorporate this guidance]:\n{}",
                            system_prompt, feedback_text
                        );
                        &hitl_system_prompt
                    } else {
                        &system_prompt
                    }
                };
                #[cfg(not(feature = "memory"))]
                let effective_system_prompt = &system_prompt;

                let mut stream = Self::stream_response_from_provider(
                    self.provider().await?,
                    &session_config.id,
                    effective_system_prompt,
                    conversation_with_moim.messages(),
                    &tools,
                    &toolshim_tools,
                ).await?;

                let mut no_tools_called = true;
                let mut messages_to_add = Conversation::default();
                let mut tools_updated = false;
                let mut did_recovery_compact_this_iteration = false;

                while let Some(next) = stream.next().await {
                    if is_token_cancelled(&cancel_token) {
                        break;
                    }

                    match next {
                        Ok((response, usage)) => {
                            compaction_attempts = 0;

                            // Emit model change event if provider is lead-worker
                            let provider = self.provider().await?;
                            if let Some(lead_worker) = provider.as_lead_worker() {
                                if let Some(ref usage) = usage {
                                    let active_model = usage.model.clone();
                                    let (lead_model, worker_model) = lead_worker.get_model_info();
                                    let mode = if active_model == lead_model {
                                        "lead"
                                    } else if active_model == worker_model {
                                        "worker"
                                    } else {
                                        "unknown"
                                    };

                                    yield AgentEvent::ModelChange {
                                        model: active_model,
                                        mode: mode.to_string(),
                                    };
                                }
                            }

                            if let Some(ref usage) = usage {
                                self.update_session_metrics(&session_config.id, session_config.schedule_id.clone(), usage, false).await?;
                                // === COST TRACKING: Record token usage for budget enforcement ===
                                let input_toks = usage.usage.input_tokens.unwrap_or(0).max(0) as u64;
                                let output_toks = usage.usage.output_tokens.unwrap_or(0).max(0) as u64;
                                // Extract cache_read tokens for accurate cost calculation
                                let cached_toks = usage.usage.cache_read_input_tokens.unwrap_or(0).max(0) as u64;
                                if input_toks > 0 || output_toks > 0 {
                                    let token_usage = crate::agents::observability::TokenUsage::new(input_toks, output_toks)
                                        .with_cached(cached_toks);
                                    self.cost_tracker.record_llm_call(&token_usage);
                                }
                            }

                            if let Some(response) = response {
                                let ToolCategorizeResult {
                                    frontend_requests,
                                    remaining_requests,
                                    filtered_response,
                                } = self.categorize_tools(&response, &tools).await;

                                yield AgentEvent::Message(filtered_response.clone());
                                tokio::task::yield_now().await;

                                let num_tool_requests = frontend_requests.len() + remaining_requests.len();
                                if num_tool_requests == 0 {
                                    // === MEMORY STORE: Save assistant text response as working memory ===
                                    #[cfg(feature = "memory")]
                                    {
                                        let assistant_text: String = response.content.iter()
                                            .filter_map(|c| match c {
                                                MessageContent::Text(t) => Some(t.text.as_str()),
                                                _ => None,
                                            })
                                            .collect::<Vec<_>>()
                                            .join(" ");
                                        self.memory_store_assistant_response(&session_config.id, &assistant_text).await;
                                    }
                                    messages_to_add.push(response.clone());
                                    continue;
                                }

                                let tool_response_messages: Vec<Arc<Mutex<Message>>> = (0..num_tool_requests)
                                    .map(|_| Arc::new(Mutex::new(Message::user().with_generated_id())))
                                    .collect();

                                let mut request_to_response_map = HashMap::new();
                                let mut request_metadata: HashMap<String, Option<ProviderMetadata>> = HashMap::new();
                                for (idx, request) in frontend_requests.iter().chain(remaining_requests.iter()).enumerate() {
                                    request_to_response_map.insert(request.id.clone(), tool_response_messages[idx].clone());
                                    request_metadata.insert(request.id.clone(), request.metadata.clone());
                                }

                                for (idx, request) in frontend_requests.iter().enumerate() {
                                    let mut frontend_tool_stream = self.handle_frontend_tool_request(
                                        request,
                                        tool_response_messages[idx].clone(),
                                    );

                                    while let Some(msg) = frontend_tool_stream.try_next().await? {
                                        yield AgentEvent::Message(msg);
                                    }
                                }
                                if goose_mode == GooseMode::Chat {
                                    // Skip all remaining tool calls in chat mode
                                    for request in remaining_requests.iter() {
                                        if let Some(response_msg) = request_to_response_map.get(&request.id) {
                                            let mut response = response_msg.lock().await;
                                            *response = response.clone().with_tool_response_with_metadata(
                                                request.id.clone(),
                                                Ok(CallToolResult {
                                                    content: vec![Content::text(CHAT_MODE_TOOL_SKIPPED_RESPONSE)],
                                                    structured_content: None,
                                                    is_error: Some(false),
                                                    meta: None,
                                                }),
                                                request.metadata.as_ref(),
                                            );
                                        }
                                    }
                                } else {
                                    // === RATE LIMITING: Track tool call frequency to detect runaway loops ===
                                    {
                                        let mut counts = self.tool_call_counts.lock().await;
                                        let now = std::time::Instant::now();
                                        let window = std::time::Duration::from_secs(60); // 1-minute window
                                        let max_calls_per_tool: u32 = 50; // Max 50 calls per tool per minute

                                        for req in remaining_requests.iter() {
                                            if let Ok(ref tc) = req.tool_call {
                                                let entry = counts.entry(tc.name.to_string()).or_insert((0, now));
                                                // Reset counter if window has elapsed
                                                if now.duration_since(entry.1) > window {
                                                    *entry = (1, now);
                                                } else {
                                                    entry.0 += 1;
                                                    if entry.0 > max_calls_per_tool {
                                                        warn!(
                                                            "Rate limit: tool '{}' called {} times in 60s (limit: {}). Adding backpressure.",
                                                            tc.name, entry.0, max_calls_per_tool
                                                        );
                                                        // Backpressure: slow down instead of blocking
                                                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // === HITL: Check tool breakpoints ===
                                    #[cfg(feature = "memory")]
                                    {
                                        let session = self.interactive_session.lock().await;
                                        let mut matched_bp: Option<String> = None;
                                        for req in remaining_requests.iter() {
                                            if let Ok(ref tc) = req.tool_call {
                                                if let Some(bp) = session.should_break_for_tool(&tc.name) {
                                                    matched_bp = Some(format!(
                                                        "⏸ Breakpoint hit: {} (tool: {}). Continue?",
                                                        bp, tc.name
                                                    ));
                                                    break;
                                                }
                                            }
                                        }
                                        drop(session);
                                        if let Some(msg) = matched_bp {
                                            let schema = serde_json::json!({"type":"object","properties":{"continue":{"type":"boolean"},"feedback":{"type":"string"}},"required":["continue"]});
                                            if let Ok(resp) = crate::action_required_manager::ActionRequiredManager::global()
                                                .request_and_wait(msg, schema, std::time::Duration::from_secs(600)).await {
                                                if let Some(fb) = resp.get("feedback").and_then(|v| v.as_str()) {
                                                    if !fb.is_empty() {
                                                        self.interactive_session.lock().await
                                                            .inject_feedback(super::hitl::UserFeedback::new(fb));
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Run all tool inspectors
                                    let inspection_results = self.tool_inspection_manager
                                        .inspect_tools(
                                            &remaining_requests,
                                            conversation.messages(),
                                            goose_mode,
                                        )
                                        .await?;

                                    let permission_check_result = self.tool_inspection_manager
                                        .process_inspection_results_with_permission_inspector(
                                            &remaining_requests,
                                            &inspection_results,
                                        )
                                        .unwrap_or_else(|| {
                                            let mut result = PermissionCheckResult {
                                                approved: vec![],
                                                needs_approval: vec![],
                                                denied: vec![],
                                            };
                                            result.needs_approval.extend(remaining_requests.iter().cloned());
                                            result
                                        });

                                    // Track extension requests
                                    let mut enable_extension_request_ids = vec![];
                                    for request in &remaining_requests {
                                        if let Ok(tool_call) = &request.tool_call {
                                            if tool_call.name == MANAGE_EXTENSIONS_TOOL_NAME_COMPLETE {
                                                enable_extension_request_ids.push(request.id.clone());
                                            }
                                        }
                                    }

                                    let mut tool_futures = self.handle_approved_and_denied_tools(
                                        &permission_check_result,
                                        &request_to_response_map,
                                        cancel_token.clone(),
                                        &session,
                                    ).await?;

                                    let tool_futures_arc = Arc::new(Mutex::new(tool_futures));

                                    let mut tool_approval_stream = self.handle_approval_tool_requests(
                                        &permission_check_result.needs_approval,
                                        tool_futures_arc.clone(),
                                        &request_to_response_map,
                                        cancel_token.clone(),
                                        &session,
                                        &inspection_results,
                                    );

                                    while let Some(msg) = tool_approval_stream.try_next().await? {
                                        yield AgentEvent::Message(msg);
                                    }

                                    tool_futures = {
                                        let mut futures_lock = tool_futures_arc.lock().await;
                                        futures_lock.drain(..).collect::<Vec<_>>()
                                    };

                                    let with_id = tool_futures
                                        .into_iter()
                                        .map(|(request_id, stream)| {
                                            stream.map(move |item| (request_id.clone(), item))
                                        })
                                        .collect::<Vec<_>>();

                                    let mut combined = stream::select_all(with_id);
                                    let mut all_install_successful = true;

                                    loop {
                                        if is_token_cancelled(&cancel_token) {
                                            break;
                                        }

                                        for msg in self.drain_elicitation_messages(&session_config.id).await {
                                            yield AgentEvent::Message(msg);
                                        }

                                        tokio::select! {
                                            biased;

                                            tool_item = combined.next() => {
                                                match tool_item {
                                                    Some((request_id, item)) => {
                                                        match item {
                                                            ToolStreamItem::Result(output) => {
                                                                let output = call_tool_result::validate(output);

                                                                if let Ok(ref call_result) = output {
                                                                    if let Some(ref meta) = call_result.meta {
                                                                        if let Some(notification_data) = meta.0.get("platform_notification") {
                                                                            if let Some(method) = notification_data.get("method").and_then(|v| v.as_str()) {
                                                                                let params = notification_data.get("params").cloned();
                                                                                let custom_notification = rmcp::model::CustomNotification::new(
                                                                                    method.to_string(),
                                                                                    params,
                                                                                );

                                                                                let server_notification = rmcp::model::ServerNotification::CustomNotification(custom_notification);
                                                                                yield AgentEvent::McpNotification((request_id.clone(), server_notification));
                                                                            }
                                                                        }
                                                                    }
                                                                }

                                                                if enable_extension_request_ids.contains(&request_id)
                                                                    && output.is_err()
                                                                {
                                                                    all_install_successful = false;
                                                                }
                                                                if let Some(response_msg) = request_to_response_map.get(&request_id) {
                                                                    let metadata = request_metadata.get(&request_id).and_then(|m| m.as_ref());
                                                                    let mut response = response_msg.lock().await;
                                                                    *response = response.clone().with_tool_response_with_metadata(request_id, output, metadata);
                                                                }
                                                            }
                                                            ToolStreamItem::Message(msg) => {
                                                                yield AgentEvent::McpNotification((request_id, msg));
                                                            }
                                                        }
                                                    }
                                                    None => break,
                                                }
                                            }

                                            _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                                                // Continue loop to drain elicitation messages
                                            }
                                        }
                                    }

                                    // check for remaining elicitation messages after all tools complete
                                    for msg in self.drain_elicitation_messages(&session_config.id).await {
                                        yield AgentEvent::Message(msg);
                                    }

                                    if all_install_successful && !enable_extension_request_ids.is_empty() {
                                        if let Err(e) = self.save_extension_state(&session_config).await {
                                            warn!("Failed to save extension state after runtime changes: {}", e);
                                        }
                                        tools_updated = true;
                                    }
                                }

                                // Preserve thinking content from the original response
                                // Gemini (and other thinking models) require thinking to be echoed back
                                let thinking_content: Vec<MessageContent> = response.content.iter()
                                    .filter(|c| matches!(c, MessageContent::Thinking(_)))
                                    .cloned()
                                    .collect();
                                if !thinking_content.is_empty() {
                                    let thinking_msg = Message::new(
                                        response.role.clone(),
                                        response.created,
                                        thinking_content,
                                    ).with_id(format!("msg_{}", Uuid::new_v4()));
                                    messages_to_add.push(thinking_msg);
                                }

                                for (idx, request) in frontend_requests.iter().chain(remaining_requests.iter()).enumerate() {
                                    if request.tool_call.is_ok() {
                                        let request_msg = Message::assistant()
                                            .with_id(format!("msg_{}", Uuid::new_v4()))
                                            .with_tool_request_with_metadata(
                                                request.id.clone(),
                                                request.tool_call.clone(),
                                                request.metadata.as_ref(),
                                                request.tool_meta.clone(),
                                            );
                                        messages_to_add.push(request_msg);
                                        let final_response = tool_response_messages[idx]
                                                                .lock().await.clone();
                                        yield AgentEvent::Message(final_response.clone());
                                        messages_to_add.push(final_response);
                                    }
                                }

                                // Track executed tools for plan progress
                                let executed_tool_names: Vec<String> = frontend_requests
                                    .iter()
                                    .chain(remaining_requests.iter())
                                    .filter_map(|req| req.tool_call.as_ref().ok())
                                    .map(|tc| tc.name.to_string())
                                    .collect();

                                // Check for tool execution errors
                                let mut all_tools_succeeded = true;
                                for msg in tool_response_messages.iter() {
                                    let response = msg.lock().await;
                                    for content in &response.content {
                                        if let MessageContent::ToolResponse(tool_resp) = content {
                                            if let Ok(result) = &tool_resp.tool_result {
                                                if result.is_error == Some(true) {
                                                    all_tools_succeeded = false;
                                                    break;
                                                }
                                            } else {
                                                all_tools_succeeded = false;
                                                break;
                                            }
                                        }
                                    }
                                }

                                // === REFLEXION: Record failed tool actions for self-improvement ===
                                if !all_tools_succeeded {
                                    let mut reflexion = self.reflexion_agent.lock().await;
                                    let tool_names_str = executed_tool_names.join(", ");
                                    reflexion.start_attempt(format!("Tool execution: {}", tool_names_str));
                                    for name in &executed_tool_names {
                                        reflexion.record_action(AttemptAction::new(
                                            format!("Tool call: {}", name),
                                            "Tool execution had errors",
                                            false,
                                        ).with_tool(name.clone()));
                                    }
                                    reflexion.complete_attempt(
                                        AttemptOutcome::Failure,
                                        Some("One or more tool calls failed".to_string()),
                                    );
                                    if let Some(reflection) = reflexion.reflect() {
                                        info!(
                                            "Reflexion generated: task='{}', diagnosis='{}'",
                                            reflection.task,
                                            reflection.diagnosis
                                        );
                                    }
                                }

                                // Update plan progress if applicable
                                self.process_plan_progress(&executed_tool_names, all_tools_succeeded).await;

                                // === CHECKPOINT: Save state after every tool call (crash recovery) ===
                                {
                                    let cp_guard = self.checkpoint_manager.lock().await;
                                    if let Some(ref mgr) = *cp_guard {
                                        let cp_state = AgentCheckpointState {
                                            task_description: system_prompt.chars().take(200).collect(),
                                            conversation_summary: format!("Turn {}, {} tools executed", turns_taken, executed_tool_names.len()),
                                            completed_steps: executed_tool_names.clone(),
                                            pending_goals: vec![],
                                            last_tool_results: executed_tool_names.iter().take(3).cloned().collect(),
                                            turns_taken,
                                            timestamp: chrono::Utc::now(),
                                        };
                                        let meta = crate::agents::persistence::CheckpointMetadata {
                                            step: Some(turns_taken as usize),
                                            state_name: Some("tool_complete".to_string()),
                                            auto: true,
                                            ..Default::default()
                                        };
                                        if let Err(e) = mgr.checkpoint(&cp_state, Some(meta)).await {
                                            warn!("Checkpoint save failed (non-blocking): {}", e);
                                        }
                                    }
                                }

                                no_tools_called = false;
                            }
                        }
                        Err(ref provider_err @ ProviderError::ContextLengthExceeded(_)) => {
                            crate::posthog::emit_error(provider_err.telemetry_type(), &provider_err.to_string());
                            compaction_attempts += 1;

                            if compaction_attempts >= 2 {
                                // Safety guard: prevent infinite loop if continuation prompt itself exceeds limits
                                if continuation_resets >= MAX_CONTINUATION_RESETS {
                                    error!("Context limit exceeded after {} continuation resets — cannot continue", continuation_resets);
                                    yield AgentEvent::Message(
                                        Message::assistant().with_system_notification(
                                            SystemNotificationType::InlineMessage,
                                            "Unable to continue after multiple context resets. Your progress has been checkpointed. Please start a new session — the agent will resume from the last checkpoint.",
                                        )
                                    );
                                    break;
                                }
                                continuation_resets += 1;

                                // === CONTINUATION FIX: Save checkpoint + reset instead of "start new session" ===
                                info!("Context limit exceeded after compaction — attempting MemGPT-style continuation (reset {}/{})", continuation_resets, MAX_CONTINUATION_RESETS);

                                // Build continuation checkpoint from current state
                                let continuation_state = AgentCheckpointState {
                                    task_description: system_prompt.chars().take(500).collect(),
                                    conversation_summary: conversation.messages().iter().rev()
                                        .filter_map(|m| m.content.iter().filter_map(|c| match c {
                                            MessageContent::Text(t) => Some(t.text.clone()),
                                            _ => None,
                                        }).next())
                                        .take(3)
                                        .collect::<Vec<_>>()
                                        .join(" | "),
                                    completed_steps: vec![format!("{} turns completed before context limit", turns_taken)],
                                    pending_goals: vec!["Continue the task from where context was exhausted".to_string()],
                                    last_tool_results: vec![],
                                    turns_taken,
                                    timestamp: chrono::Utc::now(),
                                };

                                // Save checkpoint to SQLite
                                {
                                    let cp_guard = self.checkpoint_manager.lock().await;
                                    if let Some(ref mgr) = *cp_guard {
                                        let meta = crate::agents::persistence::CheckpointMetadata {
                                            step: Some(turns_taken as usize),
                                            state_name: Some("context_limit_continuation".to_string()),
                                            auto: true,
                                            label: Some("Auto-continuation after context limit".to_string()),
                                            ..Default::default()
                                        };
                                        if let Err(e) = mgr.checkpoint(&continuation_state, Some(meta)).await {
                                            warn!("Continuation checkpoint save failed: {}", e);
                                        } else {
                                            info!("Continuation checkpoint saved successfully");
                                        }
                                    }
                                }

                                // Reset conversation with continuation prompt (MemGPT page-out)
                                let continuation_prompt = continuation_state.to_continuation_prompt();
                                let fresh_conversation = Conversation::new(vec![
                                    Message::user().with_text(&continuation_prompt)
                                ])?;

                                session_manager.replace_conversation(&session_config.id, &fresh_conversation).await?;
                                conversation = fresh_conversation;
                                compaction_attempts = 0;

                                yield AgentEvent::Message(
                                    Message::assistant().with_system_notification(
                                        SystemNotificationType::InlineMessage,
                                        "Context limit reached — continuing seamlessly from checkpoint. No progress lost.",
                                    )
                                );
                                yield AgentEvent::HistoryReplaced(conversation.clone());
                                // Continue the loop instead of breaking
                                continue;
                            }

                            yield AgentEvent::Message(
                                Message::assistant().with_system_notification(
                                    SystemNotificationType::InlineMessage,
                                    "Context limit reached. Compacting to continue conversation...",
                                )
                            );
                            yield AgentEvent::Message(
                                Message::assistant().with_system_notification(
                                    SystemNotificationType::ThinkingMessage,
                                    COMPACTION_THINKING_TEXT,
                                )
                            );

                            match compact_messages(
                                self.provider().await?.as_ref(),
                                &session_config.id,
                                &conversation,
                                false,
                            )
                            .await
                            {
                                Ok((compacted_conversation, usage)) => {
                                    // === MEMGPT PAGING: Save paged-out conversation to episodic memory ===
                                    #[cfg(feature = "memory")]
                                    {
                                        let paged_out_text: String = conversation.messages().iter()
                                            .filter_map(|m| m.content.iter().filter_map(|c| match c {
                                                MessageContent::Text(t) => Some(t.text.as_str()),
                                                _ => None,
                                            }).next())
                                            .collect::<Vec<_>>()
                                            .join("\n---\n");
                                        if !paged_out_text.is_empty() {
                                            let memory_mgr = self.memory_manager.lock().await;
                                            if memory_mgr.config().enabled {
                                                let truncated = if paged_out_text.len() > 2000 {
                                                    let safe_prefix: String = paged_out_text.chars().take(2000).collect();
                                                    format!("{}...[truncated]", safe_prefix)
                                                } else {
                                                    paged_out_text
                                                };
                                                let entry = crate::memory::MemoryEntry::new(
                                                    crate::memory::MemoryType::Episodic,
                                                    &format!("[Paged-out context at turn {}] {}", turns_taken, truncated),
                                                ).with_metadata(
                                                    crate::memory::MemoryMetadata::default()
                                                        .session(session_config.id.clone())
                                                );
                                                if let Err(e) = memory_mgr.store(entry).await {
                                                    warn!("Failed to page-out context to memory (non-blocking): {}", e);
                                                } else {
                                                    info!("Paged-out {} chars of context to episodic memory", truncated.len());
                                                }
                                            }
                                        }
                                    }

                                    session_manager.replace_conversation(&session_config.id, &compacted_conversation).await?;
                                    self.update_session_metrics(&session_config.id, session_config.schedule_id.clone(), &usage, true).await?;

                                    // Record compaction in the CompactionManager for statistics
                                    {
                                        let mut manager = self.compaction_manager.lock().await;
                                        let original_count = conversation.messages().len();
                                        let compacted_count = compacted_conversation.messages().len();
                                        let est_tokens_per_msg = 100; // rough estimate
                                        manager.record_compaction(
                                            original_count * est_tokens_per_msg,
                                            compacted_count * est_tokens_per_msg,
                                            crate::compaction::CompactionTrigger::Auto,
                                        );
                                    }

                                    conversation = compacted_conversation;
                                    did_recovery_compact_this_iteration = true;
                                    yield AgentEvent::HistoryReplaced(conversation.clone());
                                    break;
                                }
                                Err(e) => {
                                    crate::posthog::emit_error("compaction_failed", &e.to_string());
                                    error!("Compaction failed: {}", e);
                                    break;
                                }
                            }
                        }
                        Err(ref provider_err) => {
                            crate::posthog::emit_error(provider_err.telemetry_type(), &provider_err.to_string());
                            error!("Error: {}", provider_err);
                            yield AgentEvent::Message(
                                Message::assistant().with_text(
                                    format!("Ran into this error: {provider_err}.\n\nPlease retry if you think this is a transient or recoverable error.")
                                )
                            );
                            break;
                        }
                    }
                }
                if tools_updated {
                    (tools, toolshim_tools, system_prompt) =
                        self.prepare_tools_and_prompt(&session_config.id, &session.working_dir).await?;
                }
                let mut exit_chat = false;
                if no_tools_called {
                    if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                        if final_output_tool.final_output.is_none() {
                            warn!("Final output tool has not been called yet. Continuing agent loop.");
                            let message = Message::user().with_text(FINAL_OUTPUT_CONTINUATION_MESSAGE);
                            messages_to_add.push(message.clone());
                            yield AgentEvent::Message(message);
                        } else {
                            let message = Message::assistant().with_text(final_output_tool.final_output.clone().unwrap());
                            messages_to_add.push(message.clone());
                            yield AgentEvent::Message(message);
                            exit_chat = true;
                        }
                    } else if did_recovery_compact_this_iteration {
                        // Avoid setting exit_chat; continue from last user message in the conversation
                    } else {
                        match self.handle_retry_logic(&mut conversation, &session_config, &initial_messages).await {
                            Ok(should_retry) => {
                                if should_retry {
                                    info!("Retry logic triggered, restarting agent loop");
                                } else {
                                    exit_chat = true;
                                }
                            }
                            Err(e) => {
                                error!("Retry logic failed: {}", e);
                                yield AgentEvent::Message(
                                    Message::assistant().with_text(
                                        format!("Retry logic encountered an error: {}", e)
                                    )
                                );
                                exit_chat = true;
                            }
                        }
                    }
                }

                if let Ok(Some((summary_msg, tool_id))) = tool_pair_summarization_task.await {
                    let mut updated_messages = conversation.messages().clone();

                    let matching: Vec<&mut Message> = updated_messages
                        .iter_mut()
                        .filter(|msg| {
                            msg.id.is_some() && msg.content.iter().any(|c| match c {
                                MessageContent::ToolRequest(req) => req.id == tool_id,
                                MessageContent::ToolResponse(resp) => resp.id == tool_id,
                                _ => false,
                            })
                        })
                        .collect();

                    if matching.len() == 2 {
                        for msg in matching {
                            let id = msg.id.as_ref().unwrap();
                            msg.metadata = msg.metadata.with_agent_invisible();
                            SessionManager::update_message_metadata(&session_config.id, id, |metadata| {
                                metadata.with_agent_invisible()
                            }).await?;
                        }
                        conversation = Conversation::new_unvalidated(updated_messages);
                        messages_to_add.push(summary_msg);
                    } else {
                        warn!("Expected a tool request/reply pair, but found {} matching messages",
                            matching.len());
                    }
                }

                // === OUTPUT GUARDRAILS: Scan assistant responses for secrets/PII leakage ===
                {
                    let guardrails = self.guardrails_engine.lock().await;
                    for msg in &messages_to_add {
                        if msg.role == rmcp::model::Role::Assistant {
                            let output_text: String = msg.content.iter()
                                .filter_map(|c| match c {
                                    MessageContent::Text(t) => Some(t.text.as_str()),
                                    _ => None,
                                })
                                .collect::<Vec<_>>()
                                .join(" ");
                            if !output_text.is_empty() {
                                let detection_ctx = DetectionContext::default();
                                match guardrails.scan(&output_text, &detection_ctx).await {
                                    Ok(result) if !result.passed => {
                                        info!(
                                            "Output guardrails flagged response (severity: {:?}): {}",
                                            result.max_severity,
                                            result.blocked_reason.as_deref().unwrap_or("Unknown")
                                        );
                                    }
                                    Err(e) => {
                                        warn!("Output guardrails scan error (non-blocking): {}", e);
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }

                for msg in &messages_to_add {
                    session_manager.add_message(&session_config.id, msg).await?;
                }
                conversation.extend(messages_to_add);
                if exit_chat {
                    // === CRITIC: Auto-invoke self-critique on task completion ===
                    {
                        let critic = self.critic_manager.lock().await;
                        let critique_ctx = CritiqueContext::new("Session completion auto-review");
                        match critic.critique(&critique_ctx).await {
                            Ok(result) => {
                                info!(
                                    "Auto-critique on exit: passed={}, issues={}, blocking={}",
                                    result.passed, result.total_issues, result.blocking_issues
                                );
                                *self.last_critique.lock().await = Some(result);
                            }
                            Err(e) => {
                                warn!("Auto-critique failed (non-blocking): {}", e);
                            }
                        }
                    }

                    // === MEMORY STORE: Save session summary + extract facts + persist to disk ===
                    #[cfg(feature = "memory")]
                    {
                        // Step 1: Store session summary as episodic memory
                        {
                            let memory_mgr = self.memory_manager.lock().await;
                            if memory_mgr.config().enabled {
                                let msg_count = conversation.messages().len();
                                let summary = format!(
                                    "Session {} completed with {} messages in working directory {:?}",
                                    session_config.id, msg_count, working_dir
                                );
                                let entry = crate::memory::MemoryEntry::new(
                                    crate::memory::MemoryType::Episodic,
                                    summary,
                                ).with_metadata(
                                    crate::memory::MemoryMetadata::with_source(crate::memory::MemorySource::System)
                                        .session(session_config.id.clone())
                                );
                                if let Err(e) = memory_mgr.store(entry).await {
                                    warn!("Failed to store session memory (non-blocking): {}", e);
                                }
                            }
                        } // Drop lock before calling helper methods

                        // Step 2: Extract key facts from conversation into semantic memory
                        self.memory_extract_and_store_facts(
                            &session_config.id,
                            conversation.messages(),
                        ).await;

                        // Step 3: Persist all memories to disk for cross-session recall
                        {
                            let memory_mgr = self.memory_manager.lock().await;
                            if memory_mgr.config().enabled {
                                if let Err(e) = memory_mgr.save_to_disk().await {
                                    warn!("Failed to persist memories to disk (non-blocking): {}", e);
                                }
                            }
                        }
                    }

                    break;
                }

                tokio::task::yield_now().await;
            }
        }))
    }

    pub async fn extend_system_prompt(&self, instruction: String) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.add_system_prompt_extra(instruction);
    }

    pub async fn update_provider(
        &self,
        provider: Arc<dyn Provider>,
        session_id: &str,
    ) -> Result<()> {
        let provider_name = provider.get_name().to_string();
        let model_config = provider.get_model_config();

        let mut current_provider = self.provider.lock().await;
        *current_provider = Some(provider);

        self.config
            .session_manager
            .clone()
            .update(session_id)
            .provider_name(&provider_name)
            .model_config(model_config)
            .apply()
            .await
            .context("Failed to persist provider config to session")
    }

    /// Restore the provider from session data or fall back to global config
    /// This is used when resuming a session to restore the provider state
    pub async fn restore_provider_from_session(&self, session: &Session) -> Result<()> {
        let config = Config::global();

        let provider_name = session
            .provider_name
            .clone()
            .or_else(|| config.get_goose_provider().ok())
            .ok_or_else(|| anyhow!("Could not configure agent: missing provider"))?;

        let model_config = match session.model_config.clone() {
            Some(saved_config) => saved_config,
            None => {
                let model_name = config
                    .get_goose_model()
                    .map_err(|_| anyhow!("Could not configure agent: missing model"))?;
                crate::model::ModelConfig::new(&model_name)
                    .map_err(|e| anyhow!("Could not configure agent: invalid model {}", e))?
            }
        };

        let provider = crate::providers::create(&provider_name, model_config)
            .await
            .map_err(|e| anyhow!("Could not create provider: {}", e))?;

        self.update_provider(provider, &session.id).await
    }

    /// Override the system prompt with a custom template
    pub async fn override_system_prompt(&self, template: String) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.set_system_prompt_override(template);
    }

    pub async fn list_extension_prompts(&self, session_id: &str) -> HashMap<String, Vec<Prompt>> {
        self.extension_manager
            .list_prompts(session_id, CancellationToken::default())
            .await
            .expect("Failed to list prompts")
    }

    pub async fn get_prompt(
        &self,
        session_id: &str,
        name: &str,
        arguments: Value,
    ) -> Result<GetPromptResult> {
        // First find which extension has this prompt
        let prompts = self
            .extension_manager
            .list_prompts(session_id, CancellationToken::default())
            .await
            .map_err(|e| anyhow!("Failed to list prompts: {}", e))?;

        if let Some(extension) = prompts
            .iter()
            .find(|(_, prompt_list)| prompt_list.iter().any(|p| p.name == name))
            .map(|(extension, _)| extension)
        {
            return self
                .extension_manager
                .get_prompt(
                    session_id,
                    extension,
                    name,
                    arguments,
                    CancellationToken::default(),
                )
                .await
                .map_err(|e| anyhow!("Failed to get prompt: {}", e));
        }

        Err(anyhow!("Prompt '{}' not found", name))
    }

    pub async fn get_plan_prompt(&self, session_id: &str) -> Result<String> {
        let tools = self
            .extension_manager
            .get_prefixed_tools(session_id, None)
            .await?;
        let tools_info = tools
            .into_iter()
            .map(|tool| {
                ToolInfo::new(
                    &tool.name,
                    tool.description
                        .as_ref()
                        .map(|d| d.as_ref())
                        .unwrap_or_default(),
                    get_parameter_names(&tool),
                    None,
                )
            })
            .collect();

        let plan_prompt = self.extension_manager.get_planning_prompt(tools_info).await;

        Ok(plan_prompt)
    }

    pub async fn handle_tool_result(&self, id: String, result: ToolResult<CallToolResult>) {
        if let Err(e) = self.tool_result_tx.send((id, result)).await {
            error!("Failed to send tool result: {}", e);
        }
    }

    pub async fn create_recipe(
        &self,
        session_id: &str,
        mut messages: Conversation,
    ) -> Result<Recipe> {
        tracing::info!("Starting recipe creation with {} messages", messages.len());

        let extensions_info = self.extension_manager.get_extensions_info().await;
        tracing::debug!("Retrieved {} extensions info", extensions_info.len());
        let (extension_count, tool_count) = self
            .extension_manager
            .get_extension_and_tool_counts(session_id)
            .await;

        // Get model name from provider
        let provider = self.provider().await.map_err(|e| {
            tracing::error!("Failed to get provider for recipe creation: {}", e);
            e
        })?;
        let model_config = provider.get_model_config();
        let model_name = &model_config.model_name;
        tracing::debug!("Using model: {}", model_name);

        let prompt_manager = self.prompt_manager.lock().await;
        let system_prompt = prompt_manager
            .builder()
            .with_extensions(extensions_info.into_iter())
            .with_frontend_instructions(self.frontend_instructions.lock().await.clone())
            .with_extension_and_tool_counts(extension_count, tool_count)
            .build();

        let recipe_prompt = prompt_manager.get_recipe_prompt().await;
        let tools = self
            .extension_manager
            .get_prefixed_tools(session_id, None)
            .await
            .map_err(|e| {
                tracing::error!("Failed to get tools for recipe creation: {}", e);
                e
            })?;

        messages.push(Message::user().with_text(recipe_prompt));

        let (messages, issues) = fix_conversation(messages);
        if !issues.is_empty() {
            issues
                .iter()
                .for_each(|issue| tracing::warn!(recipe.conversation.issue = issue));
        }

        tracing::debug!(
            "Added recipe prompt to messages, total messages: {}",
            messages.len()
        );

        tracing::info!("Calling provider to generate recipe content");
        let (result, _usage) = self
            .provider
            .lock()
            .await
            .as_ref()
            .ok_or_else(|| {
                let error = anyhow!("Provider not available during recipe creation");
                tracing::error!("{}", error);
                error
            })?
            .complete(session_id, &system_prompt, messages.messages(), &tools)
            .await
            .map_err(|e| {
                tracing::error!("Provider completion failed during recipe creation: {}", e);
                e
            })?;

        let content = result.as_concat_text();
        tracing::debug!(
            "Provider returned content with {} characters",
            content.len()
        );

        // the response may be contained in ```json ```, strip that before parsing json
        let re = Regex::new(r"(?s)```[^\n]*\n(.*?)\n```").unwrap();
        let clean_content = re
            .captures(&content)
            .and_then(|caps| caps.get(1).map(|m| m.as_str()))
            .unwrap_or(&content)
            .trim()
            .to_string();

        let (instructions, activities) =
            if let Ok(json_content) = serde_json::from_str::<Value>(&clean_content) {
                let instructions = json_content
                    .get("instructions")
                    .ok_or_else(|| anyhow!("Missing 'instructions' in json response"))?
                    .as_str()
                    .ok_or_else(|| anyhow!("instructions' is not a string"))?
                    .to_string();

                let activities = json_content
                    .get("activities")
                    .ok_or_else(|| anyhow!("Missing 'activities' in json response"))?
                    .as_array()
                    .ok_or_else(|| anyhow!("'activities' is not an array'"))?
                    .iter()
                    .map(|act| {
                        act.as_str()
                            .map(|s| s.to_string())
                            .ok_or(anyhow!("'activities' array element is not a string"))
                    })
                    .collect::<Result<_, _>>()?;

                (instructions, activities)
            } else {
                tracing::warn!("Failed to parse JSON, falling back to string parsing");
                // If we can't get valid JSON, try string parsing
                // Use split_once to get the content after "Instructions:".
                let after_instructions = content
                    .split_once("instructions:")
                    .map(|(_, rest)| rest)
                    .unwrap_or(&content);

                // Split once more to separate instructions from activities.
                let (instructions_part, activities_text) = after_instructions
                    .split_once("activities:")
                    .unwrap_or((after_instructions, ""));

                let instructions = instructions_part
                    .trim_end_matches(|c: char| c.is_whitespace() || c == '#')
                    .trim()
                    .to_string();
                let activities_text = activities_text.trim();

                // Regex to remove bullet markers or numbers with an optional dot.
                let bullet_re = Regex::new(r"^[•\-*\d]+\.?\s*").expect("Invalid regex");

                // Process each line in the activities section.
                let activities: Vec<String> = activities_text
                    .lines()
                    .map(|line| bullet_re.replace(line, "").to_string())
                    .map(|s| s.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect();

                (instructions, activities)
            };

        let extension_configs = get_enabled_extensions();

        let author = Author {
            contact: std::env::var("USER")
                .or_else(|_| std::env::var("USERNAME"))
                .ok(),
            metadata: None,
        };

        // Ideally we'd get the name of the provider we are using from the provider itself,
        // but it doesn't know and the plumbing looks complicated.
        let config = Config::global();
        let provider_name: String = config
            .get_goose_provider()
            .expect("No provider configured. Run 'goose configure' first");

        let settings = Settings {
            goose_provider: Some(provider_name.clone()),
            goose_model: Some(model_name.clone()),
            temperature: Some(model_config.temperature.unwrap_or(0.0)),
            max_turns: None,
        };

        tracing::debug!(
            "Building recipe with {} activities and {} extensions",
            activities.len(),
            extension_configs.len()
        );

        let (title, description) =
            if let Ok(json_content) = serde_json::from_str::<Value>(&clean_content) {
                let title = json_content
                    .get("title")
                    .and_then(|t| t.as_str())
                    .unwrap_or("Custom recipe from chat")
                    .to_string();

                let description = json_content
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("a custom recipe instance from this chat session")
                    .to_string();

                (title, description)
            } else {
                (
                    "Custom recipe from chat".to_string(),
                    "a custom recipe instance from this chat session".to_string(),
                )
            };

        let recipe = Recipe::builder()
            .title(title)
            .description(description)
            .instructions(instructions)
            .activities(activities)
            .extensions(extension_configs)
            .settings(settings)
            .author(author)
            .build()
            .map_err(|e| {
                tracing::error!("Failed to build recipe: {}", e);
                anyhow!("Recipe build failed: {}", e)
            })?;

        tracing::info!("Recipe creation completed successfully");
        Ok(recipe)
    }

    // === Memory helper methods ===

    /// Store a user message as working memory for the current session.
    /// This allows the memory system to learn from each turn of conversation.
    #[cfg(feature = "memory")]
    async fn memory_store_user_input(&self, session_id: &str, user_text: &str) {
        if user_text.is_empty() {
            return;
        }
        // Truncate very long inputs to avoid bloating working memory
        let content = if user_text.len() > 500 {
            let truncated: String = user_text.chars().take(500).collect();
            format!("[User] {}...", truncated)
        } else {
            format!("[User] {}", user_text)
        };
        let entry = crate::memory::MemoryEntry::new(
            crate::memory::MemoryType::Working,
            content,
        )
        .with_importance(0.6)
        .with_metadata(
            crate::memory::MemoryMetadata::with_source(crate::memory::MemorySource::UserInput)
                .session(session_id.to_string()),
        );
        let memory_mgr = self.memory_manager.lock().await;
        if memory_mgr.config().enabled {
            if let Err(e) = memory_mgr.store(entry).await {
                warn!("Failed to store user input to working memory (non-blocking): {}", e);
            } else {
                debug!("Stored user input in working memory for session {}", session_id);
            }
        }
        // Dual-write to Mem0 graph memory (if available)
        drop(memory_mgr); // Release lock before async Mem0 call
        if let Some(ref mem0) = *self.mem0_client.lock().await {
            if mem0.is_available() {
                let _ = mem0.add_memory(user_text, session_id).await;
            }
        }
    }

    /// Store an assistant response as working memory for the current session.
    /// Captures the agent's outputs so they can be recalled in future turns.
    #[cfg(feature = "memory")]
    async fn memory_store_assistant_response(&self, session_id: &str, assistant_text: &str) {
        if assistant_text.is_empty() {
            return;
        }
        // Truncate very long responses to avoid bloating working memory
        let content = if assistant_text.len() > 500 {
            let truncated: String = assistant_text.chars().take(500).collect();
            format!("[Assistant] {}...", truncated)
        } else {
            format!("[Assistant] {}", assistant_text)
        };
        let entry = crate::memory::MemoryEntry::new(
            crate::memory::MemoryType::Working,
            content,
        )
        .with_importance(0.5)
        .with_metadata(
            crate::memory::MemoryMetadata::with_source(crate::memory::MemorySource::AgentResponse)
                .session(session_id.to_string()),
        );
        let memory_mgr = self.memory_manager.lock().await;
        if memory_mgr.config().enabled {
            if let Err(e) = memory_mgr.store(entry).await {
                warn!("Failed to store assistant response to working memory (non-blocking): {}", e);
            } else {
                debug!("Stored assistant response in working memory for session {}", session_id);
            }
        }
    }

    /// Extract key facts from a conversation and store them as semantic memories.
    /// Uses keyword heuristics to identify user preferences, decisions, and important facts.
    #[cfg(feature = "memory")]
    async fn memory_extract_and_store_facts(&self, session_id: &str, messages: &[Message]) {
        let memory_mgr = self.memory_manager.lock().await;
        if !memory_mgr.config().enabled {
            return;
        }

        let mut stored_count = 0usize;
        // Patterns that indicate a fact worth remembering
        let fact_indicators: &[&str] = &[
            "prefer", "always", "never", "important", "remember",
            "my name", "i use", "i like", "i want", "i need",
            "project", "working on", "decided", "convention",
            "password", "secret",  // will be detected but NOT stored (privacy)
        ];
        let privacy_terms: &[&str] = &["password", "secret", "token", "key", "credential"];

        for msg in messages {
            if msg.role != rmcp::model::Role::User {
                continue;
            }
            let text: String = msg.content.iter()
                .filter_map(|c| match c {
                    MessageContent::Text(t) => Some(t.text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ");

            let text_lower = text.to_lowercase();

            // Skip if it contains privacy-sensitive terms
            if privacy_terms.iter().any(|term| text_lower.contains(term)) {
                continue;
            }

            // Check if the message contains any fact indicators
            let has_fact = fact_indicators.iter().any(|indicator| text_lower.contains(indicator));
            if !has_fact {
                continue;
            }

            // Truncate for storage
            let fact_content = if text.len() > 300 {
                let truncated: String = text.chars().take(300).collect();
                format!("{}...", truncated)
            } else {
                text
            };

            let entry = crate::memory::MemoryEntry::new(
                crate::memory::MemoryType::Semantic,
                fact_content,
            )
            .with_importance(0.7)
            .with_metadata(
                crate::memory::MemoryMetadata::with_source(crate::memory::MemorySource::Inference)
                    .session(session_id.to_string())
                    .tag("auto_extracted")
                    .tag("user_fact"),
            );

            if let Err(e) = memory_mgr.store(entry).await {
                warn!("Failed to store extracted fact to semantic memory (non-blocking): {}", e);
            } else {
                stored_count += 1;
            }
        }

        if stored_count > 0 {
            info!("Extracted and stored {} facts as semantic memories for session {}", stored_count, session_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recipe::Response;

    #[tokio::test]
    async fn test_add_final_output_tool() -> Result<()> {
        let agent = Agent::new();

        let response = Response {
            json_schema: Some(serde_json::json!({
                "type": "object",
                "properties": {
                    "result": {"type": "string"}
                }
            })),
        };

        agent.add_final_output_tool(response).await;

        let tools = agent.list_tools("test-session-id", None).await;
        let final_output_tool = tools
            .iter()
            .find(|tool| tool.name == FINAL_OUTPUT_TOOL_NAME);

        assert!(
            final_output_tool.is_some(),
            "Final output tool should be present after adding"
        );

        let prompt_manager = agent.prompt_manager.lock().await;
        let system_prompt = prompt_manager.builder().build();

        let final_output_tool_ref = agent.final_output_tool.lock().await;
        let final_output_tool_system_prompt =
            final_output_tool_ref.as_ref().unwrap().system_prompt();
        assert!(system_prompt.contains(&final_output_tool_system_prompt));
        Ok(())
    }

    #[tokio::test]
    async fn test_tool_inspection_manager_has_all_inspectors() -> Result<()> {
        let agent = Agent::new();

        // Verify that the tool inspection manager has all expected inspectors
        let inspector_names = agent.tool_inspection_manager.inspector_names();

        assert!(
            inspector_names.contains(&"repetition"),
            "Tool inspection manager should contain repetition inspector"
        );
        assert!(
            inspector_names.contains(&"permission"),
            "Tool inspection manager should contain permission inspector"
        );
        assert!(
            inspector_names.contains(&"security"),
            "Tool inspection manager should contain security inspector"
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_init_compaction_manager() -> Result<()> {
        let agent = Agent::new();

        // Should always succeed (already initialized in constructor)
        let result = agent.init_compaction_manager().await;
        assert!(result.is_ok());

        // Should be idempotent
        let result2 = agent.init_compaction_manager().await;
        assert!(result2.is_ok());

        Ok(())
    }

    #[tokio::test]
    async fn test_compaction_stats_initial() -> Result<()> {
        let agent = Agent::new();

        let stats = agent.compaction_stats().await;
        assert_eq!(stats.total_compactions, 0);
        assert_eq!(stats.total_tokens_saved, 0);
        assert_eq!(stats.average_reduction_percent, 0.0);

        Ok(())
    }

    #[tokio::test]
    async fn test_compaction_should_compact() -> Result<()> {
        let agent = Agent::new();

        let manager = agent.compaction_manager.lock().await;

        // Below threshold (85%)
        assert!(!manager.should_compact(8000, 10000));

        // At threshold
        assert!(!manager.should_compact(8499, 10000));

        // Above threshold
        assert!(manager.should_compact(8500, 10000));
        assert!(manager.should_compact(9000, 10000));

        Ok(())
    }

    #[tokio::test]
    async fn test_compaction_record() -> Result<()> {
        let agent = Agent::new();

        {
            let mut manager = agent.compaction_manager.lock().await;
            manager.record_compaction(
                10000,
                5000,
                crate::compaction::CompactionTrigger::Command,
            );
        }

        let stats = agent.compaction_stats().await;
        assert_eq!(stats.total_compactions, 1);
        assert_eq!(stats.total_tokens_saved, 5000);
        assert_eq!(stats.average_reduction_percent, 50.0);

        Ok(())
    }

    #[tokio::test]
    async fn test_compaction_multiple_records() -> Result<()> {
        let agent = Agent::new();

        {
            let mut manager = agent.compaction_manager.lock().await;
            // First compaction: 10000 -> 5000 (50% reduction)
            manager.record_compaction(
                10000,
                5000,
                crate::compaction::CompactionTrigger::Auto,
            );
            // Second compaction: 8000 -> 2000 (75% reduction)
            manager.record_compaction(
                8000,
                2000,
                crate::compaction::CompactionTrigger::Auto,
            );
        }

        let stats = agent.compaction_stats().await;
        assert_eq!(stats.total_compactions, 2);
        assert_eq!(stats.total_tokens_saved, 11000); // 5000 + 6000
        assert_eq!(stats.average_reduction_percent, 62.5); // (50 + 75) / 2

        Ok(())
    }

    // === Learning Engine Retrieval Integration Tests ===

    #[tokio::test]
    async fn test_retrieve_skills_for_task_empty_when_uninitialized() {
        let agent = Agent::new();
        // SkillLibrary not initialized — should return empty, not error
        let skills = agent.retrieve_skills_for_task("fix authentication bug").await;
        assert!(skills.is_empty());
    }

    #[tokio::test]
    async fn test_retrieve_relevant_insights_empty_when_uninitialized() {
        let agent = Agent::new();
        // ExperienceStore not initialized — should return empty, not error
        let insights = agent.retrieve_relevant_insights(5).await;
        assert!(insights.is_empty());
    }

    #[tokio::test]
    async fn test_retrieve_relevant_insights_with_store() {
        let agent = Agent::new();

        // Manually initialize experience store with in-memory SQLite
        {
            let store = crate::agents::experience_store::ExperienceStore::in_memory().await.unwrap();

            // Add enough experiences to generate insights
            use crate::agents::core::CoreType;
            use crate::agents::experience_store::Experience;

            // Structured excels at code-test-fix
            for _ in 0..5 {
                let exp = Experience::new("fix tests", CoreType::Structured, true, 5, 0.02, 1000)
                    .with_category("code-test-fix");
                store.store(&exp).await.unwrap();
            }

            // Freeform struggles at code-test-fix
            for i in 0..5 {
                let exp = Experience::new("fix tests", CoreType::Freeform, i < 1, 12, 0.05, 3000)
                    .with_category("code-test-fix");
                store.store(&exp).await.unwrap();
            }

            let mut guard = agent.experience_store.lock().await;
            *guard = Some(Arc::new(store));
        }

        let insights = agent.retrieve_relevant_insights(10).await;
        // Should have at least core-selection and failure-pattern insights
        assert!(!insights.is_empty(), "Should extract insights from accumulated experiences");

        // All returned insights should meet the confidence threshold
        for insight in &insights {
            assert!(insight.confidence >= 0.4, "Insight confidence should be >= 0.4, got {}", insight.confidence);
        }
    }

    #[tokio::test]
    async fn test_retrieve_relevant_insights_respects_max_limit() {
        let agent = Agent::new();

        {
            let store = crate::agents::experience_store::ExperienceStore::in_memory().await.unwrap();
            use crate::agents::core::CoreType;
            use crate::agents::experience_store::Experience;

            // Generate many experiences to produce multiple insights
            for _ in 0..10 {
                let exp = Experience::new("fix", CoreType::Structured, true, 5, 0.02, 1000)
                    .with_category("code-test-fix")
                    .with_insights(vec!["Always run tests first".into()]);
                store.store(&exp).await.unwrap();
            }
            for i in 0..10 {
                let exp = Experience::new("fix", CoreType::Freeform, i < 2, 12, 0.05, 3000)
                    .with_category("code-test-fix");
                store.store(&exp).await.unwrap();
            }
            for _ in 0..5 {
                let exp = Experience::new("deploy", CoreType::Orchestrator, true, 8, 0.10, 3000)
                    .with_category("general");
                store.store(&exp).await.unwrap();
            }

            let mut guard = agent.experience_store.lock().await;
            *guard = Some(Arc::new(store));
        }

        // Request max 2
        let insights = agent.retrieve_relevant_insights(2).await;
        assert!(insights.len() <= 2, "Should respect max limit of 2, got {}", insights.len());

        // Request max 1
        let insights_one = agent.retrieve_relevant_insights(1).await;
        assert!(insights_one.len() <= 1, "Should respect max limit of 1, got {}", insights_one.len());
    }

    #[tokio::test]
    async fn test_retrieve_relevant_insights_sorted_by_confidence() {
        let agent = Agent::new();

        {
            let store = crate::agents::experience_store::ExperienceStore::in_memory().await.unwrap();
            use crate::agents::core::CoreType;
            use crate::agents::experience_store::Experience;

            // Lots of data to produce high-confidence insights
            for _ in 0..20 {
                let exp = Experience::new("fix", CoreType::Structured, true, 5, 0.02, 1000)
                    .with_category("code-test-fix");
                store.store(&exp).await.unwrap();
            }
            for _ in 0..20 {
                let exp = Experience::new("fix", CoreType::Freeform, false, 12, 0.05, 3000)
                    .with_category("code-test-fix");
                store.store(&exp).await.unwrap();
            }

            let mut guard = agent.experience_store.lock().await;
            *guard = Some(Arc::new(store));
        }

        let insights = agent.retrieve_relevant_insights(10).await;
        // Verify descending confidence order
        for window in insights.windows(2) {
            assert!(
                window[0].confidence >= window[1].confidence,
                "Insights should be sorted by confidence descending: {} >= {}",
                window[0].confidence, window[1].confidence,
            );
        }
    }

    #[tokio::test]
    async fn test_retrieve_skills_for_task_with_library() {
        let agent = Agent::new();

        {
            let lib = crate::agents::skill_library::SkillLibrary::in_memory().await.unwrap();
            use crate::agents::core::CoreType;
            use crate::agents::skill_library::Skill;

            let mut skill = Skill::new("auth-fix", "Fix authentication issues", CoreType::Structured)
                .with_patterns(vec!["authentication".into(), "login".into(), "auth".into()])
                .with_steps(vec!["Check JWT tokens".into(), "Validate session".into()]);
            skill.verified = true;
            skill.use_count = 5;
            skill.attempt_count = 6;
            skill.success_rate = 5.0 / 6.0;

            lib.store(&skill).await.unwrap();

            let mut guard = agent.skill_library.lock().await;
            *guard = Some(Arc::new(lib));
        }

        let skills = agent.retrieve_skills_for_task("fix the authentication error in login").await;
        assert!(!skills.is_empty(), "Should find matching skills for auth task");
        assert_eq!(skills[0].name, "auth-fix");
    }

    #[tokio::test]
    async fn test_retrieve_skills_for_task_no_match() {
        let agent = Agent::new();

        {
            let lib = crate::agents::skill_library::SkillLibrary::in_memory().await.unwrap();
            use crate::agents::core::CoreType;
            use crate::agents::skill_library::Skill;

            let mut skill = Skill::new("auth-fix", "Fix authentication issues", CoreType::Structured)
                .with_patterns(vec!["authentication".into()]);
            skill.verified = true;
            skill.use_count = 3;
            skill.attempt_count = 4;
            skill.success_rate = 0.75;

            lib.store(&skill).await.unwrap();

            let mut guard = agent.skill_library.lock().await;
            *guard = Some(Arc::new(lib));
        }

        // Query for something unrelated
        let skills = agent.retrieve_skills_for_task("deploy to kubernetes").await;
        assert!(skills.is_empty(), "Should not find auth skills for deployment task");
    }

    #[tokio::test]
    async fn test_insight_as_prompt_context_format() {
        use crate::agents::insight_extractor::{Insight, InsightCategory};

        let insight = Insight {
            id: "test-1".into(),
            text: "Use structured for CTF tasks".into(),
            category: InsightCategory::CoreSelection,
            confidence: 0.9,
            evidence_count: 15,
            applies_to: vec!["code-test-fix".into()],
            related_core: Some(crate::agents::core::CoreType::Structured),
        };

        let ctx = insight.as_prompt_context();
        assert!(ctx.contains("core-selection"), "Should contain category");
        assert!(ctx.contains("Use structured for CTF tasks"), "Should contain insight text");
        assert!(ctx.contains("high confidence"), "0.9 should map to high confidence");
        assert!(ctx.contains("15 evidence runs"), "Should contain evidence count");
    }

    #[tokio::test]
    async fn test_insight_prompt_context_low_confidence() {
        use crate::agents::insight_extractor::{Insight, InsightCategory};

        let insight = Insight {
            id: "test-2".into(),
            text: "Maybe try freeform".into(),
            category: InsightCategory::BestPractice,
            confidence: 0.3,
            evidence_count: 2,
            applies_to: vec![],
            related_core: None,
        };

        let ctx = insight.as_prompt_context();
        assert!(ctx.contains("low confidence"), "0.3 should map to low confidence");
    }

    #[tokio::test]
    async fn test_insight_prompt_context_moderate_confidence() {
        use crate::agents::insight_extractor::{Insight, InsightCategory};

        let insight = Insight {
            id: "test-3".into(),
            text: "Orchestrator works for multi-file".into(),
            category: InsightCategory::Optimization,
            confidence: 0.5,
            evidence_count: 8,
            applies_to: vec![],
            related_core: None,
        };

        let ctx = insight.as_prompt_context();
        assert!(ctx.contains("moderate confidence"), "0.5 should map to moderate confidence");
    }

    #[tokio::test]
    async fn test_learning_stores_init_and_retrieval_roundtrip() {
        let agent = Agent::new();

        // Before init: both return empty
        assert!(agent.retrieve_skills_for_task("anything").await.is_empty());
        assert!(agent.retrieve_relevant_insights(5).await.is_empty());

        // Init stores (uses temp directory)
        let result = agent.init_learning_stores().await;
        assert!(result.is_ok(), "init_learning_stores should succeed");

        // After init: stores exist but are empty
        assert!(agent.experience_store().await.is_some());
        assert!(agent.skill_library().await.is_some());

        // Retrieval still returns empty (no data yet), but doesn't error
        assert!(agent.retrieve_skills_for_task("test").await.is_empty());
        assert!(agent.retrieve_relevant_insights(5).await.is_empty());
    }
}
