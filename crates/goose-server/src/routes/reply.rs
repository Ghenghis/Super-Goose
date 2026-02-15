use crate::routes::ag_ui_stream::{emit_ag_ui_event_typed, now_rfc3339, AgUiEvent, JsonPatchOp};
use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
#[cfg(test)]
use axum::http::StatusCode;
use axum::{
    extract::{DefaultBodyLimit, State},
    http::{self},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use bytes::Bytes;
use futures::{stream::StreamExt, Stream};
use goose::agents::{AgentEvent, SessionConfig};
use goose::conversation::message::{Message, MessageContent, TokenState};
use goose::conversation::Conversation;
use goose::session::SessionManager;
use rmcp::model::ServerNotification;
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::mpsc;
use tokio::time::timeout;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

// ---------------------------------------------------------------------------
// AG-UI event emission helpers
// ---------------------------------------------------------------------------

/// Emit AG-UI events corresponding to a single `MessageContent` item.
///
/// Maps goose message content types to the AG-UI protocol event lifecycle:
/// - `Text` -> `TEXT_MESSAGE_START` + `TEXT_MESSAGE_CONTENT` + `TEXT_MESSAGE_END`
/// - `ToolRequest` -> `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END`
/// - `ToolResponse` -> `TOOL_CALL_RESULT`
/// - `Thinking` -> `CUSTOM { name: "thinking" }`
fn emit_ag_ui_for_content(state: &AppState, content: &MessageContent, parent_msg_id: &str) {
    match content {
        MessageContent::Text(text_content) => {
            let msg_id = format!("agui-txt-{}", uuid::Uuid::new_v4());
            emit_ag_ui_event_typed(state, &AgUiEvent::TEXT_MESSAGE_START {
                message_id: msg_id.clone(),
                role: "assistant".to_string(),
            });
            emit_ag_ui_event_typed(state, &AgUiEvent::TEXT_MESSAGE_CONTENT {
                message_id: msg_id.clone(),
                delta: text_content.text.to_string(),
            });
            emit_ag_ui_event_typed(state, &AgUiEvent::TEXT_MESSAGE_END {
                message_id: msg_id,
            });
        }
        MessageContent::ToolRequest(tool_req) => {
            let tool_call_id = format!("agui-tc-{}", tool_req.id);
            let tool_name = tool_req
                .tool_call
                .as_ref()
                .map(|tc| tc.name.to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            let tool_args = tool_req
                .tool_call
                .as_ref()
                .map(|tc| {
                    tc.arguments
                        .as_ref()
                        .map(|a| serde_json::to_string(a).unwrap_or_default())
                        .unwrap_or_default()
                })
                .unwrap_or_else(|_| String::new());

            emit_ag_ui_event_typed(state, &AgUiEvent::TOOL_CALL_START {
                tool_call_id: tool_call_id.clone(),
                tool_call_name: tool_name,
                parent_message_id: Some(parent_msg_id.to_string()),
            });
            if !tool_args.is_empty() {
                emit_ag_ui_event_typed(state, &AgUiEvent::TOOL_CALL_ARGS {
                    tool_call_id: tool_call_id.clone(),
                    delta: tool_args,
                });
            }
            emit_ag_ui_event_typed(state, &AgUiEvent::TOOL_CALL_END {
                tool_call_id,
            });
        }
        MessageContent::ToolResponse(tool_resp) => {
            let content_str = match &tool_resp.tool_result {
                Ok(result) => {
                    // CallToolResult has a `content` field
                    serde_json::to_string(result).unwrap_or_else(|_| "OK".to_string())
                }
                Err(e) => format!("Error: {}", e),
            };
            emit_ag_ui_event_typed(state, &AgUiEvent::TOOL_CALL_RESULT {
                message_id: format!("agui-tr-{}", uuid::Uuid::new_v4()),
                tool_call_id: format!("agui-tc-{}", tool_resp.id),
                content: content_str,
                role: Some("tool".to_string()),
            });
        }
        MessageContent::Thinking(thinking) => {
            let msg_id = format!("agui-think-{}", uuid::Uuid::new_v4());
            emit_ag_ui_event_typed(state, &AgUiEvent::CUSTOM {
                name: "thinking".to_string(),
                value: serde_json::json!({
                    "message_id": msg_id,
                    "content": thinking.thinking,
                }),
            });
        }
        // Other content types (Image, ToolConfirmationRequest, ActionRequired, etc.)
        // emit a generic CUSTOM event so the AG-UI stream is aware of them.
        _ => {
            emit_ag_ui_event_typed(state, &AgUiEvent::CUSTOM {
                name: "message_content".to_string(),
                value: serde_json::json!({
                    "parent_message_id": parent_msg_id,
                }),
            });
        }
    }
}

fn track_tool_telemetry(content: &MessageContent, all_messages: &[Message]) {
    match content {
        MessageContent::ToolRequest(tool_request) => {
            if let Ok(tool_call) = &tool_request.tool_call {
                tracing::info!(monotonic_counter.goose.tool_calls = 1,
                    tool_name = %tool_call.name,
                    "Tool call started"
                );
            }
        }
        MessageContent::ToolResponse(tool_response) => {
            let tool_name = all_messages
                .iter()
                .rev()
                .find_map(|msg| {
                    msg.content.iter().find_map(|c| {
                        if let MessageContent::ToolRequest(req) = c {
                            if req.id == tool_response.id {
                                if let Ok(tool_call) = &req.tool_call {
                                    Some(tool_call.name.clone())
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or_else(|| "unknown".to_string().into());

            let success = tool_response.tool_result.is_ok();
            let result_status = if success { "success" } else { "error" };

            tracing::info!(
                counter.goose.tool_completions = 1,
                tool_name = %tool_name,
                result = %result_status,
                "Tool call completed"
            );
        }
        _ => {}
    }
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ChatRequest {
    user_message: Message,
    #[serde(default)]
    conversation_so_far: Option<Vec<Message>>,
    session_id: String,
    recipe_name: Option<String>,
    recipe_version: Option<String>,
}

pub struct SseResponse {
    rx: ReceiverStream<String>,
}

impl SseResponse {
    fn new(rx: ReceiverStream<String>) -> Self {
        Self { rx }
    }
}

impl Stream for SseResponse {
    type Item = Result<Bytes, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.rx)
            .poll_next(cx)
            .map(|opt| opt.map(|s| Ok(Bytes::from(s))))
    }
}

impl IntoResponse for SseResponse {
    fn into_response(self) -> axum::response::Response {
        let stream = self;
        let body = axum::body::Body::from_stream(stream);

        http::Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .body(body)
            .unwrap_or_else(|e| {
                tracing::error!("Failed to build reply SSE response: {}", e);
                http::Response::builder()
                    .status(http::StatusCode::INTERNAL_SERVER_ERROR)
                    .body(axum::body::Body::from("Internal Server Error"))
                    .unwrap()
            })
    }
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(tag = "type")]
pub enum MessageEvent {
    Message {
        message: Message,
        token_state: TokenState,
    },
    Error {
        error: String,
    },
    Finish {
        reason: String,
        token_state: TokenState,
    },
    ModelChange {
        model: String,
        mode: String,
    },
    Notification {
        request_id: String,
        #[schema(value_type = Object)]
        message: ServerNotification,
    },
    UpdateConversation {
        conversation: Conversation,
    },
    Ping,
}

async fn get_token_state(session_manager: &SessionManager, session_id: &str) -> TokenState {
    session_manager
        .get_session(session_id, false)
        .await
        .map(|session| TokenState {
            input_tokens: session.input_tokens.unwrap_or(0),
            output_tokens: session.output_tokens.unwrap_or(0),
            total_tokens: session.total_tokens.unwrap_or(0),
            accumulated_input_tokens: session.accumulated_input_tokens.unwrap_or(0),
            accumulated_output_tokens: session.accumulated_output_tokens.unwrap_or(0),
            accumulated_total_tokens: session.accumulated_total_tokens.unwrap_or(0),
        })
        .inspect_err(|e| {
            tracing::warn!(
                "Failed to fetch session token state for {}: {}",
                session_id,
                e
            );
        })
        .unwrap_or_default()
}

async fn stream_event(
    event: MessageEvent,
    tx: &mpsc::Sender<String>,
    cancel_token: &CancellationToken,
) {
    let json = serde_json::to_string(&event).unwrap_or_else(|e| {
        format!(
            r#"{{"type":"Error","error":"Failed to serialize event: {}"}}"#,
            e
        )
    });

    if tx.send(format!("data: {}\n\n", json)).await.is_err() {
        tracing::info!("client hung up");
        cancel_token.cancel();
    }
}

#[allow(clippy::too_many_lines)]
#[utoipa::path(
    post,
    path = "/reply",
    request_body = ChatRequest,
    responses(
        (status = 200, description = "Streaming response initiated",
         body = MessageEvent,
         content_type = "text/event-stream"),
        (status = 424, description = "Agent not initialized"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn reply(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ChatRequest>,
) -> Result<SseResponse, ErrorResponse> {
    let session_start = std::time::Instant::now();

    tracing::info!(
        counter.goose.session_starts = 1,
        session_type = "app",
        interface = "ui",
        "Session started"
    );

    let session_id = request.session_id.clone();

    if let Some(recipe_name) = request.recipe_name.clone() {
        if state.mark_recipe_run_if_absent(&session_id).await {
            let recipe_version = request
                .recipe_version
                .clone()
                .unwrap_or_else(|| "unknown".to_string());

            tracing::info!(
                counter.goose.recipe_runs = 1,
                recipe_name = %recipe_name,
                recipe_version = %recipe_version,
                session_type = "app",
                interface = "ui",
                "Recipe execution started"
            );
        }
    }

    let (tx, rx) = mpsc::channel(100);
    let stream = ReceiverStream::new(rx);
    let cancel_token = CancellationToken::new();

    let user_message = request.user_message;
    let conversation_so_far = request.conversation_so_far;

    let task_cancel = cancel_token.clone();
    let task_tx = tx.clone();

    drop(tokio::spawn(async move {
        // Track whether we already emitted a terminal AG-UI event (RUN_ERROR /
        // RUN_CANCELLED) so the cleanup at the bottom of the spawn doesn't
        // double-emit RUN_FINISHED after an error path.
        let mut run_terminated = false;

        let agent = match state.get_agent(session_id.clone()).await {
            Ok(agent) => agent,
            Err(e) => {
                tracing::error!("Failed to get session agent: {}", e);
                // AG-UI: emit RUN_ERROR for early failures before the stream
                // has started so that SSE subscribers see the failure.
                emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_ERROR {
                    message: format!("Failed to get session agent: {}", e),
                    code: Some("AGENT_INIT_FAILED".to_string()),
                });
                let _ = stream_event(
                    MessageEvent::Error {
                        error: format!("Failed to get session agent: {}", e),
                    },
                    &task_tx,
                    &task_cancel,
                )
                .await;
                return;
            }
        };

        let session = match state.session_manager().get_session(&session_id, true).await {
            Ok(metadata) => metadata,
            Err(e) => {
                tracing::error!("Failed to read session for {}: {}", session_id, e);
                // AG-UI: emit RUN_ERROR for session read failures.
                emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_ERROR {
                    message: format!("Failed to read session: {}", e),
                    code: Some("SESSION_READ_FAILED".to_string()),
                });
                let _ = stream_event(
                    MessageEvent::Error {
                        error: format!("Failed to read session: {}", e),
                    },
                    &task_tx,
                    &cancel_token,
                )
                .await;
                return;
            }
        };

        let session_config = SessionConfig {
            id: session_id.clone(),
            schedule_id: session.schedule_id.clone(),
            max_turns: None,
            retry_config: None,
        };

        let mut all_messages = match conversation_so_far {
            Some(history) => {
                let conv = Conversation::new_unvalidated(history);
                if let Err(e) = state
                    .session_manager()
                    .replace_conversation(&session_id, &conv)
                    .await
                {
                    tracing::warn!(
                        "Failed to replace session conversation for {}: {}",
                        session_id,
                        e
                    );
                }
                conv
            }
            None => session.conversation.unwrap_or_default(),
        };
        all_messages.push(user_message.clone());

        // Generate run-scoped IDs for AG-UI lifecycle events.
        let run_id = format!("run-{}", uuid::Uuid::new_v4());
        let thread_id = session_id.clone();

        let mut stream = match agent
            .reply(
                user_message.clone(),
                session_config,
                Some(task_cancel.clone()),
            )
            .await
        {
            Ok(stream) => stream,
            Err(e) => {
                tracing::error!("Failed to start reply stream: {:?}", e);
                // Emit RUN_ERROR on the AG-UI bus before returning.
                emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_ERROR {
                    message: e.to_string(),
                    code: Some("STREAM_INIT_FAILED".to_string()),
                });
                stream_event(
                    MessageEvent::Error {
                        error: e.to_string(),
                    },
                    &task_tx,
                    &cancel_token,
                )
                .await;
                return;
            }
        };

        // --- AG-UI: RUN_STARTED ---
        emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_STARTED {
            thread_id: thread_id.clone(),
            run_id: run_id.clone(),
        });

        // --- AG-UI: STATE_DELTA idle → running ---
        emit_ag_ui_event_typed(&state, &AgUiEvent::STATE_DELTA {
            delta: vec![JsonPatchOp {
                op: "replace".to_string(),
                path: "/status".to_string(),
                value: Some(serde_json::json!("running")),
                from: None,
            }],
        });

        let mut heartbeat_interval = tokio::time::interval(Duration::from_millis(500));
        loop {
            tokio::select! {
                _ = task_cancel.cancelled() => {
                    tracing::info!("Agent task cancelled");
                    // Emit RUN_CANCELLED so the frontend knows the run was
                    // intentionally aborted (not just finished normally).
                    emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_CANCELLED {
                        reason: Some("User cancelled".to_string()),
                        timestamp: now_rfc3339(),
                    });
                    run_terminated = true;
                    break;
                }
                _ = heartbeat_interval.tick() => {
                    stream_event(MessageEvent::Ping, &tx, &cancel_token).await;
                }
                response = timeout(Duration::from_millis(500), stream.next()) => {
                    match response {
                        Ok(Some(Ok(AgentEvent::Message(message)))) => {
                            for content in &message.content {
                                track_tool_telemetry(content, all_messages.messages());
                            }

                            // --- AG-UI: emit events for each content item ---
                            let parent_msg_id = message.id.clone().unwrap_or_else(|| format!("msg-{}", uuid::Uuid::new_v4()));
                            for content in &message.content {
                                emit_ag_ui_for_content(&state, content, &parent_msg_id);
                            }

                            all_messages.push(message.clone());

                            let token_state = get_token_state(state.session_manager(), &session_id).await;

                            stream_event(MessageEvent::Message { message, token_state }, &tx, &cancel_token).await;
                        }
                        Ok(Some(Ok(AgentEvent::HistoryReplaced(new_messages)))) => {
                            // --- AG-UI: MESSAGES_SNAPSHOT ---
                            // Use the proper MESSAGES_SNAPSHOT event type instead of
                            // CUSTOM so the frontend AG-UI layer can handle it natively.
                            emit_ag_ui_event_typed(&state, &AgUiEvent::MESSAGES_SNAPSHOT {
                                messages: new_messages.iter().map(|m| {
                                    serde_json::json!({
                                        "role": format!("{:?}", m.role),
                                        "thread_id": thread_id,
                                    })
                                }).collect(),
                            });

                            all_messages = new_messages.clone();
                            stream_event(MessageEvent::UpdateConversation {conversation: new_messages}, &tx, &cancel_token).await;
                        }
                        Ok(Some(Ok(AgentEvent::ModelChange { model, mode }))) => {
                            // --- AG-UI: STATE_DELTA for model change ---
                            emit_ag_ui_event_typed(&state, &AgUiEvent::CUSTOM {
                                name: "model_change".to_string(),
                                value: serde_json::json!({
                                    "model": model,
                                    "mode": mode,
                                }),
                            });

                            stream_event(MessageEvent::ModelChange { model, mode }, &tx, &cancel_token).await;
                        }
                        Ok(Some(Ok(AgentEvent::McpNotification((request_id, n))))) => {
                            // --- AG-UI: CUSTOM event for MCP notifications ---
                            emit_ag_ui_event_typed(&state, &AgUiEvent::CUSTOM {
                                name: "mcp_notification".to_string(),
                                value: serde_json::json!({
                                    "request_id": request_id,
                                }),
                            });

                            stream_event(MessageEvent::Notification{
                                request_id: request_id.clone(),
                                message: n,
                            }, &tx, &cancel_token).await;
                        }

                        Ok(Some(Err(e))) => {
                            tracing::error!("Error processing message: {}", e);
                            // --- AG-UI: RUN_ERROR ---
                            emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_ERROR {
                                message: e.to_string(),
                                code: Some("AGENT_ERROR".to_string()),
                            });
                            stream_event(
                                MessageEvent::Error {
                                    error: e.to_string(),
                                },
                                &tx,
                                &cancel_token,
                            ).await;
                            run_terminated = true;
                            break;
                        }
                        Ok(None) => {
                            break;
                        }
                        Err(_) => {
                            if tx.is_closed() {
                                break;
                            }
                            continue;
                        }
                    }
                }
            }
        }

        // --- AG-UI: STATE_DELTA running → idle ---
        emit_ag_ui_event_typed(&state, &AgUiEvent::STATE_DELTA {
            delta: vec![JsonPatchOp {
                op: "replace".to_string(),
                path: "/status".to_string(),
                value: Some(serde_json::json!("idle")),
                from: None,
            }],
        });

        // --- AG-UI: RUN_FINISHED ---
        // Only emit RUN_FINISHED if we didn't already emit a terminal event
        // (RUN_ERROR / RUN_CANCELLED) to avoid double terminal events.
        if !run_terminated {
            emit_ag_ui_event_typed(&state, &AgUiEvent::RUN_FINISHED {
                thread_id: thread_id.clone(),
                run_id: run_id.clone(),
                result: None,
            });
        }

        let session_duration = session_start.elapsed();

        if let Ok(session) = state.session_manager().get_session(&session_id, true).await {
            let total_tokens = session.total_tokens.unwrap_or(0);
            tracing::info!(
                counter.goose.session_completions = 1,
                session_type = "app",
                interface = "ui",
                exit_type = "normal",
                duration_ms = session_duration.as_millis() as u64,
                total_tokens = total_tokens,
                message_count = session.message_count,
                "Session completed"
            );

            tracing::info!(
                counter.goose.session_duration_ms = session_duration.as_millis() as u64,
                session_type = "app",
                interface = "ui",
                "Session duration"
            );

            if total_tokens > 0 {
                tracing::info!(
                    counter.goose.session_tokens = total_tokens,
                    session_type = "app",
                    interface = "ui",
                    "Session tokens"
                );
            }
        } else {
            tracing::info!(
                counter.goose.session_completions = 1,
                session_type = "app",
                interface = "ui",
                exit_type = "normal",
                duration_ms = session_duration.as_millis() as u64,
                total_tokens = 0u64,
                message_count = all_messages.len(),
                "Session completed"
            );

            tracing::info!(
                counter.goose.session_duration_ms = session_duration.as_millis() as u64,
                session_type = "app",
                interface = "ui",
                "Session duration"
            );
        }

        let final_token_state = get_token_state(state.session_manager(), &session_id).await;

        let _ = stream_event(
            MessageEvent::Finish {
                reason: "stop".to_string(),
                token_state: final_token_state,
            },
            &task_tx,
            &cancel_token,
        )
        .await;
    }));
    Ok(SseResponse::new(stream))
}

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route(
            "/reply",
            post(reply).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    mod integration_tests {
        use super::*;
        use axum::{body::Body, http::Request};
        use goose::conversation::message::Message;
        use tower::ServiceExt;

        #[tokio::test(flavor = "multi_thread")]
        async fn test_reply_endpoint() {
            let state = AppState::new().await.unwrap();

            let app = routes(state);

            let request = Request::builder()
                .uri("/reply")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-secret-key", "test-secret")
                .body(Body::from(
                    serde_json::to_string(&ChatRequest {
                        user_message: Message::user().with_text("test message"),
                        conversation_so_far: None,
                        session_id: "test-session".to_string(),
                        recipe_name: None,
                        recipe_version: None,
                    })
                    .unwrap(),
                ))
                .unwrap();

            let response = app.oneshot(request).await.unwrap();

            assert_eq!(response.status(), StatusCode::OK);
        }
    }
}
