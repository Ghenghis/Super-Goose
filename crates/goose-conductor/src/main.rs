//! Goose Conductor — lightweight process supervisor daemon.
//!
//! Manages the lifecycle of `goosed` and the Electron shell.
//! Provides an IPC interface for commands (shutdown, binary swap, status),
//! health-checks goosed with a circuit-breaker restart policy, and persists
//! task/agent state in SQLite.
//!
//! The conductor is the ONE process that never gets rebuilt by the agent.
//! It survives everything.

mod child_manager;
mod config;
mod health_checker;
mod ipc_server;
mod log_manager;
mod message_bus;
mod state_store;

use std::sync::Arc;

use tokio::sync::mpsc;
use tracing::{error, info};

use child_manager::{ChildManager, ProcessKind};
use config::ConductorConfig;
use health_checker::HealthChecker;
use ipc_server::{IpcContext, run_ipc_server};
use log_manager::LogManager;
use message_bus::MessageBus;
use state_store::StateStore;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ---- 1. Load configuration ----
    let config = ConductorConfig::load();

    // ---- 2. Initialise logging ----
    let _log_guard = LogManager::init(&config.log)?;
    log_manager::prune_old_logs(&config.log.dir, config.log.max_files);

    info!(
        version = env!("CARGO_PKG_VERSION"),
        "goose-conductor starting"
    );

    // ---- 3. Open state store ----
    let store = Arc::new(StateStore::open(&config.store).await?);
    info!("state store opened");

    // ---- 4. Create subsystems ----
    let child_mgr = Arc::new(ChildManager::new(config.process.clone(), store.clone()));
    let health_checker = Arc::new(HealthChecker::new(
        config.health.clone(),
        child_mgr.clone(),
        store.clone(),
    ));
    let message_bus = Arc::new(MessageBus::new(store.clone()));

    // ---- 5. Start goosed ----
    match child_mgr.start(ProcessKind::Goosed).await {
        Ok(pid) => {
            info!(pid, "goosed started");
            message_bus.mark_online("goosed").await;
        }
        Err(e) => {
            error!(error = %e, "failed to start goosed — will keep trying via health checker");
        }
    }

    // ---- 6. Optionally start Electron ----
    if config.process.electron_binary.is_some() {
        match child_mgr.start(ProcessKind::Electron).await {
            Ok(pid) => {
                info!(pid, "Electron started");
                message_bus.mark_online("electron").await;
            }
            Err(e) => {
                error!(error = %e, "failed to start Electron");
            }
        }
    }

    // ---- 7. Set up shutdown coordination ----
    let cancel = tokio_util::sync::CancellationToken::new();
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    // ---- 8. Start health checker ----
    let health_cancel = cancel.clone();
    let health_ref = health_checker.clone();
    tokio::spawn(async move {
        health_ref.run(health_cancel).await;
    });

    // ---- 9. Start IPC server ----
    let ipc_ctx = Arc::new(IpcContext {
        child_mgr: child_mgr.clone(),
        health_checker: health_checker.clone(),
        message_bus: message_bus.clone(),
        shutdown_tx,
    });
    let ipc_cancel = cancel.clone();
    let ipc_path = config.ipc.path.clone();
    tokio::spawn(async move {
        run_ipc_server(ipc_path, ipc_ctx, ipc_cancel).await;
    });

    info!("goose-conductor fully initialised — waiting for signals");

    // ---- 10. Wait for shutdown ----
    // We exit on: SIGINT/SIGTERM (Unix), Ctrl+C (Windows), or an IPC DrainAndShutdown command.
    tokio::select! {
        _ = signal_shutdown() => {
            info!("received OS shutdown signal");
        }
        _ = shutdown_rx.recv() => {
            info!("received IPC shutdown command");
        }
    }

    // ---- 11. Graceful shutdown ----
    info!("initiating graceful shutdown");
    cancel.cancel();

    // Stop all children.
    if let Err(e) = child_mgr.stop_all().await {
        error!(error = %e, "error stopping children during shutdown");
    }

    info!("goose-conductor exited cleanly");
    Ok(())
}

/// Wait for an OS shutdown signal.
async fn signal_shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut sigint = signal(SignalKind::interrupt()).expect("failed to register SIGINT");
        let mut sigterm = signal(SignalKind::terminate()).expect("failed to register SIGTERM");
        tokio::select! {
            _ = sigint.recv() => {}
            _ = sigterm.recv() => {}
        }
    }
    #[cfg(windows)]
    {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to register Ctrl+C handler");
    }
}
