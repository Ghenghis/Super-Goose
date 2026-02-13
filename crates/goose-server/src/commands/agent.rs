use crate::configuration;
use crate::state;
use anyhow::Result;
use axum::middleware;
use goose_server::auth::check_token;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

// Graceful shutdown signal
#[cfg(unix)]
async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};

    let mut sigint = signal(SignalKind::interrupt()).expect("failed to install SIGINT handler");
    let mut sigterm = signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");

    tokio::select! {
        _ = sigint.recv() => {},
        _ = sigterm.recv() => {},
    }
}

#[cfg(not(unix))]
async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

/// Check for OTA restart marker and log completion.
fn check_ota_restart_marker() {
    let marker_path = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .or_else(|_| std::env::var("USERPROFILE").map(|h| format!("{}\\.config", h)))
            .map(|d| std::path::PathBuf::from(d).join("goose").join("ota").join(".restart-pending"))
    } else {
        std::env::var("HOME")
            .map(|h| std::path::PathBuf::from(h).join(".config").join("goose").join("ota").join(".restart-pending"))
    };

    if let Ok(path) = marker_path {
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    info!("OTA restart detected — resumed after update");
                    if let Ok(marker) = serde_json::from_str::<serde_json::Value>(&content) {
                        info!("  Restart reason: {}", marker.get("reason").and_then(|v| v.as_str()).unwrap_or("unknown"));
                        info!("  Previous version: {}", marker.get("version").and_then(|v| v.as_str()).unwrap_or("unknown"));
                        info!("  Current version: {}", env!("CARGO_PKG_VERSION"));
                    }
                }
                Err(e) => {
                    info!("OTA restart marker found but unreadable: {}", e);
                }
            }
            // Delete marker after reading
            if let Err(e) = std::fs::remove_file(&path) {
                tracing::warn!("Failed to remove restart marker: {}", e);
            }
        }
    }
}

pub async fn run() -> Result<()> {
    crate::logging::setup_logging(Some("goosed"))?;

    let settings = configuration::Settings::new()?;

    let secret_key =
        std::env::var("GOOSE_SERVER__SECRET_KEY").unwrap_or_else(|_| "test".to_string());

    let app_state = state::AppState::new().await?;

    // OTA restart self-check: detect if we resumed after an OTA restart
    check_ota_restart_marker();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = crate::routes::configure(app_state.clone(), secret_key.clone())
        .layer(middleware::from_fn_with_state(
            secret_key.clone(),
            check_token,
        ))
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(settings.socket_addr()).await?;
    info!("listening on {}", listener.local_addr()?);

    let tunnel_manager = app_state.tunnel_manager.clone();
    tokio::spawn(async move {
        tunnel_manager.check_auto_start().await;
    });

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    info!("server shutdown complete");
    Ok(())
}
