//! Autonomous Daemon — Scheduled task execution for autonomous agent operations.
//!
//! This module provides the infrastructure for the agent to perform scheduled
//! tasks autonomously, including:
//!
//! - **TaskScheduler**: Priority queue with cron-like scheduling
//! - **BranchManager**: Git branch operations (create, switch, PR, merge)
//! - **ReleaseManager**: Semantic versioning, tag creation, changelog generation
//! - **DocsGenerator**: Auto-generate README sections, Docusaurus pages, Mermaid diagrams
//! - **CiWatcher**: Monitor GitHub Actions status, poll for green CI
//! - **Failsafe**: Circuit breaker pattern + cascade failsafe
//! - **AuditLog**: SQLite-backed persistent audit trail
//!
//! # Architecture
//!
//! ```text
//! AutonomousDaemon
//!   ├── TaskScheduler (priority queue + cron scheduling)
//!   ├── BranchManager (git branch ops)
//!   ├── ReleaseManager (semver + changelog)
//!   ├── DocsGenerator (markdown generation)
//!   ├── CiWatcher (GitHub Actions polling)
//!   ├── Failsafe (circuit breaker + cascade)
//!   └── AuditLog (SQLite audit trail)
//! ```

pub mod audit_log;
pub mod branch_manager;
pub mod ci_watcher;
pub mod docs_generator;
pub mod failsafe;
pub mod release_manager;
pub mod scheduler;

pub use audit_log::{ActionOutcome, AuditEntry, AuditLog};
pub use branch_manager::{BranchManager, GitOpResult, PullRequestSpec};
pub use ci_watcher::{CiRun, CiStatus, CiWatcher, CiWatcherConfig};
pub use docs_generator::{DocSection, DocsGenerator, FeatureEntry, FeatureStatus, MermaidDiagram};
pub use failsafe::{CircuitBreaker, CircuitState, Failsafe, FailsafeConfig};
pub use release_manager::{BumpType, ChangelogEntry, ReleaseManager, ReleaseSpec, SemVer};
pub use scheduler::{ActionType, Schedule, ScheduledTask, TaskScheduler, TaskStatus};

use anyhow::Result;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use tracing::{info, warn, error};

/// The main autonomous daemon that coordinates all autonomous operations.
///
/// Provides a unified interface for scheduling and executing tasks
/// with circuit-breaker protection and audit logging.
pub struct AutonomousDaemon {
    /// The task scheduler (priority queue).
    scheduler: Mutex<TaskScheduler>,
    /// Git branch operations.
    #[allow(dead_code)]
    branch_manager: Mutex<BranchManager>,
    /// Release management (semver + changelog).
    #[allow(dead_code)]
    release_manager: Mutex<ReleaseManager>,
    /// Documentation generator.
    #[allow(dead_code)]
    docs_generator: Mutex<DocsGenerator>,
    /// CI status watcher.
    #[allow(dead_code)]
    ci_watcher: Mutex<CiWatcher>,
    /// Circuit breaker failsafe.
    failsafe: Mutex<Failsafe>,
    /// Audit log for all operations.
    audit_log: AuditLog,
    /// Whether the daemon is currently running.
    running: AtomicBool,
    /// When the daemon was last started (for uptime tracking).
    started_at: Mutex<Option<std::time::Instant>>,
}

impl AutonomousDaemon {
    /// Create a new autonomous daemon.
    pub async fn new(
        repo_path: PathBuf,
        docs_output_dir: PathBuf,
        audit_db_path: impl AsRef<std::path::Path>,
        project_name: &str,
        current_version: &str,
    ) -> Result<Self> {
        let audit_log = AuditLog::new(audit_db_path).await?;
        let version = SemVer::parse(current_version)?;

        let mut failsafe = Failsafe::with_defaults();
        failsafe.register_default("branch_manager");
        failsafe.register_default("release_manager");
        failsafe.register_default("ci_watcher");
        failsafe.register_default("docs_generator");

        let ci_config = CiWatcherConfig::default();

        Ok(Self {
            scheduler: Mutex::new(TaskScheduler::with_defaults()),
            branch_manager: Mutex::new(BranchManager::new(repo_path)),
            release_manager: Mutex::new(ReleaseManager::new(version)),
            docs_generator: Mutex::new(DocsGenerator::new(project_name, docs_output_dir)),
            ci_watcher: Mutex::new(CiWatcher::new(ci_config)),
            failsafe: Mutex::new(failsafe),
            audit_log,
            running: AtomicBool::new(false),
            started_at: Mutex::new(None),
        })
    }

    /// Create an in-memory daemon (for testing).
    pub async fn in_memory(repo_path: PathBuf) -> Result<Self> {
        let audit_log = AuditLog::in_memory().await?;

        let mut failsafe = Failsafe::with_defaults();
        failsafe.register_default("branch_manager");
        failsafe.register_default("release_manager");
        failsafe.register_default("ci_watcher");
        failsafe.register_default("docs_generator");

        let ci_config = CiWatcherConfig::default();

        Ok(Self {
            scheduler: Mutex::new(TaskScheduler::with_defaults()),
            branch_manager: Mutex::new(BranchManager::new(repo_path.clone())),
            release_manager: Mutex::new(ReleaseManager::new(SemVer::new(0, 1, 0))),
            docs_generator: Mutex::new(DocsGenerator::new("Test", repo_path)),
            ci_watcher: Mutex::new(CiWatcher::new(ci_config)),
            failsafe: Mutex::new(failsafe),
            audit_log,
            running: AtomicBool::new(false),
            started_at: Mutex::new(None),
        })
    }

    /// Start the daemon.
    pub fn start(&self) {
        self.running.store(true, Ordering::SeqCst);
        // Track start time for uptime calculation (blocking lock OK — fast)
        if let Ok(mut guard) = self.started_at.try_lock() {
            *guard = Some(std::time::Instant::now());
        }
        info!("Autonomous daemon started");
    }

    /// Stop the daemon.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut guard) = self.started_at.try_lock() {
            *guard = None;
        }
        info!("Autonomous daemon stopped");
    }

    /// Get uptime in seconds (0 if not running).
    pub fn uptime_seconds(&self) -> u64 {
        if !self.is_running() {
            return 0;
        }
        self.started_at
            .try_lock()
            .ok()
            .and_then(|guard| guard.map(|t| t.elapsed().as_secs()))
            .unwrap_or(0)
    }

    /// Get the description of the next due task (if any).
    pub async fn current_task_description(&self) -> Option<String> {
        let scheduler = self.scheduler.lock().await;
        // Peek at the top task without removing it
        scheduler.peek_next().map(|t| t.description.clone())
    }

    /// Check if the daemon is running.
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Schedule a task.
    pub async fn schedule_task(&self, task: ScheduledTask) -> String {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.add_task(task)
    }

    /// Schedule a one-time task.
    pub async fn schedule_once(
        &self,
        description: &str,
        priority: u8,
        at: chrono::DateTime<chrono::Utc>,
        action: ActionType,
    ) -> String {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.schedule_once(description, priority, at, action)
    }

    /// Get the number of pending tasks.
    pub async fn pending_task_count(&self) -> usize {
        let scheduler = self.scheduler.lock().await;
        scheduler.pending_count()
    }

    /// Process the next due task.
    pub async fn process_next_task(&self) -> Result<Option<String>> {
        let mut scheduler = self.scheduler.lock().await;

        if let Some(task) = scheduler.next_due() {
            let description = task.description.clone();
            let action_str = task.action.to_string();

            // Check failsafe
            let component = match &task.action {
                ActionType::CreateBranch { .. }
                | ActionType::CreatePR { .. } => "branch_manager",
                ActionType::CreateRelease { .. } => "release_manager",
                ActionType::RunCiCheck { .. } => "ci_watcher",
                ActionType::GenerateDocs { .. } => "docs_generator",
                _ => "branch_manager", // default
            };

            let mut failsafe = self.failsafe.lock().await;
            match failsafe.allow_request(component) {
                Ok(true) => {
                    // Execute and log
                    info!(task = %description, action = %action_str, "Processing autonomous task");
                    self.audit_log
                        .record_success("task_executed", &description, "daemon")
                        .await?;
                    failsafe.record_success(component)?;
                    scheduler.complete_task(task);
                    Ok(Some(description))
                }
                Ok(false) => {
                    warn!(
                        task = %description,
                        component = component,
                        "Task blocked by circuit breaker"
                    );
                    self.audit_log
                        .record_failure(
                            "task_blocked",
                            &description,
                            "daemon",
                            "Circuit breaker open",
                        )
                        .await?;
                    scheduler.fail_task(task, "Circuit breaker open".into());
                    Ok(None)
                }
                Err(e) => {
                    error!(error = %e, "Failsafe error");
                    scheduler.fail_task(task, e.to_string());
                    Err(e)
                }
            }
        } else {
            Ok(None)
        }
    }

    /// Get a reference to the audit log.
    pub fn audit_log(&self) -> &AuditLog {
        &self.audit_log
    }

    /// Check if the failsafe global shutdown is active.
    pub async fn is_shutdown(&self) -> bool {
        let failsafe = self.failsafe.lock().await;
        failsafe.is_shutdown()
    }

    /// Get failsafe status.
    pub async fn failsafe_status(&self) -> Vec<failsafe::BreakerStatus> {
        let failsafe = self.failsafe.lock().await;
        failsafe.status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_daemon_creation() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();
        assert!(!daemon.is_running());
        assert_eq!(daemon.pending_task_count().await, 0);
    }

    #[tokio::test]
    async fn test_daemon_start_stop() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();

        daemon.start();
        assert!(daemon.is_running());

        daemon.stop();
        assert!(!daemon.is_running());
    }

    #[tokio::test]
    async fn test_schedule_task() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();

        let id = daemon
            .schedule_once(
                "Test task",
                5,
                chrono::Utc::now() + chrono::Duration::hours(1),
                ActionType::RunCommand {
                    command: "echo test".into(),
                },
            )
            .await;

        assert!(!id.is_empty());
        assert_eq!(daemon.pending_task_count().await, 1);
    }

    #[tokio::test]
    async fn test_process_due_task() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();

        // Schedule a task in the past (immediately due)
        daemon
            .schedule_once(
                "Due task",
                5,
                chrono::Utc::now() - chrono::Duration::seconds(10),
                ActionType::RunCommand {
                    command: "echo done".into(),
                },
            )
            .await;

        let result = daemon.process_next_task().await.unwrap();
        assert_eq!(result, Some("Due task".into()));

        // Audit log should have an entry
        assert_eq!(daemon.audit_log().count().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_process_no_due_tasks() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();

        // Schedule a task in the future
        daemon
            .schedule_once(
                "Future task",
                5,
                chrono::Utc::now() + chrono::Duration::hours(1),
                ActionType::RunCommand {
                    command: "echo later".into(),
                },
            )
            .await;

        let result = daemon.process_next_task().await.unwrap();
        assert_eq!(result, None);
    }

    #[tokio::test]
    async fn test_failsafe_status() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();

        let status = daemon.failsafe_status().await;
        assert_eq!(status.len(), 4); // 4 registered breakers
        assert!(status.iter().all(|s| s.state == CircuitState::Closed));
    }

    #[tokio::test]
    async fn test_not_shutdown_initially() {
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test"))
            .await
            .unwrap();
        assert!(!daemon.is_shutdown().await);
    }
}
