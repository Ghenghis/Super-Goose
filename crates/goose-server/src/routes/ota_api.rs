use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct OtaTriggerRequest {
    #[allow(dead_code)]
    pub session_id: String,
    #[allow(dead_code)]
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Deserialize)]
pub struct AutonomousActionRequest {
    #[allow(dead_code)]
    pub session_id: String,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct AuditLogQuery {
    #[serde(default = "default_audit_limit")]
    pub limit: u32,
}

fn default_audit_limit() -> u32 {
    50
}

// ---------------------------------------------------------------------------
// Response types — OTA
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct OtaStatus {
    pub state: String,
    pub last_build_time: Option<String>,
    pub last_build_result: Option<String>,
    pub current_version: String,
    pub pending_improvements: u32,
}

#[derive(Serialize)]
pub struct OtaTriggerResponse {
    pub triggered: bool,
    pub cycle_id: Option<String>,
    pub message: String,
}

#[derive(Serialize)]
pub struct ImprovementHistoryEntry {
    pub cycle_id: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub status: String,
    pub improvements_applied: u32,
    pub test_results: Option<String>,
}

// ---------------------------------------------------------------------------
// Response types — Autonomous
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AutonomousStatus {
    pub running: bool,
    pub uptime_seconds: u64,
    pub tasks_completed: u64,
    pub tasks_failed: u64,
    pub circuit_breaker: CircuitBreakerStatus,
    pub current_task: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct CircuitBreakerStatus {
    pub state: String,
    pub consecutive_failures: u32,
    pub max_failures: u32,
    pub last_failure: Option<String>,
}

#[derive(Serialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub timestamp: String,
    pub action: String,
    pub details: String,
    pub outcome: String,
}

// ---------------------------------------------------------------------------
// Handlers — OTA
// ---------------------------------------------------------------------------

/// GET /api/ota/status
///
/// Returns the current OTA pipeline status.
// TODO: Wire to Agent.ota_manager when pub(crate) access is available via AppState
async fn ota_status(
    State(_state): State<Arc<AppState>>,
) -> Json<OtaStatus> {
    Json(OtaStatus {
        state: "idle".to_string(),
        last_build_time: None,
        last_build_result: None,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        pending_improvements: 0,
    })
}

/// POST /api/ota/trigger
///
/// Triggers a self-improvement cycle.
// TODO: Wire to Agent.ota_manager — invoke OtaManager::start_improvement_cycle()
async fn ota_trigger(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<OtaTriggerRequest>,
) -> Json<OtaTriggerResponse> {
    let dry_run = req.dry_run;
    Json(OtaTriggerResponse {
        triggered: false,
        cycle_id: None,
        message: if dry_run {
            "Dry-run mode: OTA pipeline not yet wired to backend".to_string()
        } else {
            "OTA pipeline not yet wired to backend".to_string()
        },
    })
}

/// GET /api/ota/history
///
/// Returns past improvement cycle history.
// TODO: Wire to Agent.ota_manager — read from AutoImproveScheduler cycle history
async fn ota_history(
    State(_state): State<Arc<AppState>>,
) -> Json<Vec<ImprovementHistoryEntry>> {
    Json(vec![])
}

// ---------------------------------------------------------------------------
// Handlers — Autonomous
// ---------------------------------------------------------------------------

/// GET /api/autonomous/status
///
/// Returns daemon status including circuit breaker state.
// TODO: Wire to Agent.autonomous_daemon
async fn autonomous_status(
    State(_state): State<Arc<AppState>>,
) -> Json<AutonomousStatus> {
    Json(AutonomousStatus {
        running: false,
        uptime_seconds: 0,
        tasks_completed: 0,
        tasks_failed: 0,
        circuit_breaker: CircuitBreakerStatus {
            state: "closed".to_string(),
            consecutive_failures: 0,
            max_failures: 3,
            last_failure: None,
        },
        current_task: None,
    })
}

/// POST /api/autonomous/start
///
/// Starts the autonomous daemon for the given session.
// TODO: Wire to Agent.autonomous_daemon — invoke AutonomousDaemon::start()
async fn autonomous_start(
    State(_state): State<Arc<AppState>>,
    Json(_req): Json<AutonomousActionRequest>,
) -> Json<AutonomousStatus> {
    Json(AutonomousStatus {
        running: false,
        uptime_seconds: 0,
        tasks_completed: 0,
        tasks_failed: 0,
        circuit_breaker: CircuitBreakerStatus {
            state: "closed".to_string(),
            consecutive_failures: 0,
            max_failures: 3,
            last_failure: None,
        },
        current_task: None,
    })
}

/// POST /api/autonomous/stop
///
/// Stops the autonomous daemon for the given session.
// TODO: Wire to Agent.autonomous_daemon — invoke AutonomousDaemon::stop()
async fn autonomous_stop(
    State(_state): State<Arc<AppState>>,
    Json(_req): Json<AutonomousActionRequest>,
) -> Json<AutonomousStatus> {
    Json(AutonomousStatus {
        running: false,
        uptime_seconds: 0,
        tasks_completed: 0,
        tasks_failed: 0,
        circuit_breaker: CircuitBreakerStatus {
            state: "closed".to_string(),
            consecutive_failures: 0,
            max_failures: 3,
            last_failure: None,
        },
        current_task: None,
    })
}

/// GET /api/autonomous/audit-log?limit=N
///
/// Returns recent autonomous actions from the audit log.
// TODO: Wire to Agent.autonomous_daemon — read from AuditLog
async fn autonomous_audit_log(
    State(_state): State<Arc<AppState>>,
    Query(_query): Query<AuditLogQuery>,
) -> Json<Vec<AuditLogEntry>> {
    Json(vec![])
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // OTA endpoints
        .route("/api/ota/status", get(ota_status))
        .route("/api/ota/trigger", post(ota_trigger))
        .route("/api/ota/history", get(ota_history))
        // Autonomous endpoints
        .route("/api/autonomous/status", get(autonomous_status))
        .route("/api/autonomous/start", post(autonomous_start))
        .route("/api/autonomous/stop", post(autonomous_stop))
        .route("/api/autonomous/audit-log", get(autonomous_audit_log))
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
        // Verify the router can be built without panicking.
        // We cannot call `routes()` without a real AppState, but we can
        // confirm the handler function signatures are compatible with Axum
        // by checking the response types serialize correctly.
        let status = OtaStatus {
            state: "idle".to_string(),
            last_build_time: None,
            last_build_result: None,
            current_version: "1.0.0".to_string(),
            pending_improvements: 0,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"state\":\"idle\""));
        assert!(json.contains("\"current_version\":\"1.0.0\""));
        assert!(json.contains("\"pending_improvements\":0"));
    }

    #[test]
    fn test_ota_status_serialization() {
        let status = OtaStatus {
            state: "building".to_string(),
            last_build_time: Some("2026-02-12T10:30:00Z".to_string()),
            last_build_result: Some("success".to_string()),
            current_version: "1.24.05".to_string(),
            pending_improvements: 3,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["state"], "building");
        assert_eq!(json["last_build_time"], "2026-02-12T10:30:00Z");
        assert_eq!(json["last_build_result"], "success");
        assert_eq!(json["current_version"], "1.24.05");
        assert_eq!(json["pending_improvements"], 3);

        let trigger = OtaTriggerResponse {
            triggered: true,
            cycle_id: Some("cycle-001".to_string()),
            message: "Improvement cycle started".to_string(),
        };
        let json = serde_json::to_value(&trigger).unwrap();
        assert_eq!(json["triggered"], true);
        assert_eq!(json["cycle_id"], "cycle-001");

        let history = ImprovementHistoryEntry {
            cycle_id: "cycle-001".to_string(),
            started_at: "2026-02-12T10:00:00Z".to_string(),
            completed_at: Some("2026-02-12T10:05:00Z".to_string()),
            status: "completed".to_string(),
            improvements_applied: 2,
            test_results: Some("1862/1871 passed".to_string()),
        };
        let json = serde_json::to_value(&history).unwrap();
        assert_eq!(json["cycle_id"], "cycle-001");
        assert_eq!(json["status"], "completed");
        assert_eq!(json["improvements_applied"], 2);
        assert_eq!(json["test_results"], "1862/1871 passed");
    }

    #[test]
    fn test_autonomous_status_serialization() {
        let status = AutonomousStatus {
            running: true,
            uptime_seconds: 3600,
            tasks_completed: 42,
            tasks_failed: 1,
            circuit_breaker: CircuitBreakerStatus {
                state: "closed".to_string(),
                consecutive_failures: 0,
                max_failures: 3,
                last_failure: None,
            },
            current_task: Some("docs-generation".to_string()),
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["running"], true);
        assert_eq!(json["uptime_seconds"], 3600);
        assert_eq!(json["tasks_completed"], 42);
        assert_eq!(json["tasks_failed"], 1);
        assert_eq!(json["current_task"], "docs-generation");
        assert_eq!(json["circuit_breaker"]["state"], "closed");
        assert_eq!(json["circuit_breaker"]["max_failures"], 3);
        assert!(json["circuit_breaker"]["last_failure"].is_null());

        let entry = AuditLogEntry {
            id: "audit-001".to_string(),
            timestamp: "2026-02-12T11:00:00Z".to_string(),
            action: "ci_watch".to_string(),
            details: "Monitored CI pipeline for main branch".to_string(),
            outcome: "success".to_string(),
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["id"], "audit-001");
        assert_eq!(json["action"], "ci_watch");
        assert_eq!(json["outcome"], "success");
    }

    #[test]
    fn test_circuit_breaker_states() {
        // Closed state (healthy)
        let closed = CircuitBreakerStatus {
            state: "closed".to_string(),
            consecutive_failures: 0,
            max_failures: 3,
            last_failure: None,
        };
        let json = serde_json::to_value(&closed).unwrap();
        assert_eq!(json["state"], "closed");
        assert_eq!(json["consecutive_failures"], 0);
        assert!(json["last_failure"].is_null());

        // Open state (tripped)
        let open = CircuitBreakerStatus {
            state: "open".to_string(),
            consecutive_failures: 3,
            max_failures: 3,
            last_failure: Some("2026-02-12T10:45:00Z".to_string()),
        };
        let json = serde_json::to_value(&open).unwrap();
        assert_eq!(json["state"], "open");
        assert_eq!(json["consecutive_failures"], 3);
        assert_eq!(json["last_failure"], "2026-02-12T10:45:00Z");

        // Half-open state (recovery probe)
        let half_open = CircuitBreakerStatus {
            state: "half_open".to_string(),
            consecutive_failures: 2,
            max_failures: 3,
            last_failure: Some("2026-02-12T10:50:00Z".to_string()),
        };
        let json = serde_json::to_value(&half_open).unwrap();
        assert_eq!(json["state"], "half_open");
        assert_eq!(json["consecutive_failures"], 2);
        assert_eq!(json["last_failure"], "2026-02-12T10:50:00Z");
    }
}
