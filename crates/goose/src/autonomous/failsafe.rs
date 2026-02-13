//! Failsafe — Circuit breaker pattern + cascade failsafe for autonomous operations.
//!
//! Prevents runaway failures by tracking consecutive errors and opening the circuit
//! when a threshold is exceeded. Supports three states:
//! - Closed: normal operation, requests pass through
//! - Open: circuit is tripped, all requests fail immediately
//! - HalfOpen: trial period, one request allowed through to test recovery

use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// The state of the circuit breaker.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CircuitState {
    /// Normal operation — requests pass through.
    Closed,
    /// Circuit is tripped — all requests fail immediately.
    Open,
    /// Trial period — one request is allowed through to test recovery.
    HalfOpen,
}

impl std::fmt::Display for CircuitState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircuitState::Closed => write!(f, "closed"),
            CircuitState::Open => write!(f, "open"),
            CircuitState::HalfOpen => write!(f, "half-open"),
        }
    }
}

/// Configuration for the circuit breaker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailsafeConfig {
    /// Maximum consecutive failures before the circuit opens.
    pub max_failures: u32,
    /// How long the circuit stays open before transitioning to half-open.
    pub reset_timeout_secs: u64,
    /// Maximum number of cascade failures across all breakers before global shutdown.
    pub cascade_threshold: u32,
}

impl Default for FailsafeConfig {
    fn default() -> Self {
        Self {
            max_failures: 5,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        }
    }
}

/// A single circuit breaker instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreaker {
    /// Name/label for this breaker (e.g., "branch_manager", "ci_watcher").
    pub name: String,
    /// Current state.
    pub state: CircuitState,
    /// Number of consecutive failures.
    pub consecutive_failures: u32,
    /// Total number of successes.
    pub total_successes: u64,
    /// Total number of failures.
    pub total_failures: u64,
    /// When the circuit was last opened (for reset timeout calculation).
    pub last_failure_at: Option<DateTime<Utc>>,
    /// When the circuit was last transitioned.
    pub last_transition_at: DateTime<Utc>,
    /// Configuration for this breaker.
    pub config: FailsafeConfig,
}

impl CircuitBreaker {
    /// Create a new circuit breaker with the given name and config.
    pub fn new(name: impl Into<String>, config: FailsafeConfig) -> Self {
        Self {
            name: name.into(),
            state: CircuitState::Closed,
            consecutive_failures: 0,
            total_successes: 0,
            total_failures: 0,
            last_failure_at: None,
            last_transition_at: Utc::now(),
            config,
        }
    }

    /// Create a new circuit breaker with default config.
    pub fn with_defaults(name: impl Into<String>) -> Self {
        Self::new(name, FailsafeConfig::default())
    }

    /// Check if a request is allowed through the circuit breaker.
    /// If in Open state and reset timeout has elapsed, transition to HalfOpen.
    pub fn allow_request(&mut self) -> bool {
        match self.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if reset timeout has elapsed
                if let Some(last_failure) = self.last_failure_at {
                    let elapsed = Utc::now()
                        .signed_duration_since(last_failure)
                        .num_seconds();
                    if elapsed >= self.config.reset_timeout_secs as i64 {
                        info!(
                            breaker = %self.name,
                            "Circuit breaker transitioning to half-open after timeout"
                        );
                        self.state = CircuitState::HalfOpen;
                        self.last_transition_at = Utc::now();
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Record a successful operation.
    pub fn record_success(&mut self) {
        self.total_successes += 1;
        self.consecutive_failures = 0;

        if self.state == CircuitState::HalfOpen {
            info!(
                breaker = %self.name,
                "Circuit breaker closing after successful half-open trial"
            );
            self.state = CircuitState::Closed;
            self.last_transition_at = Utc::now();
        }
    }

    /// Record a failed operation.
    pub fn record_failure(&mut self) {
        self.total_failures += 1;
        self.consecutive_failures += 1;
        self.last_failure_at = Some(Utc::now());

        match self.state {
            CircuitState::Closed => {
                if self.consecutive_failures >= self.config.max_failures {
                    warn!(
                        breaker = %self.name,
                        failures = self.consecutive_failures,
                        "Circuit breaker opening after {} consecutive failures",
                        self.consecutive_failures
                    );
                    self.state = CircuitState::Open;
                    self.last_transition_at = Utc::now();
                }
            }
            CircuitState::HalfOpen => {
                warn!(
                    breaker = %self.name,
                    "Circuit breaker re-opening after failed half-open trial"
                );
                self.state = CircuitState::Open;
                self.last_transition_at = Utc::now();
            }
            CircuitState::Open => {
                // Already open, just count the failure
            }
        }
    }

    /// Manually reset the circuit breaker to closed state.
    pub fn reset(&mut self) {
        info!(breaker = %self.name, "Circuit breaker manually reset to closed");
        self.state = CircuitState::Closed;
        self.consecutive_failures = 0;
        self.last_failure_at = None;
        self.last_transition_at = Utc::now();
    }

    /// Get a snapshot of the breaker status.
    pub fn status(&self) -> BreakerStatus {
        BreakerStatus {
            name: self.name.clone(),
            state: self.state,
            consecutive_failures: self.consecutive_failures,
            total_successes: self.total_successes,
            total_failures: self.total_failures,
            last_failure_at: self.last_failure_at,
        }
    }
}

/// Status snapshot for external reporting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakerStatus {
    pub name: String,
    pub state: CircuitState,
    pub consecutive_failures: u32,
    pub total_successes: u64,
    pub total_failures: u64,
    pub last_failure_at: Option<DateTime<Utc>>,
}

/// Cascade failsafe — monitors multiple circuit breakers and triggers global shutdown
/// when too many are open simultaneously.
pub struct Failsafe {
    breakers: Vec<CircuitBreaker>,
    cascade_threshold: u32,
    global_shutdown: bool,
}

impl Failsafe {
    /// Create a new failsafe with the given cascade threshold.
    pub fn new(cascade_threshold: u32) -> Self {
        Self {
            breakers: Vec::new(),
            cascade_threshold,
            global_shutdown: false,
        }
    }

    /// Create a failsafe with default settings.
    pub fn with_defaults() -> Self {
        Self::new(FailsafeConfig::default().cascade_threshold)
    }

    /// Register a new circuit breaker.
    pub fn register(&mut self, name: impl Into<String>, config: FailsafeConfig) {
        self.breakers.push(CircuitBreaker::new(name, config));
    }

    /// Register a circuit breaker with default config.
    pub fn register_default(&mut self, name: impl Into<String>) {
        self.breakers
            .push(CircuitBreaker::with_defaults(name));
    }

    /// Check if a request is allowed for a named breaker.
    pub fn allow_request(&mut self, name: &str) -> Result<bool> {
        if self.global_shutdown {
            bail!("Global shutdown active — all operations blocked");
        }

        let breaker = self
            .breakers
            .iter_mut()
            .find(|b| b.name == name)
            .ok_or_else(|| anyhow::anyhow!("No breaker registered with name '{}'", name))?;

        Ok(breaker.allow_request())
    }

    /// Record a success for a named breaker.
    pub fn record_success(&mut self, name: &str) -> Result<()> {
        let breaker = self
            .breakers
            .iter_mut()
            .find(|b| b.name == name)
            .ok_or_else(|| anyhow::anyhow!("No breaker registered with name '{}'", name))?;

        breaker.record_success();
        Ok(())
    }

    /// Record a failure for a named breaker and check cascade.
    pub fn record_failure(&mut self, name: &str) -> Result<()> {
        let breaker = self
            .breakers
            .iter_mut()
            .find(|b| b.name == name)
            .ok_or_else(|| anyhow::anyhow!("No breaker registered with name '{}'", name))?;

        breaker.record_failure();
        self.check_cascade();
        Ok(())
    }

    /// Count how many breakers are currently open.
    pub fn open_breaker_count(&self) -> u32 {
        self.breakers
            .iter()
            .filter(|b| b.state == CircuitState::Open)
            .count() as u32
    }

    /// Check if cascade threshold is exceeded.
    fn check_cascade(&mut self) {
        let open_count = self.open_breaker_count();
        if open_count >= self.cascade_threshold {
            warn!(
                open = open_count,
                threshold = self.cascade_threshold,
                "Cascade failsafe triggered — global shutdown activated"
            );
            self.global_shutdown = true;
        }
    }

    /// Check if global shutdown is active.
    pub fn is_shutdown(&self) -> bool {
        self.global_shutdown
    }

    /// Manually reset global shutdown (for recovery).
    pub fn reset_shutdown(&mut self) {
        info!("Global shutdown reset");
        self.global_shutdown = false;
    }

    /// Reset a specific breaker by name.
    pub fn reset_breaker(&mut self, name: &str) -> Result<()> {
        let breaker = self
            .breakers
            .iter_mut()
            .find(|b| b.name == name)
            .ok_or_else(|| anyhow::anyhow!("No breaker registered with name '{}'", name))?;

        breaker.reset();
        Ok(())
    }

    /// Get status of all breakers.
    pub fn status(&self) -> Vec<BreakerStatus> {
        self.breakers.iter().map(|b| b.status()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_starts_closed() {
        let breaker = CircuitBreaker::with_defaults("test");
        assert_eq!(breaker.state, CircuitState::Closed);
        assert_eq!(breaker.consecutive_failures, 0);
    }

    #[test]
    fn test_circuit_breaker_opens_after_max_failures() {
        let config = FailsafeConfig {
            max_failures: 3,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        assert!(breaker.allow_request());
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Closed);

        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Closed);

        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);
        assert!(!breaker.allow_request()); // Should block
    }

    #[test]
    fn test_circuit_breaker_success_resets_count() {
        let config = FailsafeConfig {
            max_failures: 3,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.consecutive_failures, 2);

        breaker.record_success();
        assert_eq!(breaker.consecutive_failures, 0);
        assert_eq!(breaker.state, CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_manual_reset() {
        let config = FailsafeConfig {
            max_failures: 2,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);

        breaker.reset();
        assert_eq!(breaker.state, CircuitState::Closed);
        assert_eq!(breaker.consecutive_failures, 0);
        assert!(breaker.allow_request());
    }

    #[test]
    fn test_circuit_breaker_status() {
        let mut breaker = CircuitBreaker::with_defaults("my_breaker");
        breaker.record_success();
        breaker.record_failure();

        let status = breaker.status();
        assert_eq!(status.name, "my_breaker");
        assert_eq!(status.total_successes, 1);
        assert_eq!(status.total_failures, 1);
        assert_eq!(status.state, CircuitState::Closed);
    }

    #[test]
    fn test_failsafe_cascade_shutdown() {
        // Cascade threshold of 2 — if 2 breakers open, global shutdown
        let mut failsafe = Failsafe::new(2);
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 60,
            cascade_threshold: 2,
        };

        failsafe.register("breaker_a", config.clone());
        failsafe.register("breaker_b", config.clone());
        failsafe.register("breaker_c", config);

        assert!(!failsafe.is_shutdown());

        // Trip breaker_a
        failsafe.record_failure("breaker_a").unwrap();
        assert!(!failsafe.is_shutdown());

        // Trip breaker_b — cascade threshold reached
        failsafe.record_failure("breaker_b").unwrap();
        assert!(failsafe.is_shutdown());

        // All requests should be blocked
        assert!(failsafe.allow_request("breaker_c").is_err());
    }

    #[test]
    fn test_failsafe_reset_shutdown() {
        let mut failsafe = Failsafe::new(1);
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 60,
            cascade_threshold: 1,
        };
        failsafe.register("breaker", config);

        failsafe.record_failure("breaker").unwrap();
        assert!(failsafe.is_shutdown());

        failsafe.reset_shutdown();
        assert!(!failsafe.is_shutdown());
    }

    #[test]
    fn test_failsafe_unknown_breaker() {
        let mut failsafe = Failsafe::new(5);
        assert!(failsafe.allow_request("nonexistent").is_err());
        assert!(failsafe.record_success("nonexistent").is_err());
        assert!(failsafe.record_failure("nonexistent").is_err());
    }

    #[test]
    fn test_circuit_state_display() {
        assert_eq!(CircuitState::Closed.to_string(), "closed");
        assert_eq!(CircuitState::Open.to_string(), "open");
        assert_eq!(CircuitState::HalfOpen.to_string(), "half-open");
    }

    // === Production hardening edge-case tests ===

    #[test]
    fn test_multiple_rapid_failures_open_circuit_exactly_at_threshold() {
        // Edge case: verify the circuit opens exactly at max_failures, not before
        let config = FailsafeConfig {
            max_failures: 5,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        for i in 0..4 {
            breaker.record_failure();
            assert_eq!(
                breaker.state,
                CircuitState::Closed,
                "Should stay closed at {} failures",
                i + 1
            );
        }

        // 5th failure should open it
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);
        assert_eq!(breaker.consecutive_failures, 5);
    }

    #[test]
    fn test_rapid_success_failure_interleave() {
        // Edge case: alternating success/failure should never open the circuit
        // because consecutive_failures resets on success
        let config = FailsafeConfig {
            max_failures: 3,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        for _ in 0..100 {
            breaker.record_failure();
            breaker.record_failure(); // 2 consecutive
            breaker.record_success(); // Reset
        }

        // Should still be closed because we never hit 3 consecutive
        assert_eq!(breaker.state, CircuitState::Closed);
        assert_eq!(breaker.total_failures, 200);
        assert_eq!(breaker.total_successes, 100);
    }

    #[test]
    fn test_half_open_failure_reopens_circuit() {
        // Edge case: failing in HalfOpen state should re-open the circuit
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 0, // Instant timeout for testing
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        // Trip the circuit
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);

        // Allow request should transition to HalfOpen (timeout = 0)
        assert!(breaker.allow_request());
        assert_eq!(breaker.state, CircuitState::HalfOpen);

        // Fail in half-open
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);
    }

    #[test]
    fn test_half_open_success_closes_circuit() {
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 0,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        // Trip and recover
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);

        breaker.allow_request(); // -> HalfOpen
        breaker.record_success();
        assert_eq!(breaker.state, CircuitState::Closed);
        assert_eq!(breaker.consecutive_failures, 0);
    }

    #[test]
    fn test_recording_failure_when_already_open() {
        // Edge case: additional failures while already open should not change state
        let config = FailsafeConfig {
            max_failures: 2,
            reset_timeout_secs: 60,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);

        // More failures while open
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);
        assert_eq!(breaker.total_failures, 5);
        assert_eq!(breaker.consecutive_failures, 5);
    }

    #[test]
    fn test_manual_reset_after_many_failures() {
        let config = FailsafeConfig {
            max_failures: 2,
            reset_timeout_secs: 3600,
            cascade_threshold: 10,
        };
        let mut breaker = CircuitBreaker::new("test", config);

        // Trip circuit
        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);

        // Manual reset
        breaker.reset();
        assert_eq!(breaker.state, CircuitState::Closed);
        assert_eq!(breaker.consecutive_failures, 0);
        assert!(breaker.last_failure_at.is_none());
        assert!(breaker.allow_request());
    }

    #[test]
    fn test_failsafe_cascade_threshold_exact_boundary() {
        // Edge case: exactly at cascade threshold triggers shutdown
        let mut failsafe = Failsafe::new(3);
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 60,
            cascade_threshold: 3,
        };

        failsafe.register("a", config.clone());
        failsafe.register("b", config.clone());
        failsafe.register("c", config.clone());
        failsafe.register("d", config);

        failsafe.record_failure("a").unwrap();
        assert!(!failsafe.is_shutdown());

        failsafe.record_failure("b").unwrap();
        assert!(!failsafe.is_shutdown());

        // 3rd open breaker hits the cascade threshold
        failsafe.record_failure("c").unwrap();
        assert!(failsafe.is_shutdown());
    }

    #[test]
    fn test_failsafe_reset_breaker_unknown_name() {
        let mut failsafe = Failsafe::with_defaults();
        assert!(failsafe.reset_breaker("does_not_exist").is_err());
    }

    #[test]
    fn test_failsafe_status_reflects_all_breakers() {
        let mut failsafe = Failsafe::new(10);
        failsafe.register_default("breaker_1");
        failsafe.register_default("breaker_2");
        failsafe.register_default("breaker_3");

        let status = failsafe.status();
        assert_eq!(status.len(), 3);
        assert!(status.iter().all(|s| s.state == CircuitState::Closed));
    }

    #[test]
    fn test_failsafe_global_shutdown_blocks_all_requests() {
        let mut failsafe = Failsafe::new(1);
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 60,
            cascade_threshold: 1,
        };
        failsafe.register("a", config.clone());
        failsafe.register("b", config);

        // Trip one breaker to trigger cascade (threshold=1)
        failsafe.record_failure("a").unwrap();
        assert!(failsafe.is_shutdown());

        // All requests should fail with global shutdown error
        assert!(failsafe.allow_request("a").is_err());
        assert!(failsafe.allow_request("b").is_err());
    }

    #[test]
    fn test_failsafe_reset_shutdown_then_allow_requests() {
        let mut failsafe = Failsafe::new(1);
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 0,
            cascade_threshold: 1,
        };
        failsafe.register("a", config);

        failsafe.record_failure("a").unwrap();
        assert!(failsafe.is_shutdown());

        failsafe.reset_shutdown();
        failsafe.reset_breaker("a").unwrap();

        // After reset, requests should be allowed again
        let allowed = failsafe.allow_request("a").unwrap();
        assert!(allowed);
    }

    #[test]
    fn test_open_breaker_count() {
        let mut failsafe = Failsafe::new(100);
        let config = FailsafeConfig {
            max_failures: 1,
            reset_timeout_secs: 60,
            cascade_threshold: 100,
        };
        failsafe.register("a", config.clone());
        failsafe.register("b", config.clone());
        failsafe.register("c", config);

        assert_eq!(failsafe.open_breaker_count(), 0);

        failsafe.record_failure("a").unwrap();
        assert_eq!(failsafe.open_breaker_count(), 1);

        failsafe.record_failure("b").unwrap();
        assert_eq!(failsafe.open_breaker_count(), 2);
    }

    #[test]
    fn test_circuit_breaker_serialization_roundtrip() {
        let breaker = CircuitBreaker::with_defaults("test_breaker");
        let json = serde_json::to_string(&breaker).unwrap();
        let deserialized: CircuitBreaker = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test_breaker");
        assert_eq!(deserialized.state, CircuitState::Closed);
    }

    #[test]
    fn test_circuit_state_serialization_roundtrip() {
        for state in &[CircuitState::Closed, CircuitState::Open, CircuitState::HalfOpen] {
            let json = serde_json::to_string(state).unwrap();
            let deserialized: CircuitState = serde_json::from_str(&json).unwrap();
            assert_eq!(&deserialized, state);
        }
    }
}
