use crate::state::AppState;
use axum::{
    extract::{Path, Query, State},
    http,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use bytes::Bytes;
use chrono::Utc;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    convert::Infallible,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::{Mutex, RwLock};
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// In-memory stores (backed by AppState extension)
// ---------------------------------------------------------------------------

/// Shared, in-memory agent registry and message/task stores.
///
/// This is intentionally kept simple — all state lives in RAM behind an
/// `Arc<AgentBusState>`.  A future iteration can swap in the SQLite tables
/// defined in `007_agent_bus.sql` via sqlx without changing the route handlers
/// (just replace the `Vec` stores with queries).
#[derive(Debug, Clone)]
pub struct AgentBusState {
    agents: Arc<RwLock<HashMap<String, AgentRecord>>>,
    messages: Arc<Mutex<Vec<MessageRecord>>>,
    tasks: Arc<RwLock<HashMap<String, TaskRecord>>>,
    /// Broadcast channel for real-time agent chat events.
    chat_tx: tokio::sync::broadcast::Sender<String>,
}

impl AgentBusState {
    pub fn new() -> Self {
        let (chat_tx, _) = tokio::sync::broadcast::channel::<String>(1024);
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            messages: Arc::new(Mutex::new(Vec::new())),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            chat_tx,
        }
    }
}

impl Default for AgentBusState {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRecord {
    pub id: String,
    pub role: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_backend: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wake_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_heartbeat: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_online: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub from_agent: String,
    pub to_target: String,
    pub target_type: String,
    #[serde(default = "default_channel")]
    pub channel: String,
    #[serde(default = "default_priority")]
    pub priority: i32,
    pub payload: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub delivered: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivered_at: Option<String>,
    pub acknowledged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acknowledged_at: Option<String>,
}

fn default_channel() -> String {
    "team".to_string()
}

fn default_priority() -> i32 {
    2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRecord {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_to: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_priority")]
    pub priority: i32,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RegisterAgentRequest {
    #[serde(default = "generate_id")]
    pub id: String,
    pub role: String,
    pub display_name: String,
    pub model_backend: Option<String>,
    pub capabilities: Option<Vec<String>>,
    pub wake_policy: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub from_agent: String,
    pub target_type: Option<String>,
    pub channel: Option<String>,
    pub priority: Option<i32>,
    pub payload: serde_json::Value,
    pub reply_to: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InboxQuery {
    pub delivered: Option<bool>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub assigned_to: Option<String>,
    pub priority: Option<i32>,
    pub dependencies: Option<Vec<String>>,
    pub created_by: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub assigned_to: Option<String>,
    pub status: Option<String>,
    pub result: Option<serde_json::Value>,
    pub priority: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct TaskListQuery {
    pub status: Option<String>,
    pub assigned_to: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct AgentListResponse {
    pub agents: Vec<AgentRecord>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct TaskListResponse {
    pub tasks: Vec<TaskRecord>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct MessageListResponse {
    pub messages: Vec<MessageRecord>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct OperationResponse {
    pub success: bool,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Handlers — Agent Registry
// ---------------------------------------------------------------------------

/// `GET /api/agents/registry` — List all registered agents with status.
async fn list_agents(
    State(bus): State<Arc<AgentBusState>>,
) -> Json<AgentListResponse> {
    let agents = bus.agents.read().await;
    let list: Vec<AgentRecord> = agents.values().cloned().collect();
    let total = list.len();
    Json(AgentListResponse { agents: list, total })
}

/// `POST /api/agents/register` — Register a new agent.
async fn register_agent(
    State(bus): State<Arc<AgentBusState>>,
    Json(req): Json<RegisterAgentRequest>,
) -> Result<(StatusCode, Json<AgentRecord>), (StatusCode, Json<OperationResponse>)> {
    let mut agents = bus.agents.write().await;

    if agents.contains_key(&req.id) {
        return Err((
            StatusCode::CONFLICT,
            Json(OperationResponse {
                success: false,
                message: format!("Agent '{}' already registered", req.id),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let record = AgentRecord {
        id: req.id.clone(),
        role: req.role,
        display_name: req.display_name,
        model_backend: req.model_backend,
        status: "offline".to_string(),
        capabilities: req.capabilities,
        wake_policy: req.wake_policy,
        last_heartbeat: None,
        last_online: None,
        created_at: now,
        metadata: req.metadata,
    };

    agents.insert(req.id, record.clone());
    Ok((StatusCode::CREATED, Json(record)))
}

/// `GET /api/agents/{id}` — Get agent details.
async fn get_agent(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
) -> Result<Json<AgentRecord>, (StatusCode, Json<OperationResponse>)> {
    let agents = bus.agents.read().await;
    match agents.get(&id) {
        Some(agent) => Ok(Json(agent.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(OperationResponse {
                success: false,
                message: format!("Agent '{}' not found", id),
            }),
        )),
    }
}

/// `PUT /api/agents/{id}/status` — Update agent status.
async fn update_agent_status(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateStatusRequest>,
) -> Result<Json<AgentRecord>, (StatusCode, Json<OperationResponse>)> {
    let mut agents = bus.agents.write().await;
    match agents.get_mut(&id) {
        Some(agent) => {
            let now = Utc::now().to_rfc3339();
            agent.status = req.status.clone();
            agent.last_heartbeat = Some(now.clone());
            if req.status == "online" {
                agent.last_online = Some(now);
            }
            Ok(Json(agent.clone()))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(OperationResponse {
                success: false,
                message: format!("Agent '{}' not found", id),
            }),
        )),
    }
}

/// `POST /api/agents/{id}/wake` — Wake an offline agent.
async fn wake_agent(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
) -> Result<Json<AgentRecord>, (StatusCode, Json<OperationResponse>)> {
    let mut agents = bus.agents.write().await;
    match agents.get_mut(&id) {
        Some(agent) => {
            if agent.status == "online" {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(OperationResponse {
                        success: false,
                        message: format!("Agent '{}' is already online", id),
                    }),
                ));
            }
            let now = Utc::now().to_rfc3339();
            agent.status = "waking".to_string();
            agent.last_heartbeat = Some(now);
            Ok(Json(agent.clone()))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(OperationResponse {
                success: false,
                message: format!("Agent '{}' not found", id),
            }),
        )),
    }
}

// ---------------------------------------------------------------------------
// Handlers — Agent Messages
// ---------------------------------------------------------------------------

/// `POST /api/agents/{id}/message` — Send a message to an agent.
async fn send_message(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
    Json(req): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<MessageRecord>), (StatusCode, Json<OperationResponse>)> {
    // Verify the target agent exists
    {
        let agents = bus.agents.read().await;
        if !agents.contains_key(&id) {
            return Err((
                StatusCode::NOT_FOUND,
                Json(OperationResponse {
                    success: false,
                    message: format!("Target agent '{}' not found", id),
                }),
            ));
        }
    }

    let now = Utc::now().to_rfc3339();
    let record = MessageRecord {
        id: Uuid::new_v4().to_string(),
        from_agent: req.from_agent,
        to_target: id,
        target_type: req.target_type.unwrap_or_else(|| "agent".to_string()),
        channel: req.channel.unwrap_or_else(default_channel),
        priority: req.priority.unwrap_or(2),
        payload: req.payload,
        reply_to: req.reply_to,
        created_at: now,
        expires_at: req.expires_at,
        delivered: false,
        delivered_at: None,
        acknowledged: false,
        acknowledged_at: None,
    };

    // Broadcast to the SSE stream
    let _ = bus.chat_tx.send(serde_json::to_string(&record).unwrap_or_default());

    let mut messages = bus.messages.lock().await;
    messages.push(record.clone());

    Ok((StatusCode::CREATED, Json(record)))
}

/// `GET /api/agents/{id}/messages` — Get an agent's inbox.
async fn get_inbox(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
    Query(params): Query<InboxQuery>,
) -> Json<MessageListResponse> {
    let messages = bus.messages.lock().await;
    let limit = params.limit.unwrap_or(50);

    let filtered: Vec<MessageRecord> = messages
        .iter()
        .filter(|m| m.to_target == id)
        .filter(|m| match params.delivered {
            Some(d) => m.delivered == d,
            None => true,
        })
        .rev() // newest first
        .take(limit)
        .cloned()
        .collect();

    let total = filtered.len();
    Json(MessageListResponse {
        messages: filtered,
        total,
    })
}

// ---------------------------------------------------------------------------
// SSE response wrapper (mirrors ag_ui_stream.rs pattern)
// ---------------------------------------------------------------------------

/// Streaming SSE response for the agent chat stream.
struct AgentChatSseResponse {
    rx: ReceiverStream<String>,
}

impl AgentChatSseResponse {
    fn new(rx: ReceiverStream<String>) -> Self {
        Self { rx }
    }
}

impl Stream for AgentChatSseResponse {
    type Item = Result<Bytes, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.rx)
            .poll_next(cx)
            .map(|opt| opt.map(|s| Ok(Bytes::from(s))))
    }
}

impl IntoResponse for AgentChatSseResponse {
    fn into_response(self) -> axum::response::Response {
        let body = axum::body::Body::from_stream(self);

        http::Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .body(body)
            .expect("Agent chat SSE response builder: static headers should never fail")
    }
}

/// Format a data payload as an SSE `data:` frame with an optional event name.
fn format_sse(event_name: &str, data: &str) -> String {
    format!("event: {}\ndata: {}\n\n", event_name, data)
}

/// Request body for `POST /api/agents/chat/send`.
#[derive(Debug, Deserialize)]
struct ChatSendRequest {
    to: String,
    content: String,
    #[serde(default = "default_channel")]
    channel: String,
}

/// `POST /api/agents/chat/send` — Send a chat message from the user.
///
/// This is used by the frontend's `useAgentChat` hook when the user types
/// a message in the inter-agent chat panel.
async fn chat_send(
    State(bus): State<Arc<AgentBusState>>,
    Json(req): Json<ChatSendRequest>,
) -> (StatusCode, Json<MessageRecord>) {
    let now = Utc::now().to_rfc3339();
    let record = MessageRecord {
        id: Uuid::new_v4().to_string(),
        from_agent: "user".to_string(),
        to_target: req.to.clone(),
        target_type: "agent".to_string(),
        channel: req.channel,
        priority: 2,
        payload: serde_json::json!({ "text": req.content }),
        reply_to: None,
        created_at: now,
        expires_at: None,
        delivered: false,
        delivered_at: None,
        acknowledged: false,
        acknowledged_at: None,
    };

    // Broadcast to SSE subscribers
    let _ = bus.chat_tx.send(serde_json::to_string(&record).unwrap_or_default());

    let mut messages = bus.messages.lock().await;
    messages.push(record.clone());

    (StatusCode::CREATED, Json(record))
}

/// Request body for `POST /api/agents/wake` (no path param variant).
#[derive(Debug, Deserialize)]
struct WakeByBodyRequest {
    #[serde(alias = "agentId")]
    agent_id: String,
    #[serde(default)]
    reason: Option<String>,
}

/// `POST /api/agents/wake` — Wake an agent by ID supplied in the JSON body.
///
/// The frontend's `useAgentChat` hook calls this variant (without a path
/// param).  It delegates to the same wake logic as `POST /api/agents/{id}/wake`.
async fn wake_agent_by_body(
    State(bus): State<Arc<AgentBusState>>,
    Json(req): Json<WakeByBodyRequest>,
) -> Result<Json<AgentRecord>, (StatusCode, Json<OperationResponse>)> {
    let mut agents = bus.agents.write().await;
    match agents.get_mut(&req.agent_id) {
        Some(agent) => {
            if agent.status == "online" {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(OperationResponse {
                        success: false,
                        message: format!("Agent '{}' is already online", req.agent_id),
                    }),
                ));
            }
            let now = Utc::now().to_rfc3339();
            agent.status = "waking".to_string();
            agent.last_heartbeat = Some(now);
            tracing::info!(
                agent_id = %req.agent_id,
                reason = ?req.reason,
                "Agent woken via body-based wake endpoint"
            );
            Ok(Json(agent.clone()))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(OperationResponse {
                success: false,
                message: format!("Agent '{}' not found", req.agent_id),
            }),
        )),
    }
}

/// `GET /api/agents/conductor/status` — Get conductor process status.
///
/// Returns the status of the conductor process (process orchestrator).
/// The frontend's `useConductorStatus` hook polls this endpoint every 5s.
async fn conductor_status(
    State(bus): State<Arc<AgentBusState>>,
) -> Json<serde_json::Value> {
    let agents = bus.agents.read().await;
    let children: Vec<serde_json::Value> = agents
        .values()
        .map(|a| {
            serde_json::json!({
                "name": a.display_name,
                "pid": 0,
                "status": a.status,
                "uptime": 0,
            })
        })
        .collect();

    Json(serde_json::json!({
        "running": !agents.is_empty(),
        "children": children,
        "last_health_check": Utc::now().to_rfc3339(),
        "message_queue_size": 0,
        "task_queue_size": 0,
    }))
}

/// `GET /api/agents/chat/stream` — SSE stream of all agent messages.
async fn chat_stream(
    State(bus): State<Arc<AgentBusState>>,
) -> AgentChatSseResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);
    let mut event_rx = bus.chat_tx.subscribe();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(15));

        // Send an initial connected event
        if tx
            .send(format_sse("connected", r#"{"status":"ok"}"#))
            .await
            .is_err()
        {
            return;
        }

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let ping = format_sse("ping", &format!(r#"{{"ts":"{}"}}"#, Utc::now().to_rfc3339()));
                    if tx.send(ping).await.is_err() {
                        tracing::debug!("agents-chat-stream: client disconnected (heartbeat)");
                        return;
                    }
                }
                result = event_rx.recv() => {
                    match result {
                        Ok(msg) => {
                            let frame = format_sse("message", &msg);
                            if tx.send(frame).await.is_err() {
                                tracing::debug!("agents-chat-stream: client disconnected (message)");
                                return;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            let warn = serde_json::json!({"warning":"lagged","skipped":n});
                            let frame = format_sse("warning", &warn.to_string());
                            let _ = tx.send(frame).await;
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            break;
                        }
                    }
                }
            }
        }
    });

    AgentChatSseResponse::new(ReceiverStream::new(rx))
}

// ---------------------------------------------------------------------------
// Handlers — Task Queue
// ---------------------------------------------------------------------------

/// `GET /api/tasks` — List tasks with optional filters.
async fn list_tasks(
    State(bus): State<Arc<AgentBusState>>,
    Query(params): Query<TaskListQuery>,
) -> Json<TaskListResponse> {
    let tasks = bus.tasks.read().await;
    let limit = params.limit.unwrap_or(50);

    let mut filtered: Vec<TaskRecord> = tasks
        .values()
        .filter(|t| match &params.status {
            Some(s) => t.status == *s,
            None => true,
        })
        .filter(|t| match &params.assigned_to {
            Some(a) => t.assigned_to.as_deref() == Some(a.as_str()),
            None => true,
        })
        .cloned()
        .collect();

    // Sort by priority (lower number = higher priority), then by created_at descending
    filtered.sort_by(|a, b| {
        a.priority
            .cmp(&b.priority)
            .then_with(|| b.created_at.cmp(&a.created_at))
    });

    filtered.truncate(limit);
    let total = filtered.len();
    Json(TaskListResponse {
        tasks: filtered,
        total,
    })
}

/// `POST /api/tasks` — Create a new task.
async fn create_task(
    State(bus): State<Arc<AgentBusState>>,
    Json(req): Json<CreateTaskRequest>,
) -> (StatusCode, Json<TaskRecord>) {
    let now = Utc::now().to_rfc3339();
    let record = TaskRecord {
        id: Uuid::new_v4().to_string(),
        assigned_to: req.assigned_to,
        title: req.title,
        description: req.description,
        priority: req.priority.unwrap_or(2),
        status: "pending".to_string(),
        dependencies: req.dependencies,
        result: None,
        created_at: now,
        started_at: None,
        completed_at: None,
        created_by: req.created_by,
        metadata: req.metadata,
    };

    let mut tasks = bus.tasks.write().await;
    tasks.insert(record.id.clone(), record.clone());

    (StatusCode::CREATED, Json(record))
}

/// `PUT /api/tasks/{id}` — Update a task.
async fn update_task(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateTaskRequest>,
) -> Result<Json<TaskRecord>, (StatusCode, Json<OperationResponse>)> {
    let mut tasks = bus.tasks.write().await;
    match tasks.get_mut(&id) {
        Some(task) => {
            let now = Utc::now().to_rfc3339();

            if let Some(assigned_to) = req.assigned_to {
                task.assigned_to = Some(assigned_to);
            }
            if let Some(status) = req.status {
                // Track timestamps for status transitions
                match status.as_str() {
                    "in_progress" => {
                        if task.started_at.is_none() {
                            task.started_at = Some(now.clone());
                        }
                    }
                    "completed" | "failed" | "cancelled" => {
                        task.completed_at = Some(now);
                    }
                    _ => {}
                }
                task.status = status;
            }
            if let Some(result) = req.result {
                task.result = Some(result);
            }
            if let Some(priority) = req.priority {
                task.priority = priority;
            }
            if let Some(metadata) = req.metadata {
                task.metadata = Some(metadata);
            }

            Ok(Json(task.clone()))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(OperationResponse {
                success: false,
                message: format!("Task '{}' not found", id),
            }),
        )),
    }
}

/// `GET /api/tasks/{id}` — Get task details.
async fn get_task(
    State(bus): State<Arc<AgentBusState>>,
    Path(id): Path<String>,
) -> Result<Json<TaskRecord>, (StatusCode, Json<OperationResponse>)> {
    let tasks = bus.tasks.read().await;
    match tasks.get(&id) {
        Some(task) => Ok(Json(task.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(OperationResponse {
                success: false,
                message: format!("Task '{}' not found", id),
            }),
        )),
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(_app_state: Arc<AppState>) -> Router {
    // Each route module receives AppState for consistency with the rest of
    // the server, but these endpoints operate on their own AgentBusState.
    // We create a single shared instance here and nest it as the axum State.
    let bus = Arc::new(AgentBusState::new());

    Router::new()
        // Agent registry
        .route("/api/agents/registry", get(list_agents))
        .route("/api/agents/register", post(register_agent))
        .route("/api/agents/{id}", get(get_agent))
        .route("/api/agents/{id}/status", put(update_agent_status))
        .route("/api/agents/{id}/wake", post(wake_agent))
        // Agent messages
        .route("/api/agents/{id}/message", post(send_message))
        .route("/api/agents/{id}/messages", get(get_inbox))
        .route("/api/agents/chat/stream", get(chat_stream))
        .route("/api/agents/chat/send", post(chat_send))
        .route("/api/agents/wake", post(wake_agent_by_body))
        .route("/api/agents/conductor/status", get(conductor_status))
        // Task queue
        .route("/api/tasks", get(list_tasks).post(create_task))
        .route(
            "/api/tasks/{id}",
            get(get_task).put(update_task),
        )
        .with_state(bus)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routes_creation() {
        let _routes_fn: fn(Arc<AppState>) -> Router = routes;
    }

    #[test]
    fn test_agent_bus_state_default() {
        let bus = AgentBusState::default();
        // Just verify it constructs without panic
        let _ = bus.chat_tx.subscribe();
    }

    #[test]
    fn test_agent_record_serialization() {
        let agent = AgentRecord {
            id: "agent-001".to_string(),
            role: "coder".to_string(),
            display_name: "Coder Agent".to_string(),
            model_backend: Some("claude-opus-4-6".to_string()),
            status: "online".to_string(),
            capabilities: Some(vec!["code".to_string(), "test".to_string()]),
            wake_policy: None,
            last_heartbeat: Some("2026-02-14T12:00:00Z".to_string()),
            last_online: Some("2026-02-14T12:00:00Z".to_string()),
            created_at: "2026-02-14T10:00:00Z".to_string(),
            metadata: None,
        };

        let json = serde_json::to_value(&agent).unwrap();
        assert_eq!(json["id"], "agent-001");
        assert_eq!(json["role"], "coder");
        assert_eq!(json["display_name"], "Coder Agent");
        assert_eq!(json["status"], "online");
        assert_eq!(json["capabilities"].as_array().unwrap().len(), 2);
        // wake_policy and metadata should be absent (skip_serializing_if)
        assert!(json.get("wake_policy").is_none());
        assert!(json.get("metadata").is_none());

        // Round-trip
        let deserialized: AgentRecord = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.id, "agent-001");
        assert_eq!(deserialized.capabilities.unwrap().len(), 2);
    }

    #[test]
    fn test_message_record_serialization() {
        let msg = MessageRecord {
            id: "msg-001".to_string(),
            from_agent: "agent-001".to_string(),
            to_target: "agent-002".to_string(),
            target_type: "agent".to_string(),
            channel: "team".to_string(),
            priority: 1,
            payload: serde_json::json!({"content": "hello"}),
            reply_to: None,
            created_at: "2026-02-14T12:00:00Z".to_string(),
            expires_at: None,
            delivered: false,
            delivered_at: None,
            acknowledged: false,
            acknowledged_at: None,
        };

        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["from_agent"], "agent-001");
        assert_eq!(json["to_target"], "agent-002");
        assert_eq!(json["priority"], 1);
        assert_eq!(json["delivered"], false);
        // Optional None fields should be absent
        assert!(json.get("reply_to").is_none());
        assert!(json.get("expires_at").is_none());

        let deserialized: MessageRecord = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.id, "msg-001");
        assert!(!deserialized.delivered);
    }

    #[test]
    fn test_task_record_serialization() {
        let task = TaskRecord {
            id: "task-001".to_string(),
            assigned_to: Some("agent-001".to_string()),
            title: "Fix auth bug".to_string(),
            description: Some("The login flow fails on timeout".to_string()),
            priority: 1,
            status: "pending".to_string(),
            dependencies: Some(vec!["task-000".to_string()]),
            result: None,
            created_at: "2026-02-14T12:00:00Z".to_string(),
            started_at: None,
            completed_at: None,
            created_by: Some("user".to_string()),
            metadata: None,
        };

        let json = serde_json::to_value(&task).unwrap();
        assert_eq!(json["id"], "task-001");
        assert_eq!(json["title"], "Fix auth bug");
        assert_eq!(json["priority"], 1);
        assert_eq!(json["status"], "pending");
        assert_eq!(json["assigned_to"], "agent-001");
        assert_eq!(json["dependencies"].as_array().unwrap().len(), 1);
        // result, started_at, completed_at, metadata should be absent
        assert!(json.get("result").is_none());
        assert!(json.get("started_at").is_none());
        assert!(json.get("metadata").is_none());

        let deserialized: TaskRecord = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.title, "Fix auth bug");
        assert_eq!(deserialized.dependencies.unwrap().len(), 1);
    }

    #[test]
    fn test_register_request_defaults() {
        let json = serde_json::json!({
            "role": "coder",
            "display_name": "Coder Agent"
        });
        let req: RegisterAgentRequest = serde_json::from_value(json).unwrap();
        // id should be generated (non-empty UUID)
        assert!(!req.id.is_empty());
        assert_eq!(req.role, "coder");
        assert_eq!(req.display_name, "Coder Agent");
        assert!(req.model_backend.is_none());
        assert!(req.capabilities.is_none());
    }

    #[test]
    fn test_create_task_request_parsing() {
        let json = serde_json::json!({
            "title": "Deploy v2",
            "description": "Deploy version 2 to production",
            "assigned_to": "agent-003",
            "priority": 0,
            "dependencies": ["task-001", "task-002"],
            "created_by": "orchestrator"
        });
        let req: CreateTaskRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.title, "Deploy v2");
        assert_eq!(req.priority, Some(0));
        assert_eq!(req.dependencies.unwrap().len(), 2);
        assert_eq!(req.created_by, Some("orchestrator".to_string()));
    }

    #[test]
    fn test_update_task_request_partial() {
        // Only status field provided
        let json = serde_json::json!({
            "status": "in_progress"
        });
        let req: UpdateTaskRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.status, Some("in_progress".to_string()));
        assert!(req.assigned_to.is_none());
        assert!(req.result.is_none());
        assert!(req.priority.is_none());
        assert!(req.metadata.is_none());
    }

    #[test]
    fn test_operation_response_serialization() {
        let resp = OperationResponse {
            success: true,
            message: "Agent registered".to_string(),
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["message"], "Agent registered");
    }

    #[test]
    fn test_inbox_query_defaults() {
        let json = serde_json::json!({});
        let query: InboxQuery = serde_json::from_value(json).unwrap();
        assert!(query.delivered.is_none());
        assert!(query.limit.is_none());
    }

    #[test]
    fn test_task_list_query_parsing() {
        let json = serde_json::json!({
            "status": "pending",
            "assigned_to": "agent-001",
            "limit": 10
        });
        let query: TaskListQuery = serde_json::from_value(json).unwrap();
        assert_eq!(query.status, Some("pending".to_string()));
        assert_eq!(query.assigned_to, Some("agent-001".to_string()));
        assert_eq!(query.limit, Some(10));
    }

    #[tokio::test]
    async fn test_agent_bus_state_agents_crud() {
        let bus = AgentBusState::new();

        // Initially empty
        assert!(bus.agents.read().await.is_empty());

        // Insert an agent
        let now = Utc::now().to_rfc3339();
        let agent = AgentRecord {
            id: "test-agent".to_string(),
            role: "tester".to_string(),
            display_name: "Test Agent".to_string(),
            model_backend: None,
            status: "offline".to_string(),
            capabilities: None,
            wake_policy: None,
            last_heartbeat: None,
            last_online: None,
            created_at: now,
            metadata: None,
        };
        bus.agents.write().await.insert("test-agent".to_string(), agent);

        // Verify lookup
        let agents = bus.agents.read().await;
        assert_eq!(agents.len(), 1);
        assert_eq!(agents.get("test-agent").unwrap().role, "tester");
    }

    #[tokio::test]
    async fn test_agent_bus_state_tasks_crud() {
        let bus = AgentBusState::new();

        let now = Utc::now().to_rfc3339();
        let task = TaskRecord {
            id: "task-001".to_string(),
            assigned_to: None,
            title: "Test task".to_string(),
            description: None,
            priority: 2,
            status: "pending".to_string(),
            dependencies: None,
            result: None,
            created_at: now,
            started_at: None,
            completed_at: None,
            created_by: None,
            metadata: None,
        };

        bus.tasks.write().await.insert("task-001".to_string(), task);
        let tasks = bus.tasks.read().await;
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks.get("task-001").unwrap().status, "pending");
    }

    #[tokio::test]
    async fn test_agent_bus_state_messages() {
        let bus = AgentBusState::new();

        let now = Utc::now().to_rfc3339();
        let msg = MessageRecord {
            id: "msg-001".to_string(),
            from_agent: "agent-a".to_string(),
            to_target: "agent-b".to_string(),
            target_type: "agent".to_string(),
            channel: "team".to_string(),
            priority: 2,
            payload: serde_json::json!({"text": "hello"}),
            reply_to: None,
            created_at: now,
            expires_at: None,
            delivered: false,
            delivered_at: None,
            acknowledged: false,
            acknowledged_at: None,
        };

        bus.messages.lock().await.push(msg);
        let messages = bus.messages.lock().await;
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].from_agent, "agent-a");
    }

    #[tokio::test]
    async fn test_broadcast_channel() {
        let bus = AgentBusState::new();
        let mut rx = bus.chat_tx.subscribe();

        // Send a message
        let _ = bus.chat_tx.send("test-event".to_string());

        // Receive it
        let received = rx.recv().await.unwrap();
        assert_eq!(received, "test-event");
    }
}
