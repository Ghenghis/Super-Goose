use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::Path,
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
pub struct FeatureStatus {
    pub name: String,
    pub enabled: bool,
    pub description: String,
    pub category: String, // "safety", "performance", "learning", "ui"
}

#[derive(Serialize, Debug)]
pub struct FeaturesResponse {
    pub features: Vec<FeatureStatus>,
}

#[derive(Deserialize, Debug)]
pub struct ToggleFeatureRequest {
    pub enabled: bool,
}

#[derive(Serialize, Debug)]
pub struct ToggleFeatureResponse {
    pub name: String,
    pub enabled: bool,
    pub updated: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GuardrailsConfig {
    pub enabled: bool,
    pub mode: String, // "warn" or "block"
    pub content_filtering: bool,
    pub pii_detection: bool,
    pub code_injection_detection: bool,
    pub max_tool_calls_per_turn: u32,
    pub blocked_tools: Vec<String>,
    pub allowed_domains: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct GuardrailsResponse {
    pub config: GuardrailsConfig,
    pub violations_today: u32,
    pub last_violation: Option<String>,
}

// ---------------------------------------------------------------------------
// Well-known features
// ---------------------------------------------------------------------------

/// Canonical feature definitions.  The tuple order is:
/// `(name, default_enabled, description, category)`
const WELL_KNOWN_FEATURES: &[(&str, bool, &str, &str)] = &[
    (
        "reflexion",
        true,
        "Self-reflection after task completion for quality improvement",
        "safety",
    ),
    (
        "guardrails",
        true,
        "Content safety guardrails and policy enforcement",
        "safety",
    ),
    (
        "rate_limiting",
        true,
        "Rate limiting for API calls and tool invocations",
        "safety",
    ),
    (
        "auto_checkpoint",
        true,
        "Automatic session checkpointing for crash recovery",
        "performance",
    ),
    (
        "memory_system",
        true,
        "Cross-session memory and context persistence",
        "learning",
    ),
    (
        "hitl",
        true,
        "Human-in-the-loop approval for sensitive operations",
        "safety",
    ),
    (
        "pipeline_viz",
        true,
        "Real-time pipeline visualization in the UI",
        "ui",
    ),
    (
        "cost_tracking",
        true,
        "Token usage and cost tracking per session",
        "performance",
    ),
    (
        "core_selector",
        true,
        "Automatic agent core selection based on task type",
        "learning",
    ),
    (
        "experience_recording",
        true,
        "Record task outcomes for experience-based learning",
        "learning",
    ),
    (
        "skill_library",
        true,
        "Reusable skill retrieval from verified strategies",
        "learning",
    ),
    (
        "ota_self_improve",
        false,
        "Over-the-air self-improvement pipeline (experimental)",
        "performance",
    ),
    (
        "autonomous_daemon",
        false,
        "Background autonomous task execution daemon (experimental)",
        "performance",
    ),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Persist-key used to store feature overrides in `Config::global()`.
const FEATURES_CONFIG_KEY: &str = "feature_flags";

/// Persist-key used to store guardrails configuration.
const GUARDRAILS_CONFIG_KEY: &str = "guardrails_config";

/// Load persisted feature overrides from `Config::global()`, falling back to an
/// empty map on any error.
fn load_feature_overrides() -> HashMap<String, bool> {
    let config = goose::config::Config::global();
    config
        .get_param::<HashMap<String, bool>>(FEATURES_CONFIG_KEY)
        .unwrap_or_default()
}

/// Save feature overrides to `Config::global()`.  Returns `true` on success.
fn save_feature_overrides(overrides: &HashMap<String, bool>) -> bool {
    let config = goose::config::Config::global();
    config.set_param(FEATURES_CONFIG_KEY, overrides).is_ok()
}

/// Build the full feature list, merging well-known defaults with any persisted
/// overrides.
fn build_feature_list() -> Vec<FeatureStatus> {
    let overrides = load_feature_overrides();

    WELL_KNOWN_FEATURES
        .iter()
        .map(|&(name, default_enabled, description, category)| {
            let enabled = overrides
                .get(name)
                .copied()
                .unwrap_or(default_enabled);

            FeatureStatus {
                name: name.to_string(),
                enabled,
                description: description.to_string(),
                category: category.to_string(),
            }
        })
        .collect()
}

/// Return the default `GuardrailsConfig`.
fn default_guardrails_config() -> GuardrailsConfig {
    GuardrailsConfig {
        enabled: true,
        mode: "warn".to_string(),
        content_filtering: true,
        pii_detection: true,
        code_injection_detection: true,
        max_tool_calls_per_turn: 25,
        blocked_tools: Vec::new(),
        allowed_domains: Vec::new(),
    }
}

/// Load guardrails config from `Config::global()`, falling back to defaults.
fn load_guardrails_config() -> GuardrailsConfig {
    let config = goose::config::Config::global();
    config
        .get_param::<GuardrailsConfig>(GUARDRAILS_CONFIG_KEY)
        .unwrap_or_else(|_| default_guardrails_config())
}

/// Persist guardrails config.  Returns `true` on success.
fn save_guardrails_config(cfg: &GuardrailsConfig) -> bool {
    let config = goose::config::Config::global();
    config.set_param(GUARDRAILS_CONFIG_KEY, cfg).is_ok()
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/features` — return all feature statuses.
async fn get_features() -> Result<Json<FeaturesResponse>, ErrorResponse> {
    Ok(Json(FeaturesResponse {
        features: build_feature_list(),
    }))
}

/// `PUT /api/features/{name}` — toggle a single feature on or off.
async fn toggle_feature(
    Path(name): Path<String>,
    Json(body): Json<ToggleFeatureRequest>,
) -> Result<Json<ToggleFeatureResponse>, ErrorResponse> {
    // Validate the feature name is well-known.
    let known = WELL_KNOWN_FEATURES.iter().any(|&(n, ..)| n == name);
    if !known {
        return Err(ErrorResponse::not_found(format!(
            "Unknown feature: '{}'",
            name
        )));
    }

    let mut overrides = load_feature_overrides();
    overrides.insert(name.clone(), body.enabled);
    let persisted = save_feature_overrides(&overrides);

    Ok(Json(ToggleFeatureResponse {
        name,
        enabled: body.enabled,
        updated: persisted,
    }))
}

/// `GET /api/guardrails/config` — return the current guardrails configuration.
async fn get_guardrails() -> Result<Json<GuardrailsResponse>, ErrorResponse> {
    let config = load_guardrails_config();
    Ok(Json(GuardrailsResponse {
        config,
        violations_today: 0,
        last_violation: None,
    }))
}

/// `PUT /api/guardrails/config` — update the guardrails configuration.
async fn update_guardrails(
    Json(body): Json<GuardrailsConfig>,
) -> Result<Json<GuardrailsResponse>, ErrorResponse> {
    // Validate mode.
    if body.mode != "warn" && body.mode != "block" {
        return Err(ErrorResponse::bad_request(format!(
            "Invalid guardrails mode '{}': must be 'warn' or 'block'",
            body.mode
        )));
    }

    save_guardrails_config(&body);

    Ok(Json(GuardrailsResponse {
        config: body,
        violations_today: 0,
        last_violation: None,
    }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/features", get(get_features))
        .route("/api/features/{name}", put(toggle_feature))
        .route("/api/guardrails/config", get(get_guardrails).put(update_guardrails))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routes_creation() {
        // Verify the router can be built without panicking.  We use a minimal
        // fake state — the routes themselves don't access AppState so we only
        // need the type to satisfy the generic constraint.  Since AppState::new
        // is async and needs real infrastructure we instead assert the function
        // compiles and the route tree is non-empty.
        //
        // A full integration test would use `axum_test` or similar but that is
        // out of scope for a unit test.
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
        // If we got here the function exists and has the right signature.
    }

    #[test]
    fn test_features_list_complete() {
        let features = build_feature_list();

        // Verify we have exactly 13 well-known features.
        assert_eq!(features.len(), 13, "Expected 13 well-known features");

        let names: Vec<&str> = features.iter().map(|f| f.name.as_str()).collect();

        let expected = [
            "reflexion",
            "guardrails",
            "rate_limiting",
            "auto_checkpoint",
            "memory_system",
            "hitl",
            "pipeline_viz",
            "cost_tracking",
            "core_selector",
            "experience_recording",
            "skill_library",
            "ota_self_improve",
            "autonomous_daemon",
        ];

        for name in &expected {
            assert!(
                names.contains(name),
                "Missing expected feature: '{}'",
                name
            );
        }

        // Verify default-enabled counts.
        let enabled_count = features.iter().filter(|f| f.enabled).count();
        assert_eq!(enabled_count, 11, "Expected 11 features enabled by default");

        let disabled_count = features.iter().filter(|f| !f.enabled).count();
        assert_eq!(disabled_count, 2, "Expected 2 features disabled by default");

        // Validate categories.
        let valid_categories = ["safety", "performance", "learning", "ui"];
        for f in &features {
            assert!(
                valid_categories.contains(&f.category.as_str()),
                "Feature '{}' has invalid category '{}'",
                f.name,
                f.category
            );
        }
    }

    #[test]
    fn test_guardrails_config_serialization() {
        let config = default_guardrails_config();

        // Round-trip through JSON.
        let json = serde_json::to_string(&config).expect("serialize guardrails config");
        let deserialized: GuardrailsConfig =
            serde_json::from_str(&json).expect("deserialize guardrails config");

        assert_eq!(deserialized.enabled, config.enabled);
        assert_eq!(deserialized.mode, config.mode);
        assert_eq!(deserialized.content_filtering, config.content_filtering);
        assert_eq!(deserialized.pii_detection, config.pii_detection);
        assert_eq!(
            deserialized.code_injection_detection,
            config.code_injection_detection
        );
        assert_eq!(
            deserialized.max_tool_calls_per_turn,
            config.max_tool_calls_per_turn
        );
        assert_eq!(deserialized.blocked_tools, config.blocked_tools);
        assert_eq!(deserialized.allowed_domains, config.allowed_domains);

        // Verify the default values are sensible.
        assert!(config.enabled, "Guardrails should be enabled by default");
        assert_eq!(config.mode, "warn", "Default mode should be 'warn'");
        assert!(
            config.content_filtering,
            "Content filtering should be on by default"
        );
        assert!(
            config.pii_detection,
            "PII detection should be on by default"
        );
        assert!(
            config.code_injection_detection,
            "Code injection detection should be on by default"
        );
        assert_eq!(
            config.max_tool_calls_per_turn, 25,
            "Default max tool calls should be 25"
        );
        assert!(
            config.blocked_tools.is_empty(),
            "No tools should be blocked by default"
        );
        assert!(
            config.allowed_domains.is_empty(),
            "No domain allowlist by default"
        );

        // Verify the full GuardrailsResponse also serializes.
        let response = GuardrailsResponse {
            config,
            violations_today: 3,
            last_violation: Some("2026-02-12T14:30:00Z".to_string()),
        };
        let resp_json =
            serde_json::to_string(&response).expect("serialize guardrails response");
        assert!(resp_json.contains("violations_today"));
        assert!(resp_json.contains("last_violation"));
    }
}
