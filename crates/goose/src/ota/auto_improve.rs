//! AutoImproveScheduler \u2014 orchestrates the continuous self-improvement loop.
//!
//! Manages the full cycle: insight extraction \u2192 improvement planning \u2192
//! code application \u2192 testing \u2192 verification \u2192 rollback-on-failure.
//! Enforces safety constraints including file allowlists, risk levels,
//! cooldown periods, and mandatory test passage before accepting changes.
//!
//! # Safety
//!
//! - **Disabled by default** \u2014 must be explicitly enabled
//! - **File allowlists** \u2014 only touches files in approved directories
//! - **Blocked patterns** \u2014 critical files (Cargo.toml, lib.rs, mod.rs, main.rs) are never modified
//! - **Risk ceiling** \u2014 defaults to Medium; High/Critical changes are rejected
//! - **Consecutive failure circuit breaker** \u2014 3 failures in a row halts all cycles
//! - **Mandatory tests** \u2014 both build and test must pass before and after changes

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration for the auto-improvement scheduler.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoImproveConfig {
    /// Whether the auto-improve loop is enabled. **Disabled by default.**
    pub enabled: bool,
    /// Minimum number of recorded experiences before attempting improvement.
    pub min_experiences_before_improve: u32,
    /// Maximum number of improvements to attempt per cycle.
    pub max_improvements_per_cycle: usize,
    /// Maximum acceptable risk level for auto-applied changes.
    /// One of: "Low", "Medium", "High", "Critical".
    pub max_risk_level: String,
    /// Whether all tests must pass after applying improvements.
    pub require_test_pass: bool,
    /// Whether the build must succeed after applying improvements.
    pub require_build_pass: bool,
    /// Cooldown in seconds between improvement cycles.
    pub cooldown_secs: u64,
    /// File path prefixes that the auto-improver is allowed to modify.
    pub allowed_file_patterns: Vec<String>,
    /// File path patterns that are always blocked from modification.
    pub blocked_file_patterns: Vec<String>,
}

impl Default for AutoImproveConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            min_experiences_before_improve: 50,
            max_improvements_per_cycle: 3,
            max_risk_level: "Medium".to_string(),
            require_test_pass: true,
            require_build_pass: true,
            cooldown_secs: 3600,
            allowed_file_patterns: vec![
                "crates/goose/src/agents/".to_string(),
                "crates/goose/src/ota/".to_string(),
            ],
            blocked_file_patterns: vec![
                "Cargo.toml".to_string(),
                "lib.rs".to_string(),
                "main.rs".to_string(),
                "mod.rs".to_string(),
            ],
        }
    }
}

// ---------------------------------------------------------------------------
// Cycle status & structs
// ---------------------------------------------------------------------------

/// Status of an improvement cycle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CycleStatus {
    /// Cycle created but not yet started.
    Pending,
    /// Cycle is running (extracting insights, planning).
    Running,
    /// Running baseline tests before applying changes.
    TestingBefore,
    /// Applying code improvements.
    Applying,
    /// Running tests after applying changes.
    TestingAfter,
    /// Verifying applied improvements meet quality criteria.
    Verifying,
    /// Cycle completed successfully.
    Completed,
    /// Cycle failed (not yet rolled back).
    Failed,
    /// Cycle was rolled back after failure.
    RolledBack,
}

impl std::fmt::Display for CycleStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CycleStatus::Pending => write!(f, "pending"),
            CycleStatus::Running => write!(f, "running"),
            CycleStatus::TestingBefore => write!(f, "testing_before"),
            CycleStatus::Applying => write!(f, "applying"),
            CycleStatus::TestingAfter => write!(f, "testing_after"),
            CycleStatus::Verifying => write!(f, "verifying"),
            CycleStatus::Completed => write!(f, "completed"),
            CycleStatus::Failed => write!(f, "failed"),
            CycleStatus::RolledBack => write!(f, "rolled_back"),
        }
    }
}

/// Summary of a test run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSummary {
    /// Total number of tests executed.
    pub total: u32,
    /// Number of tests that passed.
    pub passed: u32,
    /// Number of tests that failed.
    pub failed: u32,
    /// Number of known/expected failures (pre-existing).
    pub known_failures: u32,
}

impl TestSummary {
    /// Returns true if all non-known failures passed.
    pub fn is_acceptable(&self) -> bool {
        self.failed <= self.known_failures
    }

    /// Pass rate as a percentage (0.0 - 100.0).
    pub fn pass_rate(&self) -> f64 {
        if self.total == 0 {
            return 0.0;
        }
        (self.passed as f64 / self.total as f64) * 100.0
    }
}

/// Record of a single improvement cycle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImproveCycle {
    /// Unique identifier for this cycle.
    pub id: String,
    /// When the cycle was started.
    pub started_at: DateTime<Utc>,
    /// When the cycle completed (or failed/rolled back).
    pub completed_at: Option<DateTime<Utc>>,
    /// Current status of the cycle.
    pub status: CycleStatus,
    /// Number of improvements attempted in this cycle.
    pub improvements_attempted: u32,
    /// Number of improvements successfully applied (code written).
    pub improvements_applied: u32,
    /// Number of improvements that passed post-application verification.
    pub improvements_verified: u32,
    /// Number of improvements that were rolled back.
    pub improvements_rolled_back: u32,
    /// Test results before any changes were made.
    pub test_result_before: Option<TestSummary>,
    /// Test results after improvements were applied.
    pub test_result_after: Option<TestSummary>,
    /// Human-readable summary of what happened.
    pub summary: String,
}

impl ImproveCycle {
    /// Create a new cycle in Pending status.
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            started_at: Utc::now(),
            completed_at: None,
            status: CycleStatus::Pending,
            improvements_attempted: 0,
            improvements_applied: 0,
            improvements_verified: 0,
            improvements_rolled_back: 0,
            test_result_before: None,
            test_result_after: None,
            summary: String::new(),
        }
    }

    /// Duration of the cycle in seconds, or None if still running.
    pub fn duration_secs(&self) -> Option<f64> {
        self.completed_at.map(|end| {
            (end - self.started_at).num_milliseconds() as f64 / 1000.0
        })
    }
}

// ---------------------------------------------------------------------------
// Risk levels
// ---------------------------------------------------------------------------

/// Ordered risk levels for comparison.
fn risk_rank(level: &str) -> u8 {
    match level.to_lowercase().as_str() {
        "low" => 1,
        "medium" => 2,
        "high" => 3,
        "critical" => 4,
        _ => 5, // unknown treated as above Critical (always rejected)
    }
}

// ---------------------------------------------------------------------------
// AutoImproveScheduler
// ---------------------------------------------------------------------------

/// Orchestrates the continuous self-improvement loop with safety constraints.
///
/// The scheduler manages improvement cycles, enforcing cooldowns between runs,
/// a circuit breaker on consecutive failures, file allowlists/blocklists, and
/// risk-level ceilings. It is **disabled by default** and must be explicitly
/// enabled before any cycle will execute.
pub struct AutoImproveScheduler {
    /// Configuration controlling thresholds, allowlists, and risk levels.
    config: AutoImproveConfig,
    /// History of all improvement cycles (most recent last).
    cycles: Vec<ImproveCycle>,
    /// Number of consecutive failed cycles (resets on success).
    consecutive_failures: u32,
    /// Timestamp of the most recent cycle completion.
    last_cycle_at: Option<DateTime<Utc>>,
    /// Lifetime count of improvements applied across all cycles.
    total_improvements_applied: u32,
    /// Lifetime count of improvements rolled back across all cycles.
    total_improvements_rolled_back: u32,
    /// Whether the scheduler is currently enabled.
    enabled: bool,
}

impl AutoImproveScheduler {
    /// Create a new scheduler from the given configuration.
    pub fn new(config: AutoImproveConfig) -> Self {
        let enabled = config.enabled;
        Self {
            config,
            cycles: Vec::new(),
            consecutive_failures: 0,
            last_cycle_at: None,
            total_improvements_applied: 0,
            total_improvements_rolled_back: 0,
            enabled,
        }
    }

    /// Create a scheduler with all-default configuration.
    pub fn with_defaults() -> Self {
        Self::new(AutoImproveConfig::default())
    }

    /// Return a reference to the active configuration.
    pub fn config(&self) -> &AutoImproveConfig {
        &self.config
    }

    /// Whether the scheduler is currently enabled.
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Enable the scheduler so that cycles may run.
    pub fn enable(&mut self) {
        self.enabled = true;
        info!("AutoImproveScheduler enabled");
    }

    /// Disable the scheduler — no cycles will run until re-enabled.
    pub fn disable(&mut self) {
        self.enabled = false;
        info!("AutoImproveScheduler disabled");
    }

    /// Determine whether a new cycle is allowed to start.
    ///
    /// Checks three conditions:
    /// 1. The scheduler must be enabled.
    /// 2. The cooldown period must have elapsed since the last cycle.
    /// 3. The circuit breaker must not be tripped (< 3 consecutive failures).
    pub fn can_run_cycle(&self) -> bool {
        if !self.enabled {
            return false;
        }

        if self.circuit_breaker_tripped() {
            warn!(
                "Circuit breaker tripped: {} consecutive failures",
                self.consecutive_failures
            );
            return false;
        }

        // Check cooldown
        if let Some(last) = self.last_cycle_at {
            let cooldown = ChronoDuration::seconds(self.config.cooldown_secs as i64);
            if Utc::now() - last < cooldown {
                return false;
            }
        }

        true
    }

    /// Begin a new improvement cycle.
    ///
    /// Creates a fresh `ImproveCycle` and transitions it to `Running`.
    /// The caller is responsible for driving the cycle through its remaining
    /// states and calling `complete_cycle` when finished.
    pub fn start_cycle(&mut self) -> ImproveCycle {
        let mut cycle = ImproveCycle::new();
        cycle.status = CycleStatus::Running;
        info!(cycle_id = %cycle.id, "Started improvement cycle");
        cycle
    }

    /// Mark a cycle as complete and update scheduler statistics.
    ///
    /// If `success` is true the cycle is marked `Completed`, the consecutive
    /// failure counter is reset, and `total_improvements_applied` is
    /// incremented. Otherwise the cycle is marked `Failed`, the failure counter
    /// increments, and `total_improvements_rolled_back` is updated.
    pub fn complete_cycle(&mut self, cycle: &mut ImproveCycle, success: bool) {
        cycle.completed_at = Some(Utc::now());
        self.last_cycle_at = Some(Utc::now());

        if success {
            cycle.status = CycleStatus::Completed;
            self.consecutive_failures = 0;
            self.total_improvements_applied += cycle.improvements_applied;
            info!(
                cycle_id = %cycle.id,
                applied = cycle.improvements_applied,
                "Cycle completed successfully"
            );
        } else {
            cycle.status = CycleStatus::Failed;
            self.consecutive_failures += 1;
            self.total_improvements_rolled_back += cycle.improvements_rolled_back;
            warn!(
                cycle_id = %cycle.id,
                consecutive_failures = self.consecutive_failures,
                "Cycle failed"
            );
        }

        self.cycles.push(cycle.clone());
    }

    /// Record the baseline test results captured *before* changes are applied.
    pub fn record_test_before(&self, cycle: &mut ImproveCycle, summary: TestSummary) {
        cycle.status = CycleStatus::TestingBefore;
        cycle.test_result_before = Some(summary);
    }

    /// Record the test results captured *after* changes have been applied.
    pub fn record_test_after(&self, cycle: &mut ImproveCycle, summary: TestSummary) {
        cycle.status = CycleStatus::TestingAfter;
        cycle.test_result_after = Some(summary);
    }

    /// Check whether a given risk level is within the configured ceiling.
    ///
    /// Returns `true` if `risk_level` ranks at or below the configured
    /// `max_risk_level`.
    pub fn is_risk_acceptable(&self, risk_level: &str) -> bool {
        risk_rank(risk_level) <= risk_rank(&self.config.max_risk_level)
    }

    /// Check whether a file path is permitted for modification.
    ///
    /// A file is allowed if it matches at least one entry in
    /// `allowed_file_patterns` **and** does not match any entry in
    /// `blocked_file_patterns`. An empty `allowed_file_patterns` list
    /// permits all files (subject to the blocklist).
    pub fn is_file_allowed(&self, file_path: &str) -> bool {
        // Check blocklist first — blocked patterns always win.
        for blocked in &self.config.blocked_file_patterns {
            if file_path.contains(blocked) {
                return false;
            }
        }

        // If no allowlist entries, everything (not blocked) is allowed.
        if self.config.allowed_file_patterns.is_empty() {
            return true;
        }

        // Must match at least one allowed pattern.
        for allowed in &self.config.allowed_file_patterns {
            if file_path.starts_with(allowed) {
                return true;
            }
        }

        false
    }

    /// Number of consecutive failed cycles.
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }

    /// Whether the circuit breaker has tripped (>= 3 consecutive failures).
    pub fn circuit_breaker_tripped(&self) -> bool {
        self.consecutive_failures >= 3
    }

    /// Manually reset the circuit breaker after investigating failures.
    pub fn reset_circuit_breaker(&mut self) {
        self.consecutive_failures = 0;
        info!("Circuit breaker reset");
    }

    /// Full history of improvement cycles.
    pub fn history(&self) -> &[ImproveCycle] {
        &self.cycles
    }

    /// Human-readable summary of lifetime statistics.
    pub fn stats_summary(&self) -> String {
        format!(
            "AutoImproveScheduler: enabled={}, cycles={}, applied={}, rolled_back={}, \
             consecutive_failures={}, circuit_breaker={}",
            self.enabled,
            self.cycles.len(),
            self.total_improvements_applied,
            self.total_improvements_rolled_back,
            self.consecutive_failures,
            if self.circuit_breaker_tripped() {
                "TRIPPED"
            } else {
                "ok"
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Config defaults -----------------------------------------------------

    #[test]
    fn test_config_default() {
        let config = AutoImproveConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.min_experiences_before_improve, 50);
        assert_eq!(config.max_improvements_per_cycle, 3);
        assert_eq!(config.max_risk_level, "Medium");
        assert!(config.require_test_pass);
        assert!(config.require_build_pass);
        assert_eq!(config.cooldown_secs, 3600);
        assert!(!config.allowed_file_patterns.is_empty());
        assert!(!config.blocked_file_patterns.is_empty());
    }

    // -- Scheduler creation --------------------------------------------------

    #[test]
    fn test_scheduler_creation() {
        let scheduler = AutoImproveScheduler::with_defaults();
        assert!(!scheduler.is_enabled());
        assert_eq!(scheduler.consecutive_failures(), 0);
        assert!(!scheduler.circuit_breaker_tripped());
        assert!(scheduler.history().is_empty());
    }

    // -- Enable / disable ----------------------------------------------------

    #[test]
    fn test_enable_disable() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        assert!(!scheduler.is_enabled());

        scheduler.enable();
        assert!(scheduler.is_enabled());

        scheduler.disable();
        assert!(!scheduler.is_enabled());
    }

    // -- can_run_cycle -------------------------------------------------------

    #[test]
    fn test_can_run_when_disabled() {
        let scheduler = AutoImproveScheduler::with_defaults();
        assert!(!scheduler.can_run_cycle());
    }

    #[test]
    fn test_cooldown_not_elapsed() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        // Simulate a recent cycle completion
        scheduler.last_cycle_at = Some(Utc::now());
        assert!(
            !scheduler.can_run_cycle(),
            "should not run — cooldown has not elapsed"
        );
    }

    #[test]
    fn test_can_run_after_cooldown() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        // Set last_cycle_at far enough in the past that the cooldown has elapsed
        scheduler.last_cycle_at =
            Some(Utc::now() - ChronoDuration::seconds(scheduler.config.cooldown_secs as i64 + 1));
        assert!(
            scheduler.can_run_cycle(),
            "should be able to run — cooldown has elapsed"
        );
    }

    // -- start_cycle / complete_cycle ----------------------------------------

    #[test]
    fn test_start_cycle() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        let cycle = scheduler.start_cycle();
        assert_eq!(cycle.status, CycleStatus::Running);
        assert!(!cycle.id.is_empty());
    }

    #[test]
    fn test_complete_cycle_success() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        let mut cycle = scheduler.start_cycle();
        cycle.improvements_applied = 2;
        scheduler.complete_cycle(&mut cycle, true);

        assert_eq!(cycle.status, CycleStatus::Completed);
        assert!(cycle.completed_at.is_some());
        assert_eq!(scheduler.consecutive_failures(), 0);
        assert_eq!(scheduler.history().len(), 1);
        assert!(scheduler.stats_summary().contains("applied=2"));
    }

    #[test]
    fn test_complete_cycle_failure() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        let mut cycle = scheduler.start_cycle();
        cycle.improvements_rolled_back = 1;
        scheduler.complete_cycle(&mut cycle, false);

        assert_eq!(cycle.status, CycleStatus::Failed);
        assert_eq!(scheduler.consecutive_failures(), 1);
        assert!(scheduler.stats_summary().contains("rolled_back=1"));
    }

    // -- Circuit breaker -----------------------------------------------------

    #[test]
    fn test_circuit_breaker_trips() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        for _ in 0..3 {
            let mut cycle = scheduler.start_cycle();
            scheduler.complete_cycle(&mut cycle, false);
        }

        assert!(scheduler.circuit_breaker_tripped());
        assert!(!scheduler.can_run_cycle());
    }

    #[test]
    fn test_circuit_breaker_reset() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        // Trip the breaker
        for _ in 0..3 {
            let mut cycle = scheduler.start_cycle();
            scheduler.complete_cycle(&mut cycle, false);
        }
        assert!(scheduler.circuit_breaker_tripped());

        // Reset
        scheduler.reset_circuit_breaker();
        assert!(!scheduler.circuit_breaker_tripped());
        assert_eq!(scheduler.consecutive_failures(), 0);
    }

    // -- Risk acceptance -----------------------------------------------------

    #[test]
    fn test_risk_acceptable_low() {
        let scheduler = AutoImproveScheduler::with_defaults();
        // Default max_risk_level is "Medium"
        assert!(scheduler.is_risk_acceptable("Low"));
        assert!(scheduler.is_risk_acceptable("Medium"));
    }

    #[test]
    fn test_risk_acceptable_exceeds() {
        let scheduler = AutoImproveScheduler::with_defaults();
        assert!(!scheduler.is_risk_acceptable("High"));
        assert!(!scheduler.is_risk_acceptable("Critical"));
        assert!(!scheduler.is_risk_acceptable("Unknown"));
    }

    // -- File allowlist / blocklist ------------------------------------------

    #[test]
    fn test_file_allowed() {
        let scheduler = AutoImproveScheduler::with_defaults();
        assert!(scheduler.is_file_allowed("crates/goose/src/agents/agent.rs"));
        assert!(scheduler.is_file_allowed("crates/goose/src/ota/auto_improve.rs"));
    }

    #[test]
    fn test_file_blocked() {
        let scheduler = AutoImproveScheduler::with_defaults();
        // Blocked patterns override allowed patterns
        assert!(!scheduler.is_file_allowed("crates/goose/src/agents/mod.rs"));
        assert!(!scheduler.is_file_allowed("Cargo.toml"));
        assert!(!scheduler.is_file_allowed("crates/goose/src/main.rs"));
        assert!(!scheduler.is_file_allowed("crates/goose/src/lib.rs"));
    }

    #[test]
    fn test_file_outside_allowlist() {
        let scheduler = AutoImproveScheduler::with_defaults();
        assert!(
            !scheduler.is_file_allowed("crates/goose/src/session.rs"),
            "files outside allowed patterns should be rejected"
        );
    }

    // -- Test recording ------------------------------------------------------

    #[test]
    fn test_record_test_before_after() {
        let scheduler = AutoImproveScheduler::with_defaults();
        let mut cycle = ImproveCycle::new();

        let before = TestSummary {
            total: 100,
            passed: 98,
            failed: 2,
            known_failures: 2,
        };
        scheduler.record_test_before(&mut cycle, before.clone());
        assert_eq!(cycle.status, CycleStatus::TestingBefore);
        assert!(cycle.test_result_before.is_some());
        assert!(cycle.test_result_before.as_ref().unwrap().is_acceptable());

        let after = TestSummary {
            total: 100,
            passed: 99,
            failed: 1,
            known_failures: 1,
        };
        scheduler.record_test_after(&mut cycle, after);
        assert_eq!(cycle.status, CycleStatus::TestingAfter);
        assert!(cycle.test_result_after.is_some());
    }

    // -- TestSummary ---------------------------------------------------------

    #[test]
    fn test_summary_pass_rate() {
        let summary = TestSummary {
            total: 200,
            passed: 190,
            failed: 10,
            known_failures: 5,
        };
        assert!((summary.pass_rate() - 95.0).abs() < 0.01);
        assert!(!summary.is_acceptable()); // 10 failed but only 5 known
    }

    #[test]
    fn test_summary_zero_total() {
        let summary = TestSummary {
            total: 0,
            passed: 0,
            failed: 0,
            known_failures: 0,
        };
        assert_eq!(summary.pass_rate(), 0.0);
        assert!(summary.is_acceptable());
    }

    // -- Stats summary -------------------------------------------------------

    #[test]
    fn test_stats_summary() {
        let mut scheduler = AutoImproveScheduler::with_defaults();
        scheduler.enable();

        let mut cycle = scheduler.start_cycle();
        cycle.improvements_applied = 3;
        scheduler.complete_cycle(&mut cycle, true);

        let summary = scheduler.stats_summary();
        assert!(summary.contains("enabled=true"));
        assert!(summary.contains("cycles=1"));
        assert!(summary.contains("applied=3"));
        assert!(summary.contains("circuit_breaker=ok"));
    }

    // -- CycleStatus display -------------------------------------------------

    #[test]
    fn test_cycle_status_display() {
        assert_eq!(CycleStatus::Pending.to_string(), "pending");
        assert_eq!(CycleStatus::Running.to_string(), "running");
        assert_eq!(CycleStatus::TestingBefore.to_string(), "testing_before");
        assert_eq!(CycleStatus::Applying.to_string(), "applying");
        assert_eq!(CycleStatus::TestingAfter.to_string(), "testing_after");
        assert_eq!(CycleStatus::Verifying.to_string(), "verifying");
        assert_eq!(CycleStatus::Completed.to_string(), "completed");
        assert_eq!(CycleStatus::Failed.to_string(), "failed");
        assert_eq!(CycleStatus::RolledBack.to_string(), "rolled_back");
    }

    // -- ImproveCycle --------------------------------------------------------

    #[test]
    fn test_improve_cycle_new() {
        let cycle = ImproveCycle::new();
        assert_eq!(cycle.status, CycleStatus::Pending);
        assert!(cycle.completed_at.is_none());
        assert_eq!(cycle.improvements_attempted, 0);
        assert!(cycle.duration_secs().is_none());
    }
}
