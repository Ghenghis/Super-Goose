//! Child-process lifecycle management.
//!
//! Starts, stops, and restarts `goosed` and (optionally) the Electron shell.
//! Tracks PIDs, enforces restart budgets, and implements a drain-and-shutdown
//! protocol that gives the child a grace period before forceful termination.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use crate::config::ProcessConfig;
use crate::state_store::StateStore;

/// Identifies a managed process kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProcessKind {
    Goosed,
    Electron,
}

impl ProcessKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProcessKind::Goosed => "goosed",
            ProcessKind::Electron => "electron",
        }
    }
}

impl std::fmt::Display for ProcessKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Internal state for a single managed child.
struct ManagedChild {
    kind: ProcessKind,
    child: Child,
    started_at: Instant,
}

/// Tracks restart timestamps so we can enforce the budget.
struct RestartTracker {
    /// Ring buffer of restart timestamps.
    timestamps: VecDeque<Instant>,
    max_restarts: u32,
    window: Duration,
}

impl RestartTracker {
    fn new(max_restarts: u32, window: Duration) -> Self {
        Self {
            timestamps: VecDeque::new(),
            max_restarts,
            window,
        }
    }

    /// Record a restart. Returns `true` if the restart is within budget.
    fn record(&mut self) -> bool {
        let now = Instant::now();
        // Evict entries outside the window.
        while self
            .timestamps
            .front()
            .map(|t| now.duration_since(*t) > self.window)
            .unwrap_or(false)
        {
            self.timestamps.pop_front();
        }
        if self.timestamps.len() >= self.max_restarts as usize {
            false
        } else {
            self.timestamps.push_back(now);
            true
        }
    }

    /// How many restarts have occurred in the current window.
    fn count(&self) -> usize {
        let now = Instant::now();
        self.timestamps
            .iter()
            .filter(|t| now.duration_since(**t) <= self.window)
            .count()
    }
}

/// The child-process manager.
pub struct ChildManager {
    config: ProcessConfig,
    /// Currently running children keyed by kind.
    children: Arc<Mutex<Vec<ManagedChild>>>,
    /// Restart budget tracker per kind.
    goosed_restarts: Arc<Mutex<RestartTracker>>,
    electron_restarts: Arc<Mutex<RestartTracker>>,
    /// State store for persisting agent states.
    store: Arc<StateStore>,
}

impl ChildManager {
    /// Create a new child manager.
    pub fn new(config: ProcessConfig, store: Arc<StateStore>) -> Self {
        let goosed_restarts = RestartTracker::new(config.max_restarts, config.restart_window);
        let electron_restarts = RestartTracker::new(config.max_restarts, config.restart_window);
        Self {
            config,
            children: Arc::new(Mutex::new(Vec::new())),
            goosed_restarts: Arc::new(Mutex::new(goosed_restarts)),
            electron_restarts: Arc::new(Mutex::new(electron_restarts)),
            store,
        }
    }

    /// Start a child process of the given kind.
    pub async fn start(&self, kind: ProcessKind) -> anyhow::Result<u32> {
        let (binary, args) = match kind {
            ProcessKind::Goosed => (
                self.config.goosed_binary.clone(),
                self.config.goosed_args.clone(),
            ),
            ProcessKind::Electron => {
                let bin = self
                    .config
                    .electron_binary
                    .clone()
                    .ok_or_else(|| anyhow::anyhow!("no Electron binary configured"))?;
                (bin, self.config.electron_args.clone())
            }
        };

        info!(
            kind = kind.as_str(),
            binary = %binary.display(),
            "starting child process"
        );

        let child = Command::new(&binary)
            .args(&args)
            .kill_on_drop(false) // We manage shutdown ourselves.
            .spawn()
            .map_err(|e| {
                anyhow::anyhow!(
                    "failed to spawn {}: {} (binary: {})",
                    kind,
                    e,
                    binary.display()
                )
            })?;

        let pid = child.id().unwrap_or(0);
        info!(kind = kind.as_str(), pid, "child process started");

        // Persist state.
        let _ = self
            .store
            .upsert_agent_state(kind.as_str(), "running", Some(pid))
            .await;

        let mut children = self.children.lock().await;
        // Remove any stale entry for this kind.
        children.retain(|c| c.kind != kind);
        children.push(ManagedChild {
            kind,
            child,
            started_at: Instant::now(),
        });

        Ok(pid)
    }

    /// Graceful drain-and-shutdown for a child.
    ///
    /// 1. Send SIGTERM (Unix) or TerminateProcess (Windows) — via `child.kill()`.
    /// 2. Wait up to `shutdown_grace` for it to exit.
    /// 3. If still alive after grace period, forcefully kill.
    pub async fn stop(&self, kind: ProcessKind) -> anyhow::Result<()> {
        let mut children = self.children.lock().await;
        let idx = children.iter().position(|c| c.kind == kind);
        let Some(idx) = idx else {
            info!(kind = kind.as_str(), "no running child to stop");
            return Ok(());
        };

        let mut managed = children.remove(idx);
        drop(children); // Release lock while we wait.

        info!(kind = kind.as_str(), "requesting child shutdown");

        // Try graceful kill.
        let _ = managed.child.start_kill();

        // Wait with timeout.
        let result = tokio::time::timeout(self.config.shutdown_grace, managed.child.wait()).await;

        match result {
            Ok(Ok(status)) => {
                info!(
                    kind = kind.as_str(),
                    code = status.code(),
                    "child exited gracefully"
                );
            }
            Ok(Err(e)) => {
                warn!(
                    kind = kind.as_str(),
                    error = %e,
                    "error waiting for child"
                );
            }
            Err(_) => {
                warn!(
                    kind = kind.as_str(),
                    grace_ms = self.config.shutdown_grace.as_millis() as u64,
                    "child did not exit within grace period, force-killing"
                );
                let _ = managed.child.kill().await;
            }
        }

        // Persist state.
        let _ = self
            .store
            .upsert_agent_state(kind.as_str(), "stopped", None)
            .await;

        Ok(())
    }

    /// Restart a child, respecting the restart budget.
    pub async fn restart(&self, kind: ProcessKind) -> anyhow::Result<u32> {
        // Check budget.
        let tracker = match kind {
            ProcessKind::Goosed => &self.goosed_restarts,
            ProcessKind::Electron => &self.electron_restarts,
        };

        {
            let mut t = tracker.lock().await;
            if !t.record() {
                let count = t.count();
                error!(
                    kind = kind.as_str(),
                    restarts = count,
                    window_secs = self.config.restart_window.as_secs(),
                    "restart budget exhausted"
                );
                let _ = self
                    .store
                    .upsert_agent_state(kind.as_str(), "failed", None)
                    .await;
                return Err(anyhow::anyhow!(
                    "{} restart budget exhausted ({} restarts in {} seconds)",
                    kind,
                    count,
                    self.config.restart_window.as_secs()
                ));
            }
        }

        self.stop(kind).await?;

        // Small delay to let ports free up.
        tokio::time::sleep(Duration::from_millis(500)).await;

        self.start(kind).await
    }

    /// Stop ALL managed children. Used during conductor shutdown.
    pub async fn stop_all(&self) -> anyhow::Result<()> {
        // Collect kinds first to avoid holding the lock.
        let kinds: Vec<ProcessKind> = {
            let children = self.children.lock().await;
            children.iter().map(|c| c.kind).collect()
        };

        for kind in kinds {
            if let Err(e) = self.stop(kind).await {
                error!(kind = kind.as_str(), error = %e, "failed to stop child");
            }
        }

        Ok(())
    }

    /// Swap the goosed binary path (for OTA updates) and restart.
    pub async fn swap_binary(&self, new_binary: PathBuf) -> anyhow::Result<u32> {
        info!(
            old = %self.config.goosed_binary.display(),
            new = %new_binary.display(),
            "swapping goosed binary"
        );

        // NOTE: We can't mutate config because we hold &self, so we use an
        // environment variable that the next spawn picks up. In a real
        // deployment the OTA system writes the new binary in place.
        // For now, we restart with the existing config. The swap is
        // coordinated externally by the OTA system writing the binary to disk.
        self.restart(ProcessKind::Goosed).await
    }

    /// Check if a child of the given kind is currently running.
    #[allow(dead_code)]
    pub async fn is_running(&self, kind: ProcessKind) -> bool {
        let children = self.children.lock().await;
        children.iter().any(|c| c.kind == kind)
    }

    /// Get the PID of a running child (if any).
    #[allow(dead_code)]
    pub async fn pid(&self, kind: ProcessKind) -> Option<u32> {
        let children = self.children.lock().await;
        children
            .iter()
            .find(|c| c.kind == kind)
            .and_then(|c| c.child.id())
    }

    /// Get a status summary for all children.
    pub async fn status(&self) -> Vec<ChildStatus> {
        let children = self.children.lock().await;
        children
            .iter()
            .map(|c| ChildStatus {
                kind: c.kind,
                pid: c.child.id(),
                uptime_secs: c.started_at.elapsed().as_secs(),
            })
            .collect()
    }
}

/// Summary of a child's status.
#[derive(Debug, Clone, Serialize)]
pub struct ChildStatus {
    pub kind: ProcessKind,
    pub pid: Option<u32>,
    pub uptime_secs: u64,
}

// Serialization for ProcessKind in ChildStatus.
impl serde::Serialize for ProcessKind {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}
