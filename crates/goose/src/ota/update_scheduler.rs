//! UpdateScheduler — schedules periodic self-improvement checks.
//!
//! Manages when to check for updates, respecting cooldown periods,
//! maintenance windows, and user preferences. Can trigger update
//! checks on a cron-like schedule or on-demand.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::{info, warn};

/// Update check policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdatePolicy {
    /// Never check for updates automatically
    Disabled,
    /// Check on startup only
    OnStartup,
    /// Check at regular intervals
    Periodic,
    /// Check only when explicitly requested
    Manual,
}

impl std::fmt::Display for UpdatePolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UpdatePolicy::Disabled => write!(f, "disabled"),
            UpdatePolicy::OnStartup => write!(f, "on_startup"),
            UpdatePolicy::Periodic => write!(f, "periodic"),
            UpdatePolicy::Manual => write!(f, "manual"),
        }
    }
}

/// Configuration for the update scheduler.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerConfig {
    /// Update check policy
    pub policy: UpdatePolicy,
    /// How often to check (for Periodic policy)
    pub check_interval: Duration,
    /// Minimum time between checks (cooldown)
    pub min_cooldown: Duration,
    /// Whether to auto-apply updates or just notify
    pub auto_apply: bool,
    /// Whether to require user confirmation before updating
    pub require_confirmation: bool,
    /// Maximum number of failed updates before disabling auto-update
    pub max_consecutive_failures: u32,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            policy: UpdatePolicy::Manual,
            check_interval: Duration::from_secs(3600), // 1 hour
            min_cooldown: Duration::from_secs(300),     // 5 minutes
            auto_apply: false,
            require_confirmation: true,
            max_consecutive_failures: 3,
        }
    }
}

/// Status of an update check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckStatus {
    /// Whether an update is available
    pub update_available: bool,
    /// Description of what changed
    pub description: String,
    /// When this check was performed
    pub checked_at: DateTime<Utc>,
    /// The source of the update (git branch, release URL, etc.)
    pub source: String,
    /// New version identifier (if available)
    pub new_version: Option<String>,
}

/// Tracks the scheduler's internal state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerState {
    /// When the last update check was performed
    pub last_check: Option<DateTime<Utc>>,
    /// When the last successful update was applied
    pub last_update: Option<DateTime<Utc>>,
    /// Number of consecutive failed updates
    pub consecutive_failures: u32,
    /// Total number of checks performed
    pub total_checks: u64,
    /// Total number of successful updates
    pub total_updates: u64,
    /// Whether the scheduler is currently paused
    pub paused: bool,
}

impl Default for SchedulerState {
    fn default() -> Self {
        Self {
            last_check: None,
            last_update: None,
            consecutive_failures: 0,
            total_checks: 0,
            total_updates: 0,
            paused: false,
        }
    }
}

/// Manages scheduling of OTA update checks.
pub struct UpdateScheduler {
    config: SchedulerConfig,
    state: Arc<Mutex<SchedulerState>>,
}

impl UpdateScheduler {
    /// Create a new UpdateScheduler with the given configuration.
    pub fn new(config: SchedulerConfig) -> Self {
        Self {
            config,
            state: Arc::new(Mutex::new(SchedulerState::default())),
        }
    }

    /// Create with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(SchedulerConfig::default())
    }

    /// Get the current configuration.
    pub fn config(&self) -> &SchedulerConfig {
        &self.config
    }

    /// Get a clone of the current state.
    pub async fn state(&self) -> SchedulerState {
        self.state.lock().await.clone()
    }

    /// Check if an update check should run now.
    pub async fn should_check_now(&self) -> bool {
        let state = self.state.lock().await;

        if state.paused {
            return false;
        }

        match self.config.policy {
            UpdatePolicy::Disabled => false,
            UpdatePolicy::Manual => false,
            UpdatePolicy::OnStartup => state.last_check.is_none(),
            UpdatePolicy::Periodic => {
                match state.last_check {
                    None => true, // Never checked before
                    Some(last) => {
                        let elapsed = Utc::now()
                            .signed_duration_since(last)
                            .to_std()
                            .unwrap_or(Duration::ZERO);
                        elapsed >= self.config.check_interval
                    }
                }
            }
        }
    }

    /// Check if we're in the cooldown period after a recent check.
    pub async fn is_in_cooldown(&self) -> bool {
        let state = self.state.lock().await;
        match state.last_check {
            None => false,
            Some(last) => {
                let elapsed = Utc::now()
                    .signed_duration_since(last)
                    .to_std()
                    .unwrap_or(Duration::ZERO);
                elapsed < self.config.min_cooldown
            }
        }
    }

    /// Record that an update check was performed.
    pub async fn record_check(&self) {
        let mut state = self.state.lock().await;
        state.last_check = Some(Utc::now());
        state.total_checks += 1;
        info!(
            total_checks = state.total_checks,
            "Recorded update check"
        );
    }

    /// Record a successful update.
    pub async fn record_success(&self) {
        let mut state = self.state.lock().await;
        state.last_update = Some(Utc::now());
        state.consecutive_failures = 0;
        state.total_updates += 1;
        info!(
            total_updates = state.total_updates,
            "Recorded successful update"
        );
    }

    /// Record a failed update.
    pub async fn record_failure(&self) {
        let mut state = self.state.lock().await;
        state.consecutive_failures += 1;

        if state.consecutive_failures >= self.config.max_consecutive_failures {
            warn!(
                failures = state.consecutive_failures,
                max = self.config.max_consecutive_failures,
                "Max consecutive failures reached — pausing scheduler"
            );
            state.paused = true;
        }
    }

    /// Pause the scheduler.
    pub async fn pause(&self) {
        let mut state = self.state.lock().await;
        state.paused = true;
        info!("Update scheduler paused");
    }

    /// Resume the scheduler.
    pub async fn resume(&self) {
        let mut state = self.state.lock().await;
        state.paused = false;
        state.consecutive_failures = 0;
        info!("Update scheduler resumed");
    }

    /// Check if auto-apply is allowed (not too many failures, user permits it).
    pub async fn can_auto_apply(&self) -> bool {
        if !self.config.auto_apply {
            return false;
        }

        let state = self.state.lock().await;
        !state.paused
            && state.consecutive_failures < self.config.max_consecutive_failures
    }

    /// Get a summary of the scheduler state for display.
    pub async fn status_summary(&self) -> String {
        let state = self.state.lock().await;
        format!(
            "Policy: {}, Paused: {}, Checks: {}, Updates: {}, Failures: {}/{}",
            self.config.policy,
            state.paused,
            state.total_checks,
            state.total_updates,
            state.consecutive_failures,
            self.config.max_consecutive_failures,
        )
    }

    /// Reset the scheduler state completely.
    pub async fn reset(&self) {
        let mut state = self.state.lock().await;
        *state = SchedulerState::default();
        info!("Update scheduler state reset");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_policy_display() {
        assert_eq!(UpdatePolicy::Disabled.to_string(), "disabled");
        assert_eq!(UpdatePolicy::OnStartup.to_string(), "on_startup");
        assert_eq!(UpdatePolicy::Periodic.to_string(), "periodic");
        assert_eq!(UpdatePolicy::Manual.to_string(), "manual");
    }

    #[test]
    fn test_scheduler_config_default() {
        let config = SchedulerConfig::default();
        assert_eq!(config.policy, UpdatePolicy::Manual);
        assert!(!config.auto_apply);
        assert!(config.require_confirmation);
        assert_eq!(config.max_consecutive_failures, 3);
    }

    #[test]
    fn test_scheduler_config_serialization() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::Periodic,
            check_interval: Duration::from_secs(7200),
            min_cooldown: Duration::from_secs(600),
            auto_apply: true,
            require_confirmation: false,
            max_consecutive_failures: 5,
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: SchedulerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.policy, UpdatePolicy::Periodic);
        assert!(deserialized.auto_apply);
        assert_eq!(deserialized.max_consecutive_failures, 5);
    }

    #[test]
    fn test_scheduler_state_default() {
        let state = SchedulerState::default();
        assert!(state.last_check.is_none());
        assert!(state.last_update.is_none());
        assert_eq!(state.consecutive_failures, 0);
        assert_eq!(state.total_checks, 0);
        assert!(!state.paused);
    }

    #[test]
    fn test_update_check_status_serialization() {
        let status = UpdateCheckStatus {
            update_available: true,
            description: "New features available".into(),
            checked_at: Utc::now(),
            source: "git:main".into(),
            new_version: Some("v2.0.0".into()),
        };

        let json = serde_json::to_string(&status).unwrap();
        let deserialized: UpdateCheckStatus = serde_json::from_str(&json).unwrap();
        assert!(deserialized.update_available);
        assert_eq!(deserialized.new_version.as_deref(), Some("v2.0.0"));
    }

    #[tokio::test]
    async fn test_should_check_disabled() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::Disabled,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        assert!(!scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_should_check_manual() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::Manual,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        assert!(!scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_should_check_on_startup_first_time() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::OnStartup,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        assert!(scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_should_check_on_startup_already_checked() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::OnStartup,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        scheduler.record_check().await;
        assert!(!scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_should_check_periodic_never_checked() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::Periodic,
            check_interval: Duration::from_secs(3600),
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        assert!(scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_should_check_periodic_recently_checked() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::Periodic,
            check_interval: Duration::from_secs(3600),
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        scheduler.record_check().await;
        // Just checked — should not check again
        assert!(!scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_record_check_increments_counter() {
        let scheduler = UpdateScheduler::with_defaults();
        assert_eq!(scheduler.state().await.total_checks, 0);

        scheduler.record_check().await;
        assert_eq!(scheduler.state().await.total_checks, 1);

        scheduler.record_check().await;
        assert_eq!(scheduler.state().await.total_checks, 2);
    }

    #[tokio::test]
    async fn test_record_success() {
        let scheduler = UpdateScheduler::with_defaults();
        scheduler.record_success().await;

        let state = scheduler.state().await;
        assert_eq!(state.total_updates, 1);
        assert!(state.last_update.is_some());
        assert_eq!(state.consecutive_failures, 0);
    }

    #[tokio::test]
    async fn test_record_failure_pauses_after_max() {
        let config = SchedulerConfig {
            max_consecutive_failures: 2,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);

        scheduler.record_failure().await;
        assert!(!scheduler.state().await.paused);

        scheduler.record_failure().await;
        assert!(scheduler.state().await.paused);
    }

    #[tokio::test]
    async fn test_pause_and_resume() {
        let scheduler = UpdateScheduler::with_defaults();

        scheduler.pause().await;
        assert!(scheduler.state().await.paused);

        scheduler.resume().await;
        assert!(!scheduler.state().await.paused);
        assert_eq!(scheduler.state().await.consecutive_failures, 0);
    }

    #[tokio::test]
    async fn test_paused_prevents_check() {
        let config = SchedulerConfig {
            policy: UpdatePolicy::Periodic,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);

        assert!(scheduler.should_check_now().await);

        scheduler.pause().await;
        assert!(!scheduler.should_check_now().await);
    }

    #[tokio::test]
    async fn test_can_auto_apply() {
        let config = SchedulerConfig {
            auto_apply: true,
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);
        assert!(scheduler.can_auto_apply().await);

        scheduler.pause().await;
        assert!(!scheduler.can_auto_apply().await);
    }

    #[tokio::test]
    async fn test_can_auto_apply_disabled() {
        let scheduler = UpdateScheduler::with_defaults();
        assert!(!scheduler.can_auto_apply().await); // auto_apply is false by default
    }

    #[tokio::test]
    async fn test_status_summary() {
        let scheduler = UpdateScheduler::with_defaults();
        let summary = scheduler.status_summary().await;
        assert!(summary.contains("manual"));
        assert!(summary.contains("Paused: false"));
    }

    #[tokio::test]
    async fn test_reset() {
        let scheduler = UpdateScheduler::with_defaults();
        scheduler.record_check().await;
        scheduler.record_success().await;
        scheduler.record_failure().await;

        scheduler.reset().await;
        let state = scheduler.state().await;
        assert_eq!(state.total_checks, 0);
        assert_eq!(state.total_updates, 0);
        assert_eq!(state.consecutive_failures, 0);
    }

    #[tokio::test]
    async fn test_cooldown() {
        let config = SchedulerConfig {
            min_cooldown: Duration::from_secs(3600), // 1 hour
            ..Default::default()
        };
        let scheduler = UpdateScheduler::new(config);

        assert!(!scheduler.is_in_cooldown().await); // No check yet

        scheduler.record_check().await;
        assert!(scheduler.is_in_cooldown().await); // Just checked
    }
}
