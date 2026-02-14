//! IPC client for the goose-conductor daemon.
//!
//! Connects to the conductor's IPC socket (Unix domain socket on Unix, TCP on
//! Windows) and provides registration, heartbeat, state reporting, and
//! drain/shutdown handling.  Fully optional — if the conductor isn't running
//! the client retries silently in the background without affecting goose-server
//! operation.

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{watch, Mutex};
use tracing::{debug, info, warn};

// ---------------------------------------------------------------------------
// Protocol types (mirror of goose-conductor's IPC protocol)
// ---------------------------------------------------------------------------

/// Commands sent from client to conductor (matches `goose_conductor::ipc_server::IpcCommand`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum IpcCommand {
    Ping,
    Publish {
        topic: String,
        sender: String,
        recipient: Option<String>,
        payload: serde_json::Value,
    },
    GetStatus,
}

/// Response from conductor (matches `goose_conductor::ipc_server::IpcResponse`).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct IpcResponse {
    ok: bool,
    #[serde(default)]
    data: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Agent states reported to the conductor
// ---------------------------------------------------------------------------

/// The state that goose-server reports to the conductor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    /// Server is running and ready to accept requests.
    Running,
    /// Server is actively processing a request.
    Busy,
    /// Server is idle (running but no active sessions).
    Idle,
    /// Server is draining — finishing in-flight work before shutdown.
    Draining,
}

impl std::fmt::Display for AgentState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentState::Running => write!(f, "running"),
            AgentState::Busy => write!(f, "busy"),
            AgentState::Idle => write!(f, "idle"),
            AgentState::Draining => write!(f, "draining"),
        }
    }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration for the conductor IPC client.
#[derive(Debug, Clone)]
pub struct ConductorClientConfig {
    /// IPC endpoint — Unix socket path or TCP address.
    pub ipc_path: String,
    /// How long to wait between heartbeats.
    pub heartbeat_interval: Duration,
    /// How long to wait before retrying a failed connection.
    pub reconnect_interval: Duration,
    /// Timeout for individual IPC requests.
    pub request_timeout: Duration,
    /// Identifier for this goose-server instance.
    pub instance_id: String,
}

impl Default for ConductorClientConfig {
    fn default() -> Self {
        Self {
            ipc_path: default_ipc_path(),
            heartbeat_interval: Duration::from_secs(10),
            reconnect_interval: Duration::from_secs(5),
            request_timeout: Duration::from_secs(3),
            instance_id: format!("goosed-{}", uuid::Uuid::new_v4().as_simple()),
        }
    }
}

/// Default IPC path matching the conductor's defaults.
#[cfg(windows)]
fn default_ipc_path() -> String {
    // The conductor on Windows uses TCP on 127.0.0.1:9284 as a portable fallback.
    // The pipe name `\\.\pipe\goose-conductor` is parsed for digits → port 9284.
    "127.0.0.1:9284".to_string()
}

#[cfg(unix)]
fn default_ipc_path() -> String {
    let dir = dirs::runtime_dir()
        .or_else(dirs::state_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
    dir.join("goose-conductor.sock")
        .to_string_lossy()
        .to_string()
}

// ---------------------------------------------------------------------------
// Client handle (public API)
// ---------------------------------------------------------------------------

/// Handle to the conductor client background task.
///
/// Provides methods to update the reported state and request shutdown.  The
/// client runs entirely in the background -- callers only interact through this
/// handle.
#[derive(Clone)]
pub struct ConductorClientHandle {
    /// Callers use `set_state()` to update the agent state reported to the
    /// conductor.  The field is read by the background heartbeat loop via the
    /// corresponding `watch::Receiver`.
    #[allow(dead_code)]
    state_tx: watch::Sender<AgentState>,
    shutdown_requested: Arc<watch::Receiver<bool>>,
}

impl ConductorClientHandle {
    /// Update the state reported to the conductor on the next heartbeat.
    ///
    /// Callers should set `Busy` when processing a request and `Idle` when
    /// done.  The heartbeat loop reads the latest value and reports it.
    #[allow(dead_code)]
    pub fn set_state(&self, state: AgentState) {
        let _ = self.state_tx.send(state);
    }

    /// Returns `true` if the conductor has requested a drain/shutdown.
    pub fn shutdown_requested(&self) -> bool {
        *self.shutdown_requested.borrow()
    }
}

// ---------------------------------------------------------------------------
// Connection abstraction
// ---------------------------------------------------------------------------

/// A platform-agnostic IPC connection wrapping either a Unix stream or a TCP
/// stream.  Both provide `AsyncBufReadExt` + `AsyncWriteExt` via
/// `tokio::io::split`.
struct IpcConnection {
    #[cfg(unix)]
    reader: tokio::io::BufReader<tokio::io::ReadHalf<tokio::net::UnixStream>>,
    #[cfg(unix)]
    writer: tokio::io::WriteHalf<tokio::net::UnixStream>,
    #[cfg(windows)]
    reader: tokio::io::BufReader<tokio::io::ReadHalf<tokio::net::TcpStream>>,
    #[cfg(windows)]
    writer: tokio::io::WriteHalf<tokio::net::TcpStream>,
}

impl IpcConnection {
    /// Connect to the conductor's IPC endpoint.
    async fn connect(path: &str) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            let stream = tokio::net::UnixStream::connect(path).await?;
            let (reader, writer) = tokio::io::split(stream);
            Ok(Self {
                reader: BufReader::new(reader),
                writer,
            })
        }
        #[cfg(windows)]
        {
            let stream = tokio::net::TcpStream::connect(path).await?;
            let (reader, writer) = tokio::io::split(stream);
            Ok(Self {
                reader: BufReader::new(reader),
                writer,
            })
        }
    }

    /// Send a command and read the response.
    async fn request(&mut self, cmd: &IpcCommand) -> anyhow::Result<IpcResponse> {
        let mut line = serde_json::to_string(cmd)?;
        line.push('\n');
        self.writer.write_all(line.as_bytes()).await?;
        self.writer.flush().await?;

        let mut response_line = String::new();
        let n = self.reader.read_line(&mut response_line).await?;
        if n == 0 {
            return Err(anyhow::anyhow!("conductor closed connection"));
        }

        let resp: IpcResponse = serde_json::from_str(response_line.trim())?;
        Ok(resp)
    }
}

// ---------------------------------------------------------------------------
// Background task
// ---------------------------------------------------------------------------

/// Start the conductor client as a background task.
///
/// Returns a [`ConductorClientHandle`] immediately.  The background task will
/// attempt to connect to the conductor and, if successful, register this
/// goose-server instance and begin heartbeating.  If the conductor is not
/// available the task retries silently without affecting server operation.
///
/// The `cancel` token can be used to stop the background task (e.g. during
/// graceful server shutdown).
pub fn start(
    config: ConductorClientConfig,
    cancel: tokio_util::sync::CancellationToken,
) -> ConductorClientHandle {
    let (state_tx, state_rx) = watch::channel(AgentState::Running);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let handle = ConductorClientHandle {
        state_tx,
        shutdown_requested: Arc::new(shutdown_rx),
    };

    let conn_state_rx = state_rx;
    tokio::spawn(async move {
        run_client_loop(config, conn_state_rx, shutdown_tx, cancel).await;
    });

    handle
}

/// Main client loop — reconnects automatically on connection failure.
async fn run_client_loop(
    config: ConductorClientConfig,
    state_rx: watch::Receiver<AgentState>,
    shutdown_tx: watch::Sender<bool>,
    cancel: tokio_util::sync::CancellationToken,
) {
    let conn: Arc<Mutex<Option<IpcConnection>>> = Arc::new(Mutex::new(None));
    let mut connected = false;

    loop {
        if cancel.is_cancelled() {
            info!("conductor client shutting down");
            // Send a final "draining" state before exit.
            if let Some(ref mut c) = *conn.lock().await {
                let _ = send_state_update(c, &config.instance_id, AgentState::Draining).await;
            }
            return;
        }

        // ---- Try to connect if not connected ----
        if !connected {
            match try_connect(&config, &cancel).await {
                Ok(new_conn) => {
                    info!(
                        ipc_path = config.ipc_path,
                        instance_id = config.instance_id,
                        "connected to conductor"
                    );
                    *conn.lock().await = Some(new_conn);
                    connected = true;

                    // Register on connect.
                    if let Some(ref mut c) = *conn.lock().await {
                        if let Err(e) = register(c, &config.instance_id).await {
                            warn!(error = %e, "failed to register with conductor");
                            *conn.lock().await = None;
                            connected = false;
                        }
                    }
                }
                Err(_) => {
                    // Conductor not available — wait and retry.
                    tokio::select! {
                        _ = cancel.cancelled() => return,
                        _ = tokio::time::sleep(config.reconnect_interval) => continue,
                    }
                }
            }
        }

        // ---- Heartbeat loop ----
        let result = heartbeat_loop(
            &conn,
            &config,
            &state_rx,
            &shutdown_tx,
            &cancel,
        )
        .await;

        if let Err(e) = result {
            warn!(error = %e, "conductor connection lost — will reconnect");
            *conn.lock().await = None;
            connected = false;

            // Back off before reconnecting.
            tokio::select! {
                _ = cancel.cancelled() => return,
                _ = tokio::time::sleep(config.reconnect_interval) => {},
            }
        }
    }
}

/// Attempt to connect to the conductor with a timeout.
async fn try_connect(
    config: &ConductorClientConfig,
    cancel: &tokio_util::sync::CancellationToken,
) -> anyhow::Result<IpcConnection> {
    tokio::select! {
        _ = cancel.cancelled() => Err(anyhow::anyhow!("cancelled")),
        result = tokio::time::timeout(config.request_timeout, IpcConnection::connect(&config.ipc_path)) => {
            match result {
                Ok(Ok(mut conn)) => {
                    // Verify with a ping.
                    let resp = conn.request(&IpcCommand::Ping).await?;
                    if resp.ok {
                        Ok(conn)
                    } else {
                        Err(anyhow::anyhow!("ping failed: {:?}", resp.error))
                    }
                }
                Ok(Err(e)) => Err(anyhow::anyhow!("connection failed: {}", e)),
                Err(_) => Err(anyhow::anyhow!("connection timed out")),
            }
        }
    }
}

/// Register this goose-server instance with the conductor via a bus message.
async fn register(conn: &mut IpcConnection, instance_id: &str) -> anyhow::Result<()> {
    let cmd = IpcCommand::Publish {
        topic: "agent.lifecycle".to_string(),
        sender: instance_id.to_string(),
        recipient: None,
        payload: serde_json::json!({
            "event": "register",
            "agent_id": instance_id,
            "agent_type": "goosed",
            "pid": std::process::id(),
            "version": env!("CARGO_PKG_VERSION"),
            "registered_at": chrono::Utc::now().to_rfc3339(),
        }),
    };

    let resp = conn.request(&cmd).await?;
    if resp.ok {
        info!(instance_id, "registered with conductor");
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "registration failed: {}",
            resp.error.unwrap_or_default()
        ))
    }
}

/// Send a state update to the conductor via the message bus.
async fn send_state_update(
    conn: &mut IpcConnection,
    instance_id: &str,
    state: AgentState,
) -> anyhow::Result<()> {
    let cmd = IpcCommand::Publish {
        topic: "agent.state".to_string(),
        sender: instance_id.to_string(),
        recipient: None,
        payload: serde_json::json!({
            "agent_id": instance_id,
            "state": state,
            "pid": std::process::id(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }),
    };

    let resp = conn.request(&cmd).await?;
    if !resp.ok {
        debug!(
            error = resp.error.as_deref().unwrap_or("unknown"),
            "state update rejected"
        );
    }
    Ok(())
}

/// Run the heartbeat loop, sending periodic state reports and watching for
/// conductor shutdown commands.
async fn heartbeat_loop(
    conn: &Arc<Mutex<Option<IpcConnection>>>,
    config: &ConductorClientConfig,
    state_rx: &watch::Receiver<AgentState>,
    shutdown_tx: &watch::Sender<bool>,
    cancel: &tokio_util::sync::CancellationToken,
) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(config.heartbeat_interval);
    // Don't pile up ticks if a heartbeat takes a while.
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            _ = interval.tick() => {
                let current_state = *state_rx.borrow();
                let mut guard = conn.lock().await;
                let c = guard.as_mut().ok_or_else(|| anyhow::anyhow!("not connected"))?;

                // 1. Send heartbeat / state update.
                send_state_update(c, &config.instance_id, current_state).await?;

                // 2. Ping to verify connection is alive.
                let resp = c.request(&IpcCommand::Ping).await?;
                if !resp.ok {
                    return Err(anyhow::anyhow!("ping failed"));
                }

                // 3. Check conductor status for drain/shutdown signals.
                let status_resp = c.request(&IpcCommand::GetStatus).await?;
                if let Some(data) = &status_resp.data {
                    // If the conductor reports that goosed is being drained,
                    // signal our server to begin graceful shutdown.
                    if let Some(children) = data.get("children").and_then(|c| c.as_array()) {
                        let goosed_draining = children.iter().any(|child| {
                            child.get("kind").and_then(|k| k.as_str()) == Some("goosed")
                                && child.get("pid").is_none()
                        });
                        // Also check if the health circuit is open (conductor
                        // is restarting us), which we treat as a drain signal.
                        let circuit_open = data
                            .get("health")
                            .and_then(|h| h.get("circuit"))
                            .and_then(|c| c.as_str())
                            == Some("Open");

                        if goosed_draining || circuit_open {
                            info!("conductor signaled drain/shutdown");
                            let _ = shutdown_tx.send(true);
                        }
                    }
                }

                debug!(
                    state = %current_state,
                    instance_id = config.instance_id,
                    "heartbeat sent"
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Convenience: environment-variable configuration override
// ---------------------------------------------------------------------------

impl ConductorClientConfig {
    /// Load configuration from environment variables, falling back to defaults.
    ///
    /// Recognized variables:
    /// - `GOOSE_CONDUCTOR_IPC_PATH` — IPC socket path / TCP address
    /// - `GOOSE_CONDUCTOR_HEARTBEAT_MS` — heartbeat interval in milliseconds
    /// - `GOOSE_CONDUCTOR_RECONNECT_MS` — reconnect interval in milliseconds
    pub fn from_env() -> Self {
        let mut config = Self::default();

        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_IPC_PATH") {
            // On Windows, translate the pipe name to TCP address (same logic
            // as the conductor's server side).
            #[cfg(windows)]
            {
                let port: u16 = v
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
                config.ipc_path = format!("127.0.0.1:{}", port);
            }
            #[cfg(unix)]
            {
                config.ipc_path = v;
            }
        }

        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_HEARTBEAT_MS") {
            if let Ok(ms) = v.parse::<u64>() {
                config.heartbeat_interval = Duration::from_millis(ms);
            }
        }

        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_RECONNECT_MS") {
            if let Ok(ms) = v.parse::<u64>() {
                config.reconnect_interval = Duration::from_millis(ms);
            }
        }

        config
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ConductorClientConfig::default();
        assert_eq!(config.heartbeat_interval, Duration::from_secs(10));
        assert_eq!(config.reconnect_interval, Duration::from_secs(5));
        assert_eq!(config.request_timeout, Duration::from_secs(3));
        assert!(config.instance_id.starts_with("goosed-"));
    }

    #[test]
    fn test_agent_state_display() {
        assert_eq!(AgentState::Running.to_string(), "running");
        assert_eq!(AgentState::Busy.to_string(), "busy");
        assert_eq!(AgentState::Idle.to_string(), "idle");
        assert_eq!(AgentState::Draining.to_string(), "draining");
    }

    #[test]
    fn test_ipc_command_serialization() {
        let cmd = IpcCommand::Ping;
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"cmd\":\"ping\""));

        let cmd = IpcCommand::Publish {
            topic: "test".to_string(),
            sender: "goosed-123".to_string(),
            recipient: None,
            payload: serde_json::json!({"state": "running"}),
        };
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"cmd\":\"publish\""));
        assert!(json.contains("\"topic\":\"test\""));
    }

    #[test]
    fn test_ipc_response_deserialization() {
        let json = r#"{"ok":true,"data":{"pong":true}}"#;
        let resp: IpcResponse = serde_json::from_str(json).unwrap();
        assert!(resp.ok);
        assert!(resp.data.is_some());
        assert!(resp.error.is_none());

        let json = r#"{"ok":false,"error":"something went wrong"}"#;
        let resp: IpcResponse = serde_json::from_str(json).unwrap();
        assert!(!resp.ok);
        assert!(resp.error.is_some());
    }

    #[test]
    fn test_from_env_defaults() {
        // Just verify it doesn't panic with no env vars set.
        let config = ConductorClientConfig::from_env();
        assert!(!config.instance_id.is_empty());
    }
}
