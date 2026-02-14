//! HTTP health-check loop with circuit-breaker restart logic.
//!
//! Pings the goosed `/api/health` endpoint every N seconds.  After
//! `failure_threshold` consecutive failures the circuit "opens" and the
//! child manager is asked to restart the process.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use tracing::{debug, error, info, warn};

use crate::child_manager::{ChildManager, ProcessKind};
use crate::config::HealthCheckConfig;
use crate::state_store::StateStore;

/// Circuit-breaker states.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Everything is fine — health checks are passing.
    Closed,
    /// Failures have reached the threshold — a restart is in progress.
    Open,
    /// After a restart, we're waiting for the first successful check.
    HalfOpen,
}

/// The health checker.
pub struct HealthChecker {
    config: HealthCheckConfig,
    client: reqwest::Client,
    consecutive_failures: AtomicU32,
    state: std::sync::atomic::AtomicU8,
    child_mgr: Arc<ChildManager>,
    store: Arc<StateStore>,
}

impl HealthChecker {
    /// Create a new health checker.
    pub fn new(
        config: HealthCheckConfig,
        child_mgr: Arc<ChildManager>,
        store: Arc<StateStore>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .no_proxy()
            .build()
            .expect("failed to build HTTP client");

        Self {
            config,
            client,
            consecutive_failures: AtomicU32::new(0),
            state: std::sync::atomic::AtomicU8::new(CircuitState::Closed as u8),
            child_mgr,
            store,
        }
    }

    /// Current circuit state.
    pub fn circuit_state(&self) -> CircuitState {
        match self.state.load(Ordering::Relaxed) {
            0 => CircuitState::Closed,
            1 => CircuitState::Open,
            2 => CircuitState::HalfOpen,
            _ => CircuitState::Closed,
        }
    }

    fn set_circuit_state(&self, s: CircuitState) {
        self.state.store(s as u8, Ordering::Relaxed);
    }

    /// Run the health-check loop until the provided cancellation token fires.
    pub async fn run(&self, cancel: tokio_util::sync::CancellationToken) {
        info!(
            url = self.config.url,
            interval_ms = self.config.interval.as_millis() as u64,
            threshold = self.config.failure_threshold,
            "health checker started"
        );

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    info!("health checker shutting down");
                    return;
                }
                _ = tokio::time::sleep(self.config.interval) => {
                    self.check_once().await;
                }
            }
        }
    }

    /// Perform a single health check.
    async fn check_once(&self) {
        let result = self.client.get(&self.config.url).send().await;

        match result {
            Ok(resp) if resp.status().is_success() => {
                self.on_success().await;
            }
            Ok(resp) => {
                warn!(
                    status = resp.status().as_u16(),
                    url = self.config.url,
                    "health check returned non-success status"
                );
                self.on_failure().await;
            }
            Err(e) => {
                warn!(
                    error = %e,
                    url = self.config.url,
                    "health check failed"
                );
                self.on_failure().await;
            }
        }
    }

    /// Handle a successful health check.
    async fn on_success(&self) {
        let prev = self.consecutive_failures.swap(0, Ordering::Relaxed);
        let state = self.circuit_state();

        if state == CircuitState::HalfOpen {
            info!("health check passed after restart — circuit closed");
            self.set_circuit_state(CircuitState::Closed);
        } else if prev > 0 {
            debug!(
                previous_failures = prev,
                "health check recovered"
            );
        }

        // Record health in the store.
        let _ = self.store.record_health("goosed").await;
    }

    /// Handle a failed health check.
    async fn on_failure(&self) {
        let failures = self.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;

        if failures >= self.config.failure_threshold && self.circuit_state() == CircuitState::Closed
        {
            error!(
                failures,
                threshold = self.config.failure_threshold,
                "health check threshold reached — opening circuit, restarting goosed"
            );
            self.set_circuit_state(CircuitState::Open);

            match self.child_mgr.restart(ProcessKind::Goosed).await {
                Ok(pid) => {
                    info!(pid, "goosed restarted by health checker");
                    self.set_circuit_state(CircuitState::HalfOpen);
                    self.consecutive_failures.store(0, Ordering::Relaxed);
                }
                Err(e) => {
                    error!(error = %e, "failed to restart goosed");
                    // Stay in Open state — next check cycle will retry if
                    // we drop back to Closed.
                    self.set_circuit_state(CircuitState::Closed);
                }
            }
        }
    }

    /// Number of consecutive failures (for status reporting).
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures.load(Ordering::Relaxed)
    }
}
