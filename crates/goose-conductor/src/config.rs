//! Configuration for the Goose Conductor daemon.
//!
//! All settings have sensible defaults. Configuration is loaded from
//! environment variables prefixed with `GOOSE_CONDUCTOR_` or falls back
//! to compiled-in defaults.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Top-level conductor configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConductorConfig {
    /// Health-check settings for goosed.
    pub health: HealthCheckConfig,
    /// IPC server settings.
    pub ipc: IpcConfig,
    /// Process management settings.
    pub process: ProcessConfig,
    /// State store (SQLite) settings.
    pub store: StoreConfig,
    /// Logging settings.
    pub log: LogConfig,
}

/// Health-check configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckConfig {
    /// Interval between health-check pings.
    #[serde(with = "humantime_serde")]
    pub interval: Duration,
    /// Timeout for a single health-check HTTP request.
    #[serde(with = "humantime_serde")]
    pub timeout: Duration,
    /// Number of consecutive failures before triggering a restart.
    pub failure_threshold: u32,
    /// The URL to probe.
    pub url: String,
}

/// IPC server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcConfig {
    /// Path for the Unix domain socket (Linux/macOS) or named pipe (Windows).
    pub path: String,
    /// Maximum number of concurrent IPC clients.
    pub max_clients: usize,
}

/// Child-process management configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessConfig {
    /// Path to the goosed binary.
    pub goosed_binary: PathBuf,
    /// Arguments passed to goosed on launch.
    pub goosed_args: Vec<String>,
    /// Port goosed listens on.
    pub goosed_port: u16,
    /// Path to the Electron binary (optional — conductor can run without it).
    pub electron_binary: Option<PathBuf>,
    /// Arguments passed to Electron on launch.
    pub electron_args: Vec<String>,
    /// Grace period to wait for a process to exit before sending SIGKILL / TerminateProcess.
    #[serde(with = "humantime_serde")]
    pub shutdown_grace: Duration,
    /// Maximum number of automatic restarts before giving up.
    pub max_restarts: u32,
    /// Window in which `max_restarts` is counted.
    #[serde(with = "humantime_serde")]
    pub restart_window: Duration,
}

/// SQLite state store configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreConfig {
    /// Path to the SQLite database file.
    pub db_path: PathBuf,
}

/// Logging configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// Directory for log files.
    pub dir: PathBuf,
    /// Maximum size of a single log file before rotation (bytes).
    pub max_file_size: u64,
    /// Number of rotated log files to keep.
    pub max_files: usize,
}

// ---------------------------------------------------------------------------
// humantime_serde: tiny shim so serde can handle `Duration` as human strings
// ---------------------------------------------------------------------------
mod humantime_serde {
    use serde::{self, Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u64(duration.as_millis() as u64)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let ms = u64::deserialize(deserializer)?;
        Ok(Duration::from_millis(ms))
    }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

impl Default for ConductorConfig {
    fn default() -> Self {
        Self {
            health: HealthCheckConfig::default(),
            ipc: IpcConfig::default(),
            process: ProcessConfig::default(),
            store: StoreConfig::default(),
            log: LogConfig::default(),
        }
    }
}

impl Default for HealthCheckConfig {
    fn default() -> Self {
        Self {
            interval: Duration::from_secs(5),
            timeout: Duration::from_secs(3),
            failure_threshold: 3,
            url: "http://127.0.0.1:3284/api/health".to_string(),
        }
    }
}

impl Default for IpcConfig {
    fn default() -> Self {
        Self {
            path: default_ipc_path(),
            max_clients: 8,
        }
    }
}

#[cfg(windows)]
fn default_ipc_path() -> String {
    r"\\.\pipe\goose-conductor".to_string()
}

#[cfg(unix)]
fn default_ipc_path() -> String {
    let dir = dirs::runtime_dir()
        .or_else(dirs::state_dir)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.join("goose-conductor.sock")
        .to_string_lossy()
        .to_string()
}

impl Default for ProcessConfig {
    fn default() -> Self {
        Self {
            goosed_binary: default_goosed_binary(),
            goosed_args: vec![],
            goosed_port: 3284,
            electron_binary: None,
            electron_args: vec![],
            shutdown_grace: Duration::from_secs(10),
            max_restarts: 5,
            restart_window: Duration::from_secs(300),
        }
    }
}

fn default_goosed_binary() -> PathBuf {
    // Look for goosed next to ourselves first.
    if let Ok(exe) = std::env::current_exe() {
        let dir = exe.parent().unwrap_or_else(|| std::path::Path::new("."));
        let candidate = if cfg!(windows) {
            dir.join("goosed.exe")
        } else {
            dir.join("goosed")
        };
        if candidate.exists() {
            return candidate;
        }
    }
    // Fallback: rely on PATH.
    PathBuf::from(if cfg!(windows) { "goosed.exe" } else { "goosed" })
}

impl Default for StoreConfig {
    fn default() -> Self {
        let dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        Self {
            db_path: dir.join("goose-conductor").join("state.db"),
        }
    }
}

impl Default for LogConfig {
    fn default() -> Self {
        let dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        Self {
            dir: dir.join("goose-conductor").join("logs"),
            max_file_size: 10 * 1024 * 1024, // 10 MiB
            max_files: 5,
        }
    }
}

impl ConductorConfig {
    /// Load config, applying environment-variable overrides on top of defaults.
    pub fn load() -> Self {
        let mut cfg = Self::default();

        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_HEALTH_INTERVAL_MS") {
            if let Ok(ms) = v.parse::<u64>() {
                cfg.health.interval = Duration::from_millis(ms);
            }
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_HEALTH_TIMEOUT_MS") {
            if let Ok(ms) = v.parse::<u64>() {
                cfg.health.timeout = Duration::from_millis(ms);
            }
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_HEALTH_THRESHOLD") {
            if let Ok(n) = v.parse::<u32>() {
                cfg.health.failure_threshold = n;
            }
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_HEALTH_URL") {
            cfg.health.url = v;
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_IPC_PATH") {
            cfg.ipc.path = v;
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_GOOSED_BINARY") {
            cfg.process.goosed_binary = PathBuf::from(v);
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_GOOSED_PORT") {
            if let Ok(p) = v.parse::<u16>() {
                cfg.process.goosed_port = p;
            }
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_ELECTRON_BINARY") {
            cfg.process.electron_binary = Some(PathBuf::from(v));
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_DB_PATH") {
            cfg.store.db_path = PathBuf::from(v);
        }
        if let Ok(v) = std::env::var("GOOSE_CONDUCTOR_LOG_DIR") {
            cfg.log.dir = PathBuf::from(v);
        }

        cfg
    }
}
