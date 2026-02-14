pub mod action_required;
pub mod agent;
pub mod agent_stream;
pub mod ag_ui_stream;
pub mod config_management;
pub mod cost;
pub mod enterprise;
pub mod extensions;
pub mod features;
pub mod orchestrator;
pub mod dictation;
pub mod errors;
pub mod learning;
pub mod mcp_app_proxy;
pub mod mcp_ui_proxy;
pub mod ota_api;
pub mod prompts;
pub mod recipe;
pub mod recipe_utils;
pub mod reply;
pub mod schedule;
pub mod session;
pub mod settings;
pub mod setup;
pub mod status;
pub mod system;
pub mod telemetry;
pub mod tunnel;
pub mod utils;

use std::sync::Arc;

use axum::Router;

// Function to configure all routes
pub fn configure(state: Arc<crate::state::AppState>, secret_key: String) -> Router {
    Router::new()
        .merge(status::routes(state.clone()))
        .merge(reply::routes(state.clone()))
        .merge(action_required::routes(state.clone()))
        .merge(agent::routes(state.clone()))
        .merge(dictation::routes(state.clone()))
        .merge(config_management::routes(state.clone()))
        .merge(prompts::routes())
        .merge(recipe::routes(state.clone()))
        .merge(session::routes(state.clone()))
        .merge(schedule::routes(state.clone()))
        .merge(setup::routes(state.clone()))
        .merge(telemetry::routes(state.clone()))
        .merge(tunnel::routes(state.clone()))
        .merge(mcp_ui_proxy::routes(secret_key.clone()))
        .merge(orchestrator::routes(state.clone()))
        .merge(learning::routes(state.clone()))
        .merge(settings::routes(state.clone()))
        .merge(ota_api::routes(state.clone()))
        .merge(features::routes(state.clone()))
        .merge(cost::routes(state.clone()))
        .merge(enterprise::routes(state.clone()))
        .merge(extensions::routes(state.clone()))
        .merge(agent_stream::routes(state.clone()))
        .merge(ag_ui_stream::routes(state.clone()))
        .merge(system::routes(state.clone()))
        .merge(mcp_app_proxy::routes(secret_key))
}
