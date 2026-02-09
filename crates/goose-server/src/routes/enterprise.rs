use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::sync::Arc;

use crate::state::AppState;

// ── Response types ──────────────────────────────────────────────────────────

/// Overall enterprise feature status
#[derive(Serialize)]
pub struct EnterpriseStatusResponse {
    pub version: String,
    pub modules: Vec<ModuleStatus>,
}

#[derive(Serialize)]
pub struct ModuleStatus {
    pub name: String,
    pub enabled: bool,
    pub description: String,
}

/// Guardrails configuration response
#[derive(Serialize)]
pub struct GuardrailsConfigResponse {
    pub enabled: bool,
    pub fail_mode: String,
    pub timeout_ms: u64,
    pub detectors: Vec<DetectorConfigInfo>,
}

#[derive(Serialize)]
pub struct DetectorConfigInfo {
    pub name: String,
    pub enabled: bool,
    pub sensitivity: String,
    pub confidence_threshold: f64,
}

/// Guardrails status response
#[derive(Serialize)]
pub struct GuardrailsStatusResponse {
    pub engine_enabled: bool,
    pub active_detectors: Vec<ActiveDetectorInfo>,
    pub total_detectors: usize,
}

#[derive(Serialize)]
pub struct ActiveDetectorInfo {
    pub name: String,
    pub sensitivity: String,
    pub confidence_threshold: f64,
}

/// Gateway status response
#[derive(Serialize)]
pub struct GatewayStatusResponse {
    pub enabled: bool,
    pub default_policy: String,
    pub execution_timeout_secs: u64,
    pub audit_enabled: bool,
    pub redact_arguments: bool,
    pub health_check_interval_secs: u64,
    pub components: Vec<String>,
}

/// Observability metrics response
#[derive(Serialize)]
pub struct ObservabilityMetricsResponse {
    pub cost_tracking_enabled: bool,
    pub mcp_metrics_enabled: bool,
    pub genai_conventions_enabled: bool,
    pub metrics_export_interval_secs: u64,
    pub available_exporters: Vec<String>,
    pub metric_categories: Vec<MetricCategory>,
}

#[derive(Serialize)]
pub struct MetricCategory {
    pub name: String,
    pub description: String,
}

/// Policies rules response
#[derive(Serialize)]
pub struct PoliciesRulesResponse {
    pub enabled: bool,
    pub hot_reload_enabled: bool,
    pub fail_mode: String,
    pub max_rule_eval_time_ms: u64,
    pub condition_types: Vec<String>,
    pub action_types: Vec<String>,
}

/// Hooks events response
#[derive(Serialize)]
pub struct HooksEventsResponse {
    pub total_events: usize,
    pub events: Vec<HookEventInfo>,
}

#[derive(Serialize)]
pub struct HookEventInfo {
    pub name: String,
    pub description: String,
    pub can_block: bool,
}

/// Memory status response
#[derive(Serialize)]
pub struct MemoryStatusResponse {
    pub enabled: bool,
    pub subsystems: Vec<MemorySubsystemInfo>,
    pub config: MemoryConfigInfo,
}

#[derive(Serialize)]
pub struct MemorySubsystemInfo {
    pub name: String,
    pub description: String,
    pub decay_factor: f64,
}

#[derive(Serialize)]
pub struct MemoryConfigInfo {
    pub max_working_memory: usize,
    pub max_episodic_per_session: usize,
    pub max_semantic_memories: usize,
    pub consolidation_threshold: usize,
    pub embedding_dimension: usize,
    pub auto_decay: bool,
}

// ── Handlers ────────────────────────────────────────────────────────────────

/// GET /enterprise/status
async fn enterprise_status() -> Json<EnterpriseStatusResponse> {
    Json(EnterpriseStatusResponse {
        version: "1.24.2".to_string(),
        modules: vec![
            ModuleStatus {
                name: "guardrails".to_string(),
                enabled: true,
                description: "Input/output guardrails with 6 detectors (prompt injection, PII, jailbreak, topics, keywords, secrets)".to_string(),
            },
            ModuleStatus {
                name: "gateway".to_string(),
                enabled: true,
                description: "MCP gateway for multi-server routing, permissions, audit, and credential management".to_string(),
            },
            ModuleStatus {
                name: "observability".to_string(),
                enabled: true,
                description: "OpenTelemetry GenAI semantic conventions, cost tracking, and MCP-specific metrics".to_string(),
            },
            ModuleStatus {
                name: "policies".to_string(),
                enabled: true,
                description: "YAML-based rule engine with 18+ condition types and hot-reload support".to_string(),
            },
            ModuleStatus {
                name: "hooks".to_string(),
                enabled: true,
                description: "Lifecycle hook system with 13 event types and flow control".to_string(),
            },
            ModuleStatus {
                name: "memory".to_string(),
                enabled: true,
                description: "Long-term memory with working, episodic, semantic, and procedural subsystems".to_string(),
            },
        ],
    })
}

/// GET /enterprise/guardrails/config
async fn guardrails_config() -> Json<GuardrailsConfigResponse> {
    let config = goose::guardrails::GuardrailsConfig::default();

    Json(GuardrailsConfigResponse {
        enabled: config.enabled,
        fail_mode: format!("{:?}", config.fail_mode),
        timeout_ms: config.timeout_ms,
        detectors: vec![
            DetectorConfigInfo {
                name: "prompt_injection".to_string(),
                enabled: config.prompt_injection.enabled,
                sensitivity: format!("{:?}", config.prompt_injection.sensitivity),
                confidence_threshold: config.prompt_injection.confidence_threshold,
            },
            DetectorConfigInfo {
                name: "pii".to_string(),
                enabled: config.pii.enabled,
                sensitivity: format!("{:?}", config.pii.sensitivity),
                confidence_threshold: config.pii.confidence_threshold,
            },
            DetectorConfigInfo {
                name: "jailbreak".to_string(),
                enabled: config.jailbreak.enabled,
                sensitivity: format!("{:?}", config.jailbreak.sensitivity),
                confidence_threshold: config.jailbreak.confidence_threshold,
            },
            DetectorConfigInfo {
                name: "topics".to_string(),
                enabled: config.topics.enabled,
                sensitivity: format!("{:?}", config.topics.sensitivity),
                confidence_threshold: config.topics.confidence_threshold,
            },
            DetectorConfigInfo {
                name: "keywords".to_string(),
                enabled: config.keywords.enabled,
                sensitivity: format!("{:?}", config.keywords.sensitivity),
                confidence_threshold: config.keywords.confidence_threshold,
            },
            DetectorConfigInfo {
                name: "secrets".to_string(),
                enabled: config.secrets.enabled,
                sensitivity: format!("{:?}", config.secrets.sensitivity),
                confidence_threshold: config.secrets.confidence_threshold,
            },
        ],
    })
}

/// GET /enterprise/guardrails/status
async fn guardrails_status() -> Json<GuardrailsStatusResponse> {
    let config = goose::guardrails::GuardrailsConfig::default();

    let mut active_detectors = Vec::new();

    if config.prompt_injection.enabled {
        active_detectors.push(ActiveDetectorInfo {
            name: "prompt_injection".to_string(),
            sensitivity: format!("{:?}", config.prompt_injection.sensitivity),
            confidence_threshold: config.prompt_injection.confidence_threshold,
        });
    }
    if config.pii.enabled {
        active_detectors.push(ActiveDetectorInfo {
            name: "pii".to_string(),
            sensitivity: format!("{:?}", config.pii.sensitivity),
            confidence_threshold: config.pii.confidence_threshold,
        });
    }
    if config.jailbreak.enabled {
        active_detectors.push(ActiveDetectorInfo {
            name: "jailbreak".to_string(),
            sensitivity: format!("{:?}", config.jailbreak.sensitivity),
            confidence_threshold: config.jailbreak.confidence_threshold,
        });
    }
    if config.topics.enabled {
        active_detectors.push(ActiveDetectorInfo {
            name: "topics".to_string(),
            sensitivity: format!("{:?}", config.topics.sensitivity),
            confidence_threshold: config.topics.confidence_threshold,
        });
    }
    if config.keywords.enabled {
        active_detectors.push(ActiveDetectorInfo {
            name: "keywords".to_string(),
            sensitivity: format!("{:?}", config.keywords.sensitivity),
            confidence_threshold: config.keywords.confidence_threshold,
        });
    }
    if config.secrets.enabled {
        active_detectors.push(ActiveDetectorInfo {
            name: "secrets".to_string(),
            sensitivity: format!("{:?}", config.secrets.sensitivity),
            confidence_threshold: config.secrets.confidence_threshold,
        });
    }

    let total_detectors = 6;

    Json(GuardrailsStatusResponse {
        engine_enabled: config.enabled,
        total_detectors,
        active_detectors,
    })
}

/// GET /enterprise/gateway/status
async fn gateway_status() -> Json<GatewayStatusResponse> {
    let config = goose::mcp_gateway::GatewayConfig::default();

    Json(GatewayStatusResponse {
        enabled: config.enabled,
        default_policy: format!("{:?}", config.default_policy),
        execution_timeout_secs: config.execution_timeout_secs,
        audit_enabled: config.audit_enabled,
        redact_arguments: config.redact_arguments,
        health_check_interval_secs: config.health_check_interval_secs,
        components: vec![
            "McpRouter".to_string(),
            "PermissionManager".to_string(),
            "CredentialManager".to_string(),
            "AuditLogger".to_string(),
            "BundleManager".to_string(),
        ],
    })
}

/// GET /enterprise/observability/metrics
async fn observability_metrics() -> Json<ObservabilityMetricsResponse> {
    let config = goose::observability::ObservabilityConfig::default();

    Json(ObservabilityMetricsResponse {
        cost_tracking_enabled: config.cost_tracking_enabled,
        mcp_metrics_enabled: config.mcp_metrics_enabled,
        genai_conventions_enabled: config.genai_conventions_enabled,
        metrics_export_interval_secs: config.metrics_export_interval_secs,
        available_exporters: vec![
            "prometheus".to_string(),
            "otlp".to_string(),
            "json".to_string(),
            "csv".to_string(),
            "markdown".to_string(),
        ],
        metric_categories: vec![
            MetricCategory {
                name: "genai".to_string(),
                description: "GenAI request metrics (tokens, cost, latency, success rate)".to_string(),
            },
            MetricCategory {
                name: "mcp".to_string(),
                description: "MCP tool call metrics (duration, success rate, permission denials)".to_string(),
            },
            MetricCategory {
                name: "cost".to_string(),
                description: "Cost tracking per session, model, and aggregate totals".to_string(),
            },
        ],
    })
}

/// GET /enterprise/policies/rules
async fn policies_rules() -> Json<PoliciesRulesResponse> {
    let config = goose::policies::PolicyConfig::default();

    Json(PoliciesRulesResponse {
        enabled: config.enabled,
        hot_reload_enabled: config.hot_reload_enabled,
        fail_mode: format!("{:?}", config.fail_mode),
        max_rule_eval_time_ms: config.max_rule_eval_time_ms,
        condition_types: vec![
            "equals".to_string(),
            "not_equals".to_string(),
            "contains".to_string(),
            "not_contains".to_string(),
            "starts_with".to_string(),
            "ends_with".to_string(),
            "matches_regex".to_string(),
            "greater_than".to_string(),
            "less_than".to_string(),
            "greater_than_or_equal".to_string(),
            "less_than_or_equal".to_string(),
            "in_list".to_string(),
            "not_in_list".to_string(),
            "before".to_string(),
            "after".to_string(),
            "between".to_string(),
            "and".to_string(),
            "or".to_string(),
            "not".to_string(),
        ],
        action_types: vec![
            "block".to_string(),
            "warn".to_string(),
            "notify".to_string(),
            "require_approval".to_string(),
            "log".to_string(),
        ],
    })
}

/// GET /enterprise/hooks/events
async fn hooks_events() -> Json<HooksEventsResponse> {
    let events = vec![
        HookEventInfo {
            name: "Setup".to_string(),
            description: "Fires when entering a repository (init) or periodically (maintenance)".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "SessionStart".to_string(),
            description: "Fires when a new session starts or resumes".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "UserPromptSubmit".to_string(),
            description: "Fires immediately when user submits a prompt".to_string(),
            can_block: true,
        },
        HookEventInfo {
            name: "PreToolUse".to_string(),
            description: "Fires before any tool execution".to_string(),
            can_block: true,
        },
        HookEventInfo {
            name: "PermissionRequest".to_string(),
            description: "Fires when user is shown a permission dialog".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "PostToolUse".to_string(),
            description: "Fires after successful tool completion".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "PostToolUseFailure".to_string(),
            description: "Fires when a tool execution fails".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "Notification".to_string(),
            description: "Fires when notifications are sent".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "SubagentStart".to_string(),
            description: "Fires when a subagent spawns".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "SubagentStop".to_string(),
            description: "Fires when a subagent finishes".to_string(),
            can_block: true,
        },
        HookEventInfo {
            name: "Stop".to_string(),
            description: "Fires when the agent finishes responding".to_string(),
            can_block: true,
        },
        HookEventInfo {
            name: "PreCompact".to_string(),
            description: "Fires before compaction operations".to_string(),
            can_block: false,
        },
        HookEventInfo {
            name: "SessionEnd".to_string(),
            description: "Fires when session ends".to_string(),
            can_block: false,
        },
    ];

    Json(HooksEventsResponse {
        total_events: events.len(),
        events,
    })
}

/// GET /enterprise/memory/status
async fn memory_status() -> Json<MemoryStatusResponse> {
    let config = goose::memory::MemoryConfig::default();

    Json(MemoryStatusResponse {
        enabled: config.enabled,
        subsystems: vec![
            MemorySubsystemInfo {
                name: "working".to_string(),
                description: "Short-term context for current interactions (fast access, fast decay)".to_string(),
                decay_factor: goose::memory::MemoryType::Working.default_decay_factor(),
            },
            MemorySubsystemInfo {
                name: "episodic".to_string(),
                description: "Session and conversation history (medium-term, moderate decay)".to_string(),
                decay_factor: goose::memory::MemoryType::Episodic.default_decay_factor(),
            },
            MemorySubsystemInfo {
                name: "semantic".to_string(),
                description: "Long-term facts and knowledge (slow decay, persistent)".to_string(),
                decay_factor: goose::memory::MemoryType::Semantic.default_decay_factor(),
            },
            MemorySubsystemInfo {
                name: "procedural".to_string(),
                description: "Learned procedures and patterns (slow decay, skill-based)".to_string(),
                decay_factor: goose::memory::MemoryType::Procedural.default_decay_factor(),
            },
        ],
        config: MemoryConfigInfo {
            max_working_memory: config.max_working_memory,
            max_episodic_per_session: config.max_episodic_per_session,
            max_semantic_memories: config.max_semantic_memories,
            consolidation_threshold: config.consolidation_threshold,
            embedding_dimension: config.embedding_dimension,
            auto_decay: config.auto_decay,
        },
    })
}

// ── Router ──────────────────────────────────────────────────────────────────

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/enterprise/status", get(enterprise_status))
        .route("/enterprise/guardrails/config", get(guardrails_config))
        .route("/enterprise/guardrails/status", get(guardrails_status))
        .route("/enterprise/gateway/status", get(gateway_status))
        .route(
            "/enterprise/observability/metrics",
            get(observability_metrics),
        )
        .route("/enterprise/policies/rules", get(policies_rules))
        .route("/enterprise/hooks/events", get(hooks_events))
        .route("/enterprise/memory/status", get(memory_status))
        .with_state(state)
}
