use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::Path,
    routing::{get, post, put},
    Json, Router,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use utoipa::ToSchema;

// ===========================================================================
// Gateway types
// ===========================================================================

/// Permissions breakdown returned by the gateway status endpoint.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayPermissions {
    pub total: u32,
    pub granted: u32,
    pub denied: u32,
}

/// Full gateway status returned by `GET /api/enterprise/gateway/status`.
/// Shape matches the frontend `GatewayStatus` interface.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub healthy: bool,
    pub uptime: String,
    pub version: String,
    pub audit_logging: bool,
    pub permissions: GatewayPermissions,
}

/// A single guardrail scan history entry.
/// Shape matches the frontend `ScanEntry` interface used by GuardrailsPanel.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScanEntry {
    pub id: String,
    pub timestamp: String,
    pub direction: String,  // "input" or "output"
    pub detector: String,
    pub result: String,     // "pass", "warn", "block"
    pub message: String,
    pub session_name: String,
}

/// Response for `GET /api/enterprise/guardrails/scans`.
#[derive(Serialize, Debug, ToSchema)]
pub struct GuardrailsScansResponse {
    pub scans: Vec<ScanEntry>,
}

/// Request body for `POST /api/enterprise/guardrails/scans`.
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecordScanRequest {
    pub direction: String,
    pub detector: String,
    pub result: String,
    pub message: String,
    pub session_name: String,
}

/// Response after recording a new scan.
#[derive(Serialize, Debug, ToSchema)]
pub struct RecordScanResponse {
    pub id: String,
    pub recorded: bool,
}

/// Request body for `PUT /api/enterprise/gateway/audit`.
#[derive(Deserialize, Debug, ToSchema)]
pub struct AuditLoggingRequest {
    pub enabled: bool,
}

/// Response for audit logging toggle.
#[derive(Serialize, Debug, ToSchema)]
pub struct AuditLoggingResponse {
    pub enabled: bool,
    pub updated: bool,
}

// ===========================================================================
// Enterprise Guardrails types (separate from features guardrails)
// ===========================================================================

/// A single guardrail detector configuration.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[allow(dead_code)]
pub struct GuardrailDetector {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub sensitivity: String, // "low", "medium", "high"
}

/// Enterprise guardrails configuration.
/// Shape matches the frontend `GuardrailsConfig` interface used by enterprise panel.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
pub struct EnterpriseGuardrailsConfig {
    pub enabled: bool,
    pub mode: String, // "warn" or "block"
    pub rules: Vec<Value>,
}

/// Request for updating enterprise guardrails (partial update).
#[derive(Deserialize, Debug, ToSchema)]
pub struct UpdateEnterpriseGuardrailsRequest {
    pub enabled: Option<bool>,
    pub mode: Option<String>,
    pub rules: Option<Vec<Value>>,
}

// ===========================================================================
// Hooks types
// ===========================================================================

/// A single hook event configuration.
/// Shape matches the frontend `HookEvent` interface.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct HookEvent {
    pub id: String,
    pub name: String,
    pub category: String, // "session", "tools", "flow"
    pub enabled: bool,
    pub recent_count: u32,
}

/// Response for `GET /api/enterprise/hooks/events`.
#[derive(Serialize, Debug, ToSchema)]
pub struct HooksEventsResponse {
    pub events: Vec<HookEvent>,
}

/// Request body for `POST /api/enterprise/hooks/events/{id}`.
#[derive(Deserialize, Debug, ToSchema)]
pub struct ToggleHookRequest {
    pub enabled: bool,
}

/// Response after toggling a hook.
#[derive(Serialize, Debug, ToSchema)]
pub struct ToggleHookResponse {
    pub id: String,
    pub enabled: bool,
    pub updated: bool,
}

// ===========================================================================
// Memory types
// ===========================================================================

/// A single memory subsystem status.
/// Shape matches the frontend `MemorySubsystem` interface.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MemorySubsystem {
    pub id: String,
    pub name: String,
    pub status: String, // "active", "inactive", "degraded"
    pub item_count: u32,
    pub decay_rate: String,
}

/// Response for `GET /api/enterprise/memory/summary`.
#[derive(Serialize, Debug, ToSchema)]
pub struct MemorySummaryResponse {
    pub subsystems: Vec<MemorySubsystem>,
}

/// Response for `POST /api/enterprise/memory/consolidate`.
#[derive(Serialize, Debug, ToSchema)]
pub struct MemoryConsolidateResponse {
    pub success: bool,
    pub message: String,
}

// ===========================================================================
// Observability types
// ===========================================================================

/// Token usage data.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub total_tokens: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub estimated_cost: String,
    pub period: String,
}

/// Full observability config.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ObservabilityConfig {
    pub cost_tracking_enabled: bool,
    pub usage: TokenUsage,
}

/// Request body for `PUT /api/enterprise/observability`.
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateObservabilityRequest {
    pub cost_tracking_enabled: Option<bool>,
}

// ===========================================================================
// Policies types
// ===========================================================================

/// A single policy rule.
/// Shape matches the frontend `PolicyRule` interface.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
pub struct PolicyRule {
    pub id: String,
    pub name: String,
    pub condition: String,
    pub action: String,
    pub enabled: bool,
}

/// Response for `GET /api/enterprise/policies/rules`.
/// Shape matches the frontend `PolicyRules` interface.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRulesResponse {
    pub rules: Vec<PolicyRule>,
    pub dry_run_mode: bool,
}

/// Request body for `POST /api/enterprise/policies/rules/{id}`.
#[derive(Deserialize, Debug, ToSchema)]
pub struct ToggleRuleRequest {
    pub enabled: bool,
}

/// Response after toggling a policy rule.
#[derive(Serialize, Debug, ToSchema)]
pub struct ToggleRuleResponse {
    pub id: String,
    pub enabled: bool,
    pub updated: bool,
}

/// Request body for `PUT /api/enterprise/policies/dry-run`.
#[derive(Deserialize, Debug, ToSchema)]
pub struct DryRunModeRequest {
    pub enabled: bool,
}

/// Response after updating dry-run mode.
#[derive(Serialize, Debug, ToSchema)]
pub struct DryRunModeResponse {
    pub enabled: bool,
    pub updated: bool,
}

// ===========================================================================
// In-Memory State
// ===========================================================================

/// Central enterprise state stored in process memory.
/// Each field is wrapped in `Arc<Mutex<_>>` so handlers can share state
/// without requiring `&mut self`.
#[derive(Clone)]
struct EnterpriseState {
    gateway: Arc<Mutex<GatewayStatus>>,
    guardrails: Arc<Mutex<EnterpriseGuardrailsConfig>>,
    scan_history: Arc<Mutex<Vec<ScanEntry>>>,
    hooks: Arc<Mutex<Vec<HookEvent>>>,
    memory_subsystems: Arc<Mutex<Vec<MemorySubsystem>>>,
    observability: Arc<Mutex<ObservabilityConfig>>,
    policy_rules: Arc<Mutex<Vec<PolicyRule>>>,
    dry_run_mode: Arc<Mutex<bool>>,
}

impl Default for EnterpriseState {
    fn default() -> Self {
        Self {
            gateway: Arc::new(Mutex::new(default_gateway_status())),
            guardrails: Arc::new(Mutex::new(default_guardrails_config())),
            scan_history: Arc::new(Mutex::new(default_scan_history())),
            hooks: Arc::new(Mutex::new(default_hooks())),
            memory_subsystems: Arc::new(Mutex::new(default_memory_subsystems())),
            observability: Arc::new(Mutex::new(default_observability())),
            policy_rules: Arc::new(Mutex::new(default_policy_rules())),
            dry_run_mode: Arc::new(Mutex::new(false)),
        }
    }
}

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

fn default_gateway_status() -> GatewayStatus {
    GatewayStatus {
        healthy: true,
        uptime: "3d 14h 22m".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        audit_logging: false,
        permissions: GatewayPermissions {
            total: 12,
            granted: 10,
            denied: 2,
        },
    }
}

fn default_guardrails_config() -> EnterpriseGuardrailsConfig {
    EnterpriseGuardrailsConfig {
        enabled: false,
        mode: "block".to_string(),
        rules: vec![],
    }
}

fn default_scan_history() -> Vec<ScanEntry> {
    vec![
        ScanEntry {
            id: "scan-001".to_string(),
            timestamp: "2026-02-10T14:35:12Z".to_string(),
            direction: "input".to_string(),
            detector: "Prompt Injection".to_string(),
            result: "pass".to_string(),
            message: "No injection patterns detected in user prompt.".to_string(),
            session_name: "Refactor authentication module".to_string(),
        },
        ScanEntry {
            id: "scan-002".to_string(),
            timestamp: "2026-02-10T14:35:14Z".to_string(),
            direction: "output".to_string(),
            detector: "Secret Scanner".to_string(),
            result: "warn".to_string(),
            message: "Potential API key pattern detected in generated code. Pattern: sk-...".to_string(),
            session_name: "Refactor authentication module".to_string(),
        },
        ScanEntry {
            id: "scan-003".to_string(),
            timestamp: "2026-02-10T14:32:05Z".to_string(),
            direction: "input".to_string(),
            detector: "PII Detection".to_string(),
            result: "pass".to_string(),
            message: "No personal identifiable information found.".to_string(),
            session_name: "Refactor authentication module".to_string(),
        },
        ScanEntry {
            id: "scan-004".to_string(),
            timestamp: "2026-02-09T11:10:22Z".to_string(),
            direction: "output".to_string(),
            detector: "Secret Scanner".to_string(),
            result: "block".to_string(),
            message: "Database connection string with credentials detected and redacted from output.".to_string(),
            session_name: "Fix database connection pooling".to_string(),
        },
        ScanEntry {
            id: "scan-005".to_string(),
            timestamp: "2026-02-09T11:10:18Z".to_string(),
            direction: "input".to_string(),
            detector: "Jailbreak".to_string(),
            result: "pass".to_string(),
            message: "No jailbreak attempts detected.".to_string(),
            session_name: "Fix database connection pooling".to_string(),
        },
        ScanEntry {
            id: "scan-006".to_string(),
            timestamp: "2026-02-08T16:42:30Z".to_string(),
            direction: "output".to_string(),
            detector: "Keyword Filter".to_string(),
            result: "warn".to_string(),
            message: "Test data contains email addresses that may be real. Flagged for review.".to_string(),
            session_name: "Add unit tests for payment service".to_string(),
        },
        ScanEntry {
            id: "scan-007".to_string(),
            timestamp: "2026-02-08T16:42:28Z".to_string(),
            direction: "input".to_string(),
            detector: "Topic Filter".to_string(),
            result: "pass".to_string(),
            message: "Message topic within approved boundaries.".to_string(),
            session_name: "Add unit tests for payment service".to_string(),
        },
        ScanEntry {
            id: "scan-008".to_string(),
            timestamp: "2026-02-07T09:15:44Z".to_string(),
            direction: "input".to_string(),
            detector: "Prompt Injection".to_string(),
            result: "warn".to_string(),
            message: "Input contains system prompt override language. Allowed but flagged.".to_string(),
            session_name: "Deploy staging environment".to_string(),
        },
        ScanEntry {
            id: "scan-009".to_string(),
            timestamp: "2026-02-07T09:15:47Z".to_string(),
            direction: "output".to_string(),
            detector: "PII Detection".to_string(),
            result: "pass".to_string(),
            message: "No PII found in output.".to_string(),
            session_name: "Deploy staging environment".to_string(),
        },
        ScanEntry {
            id: "scan-010".to_string(),
            timestamp: "2026-02-06T13:45:10Z".to_string(),
            direction: "output".to_string(),
            detector: "Secret Scanner".to_string(),
            result: "pass".to_string(),
            message: "No secrets or credentials in output.".to_string(),
            session_name: "Optimize image processing pipeline".to_string(),
        },
    ]
}

fn default_hooks() -> Vec<HookEvent> {
    vec![
        HookEvent {
            id: "session_start".to_string(),
            name: "Session Start".to_string(),
            category: "session".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "session_end".to_string(),
            name: "Session End".to_string(),
            category: "session".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "session_pause".to_string(),
            name: "Session Pause".to_string(),
            category: "session".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "session_resume".to_string(),
            name: "Session Resume".to_string(),
            category: "session".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "tool_call_start".to_string(),
            name: "Tool Call Start".to_string(),
            category: "tools".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "tool_call_end".to_string(),
            name: "Tool Call End".to_string(),
            category: "tools".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "tool_error".to_string(),
            name: "Tool Error".to_string(),
            category: "tools".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "tool_approval".to_string(),
            name: "Tool Approval".to_string(),
            category: "tools".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "tool_rejection".to_string(),
            name: "Tool Rejection".to_string(),
            category: "tools".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "message_received".to_string(),
            name: "Message Received".to_string(),
            category: "flow".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "response_generated".to_string(),
            name: "Response Generated".to_string(),
            category: "flow".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "guardrail_triggered".to_string(),
            name: "Guardrail Triggered".to_string(),
            category: "flow".to_string(),
            enabled: false,
            recent_count: 0,
        },
        HookEvent {
            id: "policy_evaluated".to_string(),
            name: "Policy Evaluated".to_string(),
            category: "flow".to_string(),
            enabled: false,
            recent_count: 0,
        },
    ]
}

fn default_memory_subsystems() -> Vec<MemorySubsystem> {
    vec![
        MemorySubsystem {
            id: "working".to_string(),
            name: "Working".to_string(),
            status: "active".to_string(),
            item_count: 24,
            decay_rate: "~5min".to_string(),
        },
        MemorySubsystem {
            id: "episodic".to_string(),
            name: "Episodic".to_string(),
            status: "active".to_string(),
            item_count: 156,
            decay_rate: "~24h".to_string(),
        },
        MemorySubsystem {
            id: "semantic".to_string(),
            name: "Semantic".to_string(),
            status: "active".to_string(),
            item_count: 1024,
            decay_rate: "~30d".to_string(),
        },
        MemorySubsystem {
            id: "procedural".to_string(),
            name: "Procedural".to_string(),
            status: "inactive".to_string(),
            item_count: 0,
            decay_rate: "N/A".to_string(),
        },
    ]
}

fn default_observability() -> ObservabilityConfig {
    ObservabilityConfig {
        cost_tracking_enabled: false,
        usage: TokenUsage {
            total_tokens: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            estimated_cost: "$0.00".to_string(),
            period: "current session".to_string(),
        },
    }
}

fn default_policy_rules() -> Vec<PolicyRule> {
    vec![
        PolicyRule {
            id: "no_secrets".to_string(),
            name: "No Secrets in Output".to_string(),
            condition: "output_contains_secret".to_string(),
            action: "block".to_string(),
            enabled: true,
        },
        PolicyRule {
            id: "rate_limit".to_string(),
            name: "Rate Limiting".to_string(),
            condition: "requests_per_minute > 60".to_string(),
            action: "throttle".to_string(),
            enabled: true,
        },
        PolicyRule {
            id: "content_filter".to_string(),
            name: "Content Filter".to_string(),
            condition: "content_policy_violation".to_string(),
            action: "warn".to_string(),
            enabled: true,
        },
        PolicyRule {
            id: "audit_all".to_string(),
            name: "Audit All Actions".to_string(),
            condition: "always".to_string(),
            action: "log".to_string(),
            enabled: false,
        },
    ]
}

// Global state instance
static STATE: Lazy<EnterpriseState> = Lazy::new(EnterpriseState::default);

/// Monotonic counter for scan IDs — never resets, guarantees uniqueness.
static SCAN_COUNTER: AtomicU64 = AtomicU64::new(0);

// ===========================================================================
// Gateway handlers
// ===========================================================================

/// `GET /api/enterprise/gateway/status`
///
/// Returns the current gateway status including health, uptime, version,
/// audit logging state, and permissions summary.
#[utoipa::path(
    get,
    path = "/api/enterprise/gateway/status",
    responses(
        (status = 200, description = "Gateway status retrieved", body = GatewayStatus),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_gateway_status() -> Result<Json<GatewayStatus>, ErrorResponse> {
    let status = STATE
        .gateway
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(status))
}

/// `PUT /api/enterprise/gateway/audit`
///
/// Toggle audit logging on or off.
#[utoipa::path(
    put,
    path = "/api/enterprise/gateway/audit",
    request_body = AuditLoggingRequest,
    responses(
        (status = 200, description = "Audit logging toggled", body = AuditLoggingResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn update_gateway_audit(
    Json(body): Json<AuditLoggingRequest>,
) -> Result<Json<AuditLoggingResponse>, ErrorResponse> {
    let mut gw = STATE
        .gateway
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;
    gw.audit_logging = body.enabled;
    Ok(Json(AuditLoggingResponse {
        enabled: body.enabled,
        updated: true,
    }))
}

// ===========================================================================
// Enterprise Guardrails handlers
// ===========================================================================

/// `GET /api/enterprise/guardrails`
///
/// Returns the enterprise guardrails configuration (detectors, mode, rules).
#[utoipa::path(
    get,
    path = "/api/enterprise/guardrails",
    responses(
        (status = 200, description = "Enterprise guardrails config", body = EnterpriseGuardrailsConfig),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_enterprise_guardrails() -> Result<Json<EnterpriseGuardrailsConfig>, ErrorResponse> {
    let config = STATE
        .guardrails
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(config))
}

/// `PUT /api/enterprise/guardrails`
///
/// Update enterprise guardrails configuration (partial merge).
#[utoipa::path(
    put,
    path = "/api/enterprise/guardrails",
    request_body = UpdateEnterpriseGuardrailsRequest,
    responses(
        (status = 200, description = "Enterprise guardrails updated", body = EnterpriseGuardrailsConfig),
        (status = 400, description = "Invalid mode value"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn update_enterprise_guardrails(
    Json(body): Json<UpdateEnterpriseGuardrailsRequest>,
) -> Result<Json<EnterpriseGuardrailsConfig>, ErrorResponse> {
    let mut config = STATE
        .guardrails
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    // Validate mode if provided
    if let Some(ref mode) = body.mode {
        if mode != "warn" && mode != "block" {
            return Err(ErrorResponse::bad_request(format!(
                "Invalid guardrails mode '{}': must be 'warn' or 'block'",
                mode
            )));
        }
        config.mode = mode.clone();
    }

    if let Some(enabled) = body.enabled {
        config.enabled = enabled;
    }

    if let Some(ref rules) = body.rules {
        config.rules = rules.clone();
    }

    Ok(Json(config.clone()))
}

// ===========================================================================
// Guardrails scan history handlers
// ===========================================================================

/// `GET /api/enterprise/guardrails/scans`
///
/// Returns the guardrail scan history, ordered by most recent first.
#[utoipa::path(
    get,
    path = "/api/enterprise/guardrails/scans",
    responses(
        (status = 200, description = "Guardrails scan history", body = GuardrailsScansResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_guardrails_scans() -> Result<Json<GuardrailsScansResponse>, ErrorResponse> {
    let scans = STATE
        .scan_history
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(GuardrailsScansResponse { scans }))
}

/// `POST /api/enterprise/guardrails/scans`
///
/// Record a new guardrail scan entry. The server assigns the `id` automatically.
#[utoipa::path(
    post,
    path = "/api/enterprise/guardrails/scans",
    request_body = RecordScanRequest,
    responses(
        (status = 200, description = "Scan recorded", body = RecordScanResponse),
        (status = 400, description = "Invalid direction or result value"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn record_guardrails_scan(
    Json(body): Json<RecordScanRequest>,
) -> Result<Json<RecordScanResponse>, ErrorResponse> {
    // Validate direction
    if body.direction != "input" && body.direction != "output" {
        return Err(ErrorResponse::bad_request(format!(
            "Invalid scan direction '{}': must be 'input' or 'output'",
            body.direction
        )));
    }

    // Validate result
    if body.result != "pass" && body.result != "warn" && body.result != "block" {
        return Err(ErrorResponse::bad_request(format!(
            "Invalid scan result '{}': must be 'pass', 'warn', or 'block'",
            body.result
        )));
    }

    let mut scans = STATE
        .scan_history
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let id = format!("scan-{:03}", SCAN_COUNTER.fetch_add(1, Ordering::Relaxed) + 1);

    let entry = ScanEntry {
        id: id.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        direction: body.direction,
        detector: body.detector,
        result: body.result,
        message: body.message,
        session_name: body.session_name,
    };

    // Insert at the beginning so newest entries come first
    scans.insert(0, entry);

    Ok(Json(RecordScanResponse {
        id,
        recorded: true,
    }))
}

// ===========================================================================
// Hooks handlers
// ===========================================================================

/// `GET /api/enterprise/hooks/events`
///
/// Returns all lifecycle hook event configurations.
#[utoipa::path(
    get,
    path = "/api/enterprise/hooks/events",
    responses(
        (status = 200, description = "Hook events retrieved", body = HooksEventsResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_hooks_events() -> Result<Json<HooksEventsResponse>, ErrorResponse> {
    let events = STATE
        .hooks
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(HooksEventsResponse { events }))
}

/// `POST /api/enterprise/hooks/events/{id}`
///
/// Toggle a single hook event on or off.
#[utoipa::path(
    post,
    path = "/api/enterprise/hooks/events/{id}",
    params(
        ("id" = String, Path, description = "The hook event ID to toggle")
    ),
    request_body = ToggleHookRequest,
    responses(
        (status = 200, description = "Hook toggled", body = ToggleHookResponse),
        (status = 404, description = "Hook not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn toggle_hook_event(
    Path(id): Path<String>,
    Json(body): Json<ToggleHookRequest>,
) -> Result<Json<ToggleHookResponse>, ErrorResponse> {
    let mut hooks = STATE
        .hooks
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let hook = hooks
        .iter_mut()
        .find(|h| h.id == id)
        .ok_or_else(|| ErrorResponse::not_found(format!("Hook event '{}' not found", id)))?;

    hook.enabled = body.enabled;
    Ok(Json(ToggleHookResponse {
        id,
        enabled: body.enabled,
        updated: true,
    }))
}

// ===========================================================================
// Memory handlers
// ===========================================================================

/// `GET /api/enterprise/memory/summary`
///
/// Returns the status of all memory subsystems.
#[utoipa::path(
    get,
    path = "/api/enterprise/memory/summary",
    responses(
        (status = 200, description = "Memory summary retrieved", body = MemorySummaryResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_memory_summary() -> Result<Json<MemorySummaryResponse>, ErrorResponse> {
    let subsystems = STATE
        .memory_subsystems
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(MemorySummaryResponse { subsystems }))
}

/// `POST /api/enterprise/memory/consolidate`
///
/// Trigger memory consolidation across all subsystems.
#[utoipa::path(
    post,
    path = "/api/enterprise/memory/consolidate",
    responses(
        (status = 200, description = "Memory consolidation triggered", body = MemoryConsolidateResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn consolidate_memory() -> Result<Json<MemoryConsolidateResponse>, ErrorResponse> {
    // TODO: Wire to actual memory consolidation logic when available.
    // Return an honest "not implemented" response so the frontend can
    // display appropriate UI rather than claiming success.
    Ok(Json(MemoryConsolidateResponse {
        success: false,
        message: "Memory consolidation is not yet implemented".to_string(),
    }))
}

// ===========================================================================
// Observability handlers
// ===========================================================================

/// `GET /api/enterprise/observability`
///
/// Returns the current observability/telemetry configuration and usage data.
#[utoipa::path(
    get,
    path = "/api/enterprise/observability",
    responses(
        (status = 200, description = "Observability config retrieved", body = ObservabilityConfig),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_observability() -> Result<Json<ObservabilityConfig>, ErrorResponse> {
    let config = STATE
        .observability
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(config))
}

/// `PUT /api/enterprise/observability`
///
/// Update observability settings (e.g., toggle cost tracking).
#[utoipa::path(
    put,
    path = "/api/enterprise/observability",
    request_body = UpdateObservabilityRequest,
    responses(
        (status = 200, description = "Observability config updated", body = ObservabilityConfig),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn update_observability(
    Json(body): Json<UpdateObservabilityRequest>,
) -> Result<Json<ObservabilityConfig>, ErrorResponse> {
    let mut config = STATE
        .observability
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    if let Some(enabled) = body.cost_tracking_enabled {
        config.cost_tracking_enabled = enabled;
    }

    Ok(Json(config.clone()))
}

// ===========================================================================
// Policies handlers
// ===========================================================================

/// `GET /api/enterprise/policies/rules`
///
/// Returns all policy rules and the dry-run mode flag.
#[utoipa::path(
    get,
    path = "/api/enterprise/policies/rules",
    responses(
        (status = 200, description = "Policy rules retrieved", body = PolicyRulesResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn get_policy_rules() -> Result<Json<PolicyRulesResponse>, ErrorResponse> {
    let rules = STATE
        .policy_rules
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();

    let dry_run = *STATE
        .dry_run_mode
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    Ok(Json(PolicyRulesResponse {
        rules,
        dry_run_mode: dry_run,
    }))
}

/// `POST /api/enterprise/policies/rules/{id}`
///
/// Toggle a single policy rule on or off.
#[utoipa::path(
    post,
    path = "/api/enterprise/policies/rules/{id}",
    params(
        ("id" = String, Path, description = "The rule ID to toggle")
    ),
    request_body = ToggleRuleRequest,
    responses(
        (status = 200, description = "Rule toggled", body = ToggleRuleResponse),
        (status = 404, description = "Rule not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn toggle_policy_rule(
    Path(id): Path<String>,
    Json(body): Json<ToggleRuleRequest>,
) -> Result<Json<ToggleRuleResponse>, ErrorResponse> {
    let mut rules = STATE
        .policy_rules
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let rule = rules
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| ErrorResponse::not_found(format!("Policy rule '{}' not found", id)))?;

    rule.enabled = body.enabled;
    Ok(Json(ToggleRuleResponse {
        id,
        enabled: body.enabled,
        updated: true,
    }))
}

/// `PUT /api/enterprise/policies/dry-run`
///
/// Enable or disable dry-run mode for all policies.
#[utoipa::path(
    put,
    path = "/api/enterprise/policies/dry-run",
    request_body = DryRunModeRequest,
    responses(
        (status = 200, description = "Dry-run mode updated", body = DryRunModeResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Enterprise"
)]
async fn update_dry_run_mode(
    Json(body): Json<DryRunModeRequest>,
) -> Result<Json<DryRunModeResponse>, ErrorResponse> {
    let mut dry_run = STATE
        .dry_run_mode
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    *dry_run = body.enabled;
    Ok(Json(DryRunModeResponse {
        enabled: body.enabled,
        updated: true,
    }))
}

// ===========================================================================
// Router
// ===========================================================================

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // Gateway
        .route(
            "/api/enterprise/gateway/status",
            get(get_gateway_status),
        )
        .route(
            "/api/enterprise/gateway/audit",
            put(update_gateway_audit),
        )
        // Enterprise Guardrails
        .route(
            "/api/enterprise/guardrails",
            get(get_enterprise_guardrails).put(update_enterprise_guardrails),
        )
        .route(
            "/api/enterprise/guardrails/scans",
            get(get_guardrails_scans).post(record_guardrails_scan),
        )
        // Hooks
        .route(
            "/api/enterprise/hooks/events",
            get(get_hooks_events),
        )
        .route(
            "/api/enterprise/hooks/events/{id}",
            post(toggle_hook_event),
        )
        // Memory
        .route(
            "/api/enterprise/memory/summary",
            get(get_memory_summary),
        )
        .route(
            "/api/enterprise/memory/consolidate",
            post(consolidate_memory),
        )
        // Observability
        .route(
            "/api/enterprise/observability",
            get(get_observability).put(update_observability),
        )
        // Policies
        .route(
            "/api/enterprise/policies/rules",
            get(get_policy_rules),
        )
        .route(
            "/api/enterprise/policies/rules/{id}",
            post(toggle_policy_rule),
        )
        .route(
            "/api/enterprise/policies/dry-run",
            put(update_dry_run_mode),
        )
        .with_state(state)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Router signature
    // -----------------------------------------------------------------------

    #[test]
    fn test_routes_creation() {
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }

    // -----------------------------------------------------------------------
    // Gateway
    // -----------------------------------------------------------------------

    #[test]
    fn test_gateway_status_serialization() {
        let status = default_gateway_status();
        let json = serde_json::to_string(&status).expect("serialize gateway status");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse JSON");

        assert_eq!(parsed["healthy"], true);
        assert_eq!(parsed["uptime"], "3d 14h 22m");
        assert_eq!(parsed["version"], "1.24.05");
        assert_eq!(parsed["auditLogging"], false);
        assert_eq!(parsed["permissions"]["total"], 12);
        assert_eq!(parsed["permissions"]["granted"], 10);
        assert_eq!(parsed["permissions"]["denied"], 2);
    }

    #[test]
    fn test_gateway_status_camel_case() {
        let status = GatewayStatus {
            healthy: false,
            uptime: "1h".to_string(),
            version: "1.0".to_string(),
            audit_logging: true,
            permissions: GatewayPermissions {
                total: 5,
                granted: 3,
                denied: 2,
            },
        };
        let json = serde_json::to_string(&status).unwrap();
        // Verify camelCase serialization
        assert!(json.contains("\"auditLogging\":true"));
        assert!(!json.contains("audit_logging"));
    }

    #[test]
    fn test_audit_logging_request_deserialization() {
        let json = r#"{"enabled": true}"#;
        let req: AuditLoggingRequest = serde_json::from_str(json).expect("deserialize");
        assert!(req.enabled);

        let json_false = r#"{"enabled": false}"#;
        let req: AuditLoggingRequest = serde_json::from_str(json_false).expect("deserialize");
        assert!(!req.enabled);
    }

    // -----------------------------------------------------------------------
    // Enterprise Guardrails
    // -----------------------------------------------------------------------

    #[test]
    fn test_guardrails_config_serialization() {
        let config = default_guardrails_config();
        let json = serde_json::to_string(&config).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["enabled"], false);
        assert_eq!(parsed["mode"], "block");
        assert!(parsed["rules"].is_array());
        assert_eq!(parsed["rules"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn test_guardrails_update_request_deserialization() {
        // Full update
        let json = r#"{"enabled": true, "mode": "warn", "rules": [{"id": "test"}]}"#;
        let req: UpdateEnterpriseGuardrailsRequest =
            serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.enabled, Some(true));
        assert_eq!(req.mode.as_deref(), Some("warn"));
        assert!(req.rules.is_some());
        assert_eq!(req.rules.unwrap().len(), 1);

        // Partial update — only mode
        let json_partial = r#"{"mode": "block"}"#;
        let req: UpdateEnterpriseGuardrailsRequest =
            serde_json::from_str(json_partial).expect("deserialize");
        assert!(req.enabled.is_none());
        assert_eq!(req.mode.as_deref(), Some("block"));
        assert!(req.rules.is_none());

        // Empty update
        let json_empty = r#"{}"#;
        let req: UpdateEnterpriseGuardrailsRequest =
            serde_json::from_str(json_empty).expect("deserialize");
        assert!(req.enabled.is_none());
        assert!(req.mode.is_none());
        assert!(req.rules.is_none());
    }

    // -----------------------------------------------------------------------
    // Guardrails Scan History
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_scan_history() {
        let scans = default_scan_history();
        assert_eq!(scans.len(), 10, "Expected 10 default scan entries");

        // Verify first entry
        assert_eq!(scans[0].id, "scan-001");
        assert_eq!(scans[0].direction, "input");
        assert_eq!(scans[0].detector, "Prompt Injection");
        assert_eq!(scans[0].result, "pass");

        // Verify we have all three result types
        let pass_count = scans.iter().filter(|s| s.result == "pass").count();
        let warn_count = scans.iter().filter(|s| s.result == "warn").count();
        let block_count = scans.iter().filter(|s| s.result == "block").count();
        assert!(pass_count > 0, "Expected some pass results");
        assert!(warn_count > 0, "Expected some warn results");
        assert!(block_count > 0, "Expected some block results");

        // Verify we have both directions
        let input_count = scans.iter().filter(|s| s.direction == "input").count();
        let output_count = scans.iter().filter(|s| s.direction == "output").count();
        assert!(input_count > 0, "Expected some input scans");
        assert!(output_count > 0, "Expected some output scans");
    }

    #[test]
    fn test_scan_entry_serialization_camel_case() {
        let entry = ScanEntry {
            id: "scan-100".to_string(),
            timestamp: "2026-02-12T10:00:00Z".to_string(),
            direction: "output".to_string(),
            detector: "Secret Scanner".to_string(),
            result: "warn".to_string(),
            message: "Found a secret".to_string(),
            session_name: "Test Session".to_string(),
        };

        let json = serde_json::to_string(&entry).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        // Verify camelCase serialization
        assert_eq!(parsed["id"], "scan-100");
        assert_eq!(parsed["sessionName"], "Test Session");
        assert!(!json.contains("session_name"), "Should use camelCase, not snake_case");
    }

    #[test]
    fn test_scan_entry_roundtrip() {
        let original = ScanEntry {
            id: "scan-999".to_string(),
            timestamp: "2026-02-12T12:00:00Z".to_string(),
            direction: "input".to_string(),
            detector: "PII Detection".to_string(),
            result: "block".to_string(),
            message: "PII detected".to_string(),
            session_name: "My Session".to_string(),
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: ScanEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, original.id);
        assert_eq!(deserialized.timestamp, original.timestamp);
        assert_eq!(deserialized.direction, original.direction);
        assert_eq!(deserialized.detector, original.detector);
        assert_eq!(deserialized.result, original.result);
        assert_eq!(deserialized.message, original.message);
        assert_eq!(deserialized.session_name, original.session_name);
    }

    #[test]
    fn test_record_scan_request_deserialization() {
        let json = r#"{
            "direction": "output",
            "detector": "Secret Scanner",
            "result": "warn",
            "message": "API key pattern found",
            "sessionName": "Test Session"
        }"#;
        let req: RecordScanRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.direction, "output");
        assert_eq!(req.detector, "Secret Scanner");
        assert_eq!(req.result, "warn");
        assert_eq!(req.message, "API key pattern found");
        assert_eq!(req.session_name, "Test Session");
    }

    #[test]
    fn test_guardrails_scans_response_serialization() {
        let scans = vec![
            ScanEntry {
                id: "scan-001".to_string(),
                timestamp: "2026-02-12T10:00:00Z".to_string(),
                direction: "input".to_string(),
                detector: "PII".to_string(),
                result: "pass".to_string(),
                message: "Clean".to_string(),
                session_name: "Session A".to_string(),
            },
        ];
        let response = GuardrailsScansResponse { scans };
        let json = serde_json::to_string(&response).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(parsed["scans"].is_array());
        assert_eq!(parsed["scans"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["scans"][0]["id"], "scan-001");
        assert_eq!(parsed["scans"][0]["sessionName"], "Session A");
    }

    #[test]
    fn test_scan_history_state_initialized() {
        let state = EnterpriseState::default();
        let scans = state.scan_history.lock().unwrap();
        assert_eq!(scans.len(), 10, "Expected 10 default scans in state");
    }

    // -----------------------------------------------------------------------
    // Hooks
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_hooks_structure() {
        let hooks = default_hooks();
        assert_eq!(hooks.len(), 13, "Expected 13 default hook events");

        // Verify categories
        let session_count = hooks.iter().filter(|h| h.category == "session").count();
        let tools_count = hooks.iter().filter(|h| h.category == "tools").count();
        let flow_count = hooks.iter().filter(|h| h.category == "flow").count();

        assert_eq!(session_count, 4, "Expected 4 session hooks");
        assert_eq!(tools_count, 5, "Expected 5 tools hooks");
        assert_eq!(flow_count, 4, "Expected 4 flow hooks");

        // All disabled by default
        let enabled_count = hooks.iter().filter(|h| h.enabled).count();
        assert_eq!(enabled_count, 0, "All hooks should be disabled by default");

        // All recent_count = 0
        let all_zero = hooks.iter().all(|h| h.recent_count == 0);
        assert!(all_zero, "All hooks should have recent_count = 0");
    }

    #[test]
    fn test_hooks_events_response_serialization() {
        let events = vec![HookEvent {
            id: "session_start".to_string(),
            name: "Session Start".to_string(),
            category: "session".to_string(),
            enabled: true,
            recent_count: 5,
        }];

        let response = HooksEventsResponse { events };
        let json = serde_json::to_string(&response).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(parsed["events"].is_array());
        let first = &parsed["events"][0];
        assert_eq!(first["id"], "session_start");
        assert_eq!(first["name"], "Session Start");
        assert_eq!(first["category"], "session");
        assert_eq!(first["enabled"], true);
        // Verify camelCase
        assert_eq!(first["recentCount"], 5);
    }

    #[test]
    fn test_toggle_hook_request_deserialization() {
        let json = r#"{"enabled": true}"#;
        let req: ToggleHookRequest = serde_json::from_str(json).expect("deserialize");
        assert!(req.enabled);
    }

    // -----------------------------------------------------------------------
    // Memory
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_memory_subsystems() {
        let subsystems = default_memory_subsystems();
        assert_eq!(subsystems.len(), 4, "Expected 4 memory subsystems");

        let ids: Vec<&str> = subsystems.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"working"));
        assert!(ids.contains(&"episodic"));
        assert!(ids.contains(&"semantic"));
        assert!(ids.contains(&"procedural"));

        // Verify procedural is inactive
        let procedural = subsystems.iter().find(|s| s.id == "procedural").unwrap();
        assert_eq!(procedural.status, "inactive");
        assert_eq!(procedural.item_count, 0);
        assert_eq!(procedural.decay_rate, "N/A");
    }

    #[test]
    fn test_memory_summary_response_serialization() {
        let subsystems = vec![MemorySubsystem {
            id: "working".to_string(),
            name: "Working".to_string(),
            status: "active".to_string(),
            item_count: 24,
            decay_rate: "~5min".to_string(),
        }];

        let response = MemorySummaryResponse { subsystems };
        let json = serde_json::to_string(&response).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(parsed["subsystems"].is_array());
        let first = &parsed["subsystems"][0];
        assert_eq!(first["id"], "working");
        // Verify camelCase
        assert_eq!(first["itemCount"], 24);
        assert_eq!(first["decayRate"], "~5min");
    }

    #[test]
    fn test_memory_consolidate_response() {
        let response = MemoryConsolidateResponse {
            success: true,
            message: "done".to_string(),
        };
        let json = serde_json::to_string(&response).expect("serialize");
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"message\":\"done\""));
    }

    // -----------------------------------------------------------------------
    // Observability
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_observability_config() {
        let config = default_observability();
        assert!(!config.cost_tracking_enabled);
        assert_eq!(config.usage.total_tokens, 0);
        assert_eq!(config.usage.prompt_tokens, 0);
        assert_eq!(config.usage.completion_tokens, 0);
        assert_eq!(config.usage.estimated_cost, "$0.00");
        assert_eq!(config.usage.period, "current session");
    }

    #[test]
    fn test_observability_config_serialization() {
        let config = ObservabilityConfig {
            cost_tracking_enabled: true,
            usage: TokenUsage {
                total_tokens: 50000,
                prompt_tokens: 30000,
                completion_tokens: 20000,
                estimated_cost: "$1.25".to_string(),
                period: "today".to_string(),
            },
        };

        let json = serde_json::to_string(&config).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        // Verify camelCase serialization
        assert_eq!(parsed["costTrackingEnabled"], true);
        assert_eq!(parsed["usage"]["totalTokens"], 50000);
        assert_eq!(parsed["usage"]["promptTokens"], 30000);
        assert_eq!(parsed["usage"]["completionTokens"], 20000);
        assert_eq!(parsed["usage"]["estimatedCost"], "$1.25");
        assert_eq!(parsed["usage"]["period"], "today");
    }

    #[test]
    fn test_update_observability_request_deserialization() {
        let json = r#"{"costTrackingEnabled": true}"#;
        let req: UpdateObservabilityRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.cost_tracking_enabled, Some(true));

        let json_empty = r#"{}"#;
        let req: UpdateObservabilityRequest = serde_json::from_str(json_empty).expect("deserialize");
        assert!(req.cost_tracking_enabled.is_none());
    }

    // -----------------------------------------------------------------------
    // Policies
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_policy_rules() {
        let rules = default_policy_rules();
        assert_eq!(rules.len(), 4, "Expected 4 default policy rules");

        let ids: Vec<&str> = rules.iter().map(|r| r.id.as_str()).collect();
        assert!(ids.contains(&"no_secrets"));
        assert!(ids.contains(&"rate_limit"));
        assert!(ids.contains(&"content_filter"));
        assert!(ids.contains(&"audit_all"));

        // audit_all is disabled by default
        let audit = rules.iter().find(|r| r.id == "audit_all").unwrap();
        assert!(!audit.enabled);

        // Others are enabled
        let enabled = rules.iter().filter(|r| r.enabled).count();
        assert_eq!(enabled, 3, "Expected 3 rules enabled by default");
    }

    #[test]
    fn test_policy_rules_response_serialization() {
        let rules = vec![PolicyRule {
            id: "test".to_string(),
            name: "Test Rule".to_string(),
            condition: "always".to_string(),
            action: "log".to_string(),
            enabled: true,
        }];

        let response = PolicyRulesResponse {
            rules,
            dry_run_mode: true,
        };

        let json = serde_json::to_string(&response).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(parsed["rules"].is_array());
        assert_eq!(parsed["rules"][0]["id"], "test");
        // Verify camelCase for dryRunMode
        assert_eq!(parsed["dryRunMode"], true);
    }

    #[test]
    fn test_toggle_rule_request_deserialization() {
        let json = r#"{"enabled": false}"#;
        let req: ToggleRuleRequest = serde_json::from_str(json).expect("deserialize");
        assert!(!req.enabled);
    }

    #[test]
    fn test_dry_run_mode_request_deserialization() {
        let json = r#"{"enabled": true}"#;
        let req: DryRunModeRequest = serde_json::from_str(json).expect("deserialize");
        assert!(req.enabled);
    }

    // -----------------------------------------------------------------------
    // State initialization
    // -----------------------------------------------------------------------

    #[test]
    fn test_enterprise_state_initialization() {
        let state = EnterpriseState::default();

        let gw = state.gateway.lock().unwrap();
        assert!(gw.healthy);

        let guardrails = state.guardrails.lock().unwrap();
        assert!(!guardrails.enabled);
        assert_eq!(guardrails.mode, "block");

        let scans = state.scan_history.lock().unwrap();
        assert_eq!(scans.len(), 10);
        drop(scans);

        let hooks = state.hooks.lock().unwrap();
        assert_eq!(hooks.len(), 13);

        let memory = state.memory_subsystems.lock().unwrap();
        assert_eq!(memory.len(), 4);

        let obs = state.observability.lock().unwrap();
        assert!(!obs.cost_tracking_enabled);

        let rules = state.policy_rules.lock().unwrap();
        assert_eq!(rules.len(), 4);

        let dry_run = state.dry_run_mode.lock().unwrap();
        assert!(!*dry_run);
    }

    // -----------------------------------------------------------------------
    // Round-trip (serialize -> deserialize) tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_gateway_status_roundtrip() {
        let original = default_gateway_status();
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: GatewayStatus = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.healthy, original.healthy);
        assert_eq!(deserialized.uptime, original.uptime);
        assert_eq!(deserialized.version, original.version);
        assert_eq!(deserialized.audit_logging, original.audit_logging);
        assert_eq!(deserialized.permissions.total, original.permissions.total);
        assert_eq!(
            deserialized.permissions.granted,
            original.permissions.granted
        );
        assert_eq!(deserialized.permissions.denied, original.permissions.denied);
    }

    #[test]
    fn test_hook_event_roundtrip() {
        let original = HookEvent {
            id: "test_hook".to_string(),
            name: "Test Hook".to_string(),
            category: "tools".to_string(),
            enabled: true,
            recent_count: 42,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: HookEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, original.id);
        assert_eq!(deserialized.name, original.name);
        assert_eq!(deserialized.category, original.category);
        assert_eq!(deserialized.enabled, original.enabled);
        assert_eq!(deserialized.recent_count, original.recent_count);
    }

    #[test]
    fn test_memory_subsystem_roundtrip() {
        let original = MemorySubsystem {
            id: "episodic".to_string(),
            name: "Episodic".to_string(),
            status: "active".to_string(),
            item_count: 100,
            decay_rate: "~24h".to_string(),
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: MemorySubsystem = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, original.id);
        assert_eq!(deserialized.name, original.name);
        assert_eq!(deserialized.status, original.status);
        assert_eq!(deserialized.item_count, original.item_count);
        assert_eq!(deserialized.decay_rate, original.decay_rate);
    }

    #[test]
    fn test_policy_rule_roundtrip() {
        let original = PolicyRule {
            id: "custom_rule".to_string(),
            name: "Custom Rule".to_string(),
            condition: "custom_condition".to_string(),
            action: "custom_action".to_string(),
            enabled: false,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: PolicyRule = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, original.id);
        assert_eq!(deserialized.name, original.name);
        assert_eq!(deserialized.condition, original.condition);
        assert_eq!(deserialized.action, original.action);
        assert_eq!(deserialized.enabled, original.enabled);
    }

    #[test]
    fn test_observability_config_roundtrip() {
        let original = ObservabilityConfig {
            cost_tracking_enabled: true,
            usage: TokenUsage {
                total_tokens: 12345,
                prompt_tokens: 7890,
                completion_tokens: 4455,
                estimated_cost: "$0.50".to_string(),
                period: "last hour".to_string(),
            },
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: ObservabilityConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(
            deserialized.cost_tracking_enabled,
            original.cost_tracking_enabled
        );
        assert_eq!(
            deserialized.usage.total_tokens,
            original.usage.total_tokens
        );
        assert_eq!(
            deserialized.usage.prompt_tokens,
            original.usage.prompt_tokens
        );
        assert_eq!(
            deserialized.usage.completion_tokens,
            original.usage.completion_tokens
        );
        assert_eq!(
            deserialized.usage.estimated_cost,
            original.usage.estimated_cost
        );
        assert_eq!(deserialized.usage.period, original.usage.period);
    }
}
