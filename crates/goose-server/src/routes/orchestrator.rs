use crate::state::AppState;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use goose::agents::orchestrator::{
    AgentOrchestrator, AgentRole, OrchestratorConfig, TaskPriority,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;
use uuid::Uuid;

fn orchestrator_instance() -> &'static Arc<Mutex<Option<AgentOrchestrator>>> {
    static INSTANCE: OnceLock<Arc<Mutex<Option<AgentOrchestrator>>>> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(None)))
}

#[derive(Serialize)]
struct OrchestratorStatusResponse {
    ready: bool,
    roles: Vec<String>,
}

#[derive(Deserialize)]
pub struct CreateWorkflowRequest {
    name: String,
    description: String,
}

#[derive(Serialize)]
pub struct CreateWorkflowResponse {
    workflow_id: String,
}

#[derive(Deserialize)]
pub struct AddTaskRequest {
    workflow_id: String,
    name: String,
    description: String,
    role: String,
    #[serde(default)]
    dependencies: Vec<String>,
}

#[derive(Serialize)]
pub struct AddTaskResponse {
    task_id: String,
}

#[derive(Deserialize)]
pub struct StartWorkflowRequest {
    workflow_id: String,
}

fn parse_role(s: &str) -> Result<AgentRole, String> {
    match s.to_lowercase().as_str() {
        "code" => Ok(AgentRole::Code),
        "test" => Ok(AgentRole::Test),
        "deploy" => Ok(AgentRole::Deploy),
        "docs" => Ok(AgentRole::Docs),
        "security" => Ok(AgentRole::Security),
        "coordinator" => Ok(AgentRole::Coordinator),
        _ => Err(format!("Unknown role: {}", s)),
    }
}

async fn ensure_orchestrator() -> Result<(), StatusCode> {
    let mut guard = orchestrator_instance().lock().await;
    if guard.is_none() {
        match AgentOrchestrator::with_config(OrchestratorConfig::default()).await {
            Ok(orch) => {
                *guard = Some(orch);
            }
            Err(e) => {
                tracing::error!("Failed to initialize orchestrator: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }
    Ok(())
}

async fn orchestrator_status(
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    if let Err(status) = ensure_orchestrator().await {
        return (status, Json(serde_json::json!({"error": "Failed to initialize"}))).into_response();
    }

    let guard = orchestrator_instance().lock().await;
    if let Some(orch) = guard.as_ref() {
        let roles = orch.get_available_agent_roles().await;
        let role_names: Vec<String> = roles.iter().map(|r| r.to_string()).collect();
        (
            StatusCode::OK,
            Json(serde_json::json!(OrchestratorStatusResponse {
                ready: orch.is_ready(),
                roles: role_names,
            })),
        )
            .into_response()
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Orchestrator not initialized"})),
        )
            .into_response()
    }
}

async fn create_workflow(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateWorkflowRequest>,
) -> impl IntoResponse {
    if let Err(status) = ensure_orchestrator().await {
        return (status, Json(serde_json::json!({"error": "init failed"}))).into_response();
    }

    let guard = orchestrator_instance().lock().await;
    if let Some(orch) = guard.as_ref() {
        match orch.create_workflow(req.name, req.description).await {
            Ok(id) => (
                StatusCode::OK,
                Json(serde_json::json!(CreateWorkflowResponse {
                    workflow_id: id.to_string(),
                })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response(),
        }
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "not ready"})),
        )
            .into_response()
    }
}

async fn add_task(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<AddTaskRequest>,
) -> impl IntoResponse {
    if let Err(status) = ensure_orchestrator().await {
        return (status, Json(serde_json::json!({"error": "init failed"}))).into_response();
    }

    let role = match parse_role(&req.role) {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e}))).into_response()
        }
    };

    let workflow_id = match Uuid::parse_str(&req.workflow_id) {
        Ok(id) => id,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": format!("Invalid workflow_id: {}", e)})),
            )
                .into_response()
        }
    };

    let deps: Result<Vec<Uuid>, _> = req.dependencies.iter().map(|s| Uuid::parse_str(s)).collect();
    let deps = match deps {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": format!("Invalid dependency id: {}", e)})),
            )
                .into_response()
        }
    };

    let guard = orchestrator_instance().lock().await;
    if let Some(orch) = guard.as_ref() {
        match orch
            .add_task(
                workflow_id,
                req.name,
                req.description,
                role,
                deps,
                TaskPriority::Medium,
            )
            .await
        {
            Ok(id) => (
                StatusCode::OK,
                Json(serde_json::json!(AddTaskResponse {
                    task_id: id.to_string(),
                })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response(),
        }
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "not ready"})),
        )
            .into_response()
    }
}

async fn start_workflow(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<StartWorkflowRequest>,
) -> impl IntoResponse {
    if let Err(status) = ensure_orchestrator().await {
        return (status, Json(serde_json::json!({"error": "init failed"}))).into_response();
    }

    let workflow_id = match Uuid::parse_str(&req.workflow_id) {
        Ok(id) => id,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": format!("Invalid workflow_id: {}", e)})),
            )
                .into_response()
        }
    };

    let guard = orchestrator_instance().lock().await;
    if let Some(orch) = guard.as_ref() {
        match orch.start_workflow(workflow_id).await {
            Ok(()) => {
                (StatusCode::OK, Json(serde_json::json!({"status": "started"}))).into_response()
            }
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response(),
        }
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "not ready"})),
        )
            .into_response()
    }
}

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/orchestrator/status", get(orchestrator_status))
        .route("/orchestrator/workflow/create", post(create_workflow))
        .route("/orchestrator/workflow/task", post(add_task))
        .route("/orchestrator/workflow/start", post(start_workflow))
        .with_state(state)
}
