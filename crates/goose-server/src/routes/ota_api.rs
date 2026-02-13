use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
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

#[derive(Deserialize, Default)]
pub struct OtaRestartRequest {
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub rebuild: bool,
    #[serde(default)]
    pub reason: Option<String>,
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
    pub restart_required: bool,
}

#[derive(Serialize)]
pub struct VersionInfo {
    pub version: String,
    pub build_timestamp: String,
    pub git_hash: String,
    pub binary_path: Option<String>,
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

            // Wire real data from UpdateScheduler state
            let sched_state = mgr.update_scheduler.state().await;

            let last_build_time = sched_state
                .last_update
                .or(sched_state.last_check)
                .map(|t| t.to_rfc3339());

            let last_build_result = if sched_state.consecutive_failures > 0 {
                Some("failed".to_string())
            } else if sched_state.total_updates > 0 {
                Some("success".to_string())
            } else {
                None
            };

            return Json(OtaStatus {
                state: status.to_string(),
                last_build_time,
                last_build_result,
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                pending_improvements: sched_state.consecutive_failures,
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
                    restart_required: false,
                });
            }
            // Real trigger
            let version = env!("CARGO_PKG_VERSION");
            match mgr.perform_update(version, "{}").await {
                Ok(result) => {
                    let success = result.status == goose::ota::UpdateStatus::Completed;
                    return Json(OtaTriggerResponse {
                        triggered: true,
                        cycle_id: Some(uuid::Uuid::new_v4().to_string()),
                        message: result.summary,
                        restart_required: success,
                    });
                }
                Err(e) => {
                    return Json(OtaTriggerResponse {
                        triggered: false,
                        cycle_id: None,
                        message: format!("OTA trigger failed: {}", e),
                        restart_required: false,
                    });
                }
            }
        }
    }

    Json(OtaTriggerResponse {
        triggered: false,
        cycle_id: None,
        message: "OTA manager not initialized".to_string(),
        restart_required: false,
    })
}

/// GET /api/ota/history
///
/// Returns past improvement cycle history from OtaManager.
async fn ota_history(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<ImprovementHistoryEntry>> {
    let agent = get_agent(&state, None).await;

    if let Some(agent) = &agent {
        let guard = agent.ota_manager_ref().await;
        if let Some(mgr) = guard.as_ref() {
            let entries: Vec<ImprovementHistoryEntry> = mgr
                .cycle_history()
                .iter()
                .enumerate()
                .map(|(i, result)| {
                    let test_summary = result
                        .health_report
                        .as_ref()
                        .map(|hr| {
                            let passed = hr.checks.iter().filter(|r| r.passed).count();
                            let total = hr.checks.len();
                            format!("{}/{} passed", passed, total)
                        });

                    ImprovementHistoryEntry {
                        cycle_id: format!("cycle-{}", i + 1),
                        started_at: mgr
                            .last_update_time()
                            .map(|t| t.to_rfc3339())
                            .unwrap_or_default(),
                        completed_at: Some(Utc::now().to_rfc3339()),
                        status: result.status.to_string(),
                        improvements_applied: if result.status == goose::ota::UpdateStatus::Completed { 1 } else { 0 },
                        test_results: test_summary,
                    }
                })
                .collect();
            return Json(entries);
        }
    }

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

            // Wire real uptime and current task
            let uptime = daemon.uptime_seconds();
            let current_task = daemon.current_task_description().await;

            return Json(AutonomousStatus {
                running,
                uptime_seconds: uptime,
                tasks_completed: completed,
                tasks_failed: failed,
                circuit_breaker: cb,
                current_task,
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
// Handlers — Version & Restart
// ---------------------------------------------------------------------------

/// GET /api/version
///
/// Returns build fingerprint for OTA binary detection.
async fn version_info() -> Json<VersionInfo> {
    Json(VersionInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_timestamp: env!("BUILD_TIMESTAMP").to_string(),
        git_hash: env!("BUILD_GIT_HASH").to_string(),
        binary_path: std::env::current_exe()
            .ok()
            .map(|p| p.to_string_lossy().to_string()),
    })
}

/// POST /api/ota/restart
///
/// Gracefully restarts the goosed process after OTA binary swap.
/// Writes a restart marker file so the next startup knows it was an OTA restart.
/// Uses exit code 42 to signal "intentional OTA restart" (vs 0=clean, 1=crash).
/// Delays exit by 500ms so the HTTP response can flush.
async fn ota_restart(
    body: Option<Json<OtaRestartRequest>>,
) -> Json<serde_json::Value> {
    let req = body.map(|b| b.0).unwrap_or_default();
    let reason = req.reason.unwrap_or_else(|| "ota_update".to_string());

    // Write restart marker for next startup to detect OTA restart
    if let Some(config_dir) = dirs::config_dir() {
        let marker_dir = config_dir.join("goose").join("ota");
        let _ = std::fs::create_dir_all(&marker_dir);
        let marker_path = marker_dir.join(".restart-pending");
        let marker = serde_json::json!({
            "reason": reason,
            "rebuild": req.rebuild,
            "force": req.force,
            "timestamp": chrono::Utc::now().timestamp(),
            "version": env!("CARGO_PKG_VERSION"),
        });
        if let Err(e) = std::fs::write(&marker_path, marker.to_string()) {
            tracing::warn!("Failed to write restart marker: {}", e);
        } else {
            tracing::info!("Restart marker written to {:?}", marker_path);
        }
    }

    let exit_code = if req.force { 1 } else { 42 };

    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        tracing::info!("OTA restart: shutting down for binary swap (exit code {})", exit_code);
        std::process::exit(exit_code);
    });

    Json(serde_json::json!({
        "restarting": true,
        "exit_code": exit_code,
        "reason": reason,
        "message": "Process will exit in 500ms for OTA restart"
    }))
}

/// GET /api/ota/restart-status
///
/// Check if a restart is pending (marker file exists).
async fn ota_restart_status() -> Json<serde_json::Value> {
    let pending = dirs::config_dir()
        .map(|d| d.join("goose").join("ota").join(".restart-pending").exists())
        .unwrap_or(false);

    Json(serde_json::json!({
        "restart_pending": pending,
    }))
}

// ---------------------------------------------------------------------------
// Agent Core Management
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SwitchCoreRequest {
    pub session_id: Option<String>,
    pub core_type: String,
}

#[derive(Serialize)]
pub struct SwitchCoreResponse {
    pub success: bool,
    pub active_core: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct CoreListEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub active: bool,
}

/// POST /api/agent/switch-core
async fn switch_core(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SwitchCoreRequest>,
) -> Json<SwitchCoreResponse> {
    let session_id = req.session_id.unwrap_or_else(|| "default".to_string());
    let agent = get_agent(&state, Some(&session_id)).await;

    if let Some(agent) = agent {
        match agent.switch_core(&req.core_type).await {
            Ok((name, desc)) => {
                return Json(SwitchCoreResponse {
                    success: true,
                    active_core: req.core_type.clone(),
                    message: format!("Switched to {} — {}", name, desc),
                });
            }
            Err(e) => {
                return Json(SwitchCoreResponse {
                    success: false,
                    active_core: agent.active_core_type().await,
                    message: format!("Failed to switch core: {}", e),
                });
            }
        }
    }

    Json(SwitchCoreResponse {
        success: false,
        active_core: "unknown".to_string(),
        message: "Agent not available".to_string(),
    })
}

/// GET /api/agent/cores
async fn list_cores(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<CoreListEntry>> {
    let agent = get_agent(&state, None).await;

    if let Some(agent) = agent {
        let active = agent.active_core_type().await;
        let cores = agent.list_cores();
        return Json(cores.into_iter().map(|c| CoreListEntry {
            active: c.core_type.to_string() == active,
            id: c.core_type.to_string(),
            name: c.name.clone(),
            description: c.description.clone(),
        }).collect());
    }

    Json(vec![])
}

// ---------------------------------------------------------------------------
// Agent Core Configuration (Builder tab persistence)
// ---------------------------------------------------------------------------

/// Configuration for automatic core selection — persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreAutoConfig {
    /// Whether the system automatically selects the best core for each task.
    #[serde(default = "default_auto_select")]
    pub auto_select: bool,
    /// Confidence threshold (0.1–1.0) for auto-selection.
    #[serde(default = "default_threshold")]
    pub threshold: f64,
    /// Preferred core type when confidence is below threshold.
    #[serde(default = "default_preferred_core")]
    pub preferred_core: String,
    /// Priority ordering of core IDs for selection.
    #[serde(default = "default_priorities")]
    pub priorities: Vec<String>,
}

fn default_auto_select() -> bool { true }
fn default_threshold() -> f64 { 0.7 }
fn default_preferred_core() -> String { "freeform".to_string() }
fn default_priorities() -> Vec<String> {
    vec![
        "freeform".to_string(),
        "structured".to_string(),
        "orchestrator".to_string(),
        "swarm".to_string(),
        "workflow".to_string(),
        "adversarial".to_string(),
    ]
}

impl Default for CoreAutoConfig {
    fn default() -> Self {
        Self {
            auto_select: default_auto_select(),
            threshold: default_threshold(),
            preferred_core: default_preferred_core(),
            priorities: default_priorities(),
        }
    }
}

/// Returns the path to the core-config JSON file.
fn core_config_path() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|d| d.join("goose").join("core-config.json"))
}

/// GET /api/agent/core-config — load saved core auto-selection config.
async fn get_core_config() -> Json<CoreAutoConfig> {
    if let Some(path) = core_config_path() {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<CoreAutoConfig>(&content) {
                    return Json(config);
                }
            }
        }
    }
    Json(CoreAutoConfig::default())
}

/// POST /api/agent/core-config — save core auto-selection config.
async fn set_core_config(
    Json(config): Json<CoreAutoConfig>,
) -> Json<serde_json::Value> {
    // Validate threshold range
    if config.threshold < 0.1 || config.threshold > 1.0 {
        return Json(serde_json::json!({
            "success": false,
            "message": "threshold must be between 0.1 and 1.0",
        }));
    }

    if let Some(path) = core_config_path() {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match serde_json::to_string_pretty(&config) {
            Ok(json) => match std::fs::write(&path, json) {
                Ok(_) => {
                    tracing::info!("Core config saved to {}", path.display());
                    return Json(serde_json::json!({
                        "success": true,
                        "message": "Configuration saved",
                    }));
                }
                Err(e) => {
                    tracing::warn!("Failed to write core config: {}", e);
                    return Json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to write config: {}", e),
                    }));
                }
            },
            Err(e) => {
                return Json(serde_json::json!({
                    "success": false,
                    "message": format!("Serialization error: {}", e),
                }));
            }
        }
    }

    Json(serde_json::json!({
        "success": false,
        "message": "Could not determine config directory",
    }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // Version endpoint (no state needed)
        .route("/api/version", get(version_info))
        // OTA endpoints
        .route("/api/ota/status", get(ota_status))
        .route("/api/ota/trigger", post(ota_trigger))
        .route("/api/ota/history", get(ota_history))
        .route("/api/ota/restart", post(ota_restart))
        .route("/api/ota/restart-status", get(ota_restart_status))
        // Autonomous endpoints
        .route("/api/autonomous/status", get(autonomous_status))
        .route("/api/autonomous/start", post(autonomous_start))
        .route("/api/autonomous/stop", post(autonomous_stop))
        .route("/api/autonomous/audit-log", get(autonomous_audit_log))
        // Agent core management
        .route("/api/agent/switch-core", post(switch_core))
        .route("/api/agent/cores", get(list_cores))
        .route("/api/agent/core-config", get(get_core_config).post(set_core_config))
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
            restart_required: true,
        };
        let json = serde_json::to_value(&trigger).unwrap();
        assert_eq!(json["triggered"], true);
        assert_eq!(json["cycle_id"], "cycle-001");
        assert_eq!(json["restart_required"], true);

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
    fn test_version_info_serialization() {
        let info = VersionInfo {
            version: "1.24.05".to_string(),
            build_timestamp: "1739475600".to_string(),
            git_hash: "abc1234".to_string(),
            binary_path: Some("/usr/local/bin/goosed".to_string()),
        };
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["version"], "1.24.05");
        assert_eq!(json["build_timestamp"], "1739475600");
        assert_eq!(json["git_hash"], "abc1234");
        assert_eq!(json["binary_path"], "/usr/local/bin/goosed");

        // Test with None binary_path
        let info2 = VersionInfo {
            version: "1.0.0".to_string(),
            build_timestamp: "0".to_string(),
            git_hash: "unknown".to_string(),
            binary_path: None,
        };
        let json2 = serde_json::to_value(&info2).unwrap();
        assert!(json2["binary_path"].is_null());
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

    #[test]
    fn test_core_auto_config_serialization() {
        let config = CoreAutoConfig::default();
        let json = serde_json::to_value(&config).unwrap();
        assert_eq!(json["auto_select"], true);
        assert_eq!(json["threshold"], 0.7);
        assert_eq!(json["preferred_core"], "freeform");
        assert_eq!(json["priorities"].as_array().unwrap().len(), 6);
        assert_eq!(json["priorities"][0], "freeform");
        assert_eq!(json["priorities"][5], "adversarial");
    }

    #[test]
    fn test_core_auto_config_deserialization() {
        let input = r#"{"auto_select":false,"threshold":0.3,"preferred_core":"structured","priorities":["structured","freeform"]}"#;
        let config: CoreAutoConfig = serde_json::from_str(input).unwrap();
        assert!(!config.auto_select);
        assert!((config.threshold - 0.3).abs() < 0.01);
        assert_eq!(config.preferred_core, "structured");
        assert_eq!(config.priorities.len(), 2);
    }

    #[test]
    fn test_core_auto_config_defaults_on_missing_fields() {
        let input = "{}";
        let config: CoreAutoConfig = serde_json::from_str(input).unwrap();
        assert!(config.auto_select);
        assert!((config.threshold - 0.7).abs() < 0.01);
        assert_eq!(config.preferred_core, "freeform");
        assert_eq!(config.priorities.len(), 6);
    }
}
