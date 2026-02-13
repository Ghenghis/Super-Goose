use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use bytes::Bytes;
use futures::Stream;
use goose::config::{Config, ConfigError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::convert::Infallible;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context as TaskContext, Poll};
use std::time::Duration;
use tokio_stream::wrappers::ReceiverStream;
use utoipa::ToSchema;

/// Request body for setting a single configuration value.
#[derive(Deserialize, ToSchema)]
pub struct SetSettingRequest {
    /// The value to set for the given key.
    pub value: Value,
}

/// Request body for bulk-updating multiple settings at once.
#[derive(Deserialize, ToSchema)]
pub struct BulkSettingsRequest {
    /// A map of key-value pairs to set.
    pub settings: HashMap<String, Value>,
}

/// Response containing all settings as a key-value map.
#[derive(Serialize, ToSchema)]
pub struct SettingsResponse {
    /// All configuration key-value pairs.
    pub settings: HashMap<String, Value>,
}

/// Response containing a single setting.
#[derive(Serialize, ToSchema)]
pub struct SettingResponse {
    /// The configuration key.
    pub key: String,
    /// The configuration value.
    pub value: Value,
}

/// Response returned after a successful delete operation.
#[derive(Serialize, ToSchema)]
pub struct DeleteSettingResponse {
    /// Confirmation message.
    pub message: String,
}

/// Response returned after a bulk update operation.
#[derive(Serialize, ToSchema)]
pub struct BulkSettingsResponse {
    /// Number of settings that were successfully updated.
    pub updated: usize,
    /// Keys that failed to update, with error messages.
    pub errors: HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// SSE Event Types
// ---------------------------------------------------------------------------

/// Events emitted on the settings SSE stream.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(tag = "event")]
pub enum SettingsStreamEvent {
    /// A setting was updated.
    #[serde(rename = "settings_update")]
    SettingsUpdate {
        key: String,
        value: Value,
        /// Source of the update: "api", "frontend", "cli", etc.
        source: String,
    },
    /// Keep-alive heartbeat sent at a regular interval.
    #[serde(rename = "heartbeat")]
    Heartbeat {
        timestamp: u64,
    },
}

// ---------------------------------------------------------------------------
// SSE Response Wrapper
// ---------------------------------------------------------------------------

/// Streaming response that formats each item as an SSE frame.
pub struct SettingsSseResponse {
    rx: ReceiverStream<String>,
}

impl SettingsSseResponse {
    fn new(rx: ReceiverStream<String>) -> Self {
        Self { rx }
    }
}

impl Stream for SettingsSseResponse {
    type Item = Result<Bytes, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut TaskContext<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.rx)
            .poll_next(cx)
            .map(|opt| opt.map(|s| Ok(Bytes::from(s))))
    }
}

impl IntoResponse for SettingsSseResponse {
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

/// Get current Unix timestamp in seconds.
fn now_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Serialize an event and wrap it in the SSE frame format.
fn format_sse_event(event: &SettingsStreamEvent) -> String {
    let event_name = match event {
        SettingsStreamEvent::SettingsUpdate { .. } => "settings_update",
        SettingsStreamEvent::Heartbeat { .. } => "heartbeat",
    };

    let json = serde_json::to_string(event).unwrap_or_else(|_e| {
        format!(
            r#"{{"event":"heartbeat","timestamp":{}}}"#,
            now_timestamp()
        )
    });

    format!("event: {}\ndata: {}\n\n", event_name, json)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[utoipa::path(
    get,
    path = "/api/settings",
    responses(
        (status = 200, description = "All settings retrieved successfully", body = SettingsResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Settings"
)]
pub async fn get_all_settings() -> Result<Json<SettingsResponse>, ErrorResponse> {
    let config = Config::global();
    let values = config
        .all_values()
        .map_err(|e| ErrorResponse::internal(format!("Failed to read settings: {}", e)))?;

    Ok(Json(SettingsResponse { settings: values }))
}

#[utoipa::path(
    get,
    path = "/api/settings/{key}",
    params(
        ("key" = String, Path, description = "The setting key to retrieve")
    ),
    responses(
        (status = 200, description = "Setting value retrieved successfully", body = SettingResponse),
        (status = 404, description = "Setting not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Settings"
)]
pub async fn get_setting(
    Path(key): Path<String>,
) -> Result<Json<SettingResponse>, ErrorResponse> {
    let config = Config::global();

    match config.get_param::<Value>(&key) {
        Ok(value) => Ok(Json(SettingResponse { key, value })),
        Err(ConfigError::NotFound(_)) => Err(ErrorResponse::not_found(format!(
            "Setting '{}' not found",
            key
        ))),
        Err(e) => Err(ErrorResponse::internal(format!(
            "Failed to read setting '{}': {}",
            key, e
        ))),
    }
}

#[utoipa::path(
    post,
    path = "/api/settings/{key}",
    params(
        ("key" = String, Path, description = "The setting key to set")
    ),
    request_body = SetSettingRequest,
    responses(
        (status = 200, description = "Setting updated successfully", body = SettingResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Settings"
)]
pub async fn set_setting(
    Path(key): Path<String>,
    Json(request): Json<SetSettingRequest>,
) -> Result<Json<SettingResponse>, ErrorResponse> {
    let config = Config::global();

    config.set_param(&key, &request.value).map_err(|e| {
        ErrorResponse::internal(format!("Failed to set setting '{}': {}", key, e))
    })?;

    Ok(Json(SettingResponse {
        key,
        value: request.value,
    }))
}

#[utoipa::path(
    post,
    path = "/api/settings/bulk",
    request_body = BulkSettingsRequest,
    responses(
        (status = 200, description = "Bulk settings update completed", body = BulkSettingsResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Settings"
)]
pub async fn bulk_set_settings(
    Json(request): Json<BulkSettingsRequest>,
) -> Result<Json<BulkSettingsResponse>, ErrorResponse> {
    let config = Config::global();
    let mut updated: usize = 0;
    let mut errors: HashMap<String, String> = HashMap::new();

    for (key, value) in &request.settings {
        match config.set_param(key.as_str(), value) {
            Ok(()) => {
                updated += 1;
            }
            Err(e) => {
                errors.insert(key.clone(), e.to_string());
            }
        }
    }

    Ok(Json(BulkSettingsResponse { updated, errors }))
}

#[utoipa::path(
    delete,
    path = "/api/settings/{key}",
    params(
        ("key" = String, Path, description = "The setting key to remove")
    ),
    responses(
        (status = 200, description = "Setting removed successfully", body = DeleteSettingResponse),
        (status = 404, description = "Setting not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Settings"
)]
pub async fn delete_setting(
    Path(key): Path<String>,
) -> Result<Json<DeleteSettingResponse>, ErrorResponse> {
    let config = Config::global();

    // Verify the key exists before attempting deletion.
    match config.get_param::<Value>(&key) {
        Ok(_) => {}
        Err(ConfigError::NotFound(_)) => {
            return Err(ErrorResponse::not_found(format!(
                "Setting '{}' not found",
                key
            )));
        }
        Err(e) => {
            return Err(ErrorResponse::internal(format!(
                "Failed to check setting '{}': {}",
                key, e
            )));
        }
    }

    config.delete(&key).map_err(|e| {
        ErrorResponse::internal(format!("Failed to delete setting '{}': {}", key, e))
    })?;

    Ok(Json(DeleteSettingResponse {
        message: format!("Setting '{}' removed successfully", key),
    }))
}

#[utoipa::path(
    get,
    path = "/api/settings/stream",
    responses(
        (status = 200, description = "SSE stream of settings updates",
         content_type = "text/event-stream",
         body = SettingsStreamEvent),
    ),
    tag = "Settings"
)]
pub async fn settings_stream(
    State(_state): State<Arc<AppState>>,
) -> SettingsSseResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);

    // Spawn a background task that drives the SSE stream.
    tokio::spawn(async move {
        // Send initial snapshot of all settings.
        let config = Config::global();
        if let Ok(all_values) = config.all_values() {
            for (key, value) in all_values {
                let event = SettingsStreamEvent::SettingsUpdate {
                    key,
                    value,
                    source: "initial".to_string(),
                };
                if tx.send(format_sse_event(&event)).await.is_err() {
                    // Client disconnected.
                    return;
                }
            }
        }

        // Send heartbeats every 30 seconds.
        let mut interval = tokio::time::interval(Duration::from_secs(30));

        loop {
            interval.tick().await;

            let heartbeat = SettingsStreamEvent::Heartbeat {
                timestamp: now_timestamp(),
            };

            if tx.send(format_sse_event(&heartbeat)).await.is_err() {
                // Client disconnected.
                tracing::debug!("settings-stream client disconnected");
                break;
            }
        }
    });

    SettingsSseResponse::new(ReceiverStream::new(rx))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/settings", get(get_all_settings))
        // IMPORTANT: The `/api/settings/bulk` and `/api/settings/stream` routes
        // must be registered before the `/api/settings/{key}` wildcard route
        // so they are matched first.
        .route("/api/settings/bulk", post(bulk_set_settings))
        .route("/api/settings/stream", get(settings_stream))
        .route("/api/settings/{key}", get(get_setting))
        .route("/api/settings/{key}", post(set_setting))
        .route("/api/settings/{key}", delete(delete_setting))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_routes_creation() {
        // Verify that routes() returns a valid Router when given a
        // default-shaped state. We cannot easily construct a real AppState
        // in unit tests, but we can verify the Router type itself by
        // confirming the function compiles and the return is a Router.
        // Since Router requires AppState, we verify struct/function
        // signatures instead.
        fn _assert_routes_fn_exists(state: Arc<AppState>) -> Router {
            routes(state)
        }
    }

    #[test]
    fn test_setting_value_serialization() {
        // Round-trip test: SetSettingRequest -> JSON -> SetSettingRequest
        let original = SetSettingRequest {
            value: json!("hello world"),
        };
        let serialized = serde_json::to_string(&original.value).unwrap();
        let deserialized: Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized, json!("hello world"));

        // SettingResponse round-trip
        let response = SettingResponse {
            key: "my_key".to_string(),
            value: json!(42),
        };
        let json_str = serde_json::to_string(&response).unwrap();
        let parsed: Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(parsed["key"], "my_key");
        assert_eq!(parsed["value"], 42);
    }

    #[test]
    fn test_bulk_settings_request() {
        let raw = json!({
            "settings": {
                "theme": "dark",
                "font_size": 14,
                "auto_save": true,
                "nested": { "a": 1, "b": [2, 3] }
            }
        });

        let request: BulkSettingsRequest = serde_json::from_value(raw).unwrap();
        assert_eq!(request.settings.len(), 4);
        assert_eq!(request.settings["theme"], json!("dark"));
        assert_eq!(request.settings["font_size"], json!(14));
        assert_eq!(request.settings["auto_save"], json!(true));
        assert_eq!(request.settings["nested"], json!({ "a": 1, "b": [2, 3] }));
    }

    #[test]
    fn test_setting_key_parsing() {
        // Verify that various key formats deserialize correctly through
        // the Path extractor pattern (simulated via string parsing).
        let keys = vec![
            "simple_key",
            "dotted.key.path",
            "UPPER_CASE",
            "with-dashes",
            "with_underscores_123",
        ];

        for key in keys {
            let response = SettingResponse {
                key: key.to_string(),
                value: json!(null),
            };
            let serialized = serde_json::to_string(&response).unwrap();
            let parsed: Value = serde_json::from_str(&serialized).unwrap();
            assert_eq!(parsed["key"].as_str().unwrap(), key);
        }
    }

    #[test]
    fn test_default_settings_structure() {
        // Verify that SettingsResponse can hold an empty map (defaults).
        let empty = SettingsResponse {
            settings: HashMap::new(),
        };
        let json_str = serde_json::to_string(&empty).unwrap();
        let parsed: Value = serde_json::from_str(&json_str).unwrap();
        assert!(parsed["settings"].is_object());
        assert_eq!(parsed["settings"].as_object().unwrap().len(), 0);

        // Verify that SettingsResponse correctly wraps populated data.
        let mut populated = HashMap::new();
        populated.insert("provider".to_string(), json!("openai"));
        populated.insert("model".to_string(), json!("gpt-4o"));
        populated.insert("temperature".to_string(), json!(0.7));

        let response = SettingsResponse {
            settings: populated,
        };
        let json_str = serde_json::to_string(&response).unwrap();
        let parsed: Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(parsed["settings"]["provider"], "openai");
        assert_eq!(parsed["settings"]["model"], "gpt-4o");
        assert_eq!(parsed["settings"]["temperature"], 0.7);
    }

    #[test]
    fn test_settings_stream_event_serialization() {
        // --- SettingsUpdate ---
        let event = SettingsStreamEvent::SettingsUpdate {
            key: "super_goose_guardrails_enabled".to_string(),
            value: json!(true),
            source: "api".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "settings_update");
        assert_eq!(json["key"], "super_goose_guardrails_enabled");
        assert_eq!(json["value"], true);
        assert_eq!(json["source"], "api");

        // --- SettingsUpdate with complex value ---
        let event = SettingsStreamEvent::SettingsUpdate {
            key: "super_goose_budget_limit".to_string(),
            value: json!(50.00),
            source: "frontend".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "settings_update");
        assert_eq!(json["key"], "super_goose_budget_limit");
        assert_eq!(json["value"], 50.00);
        assert_eq!(json["source"], "frontend");

        // --- Heartbeat ---
        let event = SettingsStreamEvent::Heartbeat {
            timestamp: 1234567890,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "heartbeat");
        assert_eq!(json["timestamp"], 1234567890);
    }

    #[test]
    fn test_format_sse_event() {
        // --- SettingsUpdate event ---
        let event = SettingsStreamEvent::SettingsUpdate {
            key: "test_key".to_string(),
            value: json!("test_value"),
            source: "test".to_string(),
        };
        let frame = format_sse_event(&event);

        assert!(frame.starts_with("event: settings_update\n"));
        assert!(frame.contains("data: "));
        assert!(frame.ends_with("\n\n"));

        // Extract and verify JSON payload
        let lines: Vec<&str> = frame.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], "event: settings_update");

        let data_line = lines[1];
        let payload = data_line.strip_prefix("data: ").unwrap();
        let parsed: Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["event"], "settings_update");
        assert_eq!(parsed["key"], "test_key");
        assert_eq!(parsed["value"], "test_value");
        assert_eq!(parsed["source"], "test");

        // --- Heartbeat event ---
        let event = SettingsStreamEvent::Heartbeat {
            timestamp: 9876543210,
        };
        let frame = format_sse_event(&event);

        assert!(frame.starts_with("event: heartbeat\n"));
        assert!(frame.contains("data: "));
        assert!(frame.ends_with("\n\n"));

        let lines: Vec<&str> = frame.lines().collect();
        assert_eq!(lines[0], "event: heartbeat");

        let data_line = lines[1];
        let payload = data_line.strip_prefix("data: ").unwrap();
        let parsed: Value = serde_json::from_str(payload).unwrap();
        assert_eq!(parsed["event"], "heartbeat");
        assert_eq!(parsed["timestamp"], 9876543210_i64);
    }

    #[test]
    fn test_now_timestamp() {
        let ts = now_timestamp();
        // Verify it's a reasonable Unix timestamp (after 2020, before 2100)
        assert!(ts > 1577836800); // 2020-01-01
        assert!(ts < 4102444800); // 2100-01-01
    }

    #[test]
    fn test_settings_sse_response_creation() {
        // Verify we can construct the SSE response type.
        let (_tx, rx) = tokio::sync::mpsc::channel::<String>(32);
        let _response = SettingsSseResponse::new(ReceiverStream::new(rx));
    }
}
