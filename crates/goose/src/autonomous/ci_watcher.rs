//! CiWatcher — Monitor GitHub Actions CI status with poll-based checking.
//!
//! Provides a polling interface to check the status of CI runs on GitHub Actions,
//! with configurable intervals and timeout. All external calls go through a trait
//! for easy mocking in tests.

use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn};

/// The status of a CI run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CiStatus {
    /// The run has not started yet.
    Pending,
    /// The run is in progress.
    Running,
    /// The run completed successfully.
    Success,
    /// The run failed.
    Failed,
    /// The run was cancelled.
    Cancelled,
    /// Status is unknown or could not be determined.
    Unknown,
}

impl std::fmt::Display for CiStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CiStatus::Pending => write!(f, "pending"),
            CiStatus::Running => write!(f, "running"),
            CiStatus::Success => write!(f, "success"),
            CiStatus::Failed => write!(f, "failed"),
            CiStatus::Cancelled => write!(f, "cancelled"),
            CiStatus::Unknown => write!(f, "unknown"),
        }
    }
}

impl CiStatus {
    /// Whether this status represents a terminal state.
    pub fn is_terminal(&self) -> bool {
        matches!(self, CiStatus::Success | CiStatus::Failed | CiStatus::Cancelled)
    }

    /// Whether this is a successful completion.
    pub fn is_success(&self) -> bool {
        *self == CiStatus::Success
    }
}

/// A single CI workflow run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CiRun {
    /// The run ID.
    pub run_id: String,
    /// Workflow name.
    pub workflow_name: String,
    /// Branch name.
    pub branch: String,
    /// Commit SHA.
    pub commit_sha: String,
    /// Current status.
    pub status: CiStatus,
    /// URL to the run (for reporting).
    pub url: String,
    /// When the run started.
    pub started_at: Option<DateTime<Utc>>,
    /// When the run completed.
    pub completed_at: Option<DateTime<Utc>>,
    /// Duration in seconds (if completed).
    pub duration_secs: Option<u64>,
}

impl CiRun {
    /// Create a new pending CI run.
    pub fn new(
        run_id: impl Into<String>,
        workflow_name: impl Into<String>,
        branch: impl Into<String>,
        commit_sha: impl Into<String>,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            workflow_name: workflow_name.into(),
            branch: branch.into(),
            commit_sha: commit_sha.into(),
            status: CiStatus::Pending,
            url: String::new(),
            started_at: None,
            completed_at: None,
            duration_secs: None,
        }
    }

    pub fn with_status(mut self, status: CiStatus) -> Self {
        self.status = status;
        self
    }

    pub fn with_url(mut self, url: impl Into<String>) -> Self {
        self.url = url.into();
        self
    }
}

/// Configuration for the CI watcher.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CiWatcherConfig {
    /// How often to poll (in seconds).
    pub poll_interval_secs: u64,
    /// Maximum time to wait for CI to complete (in seconds).
    pub timeout_secs: u64,
    /// Repository owner/name (e.g., "Ghenghis/Super-Goose").
    pub repo: String,
}

impl Default for CiWatcherConfig {
    fn default() -> Self {
        Self {
            poll_interval_secs: 30,
            timeout_secs: 1800, // 30 minutes
            repo: String::new(),
        }
    }
}

/// Trait for fetching CI status — allows mocking.
pub trait CiStatusFetcher: Send + Sync {
    /// Fetch the status of a specific run.
    fn fetch_run_status(&self, repo: &str, run_id: &str) -> Result<CiRun>;

    /// Fetch all runs for a branch.
    fn fetch_branch_runs(&self, repo: &str, branch: &str) -> Result<Vec<CiRun>>;
}

/// Real CI status fetcher using GitHub API (via gh CLI).
pub struct GithubCiFetcher;

impl CiStatusFetcher for GithubCiFetcher {
    fn fetch_run_status(&self, _repo: &str, _run_id: &str) -> Result<CiRun> {
        // In production, this would call `gh api repos/{repo}/actions/runs/{run_id}`
        bail!("Real GitHub API not available in this context — use mock for testing")
    }

    fn fetch_branch_runs(&self, _repo: &str, _branch: &str) -> Result<Vec<CiRun>> {
        bail!("Real GitHub API not available in this context — use mock for testing")
    }
}

/// The CI watcher that monitors workflow runs.
pub struct CiWatcher {
    config: CiWatcherConfig,
    fetcher: Box<dyn CiStatusFetcher>,
    /// History of watched runs.
    watched_runs: Vec<CiRun>,
    /// Number of polls performed.
    poll_count: u64,
}

impl CiWatcher {
    /// Create a new CI watcher with a real GitHub fetcher.
    pub fn new(config: CiWatcherConfig) -> Self {
        Self {
            config,
            fetcher: Box::new(GithubCiFetcher),
            watched_runs: Vec::new(),
            poll_count: 0,
        }
    }

    /// Create a CI watcher with a custom fetcher (for testing).
    pub fn with_fetcher(config: CiWatcherConfig, fetcher: Box<dyn CiStatusFetcher>) -> Self {
        Self {
            config,
            fetcher,
            watched_runs: Vec::new(),
            poll_count: 0,
        }
    }

    /// Check the status of a specific run.
    pub fn check_run(&mut self, run_id: &str) -> Result<CiRun> {
        self.poll_count += 1;
        let run = self.fetcher.fetch_run_status(&self.config.repo, run_id)?;
        info!(
            run_id = %run.run_id,
            status = %run.status,
            "Checked CI run status"
        );

        // Update or add to watched runs
        if let Some(existing) = self.watched_runs.iter_mut().find(|r| r.run_id == run.run_id) {
            *existing = run.clone();
        } else {
            self.watched_runs.push(run.clone());
        }

        Ok(run)
    }

    /// Get all runs for a branch.
    pub fn check_branch(&mut self, branch: &str) -> Result<Vec<CiRun>> {
        self.poll_count += 1;
        let runs = self.fetcher.fetch_branch_runs(&self.config.repo, branch)?;
        info!(
            branch = branch,
            count = runs.len(),
            "Checked CI runs for branch"
        );

        for run in &runs {
            if let Some(existing) = self.watched_runs.iter_mut().find(|r| r.run_id == run.run_id) {
                *existing = run.clone();
            } else {
                self.watched_runs.push(run.clone());
            }
        }

        Ok(runs)
    }

    /// Wait for a run to reach a terminal state (simulated — returns immediately in sync context).
    /// In production, this would be async with tokio::time::sleep between polls.
    pub fn poll_until_complete(&mut self, run_id: &str) -> Result<CiRun> {
        let run = self.check_run(run_id)?;
        if run.status.is_terminal() {
            return Ok(run);
        }

        // In a real implementation, we'd loop with sleep.
        // For testability, just return current status.
        warn!(
            run_id = run_id,
            status = %run.status,
            "Run not yet complete — would poll again after {} seconds",
            self.config.poll_interval_secs
        );
        Ok(run)
    }

    /// Check if all runs for a branch are green.
    pub fn is_branch_green(&mut self, branch: &str) -> Result<bool> {
        let runs = self.check_branch(branch)?;
        if runs.is_empty() {
            return Ok(false);
        }
        Ok(runs.iter().all(|r| r.status == CiStatus::Success))
    }

    /// Get the poll interval as a Duration.
    pub fn poll_interval(&self) -> Duration {
        Duration::from_secs(self.config.poll_interval_secs)
    }

    /// Get the timeout as a Duration.
    pub fn timeout(&self) -> Duration {
        Duration::from_secs(self.config.timeout_secs)
    }

    /// Get watched runs.
    pub fn watched_runs(&self) -> &[CiRun] {
        &self.watched_runs
    }

    /// Get poll count.
    pub fn poll_count(&self) -> u64 {
        self.poll_count
    }

    /// Get config reference.
    pub fn config(&self) -> &CiWatcherConfig {
        &self.config
    }

    /// Summarize watched runs.
    pub fn summary(&self) -> CiSummary {
        let total = self.watched_runs.len();
        let success = self.watched_runs.iter().filter(|r| r.status == CiStatus::Success).count();
        let failed = self.watched_runs.iter().filter(|r| r.status == CiStatus::Failed).count();
        let running = self.watched_runs.iter().filter(|r| r.status == CiStatus::Running).count();
        let pending = self.watched_runs.iter().filter(|r| r.status == CiStatus::Pending).count();

        CiSummary {
            total,
            success,
            failed,
            running,
            pending,
            all_green: total > 0 && success == total,
        }
    }
}

/// Summary of CI status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CiSummary {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub running: usize,
    pub pending: usize,
    pub all_green: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mock fetcher that returns predefined responses.
    struct MockCiFetcher {
        runs: Vec<CiRun>,
    }

    impl MockCiFetcher {
        fn new(runs: Vec<CiRun>) -> Self {
            Self { runs }
        }
    }

    impl CiStatusFetcher for MockCiFetcher {
        fn fetch_run_status(&self, _repo: &str, run_id: &str) -> Result<CiRun> {
            self.runs
                .iter()
                .find(|r| r.run_id == run_id)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("Run not found: {}", run_id))
        }

        fn fetch_branch_runs(&self, _repo: &str, branch: &str) -> Result<Vec<CiRun>> {
            Ok(self
                .runs
                .iter()
                .filter(|r| r.branch == branch)
                .cloned()
                .collect())
        }
    }

    fn make_watcher(runs: Vec<CiRun>) -> CiWatcher {
        let config = CiWatcherConfig {
            poll_interval_secs: 5,
            timeout_secs: 60,
            repo: "test/repo".into(),
        };
        CiWatcher::with_fetcher(config, Box::new(MockCiFetcher::new(runs)))
    }

    #[test]
    fn test_ci_status_terminal() {
        assert!(CiStatus::Success.is_terminal());
        assert!(CiStatus::Failed.is_terminal());
        assert!(CiStatus::Cancelled.is_terminal());
        assert!(!CiStatus::Pending.is_terminal());
        assert!(!CiStatus::Running.is_terminal());
        assert!(!CiStatus::Unknown.is_terminal());
    }

    #[test]
    fn test_ci_status_display() {
        assert_eq!(CiStatus::Success.to_string(), "success");
        assert_eq!(CiStatus::Failed.to_string(), "failed");
        assert_eq!(CiStatus::Running.to_string(), "running");
    }

    #[test]
    fn test_check_run() {
        let runs = vec![
            CiRun::new("run-1", "CI", "main", "abc123").with_status(CiStatus::Success),
        ];
        let mut watcher = make_watcher(runs);

        let run = watcher.check_run("run-1").unwrap();
        assert_eq!(run.status, CiStatus::Success);
        assert_eq!(watcher.poll_count(), 1);
        assert_eq!(watcher.watched_runs().len(), 1);
    }

    #[test]
    fn test_check_run_not_found() {
        let mut watcher = make_watcher(vec![]);
        assert!(watcher.check_run("nonexistent").is_err());
    }

    #[test]
    fn test_check_branch() {
        let runs = vec![
            CiRun::new("run-1", "CI", "main", "abc123").with_status(CiStatus::Success),
            CiRun::new("run-2", "Lint", "main", "abc123").with_status(CiStatus::Success),
            CiRun::new("run-3", "CI", "feat/test", "def456").with_status(CiStatus::Failed),
        ];
        let mut watcher = make_watcher(runs);

        let main_runs = watcher.check_branch("main").unwrap();
        assert_eq!(main_runs.len(), 2);
        assert!(main_runs.iter().all(|r| r.branch == "main"));
    }

    #[test]
    fn test_is_branch_green() {
        let runs = vec![
            CiRun::new("run-1", "CI", "main", "abc").with_status(CiStatus::Success),
            CiRun::new("run-2", "Lint", "main", "abc").with_status(CiStatus::Success),
        ];
        let mut watcher = make_watcher(runs);

        assert!(watcher.is_branch_green("main").unwrap());
    }

    #[test]
    fn test_branch_not_green_with_failure() {
        let runs = vec![
            CiRun::new("run-1", "CI", "main", "abc").with_status(CiStatus::Success),
            CiRun::new("run-2", "Lint", "main", "abc").with_status(CiStatus::Failed),
        ];
        let mut watcher = make_watcher(runs);

        assert!(!watcher.is_branch_green("main").unwrap());
    }

    #[test]
    fn test_empty_branch_not_green() {
        let mut watcher = make_watcher(vec![]);
        assert!(!watcher.is_branch_green("empty-branch").unwrap());
    }

    #[test]
    fn test_summary() {
        let runs = vec![
            CiRun::new("r1", "CI", "main", "a").with_status(CiStatus::Success),
            CiRun::new("r2", "Lint", "main", "a").with_status(CiStatus::Failed),
            CiRun::new("r3", "Test", "main", "a").with_status(CiStatus::Running),
        ];
        let mut watcher = make_watcher(runs);
        watcher.check_branch("main").unwrap();

        let summary = watcher.summary();
        assert_eq!(summary.total, 3);
        assert_eq!(summary.success, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.running, 1);
        assert!(!summary.all_green);
    }

    #[test]
    fn test_poll_until_complete_terminal() {
        let runs = vec![
            CiRun::new("run-1", "CI", "main", "abc").with_status(CiStatus::Success),
        ];
        let mut watcher = make_watcher(runs);

        let run = watcher.poll_until_complete("run-1").unwrap();
        assert_eq!(run.status, CiStatus::Success);
    }

    #[test]
    fn test_poll_until_complete_not_terminal() {
        let runs = vec![
            CiRun::new("run-1", "CI", "main", "abc").with_status(CiStatus::Running),
        ];
        let mut watcher = make_watcher(runs);

        let run = watcher.poll_until_complete("run-1").unwrap();
        assert_eq!(run.status, CiStatus::Running); // Not yet complete
    }

    #[test]
    fn test_config_defaults() {
        let config = CiWatcherConfig::default();
        assert_eq!(config.poll_interval_secs, 30);
        assert_eq!(config.timeout_secs, 1800);
    }

    #[test]
    fn test_ci_run_builder() {
        let run = CiRun::new("r1", "CI", "main", "abc123")
            .with_status(CiStatus::Success)
            .with_url("https://github.com/test/runs/1");

        assert_eq!(run.run_id, "r1");
        assert_eq!(run.status, CiStatus::Success);
        assert_eq!(run.url, "https://github.com/test/runs/1");
    }
}
