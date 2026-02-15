use crate::routes::agent_stream::AgentStreamEvent;
use crate::state::AppState;
use axum::{
    extract::{rejection::JsonRejection, State},
    http::{self, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
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
use tokio::sync::broadcast;
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
        #[serde(rename = "threadId")]
        thread_id: String,
        #[serde(rename = "runId")]
        run_id: String,
    },
    RUN_FINISHED {
        #[serde(rename = "threadId")]
        thread_id: String,
        #[serde(rename = "runId")]
        run_id: String,
        result: Option<serde_json::Value>,
    },
    RUN_ERROR {
        message: String,
        code: Option<String>,
    },
    RUN_CANCELLED {
        reason: Option<String>,
        timestamp: String,
    },
    STEP_STARTED {
        #[serde(rename = "stepName")]
        step_name: String,
    },
    STEP_FINISHED {
        #[serde(rename = "stepName")]
        step_name: String,
    },

    // -- Text Messages ------------------------------------------------------
    TEXT_MESSAGE_START {
        #[serde(rename = "messageId")]
        message_id: String,
        role: String,
    },
    TEXT_MESSAGE_CONTENT {
        #[serde(rename = "messageId")]
        message_id: String,
        /// Frontend expects `content` (not `delta`) for TEXT_MESSAGE_CONTENT.
        #[serde(rename = "content")]
        delta: String,
    },
    TEXT_MESSAGE_END {
        #[serde(rename = "messageId")]
        message_id: String,
    },

    // -- Tool Calls ---------------------------------------------------------
    TOOL_CALL_START {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolCallName")]
        tool_call_name: String,
        #[serde(rename = "parentMessageId")]
        parent_message_id: Option<String>,
    },
    TOOL_CALL_ARGS {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        /// Frontend expects `args` (not `delta`) for TOOL_CALL_ARGS.
        #[serde(rename = "args")]
        delta: String,
    },
    TOOL_CALL_END {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
    },
    TOOL_CALL_RESULT {
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "toolCallId")]
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
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "activityType")]
        activity_type: String,
        content: serde_json::Value,
        replace: Option<bool>,
    },
    ACTIVITY_DELTA {
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "activityType")]
        activity_type: String,
        patch: Vec<JsonPatchOp>,
    },

    // -- Reasoning ----------------------------------------------------------
    REASONING_START {
        /// Frontend expects `reasoningId` (not `messageId`) for REASONING events.
        #[serde(rename = "reasoningId")]
        message_id: String,
    },
    REASONING_MESSAGE_START {
        #[serde(rename = "messageId")]
        message_id: String,
        role: String,
    },
    REASONING_MESSAGE_CONTENT {
        #[serde(rename = "messageId")]
        message_id: String,
        /// Frontend expects `content` for REASONING_MESSAGE_CONTENT.
        #[serde(rename = "content")]
        delta: String,
    },
    REASONING_MESSAGE_END {
        #[serde(rename = "messageId")]
        message_id: String,
    },
    REASONING_END {
        /// Frontend expects `reasoningId` (not `messageId`) for REASONING events.
        #[serde(rename = "reasoningId")]
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
            .unwrap_or_else(|e| {
                tracing::error!("Failed to build AG-UI SSE response: {}", e);
                http::Response::builder()
                    .status(http::StatusCode::INTERNAL_SERVER_ERROR)
                    .body(axum::body::Body::from("Internal Server Error"))
                    .unwrap()
            })
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Format the current UTC timestamp as an RFC 3339 string.
pub(crate) fn now_rfc3339() -> String {
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
// Event Bus Helpers
// ---------------------------------------------------------------------------

/// Emit an AG-UI event through the broadcast channel.
///
/// This serializes the given `AgUiEvent` as an SSE frame and sends it to all
/// connected SSE clients. Returns `true` if the event was accepted (i.e. at
/// least one subscriber exists), `false` if no subscribers are listening.
///
/// # Example
/// ```ignore
/// emit_ag_ui_event_typed(&state, &AgUiEvent::CUSTOM {
///     name: "my_event".into(),
///     value: serde_json::json!({"key": "value"}),
/// });
/// ```
pub fn emit_ag_ui_event_typed(state: &AppState, event: &AgUiEvent) -> bool {
    let frame = format_ag_ui_sse(event);
    // send() returns Err only when there are no active receivers — that's fine.
    state.event_sender().send(frame).is_ok()
}

/// Emit an AG-UI event through the broadcast channel from raw parts.
///
/// Constructs a `CUSTOM` event with the given `event_type` as the name and
/// `data` as the value, then publishes it. This is a convenience wrapper for
/// callers that don't want to construct a full `AgUiEvent`.
///
/// Returns `true` if the event was sent, `false` if there are no subscribers.
#[allow(dead_code)] // Public API — convenience wrapper for emitting CUSTOM events.
pub fn emit_ag_ui_event(state: &AppState, event_type: &str, data: &serde_json::Value) -> bool {
    let event = AgUiEvent::CUSTOM {
        name: event_type.to_string(),
        value: data.clone(),
    };
    emit_ag_ui_event_typed(state, &event)
}

/// Emit a bridged legacy event through the AG-UI broadcast channel.
///
/// Converts the given `AgentStreamEvent` to AG-UI protocol events using the
/// bridge function, then sends each one through the broadcast channel.
/// Returns the number of events successfully sent.
#[allow(dead_code)] // Public API — bridges legacy AgentStreamEvent to AG-UI and emits via event bus.
pub fn emit_bridged_event(state: &AppState, legacy_event: &AgentStreamEvent) -> usize {
    let ag_ui_events = bridge_legacy_event(legacy_event);
    let mut sent = 0;
    for ev in &ag_ui_events {
        if emit_ag_ui_event_typed(state, ev) {
            sent += 1;
        }
    }
    sent
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// `GET /api/ag-ui/stream`
///
/// Opens a long-lived SSE connection that emits AG-UI protocol events.
///
/// The stream starts with a `STATE_SNAPSHOT` of the current agent state,
/// then multiplexes real AG-UI events (from the broadcast channel) with a
/// keep-alive heartbeat every 2 seconds using `tokio::select!`.
async fn ag_ui_stream(
    State(state): State<Arc<AppState>>,
) -> AgUiSseResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);
    let mut event_rx = state.event_sender().subscribe();

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

        // Multiplex: heartbeat timer + real events from broadcast channel.
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let heartbeat = AgentStreamEvent::Heartbeat {
                        timestamp: now_rfc3339(),
                    };
                    let ag_ui_events = bridge_legacy_event(&heartbeat);
                    for ev in &ag_ui_events {
                        if tx.send(format_ag_ui_sse(ev)).await.is_err() {
                            tracing::debug!("ag-ui-stream client disconnected (heartbeat)");
                            return;
                        }
                    }
                }
                result = event_rx.recv() => {
                    match result {
                        Ok(event_data) => {
                            // event_data is already a formatted SSE frame (data: ...\n\n)
                            if tx.send(event_data).await.is_err() {
                                tracing::debug!("ag-ui-stream client disconnected (event)");
                                return;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!("AG-UI SSE client lagged, dropped {n} events");
                            // Continue receiving — the client missed some events but
                            // can still get future ones.
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            tracing::debug!("AG-UI event bus closed, ending SSE stream");
                            break;
                        }
                    }
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
    /// The tool_call_id that this result belongs to.
    /// Accepts both `tool_call_id` and `toolCallId` (camelCase alias).
    #[serde(alias = "toolCallId")]
    pub tool_call_id: String,
    /// The result value from the tool execution.
    pub result: serde_json::Value,
}

/// Request body for POST /api/ag-ui/abort
#[derive(Debug, Deserialize)]
pub struct AbortRequest {
    /// Optional reason for aborting.
    #[serde(default)]
    pub reason: Option<String>,
}

/// Request body for POST /api/ag-ui/message
#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    /// Optional role override (defaults to "user").
    #[serde(default)]
    pub role: Option<String>,
}

/// JSON response returned by POST endpoints with the emitted event ID.
#[derive(Debug, Serialize)]
pub struct AgUiPostResponse {
    /// Whether the event was successfully emitted to the event bus.
    pub ok: bool,
    /// The unique event/message ID that was emitted.
    pub event_id: String,
}

/// Structured error response for AG-UI POST endpoints.
///
/// Uses a `code` field to determine the HTTP status:
/// - `"BAD_REQUEST"` -> 400 (malformed JSON, missing Content-Type)
/// - `"VALIDATION_ERROR"` -> 422 (empty required field, invalid data)
/// - anything else -> 500
#[derive(Debug, Serialize)]
pub struct AgUiErrorResponse {
    pub error: String,
    pub code: String,
}

impl IntoResponse for AgUiErrorResponse {
    fn into_response(self) -> axum::response::Response {
        let status = match self.code.as_str() {
            "BAD_REQUEST" => StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR" => StatusCode::UNPROCESSABLE_ENTITY,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(self)).into_response()
    }
}

/// Converts an axum `JsonRejection` into a structured `AgUiErrorResponse`.
///
/// All JSON parse/extraction failures are mapped to 400 BAD_REQUEST since
/// the client sent a request that could not be understood.
fn json_rejection_to_error(rejection: JsonRejection) -> AgUiErrorResponse {
    let error = match &rejection {
        JsonRejection::JsonDataError(err) => {
            let msg = err.body_text();
            msg.strip_prefix("Failed to deserialize the JSON body into the target type: ")
                .unwrap_or(&msg)
                .to_string()
        }
        JsonRejection::JsonSyntaxError(err) => {
            format!("Invalid JSON: {}", err.body_text())
        }
        JsonRejection::MissingJsonContentType(_) => {
            "Missing Content-Type: application/json header".to_string()
        }
        JsonRejection::BytesRejection(err) => {
            format!("Failed to read request body: {}", err.body_text())
        }
        _ => rejection.body_text(),
    };
    AgUiErrorResponse {
        error,
        code: "BAD_REQUEST".to_string(),
    }
}

/// Result type for AG-UI POST handlers that can return either a success
/// response or a structured error.
type AgUiPostResult = Result<Json<AgUiPostResponse>, AgUiErrorResponse>;

// ---------------------------------------------------------------------------
// POST Handlers
// ---------------------------------------------------------------------------

/// POST /api/ag-ui/tool-result — receives a tool-call result from the frontend.
///
/// Emits a `TOOL_CALL_RESULT` event followed by a `TOOL_CALL_END` event through
/// the AG-UI event bus. The `TOOL_CALL_RESULT` delivers the result payload, and
/// `TOOL_CALL_END` signals the tool call lifecycle is complete.
///
/// Returns 400 for malformed JSON, 422 for validation errors (empty tool_call_id).
async fn ag_ui_tool_result(
    State(state): State<Arc<AppState>>,
    payload: Result<Json<ToolResultRequest>, JsonRejection>,
) -> AgUiPostResult {
    let Json(payload) = payload.map_err(json_rejection_to_error)?;

    // Validate: tool_call_id must not be empty.
    if payload.tool_call_id.trim().is_empty() {
        return Err(AgUiErrorResponse {
            error: "tool_call_id must not be empty".to_string(),
            code: "VALIDATION_ERROR".to_string(),
        });
    }

    let message_id = format!("msg-tr-{}", uuid::Uuid::new_v4());
    let result_str = serde_json::to_string(&payload.result).unwrap_or_default();

    tracing::info!(
        tool_call_id = %payload.tool_call_id,
        message_id = %message_id,
        result_len = result_str.len(),
        "AG-UI tool-result received, emitting TOOL_CALL_RESULT + TOOL_CALL_END events"
    );

    // Emit TOOL_CALL_RESULT with the tool output.
    let result_event = AgUiEvent::TOOL_CALL_RESULT {
        message_id: message_id.clone(),
        tool_call_id: payload.tool_call_id.clone(),
        content: result_str,
        role: Some("tool".to_string()),
    };
    emit_ag_ui_event_typed(&state, &result_event);

    // Emit TOOL_CALL_END to close the tool call lifecycle.
    let end_event = AgUiEvent::TOOL_CALL_END {
        tool_call_id: payload.tool_call_id,
    };
    let ok = emit_ag_ui_event_typed(&state, &end_event);

    Ok(Json(AgUiPostResponse {
        ok,
        event_id: message_id,
    }))
}

/// POST /api/ag-ui/abort — cancels the current agent run.
///
/// Emits a `RUN_CANCELLED` event followed by a `RUN_FINISHED` event through
/// the AG-UI event bus. The `RUN_CANCELLED` event carries the optional reason,
/// and `RUN_FINISHED` closes the run lifecycle per the AG-UI protocol.
///
/// Returns 400 for malformed JSON.
async fn ag_ui_abort(
    State(state): State<Arc<AppState>>,
    payload: Result<Json<AbortRequest>, JsonRejection>,
) -> AgUiPostResult {
    let Json(payload) = payload.map_err(json_rejection_to_error)?;

    let event_id = format!("abort-{}", uuid::Uuid::new_v4());
    let reason = payload.reason.clone();

    tracing::info!(
        event_id = %event_id,
        reason = ?reason,
        "AG-UI abort requested, emitting RUN_CANCELLED + RUN_FINISHED events"
    );

    // Emit RUN_CANCELLED to signal the run was cancelled.
    let cancelled_event = AgUiEvent::RUN_CANCELLED {
        reason,
        timestamp: now_rfc3339(),
    };
    emit_ag_ui_event_typed(&state, &cancelled_event);

    // Emit RUN_FINISHED to close the run lifecycle.
    let finished_event = AgUiEvent::RUN_FINISHED {
        thread_id: String::new(),
        run_id: event_id.clone(),
        result: None,
    };
    let ok = emit_ag_ui_event_typed(&state, &finished_event);

    Ok(Json(AgUiPostResponse {
        ok,
        event_id,
    }))
}

/// POST /api/ag-ui/message — receives a user message for the agent.
///
/// Emits a complete text message lifecycle (`TEXT_MESSAGE_START` ->
/// `TEXT_MESSAGE_CONTENT` -> `TEXT_MESSAGE_END`) through the AG-UI event bus.
/// This follows the AG-UI protocol's streaming message pattern, delivering
/// the full content in a single delta for non-streaming sources.
///
/// Returns 400 for malformed JSON, 422 for empty content.
async fn ag_ui_message(
    State(state): State<Arc<AppState>>,
    payload: Result<Json<SendMessageRequest>, JsonRejection>,
) -> AgUiPostResult {
    let Json(payload) = payload.map_err(json_rejection_to_error)?;

    // Validate: content must not be empty or whitespace-only.
    if payload.content.trim().is_empty() {
        return Err(AgUiErrorResponse {
            error: "content must not be empty".to_string(),
            code: "VALIDATION_ERROR".to_string(),
        });
    }

    let message_id = format!("msg-{}", uuid::Uuid::new_v4());
    let role = payload.role.unwrap_or_else(|| "user".to_string());

    tracing::info!(
        message_id = %message_id,
        role = %role,
        content_len = payload.content.len(),
        "AG-UI message received, emitting TEXT_MESSAGE lifecycle events"
    );

    // TEXT_MESSAGE_START
    let start_event = AgUiEvent::TEXT_MESSAGE_START {
        message_id: message_id.clone(),
        role: role.clone(),
    };
    emit_ag_ui_event_typed(&state, &start_event);

    // TEXT_MESSAGE_CONTENT (single delta with full content)
    let content_event = AgUiEvent::TEXT_MESSAGE_CONTENT {
        message_id: message_id.clone(),
        delta: payload.content,
    };
    emit_ag_ui_event_typed(&state, &content_event);

    // TEXT_MESSAGE_END
    let end_event = AgUiEvent::TEXT_MESSAGE_END {
        message_id: message_id.clone(),
    };
    let ok = emit_ag_ui_event_typed(&state, &end_event);

    Ok(Json(AgUiPostResponse {
        ok,
        event_id: message_id,
    }))
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
        assert_eq!(json["threadId"], "t-1");
        assert_eq!(json["runId"], "r-1");

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
        assert_eq!(json["content"], "Hello");

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
        assert_eq!(json["toolCallName"], "shell");
        assert_eq!(json["parentMessageId"], "m-1");

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
        assert_eq!(json["content"], "thinking...");

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
        assert_eq!(json["activityType"], "task_update");
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
        assert_eq!(start_json["toolCallName"], "developer__shell");

        let end_json = serde_json::to_value(&events[1]).unwrap();
        assert_eq!(end_json["type"], "TOOL_CALL_END");

        // The tool_call_id must match between start and end.
        assert_eq!(
            start_json["toolCallId"],
            end_json["toolCallId"]
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
            ("RUN_CANCELLED", AgUiEvent::RUN_CANCELLED {
                reason: None, timestamp: "".into(),
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
        // Ensure we tested every variant (25 total).
        assert_eq!(cases.len(), 25, "Should cover all 25 AgUiEvent variants");
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
            json["parentMessageId"].is_null(),
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

        let start_id = start_json["toolCallId"].as_str().unwrap();
        let end_id = end_json["toolCallId"].as_str().unwrap();
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
        // Using snake_case field name
        let json = serde_json::json!({
            "tool_call_id": "tc-123",
            "result": {"approved": true}
        });
        let req: ToolResultRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.tool_call_id, "tc-123");
        assert_eq!(req.result, serde_json::json!({"approved": true}));
    }

    #[test]
    fn test_tool_result_request_deserialization_camel_case() {
        // Using camelCase alias
        let json = serde_json::json!({
            "toolCallId": "tc-456",
            "result": "plain string result"
        });
        let req: ToolResultRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.tool_call_id, "tc-456");
        assert_eq!(req.result, serde_json::json!("plain string result"));
    }

    #[test]
    fn test_send_message_request_deserialization() {
        let json = serde_json::json!({ "content": "Hello agent" });
        let req: SendMessageRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.content, "Hello agent");
        assert!(req.role.is_none(), "role should default to None when omitted");
    }

    #[test]
    fn test_send_message_request_with_role() {
        let json = serde_json::json!({ "content": "System init", "role": "system" });
        let req: SendMessageRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.content, "System init");
        assert_eq!(req.role.as_deref(), Some("system"));
    }

    #[test]
    fn test_abort_request_deserialization_empty() {
        let json = serde_json::json!({});
        let req: AbortRequest = serde_json::from_value(json).unwrap();
        assert!(req.reason.is_none());
    }

    #[test]
    fn test_abort_request_deserialization_with_reason() {
        let json = serde_json::json!({
            "reason": "User cancelled"
        });
        let req: AbortRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.reason.as_deref(), Some("User cancelled"));
    }

    #[test]
    fn test_ag_ui_post_response_serialization() {
        let resp = AgUiPostResponse {
            ok: true,
            event_id: "msg-abc-123".to_string(),
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["event_id"], "msg-abc-123");
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

    // ===================================================================
    // Broadcast channel / event bus integration tests
    // ===================================================================

    /// Verify that the broadcast channel can send and receive serialized AG-UI events.
    #[test]
    fn test_broadcast_channel_basic_send_recv() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let event = AgUiEvent::CUSTOM {
            name: "test_event".into(),
            value: serde_json::json!({"key": "value"}),
        };
        let frame = format_ag_ui_sse(&event);

        tx.send(frame.clone()).unwrap();
        let received = rx.try_recv().unwrap();
        assert_eq!(received, frame);

        // Parse the received frame back to verify JSON integrity.
        let payload = received.strip_prefix("data: ").unwrap().trim_end();
        let parsed: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["type"], "CUSTOM");
        assert_eq!(parsed["name"], "test_event");
        assert_eq!(parsed["value"]["key"], "value");
    }

    /// Verify multiple subscribers receive the same event.
    #[test]
    fn test_broadcast_channel_multiple_subscribers() {
        let (tx, mut rx1) = tokio::sync::broadcast::channel::<String>(16);
        let mut rx2 = tx.subscribe();

        let event = AgUiEvent::RUN_STARTED {
            thread_id: "t-1".into(),
            run_id: "r-1".into(),
        };
        let frame = format_ag_ui_sse(&event);

        tx.send(frame.clone()).unwrap();

        let recv1 = rx1.try_recv().unwrap();
        let recv2 = rx2.try_recv().unwrap();
        assert_eq!(recv1, recv2);
        assert_eq!(recv1, frame);
    }

    /// Verify that the broadcast channel correctly reports lagged receivers.
    #[test]
    fn test_broadcast_channel_lagged_receiver() {
        // Create a channel with capacity 2
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(2);

        // Send 3 events — the first one will be dropped for the receiver
        tx.send("event-1".into()).unwrap();
        tx.send("event-2".into()).unwrap();
        tx.send("event-3".into()).unwrap();

        // Receiver should get a Lagged error for the dropped event(s)
        match rx.try_recv() {
            Err(broadcast::error::TryRecvError::Lagged(n)) => {
                assert!(n >= 1, "Should report at least 1 lagged event, got {n}");
            }
            other => panic!("Expected Lagged error, got {:?}", other),
        }

        // After the lagged error, remaining events should be receivable
        let _received = rx.try_recv().unwrap();
    }

    /// Verify that sending to a channel with no receivers returns false (no panic).
    #[test]
    fn test_broadcast_channel_no_receivers() {
        let (tx, _) = tokio::sync::broadcast::channel::<String>(16);
        // Drop the initial receiver by not binding it.
        // Sending should not panic — it returns Err when no receivers exist.
        let result = tx.send("event".into());
        assert!(result.is_err(), "send() should fail when no receivers exist");
    }

    /// Test `emit_ag_ui_event` helper produces correct CUSTOM event.
    #[test]
    fn test_emit_ag_ui_event_helper() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);
        // We need a minimal "state-like" struct that holds the sender.
        // Since emit_ag_ui_event takes &AppState, we test the logic directly
        // by constructing the event and sending through the channel.
        let event = AgUiEvent::CUSTOM {
            name: "deploy_started".to_string(),
            value: serde_json::json!({"environment": "staging"}),
        };
        let frame = format_ag_ui_sse(&event);
        tx.send(frame).unwrap();

        let received = rx.try_recv().unwrap();
        let payload = received.strip_prefix("data: ").unwrap().trim_end();
        let parsed: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["type"], "CUSTOM");
        assert_eq!(parsed["name"], "deploy_started");
        assert_eq!(parsed["value"]["environment"], "staging");
    }

    /// Test `emit_ag_ui_event_typed` with a complex event.
    #[test]
    fn test_emit_typed_event_state_snapshot() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let event = AgUiEvent::STATE_SNAPSHOT {
            snapshot: serde_json::json!({
                "status": "thinking",
                "core_type": "structured",
                "uptime_seconds": 42
            }),
        };
        let frame = format_ag_ui_sse(&event);
        tx.send(frame).unwrap();

        let received = rx.try_recv().unwrap();
        let payload = received.strip_prefix("data: ").unwrap().trim_end();
        let parsed: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["type"], "STATE_SNAPSHOT");
        assert_eq!(parsed["snapshot"]["status"], "thinking");
        assert_eq!(parsed["snapshot"]["uptime_seconds"], 42);
    }

    /// Test `emit_bridged_event` logic: bridge a legacy event and verify the
    /// serialized AG-UI output through the broadcast channel.
    #[test]
    fn test_emit_bridged_event_tool_called() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let legacy = AgentStreamEvent::ToolCalled {
            tool_name: "developer__shell".into(),
            timestamp: "2026-02-14T00:00:00Z".into(),
            duration_ms: Some(200),
            success: true,
        };

        // Simulate what emit_bridged_event does
        let ag_ui_events = bridge_legacy_event(&legacy);
        for ev in &ag_ui_events {
            tx.send(format_ag_ui_sse(ev)).unwrap();
        }

        // Should receive 3 events: TOOL_CALL_START, TOOL_CALL_END, CUSTOM (metadata)
        let frame1 = rx.try_recv().unwrap();
        let frame2 = rx.try_recv().unwrap();
        let frame3 = rx.try_recv().unwrap();

        let p1: serde_json::Value = serde_json::from_str(
            frame1.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        let p3: serde_json::Value = serde_json::from_str(
            frame3.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();

        assert_eq!(p1["type"], "TOOL_CALL_START");
        assert_eq!(p1["toolCallName"], "developer__shell");
        assert_eq!(p2["type"], "TOOL_CALL_END");
        assert_eq!(p3["type"], "CUSTOM");
        assert_eq!(p3["name"], "tool_call_metadata");
        assert_eq!(p3["value"]["success"], true);
        assert_eq!(p3["value"]["duration_ms"], 200);
    }

    /// Test bridged heartbeat through broadcast channel.
    #[test]
    fn test_emit_bridged_heartbeat() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let legacy = AgentStreamEvent::Heartbeat {
            timestamp: "2026-02-14T12:00:00Z".into(),
        };

        let ag_ui_events = bridge_legacy_event(&legacy);
        for ev in &ag_ui_events {
            tx.send(format_ag_ui_sse(ev)).unwrap();
        }

        let frame = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "CUSTOM");
        assert_eq!(parsed["name"], "heartbeat");
        assert_eq!(parsed["value"]["timestamp"], "2026-02-14T12:00:00Z");
    }

    /// Verify event ordering is preserved through broadcast channel.
    #[test]
    fn test_broadcast_preserves_event_order() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let events = vec![
            AgUiEvent::RUN_STARTED { thread_id: "t".into(), run_id: "r".into() },
            AgUiEvent::STEP_STARTED { step_name: "plan".into() },
            AgUiEvent::TEXT_MESSAGE_START { message_id: "m".into(), role: "assistant".into() },
            AgUiEvent::TEXT_MESSAGE_CONTENT { message_id: "m".into(), delta: "Hello".into() },
            AgUiEvent::TEXT_MESSAGE_END { message_id: "m".into() },
            AgUiEvent::STEP_FINISHED { step_name: "plan".into() },
            AgUiEvent::RUN_FINISHED { thread_id: "t".into(), run_id: "r".into(), result: None },
        ];

        let expected_types = vec![
            "RUN_STARTED", "STEP_STARTED", "TEXT_MESSAGE_START",
            "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "STEP_FINISHED",
            "RUN_FINISHED",
        ];

        for ev in &events {
            tx.send(format_ag_ui_sse(ev)).unwrap();
        }

        for expected_type in &expected_types {
            let frame = rx.try_recv().unwrap();
            let parsed: serde_json::Value = serde_json::from_str(
                frame.strip_prefix("data: ").unwrap().trim_end()
            ).unwrap();
            assert_eq!(
                parsed["type"], *expected_type,
                "Event order mismatch: expected {}, got {}",
                expected_type, parsed["type"]
            );
        }
    }

    // ===================================================================
    // POST endpoint event emission tests
    // ===================================================================
    //
    // These tests verify that the wired POST handlers produce the correct
    // AG-UI events through the broadcast channel. Since the handlers
    // require `State<Arc<AppState>>`, we test the event emission logic
    // directly by constructing events the way the handlers do and
    // verifying them through the channel.

    /// Simulate the tool-result handler: emits TOOL_CALL_RESULT + TOOL_CALL_END.
    #[test]
    fn test_tool_result_handler_emits_correct_events() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        // Simulate what ag_ui_tool_result does
        let message_id = "msg-tr-test-001".to_string();
        let tool_call_id = "tc-456".to_string();
        let result = serde_json::json!({"approved": true});
        let result_str = serde_json::to_string(&result).unwrap_or_default();

        let result_event = AgUiEvent::TOOL_CALL_RESULT {
            message_id: message_id.clone(),
            tool_call_id: tool_call_id.clone(),
            content: result_str,
            role: Some("tool".to_string()),
        };
        tx.send(format_ag_ui_sse(&result_event)).unwrap();

        let end_event = AgUiEvent::TOOL_CALL_END {
            tool_call_id: tool_call_id.clone(),
        };
        tx.send(format_ag_ui_sse(&end_event)).unwrap();

        // Verify TOOL_CALL_RESULT event
        let frame1 = rx.try_recv().unwrap();
        let p1: serde_json::Value = serde_json::from_str(
            frame1.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p1["type"], "TOOL_CALL_RESULT");
        assert_eq!(p1["messageId"], "msg-tr-test-001");
        assert_eq!(p1["toolCallId"], "tc-456");
        assert_eq!(p1["role"], "tool");

        // Verify TOOL_CALL_END event
        let frame2 = rx.try_recv().unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p2["type"], "TOOL_CALL_END");
        assert_eq!(p2["toolCallId"], "tc-456");
    }

    /// Simulate the abort handler: emits a single RUN_CANCELLED event.
    #[test]
    fn test_abort_handler_emits_run_cancelled_event() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        // Simulate what ag_ui_abort does
        let reason = Some("User cancelled".to_string());
        let timestamp = "2026-02-14T00:00:00Z".to_string();

        let cancelled_event = AgUiEvent::RUN_CANCELLED {
            reason: reason.clone(),
            timestamp: timestamp.clone(),
        };
        tx.send(format_ag_ui_sse(&cancelled_event)).unwrap();

        // Verify RUN_CANCELLED event
        let frame = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "RUN_CANCELLED");
        assert_eq!(parsed["reason"], "User cancelled");
        assert_eq!(parsed["timestamp"], "2026-02-14T00:00:00Z");
    }

    /// Simulate the abort handler with no reason: emits RUN_CANCELLED with null reason.
    #[test]
    fn test_abort_handler_emits_run_cancelled_no_reason() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let cancelled_event = AgUiEvent::RUN_CANCELLED {
            reason: None,
            timestamp: "2026-02-14T00:00:00Z".to_string(),
        };
        tx.send(format_ag_ui_sse(&cancelled_event)).unwrap();

        let frame = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "RUN_CANCELLED");
        assert!(parsed["reason"].is_null());
        assert!(parsed["timestamp"].is_string());
    }

    /// Simulate the message handler: emits TEXT_MESSAGE_START + CONTENT + END.
    #[test]
    fn test_message_handler_emits_text_message_lifecycle() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        // Simulate what ag_ui_message does
        let message_id = "msg-test-001".to_string();
        let role = "user".to_string();
        let content = "Hello, agent!".to_string();

        let start_event = AgUiEvent::TEXT_MESSAGE_START {
            message_id: message_id.clone(),
            role: role.clone(),
        };
        tx.send(format_ag_ui_sse(&start_event)).unwrap();

        let content_event = AgUiEvent::TEXT_MESSAGE_CONTENT {
            message_id: message_id.clone(),
            delta: content.clone(),
        };
        tx.send(format_ag_ui_sse(&content_event)).unwrap();

        let end_event = AgUiEvent::TEXT_MESSAGE_END {
            message_id: message_id.clone(),
        };
        tx.send(format_ag_ui_sse(&end_event)).unwrap();

        // Verify TEXT_MESSAGE_START
        let frame1 = rx.try_recv().unwrap();
        let p1: serde_json::Value = serde_json::from_str(
            frame1.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p1["type"], "TEXT_MESSAGE_START");
        assert_eq!(p1["messageId"], "msg-test-001");
        assert_eq!(p1["role"], "user");

        // Verify TEXT_MESSAGE_CONTENT
        let frame2 = rx.try_recv().unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p2["type"], "TEXT_MESSAGE_CONTENT");
        assert_eq!(p2["messageId"], "msg-test-001");
        assert_eq!(p2["content"], "Hello, agent!");

        // Verify TEXT_MESSAGE_END
        let frame3 = rx.try_recv().unwrap();
        let p3: serde_json::Value = serde_json::from_str(
            frame3.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p3["type"], "TEXT_MESSAGE_END");
        assert_eq!(p3["messageId"], "msg-test-001");
    }

    /// Verify that all three message lifecycle events share the same message_id.
    #[test]
    fn test_message_handler_consistent_message_ids() {
        let (tx, mut rx) = tokio::sync::broadcast::channel::<String>(16);

        let message_id = "msg-consistent-test".to_string();

        let events = vec![
            AgUiEvent::TEXT_MESSAGE_START {
                message_id: message_id.clone(),
                role: "user".into(),
            },
            AgUiEvent::TEXT_MESSAGE_CONTENT {
                message_id: message_id.clone(),
                delta: "test content".into(),
            },
            AgUiEvent::TEXT_MESSAGE_END {
                message_id: message_id.clone(),
            },
        ];

        for ev in &events {
            tx.send(format_ag_ui_sse(ev)).unwrap();
        }

        let mut received_ids = Vec::new();
        for _ in 0..3 {
            let frame = rx.try_recv().unwrap();
            let parsed: serde_json::Value = serde_json::from_str(
                frame.strip_prefix("data: ").unwrap().trim_end()
            ).unwrap();
            received_ids.push(parsed["messageId"].as_str().unwrap().to_string());
        }

        assert_eq!(received_ids[0], received_ids[1]);
        assert_eq!(received_ids[1], received_ids[2]);
        assert_eq!(received_ids[0], "msg-consistent-test");
    }

    /// Verify the message handler default role is "user" when role is None.
    #[test]
    fn test_message_handler_default_role_is_user() {
        let req = SendMessageRequest {
            content: "hello".into(),
            role: None,
        };
        let role = req.role.unwrap_or_else(|| "user".to_string());
        assert_eq!(role, "user");
    }

    /// Verify abort with explicit reason passes it through.
    #[test]
    fn test_abort_handler_uses_provided_reason() {
        let req = AbortRequest {
            reason: Some("Testing abort".into()),
        };
        assert_eq!(req.reason.as_deref(), Some("Testing abort"));
    }

    /// Verify abort without reason defaults to None.
    #[test]
    fn test_abort_handler_reason_defaults_to_none() {
        let req = AbortRequest {
            reason: None,
        };
        assert!(req.reason.is_none());
    }

    // ===================================================================
    // RUN_CANCELLED event serialization / roundtrip
    // ===================================================================

    #[test]
    fn test_run_cancelled_event_serialization() {
        let ev = AgUiEvent::RUN_CANCELLED {
            reason: Some("User requested abort".into()),
            timestamp: "2026-02-14T12:00:00Z".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "RUN_CANCELLED");
        assert_eq!(json["reason"], "User requested abort");
        assert_eq!(json["timestamp"], "2026-02-14T12:00:00Z");
    }

    #[test]
    fn test_run_cancelled_event_no_reason() {
        let ev = AgUiEvent::RUN_CANCELLED {
            reason: None,
            timestamp: "2026-02-14T12:00:00Z".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "RUN_CANCELLED");
        assert!(json["reason"].is_null());
    }

    #[test]
    fn test_roundtrip_run_cancelled() {
        let event = AgUiEvent::RUN_CANCELLED {
            reason: Some("timeout".into()),
            timestamp: "2026-02-14T12:00:00Z".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        let restored: AgUiEvent = serde_json::from_value(json).unwrap();
        assert_eq!(event, restored);
    }

    // ===================================================================
    // Axum integration tests — call handlers through the router with
    // tower::ServiceExt::oneshot and verify both HTTP responses and
    // events on the broadcast channel.
    // ===================================================================

    #[tokio::test(flavor = "multi_thread")]
    async fn test_post_tool_result_integration() {
        let state = AppState::new().await.unwrap();
        let mut event_rx = state.event_sender().subscribe();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/tool-result")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "tool_call_id": "tc-integration-001",
                    "result": {"output": "success", "code": 0}
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(response.status(), http::StatusCode::OK);

        // Parse the response body.
        let body_bytes = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
        let resp: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(resp["ok"], true);
        assert!(resp["event_id"].as_str().unwrap().starts_with("msg-tr-"));

        // Verify events arrived on the broadcast channel.
        // Event 1: TOOL_CALL_RESULT
        let frame1 = event_rx.try_recv().unwrap();
        let p1: serde_json::Value = serde_json::from_str(
            frame1.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p1["type"], "TOOL_CALL_RESULT");
        assert_eq!(p1["toolCallId"], "tc-integration-001");
        assert_eq!(p1["role"], "tool");

        // Event 2: TOOL_CALL_END
        let frame2 = event_rx.try_recv().unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p2["type"], "TOOL_CALL_END");
        assert_eq!(p2["toolCallId"], "tc-integration-001");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_post_abort_integration() {
        let state = AppState::new().await.unwrap();
        let mut event_rx = state.event_sender().subscribe();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/abort")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "reason": "User pressed stop"
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(response.status(), http::StatusCode::OK);

        // Parse the response body.
        let body_bytes = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
        let resp: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(resp["ok"], true);
        assert!(resp["event_id"].as_str().unwrap().starts_with("abort-"));

        // Verify RUN_CANCELLED event arrived on the broadcast channel.
        let frame = event_rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "RUN_CANCELLED");
        assert_eq!(parsed["reason"], "User pressed stop");
        assert!(parsed["timestamp"].as_str().is_some());

        // Verify RUN_FINISHED event closes the run lifecycle.
        let frame2 = event_rx.try_recv().unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p2["type"], "RUN_FINISHED");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_post_message_integration() {
        let state = AppState::new().await.unwrap();
        let mut event_rx = state.event_sender().subscribe();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/message")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "content": "Hello, agent!",
                    "role": "user"
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(response.status(), http::StatusCode::OK);

        // Parse the response body.
        let body_bytes = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
        let resp: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(resp["ok"], true);
        assert!(resp["event_id"].as_str().unwrap().starts_with("msg-"));

        let message_id = resp["event_id"].as_str().unwrap();

        // Verify TEXT_MESSAGE_START
        let frame1 = event_rx.try_recv().unwrap();
        let p1: serde_json::Value = serde_json::from_str(
            frame1.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p1["type"], "TEXT_MESSAGE_START");
        assert_eq!(p1["messageId"], message_id);
        assert_eq!(p1["role"], "user");

        // Verify TEXT_MESSAGE_CONTENT
        let frame2 = event_rx.try_recv().unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p2["type"], "TEXT_MESSAGE_CONTENT");
        assert_eq!(p2["messageId"], message_id);
        assert_eq!(p2["content"], "Hello, agent!");

        // Verify TEXT_MESSAGE_END
        let frame3 = event_rx.try_recv().unwrap();
        let p3: serde_json::Value = serde_json::from_str(
            frame3.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p3["type"], "TEXT_MESSAGE_END");
        assert_eq!(p3["messageId"], message_id);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_post_abort_empty_body_integration() {
        let state = AppState::new().await.unwrap();
        let mut event_rx = state.event_sender().subscribe();
        let app = routes(state);

        // Empty JSON body — reason should be None
        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/abort")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from("{}"))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(response.status(), http::StatusCode::OK);

        let frame = event_rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "RUN_CANCELLED");
        assert!(parsed["reason"].is_null(), "reason should be null when not provided");

        // RUN_FINISHED also emitted.
        let frame2 = event_rx.try_recv().unwrap();
        let p2: serde_json::Value = serde_json::from_str(
            frame2.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(p2["type"], "RUN_FINISHED");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_post_message_default_role_integration() {
        let state = AppState::new().await.unwrap();
        let mut event_rx = state.event_sender().subscribe();
        let app = routes(state);

        // Omit role — should default to "user"
        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/message")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "content": "No role provided"
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(response.status(), http::StatusCode::OK);

        // Verify TEXT_MESSAGE_START has role "user" (the default)
        let frame = event_rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "TEXT_MESSAGE_START");
        assert_eq!(parsed["role"], "user");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_post_tool_result_camel_case_integration() {
        let state = AppState::new().await.unwrap();
        let mut event_rx = state.event_sender().subscribe();
        let app = routes(state);

        // Use camelCase toolCallId alias
        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/tool-result")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "toolCallId": "tc-camel-001",
                    "result": "simple string result"
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(response.status(), http::StatusCode::OK);

        // Verify TOOL_CALL_RESULT uses the correct tool_call_id
        let frame = event_rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(
            frame.strip_prefix("data: ").unwrap().trim_end()
        ).unwrap();
        assert_eq!(parsed["type"], "TOOL_CALL_RESULT");
        assert_eq!(parsed["toolCallId"], "tc-camel-001");
    }

    // ===================================================================
    // Error handling and validation tests
    // ===================================================================

    #[tokio::test(flavor = "multi_thread")]
    async fn test_tool_result_malformed_json_returns_400() {
        let state = AppState::new().await.unwrap();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/tool-result")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from("not json"))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(
            response.status(),
            http::StatusCode::BAD_REQUEST,
            "Malformed JSON should return 400"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_tool_result_missing_field_returns_400() {
        let state = AppState::new().await.unwrap();
        let app = routes(state);

        // Missing 'result' field — deserialization should fail.
        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/tool-result")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({ "tool_call_id": "tc-1" })).unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(
            response.status(),
            http::StatusCode::BAD_REQUEST,
            "Missing required field should return 400"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_tool_result_empty_tool_call_id_returns_422() {
        let state = AppState::new().await.unwrap();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/tool-result")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "tool_call_id": "  ",
                    "result": "ok"
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(
            response.status(),
            http::StatusCode::UNPROCESSABLE_ENTITY,
            "Empty tool_call_id should return 422"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_abort_malformed_json_returns_400() {
        let state = AppState::new().await.unwrap();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/abort")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from("{broken"))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(
            response.status(),
            http::StatusCode::BAD_REQUEST,
            "Malformed JSON should return 400"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_message_missing_content_returns_400() {
        let state = AppState::new().await.unwrap();
        let app = routes(state);

        // Missing required 'content' field — deserialization should fail.
        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/message")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({ "role": "user" })).unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(
            response.status(),
            http::StatusCode::BAD_REQUEST,
            "Missing required field should return 400"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_message_empty_content_returns_422() {
        let state = AppState::new().await.unwrap();
        let app = routes(state);

        let request = axum::http::Request::builder()
            .uri("/api/ag-ui/message")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_string(&serde_json::json!({
                    "content": "   ",
                    "role": "user"
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = tower::ServiceExt::oneshot(app, request).await.unwrap();
        assert_eq!(
            response.status(),
            http::StatusCode::UNPROCESSABLE_ENTITY,
            "Empty/whitespace content should return 422"
        );
    }

    #[test]
    fn test_ag_ui_error_response_serialization() {
        let err = AgUiErrorResponse {
            error: "test error".to_string(),
            code: "BAD_REQUEST".to_string(),
        };
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["error"], "test error");
        assert_eq!(json["code"], "BAD_REQUEST");
    }
}
