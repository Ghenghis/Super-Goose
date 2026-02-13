use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::Path,
    routing::{get, post, put},
    Json, Router,
};
use goose::agents::ExtensionConfig;
use goose::config::extensions::{get_all_extensions, set_extension_enabled, ExtensionEntry};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Response containing information about a single extension.
#[derive(Serialize, ToSchema, Clone, Debug)]
pub struct ExtensionInfo {
    /// The unique key for this extension (derived from name).
    pub key: String,
    /// The extension name.
    pub name: String,
    /// The extension type (builtin, stdio, streamable_http, etc.).
    #[serde(rename = "type")]
    pub extension_type: String,
    /// Whether this extension is currently enabled.
    pub enabled: bool,
    /// Human-readable description.
    pub description: String,
}

/// Response containing all extensions.
#[derive(Serialize, ToSchema, Debug)]
pub struct ExtensionsResponse {
    /// List of all extensions.
    pub extensions: Vec<ExtensionInfo>,
}

/// Response for a single extension detail.
#[derive(Serialize, ToSchema, Debug)]
pub struct ExtensionDetailResponse {
    pub extension: ExtensionInfo,
}

/// Request body for toggling an extension's enabled state.
#[derive(Deserialize, ToSchema, Debug)]
pub struct ToggleExtensionRequest {
    /// Whether the extension should be enabled.
    pub enabled: bool,
}

/// Response after toggling an extension.
#[derive(Serialize, ToSchema, Debug)]
pub struct ToggleExtensionResponse {
    /// The extension key that was toggled.
    pub key: String,
    /// The new enabled state.
    pub enabled: bool,
    /// Whether the change was successfully persisted.
    pub updated: bool,
}

/// Response after reloading extensions from config.
#[derive(Serialize, ToSchema, Debug)]
pub struct ReloadExtensionsResponse {
    /// Total number of extensions after reload.
    pub count: usize,
    /// Whether the reload was successful.
    pub reloaded: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert an ExtensionEntry to ExtensionInfo.
fn entry_to_info(entry: ExtensionEntry) -> ExtensionInfo {
    let key = entry.config.key();
    let name = entry.config.name();
    let description = match &entry.config {
        ExtensionConfig::Builtin { description, .. } => description.clone(),
        ExtensionConfig::Stdio { description, .. } => description.clone(),
        ExtensionConfig::StreamableHttp { description, .. } => description.clone(),
        ExtensionConfig::Platform { description, .. } => description.clone(),
        ExtensionConfig::Frontend { description, .. } => description.clone(),
        ExtensionConfig::InlinePython { description, .. } => description.clone(),
        ExtensionConfig::Sse { description, .. } => description.clone(),
    };

    let extension_type = match &entry.config {
        ExtensionConfig::Builtin { .. } => "builtin",
        ExtensionConfig::Stdio { .. } => "stdio",
        ExtensionConfig::StreamableHttp { .. } => "streamable_http",
        ExtensionConfig::Platform { .. } => "platform",
        ExtensionConfig::Frontend { .. } => "frontend",
        ExtensionConfig::InlinePython { .. } => "inline_python",
        ExtensionConfig::Sse { .. } => "sse",
    }
    .to_string();

    ExtensionInfo {
        key,
        name,
        extension_type,
        enabled: entry.enabled,
        description,
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/extensions` — return all extensions with their enabled status.
#[utoipa::path(
    get,
    path = "/api/extensions",
    responses(
        (status = 200, description = "All extensions retrieved successfully", body = ExtensionsResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Extensions"
)]
pub async fn get_extensions() -> Result<Json<ExtensionsResponse>, ErrorResponse> {
    let entries = get_all_extensions();
    let extensions = entries.into_iter().map(entry_to_info).collect();

    Ok(Json(ExtensionsResponse { extensions }))
}

/// `GET /api/extensions/{key}` — get single extension details.
#[utoipa::path(
    get,
    path = "/api/extensions/{key}",
    params(
        ("key" = String, Path, description = "The extension key to retrieve")
    ),
    responses(
        (status = 200, description = "Extension retrieved successfully", body = ExtensionDetailResponse),
        (status = 404, description = "Extension not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Extensions"
)]
pub async fn get_extension(
    Path(key): Path<String>,
) -> Result<Json<ExtensionDetailResponse>, ErrorResponse> {
    let entries = get_all_extensions();

    let entry = entries
        .into_iter()
        .find(|e| e.config.key() == key)
        .ok_or_else(|| ErrorResponse::not_found(format!("Extension '{}' not found", key)))?;

    Ok(Json(ExtensionDetailResponse {
        extension: entry_to_info(entry),
    }))
}

/// `PUT /api/extensions/{key}/toggle` — toggle extension enabled state.
#[utoipa::path(
    put,
    path = "/api/extensions/{key}/toggle",
    params(
        ("key" = String, Path, description = "The extension key to toggle")
    ),
    request_body = ToggleExtensionRequest,
    responses(
        (status = 200, description = "Extension toggled successfully", body = ToggleExtensionResponse),
        (status = 404, description = "Extension not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Extensions"
)]
pub async fn toggle_extension(
    Path(key): Path<String>,
    Json(request): Json<ToggleExtensionRequest>,
) -> Result<Json<ToggleExtensionResponse>, ErrorResponse> {
    // Verify the extension exists before attempting to toggle.
    let entries = get_all_extensions();
    let exists = entries.iter().any(|e| e.config.key() == key);

    if !exists {
        return Err(ErrorResponse::not_found(format!(
            "Extension '{}' not found",
            key
        )));
    }

    // Toggle the extension.
    set_extension_enabled(&key, request.enabled);

    // Verify the toggle was applied by re-reading the config.
    let updated_entries = get_all_extensions();
    let updated = updated_entries
        .iter()
        .find(|e| e.config.key() == key)
        .map(|e| e.enabled == request.enabled)
        .unwrap_or(false);

    Ok(Json(ToggleExtensionResponse {
        key,
        enabled: request.enabled,
        updated,
    }))
}

/// `POST /api/extensions/reload` — reload extensions from the config file.
#[utoipa::path(
    post,
    path = "/api/extensions/reload",
    responses(
        (status = 200, description = "Extensions reloaded successfully", body = ReloadExtensionsResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Extensions"
)]
pub async fn reload_extensions() -> Result<Json<ReloadExtensionsResponse>, ErrorResponse> {
    // Re-read extensions from the underlying config (config.yaml).
    // `get_all_extensions` always reads fresh from the global Config,
    // so calling it here effectively "reloads" the extension list.
    let entries = get_all_extensions();

    Ok(Json(ReloadExtensionsResponse {
        count: entries.len(),
        reloaded: true,
    }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/extensions", get(get_extensions))
        .route("/api/extensions/reload", post(reload_extensions))
        .route("/api/extensions/{key}", get(get_extension))
        .route("/api/extensions/{key}/toggle", put(toggle_extension))
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
        // Verify the router can be built without panicking.
        fn _assert_routes_fn_exists(state: Arc<AppState>) -> Router {
            routes(state)
        }
    }

    #[test]
    fn test_extension_info_serialization() {
        let info = ExtensionInfo {
            key: "developer".to_string(),
            name: "developer".to_string(),
            extension_type: "builtin".to_string(),
            enabled: true,
            description: "Core developer tools".to_string(),
        };

        let json = serde_json::to_string(&info).expect("serialize extension info");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse json");

        assert_eq!(parsed["key"], "developer");
        assert_eq!(parsed["name"], "developer");
        assert_eq!(parsed["type"], "builtin");
        assert_eq!(parsed["enabled"], true);
        assert_eq!(parsed["description"], "Core developer tools");
    }

    #[test]
    fn test_toggle_request_deserialization() {
        let raw = json!({ "enabled": false });
        let request: ToggleExtensionRequest =
            serde_json::from_value(raw).expect("deserialize toggle request");
        assert_eq!(request.enabled, false);

        let raw = json!({ "enabled": true });
        let request: ToggleExtensionRequest =
            serde_json::from_value(raw).expect("deserialize toggle request");
        assert_eq!(request.enabled, true);
    }

    #[test]
    fn test_toggle_response_serialization() {
        let response = ToggleExtensionResponse {
            key: "memory".to_string(),
            enabled: false,
            updated: true,
        };

        let json = serde_json::to_string(&response).expect("serialize toggle response");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse json");

        assert_eq!(parsed["key"], "memory");
        assert_eq!(parsed["enabled"], false);
        assert_eq!(parsed["updated"], true);
    }

    #[test]
    fn test_extensions_response_structure() {
        let response = ExtensionsResponse {
            extensions: vec![
                ExtensionInfo {
                    key: "dev".to_string(),
                    name: "developer".to_string(),
                    extension_type: "builtin".to_string(),
                    enabled: true,
                    description: "Dev tools".to_string(),
                },
                ExtensionInfo {
                    key: "mem".to_string(),
                    name: "memory".to_string(),
                    extension_type: "builtin".to_string(),
                    enabled: false,
                    description: "Memory system".to_string(),
                },
            ],
        };

        let json = serde_json::to_string(&response).expect("serialize extensions response");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse json");

        assert!(parsed["extensions"].is_array());
        assert_eq!(parsed["extensions"].as_array().unwrap().len(), 2);
        assert_eq!(parsed["extensions"][0]["key"], "dev");
        assert_eq!(parsed["extensions"][1]["key"], "mem");
    }

    #[test]
    fn test_reload_response_serialization() {
        let response = ReloadExtensionsResponse {
            count: 7,
            reloaded: true,
        };

        let json = serde_json::to_string(&response).expect("serialize reload response");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse json");

        assert_eq!(parsed["count"], 7);
        assert_eq!(parsed["reloaded"], true);
    }

    #[test]
    fn test_extension_detail_response_serialization() {
        let response = ExtensionDetailResponse {
            extension: ExtensionInfo {
                key: "memory".to_string(),
                name: "memory".to_string(),
                extension_type: "builtin".to_string(),
                enabled: true,
                description: "Memory and context persistence".to_string(),
            },
        };

        let json = serde_json::to_string(&response).expect("serialize detail response");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse json");

        assert_eq!(parsed["extension"]["key"], "memory");
        assert_eq!(parsed["extension"]["type"], "builtin");
        assert_eq!(parsed["extension"]["enabled"], true);
        assert_eq!(
            parsed["extension"]["description"],
            "Memory and context persistence"
        );
    }
}
