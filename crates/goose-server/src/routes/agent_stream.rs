use crate::state::AppState;
use axum::{
    extract::{Query, State},
    http,
    response::IntoResponse,
    routing::get,
    Router,
};
use bytes::Bytes;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio_stream::wrappers::ReceiverStream;
use utoipa::ToSchema;

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Events emitted on the agent status SSE stream.
///
/// Each variant is serialized as JSON with an adjacent `"type"` tag so clients
/// can dispatch on `event.type`.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(tag = "type")]
#[allow(dead_code)] // Variants constructed in tests and by future agent execution code
pub enum AgentStreamEvent {
    /// Periodic snapshot of the agent's current status.
    AgentStatus {
        session_id: String,
        /// One of: `"idle"`, `"thinking"`, `"executing"`, `"streaming"`, `"error"`.
        status: String,
        core_type: String,
        uptime_seconds: u64,
    },
    /// A task's lifecycle changed.
    TaskUpdate {
        task_id: String,
        /// One of: `"created"`, `"in_progress"`, `"completed"`, `"failed"`.
        status: String,
        title: String,
        progress: Option<f64>,
    },
    /// A tool invocation was recorded.
    ToolCalled {
        tool_name: String,
        timestamp: String,
        duration_ms: Option<u64>,
        success: bool,
    },
    /// The agent switched from one core to another.
    CoreSwitched {
        from_core: String,
        to_core: String,
        confidence: f64,
        reason: String,
    },
    /// A new experience was persisted to the learning store.
    ExperienceRecorded {
        task_summary: String,
        core_type: String,
        outcome: String,
    },
    /// Keep-alive heartbeat sent at a regular interval.
    Heartbeat {
        timestamp: String,
    },
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct AgentStreamQuery {
    /// The session whose events to stream. An empty / missing value streams
    /// heartbeats only.
    pub session_id: Option<String>,
}

// ---------------------------------------------------------------------------
// SSE response wrapper (mirrors reply.rs pattern)
// ---------------------------------------------------------------------------

/// Streaming response that formats each item as an SSE `data:` frame.
pub struct AgentSseResponse {
    rx: ReceiverStream<String>,
}

impl AgentSseResponse {
    fn new(rx: ReceiverStream<String>) -> Self {
        Self { rx }
    }
}

impl Stream for AgentSseResponse {
    type Item = Result<Bytes, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.rx)
            .poll_next(cx)
            .map(|opt| opt.map(|s| Ok(Bytes::from(s))))
    }
}

impl IntoResponse for AgentSseResponse {
    fn into_response(self) -> axum::response::Response {
        let body = axum::body::Body::from_stream(self);

        http::Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .body(body)
            .expect("failed to build agent SSE response")
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Format the current UTC timestamp as an RFC 3339 string.
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Serialize an event and wrap it in the SSE `data:` frame format.
fn format_sse_data(event: &AgentStreamEvent) -> String {
    let json = serde_json::to_string(event).unwrap_or_else(|e| {
        format!(
            r#"{{"type":"Heartbeat","timestamp":"error: {}"}}"#,
            e
        )
    });
    format!("data: {}\n\n", json)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// `GET /api/agent-stream?session_id=...`
///
/// Opens a long-lived SSE connection that emits real-time agent events.
/// Currently sends periodic [`AgentStreamEvent::Heartbeat`] frames every 2
/// seconds. When backend pub accessors are wired, richer event types
/// (`AgentStatus`, `ToolCalled`, etc.) will be pushed into the same stream.
#[utoipa::path(
    get,
    path = "/api/agent-stream",
    params(
        ("session_id" = Option<String>, Query, description = "Session ID to stream events for"),
    ),
    responses(
        (status = 200, description = "SSE stream of agent events",
         content_type = "text/event-stream",
         body = AgentStreamEvent),
    )
)]
async fn agent_stream(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<AgentStreamQuery>,
) -> AgentSseResponse {
    let session_id = params.session_id.unwrap_or_default();
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);

    // Spawn a background task that drives the SSE stream.
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(2));

        // Send an initial AgentStatus so the client knows we are alive.
        let initial = AgentStreamEvent::AgentStatus {
            session_id: session_id.clone(),
            status: "idle".to_string(),
            core_type: "freeform".to_string(),
            uptime_seconds: 0,
        };
        if tx.send(format_sse_data(&initial)).await.is_err() {
            return;
        }

        loop {
            interval.tick().await;

            let heartbeat = AgentStreamEvent::Heartbeat {
                timestamp: now_rfc3339(),
            };

            if tx.send(format_sse_data(&heartbeat)).await.is_err() {
                // Client disconnected.
                tracing::debug!("agent-stream client disconnected (session={})", session_id);
                break;
            }
        }
    });

    AgentSseResponse::new(ReceiverStream::new(rx))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/agent-stream", get(agent_stream))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify the router can be constructed without panicking and the handler
    /// signatures are compatible with Axum's type expectations.
    #[test]
    fn test_routes_creation() {
        // Confirm the handler has the correct signature for Axum extraction.
        let _handler = agent_stream;

        // Confirm the routes() function signature matches the convention.
        let _routes_fn: fn(Arc<AppState>) -> Router = routes;
    }

    /// Serialize every `AgentStreamEvent` variant and assert the `"type"` tag
    /// and key fields are present and correctly shaped.
    #[test]
    fn test_agent_stream_event_serialization() {
        // --- AgentStatus ---
        let event = AgentStreamEvent::AgentStatus {
            session_id: "sess-001".to_string(),
            status: "thinking".to_string(),
            core_type: "structured".to_string(),
            uptime_seconds: 120,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "AgentStatus");
        assert_eq!(json["session_id"], "sess-001");
        assert_eq!(json["status"], "thinking");
        assert_eq!(json["core_type"], "structured");
        assert_eq!(json["uptime_seconds"], 120);

        // --- TaskUpdate ---
        let event = AgentStreamEvent::TaskUpdate {
            task_id: "task-42".to_string(),
            status: "in_progress".to_string(),
            title: "Refactor auth module".to_string(),
            progress: Some(0.65),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "TaskUpdate");
        assert_eq!(json["task_id"], "task-42");
        assert_eq!(json["status"], "in_progress");
        assert_eq!(json["title"], "Refactor auth module");
        assert_eq!(json["progress"], 0.65);

        // TaskUpdate with no progress
        let event = AgentStreamEvent::TaskUpdate {
            task_id: "task-43".to_string(),
            status: "created".to_string(),
            title: "New task".to_string(),
            progress: None,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "TaskUpdate");
        assert!(json["progress"].is_null());

        // --- ToolCalled ---
        let event = AgentStreamEvent::ToolCalled {
            tool_name: "developer__shell".to_string(),
            timestamp: "2026-02-12T10:30:00Z".to_string(),
            duration_ms: Some(1500),
            success: true,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "ToolCalled");
        assert_eq!(json["tool_name"], "developer__shell");
        assert_eq!(json["timestamp"], "2026-02-12T10:30:00Z");
        assert_eq!(json["duration_ms"], 1500);
        assert_eq!(json["success"], true);

        // ToolCalled with no duration
        let event = AgentStreamEvent::ToolCalled {
            tool_name: "memory__search".to_string(),
            timestamp: "2026-02-12T10:31:00Z".to_string(),
            duration_ms: None,
            success: false,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "ToolCalled");
        assert!(json["duration_ms"].is_null());
        assert_eq!(json["success"], false);

        // --- CoreSwitched ---
        let event = AgentStreamEvent::CoreSwitched {
            from_core: "freeform".to_string(),
            to_core: "structured".to_string(),
            confidence: 0.85,
            reason: "Multi-step refactoring detected".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "CoreSwitched");
        assert_eq!(json["from_core"], "freeform");
        assert_eq!(json["to_core"], "structured");
        assert_eq!(json["confidence"], 0.85);
        assert_eq!(json["reason"], "Multi-step refactoring detected");

        // --- ExperienceRecorded ---
        let event = AgentStreamEvent::ExperienceRecorded {
            task_summary: "Fixed CI pipeline".to_string(),
            core_type: "freeform".to_string(),
            outcome: "success".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "ExperienceRecorded");
        assert_eq!(json["task_summary"], "Fixed CI pipeline");
        assert_eq!(json["core_type"], "freeform");
        assert_eq!(json["outcome"], "success");

        // --- Heartbeat ---
        let event = AgentStreamEvent::Heartbeat {
            timestamp: "2026-02-12T12:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "Heartbeat");
        assert_eq!(json["timestamp"], "2026-02-12T12:00:00Z");
    }

    /// Verify `AgentStreamQuery` deserialization handles present, absent, and
    /// empty `session_id` values.
    #[test]
    fn test_query_params() {
        // With session_id present
        let json = serde_json::json!({"session_id": "my-session-123"});
        let params: AgentStreamQuery = serde_json::from_value(json).unwrap();
        assert_eq!(params.session_id, Some("my-session-123".to_string()));

        // With session_id absent (all fields optional)
        let json = serde_json::json!({});
        let params: AgentStreamQuery = serde_json::from_value(json).unwrap();
        assert_eq!(params.session_id, None);

        // With session_id as empty string
        let json = serde_json::json!({"session_id": ""});
        let params: AgentStreamQuery = serde_json::from_value(json).unwrap();
        assert_eq!(params.session_id, Some("".to_string()));

        // With session_id as null (should deserialize to None)
        let json = serde_json::json!({"session_id": null});
        let params: AgentStreamQuery = serde_json::from_value(json).unwrap();
        assert_eq!(params.session_id, None);
    }

    /// Verify `format_sse_data` produces valid SSE frame format.
    #[test]
    fn test_format_sse_data() {
        let event = AgentStreamEvent::Heartbeat {
            timestamp: "2026-02-12T00:00:00Z".to_string(),
        };
        let frame = format_sse_data(&event);

        assert!(frame.starts_with("data: "));
        assert!(frame.ends_with("\n\n"));

        // The JSON payload should be parseable.
        let payload = frame
            .strip_prefix("data: ")
            .unwrap()
            .trim_end();
        let parsed: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["type"], "Heartbeat");
        assert_eq!(parsed["timestamp"], "2026-02-12T00:00:00Z");
    }

    /// Verify `now_rfc3339` produces a non-empty, parseable timestamp.
    #[test]
    fn test_now_rfc3339() {
        let ts = now_rfc3339();
        assert!(!ts.is_empty());
        // Should be parseable by chrono
        let parsed = chrono::DateTime::parse_from_rfc3339(&ts);
        assert!(parsed.is_ok(), "now_rfc3339() produced unparseable timestamp: {}", ts);
    }
}
