use crate::state::AppState;
use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct CostSummary {
    pub total_spend: f64,
    pub session_spend: f64,
    pub budget_limit: Option<f64>,
    pub budget_remaining: Option<f64>,
    pub budget_warning_threshold: f64,
    pub is_over_budget: bool,
    pub model_breakdown: Vec<ModelCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCost {
    pub model: String,
    pub provider: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CostBreakdown {
    pub by_model: Vec<ModelCost>,
    pub by_session: Vec<SessionCost>,
    pub daily_trend: Vec<DailyCost>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionCost {
    pub session_id: String,
    pub session_name: Option<String>,
    pub total_cost: f64,
    pub message_count: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyCost {
    pub date: String,
    pub cost: f64,
    pub message_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetBudgetRequest {
    pub limit: Option<f64>,
    pub warning_threshold: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BudgetResponse {
    pub limit: Option<f64>,
    pub warning_threshold: f64,
    pub updated: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Read the persisted budget limit from config, falling back to `None`.
fn read_budget_limit() -> Option<f64> {
    let config = goose::config::Config::global();
    config
        .get("budget_limit", false)
        .ok()
        .and_then(|v| v.as_f64())
}

/// Read the persisted warning threshold from config, falling back to `0.8`.
fn read_warning_threshold() -> f64 {
    let config = goose::config::Config::global();
    config
        .get("budget_warning_threshold", false)
        .ok()
        .and_then(|v| v.as_f64())
        .unwrap_or(0.8)
}

/// Derive provider name from a model id heuristic.
#[allow(dead_code)]
fn provider_from_model(model: &str) -> String {
    if model.starts_with("claude") || model.starts_with("anthropic") {
        "anthropic".to_string()
    } else if model.starts_with("gpt") || model.starts_with("o1") {
        "openai".to_string()
    } else if model.starts_with("gemini") {
        "google".to_string()
    } else if model.starts_with("mistral") || model.starts_with("mixtral") {
        "mistral".to_string()
    } else if model.starts_with("command") {
        "cohere".to_string()
    } else if model.starts_with("ollama") {
        "ollama".to_string()
    } else if model.starts_with("local") {
        "local".to_string()
    } else {
        "unknown".to_string()
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/cost/summary`
///
/// Returns total spend, current-session spend, budget info and a per-model
/// breakdown.  The data comes from the global `CostTracker` via `AppState`.
/// Because `Agent.cost_tracker` is private we cannot reach it through the
/// server state today, so this handler returns structured zero-cost defaults
/// until that integration is wired.
async fn get_cost_summary(
    State(_state): State<Arc<AppState>>,
) -> Json<CostSummary> {
    // TODO: wire to real CostTracker once Agent exposes it via AppState
    let total_spend: f64 = 0.0;
    let session_spend: f64 = 0.0;
    let model_breakdown: Vec<ModelCost> = Vec::new();

    let budget_limit = read_budget_limit();
    let warning_threshold = read_warning_threshold();
    let budget_remaining = budget_limit.map(|limit| (limit - total_spend).max(0.0));
    let is_over_budget = budget_limit.map_or(false, |limit| total_spend > limit);

    Json(CostSummary {
        total_spend,
        session_spend,
        budget_limit,
        budget_remaining,
        budget_warning_threshold: warning_threshold,
        is_over_budget,
        model_breakdown,
    })
}

/// `GET /api/cost/breakdown`
///
/// Detailed per-model, per-session, and daily cost breakdown.
async fn get_cost_breakdown(
    State(_state): State<Arc<AppState>>,
) -> Json<CostBreakdown> {
    // TODO: wire to real CostTracker once Agent exposes it via AppState
    Json(CostBreakdown {
        by_model: Vec::new(),
        by_session: Vec::new(),
        daily_trend: Vec::new(),
    })
}

/// `GET /api/cost/budget`
///
/// Returns the current budget limit and warning threshold.
async fn get_budget(
    State(_state): State<Arc<AppState>>,
) -> Json<BudgetResponse> {
    Json(BudgetResponse {
        limit: read_budget_limit(),
        warning_threshold: read_warning_threshold(),
        updated: false,
    })
}

/// `PUT /api/cost/budget`
///
/// Set budget limit and/or warning threshold.  Values are persisted to the
/// global config store so they survive restarts.
async fn set_budget(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<SetBudgetRequest>,
) -> Json<BudgetResponse> {
    let config = goose::config::Config::global();

    if let Some(limit) = body.limit {
        let _ = config.set_param("budget_limit", limit);
    }

    if let Some(threshold) = body.warning_threshold {
        let clamped = threshold.clamp(0.0, 1.0);
        let _ = config.set_param("budget_warning_threshold", clamped);
    }

    Json(BudgetResponse {
        limit: read_budget_limit(),
        warning_threshold: read_warning_threshold(),
        updated: true,
    })
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/cost/summary", get(get_cost_summary))
        .route("/api/cost/breakdown", get(get_cost_breakdown))
        .route("/api/cost/budget", get(get_budget).put(set_budget))
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
        // Verify that the router can be constructed without panicking.
        // We cannot easily build a full AppState in a unit test so we just
        // confirm the handler function signatures are well-typed by checking
        // the types compile and that route wiring does not panic at the type
        // level.  An integration test would exercise the full stack.
        //
        // Here we validate the response structs serialise correctly instead.
        let summary = CostSummary {
            total_spend: 0.0,
            session_spend: 0.0,
            budget_limit: None,
            budget_remaining: None,
            budget_warning_threshold: 0.8,
            is_over_budget: false,
            model_breakdown: vec![],
        };
        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("total_spend"));
        assert!(json.contains("budget_warning_threshold"));
    }

    #[test]
    fn test_cost_summary_serialization() {
        let summary = CostSummary {
            total_spend: 12.50,
            session_spend: 3.25,
            budget_limit: Some(50.0),
            budget_remaining: Some(37.50),
            budget_warning_threshold: 0.8,
            is_over_budget: false,
            model_breakdown: vec![
                ModelCost {
                    model: "claude-3-5-sonnet-20241022".to_string(),
                    provider: "anthropic".to_string(),
                    input_tokens: 50000,
                    output_tokens: 25000,
                    cost: 8.25,
                },
                ModelCost {
                    model: "gpt-4o".to_string(),
                    provider: "openai".to_string(),
                    input_tokens: 30000,
                    output_tokens: 15000,
                    cost: 4.25,
                },
            ],
        };

        let json = serde_json::to_string_pretty(&summary).unwrap();

        // Verify all top-level fields are present
        assert!(json.contains("\"total_spend\": 12.5"));
        assert!(json.contains("\"session_spend\": 3.25"));
        assert!(json.contains("\"budget_limit\": 50.0"));
        assert!(json.contains("\"budget_remaining\": 37.5"));
        assert!(json.contains("\"budget_warning_threshold\": 0.8"));
        assert!(json.contains("\"is_over_budget\": false"));

        // Verify model breakdown entries
        assert!(json.contains("claude-3-5-sonnet-20241022"));
        assert!(json.contains("gpt-4o"));
        assert!(json.contains("\"input_tokens\": 50000"));
        assert!(json.contains("\"output_tokens\": 25000"));

        // Round-trip: deserialise the ModelCost entries back
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        let models = parsed["model_breakdown"].as_array().unwrap();
        assert_eq!(models.len(), 2);
    }

    #[test]
    fn test_budget_request_deserialization() {
        // Full request with both fields
        let json_full = r#"{"limit": 50.0, "warning_threshold": 0.8}"#;
        let req: SetBudgetRequest = serde_json::from_str(json_full).unwrap();
        assert_eq!(req.limit, Some(50.0));
        assert_eq!(req.warning_threshold, Some(0.8));

        // Partial request — only limit
        let json_limit = r#"{"limit": 100.0}"#;
        let req: SetBudgetRequest = serde_json::from_str(json_limit).unwrap();
        assert_eq!(req.limit, Some(100.0));
        assert!(req.warning_threshold.is_none());

        // Partial request — only warning threshold
        let json_threshold = r#"{"warning_threshold": 0.5}"#;
        let req: SetBudgetRequest = serde_json::from_str(json_threshold).unwrap();
        assert!(req.limit.is_none());
        assert_eq!(req.warning_threshold, Some(0.5));

        // Empty object — both None
        let json_empty = r#"{}"#;
        let req: SetBudgetRequest = serde_json::from_str(json_empty).unwrap();
        assert!(req.limit.is_none());
        assert!(req.warning_threshold.is_none());

        // Null budget (explicitly remove limit)
        let json_null = r#"{"limit": null, "warning_threshold": 0.9}"#;
        let req: SetBudgetRequest = serde_json::from_str(json_null).unwrap();
        assert!(req.limit.is_none());
        assert_eq!(req.warning_threshold, Some(0.9));
    }

    #[test]
    fn test_provider_from_model() {
        assert_eq!(provider_from_model("claude-3-5-sonnet-20241022"), "anthropic");
        assert_eq!(provider_from_model("gpt-4o"), "openai");
        assert_eq!(provider_from_model("o1-preview"), "openai");
        assert_eq!(provider_from_model("gemini-1.5-pro"), "google");
        assert_eq!(provider_from_model("mistral-large"), "mistral");
        assert_eq!(provider_from_model("mixtral-8x7b"), "mistral");
        assert_eq!(provider_from_model("command-r-plus"), "cohere");
        assert_eq!(provider_from_model("ollama/llama3"), "ollama");
        assert_eq!(provider_from_model("local/my-model"), "local");
        assert_eq!(provider_from_model("some-random-model"), "unknown");
    }
}
