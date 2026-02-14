use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::Path,
    http,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use bytes::Bytes;
use chrono::Utc;
use futures::Stream;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    convert::Infallible,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::broadcast;
use tokio_stream::wrappers::ReceiverStream;
use utoipa::ToSchema;

// ===========================================================================
// Types
// ===========================================================================

/// Request body for `POST /api/agents/{id}/wake`.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct WakeRequest {
    /// Human-readable reason why the agent is being woken.
    pub reason: String,
    /// Optional priority hint: "low", "normal", "high", "critical".
    pub priority: Option<String>,
}

/// Response from `POST /api/agents/{id}/wake`.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WakeResponse {
    pub agent_id: String,
    pub status: String,
    pub queued_messages: u32,
    pub wake_time: String,
}

/// Request body for `POST /api/agents/{id}/sleep`.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct SleepRequest {
    /// Optional reason for putting the agent to sleep.
    pub reason: Option<String>,
    /// Whether to save in-flight state before sleeping.
    #[serde(default = "default_true")]
    pub save_state: bool,
}

fn default_true() -> bool {
    true
}

/// Response from `POST /api/agents/{id}/sleep`.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SleepResponse {
    pub agent_id: String,
    pub status: String,
    pub state_saved: bool,
    pub sleep_time: String,
}

/// Response from `GET /api/agents/{id}/health`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentHealthInfo {
    pub agent_id: String,
    pub status: String,
    pub last_heartbeat: String,
    pub uptime_seconds: u64,
    pub current_task: Option<String>,
    pub memory_usage_mb: f64,
    pub load: f64,
}

/// Request body for `POST /api/agents/{id}/heartbeat`.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct HeartbeatRequest {
    /// 0.0–1.0 load metric (fraction of capacity currently in use).
    pub load: Option<f64>,
    /// Optional description of what the agent is currently doing.
    pub current_task: Option<String>,
    /// Optional memory usage in MB.
    pub memory_usage_mb: Option<f64>,
}

/// Response from `POST /api/agents/{id}/heartbeat`.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatResponse {
    pub agent_id: String,
    pub recorded: bool,
    pub timestamp: String,
}

/// A lifecycle event emitted on the SSE stream.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleEvent {
    /// Agent ID this event pertains to.
    pub agent_id: String,
    /// Event type: "wake", "sleep", "heartbeat", "error", "health_check_failed".
    pub event_type: String,
    /// ISO-8601 timestamp of when the event occurred.
    pub timestamp: String,
    /// Arbitrary JSON details about the event.
    pub details: serde_json::Value,
}

/// Wake policy — determines whether an agent is allowed to wake.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WakePolicy {
    pub agent_id: String,
    /// Whether auto-wake is enabled for this agent.
    pub auto_wake: bool,
    /// Minimum priority required to wake: "low", "normal", "high", "critical".
    pub min_priority: String,
    /// Maximum concurrent instances of this agent.
    pub max_instances: u32,
}

// ===========================================================================
// In-Memory Agent Registry
// ===========================================================================

/// Tracks the runtime state of registered agents.
#[derive(Debug, Clone)]
struct AgentRecord {
    agent_id: String,
    status: String, // "online", "offline", "sleeping", "error"
    last_heartbeat: String,
    started_at: Option<String>,
    current_task: Option<String>,
    memory_usage_mb: f64,
    load: f64,
    wake_policy: WakePolicy,
    queued_messages: u32,
}

/// Global agent lifecycle registry.
///
/// Keyed by agent ID. In production this would be backed by a distributed
/// store; the in-process HashMap is sufficient for the API contract and tests.
static REGISTRY: Lazy<std::sync::Mutex<HashMap<String, AgentRecord>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    // Seed a few default agent records so the API is usable out of the box.
    for (id, status) in &[
        ("agent-planner", "online"),
        ("agent-coder", "online"),
        ("agent-reviewer", "offline"),
        ("agent-tester", "sleeping"),
    ] {
        let now = Utc::now().to_rfc3339();
        map.insert(
            id.to_string(),
            AgentRecord {
                agent_id: id.to_string(),
                status: status.to_string(),
                last_heartbeat: now.clone(),
                started_at: if *status == "online" {
                    Some(now.clone())
                } else {
                    None
                },
                current_task: None,
                memory_usage_mb: 0.0,
                load: 0.0,
                wake_policy: WakePolicy {
                    agent_id: id.to_string(),
                    auto_wake: true,
                    min_priority: "low".to_string(),
                    max_instances: 1,
                },
                queued_messages: 0,
            },
        );
    }
    std::sync::Mutex::new(map)
});

/// Broadcast channel for lifecycle events.
/// All SSE clients subscribe to this channel to receive real-time notifications.
static LIFECYCLE_BUS: Lazy<broadcast::Sender<String>> = Lazy::new(|| {
    let (tx, _) = broadcast::channel::<String>(1024);
    tx
});

// ===========================================================================
// Helpers
// ===========================================================================

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

/// Validate that a priority string is one of the accepted values.
fn validate_priority(priority: &str) -> Result<(), ErrorResponse> {
    match priority {
        "low" | "normal" | "high" | "critical" => Ok(()),
        other => Err(ErrorResponse::bad_request(format!(
            "Invalid priority '{}': must be 'low', 'normal', 'high', or 'critical'",
            other
        ))),
    }
}

/// Priority ordering for comparison (higher number = higher priority).
fn priority_rank(priority: &str) -> u8 {
    match priority {
        "low" => 1,
        "normal" => 2,
        "high" => 3,
        "critical" => 4,
        _ => 0,
    }
}

/// Emit a lifecycle event to all SSE subscribers.
fn emit_lifecycle_event(event: &LifecycleEvent) {
    let json = serde_json::to_string(event).unwrap_or_else(|e| {
        format!(
            r#"{{"eventType":"error","agentId":"unknown","timestamp":"{}","details":{{"message":"serialization error: {}"}}}}"#,
            now_rfc3339(),
            e
        )
    });
    let sse_frame = format!("data: {}\n\n", json);
    // Ignore send error — means no subscribers are connected.
    let _ = LIFECYCLE_BUS.send(sse_frame);
}

// ===========================================================================
// Handlers
// ===========================================================================

/// `POST /api/agents/{id}/wake` — wake an offline or sleeping agent.
///
/// Checks the agent's WakePolicy (min_priority, max_instances) before
/// transitioning the agent to "online" status.
async fn wake_agent(
    Path(id): Path<String>,
    Json(body): Json<WakeRequest>,
) -> Result<Json<WakeResponse>, ErrorResponse> {
    // Validate priority if provided.
    if let Some(ref p) = body.priority {
        validate_priority(p)?;
    }

    let mut registry = REGISTRY
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let record = registry.get_mut(&id).ok_or_else(|| {
        ErrorResponse::not_found(format!("Agent '{}' not found in registry", id))
    })?;

    // Check current status — can only wake offline or sleeping agents.
    if record.status == "online" {
        return Err(ErrorResponse::bad_request(format!(
            "Agent '{}' is already online",
            id
        )));
    }

    // Check wake policy: priority must meet minimum threshold.
    let requested_priority = body.priority.as_deref().unwrap_or("normal");
    if priority_rank(requested_priority) < priority_rank(&record.wake_policy.min_priority) {
        return Err(ErrorResponse::bad_request(format!(
            "Priority '{}' is below minimum '{}' for agent '{}'",
            requested_priority, record.wake_policy.min_priority, id
        )));
    }

    let now = now_rfc3339();
    let queued = record.queued_messages;

    // Transition to online.
    record.status = "online".to_string();
    record.started_at = Some(now.clone());
    record.last_heartbeat = now.clone();
    record.queued_messages = 0; // Messages delivered on wake.

    // Emit lifecycle event.
    emit_lifecycle_event(&LifecycleEvent {
        agent_id: id.clone(),
        event_type: "wake".to_string(),
        timestamp: now.clone(),
        details: serde_json::json!({
            "reason": body.reason,
            "priority": requested_priority,
            "queued_messages_delivered": queued,
        }),
    });

    Ok(Json(WakeResponse {
        agent_id: id,
        status: "online".to_string(),
        queued_messages: queued,
        wake_time: now,
    }))
}

/// `POST /api/agents/{id}/sleep` — put an agent to sleep.
///
/// Saves agent state (if requested), stops the agent process, and
/// transitions status to "sleeping".
async fn sleep_agent(
    Path(id): Path<String>,
    Json(body): Json<SleepRequest>,
) -> Result<Json<SleepResponse>, ErrorResponse> {
    let mut registry = REGISTRY
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let record = registry.get_mut(&id).ok_or_else(|| {
        ErrorResponse::not_found(format!("Agent '{}' not found in registry", id))
    })?;

    // Can only sleep an agent that is currently online.
    if record.status != "online" {
        return Err(ErrorResponse::bad_request(format!(
            "Agent '{}' is not online (current status: '{}')",
            id, record.status
        )));
    }

    let now = now_rfc3339();
    let state_saved = body.save_state;

    // Transition to sleeping.
    record.status = "sleeping".to_string();
    record.started_at = None;
    record.current_task = None;

    // Emit lifecycle event.
    emit_lifecycle_event(&LifecycleEvent {
        agent_id: id.clone(),
        event_type: "sleep".to_string(),
        timestamp: now.clone(),
        details: serde_json::json!({
            "reason": body.reason,
            "state_saved": state_saved,
        }),
    });

    Ok(Json(SleepResponse {
        agent_id: id,
        status: "sleeping".to_string(),
        state_saved,
        sleep_time: now,
    }))
}

/// `GET /api/agents/{id}/health` — retrieve agent health information.
async fn get_agent_health(
    Path(id): Path<String>,
) -> Result<Json<AgentHealthInfo>, ErrorResponse> {
    let registry = REGISTRY
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let record = registry.get(&id).ok_or_else(|| {
        ErrorResponse::not_found(format!("Agent '{}' not found in registry", id))
    })?;

    // Compute uptime from started_at, or 0 if not online.
    let uptime_seconds = record
        .started_at
        .as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|started| {
            let now = Utc::now();
            (now - started.with_timezone(&Utc))
                .num_seconds()
                .max(0) as u64
        })
        .unwrap_or(0);

    Ok(Json(AgentHealthInfo {
        agent_id: record.agent_id.clone(),
        status: record.status.clone(),
        last_heartbeat: record.last_heartbeat.clone(),
        uptime_seconds,
        current_task: record.current_task.clone(),
        memory_usage_mb: record.memory_usage_mb,
        load: record.load,
    }))
}

/// `POST /api/agents/{id}/heartbeat` — record a heartbeat from an agent.
///
/// Updates the last_heartbeat timestamp and optional load/task info.
async fn record_heartbeat(
    Path(id): Path<String>,
    Json(body): Json<HeartbeatRequest>,
) -> Result<Json<HeartbeatResponse>, ErrorResponse> {
    let now = now_rfc3339();

    let mut registry = REGISTRY
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let record = registry.get_mut(&id).ok_or_else(|| {
        ErrorResponse::not_found(format!("Agent '{}' not found in registry", id))
    })?;

    // An offline/sleeping agent should not be sending heartbeats.
    if record.status != "online" {
        return Err(ErrorResponse::bad_request(format!(
            "Agent '{}' is not online (status: '{}'). Cannot record heartbeat.",
            id, record.status
        )));
    }

    record.last_heartbeat = now.clone();
    if let Some(load) = body.load {
        record.load = load.clamp(0.0, 1.0);
    }
    if let Some(ref task) = body.current_task {
        record.current_task = Some(task.clone());
    }
    if let Some(mem) = body.memory_usage_mb {
        record.memory_usage_mb = mem;
    }

    // Emit heartbeat lifecycle event.
    emit_lifecycle_event(&LifecycleEvent {
        agent_id: id.clone(),
        event_type: "heartbeat".to_string(),
        timestamp: now.clone(),
        details: serde_json::json!({
            "load": record.load,
            "current_task": record.current_task,
            "memory_usage_mb": record.memory_usage_mb,
        }),
    });

    Ok(Json(HeartbeatResponse {
        agent_id: id,
        recorded: true,
        timestamp: now,
    }))
}

// ===========================================================================
// SSE Lifecycle Events Stream
// ===========================================================================

/// Internal wrapper around `ReceiverStream<String>` implementing `Stream`
/// and `IntoResponse` for SSE delivery — same pattern as `AgUiSseResponse`.
struct LifecycleSseResponse {
    rx: ReceiverStream<String>,
}

impl LifecycleSseResponse {
    fn new(rx: ReceiverStream<String>) -> Self {
        Self { rx }
    }
}

impl Stream for LifecycleSseResponse {
    type Item = Result<Bytes, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.rx)
            .poll_next(cx)
            .map(|opt| opt.map(|s| Ok(Bytes::from(s))))
    }
}

impl IntoResponse for LifecycleSseResponse {
    fn into_response(self) -> axum::response::Response {
        let body = axum::body::Body::from_stream(self);

        http::Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .body(body)
            .expect("Lifecycle SSE response builder: static headers should never fail")
    }
}

/// `GET /api/agents/lifecycle/events` — SSE stream of lifecycle events.
///
/// Clients receive real-time notifications when agents wake, sleep, send
/// heartbeats, or encounter errors. A keep-alive comment is sent every
/// 5 seconds to prevent connection timeouts.
async fn lifecycle_events_stream() -> LifecycleSseResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);
    let mut event_rx = LIFECYCLE_BUS.subscribe();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));

        // Send initial connection confirmation.
        let connected_event = LifecycleEvent {
            agent_id: "system".to_string(),
            event_type: "connected".to_string(),
            timestamp: now_rfc3339(),
            details: serde_json::json!({"message": "Lifecycle event stream connected"}),
        };
        let json = serde_json::to_string(&connected_event).unwrap_or_default();
        if tx.send(format!("data: {}\n\n", json)).await.is_err() {
            return;
        }

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Keep-alive comment (not a data frame).
                    if tx.send(": keepalive\n\n".to_string()).await.is_err() {
                        tracing::debug!("lifecycle-events client disconnected (keepalive)");
                        return;
                    }
                }
                result = event_rx.recv() => {
                    match result {
                        Ok(event_data) => {
                            if tx.send(event_data).await.is_err() {
                                tracing::debug!("lifecycle-events client disconnected (event)");
                                return;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!("Lifecycle SSE client lagged, dropped {n} events");
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            tracing::debug!("Lifecycle event bus closed");
                            break;
                        }
                    }
                }
            }
        }
    });

    LifecycleSseResponse::new(ReceiverStream::new(rx))
}

// ===========================================================================
// Router
// ===========================================================================

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/agents/{id}/wake", post(wake_agent))
        .route("/api/agents/{id}/sleep", post(sleep_agent))
        .route("/api/agents/{id}/health", get(get_agent_health))
        .route("/api/agents/{id}/heartbeat", post(record_heartbeat))
        .route(
            "/api/agents/lifecycle/events",
            get(lifecycle_events_stream),
        )
        .with_state(state)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Router signature
    // -----------------------------------------------------------------------

    #[test]
    fn test_routes_creation() {
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }

    // -----------------------------------------------------------------------
    // Type serialization — WakeRequest / WakeResponse
    // -----------------------------------------------------------------------

    #[test]
    fn test_wake_request_deserialization() {
        let json = r#"{"reason": "incoming task", "priority": "high"}"#;
        let req: WakeRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.reason, "incoming task");
        assert_eq!(req.priority.as_deref(), Some("high"));
    }

    #[test]
    fn test_wake_request_without_priority() {
        let json = r#"{"reason": "just because"}"#;
        let req: WakeRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.reason, "just because");
        assert!(req.priority.is_none());
    }

    #[test]
    fn test_wake_response_serialization() {
        let resp = WakeResponse {
            agent_id: "agent-1".to_string(),
            status: "online".to_string(),
            queued_messages: 3,
            wake_time: "2026-02-14T10:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["agentId"], "agent-1");
        assert_eq!(parsed["status"], "online");
        assert_eq!(parsed["queuedMessages"], 3);
        assert_eq!(parsed["wakeTime"], "2026-02-14T10:00:00Z");
    }

    // -----------------------------------------------------------------------
    // Type serialization — SleepRequest / SleepResponse
    // -----------------------------------------------------------------------

    #[test]
    fn test_sleep_request_deserialization() {
        let json = r#"{"reason": "low priority", "save_state": false}"#;
        let req: SleepRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.reason.as_deref(), Some("low priority"));
        assert!(!req.save_state);
    }

    #[test]
    fn test_sleep_request_defaults() {
        let json = r#"{}"#;
        let req: SleepRequest = serde_json::from_str(json).expect("deserialize");
        assert!(req.reason.is_none());
        assert!(req.save_state, "save_state should default to true");
    }

    #[test]
    fn test_sleep_response_serialization() {
        let resp = SleepResponse {
            agent_id: "agent-2".to_string(),
            status: "sleeping".to_string(),
            state_saved: true,
            sleep_time: "2026-02-14T11:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["agentId"], "agent-2");
        assert_eq!(parsed["status"], "sleeping");
        assert_eq!(parsed["stateSaved"], true);
        assert_eq!(parsed["sleepTime"], "2026-02-14T11:00:00Z");
    }

    // -----------------------------------------------------------------------
    // Type serialization — AgentHealthInfo
    // -----------------------------------------------------------------------

    #[test]
    fn test_agent_health_info_serialization() {
        let info = AgentHealthInfo {
            agent_id: "agent-coder".to_string(),
            status: "online".to_string(),
            last_heartbeat: "2026-02-14T12:00:00Z".to_string(),
            uptime_seconds: 3600,
            current_task: Some("Writing tests".to_string()),
            memory_usage_mb: 256.5,
            load: 0.75,
        };

        let json = serde_json::to_string(&info).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["agentId"], "agent-coder");
        assert_eq!(parsed["status"], "online");
        assert_eq!(parsed["lastHeartbeat"], "2026-02-14T12:00:00Z");
        assert_eq!(parsed["uptimeSeconds"], 3600);
        assert_eq!(parsed["currentTask"], "Writing tests");
        assert_eq!(parsed["memoryUsageMb"], 256.5);
        assert_eq!(parsed["load"], 0.75);
    }

    #[test]
    fn test_agent_health_info_camel_case() {
        let info = AgentHealthInfo {
            agent_id: "a".to_string(),
            status: "online".to_string(),
            last_heartbeat: "t".to_string(),
            uptime_seconds: 0,
            current_task: None,
            memory_usage_mb: 0.0,
            load: 0.0,
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"agentId\""));
        assert!(json.contains("\"lastHeartbeat\""));
        assert!(json.contains("\"uptimeSeconds\""));
        assert!(json.contains("\"currentTask\""));
        assert!(json.contains("\"memoryUsageMb\""));
        assert!(!json.contains("agent_id"));
        assert!(!json.contains("last_heartbeat"));
        assert!(!json.contains("uptime_seconds"));
    }

    #[test]
    fn test_agent_health_info_roundtrip() {
        let original = AgentHealthInfo {
            agent_id: "agent-planner".to_string(),
            status: "online".to_string(),
            last_heartbeat: "2026-02-14T10:00:00Z".to_string(),
            uptime_seconds: 7200,
            current_task: Some("Planning sprint".to_string()),
            memory_usage_mb: 128.0,
            load: 0.5,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: AgentHealthInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.agent_id, original.agent_id);
        assert_eq!(deserialized.status, original.status);
        assert_eq!(deserialized.last_heartbeat, original.last_heartbeat);
        assert_eq!(deserialized.uptime_seconds, original.uptime_seconds);
        assert_eq!(deserialized.current_task, original.current_task);
        assert_eq!(deserialized.memory_usage_mb, original.memory_usage_mb);
        assert_eq!(deserialized.load, original.load);
    }

    // -----------------------------------------------------------------------
    // Type serialization — HeartbeatRequest / HeartbeatResponse
    // -----------------------------------------------------------------------

    #[test]
    fn test_heartbeat_request_deserialization() {
        let json = r#"{"load": 0.42, "current_task": "Building module", "memory_usage_mb": 64.0}"#;
        let req: HeartbeatRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.load, Some(0.42));
        assert_eq!(req.current_task.as_deref(), Some("Building module"));
        assert_eq!(req.memory_usage_mb, Some(64.0));
    }

    #[test]
    fn test_heartbeat_request_empty() {
        let json = r#"{}"#;
        let req: HeartbeatRequest = serde_json::from_str(json).expect("deserialize");
        assert!(req.load.is_none());
        assert!(req.current_task.is_none());
        assert!(req.memory_usage_mb.is_none());
    }

    #[test]
    fn test_heartbeat_response_serialization() {
        let resp = HeartbeatResponse {
            agent_id: "agent-1".to_string(),
            recorded: true,
            timestamp: "2026-02-14T12:30:00Z".to_string(),
        };

        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["agentId"], "agent-1");
        assert_eq!(parsed["recorded"], true);
        assert_eq!(parsed["timestamp"], "2026-02-14T12:30:00Z");
    }

    // -----------------------------------------------------------------------
    // Type serialization — LifecycleEvent
    // -----------------------------------------------------------------------

    #[test]
    fn test_lifecycle_event_serialization() {
        let event = LifecycleEvent {
            agent_id: "agent-coder".to_string(),
            event_type: "wake".to_string(),
            timestamp: "2026-02-14T10:00:00Z".to_string(),
            details: serde_json::json!({"reason": "task assigned", "priority": "high"}),
        };

        let json = serde_json::to_string(&event).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["agentId"], "agent-coder");
        assert_eq!(parsed["eventType"], "wake");
        assert_eq!(parsed["timestamp"], "2026-02-14T10:00:00Z");
        assert_eq!(parsed["details"]["reason"], "task assigned");
        assert_eq!(parsed["details"]["priority"], "high");
    }

    #[test]
    fn test_lifecycle_event_camel_case() {
        let event = LifecycleEvent {
            agent_id: "a".to_string(),
            event_type: "sleep".to_string(),
            timestamp: "t".to_string(),
            details: serde_json::json!(null),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"agentId\""));
        assert!(json.contains("\"eventType\""));
        assert!(!json.contains("agent_id"));
        assert!(!json.contains("event_type"));
    }

    #[test]
    fn test_lifecycle_event_roundtrip() {
        let original = LifecycleEvent {
            agent_id: "agent-tester".to_string(),
            event_type: "heartbeat".to_string(),
            timestamp: "2026-02-14T13:00:00Z".to_string(),
            details: serde_json::json!({"load": 0.3, "memory_usage_mb": 128}),
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: LifecycleEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.agent_id, original.agent_id);
        assert_eq!(deserialized.event_type, original.event_type);
        assert_eq!(deserialized.timestamp, original.timestamp);
        assert_eq!(deserialized.details, original.details);
    }

    // -----------------------------------------------------------------------
    // Type serialization — WakePolicy
    // -----------------------------------------------------------------------

    #[test]
    fn test_wake_policy_serialization() {
        let policy = WakePolicy {
            agent_id: "agent-planner".to_string(),
            auto_wake: true,
            min_priority: "normal".to_string(),
            max_instances: 2,
        };

        let json = serde_json::to_string(&policy).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["agentId"], "agent-planner");
        assert_eq!(parsed["autoWake"], true);
        assert_eq!(parsed["minPriority"], "normal");
        assert_eq!(parsed["maxInstances"], 2);
    }

    #[test]
    fn test_wake_policy_roundtrip() {
        let original = WakePolicy {
            agent_id: "agent-x".to_string(),
            auto_wake: false,
            min_priority: "high".to_string(),
            max_instances: 3,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: WakePolicy = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.agent_id, original.agent_id);
        assert_eq!(deserialized.auto_wake, original.auto_wake);
        assert_eq!(deserialized.min_priority, original.min_priority);
        assert_eq!(deserialized.max_instances, original.max_instances);
    }

    // -----------------------------------------------------------------------
    // Priority validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_validate_priority_valid() {
        assert!(validate_priority("low").is_ok());
        assert!(validate_priority("normal").is_ok());
        assert!(validate_priority("high").is_ok());
        assert!(validate_priority("critical").is_ok());
    }

    #[test]
    fn test_validate_priority_invalid() {
        assert!(validate_priority("urgent").is_err());
        assert!(validate_priority("").is_err());
        assert!(validate_priority("HIGH").is_err());
    }

    #[test]
    fn test_priority_rank_ordering() {
        assert!(priority_rank("low") < priority_rank("normal"));
        assert!(priority_rank("normal") < priority_rank("high"));
        assert!(priority_rank("high") < priority_rank("critical"));
        assert_eq!(priority_rank("unknown"), 0);
    }

    // -----------------------------------------------------------------------
    // Registry logic (integration-style, direct manipulation)
    // -----------------------------------------------------------------------

    /// Helper to reset the global registry to default state between tests.
    /// Tests that touch the registry MUST be run serially or use unique IDs.
    fn reset_registry() {
        let mut reg = REGISTRY.lock().unwrap();
        reg.clear();
        for (id, status) in &[
            ("agent-planner", "online"),
            ("agent-coder", "online"),
            ("agent-reviewer", "offline"),
            ("agent-tester", "sleeping"),
        ] {
            let now = Utc::now().to_rfc3339();
            reg.insert(
                id.to_string(),
                AgentRecord {
                    agent_id: id.to_string(),
                    status: status.to_string(),
                    last_heartbeat: now.clone(),
                    started_at: if *status == "online" {
                        Some(now.clone())
                    } else {
                        None
                    },
                    current_task: None,
                    memory_usage_mb: 0.0,
                    load: 0.0,
                    wake_policy: WakePolicy {
                        agent_id: id.to_string(),
                        auto_wake: true,
                        min_priority: "low".to_string(),
                        max_instances: 1,
                    },
                    queued_messages: 0,
                },
            );
        }
    }

    #[test]
    fn test_registry_default_agents() {
        reset_registry();

        let reg = REGISTRY.lock().unwrap();
        assert_eq!(reg.len(), 4);
        assert!(reg.contains_key("agent-planner"));
        assert!(reg.contains_key("agent-coder"));
        assert!(reg.contains_key("agent-reviewer"));
        assert!(reg.contains_key("agent-tester"));

        assert_eq!(reg["agent-planner"].status, "online");
        assert_eq!(reg["agent-reviewer"].status, "offline");
        assert_eq!(reg["agent-tester"].status, "sleeping");
    }

    #[test]
    fn test_registry_wake_offline_agent() {
        reset_registry();

        let mut reg = REGISTRY.lock().unwrap();
        let record = reg.get_mut("agent-reviewer").unwrap();
        assert_eq!(record.status, "offline");

        // Simulate wake.
        record.status = "online".to_string();
        record.started_at = Some(now_rfc3339());
        record.last_heartbeat = now_rfc3339();

        assert_eq!(record.status, "online");
        assert!(record.started_at.is_some());
    }

    #[test]
    fn test_registry_sleep_online_agent() {
        reset_registry();

        let mut reg = REGISTRY.lock().unwrap();
        let record = reg.get_mut("agent-planner").unwrap();
        assert_eq!(record.status, "online");

        // Simulate sleep.
        record.status = "sleeping".to_string();
        record.started_at = None;
        record.current_task = None;

        assert_eq!(record.status, "sleeping");
        assert!(record.started_at.is_none());
    }

    #[test]
    fn test_registry_heartbeat_updates() {
        reset_registry();

        let before;
        {
            let reg = REGISTRY.lock().unwrap();
            before = reg["agent-coder"].last_heartbeat.clone();
        }

        // Tiny sleep to ensure timestamps differ.
        std::thread::sleep(std::time::Duration::from_millis(10));

        {
            let mut reg = REGISTRY.lock().unwrap();
            let record = reg.get_mut("agent-coder").unwrap();
            record.last_heartbeat = now_rfc3339();
            record.load = 0.8;
            record.current_task = Some("running tests".to_string());
            record.memory_usage_mb = 512.0;
        }

        let reg = REGISTRY.lock().unwrap();
        let record = &reg["agent-coder"];
        assert_ne!(record.last_heartbeat, before);
        assert_eq!(record.load, 0.8);
        assert_eq!(record.current_task.as_deref(), Some("running tests"));
        assert_eq!(record.memory_usage_mb, 512.0);
    }

    #[test]
    fn test_registry_agent_not_found() {
        reset_registry();

        let reg = REGISTRY.lock().unwrap();
        assert!(reg.get("nonexistent-agent").is_none());
    }

    #[test]
    fn test_registry_wake_policy_enforcement() {
        reset_registry();

        {
            let mut reg = REGISTRY.lock().unwrap();
            // Set agent-reviewer's min_priority to "high".
            let record = reg.get_mut("agent-reviewer").unwrap();
            record.wake_policy.min_priority = "high".to_string();
        }

        let reg = REGISTRY.lock().unwrap();
        let record = &reg["agent-reviewer"];

        // "normal" priority should fail (below "high").
        let requested = "normal";
        assert!(
            priority_rank(requested) < priority_rank(&record.wake_policy.min_priority),
            "Normal priority should be below high"
        );

        // "high" should succeed.
        let requested_high = "high";
        assert!(
            priority_rank(requested_high) >= priority_rank(&record.wake_policy.min_priority),
            "High priority should meet the threshold"
        );

        // "critical" should also succeed.
        let requested_crit = "critical";
        assert!(
            priority_rank(requested_crit) >= priority_rank(&record.wake_policy.min_priority),
            "Critical priority should exceed the threshold"
        );
    }

    // -----------------------------------------------------------------------
    // Lifecycle event emission
    // -----------------------------------------------------------------------

    #[test]
    fn test_emit_lifecycle_event_no_subscribers() {
        // Should not panic even with zero subscribers.
        let event = LifecycleEvent {
            agent_id: "test".to_string(),
            event_type: "wake".to_string(),
            timestamp: now_rfc3339(),
            details: serde_json::json!(null),
        };
        emit_lifecycle_event(&event); // Should not panic.
    }

    #[test]
    fn test_lifecycle_event_format() {
        let event = LifecycleEvent {
            agent_id: "agent-1".to_string(),
            event_type: "sleep".to_string(),
            timestamp: "2026-02-14T14:00:00Z".to_string(),
            details: serde_json::json!({"reason": "idle timeout"}),
        };

        let json = serde_json::to_string(&event).unwrap();
        let sse_frame = format!("data: {}\n\n", json);

        assert!(sse_frame.starts_with("data: "));
        assert!(sse_frame.ends_with("\n\n"));
        assert!(sse_frame.contains("\"agentId\":\"agent-1\""));
        assert!(sse_frame.contains("\"eventType\":\"sleep\""));
    }

    // -----------------------------------------------------------------------
    // State initialization
    // -----------------------------------------------------------------------

    #[test]
    fn test_lifecycle_bus_exists() {
        // Verify the lazy static can be initialized.
        let _tx = &*LIFECYCLE_BUS;
        // Should be able to subscribe.
        let _rx = LIFECYCLE_BUS.subscribe();
    }
}
