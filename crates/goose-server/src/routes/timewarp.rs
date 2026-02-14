//! TimeWarp API routes — stub endpoints for the frontend TimeWarp timeline UI.
//!
//! The frontend's `useTimeWarpEvents` hook calls these endpoints to display
//! the session timeline, branches, and replay functionality. Currently these
//! return in-memory placeholder data; a future iteration will wire them to
//! `goose::timewarp::TimeWarpEventStore` (SQLite-backed).

use axum::{
    extract::Query,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Types (mirrors goose::timewarp types for API boundary)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct TimeWarpEventResponse {
    pub id: String,
    pub session_id: String,
    pub branch_id: String,
    pub event_type: String,
    pub label: String,
    pub detail: String,
    pub agent_id: Option<String>,
    pub timestamp: String,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimeWarpBranchResponse {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub parent_branch_id: Option<String>,
    pub fork_event_id: Option<String>,
    pub created_at: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    #[serde(default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BranchesQuery {
    #[serde(default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventRequest {
    pub session_id: String,
    pub event_type: String,
    pub label: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBranchRequest {
    pub session_id: String,
    pub name: String,
    #[serde(default)]
    pub parent_branch_id: Option<String>,
    #[serde(default)]
    pub fork_event_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReplayRequest {
    pub session_id: String,
    pub event_id: String,
    #[serde(default)]
    #[allow(dead_code)] // Read in replay handler but flagged by dead code analysis
    pub branch_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReplayResponse {
    pub success: bool,
    pub message: String,
    pub replayed_to_event_id: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/timewarp/events` — List events for a session.
///
/// TODO: Wire to `goose::timewarp::TimeWarpEventStore::list_events()` when
/// the event store is added to AppState. Currently returns an empty list.
async fn list_events(
    Query(params): Query<EventsQuery>,
) -> Json<Vec<TimeWarpEventResponse>> {
    let _session_id = params.session_id.unwrap_or_default();
    // TODO: Query TimeWarpEventStore from AppState
    Json(vec![])
}

/// `POST /api/timewarp/events` — Record a new event.
///
/// TODO: Wire to `goose::timewarp::TimeWarpEventStore::record_event()`.
async fn create_event(
    Json(req): Json<CreateEventRequest>,
) -> (StatusCode, Json<TimeWarpEventResponse>) {
    let now = chrono::Utc::now().to_rfc3339();
    let event = TimeWarpEventResponse {
        id: format!("tw-{}", uuid::Uuid::new_v4()),
        session_id: req.session_id,
        branch_id: "main".to_string(),
        event_type: req.event_type,
        label: req.label,
        detail: req.detail.unwrap_or_default(),
        agent_id: req.agent_id,
        timestamp: now,
        metadata: req.metadata,
    };
    // TODO: Persist via TimeWarpEventStore
    (StatusCode::CREATED, Json(event))
}

/// `GET /api/timewarp/branches` — List branches for a session.
///
/// TODO: Wire to `goose::timewarp::TimeWarpEventStore::list_branches()`.
async fn list_branches(
    Query(params): Query<BranchesQuery>,
) -> Json<Vec<TimeWarpBranchResponse>> {
    let session_id = params.session_id.unwrap_or_default();
    // Return a default "main" branch so the UI has something to display
    Json(vec![TimeWarpBranchResponse {
        id: "main".to_string(),
        session_id,
        name: "main".to_string(),
        parent_branch_id: None,
        fork_event_id: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        is_active: true,
    }])
}

/// `POST /api/timewarp/branches` — Create a new branch (fork).
///
/// TODO: Wire to `goose::timewarp::TimeWarpEventStore::create_branch()`.
async fn create_branch(
    Json(req): Json<CreateBranchRequest>,
) -> (StatusCode, Json<TimeWarpBranchResponse>) {
    let branch = TimeWarpBranchResponse {
        id: format!("br-{}", uuid::Uuid::new_v4()),
        session_id: req.session_id,
        name: req.name,
        parent_branch_id: req.parent_branch_id,
        fork_event_id: req.fork_event_id,
        created_at: chrono::Utc::now().to_rfc3339(),
        is_active: false,
    };
    // TODO: Persist via TimeWarpEventStore
    (StatusCode::CREATED, Json(branch))
}

/// `POST /api/timewarp/replay` — Replay to a specific event.
///
/// TODO: Wire to `goose::timewarp::TimeWarpEventStore` replay logic. This
/// will need to restore the conversation state to the point of the target
/// event and switch branches if needed.
async fn replay(
    Json(req): Json<ReplayRequest>,
) -> Json<ReplayResponse> {
    // TODO: Implement actual replay via TimeWarpEventStore
    let branch_label = req.branch_id.as_deref().unwrap_or("main");
    Json(ReplayResponse {
        success: true,
        message: format!(
            "Replay requested to event '{}' on branch '{}' in session '{}' (not yet implemented)",
            req.event_id, branch_label, req.session_id
        ),
        replayed_to_event_id: req.event_id,
    })
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/timewarp/events", get(list_events).post(create_event))
        .route(
            "/api/timewarp/branches",
            get(list_branches).post(create_branch),
        )
        .route("/api/timewarp/replay", post(replay))
        .with_state(state)
}
