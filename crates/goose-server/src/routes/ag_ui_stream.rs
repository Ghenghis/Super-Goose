use crate::routes::agent_stream::AgentStreamEvent;
use crate::state::AppState;
use axum::{
    extract::State,
    http,
    response::IntoResponse,
    routing::{get, post},
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

// ---------------------------------------------------------------------------
// AG-UI Protocol Event Types
// Spec: https://docs.ag-ui.com/concepts/events
// ---------------------------------------------------------------------------

/// AG-UI Protocol event types.
///
/// Each variant maps to a specific event in the AG-UI specification.
/// The enum is serde-serialized with an adjacent `"type"` tag so that
/// clients can dispatch on `event.type`.
///
/// Variant names use SCREAMING_SNAKE_CASE to match the AG-UI wire format
/// exactly (the `serde(tag = "type")` serializes the variant name as-is).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
#[allow(non_camel_case_types)]
pub enum AgUiEvent {
    // -- Lifecycle ----------------------------------------------------------
    RUN_STARTED {
        thread_id: String,
        run_id: String,
    },
    RUN_FINISHED {
        thread_id: String,
        run_id: String,
        result: Option<serde_json::Value>,
    },
    RUN_ERROR {
        message: String,
        code: Option<String>,
    },
    STEP_STARTED {
        step_name: String,
    },
    STEP_FINISHED {
        step_name: String,
    },

    // -- Text Messages ------------------------------------------------------
    TEXT_MESSAGE_START {
        message_id: String,
        role: String,
    },
    TEXT_MESSAGE_CONTENT {
        message_id: String,
        delta: String,
    },
    TEXT_MESSAGE_END {
        message_id: String,
    },

    // -- Tool Calls ---------------------------------------------------------
    TOOL_CALL_START {
        tool_call_id: String,
        tool_call_name: String,
        parent_message_id: Option<String>,
    },
    TOOL_CALL_ARGS {
        tool_call_id: String,
        delta: String,
    },
    TOOL_CALL_END {
        tool_call_id: String,
    },
    TOOL_CALL_RESULT {
        message_id: String,
        tool_call_id: String,
        content: String,
        role: Option<String>,
    },

    // -- State --------------------------------------------------------------
    STATE_SNAPSHOT {
        snapshot: serde_json::Value,
    },
    STATE_DELTA {
        delta: Vec<JsonPatchOp>,
    },
    MESSAGES_SNAPSHOT {
        messages: Vec<serde_json::Value>,
    },

    // -- Activity -----------------------------------------------------------
    ACTIVITY_SNAPSHOT {
        message_id: String,
        activity_type: String,
        content: serde_json::Value,
        replace: Option<bool>,
    },
    ACTIVITY_DELTA {
        message_id: String,
        activity_type: String,
        patch: Vec<JsonPatchOp>,
    },

    // -- Reasoning ----------------------------------------------------------
    REASONING_START {
        message_id: String,
    },
    REASONING_MESSAGE_START {
        message_id: String,
        role: String,
    },
    REASONING_MESSAGE_CONTENT {
        message_id: String,
        delta: String,
    },
    REASONING_MESSAGE_END {
        message_id: String,
    },
    REASONING_END {
        message_id: String,
    },

    // -- Custom -------------------------------------------------------------
    CUSTOM {
        name: String,
        value: serde_json::Value,
    },

    // -- Raw ----------------------------------------------------------------
    RAW {
        event: serde_json::Value,
        source: Option<String>,
    },
}

/// A single JSON Patch operation (RFC 6902).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonPatchOp {
    /// The operation: `"add"`, `"remove"`, `"replace"`, `"move"`, `"copy"`, `"test"`.
    pub op: String,
    /// JSON Pointer path (e.g. `"/status"`).
    pub path: String,
    /// The value for `add`/`replace`/`test` operations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
    /// The source path for `move`/`copy` operations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
}

// ---------------------------------------------------------------------------
// Bridge: Legacy AgentStreamEvent -> AG-UI Events
// ---------------------------------------------------------------------------

/// Convert a legacy `AgentStreamEvent` into one or more AG-UI protocol events.
///
/// A single legacy event may fan out to multiple AG-UI events (e.g. a
/// `ToolCalled` maps to `TOOL_CALL_START` + `TOOL_CALL_END`).
pub fn bridge_legacy_event(event: &AgentStreamEvent) -> Vec<AgUiEvent> {
    match event {
        // AgentStatus -> STATE_SNAPSHOT
        AgentStreamEvent::AgentStatus {
            session_id,
            status,
            core_type,
            uptime_seconds,
        } => vec![AgUiEvent::STATE_SNAPSHOT {
            snapshot: serde_json::json!({
                "session_id": session_id,
                "status": status,
                "core_type": core_type,
                "uptime_seconds": uptime_seconds,
            }),
        }],

        // TaskUpdate -> ACTIVITY_SNAPSHOT
        AgentStreamEvent::TaskUpdate {
            task_id,
            status,
            title,
            progress,
        } => {
            let msg_id = format!("task-{}", task_id);
            vec![AgUiEvent::ACTIVITY_SNAPSHOT {
                message_id: msg_id,
                activity_type: "task_update".to_string(),
                content: serde_json::json!({
                    "task_id": task_id,
                    "status": status,
                    "title": title,
                    "progress": progress,
                }),
                replace: Some(true),
            }]
        }

        // ToolCalled -> TOOL_CALL_START + TOOL_CALL_END + metadata
        AgentStreamEvent::ToolCalled {
            tool_name,
            timestamp,
            duration_ms,
            success,
        } => {
            let call_id = format!("tc-{}", uuid::Uuid::new_v4());
            vec![
                AgUiEvent::TOOL_CALL_START {
                    tool_call_id: call_id.clone(),
                    tool_call_name: tool_name.clone(),
                    parent_message_id: None,
                },
                AgUiEvent::TOOL_CALL_END {
                    tool_call_id: call_id.clone(),
                },
                // Also emit the result metadata as a CUSTOM event so callers
                // get the timing / success information that the AG-UI tool
                // call events alone do not carry.
                AgUiEvent::CUSTOM {
                    name: "tool_call_metadata".to_string(),
                    value: serde_json::json!({
                        "tool_call_id": call_id,
                        "tool_name": tool_name,
                        "timestamp": timestamp,
                        "duration_ms": duration_ms,
                        "success": success,
                    }),
                },
            ]
        }

        // CoreSwitched -> STATE_DELTA (replace /core_type)
        AgentStreamEvent::CoreSwitched {
            from_core,
            to_core,
            confidence,
            reason,
        } => vec![AgUiEvent::STATE_DELTA {
            delta: vec![
                JsonPatchOp {
                    op: "replace".to_string(),
                    path: "/core_type".to_string(),
                    value: Some(serde_json::json!(to_core)),
                    from: None,
                },
                JsonPatchOp {
                    op: "add".to_string(),
                    path: "/last_core_switch".to_string(),
                    value: Some(serde_json::json!({
                        "from_core": from_core,
                        "to_core": to_core,
                        "confidence": confidence,
                        "reason": reason,
                    })),
                    from: None,
                },
            ],
        }],

        // ExperienceRecorded -> STATE_DELTA (add /last_experience)
        AgentStreamEvent::ExperienceRecorded {
            task_summary,
            core_type,
            outcome,
        } => vec![AgUiEvent::STATE_DELTA {
            delta: vec![JsonPatchOp {
                op: "add".to_string(),
                path: "/last_experience".to_string(),
                value: Some(serde_json::json!({
                    "task_summary": task_summary,
                    "core_type": core_type,
                    "outcome": outcome,
                })),
                from: None,
            }],
        }],

        // Heartbeat -> CUSTOM { name: "heartbeat" }
        AgentStreamEvent::Heartbeat { timestamp } => vec![AgUiEvent::CUSTOM {
            name: "heartbeat".to_string(),
            value: serde_json::json!({ "timestamp": timestamp }),
        }],
    }
}

// ---------------------------------------------------------------------------
// SSE response wrapper (mirrors agent_stream.rs pattern)
// ---------------------------------------------------------------------------

/// Streaming response that formats each AG-UI event as an SSE `data:` frame.
pub struct AgUiSseResponse {
    rx: ReceiverStream<String>,
}

impl AgUiSseResponse {
    fn new(rx: ReceiverStream<String>) -> Self {
        Self { rx }
    }
}

impl Stream for AgUiSseResponse {
    type Item = Result<Bytes, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.rx)
            .poll_next(cx)
            .map(|opt| opt.map(|s| Ok(Bytes::from(s))))
    }
}

impl IntoResponse for AgUiSseResponse {
    fn into_response(self) -> axum::response::Response {
        let body = axum::body::Body::from_stream(self);

        http::Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .body(body)
            .unwrap()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Format the current UTC timestamp as an RFC 3339 string.
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Serialize an AG-UI event and wrap it in the SSE `data:` frame format.
fn format_ag_ui_sse(event: &AgUiEvent) -> String {
    let json = serde_json::to_string(event).unwrap_or_else(|e| {
        format!(
            r#"{{"type":"CUSTOM","name":"error","value":{{"message":"serialization error: {}"}}}}"#,
            e
        )
    });
    format!("data: {}\n\n", json)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// `GET /api/ag-ui/stream`
///
/// Opens a long-lived SSE connection that emits AG-UI protocol events.
///
/// The stream starts with a `STATE_SNAPSHOT` of the current agent state,
/// then converts incoming legacy `AgentStreamEvent`s to AG-UI events via the
/// bridge function. A `CUSTOM { name: "heartbeat" }` event is sent every 2
/// seconds as a keep-alive.
async fn ag_ui_stream(
    State(_state): State<Arc<AppState>>,
) -> AgUiSseResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(2));

        // Send initial STATE_SNAPSHOT so the client knows the agent is alive.
        let initial_status = AgentStreamEvent::AgentStatus {
            session_id: String::new(),
            status: "idle".to_string(),
            core_type: "freeform".to_string(),
            uptime_seconds: 0,
        };

        let initial_events = bridge_legacy_event(&initial_status);
        for ev in &initial_events {
            if tx.send(format_ag_ui_sse(ev)).await.is_err() {
                return;
            }
        }

        // Heartbeat loop — sends a CUSTOM heartbeat every 2 seconds.
        // When full event-bus integration is wired, this loop will also
        // receive real `AgentStreamEvent`s, bridge them, and push them.
        loop {
            interval.tick().await;

            let heartbeat = AgentStreamEvent::Heartbeat {
                timestamp: now_rfc3339(),
            };

            let ag_ui_events = bridge_legacy_event(&heartbeat);
            for ev in &ag_ui_events {
                if tx.send(format_ag_ui_sse(ev)).await.is_err() {
                    tracing::debug!("ag-ui-stream client disconnected");
                    return;
                }
            }
        }
    });

    AgUiSseResponse::new(ReceiverStream::new(rx))
}

// ---------------------------------------------------------------------------
// POST Request Bodies
// ---------------------------------------------------------------------------

/// Request body for POST /api/ag-ui/tool-result
#[derive(Debug, Deserialize)]
pub struct ToolResultRequest {
    #[serde(rename = "toolCallId")]
    pub tool_call_id: String,
    pub content: String,
}

/// Request body for POST /api/ag-ui/message
#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

// ---------------------------------------------------------------------------
// POST Handlers
// ---------------------------------------------------------------------------

/// POST /api/ag-ui/tool-result — receives a tool-call result from the frontend.
async fn ag_ui_tool_result(
    State(_state): State<Arc<AppState>>,
    axum::Json(payload): axum::Json<ToolResultRequest>,
) -> axum::http::StatusCode {
    tracing::info!(
        tool_call_id = %payload.tool_call_id,
        "AG-UI tool-result received"
    );
    // TODO: Wire into agent execution pipeline when event bus is connected.
    axum::http::StatusCode::OK
}

/// POST /api/ag-ui/abort — cancels the current agent run.
async fn ag_ui_abort(
    State(_state): State<Arc<AppState>>,
) -> axum::http::StatusCode {
    tracing::info!("AG-UI abort requested");
    // TODO: Wire into agent execution cancellation.
    axum::http::StatusCode::OK
}

/// POST /api/ag-ui/message — receives a user message for the agent.
async fn ag_ui_message(
    State(_state): State<Arc<AppState>>,
    axum::Json(payload): axum::Json<SendMessageRequest>,
) -> axum::http::StatusCode {
    tracing::info!(
        content_len = payload.content.len(),
        "AG-UI message received"
    );
    // TODO: Forward to agent session when event bus is wired.
    axum::http::StatusCode::OK
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/ag-ui/stream", get(ag_ui_stream))
        .route("/api/ag-ui/tool-result", post(ag_ui_tool_result))
        .route("/api/ag-ui/abort", post(ag_ui_abort))
        .route("/api/ag-ui/message", post(ag_ui_message))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Router construction ------------------------------------------------

    #[test]
    fn test_routes_creation() {
        let _handler = ag_ui_stream;
        let _routes_fn: fn(Arc<AppState>) -> Router = routes;
    }

    // -- AG-UI event serialization ------------------------------------------

    #[test]
    fn test_lifecycle_events_serialization() {
        let ev = AgUiEvent::RUN_STARTED {
            thread_id: "t-1".into(),
            run_id: "r-1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "RUN_STARTED");
        assert_eq!(json["thread_id"], "t-1");
        assert_eq!(json["run_id"], "r-1");

        let ev = AgUiEvent::RUN_FINISHED {
            thread_id: "t-1".into(),
            run_id: "r-1".into(),
            result: Some(serde_json::json!({"ok": true})),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "RUN_FINISHED");
        assert_eq!(json["result"]["ok"], true);

        let ev = AgUiEvent::RUN_FINISHED {
            thread_id: "t-1".into(),
            run_id: "r-1".into(),
            result: None,
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert!(json["result"].is_null());

        let ev = AgUiEvent::RUN_ERROR {
            message: "boom".into(),
            code: Some("E001".into()),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "RUN_ERROR");
        assert_eq!(json["message"], "boom");
        assert_eq!(json["code"], "E001");

        let ev = AgUiEvent::STEP_STARTED {
            step_name: "plan".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "STEP_STARTED");

        let ev = AgUiEvent::STEP_FINISHED {
            step_name: "plan".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "STEP_FINISHED");
    }

    #[test]
    fn test_text_message_events_serialization() {
        let ev = AgUiEvent::TEXT_MESSAGE_START {
            message_id: "m-1".into(),
            role: "assistant".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TEXT_MESSAGE_START");
        assert_eq!(json["role"], "assistant");

        let ev = AgUiEvent::TEXT_MESSAGE_CONTENT {
            message_id: "m-1".into(),
            delta: "Hello".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TEXT_MESSAGE_CONTENT");
        assert_eq!(json["delta"], "Hello");

        let ev = AgUiEvent::TEXT_MESSAGE_END {
            message_id: "m-1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TEXT_MESSAGE_END");
    }

    #[test]
    fn test_tool_call_events_serialization() {
        let ev = AgUiEvent::TOOL_CALL_START {
            tool_call_id: "tc-1".into(),
            tool_call_name: "shell".into(),
            parent_message_id: Some("m-1".into()),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TOOL_CALL_START");
        assert_eq!(json["tool_call_name"], "shell");
        assert_eq!(json["parent_message_id"], "m-1");

        let ev = AgUiEvent::TOOL_CALL_ARGS {
            tool_call_id: "tc-1".into(),
            delta: r#"{"cmd":"ls"}"#.into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TOOL_CALL_ARGS");

        let ev = AgUiEvent::TOOL_CALL_END {
            tool_call_id: "tc-1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TOOL_CALL_END");

        let ev = AgUiEvent::TOOL_CALL_RESULT {
            message_id: "m-2".into(),
            tool_call_id: "tc-1".into(),
            content: "file1.txt\nfile2.txt".into(),
            role: Some("tool".into()),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "TOOL_CALL_RESULT");
        assert_eq!(json["role"], "tool");
    }

    #[test]
    fn test_state_events_serialization() {
        let ev = AgUiEvent::STATE_SNAPSHOT {
            snapshot: serde_json::json!({"status": "idle"}),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "STATE_SNAPSHOT");
        assert_eq!(json["snapshot"]["status"], "idle");

        let ev = AgUiEvent::STATE_DELTA {
            delta: vec![JsonPatchOp {
                op: "replace".into(),
                path: "/status".into(),
                value: Some(serde_json::json!("thinking")),
                from: None,
            }],
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "STATE_DELTA");
        assert_eq!(json["delta"][0]["op"], "replace");
        assert_eq!(json["delta"][0]["path"], "/status");

        let ev = AgUiEvent::MESSAGES_SNAPSHOT {
            messages: vec![serde_json::json!({"role": "user", "content": "hi"})],
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "MESSAGES_SNAPSHOT");
        assert_eq!(json["messages"][0]["role"], "user");
    }

    #[test]
    fn test_activity_events_serialization() {
        let ev = AgUiEvent::ACTIVITY_SNAPSHOT {
            message_id: "a-1".into(),
            activity_type: "task_update".into(),
            content: serde_json::json!({"title": "Fix bug"}),
            replace: Some(true),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "ACTIVITY_SNAPSHOT");
        assert_eq!(json["replace"], true);

        let ev = AgUiEvent::ACTIVITY_DELTA {
            message_id: "a-1".into(),
            activity_type: "task_update".into(),
            patch: vec![JsonPatchOp {
                op: "replace".into(),
                path: "/progress".into(),
                value: Some(serde_json::json!(0.5)),
                from: None,
            }],
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "ACTIVITY_DELTA");
    }

    #[test]
    fn test_reasoning_events_serialization() {
        let ev = AgUiEvent::REASONING_START {
            message_id: "r-1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "REASONING_START");

        let ev = AgUiEvent::REASONING_MESSAGE_START {
            message_id: "r-1".into(),
            role: "assistant".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "REASONING_MESSAGE_START");

        let ev = AgUiEvent::REASONING_MESSAGE_CONTENT {
            message_id: "r-1".into(),
            delta: "thinking...".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "REASONING_MESSAGE_CONTENT");
        assert_eq!(json["delta"], "thinking...");

        let ev = AgUiEvent::REASONING_MESSAGE_END {
            message_id: "r-1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "REASONING_MESSAGE_END");

        let ev = AgUiEvent::REASONING_END {
            message_id: "r-1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "REASONING_END");
    }

    #[test]
    fn test_custom_and_raw_events_serialization() {
        let ev = AgUiEvent::CUSTOM {
            name: "heartbeat".into(),
            value: serde_json::json!({"ts": "2026-02-13T00:00:00Z"}),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "CUSTOM");
        assert_eq!(json["name"], "heartbeat");

        let ev = AgUiEvent::RAW {
            event: serde_json::json!({"raw": true}),
            source: Some("legacy".into()),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "RAW");
        assert_eq!(json["source"], "legacy");

        let ev = AgUiEvent::RAW {
            event: serde_json::json!({}),
            source: None,
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert!(json["source"].is_null());
    }

    // -- JsonPatchOp --------------------------------------------------------

    #[test]
    fn test_json_patch_op_skip_serializing() {
        // `value` and `from` should be absent when None.
        let op = JsonPatchOp {
            op: "remove".into(),
            path: "/old_key".into(),
            value: None,
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        assert!(!json.as_object().unwrap().contains_key("value"));
        assert!(!json.as_object().unwrap().contains_key("from"));

        // `value` present, `from` absent.
        let op = JsonPatchOp {
            op: "add".into(),
            path: "/new_key".into(),
            value: Some(serde_json::json!(42)),
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["value"], 42);
        assert!(!json.as_object().unwrap().contains_key("from"));

        // `from` present (move operation).
        let op = JsonPatchOp {
            op: "move".into(),
            path: "/dest".into(),
            value: None,
            from: Some("/src".into()),
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["from"], "/src");
        assert!(!json.as_object().unwrap().contains_key("value"));
    }

    // -- Bridge function ----------------------------------------------------

    #[test]
    fn test_bridge_agent_status() {
        let legacy = AgentStreamEvent::AgentStatus {
            session_id: "s-1".into(),
            status: "thinking".into(),
            core_type: "structured".into(),
            uptime_seconds: 42,
        };
        let events = bridge_legacy_event(&legacy);
        assert_eq!(events.len(), 1);

        let json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(json["type"], "STATE_SNAPSHOT");
        assert_eq!(json["snapshot"]["session_id"], "s-1");
        assert_eq!(json["snapshot"]["status"], "thinking");
        assert_eq!(json["snapshot"]["core_type"], "structured");
        assert_eq!(json["snapshot"]["uptime_seconds"], 42);
    }

    #[test]
    fn test_bridge_task_update() {
        let legacy = AgentStreamEvent::TaskUpdate {
            task_id: "task-99".into(),
            status: "in_progress".into(),
            title: "Refactor".into(),
            progress: Some(0.5),
        };
        let events = bridge_legacy_event(&legacy);
        assert_eq!(events.len(), 1);

        let json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(json["type"], "ACTIVITY_SNAPSHOT");
        assert_eq!(json["activity_type"], "task_update");
        assert_eq!(json["content"]["task_id"], "task-99");
        assert_eq!(json["content"]["progress"], 0.5);
        assert_eq!(json["replace"], true);
    }

    #[test]
    fn test_bridge_tool_called() {
        let legacy = AgentStreamEvent::ToolCalled {
            tool_name: "developer__shell".into(),
            timestamp: "2026-02-13T00:00:00Z".into(),
            duration_ms: Some(150),
            success: true,
        };
        let events = bridge_legacy_event(&legacy);
        // TOOL_CALL_START + TOOL_CALL_END + CUSTOM metadata
        assert_eq!(events.len(), 3);

        let start_json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(start_json["type"], "TOOL_CALL_START");
        assert_eq!(start_json["tool_call_name"], "developer__shell");

        let end_json = serde_json::to_value(&events[1]).unwrap();
        assert_eq!(end_json["type"], "TOOL_CALL_END");

        // The tool_call_id must match between start and end.
        assert_eq!(
            start_json["tool_call_id"],
            end_json["tool_call_id"]
        );

        let meta_json = serde_json::to_value(&events[2]).unwrap();
        assert_eq!(meta_json["type"], "CUSTOM");
        assert_eq!(meta_json["name"], "tool_call_metadata");
        assert_eq!(meta_json["value"]["success"], true);
        assert_eq!(meta_json["value"]["duration_ms"], 150);
    }

    #[test]
    fn test_bridge_core_switched() {
        let legacy = AgentStreamEvent::CoreSwitched {
            from_core: "freeform".into(),
            to_core: "structured".into(),
            confidence: 0.9,
            reason: "multi-step task".into(),
        };
        let events = bridge_legacy_event(&legacy);
        assert_eq!(events.len(), 1);

        let json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(json["type"], "STATE_DELTA");
        let delta = json["delta"].as_array().unwrap();
        assert_eq!(delta.len(), 2);

        // First op: replace /core_type
        assert_eq!(delta[0]["op"], "replace");
        assert_eq!(delta[0]["path"], "/core_type");
        assert_eq!(delta[0]["value"], "structured");

        // Second op: add /last_core_switch
        assert_eq!(delta[1]["op"], "add");
        assert_eq!(delta[1]["path"], "/last_core_switch");
        assert_eq!(delta[1]["value"]["from_core"], "freeform");
        assert_eq!(delta[1]["value"]["confidence"], 0.9);
    }

    #[test]
    fn test_bridge_experience_recorded() {
        let legacy = AgentStreamEvent::ExperienceRecorded {
            task_summary: "Fixed CI".into(),
            core_type: "freeform".into(),
            outcome: "success".into(),
        };
        let events = bridge_legacy_event(&legacy);
        assert_eq!(events.len(), 1);

        let json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(json["type"], "STATE_DELTA");
        let delta = json["delta"].as_array().unwrap();
        assert_eq!(delta.len(), 1);
        assert_eq!(delta[0]["op"], "add");
        assert_eq!(delta[0]["path"], "/last_experience");
        assert_eq!(delta[0]["value"]["task_summary"], "Fixed CI");
        assert_eq!(delta[0]["value"]["outcome"], "success");
    }

    #[test]
    fn test_bridge_heartbeat() {
        let legacy = AgentStreamEvent::Heartbeat {
            timestamp: "2026-02-13T12:00:00Z".into(),
        };
        let events = bridge_legacy_event(&legacy);
        assert_eq!(events.len(), 1);

        let json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(json["type"], "CUSTOM");
        assert_eq!(json["name"], "heartbeat");
        assert_eq!(json["value"]["timestamp"], "2026-02-13T12:00:00Z");
    }

    // -- SSE formatting -----------------------------------------------------

    #[test]
    fn test_format_ag_ui_sse() {
        let ev = AgUiEvent::CUSTOM {
            name: "heartbeat".into(),
            value: serde_json::json!({"ts": "now"}),
        };
        let frame = format_ag_ui_sse(&ev);
        assert!(frame.starts_with("data: "));
        assert!(frame.ends_with("\n\n"));

        let payload = frame.strip_prefix("data: ").unwrap().trim_end();
        let parsed: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["type"], "CUSTOM");
        assert_eq!(parsed["name"], "heartbeat");
    }

    #[test]
    fn test_ag_ui_event_roundtrip() {
        // Verify that events can be serialized and deserialized back.
        let original = AgUiEvent::STATE_SNAPSHOT {
            snapshot: serde_json::json!({"status": "idle", "core_type": "freeform"}),
        };
        let json_str = serde_json::to_string(&original).unwrap();
        let restored: AgUiEvent = serde_json::from_str(&json_str).unwrap();

        // Re-serialize and compare JSON values.
        let v1 = serde_json::to_value(&original).unwrap();
        let v2 = serde_json::to_value(&restored).unwrap();
        assert_eq!(v1, v2);
    }

    #[test]
    fn test_now_rfc3339() {
        let ts = now_rfc3339();
        assert!(!ts.is_empty());
        let parsed = chrono::DateTime::parse_from_rfc3339(&ts);
        assert!(
            parsed.is_ok(),
            "now_rfc3339() produced unparseable timestamp: {}",
            ts
        );
    }

    // ===================================================================
    // Exhaustive type tag verification
    // ===================================================================

    /// Verify that every single `AgUiEvent` variant serializes with the
    /// correct `"type"` tag that matches the AG-UI protocol spec.
    #[test]
    fn test_all_event_type_tags_exhaustive() {
        let cases: Vec<(&str, AgUiEvent)> = vec![
            ("RUN_STARTED", AgUiEvent::RUN_STARTED {
                thread_id: "".into(), run_id: "".into(),
            }),
            ("RUN_FINISHED", AgUiEvent::RUN_FINISHED {
                thread_id: "".into(), run_id: "".into(), result: None,
            }),
            ("RUN_ERROR", AgUiEvent::RUN_ERROR {
                message: "".into(), code: None,
            }),
            ("STEP_STARTED", AgUiEvent::STEP_STARTED {
                step_name: "".into(),
            }),
            ("STEP_FINISHED", AgUiEvent::STEP_FINISHED {
                step_name: "".into(),
            }),
            ("TEXT_MESSAGE_START", AgUiEvent::TEXT_MESSAGE_START {
                message_id: "".into(), role: "".into(),
            }),
            ("TEXT_MESSAGE_CONTENT", AgUiEvent::TEXT_MESSAGE_CONTENT {
                message_id: "".into(), delta: "".into(),
            }),
            ("TEXT_MESSAGE_END", AgUiEvent::TEXT_MESSAGE_END {
                message_id: "".into(),
            }),
            ("TOOL_CALL_START", AgUiEvent::TOOL_CALL_START {
                tool_call_id: "".into(), tool_call_name: "".into(),
                parent_message_id: None,
            }),
            ("TOOL_CALL_ARGS", AgUiEvent::TOOL_CALL_ARGS {
                tool_call_id: "".into(), delta: "".into(),
            }),
            ("TOOL_CALL_END", AgUiEvent::TOOL_CALL_END {
                tool_call_id: "".into(),
            }),
            ("TOOL_CALL_RESULT", AgUiEvent::TOOL_CALL_RESULT {
                message_id: "".into(), tool_call_id: "".into(),
                content: "".into(), role: None,
            }),
            ("STATE_SNAPSHOT", AgUiEvent::STATE_SNAPSHOT {
                snapshot: serde_json::json!(null),
            }),
            ("STATE_DELTA", AgUiEvent::STATE_DELTA {
                delta: vec![],
            }),
            ("MESSAGES_SNAPSHOT", AgUiEvent::MESSAGES_SNAPSHOT {
                messages: vec![],
            }),
            ("ACTIVITY_SNAPSHOT", AgUiEvent::ACTIVITY_SNAPSHOT {
                message_id: "".into(), activity_type: "".into(),
                content: serde_json::json!({}), replace: None,
            }),
            ("ACTIVITY_DELTA", AgUiEvent::ACTIVITY_DELTA {
                message_id: "".into(), activity_type: "".into(),
                patch: vec![],
            }),
            ("REASONING_START", AgUiEvent::REASONING_START {
                message_id: "".into(),
            }),
            ("REASONING_MESSAGE_START", AgUiEvent::REASONING_MESSAGE_START {
                message_id: "".into(), role: "".into(),
            }),
            ("REASONING_MESSAGE_CONTENT", AgUiEvent::REASONING_MESSAGE_CONTENT {
                message_id: "".into(), delta: "".into(),
            }),
            ("REASONING_MESSAGE_END", AgUiEvent::REASONING_MESSAGE_END {
                message_id: "".into(),
            }),
            ("REASONING_END", AgUiEvent::REASONING_END {
                message_id: "".into(),
            }),
            ("CUSTOM", AgUiEvent::CUSTOM {
                name: "".into(), value: serde_json::json!(null),
            }),
            ("RAW", AgUiEvent::RAW {
                event: serde_json::json!(null), source: None,
            }),
        ];

        for (expected_tag, event) in &cases {
            let json = serde_json::to_value(event).unwrap();
            assert_eq!(
                json["type"], *expected_tag,
                "Event {:?} should have type tag '{}'",
                event, expected_tag,
            );
        }
        // Ensure we tested every variant (24 total).
        assert_eq!(cases.len(), 24, "Should cover all 24 AgUiEvent variants");
    }

    // ===================================================================
    // Roundtrip serialization (serialize -> deserialize -> compare)
    // ===================================================================

    #[test]
    fn test_roundtrip_run_started() {
        let event = AgUiEvent::RUN_STARTED {
            thread_id: "thread-abc".into(),
            run_id: "run-123".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    #[test]
    fn test_roundtrip_state_delta_with_patches() {
        let event = AgUiEvent::STATE_DELTA {
            delta: vec![
                JsonPatchOp {
                    op: "add".into(),
                    path: "/foo".into(),
                    value: Some(serde_json::json!("bar")),
                    from: None,
                },
                JsonPatchOp {
                    op: "remove".into(),
                    path: "/old_key".into(),
                    value: None,
                    from: None,
                },
            ],
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    #[test]
    fn test_roundtrip_custom_event() {
        let event = AgUiEvent::CUSTOM {
            name: "pipeline_stage".into(),
            value: serde_json::json!({"stage": "build", "progress": 0.5}),
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    #[test]
    fn test_roundtrip_activity_snapshot() {
        let event = AgUiEvent::ACTIVITY_SNAPSHOT {
            message_id: "m-1".into(),
            activity_type: "OTA_BUILD".into(),
            content: serde_json::json!({"phase": "compiling", "elapsed": 30}),
            replace: Some(false),
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    #[test]
    fn test_roundtrip_tool_call_result() {
        let event = AgUiEvent::TOOL_CALL_RESULT {
            message_id: "msg-r".into(),
            tool_call_id: "tc-r".into(),
            content: "result data".into(),
            role: Some("tool".into()),
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    #[test]
    fn test_roundtrip_reasoning_message_content() {
        let event = AgUiEvent::REASONING_MESSAGE_CONTENT {
            message_id: "rm-1".into(),
            delta: "Let me think about this...".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    // ===================================================================
    // JsonPatchOp — detailed serialization tests
    // ===================================================================

    #[test]
    fn test_json_patch_add_op() {
        let op = JsonPatchOp {
            op: "add".into(),
            path: "/new_field".into(),
            value: Some(serde_json::json!(42)),
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["op"], "add");
        assert_eq!(json["path"], "/new_field");
        assert_eq!(json["value"], 42);
        assert!(!json.as_object().unwrap().contains_key("from"));
    }

    #[test]
    fn test_json_patch_remove_op() {
        let op = JsonPatchOp {
            op: "remove".into(),
            path: "/deleted_field".into(),
            value: None,
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["op"], "remove");
        assert_eq!(json["path"], "/deleted_field");
        assert!(!json.as_object().unwrap().contains_key("value"));
        assert!(!json.as_object().unwrap().contains_key("from"));
    }

    #[test]
    fn test_json_patch_replace_op() {
        let op = JsonPatchOp {
            op: "replace".into(),
            path: "/status".into(),
            value: Some(serde_json::json!("active")),
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["op"], "replace");
        assert_eq!(json["path"], "/status");
        assert_eq!(json["value"], "active");
    }

    #[test]
    fn test_json_patch_move_op() {
        let op = JsonPatchOp {
            op: "move".into(),
            path: "/new_location".into(),
            value: None,
            from: Some("/old_location".into()),
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["op"], "move");
        assert_eq!(json["path"], "/new_location");
        assert_eq!(json["from"], "/old_location");
        assert!(!json.as_object().unwrap().contains_key("value"));
    }

    #[test]
    fn test_json_patch_roundtrip() {
        let op = JsonPatchOp {
            op: "replace".into(),
            path: "/core_type".into(),
            value: Some(serde_json::json!("structured")),
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        let restored: JsonPatchOp = serde_json::from_value(json).unwrap();
        assert_eq!(op, restored);
    }

    #[test]
    fn test_json_patch_complex_value() {
        let op = JsonPatchOp {
            op: "add".into(),
            path: "/nested".into(),
            value: Some(serde_json::json!({
                "array": [1, 2, 3],
                "object": {"key": "value"},
                "null_val": null,
            })),
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        assert_eq!(json["value"]["array"][1], 2);
        assert_eq!(json["value"]["object"]["key"], "value");
        assert!(json["value"]["null_val"].is_null());
    }

    // ===================================================================
    // Optional field omission verification
    // ===================================================================

    /// Verify that `Option::None` fields on `JsonPatchOp` are omitted from
    /// JSON output (thanks to `skip_serializing_if`), while `Option::None`
    /// fields on `AgUiEvent` variants serialize as JSON `null` (default
    /// serde behavior without `skip_serializing_if`).
    #[test]
    fn test_optional_fields_serialization_behavior() {
        // JsonPatchOp: value and from are OMITTED when None (has skip_serializing_if).
        let op = JsonPatchOp {
            op: "remove".into(),
            path: "/x".into(),
            value: None,
            from: None,
        };
        let json = serde_json::to_value(&op).unwrap();
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("value"), "JsonPatchOp None value should be omitted");
        assert!(!obj.contains_key("from"), "JsonPatchOp None from should be omitted");

        // AgUiEvent Option fields serialize as null (no skip_serializing_if on enum variants).
        let ev = AgUiEvent::TOOL_CALL_START {
            tool_call_id: "tc".into(),
            tool_call_name: "tool".into(),
            parent_message_id: None,
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert!(
            json["parent_message_id"].is_null(),
            "None parent_message_id serializes as null"
        );

        let ev = AgUiEvent::RUN_ERROR {
            message: "err".into(),
            code: None,
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert!(
            json["code"].is_null(),
            "None code serializes as null"
        );

        let ev = AgUiEvent::RAW {
            event: serde_json::json!({}),
            source: None,
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert!(
            json["source"].is_null(),
            "None source serializes as null"
        );
    }

    // ===================================================================
    // Bridge: comprehensive coverage of all 6 legacy event types
    // ===================================================================

    /// Comprehensive test exercising all 6 legacy `AgentStreamEvent` variants
    /// through the bridge and verifying the correct AG-UI output type(s).
    #[test]
    fn test_bridge_covers_all_legacy_variants() {
        let cases: Vec<(AgentStreamEvent, Vec<&str>)> = vec![
            (
                AgentStreamEvent::AgentStatus {
                    session_id: "s".into(),
                    status: "idle".into(),
                    core_type: "freeform".into(),
                    uptime_seconds: 0,
                },
                vec!["STATE_SNAPSHOT"],
            ),
            (
                AgentStreamEvent::ToolCalled {
                    tool_name: "t".into(),
                    timestamp: "ts".into(),
                    duration_ms: None,
                    success: false,
                },
                vec!["TOOL_CALL_START", "TOOL_CALL_END", "CUSTOM"],
            ),
            (
                AgentStreamEvent::CoreSwitched {
                    from_core: "a".into(),
                    to_core: "b".into(),
                    confidence: 1.0,
                    reason: "r".into(),
                },
                vec!["STATE_DELTA"],
            ),
            (
                AgentStreamEvent::ExperienceRecorded {
                    task_summary: "s".into(),
                    core_type: "c".into(),
                    outcome: "o".into(),
                },
                vec!["STATE_DELTA"],
            ),
            (
                AgentStreamEvent::TaskUpdate {
                    task_id: "t".into(),
                    status: "s".into(),
                    title: "title".into(),
                    progress: None,
                },
                vec!["ACTIVITY_SNAPSHOT"],
            ),
            (
                AgentStreamEvent::Heartbeat {
                    timestamp: "ts".into(),
                },
                vec!["CUSTOM"],
            ),
        ];

        for (legacy, expected_tags) in &cases {
            let events = bridge_legacy_event(legacy);
            assert_eq!(
                events.len(),
                expected_tags.len(),
                "Legacy event {:?} should produce {} AG-UI event(s), got {}",
                legacy, expected_tags.len(), events.len()
            );

            for (event, expected_tag) in events.iter().zip(expected_tags.iter()) {
                let json = serde_json::to_value(event).unwrap();
                assert_eq!(
                    json["type"], *expected_tag,
                    "Expected AG-UI type '{}' for legacy event {:?}",
                    expected_tag, legacy
                );
            }
        }

        // Verify we tested all 6 legacy variants.
        assert_eq!(cases.len(), 6, "Should cover all 6 AgentStreamEvent variants");
    }

    /// Bridge: ToolCalled START and END share the same tool_call_id.
    #[test]
    fn test_bridge_tool_called_ids_match() {
        let legacy = AgentStreamEvent::ToolCalled {
            tool_name: "shell".into(),
            timestamp: "2026-01-01T00:00:00Z".into(),
            duration_ms: Some(100),
            success: true,
        };
        let events = bridge_legacy_event(&legacy);
        let start_json = serde_json::to_value(&events[0]).unwrap();
        let end_json = serde_json::to_value(&events[1]).unwrap();
        let meta_json = serde_json::to_value(&events[2]).unwrap();

        let start_id = start_json["tool_call_id"].as_str().unwrap();
        let end_id = end_json["tool_call_id"].as_str().unwrap();
        let meta_id = meta_json["value"]["tool_call_id"].as_str().unwrap();

        assert_eq!(start_id, end_id, "TOOL_CALL_START and TOOL_CALL_END must share the same tool_call_id");
        assert_eq!(start_id, meta_id, "Metadata CUSTOM event must reference the same tool_call_id");
    }

    /// Bridge: CoreSwitched produces correct JSON Patch structure.
    #[test]
    fn test_bridge_core_switched_patch_structure() {
        let legacy = AgentStreamEvent::CoreSwitched {
            from_core: "freeform".into(),
            to_core: "structured".into(),
            confidence: 0.85,
            reason: "Multi-step refactoring detected".into(),
        };
        let events = bridge_legacy_event(&legacy);
        let json = serde_json::to_value(&events[0]).unwrap();
        let delta = json["delta"].as_array().unwrap();

        // Validate patch op structure matches RFC 6902
        for patch in delta {
            assert!(patch.get("op").is_some(), "Each patch must have 'op'");
            assert!(patch.get("path").is_some(), "Each patch must have 'path'");
            let op_str = patch["op"].as_str().unwrap();
            assert!(
                ["add", "remove", "replace", "move", "copy", "test"].contains(&op_str),
                "Patch op '{}' must be a valid RFC 6902 operation",
                op_str
            );
        }
    }

    /// Bridge: ExperienceRecorded produces a single STATE_DELTA with add op.
    #[test]
    fn test_bridge_experience_recorded_patch_detail() {
        let legacy = AgentStreamEvent::ExperienceRecorded {
            task_summary: "Deployed v2.1".into(),
            core_type: "structured".into(),
            outcome: "success".into(),
        };
        let events = bridge_legacy_event(&legacy);
        assert_eq!(events.len(), 1);

        let json = serde_json::to_value(&events[0]).unwrap();
        assert_eq!(json["type"], "STATE_DELTA");

        let delta = json["delta"].as_array().unwrap();
        assert_eq!(delta.len(), 1);
        assert_eq!(delta[0]["op"], "add");
        assert_eq!(delta[0]["path"], "/last_experience");

        let value = &delta[0]["value"];
        assert_eq!(value["task_summary"], "Deployed v2.1");
        assert_eq!(value["core_type"], "structured");
        assert_eq!(value["outcome"], "success");
    }

    /// Bridge: TaskUpdate with progress=None serializes progress as null.
    #[test]
    fn test_bridge_task_update_null_progress() {
        let legacy = AgentStreamEvent::TaskUpdate {
            task_id: "task-1".into(),
            status: "created".into(),
            title: "New task".into(),
            progress: None,
        };
        let events = bridge_legacy_event(&legacy);
        let json = serde_json::to_value(&events[0]).unwrap();

        assert_eq!(json["type"], "ACTIVITY_SNAPSHOT");
        assert!(json["content"]["progress"].is_null());
    }

    /// Bridge: TaskUpdate with progress=Some serializes correctly.
    #[test]
    fn test_bridge_task_update_with_progress() {
        let legacy = AgentStreamEvent::TaskUpdate {
            task_id: "task-2".into(),
            status: "in_progress".into(),
            title: "Building".into(),
            progress: Some(0.75),
        };
        let events = bridge_legacy_event(&legacy);
        let json = serde_json::to_value(&events[0]).unwrap();

        assert_eq!(json["type"], "ACTIVITY_SNAPSHOT");
        assert_eq!(json["content"]["progress"], 0.75);
        assert_eq!(json["content"]["title"], "Building");
    }

    // -- POST endpoint request deserialization ------------------------------

    #[test]
    fn test_tool_result_request_deserialization() {
        let json = serde_json::json!({
            "toolCallId": "tc-123",
            "content": "{\"approved\": true}"
        });
        let req: ToolResultRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.tool_call_id, "tc-123");
        assert_eq!(req.content, "{\"approved\": true}");
    }

    #[test]
    fn test_send_message_request_deserialization() {
        let json = serde_json::json!({ "content": "Hello agent" });
        let req: SendMessageRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.content, "Hello agent");
    }

    /// SSE frame format: multiple events produce independent frames.
    #[test]
    fn test_format_ag_ui_sse_multiple_events() {
        let events = vec![
            AgUiEvent::RUN_STARTED {
                thread_id: "t".into(),
                run_id: "r".into(),
            },
            AgUiEvent::CUSTOM {
                name: "heartbeat".into(),
                value: serde_json::json!({}),
            },
        ];

        for event in &events {
            let frame = format_ag_ui_sse(event);
            assert!(frame.starts_with("data: "));
            assert!(frame.ends_with("\n\n"));

            let payload = frame
                .strip_prefix("data: ")
                .unwrap()
                .trim_end();
            let parsed: serde_json::Value = serde_json::from_str(payload).unwrap();
            assert!(parsed.get("type").is_some(), "Every frame must have a type tag");
        }
    }
}
