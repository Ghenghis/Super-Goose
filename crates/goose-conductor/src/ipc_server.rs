//! IPC server: named pipe on Windows, Unix domain socket elsewhere.
//!
//! Accepts newline-delimited JSON commands and returns JSON responses.
//! Each connection is handled in its own task.

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{debug, error, info, warn};

use crate::child_manager::ChildManager;
use crate::health_checker::HealthChecker;
use crate::message_bus::{BusMessage, MessageBus};

// ---------------------------------------------------------------------------
// Command / Response protocol
// ---------------------------------------------------------------------------

/// Commands accepted over IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum IpcCommand {
    /// Ask the conductor to save all state to disk.
    SaveState,
    /// Graceful shutdown: drain children then exit.
    DrainAndShutdown,
    /// Swap the goosed binary and restart.
    SwapBinary { path: String },
    /// Get the current status of all managed processes.
    GetStatus,
    /// Wake a sleeping agent and deliver pending messages.
    WakeAgent { agent_id: String },
    /// Publish a message on the bus.
    Publish {
        topic: String,
        sender: String,
        recipient: Option<String>,
        payload: serde_json::Value,
    },
    /// Ping — used to verify the IPC channel is alive.
    Ping,
}

/// Response sent back to the IPC client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl IpcResponse {
    fn success(data: serde_json::Value) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    fn ok() -> Self {
        Self {
            ok: true,
            data: None,
            error: None,
        }
    }

    fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// Shared handler context
// ---------------------------------------------------------------------------

/// Shared state passed to each IPC connection handler.
pub struct IpcContext {
    pub child_mgr: Arc<ChildManager>,
    pub health_checker: Arc<HealthChecker>,
    pub message_bus: Arc<MessageBus>,
    pub shutdown_tx: tokio::sync::mpsc::Sender<()>,
}

/// Process one IPC command.
async fn handle_command(cmd: IpcCommand, ctx: &IpcContext) -> IpcResponse {
    match cmd {
        IpcCommand::Ping => IpcResponse::success(serde_json::json!({ "pong": true })),

        IpcCommand::SaveState => {
            // State is persisted continuously via SQLite WAL, so this is a no-op
            // confirmation for callers that want an explicit sync point.
            IpcResponse::ok()
        }

        IpcCommand::DrainAndShutdown => {
            info!("IPC: drain-and-shutdown requested");
            if let Err(e) = ctx.child_mgr.stop_all().await {
                error!(error = %e, "error during drain-and-shutdown");
            }
            // Signal the main loop to exit.
            let _ = ctx.shutdown_tx.send(()).await;
            IpcResponse::ok()
        }

        IpcCommand::SwapBinary { path } => {
            info!(path, "IPC: swap binary requested");
            match ctx.child_mgr.swap_binary(PathBuf::from(&path)).await {
                Ok(pid) => IpcResponse::success(serde_json::json!({ "pid": pid })),
                Err(e) => IpcResponse::err(format!("{}", e)),
            }
        }

        IpcCommand::GetStatus => {
            let children = ctx.child_mgr.status().await;
            let circuit = format!("{:?}", ctx.health_checker.circuit_state());
            let failures = ctx.health_checker.consecutive_failures();
            IpcResponse::success(serde_json::json!({
                "children": children,
                "health": {
                    "circuit": circuit,
                    "consecutive_failures": failures,
                },
            }))
        }

        IpcCommand::WakeAgent { agent_id } => {
            info!(agent_id, "IPC: wake agent requested");
            ctx.message_bus.mark_online(&agent_id).await;
            match ctx.message_bus.deliver_pending(&agent_id).await {
                Ok(msgs) => IpcResponse::success(serde_json::json!({
                    "delivered": msgs.len(),
                })),
                Err(e) => IpcResponse::err(format!("{}", e)),
            }
        }

        IpcCommand::Publish {
            topic,
            sender,
            recipient,
            payload,
        } => {
            let msg = BusMessage::new(topic, sender, recipient, payload);
            match ctx.message_bus.publish(msg).await {
                Ok(()) => IpcResponse::ok(),
                Err(e) => IpcResponse::err(format!("{}", e)),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Platform-specific listeners
// ---------------------------------------------------------------------------

/// Run the IPC server. Listens forever (or until cancellation).
pub async fn run_ipc_server(
    ipc_path: String,
    ctx: Arc<IpcContext>,
    cancel: tokio_util::sync::CancellationToken,
) {
    #[cfg(unix)]
    {
        run_unix_socket_server(&ipc_path, ctx, cancel).await;
    }
    #[cfg(windows)]
    {
        run_named_pipe_server(&ipc_path, ctx, cancel).await;
    }
}

// ---- Unix domain socket implementation ----

#[cfg(unix)]
async fn run_unix_socket_server(
    path: &str,
    ctx: Arc<IpcContext>,
    cancel: tokio_util::sync::CancellationToken,
) {
    use tokio::net::UnixListener;

    // Remove stale socket file.
    let _ = std::fs::remove_file(path);

    let listener = match UnixListener::bind(path) {
        Ok(l) => l,
        Err(e) => {
            error!(path, error = %e, "failed to bind Unix socket");
            return;
        }
    };

    info!(path, "IPC server listening (Unix socket)");

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("IPC server shutting down");
                let _ = std::fs::remove_file(path);
                return;
            }
            accept = listener.accept() => {
                match accept {
                    Ok((stream, _addr)) => {
                        let ctx = ctx.clone();
                        tokio::spawn(async move {
                            handle_unix_connection(stream, ctx).await;
                        });
                    }
                    Err(e) => {
                        warn!(error = %e, "failed to accept IPC connection");
                    }
                }
            }
        }
    }
}

#[cfg(unix)]
async fn handle_unix_connection(stream: tokio::net::UnixStream, ctx: Arc<IpcContext>) {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        debug!(line, "IPC received");

        let response = match serde_json::from_str::<IpcCommand>(&line) {
            Ok(cmd) => handle_command(cmd, &ctx).await,
            Err(e) => IpcResponse::err(format!("invalid command: {}", e)),
        };

        let mut resp_json = serde_json::to_string(&response).unwrap_or_default();
        resp_json.push('\n');
        if writer.write_all(resp_json.as_bytes()).await.is_err() {
            break;
        }
    }
}

// ---- Windows named pipe implementation ----

#[cfg(windows)]
async fn run_named_pipe_server(
    pipe_name: &str,
    ctx: Arc<IpcContext>,
    cancel: tokio_util::sync::CancellationToken,
) {
    // On Windows we use a TCP loopback listener as a portable fallback.
    // True named-pipe support requires `tokio::net::windows::named_pipe`
    // which needs additional feature flags; TCP on 127.0.0.1 is simpler
    // and equally functional for a local-only daemon.
    //
    // The `pipe_name` on Windows is treated as a port hint: we extract
    // a numeric suffix or default to 9284.
    let port: u16 = pipe_name
        .rsplit('\\')
        .next()
        .and_then(|s| {
            s.chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse()
                .ok()
        })
        .unwrap_or(9284);

    let addr = format!("127.0.0.1:{}", port);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            error!(addr, error = %e, "failed to bind IPC TCP listener");
            return;
        }
    };

    info!(addr, pipe_name, "IPC server listening (Windows TCP fallback)");

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("IPC server shutting down");
                return;
            }
            accept = listener.accept() => {
                match accept {
                    Ok((stream, peer)) => {
                        // Only accept loopback connections.
                        if !peer.ip().is_loopback() {
                            warn!(peer = %peer, "rejected non-loopback IPC connection");
                            continue;
                        }
                        let ctx = ctx.clone();
                        tokio::spawn(async move {
                            handle_tcp_connection(stream, ctx).await;
                        });
                    }
                    Err(e) => {
                        warn!(error = %e, "failed to accept IPC connection");
                    }
                }
            }
        }
    }
}

#[cfg(windows)]
async fn handle_tcp_connection(stream: tokio::net::TcpStream, ctx: Arc<IpcContext>) {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        debug!(line, "IPC received");

        let response = match serde_json::from_str::<IpcCommand>(&line) {
            Ok(cmd) => handle_command(cmd, &ctx).await,
            Err(e) => IpcResponse::err(format!("invalid command: {}", e)),
        };

        let mut resp_json = serde_json::to_string(&response).unwrap_or_default();
        resp_json.push('\n');
        if writer.write_all(resp_json.as_bytes()).await.is_err() {
            break;
        }
    }
}
