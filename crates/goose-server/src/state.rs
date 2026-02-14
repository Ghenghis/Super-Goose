use axum::http::StatusCode;
use goose::builtin_extension::register_builtin_extensions;
use goose::execution::manager::AgentManager;
use goose::scheduler_trait::SchedulerTrait;
use goose::session::SessionManager;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio::task::JoinHandle;

use crate::routes::gpu_jobs::GpuJob;
use crate::tunnel::TunnelManager;
use goose::agents::ExtensionLoadResult;

/// Tracks the progress of an OTA build in real-time.
/// Shared between the background build task and the polling endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtaBuildProgress {
    /// Unique cycle identifier
    pub cycle_id: String,
    /// Current phase: "building" | "testing" | "swapping" | "deploying" | "completed" | "failed"
    pub phase: String,
    /// ISO timestamp when the build started
    pub started_at: String,
    /// Elapsed seconds since build started
    pub elapsed_secs: f64,
    /// Human-readable status message
    pub message: String,
    /// Whether the build cycle has finished (success or failure)
    pub completed: bool,
    /// Whether the build succeeded (None = still running)
    pub success: Option<bool>,
    /// Whether a restart is required to apply the update
    pub restart_required: bool,
}

type ExtensionLoadingTasks =
    Arc<Mutex<HashMap<String, Arc<Mutex<Option<JoinHandle<Vec<ExtensionLoadResult>>>>>>>>;

#[derive(Clone)]
pub struct AppState {
    pub(crate) agent_manager: Arc<AgentManager>,
    pub recipe_file_hash_map: Arc<Mutex<HashMap<String, PathBuf>>>,
    /// Tracks sessions that have already emitted recipe telemetry to prevent double counting.
    recipe_session_tracker: Arc<Mutex<HashSet<String>>>,
    pub tunnel_manager: Arc<TunnelManager>,
    pub extension_loading_tasks: ExtensionLoadingTasks,
    /// Shared OTA build progress — written by background build task, read by polling endpoint.
    pub ota_build_progress: Arc<RwLock<Option<OtaBuildProgress>>>,
    /// Broadcast channel for AG-UI events. Producers (agent execution, POST endpoints) send
    /// serialized JSON event strings; the SSE handler subscribes to receive and forward them.
    /// Uses `String` to avoid complex `Send`/`Sync` type constraints on the broadcast channel.
    pub event_bus: broadcast::Sender<String>,
    /// In-memory store for GPU jobs (keyed by job id).
    pub gpu_jobs: Arc<RwLock<HashMap<String, GpuJob>>>,
    /// Broadcast channel for settings change events. POST/DELETE handlers publish
    /// serialized SSE frames; the `/api/settings/stream` SSE handler subscribes
    /// to forward them to connected clients in real time.
    pub settings_event_bus: broadcast::Sender<String>,
}

impl AppState {
    pub async fn new() -> anyhow::Result<Arc<AppState>> {
        register_builtin_extensions(goose_mcp::BUILTIN_EXTENSIONS.clone());

        let agent_manager = AgentManager::instance().await?;
        let tunnel_manager = Arc::new(TunnelManager::new());
        // 4096-slot broadcast channel — lagging subscribers will get a RecvError::Lagged.
        // Sized generously to absorb burst tool-call traffic without dropping events.
        let (event_bus, _) = broadcast::channel::<String>(4096);
        // Smaller capacity for settings — updates are infrequent compared to agent events.
        let (settings_event_bus, _) = broadcast::channel::<String>(256);

        Ok(Arc::new(Self {
            agent_manager,
            recipe_file_hash_map: Arc::new(Mutex::new(HashMap::new())),
            recipe_session_tracker: Arc::new(Mutex::new(HashSet::new())),
            tunnel_manager,
            extension_loading_tasks: Arc::new(Mutex::new(HashMap::new())),
            ota_build_progress: Arc::new(RwLock::new(None)),
            event_bus,
            gpu_jobs: Arc::new(RwLock::new(HashMap::new())),
            settings_event_bus,
        }))
    }

    pub async fn set_extension_loading_task(
        &self,
        session_id: String,
        task: JoinHandle<Vec<ExtensionLoadResult>>,
    ) {
        let mut tasks = self.extension_loading_tasks.lock().await;
        tasks.insert(session_id, Arc::new(Mutex::new(Some(task))));
    }

    pub async fn take_extension_loading_task(
        &self,
        session_id: &str,
    ) -> Option<Vec<ExtensionLoadResult>> {
        let task_holder = {
            let tasks = self.extension_loading_tasks.lock().await;
            tasks.get(session_id).cloned()
        };

        if let Some(holder) = task_holder {
            let task = holder.lock().await.take();
            if let Some(handle) = task {
                match handle.await {
                    Ok(results) => return Some(results),
                    Err(e) => {
                        tracing::warn!("Background extension loading task failed: {}", e);
                    }
                }
            }
        }
        None
    }

    pub async fn remove_extension_loading_task(&self, session_id: &str) {
        let mut tasks = self.extension_loading_tasks.lock().await;
        tasks.remove(session_id);
    }

    pub fn scheduler(&self) -> Arc<dyn SchedulerTrait> {
        self.agent_manager.scheduler()
    }

    pub fn session_manager(&self) -> &SessionManager {
        self.agent_manager.session_manager()
    }

    pub async fn set_recipe_file_hash_map(&self, hash_map: HashMap<String, PathBuf>) {
        let mut map = self.recipe_file_hash_map.lock().await;
        *map = hash_map;
    }

    pub async fn mark_recipe_run_if_absent(&self, session_id: &str) -> bool {
        let mut sessions = self.recipe_session_tracker.lock().await;
        if sessions.contains(session_id) {
            false
        } else {
            sessions.insert(session_id.to_string());
            true
        }
    }

    /// Returns a reference to the AG-UI event broadcast sender.
    ///
    /// Callers can use this to publish serialized AG-UI events that will be
    /// delivered to all connected SSE clients.
    pub fn event_sender(&self) -> &broadcast::Sender<String> {
        &self.event_bus
    }

    /// Returns a reference to the settings event broadcast sender.
    ///
    /// POST/DELETE handlers use this to publish settings change events that
    /// are forwarded to all connected `/api/settings/stream` SSE clients.
    pub fn settings_event_sender(&self) -> &broadcast::Sender<String> {
        &self.settings_event_bus
    }

    pub async fn get_agent(&self, session_id: String) -> anyhow::Result<Arc<goose::agents::Agent>> {
        self.agent_manager.get_or_create_agent(session_id).await
    }

    pub async fn get_agent_for_route(
        &self,
        session_id: String,
    ) -> Result<Arc<goose::agents::Agent>, StatusCode> {
        self.get_agent(session_id).await.map_err(|e| {
            tracing::error!("Failed to get agent: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })
    }
}
