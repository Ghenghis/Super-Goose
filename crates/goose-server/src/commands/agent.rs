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

/// Returns the OTA marker directory path.
fn ota_marker_dir() -> Option<std::path::PathBuf> {
    if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .or_else(|_| std::env::var("USERPROFILE").map(|h| format!("{}\\.config", h)))
            .map(|d| std::path::PathBuf::from(d).join("goose").join("ota"))
            .ok()
    } else {
        std::env::var("HOME")
            .map(|h| std::path::PathBuf::from(h).join(".config").join("goose").join("ota"))
            .ok()
    }
}

/// Check for OTA restart marker, log version transition, write completion marker,
/// and detect crash loops.
fn check_ota_restart_marker() {
    let marker_dir = match ota_marker_dir() {
        Some(d) => d,
        None => return,
    };

    let pending_path = marker_dir.join(".restart-pending");
    if !pending_path.exists() {
        return;
    }

    let content = match std::fs::read_to_string(&pending_path) {
        Ok(c) => c,
        Err(e) => {
            info!("OTA restart marker found but unreadable: {}", e);
            let _ = std::fs::remove_file(&pending_path);
            return;
        }
    };

    let marker = match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(m) => m,
        Err(_) => {
            info!("OTA restart marker has invalid JSON — removing");
            let _ = std::fs::remove_file(&pending_path);
            return;
        }
    };

    // --- Crash-loop detection ---
    let startup_count = marker.get("startup_count").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
    let max_startups: u64 = 3;

    if startup_count > max_startups {
        tracing::error!(
            "OTA crash-loop detected: {} consecutive startups with restart marker present. Breaking loop.",
            startup_count
        );
        let _ = std::fs::remove_file(&pending_path);
        // TODO: In future, restore backup binary from .ota/backups/
        return;
    }

    // Increment startup_count in the marker (deferred deletion — only delete after success)
    {
        let mut updated_marker = marker.clone();
        if let Some(obj) = updated_marker.as_object_mut() {
            obj.insert("startup_count".to_string(), serde_json::json!(startup_count));
        }
        let _ = std::fs::write(&pending_path, serde_json::to_string_pretty(&updated_marker).unwrap_or_default());
    }

    // --- Version comparison ---
    let previous_version = marker.get("version").and_then(|v| v.as_str()).unwrap_or("unknown");
    let current_version = env!("CARGO_PKG_VERSION");
    let current_git_hash = option_env!("BUILD_GIT_HASH").unwrap_or("unknown");
    let version_changed = previous_version != current_version;

    info!("OTA restart detected — resumed after update");
    info!("  Restart reason: {}", marker.get("reason").and_then(|v| v.as_str()).unwrap_or("unknown"));
    if version_changed {
        info!("  Upgraded: v{} → v{} ({})", previous_version, current_version, current_git_hash);
    } else {
        info!("  Rebuilt: v{} ({})", current_version, current_git_hash);
    }

    // --- Write .restart-completed marker ---
    let completed_marker = serde_json::json!({
        "previous_version": previous_version,
        "current_version": current_version,
        "current_git_hash": current_git_hash,
        "completed_at": chrono::Utc::now().to_rfc3339(),
        "version_changed": version_changed,
        "startup_count": startup_count,
    });
    let completed_path = marker_dir.join(".restart-completed");
    let _ = std::fs::create_dir_all(&marker_dir);
    if let Err(e) = std::fs::write(&completed_path, serde_json::to_string_pretty(&completed_marker).unwrap_or_default()) {
        tracing::warn!("Failed to write restart-completed marker: {}", e);
    }

    // --- Delete pending marker (successful startup) ---
    if let Err(e) = std::fs::remove_file(&pending_path) {
        tracing::warn!("Failed to remove restart-pending marker: {}", e);
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
