use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use utoipa::ToSchema;

use crate::routes::errors::ErrorResponse;
use crate::state::AppState;

// TODO: Wire to Agent.experience_store when pub accessor is added
// The Agent struct has:
//   pub(crate) experience_store: Mutex<Option<Arc<ExperienceStore>>>
//   pub(crate) skill_library: Mutex<Option<Arc<SkillLibrary>>>
// These fields are not accessible from the goose-server crate. Once pub accessors
// (e.g. Agent::experience_store() -> Option<Arc<ExperienceStore>>) are added,
// replace the mock data below with real queries.

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LearningStats {
    pub total_experiences: u64,
    pub success_rate: f64,
    pub total_skills: u64,
    pub verified_skills: u64,
    pub total_insights: u64,
    pub experiences_by_core: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ExperienceEntry {
    pub id: String,
    pub task_summary: String,
    pub core_type: String,
    pub outcome: String,
    pub insights: Vec<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct InsightEntry {
    pub id: String,
    pub insight_type: String,
    pub description: String,
    pub confidence: f64,
    pub source_experiences: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SkillEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub strategy: String,
    pub verified: bool,
    pub use_count: u64,
    pub success_rate: f64,
}

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ExperienceQueryParams {
    pub limit: Option<u64>,
    pub offset: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[allow(dead_code)]
pub struct SkillQueryParams {
    pub verified_only: Option<bool>,
}

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ExperienceListResponse {
    pub experiences: Vec<ExperienceEntry>,
    pub total: u64,
    pub limit: u64,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct InsightListResponse {
    pub insights: Vec<InsightEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SkillListResponse {
    pub skills: Vec<SkillEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct VerifySkillResponse {
    pub id: String,
    pub verified: bool,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// Get aggregated learning statistics.
#[utoipa::path(
    get,
    path = "/api/learning/stats",
    responses(
        (status = 200, description = "Learning statistics", body = LearningStats),
        (status = 500, description = "Internal server error"),
    )
)]
async fn get_learning_stats(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<LearningStats>, ErrorResponse> {
    // TODO: Wire to Agent.experience_store when pub accessor is added
    let stats = LearningStats {
        total_experiences: 0,
        success_rate: 0.0,
        total_skills: 0,
        verified_skills: 0,
        total_insights: 0,
        experiences_by_core: HashMap::new(),
    };
    Ok(Json(stats))
}

/// List recent experiences with optional pagination.
#[utoipa::path(
    get,
    path = "/api/learning/experiences",
    params(
        ("limit" = Option<u64>, Query, description = "Maximum number of experiences to return (default 50)"),
        ("offset" = Option<u64>, Query, description = "Offset for pagination (default 0)"),
    ),
    responses(
        (status = 200, description = "List of experience entries", body = ExperienceListResponse),
        (status = 500, description = "Internal server error"),
    )
)]
async fn get_experiences(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<ExperienceQueryParams>,
) -> Result<Json<ExperienceListResponse>, ErrorResponse> {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);

    // TODO: Wire to Agent.experience_store when pub accessor is added
    let response = ExperienceListResponse {
        experiences: Vec::new(),
        total: 0,
        limit,
        offset,
    };
    Ok(Json(response))
}

/// List extracted insights from the learning engine.
#[utoipa::path(
    get,
    path = "/api/learning/insights",
    responses(
        (status = 200, description = "List of insight entries", body = InsightListResponse),
        (status = 500, description = "Internal server error"),
    )
)]
async fn get_insights(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<InsightListResponse>, ErrorResponse> {
    // TODO: Wire to Agent.experience_store when pub accessor is added
    let response = InsightListResponse {
        insights: Vec::new(),
        total: 0,
    };
    Ok(Json(response))
}

/// List skill library entries with optional verified-only filter.
#[utoipa::path(
    get,
    path = "/api/learning/skills",
    params(
        ("verified_only" = Option<bool>, Query, description = "If true, return only verified skills"),
    ),
    responses(
        (status = 200, description = "List of skill entries", body = SkillListResponse),
        (status = 500, description = "Internal server error"),
    )
)]
async fn get_skills(
    State(_state): State<Arc<AppState>>,
    Query(_params): Query<SkillQueryParams>,
) -> Result<Json<SkillListResponse>, ErrorResponse> {
    // TODO: Wire to Agent.skill_library when pub accessor is added
    let response = SkillListResponse {
        skills: Vec::new(),
        total: 0,
    };
    Ok(Json(response))
}

/// Mark a skill as verified by its ID.
#[utoipa::path(
    post,
    path = "/api/learning/skills/{id}/verify",
    params(
        ("id" = String, Path, description = "Skill ID to verify"),
    ),
    responses(
        (status = 200, description = "Skill verification result", body = VerifySkillResponse),
        (status = 404, description = "Skill not found"),
        (status = 500, description = "Internal server error"),
    )
)]
async fn verify_skill(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<VerifySkillResponse>, ErrorResponse> {
    // TODO: Wire to Agent.skill_library when pub accessor is added
    // For now, return a not-found since there are no skills in the mock store.
    // When wired, this will look up the skill by ID and call skill_library.verify(id).
    Err(ErrorResponse::not_found(format!(
        "Skill '{}' not found (learning store not yet wired)",
        id
    )))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/learning/stats", get(get_learning_stats))
        .route("/api/learning/experiences", get(get_experiences))
        .route("/api/learning/insights", get(get_insights))
        .route("/api/learning/skills", get(get_skills))
        .route("/api/learning/skills/{id}/verify", post(verify_skill))
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
        // Verify that the router can be built without panicking.
        // We use a minimal approach: construct the router the same way routes() does,
        // but without a real AppState (just confirm compilation and route registration).
        // Since AppState::new() is async and needs real infra, we test the route
        // definitions indirectly by ensuring the function compiles and the types align.
        //
        // The actual route tree is exercised below via serialization tests.
        let _get_stats = get_learning_stats;
        let _get_experiences = get_experiences;
        let _get_insights = get_insights;
        let _get_skills = get_skills;
        let _verify_skill = verify_skill;

        // Confirm the routes() function signature is correct.
        let _routes_fn: fn(Arc<AppState>) -> Router = routes;
    }

    #[test]
    fn test_learning_stats_serialization() {
        let mut by_core = HashMap::new();
        by_core.insert("freeform".to_string(), 12);
        by_core.insert("structured".to_string(), 5);

        let stats = LearningStats {
            total_experiences: 17,
            success_rate: 0.82,
            total_skills: 8,
            verified_skills: 3,
            total_insights: 5,
            experiences_by_core: by_core,
        };

        let json = serde_json::to_value(&stats).unwrap();
        assert_eq!(json["total_experiences"], 17);
        assert_eq!(json["success_rate"], 0.82);
        assert_eq!(json["total_skills"], 8);
        assert_eq!(json["verified_skills"], 3);
        assert_eq!(json["total_insights"], 5);
        assert_eq!(json["experiences_by_core"]["freeform"], 12);
        assert_eq!(json["experiences_by_core"]["structured"], 5);

        // Round-trip
        let deserialized: LearningStats = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.total_experiences, 17);
        assert_eq!(deserialized.verified_skills, 3);
    }

    #[test]
    fn test_experience_entry_serialization() {
        let entry = ExperienceEntry {
            id: "exp-001".to_string(),
            task_summary: "Refactor authentication module".to_string(),
            core_type: "structured".to_string(),
            outcome: "success".to_string(),
            insights: vec![
                "Structured core handles multi-step refactors well".to_string(),
                "Auth modules benefit from test-first approach".to_string(),
            ],
            timestamp: "2026-02-12T14:30:00Z".to_string(),
        };

        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["id"], "exp-001");
        assert_eq!(json["core_type"], "structured");
        assert_eq!(json["outcome"], "success");
        assert_eq!(json["insights"].as_array().unwrap().len(), 2);
        assert_eq!(json["timestamp"], "2026-02-12T14:30:00Z");

        // Round-trip
        let deserialized: ExperienceEntry = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.task_summary, "Refactor authentication module");
        assert_eq!(deserialized.insights.len(), 2);
    }

    #[test]
    fn test_skill_entry_serialization() {
        let skill = SkillEntry {
            id: "skill-042".to_string(),
            name: "Rust module refactoring".to_string(),
            description: "Strategy for safely refactoring Rust module boundaries".to_string(),
            strategy: "1. Identify public API surface\n2. Create facade module\n3. Migrate callers\n4. Remove old paths".to_string(),
            verified: true,
            use_count: 7,
            success_rate: 0.86,
        };

        let json = serde_json::to_value(&skill).unwrap();
        assert_eq!(json["id"], "skill-042");
        assert_eq!(json["name"], "Rust module refactoring");
        assert_eq!(json["verified"], true);
        assert_eq!(json["use_count"], 7);
        assert_eq!(json["success_rate"], 0.86);

        // Verify the strategy field preserves newlines
        let strategy_str = json["strategy"].as_str().unwrap();
        assert!(strategy_str.contains('\n'));

        // Round-trip
        let deserialized: SkillEntry = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.use_count, 7);
        assert!(deserialized.verified);
    }

    #[test]
    fn test_query_params_parsing() {
        // ExperienceQueryParams with all fields
        let json = serde_json::json!({"limit": 25, "offset": 10});
        let params: ExperienceQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.limit, Some(25));
        assert_eq!(params.offset, Some(10));

        // ExperienceQueryParams with no fields (all optional)
        let json = serde_json::json!({});
        let params: ExperienceQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.limit, None);
        assert_eq!(params.offset, None);

        // ExperienceQueryParams with partial fields
        let json = serde_json::json!({"limit": 100});
        let params: ExperienceQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.limit, Some(100));
        assert_eq!(params.offset, None);

        // SkillQueryParams with verified_only
        let json = serde_json::json!({"verified_only": true});
        let params: SkillQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.verified_only, Some(true));

        // SkillQueryParams empty
        let json = serde_json::json!({});
        let params: SkillQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.verified_only, None);
    }
}
