//! OTA (Over-The-Air) Self-Build Module
//!
//! Enables the agent to update itself through a safe, validated pipeline:
//!
//! 1. **Check** — detect source changes or config updates
//! 2. **Save** — serialize current agent state (config, sessions, learning data)
//! 3. **Build** — trigger `cargo build` with validation
//! 4. **Swap** — atomically replace the binary (backup old, install new)
//! 5. **Verify** — run health checks (binary runs, tests pass, API responds)
//! 6. **Rollback** — restore previous version if any check fails
//!
//! # Architecture
//!
//! ```text
//! OtaManager
//!   ├── UpdateScheduler   — when to check (cron/startup/manual)
//!   ├── StateSaver         — serialize state before update
//!   ├── SelfBuilder        — cargo build with validation
//!   ├── BinarySwapper      — atomic binary replacement
//!   ├── HealthChecker      — post-update verification
//!   ├── TestRunner          — run Rust/Vitest/tsc test suites
//!   └── RollbackManager    — restore on failure
//! ```

pub mod auto_improve;
pub mod code_applier;
pub mod state_saver;
pub mod self_builder;
pub mod binary_swapper;
pub mod health_checker;
pub mod improvement_planner;
pub mod rollback;
pub mod test_runner;
pub mod update_scheduler;
pub mod policy_engine;
pub mod safety_envelope;
pub mod sandbox_runner;

pub use code_applier::{CodeApplier, CodeChange, ChangeType, ApplyResult};
pub use state_saver::{StateSaver, StateSnapshot};
pub use self_builder::{SelfBuilder, BuildConfig, BuildProfile, BuildResult};
pub use binary_swapper::{BinarySwapper, SwapRecord};
pub use health_checker::{HealthChecker, HealthCheckConfig, HealthReport, CheckResult};
pub use improvement_planner::{ImprovementPlanner, ImprovementPlan, Improvement, ImprovementType, ImprovementStatus, RiskLevel, InsightData};
pub use rollback::{RollbackManager, RollbackRecord, RollbackReason};
pub use test_runner::{TestRunner, TestRunConfig, TestRunResult, TestSuiteResult, TestFailure};
pub use update_scheduler::{UpdateScheduler, SchedulerConfig, UpdatePolicy, UpdateCheckStatus, SchedulerState};
pub use policy_engine::{PolicyEngine, PolicyAction, PolicyEvaluation, PolicyViolation, PolicyRule, RuleType, Severity};
pub use safety_envelope::{SafetyEnvelope, SafetyReport, InvariantResult, InvariantType};
pub use sandbox_runner::{SandboxRunner, SandboxConfig, SandboxResult, CodeChangeRef};
pub use auto_improve::{AutoImproveScheduler, AutoImproveConfig, ImproveCycle, CycleStatus, TestSummary};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{error, info, warn};

/// Overall status of an OTA update attempt.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum UpdateStatus {
    /// No update in progress
    Idle,
    /// Checking for available updates
    Checking,
    /// Saving state before update
    SavingState,
    /// Building new binary
    Building,
    /// Swapping binary
    Swapping,
    /// Running health checks
    HealthChecking,
    /// Update completed successfully
    Completed,
    /// Update failed, rolling back
    RollingBack,
    /// Rollback completed
    RolledBack,
    /// Update failed and rollback also failed
    Failed,
}

impl std::fmt::Display for UpdateStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UpdateStatus::Idle => write!(f, "idle"),
            UpdateStatus::Checking => write!(f, "checking"),
            UpdateStatus::SavingState => write!(f, "saving_state"),
            UpdateStatus::Building => write!(f, "building"),
            UpdateStatus::Swapping => write!(f, "swapping"),
            UpdateStatus::HealthChecking => write!(f, "health_checking"),
            UpdateStatus::Completed => write!(f, "completed"),
            UpdateStatus::RollingBack => write!(f, "rolling_back"),
            UpdateStatus::RolledBack => write!(f, "rolled_back"),
            UpdateStatus::Failed => write!(f, "failed"),
        }
    }
}

/// Result of a complete update cycle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    /// Final status
    pub status: UpdateStatus,
    /// Build result (if build was attempted)
    pub build_result: Option<BuildResult>,
    /// Health report (if checks were run)
    pub health_report: Option<HealthReport>,
    /// Rollback record (if rollback occurred)
    pub rollback_record: Option<RollbackRecord>,
    /// Human-readable summary
    pub summary: String,
}

/// Configuration for the OTA manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtaConfig {
    /// Base directory for OTA data (snapshots, backups, history)
    pub data_dir: PathBuf,
    /// Build configuration
    pub build_config: BuildConfig,
    /// Health check configuration
    pub health_check_config: HealthCheckConfig,
    /// Scheduler configuration
    pub scheduler_config: SchedulerConfig,
    /// Maximum snapshots to retain
    pub max_snapshots: usize,
    /// Maximum binary backups to retain
    pub max_backups: usize,
}

impl OtaConfig {
    /// Create a default OTA config for the goose project.
    pub fn default_goose(workspace_root: PathBuf) -> Self {
        let data_dir = workspace_root.join(".ota");
        let binary_path = workspace_root
            .join("target")
            .join("release")
            .join(if cfg!(windows) { "goose.exe" } else { "goose" });

        Self {
            data_dir: data_dir.clone(),
            build_config: BuildConfig {
                workspace_root: workspace_root.clone(),
                ..BuildConfig::default_goose()
            },
            health_check_config: HealthCheckConfig::minimal(binary_path),
            scheduler_config: SchedulerConfig::default(),
            max_snapshots: 5,
            max_backups: 10,
        }
    }
}

/// Orchestrates the complete OTA self-update flow.
pub struct OtaManager {
    pub state_saver: StateSaver,
    pub self_builder: SelfBuilder,
    pub binary_swapper: BinarySwapper,
    pub health_checker: HealthChecker,
    pub rollback: RollbackManager,
    pub update_scheduler: UpdateScheduler,
    status: UpdateStatus,
}

impl OtaManager {
    /// Create a new OtaManager from an OtaConfig.
    pub fn new(config: OtaConfig) -> Self {
        let snapshot_dir = config.data_dir.join("snapshots");
        let backup_dir = config.data_dir.join("backups");
        let history_dir = config.data_dir.join("history");

        Self {
            state_saver: StateSaver::new(snapshot_dir, config.max_snapshots),
            self_builder: SelfBuilder::new(config.build_config),
            binary_swapper: BinarySwapper::new(backup_dir, config.max_backups),
            health_checker: HealthChecker::new(config.health_check_config),
            rollback: RollbackManager::with_defaults(history_dir),
            update_scheduler: UpdateScheduler::new(config.scheduler_config),
            status: UpdateStatus::Idle,
        }
    }

    /// Create an OtaManager with default goose configuration.
    pub fn default_goose(workspace_root: PathBuf) -> Self {
        Self::new(OtaConfig::default_goose(workspace_root))
    }

    /// Get the current update status.
    pub fn status(&self) -> &UpdateStatus {
        &self.status
    }

    /// Perform a complete update cycle:
    /// 1. Save state
    /// 2. Build new binary
    /// 3. Swap binary
    /// 4. Run health checks
    /// 5. Rollback on failure
    pub async fn perform_update(
        &mut self,
        current_version: &str,
        config_json: &str,
    ) -> Result<UpdateResult> {
        info!("Starting OTA update cycle");

        // Step 1: Save state
        self.status = UpdateStatus::SavingState;
        let snapshot = self.state_saver.capture_state(
            current_version,
            config_json,
            Vec::new(),
            None,
        );
        if let Err(e) = self.state_saver.save_snapshot(&snapshot).await {
            warn!("Failed to save state snapshot: {}", e);
            // Non-fatal — continue with update
        }
        self.rollback.record_snapshot(snapshot.snapshot_id.clone());

        // Step 2: Build
        self.status = UpdateStatus::Building;
        let build_result = match self.self_builder.build().await {
            Ok(result) => {
                if !result.success {
                    self.status = UpdateStatus::Failed;
                    return Ok(UpdateResult {
                        status: UpdateStatus::Failed,
                        build_result: Some(result),
                        health_report: None,
                        rollback_record: None,
                        summary: "Build failed".to_string(),
                    });
                }
                result
            }
            Err(e) => {
                self.status = UpdateStatus::Failed;
                return Ok(UpdateResult {
                    status: UpdateStatus::Failed,
                    build_result: None,
                    health_report: None,
                    rollback_record: None,
                    summary: format!("Build error: {}", e),
                });
            }
        };

        // Step 3: Swap binary
        self.status = UpdateStatus::Swapping;
        let active_path = self.health_checker.config().binary_path.clone();
        let new_binary = build_result
            .binary_path
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Build succeeded but no binary path"))?;

        let _swap_record = match self.binary_swapper.swap(&active_path, new_binary).await {
            Ok(record) => {
                self.rollback.record_swap(record.clone());
                record
            }
            Err(e) => {
                self.status = UpdateStatus::Failed;
                return Ok(UpdateResult {
                    status: UpdateStatus::Failed,
                    build_result: Some(build_result),
                    health_report: None,
                    rollback_record: None,
                    summary: format!("Binary swap failed: {}", e),
                });
            }
        };

        // Step 4: Health check
        self.status = UpdateStatus::HealthChecking;
        let health_report = self.health_checker.run_all_checks().await?;

        if health_report.healthy {
            // Success!
            self.status = UpdateStatus::Completed;
            self.update_scheduler.record_success().await;
            info!("OTA update completed successfully");

            Ok(UpdateResult {
                status: UpdateStatus::Completed,
                build_result: Some(build_result),
                health_report: Some(health_report),
                rollback_record: None,
                summary: "Update completed successfully".to_string(),
            })
        } else {
            // Step 5: Rollback
            self.status = UpdateStatus::RollingBack;
            self.update_scheduler.record_failure().await;
            error!("Health check failed, rolling back");

            let rollback_record = self
                .rollback
                .rollback(RollbackReason::HealthCheckFailed)
                .await?;

            if rollback_record.success {
                self.status = UpdateStatus::RolledBack;
                Ok(UpdateResult {
                    status: UpdateStatus::RolledBack,
                    build_result: Some(build_result),
                    health_report: Some(health_report),
                    rollback_record: Some(rollback_record),
                    summary: "Health check failed, successfully rolled back".to_string(),
                })
            } else {
                self.status = UpdateStatus::Failed;
                Ok(UpdateResult {
                    status: UpdateStatus::Failed,
                    build_result: Some(build_result),
                    health_report: Some(health_report),
                    rollback_record: Some(rollback_record),
                    summary: "Health check failed AND rollback failed".to_string(),
                })
            }
        }
    }

    /// Perform a dry-run update (no actual build/swap, just validation).
    pub fn dry_run(&self) -> UpdateResult {
        let build_result = self.self_builder.build_dry_run();
        UpdateResult {
            status: UpdateStatus::Completed,
            build_result: Some(build_result),
            health_report: None,
            rollback_record: None,
            summary: "Dry run completed".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_update_status_display() {
        assert_eq!(UpdateStatus::Idle.to_string(), "idle");
        assert_eq!(UpdateStatus::Building.to_string(), "building");
        assert_eq!(UpdateStatus::Completed.to_string(), "completed");
        assert_eq!(UpdateStatus::RollingBack.to_string(), "rolling_back");
        assert_eq!(UpdateStatus::Failed.to_string(), "failed");
    }

    #[test]
    fn test_update_status_serialization() {
        let status = UpdateStatus::HealthChecking;
        let json = serde_json::to_string(&status).unwrap();
        let deserialized: UpdateStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, UpdateStatus::HealthChecking);
    }

    #[test]
    fn test_ota_config_default() {
        let config = OtaConfig::default_goose(PathBuf::from("/workspace"));
        assert_eq!(config.max_snapshots, 5);
        assert_eq!(config.max_backups, 10);
        assert!(config.data_dir.to_string_lossy().contains(".ota"));
    }

    #[test]
    fn test_ota_manager_creation() {
        let dir = TempDir::new().unwrap();
        let manager = OtaManager::default_goose(dir.path().to_path_buf());
        assert_eq!(*manager.status(), UpdateStatus::Idle);
    }

    #[test]
    fn test_dry_run() {
        let dir = TempDir::new().unwrap();
        let manager = OtaManager::default_goose(dir.path().to_path_buf());
        let result = manager.dry_run();
        assert_eq!(result.status, UpdateStatus::Completed);
        assert!(result.build_result.is_some());
        assert!(result.summary.contains("Dry run"));
    }

    #[test]
    fn test_update_result_serialization() {
        let result = UpdateResult {
            status: UpdateStatus::Completed,
            build_result: None,
            health_report: None,
            rollback_record: None,
            summary: "Test update".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: UpdateResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, UpdateStatus::Completed);
        assert_eq!(deserialized.summary, "Test update");
    }

    #[test]
    fn test_ota_manager_components_accessible() {
        let dir = TempDir::new().unwrap();
        let manager = OtaManager::default_goose(dir.path().to_path_buf());

        // Verify all components are accessible
        let _ = manager.state_saver.snapshot_dir();
        let _ = manager.self_builder.config();
        let _ = manager.binary_swapper.backup_dir();
        let _ = manager.health_checker.config();
        let _ = manager.rollback.history_dir();
        let _ = manager.update_scheduler.config();
    }

    #[test]
    fn test_ota_config_paths() {
        let config = OtaConfig::default_goose(PathBuf::from("/workspace"));

        // Verify the data directory structure
        assert!(config.data_dir.to_string_lossy().contains(".ota"));
        assert_eq!(config.build_config.package, "goose-cli");
    }
}
