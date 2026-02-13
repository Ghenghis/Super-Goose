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
    pub session_id: String,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Deserialize)]
pub struct AutonomousActionRequest {
    pub session_id: String,
}

#[derive(Deserialize)]
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
// Helpers
// ---------------------------------------------------------------------------

/// Get the agent for a given session, or fall back to "default".
async fn get_agent(
    state: &AppState,
    session_id: Option<&str>,
) -> Option<Arc<goose::agents::Agent>> {
    let sid = session_id.unwrap_or("default").to_string();
    state.get_agent(sid).await.ok()
}

fn default_circuit_breaker() -> CircuitBreakerStatus {
    CircuitBreakerStatus {
        state: "closed".to_string(),
        consecutive_failures: 0,
        max_failures: 3,
        last_failure: None,
    }
}

// ---------------------------------------------------------------------------
// Handlers — OTA
// ---------------------------------------------------------------------------

/// GET /api/ota/status
///
/// Returns the current OTA pipeline status from the Agent's OtaManager.
async fn ota_status(
    State(state): State<Arc<AppState>>,
) -> Json<OtaStatus> {
    let agent = get_agent(&state, None).await;

    if let Some(agent) = &agent {
        let guard = agent.ota_manager_ref().await;
        if let Some(mgr) = guard.as_ref() {
            let status = mgr.status();
            return Json(OtaStatus {
                state: format!("{:?}", status),
                last_build_time: None,
                last_build_result: None,
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                pending_improvements: 0,
            });
        }
    }

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
/// Triggers a self-improvement cycle via the Agent's OtaManager.
async fn ota_trigger(
    State(state): State<Arc<AppState>>,
    Json(req): Json<OtaTriggerRequest>,
) -> Json<OtaTriggerResponse> {
    let agent = get_agent(&state, Some(&req.session_id)).await;

    if let Some(agent) = &agent {
        let mut guard = agent.ota_manager_ref().await;
        if let Some(mgr) = guard.as_mut() {
            if req.dry_run {
                let result = mgr.dry_run();
                return Json(OtaTriggerResponse {
                    triggered: false,
                    cycle_id: None,
                    message: format!("Dry-run complete: {:?}", result.status),
                });
            }
            // Real trigger
            let version = env!("CARGO_PKG_VERSION");
            match mgr.perform_update(version, "{}").await {
                Ok(result) => {
                    return Json(OtaTriggerResponse {
                        triggered: true,
                        cycle_id: Some(uuid::Uuid::new_v4().to_string()),
                        message: result.summary,
                    });
                }
                Err(e) => {
                    return Json(OtaTriggerResponse {
                        triggered: false,
                        cycle_id: None,
                        message: format!("OTA trigger failed: {}", e),
                    });
                }
            }
        }
    }

    Json(OtaTriggerResponse {
        triggered: false,
        cycle_id: None,
        message: "OTA manager not initialized".to_string(),
    })
}

/// GET /api/ota/history
///
/// Returns past improvement cycle history.
async fn ota_history(
    State(_state): State<Arc<AppState>>,
) -> Json<Vec<ImprovementHistoryEntry>> {
    // OtaManager doesn't persist cycle history yet — return empty.
    // Future: read from AutoImproveScheduler's SQLite history.
    Json(vec![])
}

// ---------------------------------------------------------------------------
// Handlers — Autonomous
// ---------------------------------------------------------------------------

/// GET /api/autonomous/status
///
/// Returns daemon status including circuit breaker state.
async fn autonomous_status(
    State(state): State<Arc<AppState>>,
) -> Json<AutonomousStatus> {
    let agent = get_agent(&state, None).await;

    if let Some(agent) = &agent {
        if let Some(daemon) = agent.autonomous_daemon().await {
            let running = daemon.is_running();
            let breaker_statuses = daemon.failsafe_status().await;

            // Aggregate circuit breaker state from first breaker (or default)
            let cb = if let Some(bs) = breaker_statuses.first() {
                CircuitBreakerStatus {
                    state: format!("{:?}", bs.state),
                    consecutive_failures: bs.consecutive_failures,
                    max_failures: 3,
                    last_failure: bs.last_failure_at.map(|t| t.to_rfc3339()),
                }
            } else {
                default_circuit_breaker()
            };

            // Get audit log counts for tasks completed/failed
            let audit = daemon.audit_log();
            let completed = audit
                .count_by_outcome(&goose::autonomous::audit_log::ActionOutcome::Success)
                .await
                .unwrap_or(0) as u64;
            let failed = audit
                .count_by_outcome(&goose::autonomous::audit_log::ActionOutcome::Failure)
                .await
                .unwrap_or(0) as u64;

            return Json(AutonomousStatus {
                running,
                uptime_seconds: 0, // AutonomousDaemon doesn't track start time yet
                tasks_completed: completed,
                tasks_failed: failed,
                circuit_breaker: cb,
                current_task: None,
            });
        }
    }

    Json(AutonomousStatus {
        running: false,
        uptime_seconds: 0,
        tasks_completed: 0,
        tasks_failed: 0,
        circuit_breaker: default_circuit_breaker(),
        current_task: None,
    })
}

/// POST /api/autonomous/start
///
/// Starts the autonomous daemon.
async fn autonomous_start(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AutonomousActionRequest>,
) -> Json<AutonomousStatus> {
    let agent = get_agent(&state, Some(&req.session_id)).await;

    if let Some(agent) = &agent {
        if let Some(daemon) = agent.autonomous_daemon().await {
            daemon.start();
        }
    }

    // Return fresh status
    autonomous_status(State(state)).await
}

/// POST /api/autonomous/stop
///
/// Stops the autonomous daemon.
async fn autonomous_stop(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AutonomousActionRequest>,
) -> Json<AutonomousStatus> {
    let agent = get_agent(&state, Some(&req.session_id)).await;

    if let Some(agent) = &agent {
        if let Some(daemon) = agent.autonomous_daemon().await {
            daemon.stop();
        }
    }

    // Return fresh status
    autonomous_status(State(state)).await
}

/// GET /api/autonomous/audit-log?limit=N
///
/// Returns recent autonomous actions from the audit log.
async fn autonomous_audit_log(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuditLogQuery>,
) -> Json<Vec<AuditLogEntry>> {
    let agent = get_agent(&state, None).await;

    if let Some(agent) = &agent {
        if let Some(daemon) = agent.autonomous_daemon().await {
            let audit = daemon.audit_log();
            if let Ok(entries) = audit.recent(query.limit as usize).await {
                let api_entries: Vec<AuditLogEntry> = entries
                    .into_iter()
                    .map(|e| AuditLogEntry {
                        id: e.entry_id,
                        timestamp: e.timestamp.to_rfc3339(),
                        action: e.action_type,
                        details: e.description,
                        outcome: e.outcome.to_string(),
                    })
                    .collect();
                return Json(api_entries);
            }
        }
    }

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
