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

#[cfg(test)]
mod integration_tests;

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

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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
    /// Whether the server needs to restart for the update to take effect
    #[serde(default)]
    pub restart_required: bool,
    /// Path where the binary was deployed (if deploy step succeeded)
    #[serde(default)]
    pub deployed_path: Option<PathBuf>,
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
    /// Optional path where the built binary should be deployed (copied) after a successful build.
    /// For Electron desktop builds, this is typically `ui/desktop/src/bin/goosed.exe`.
    pub deploy_path: Option<PathBuf>,
}

impl OtaConfig {
    /// Create a default OTA config for the goose project.
    ///
    /// Automatically detects the deploy path for Electron desktop builds
    /// (`ui/desktop/src/bin/goosed[.exe]`) relative to the workspace root.
    /// Falls back to `GOOSE_DEPLOY_PATH` env var if the directory doesn't exist.
    pub fn default_goose(workspace_root: PathBuf) -> Self {
        let data_dir = workspace_root.join(".ota");
        let binary_name = if cfg!(windows) { "goosed.exe" } else { "goosed" };
        let binary_path = workspace_root
            .join("target")
            .join("release")
            .join(binary_name);

        // Detect Electron deploy path: ui/desktop/src/bin/goosed[.exe]
        let deploy_path = Self::detect_deploy_path(&workspace_root, binary_name);

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
            deploy_path,
        }
    }

    /// Detect the Electron deploy path for the binary.
    ///
    /// Checks (in order):
    /// 1. `GOOSE_DEPLOY_PATH` environment variable
    /// 2. `ui/desktop/src/bin/` directory relative to workspace root
    fn detect_deploy_path(workspace_root: &Path, binary_name: &str) -> Option<PathBuf> {
        // Check env var first (allows override in production/Docker)
        if let Ok(env_path) = std::env::var("GOOSE_DEPLOY_PATH") {
            let p = PathBuf::from(&env_path);
            if p.parent().map_or(false, |d| d.exists()) {
                info!("Using GOOSE_DEPLOY_PATH: {}", p.display());
                return Some(p);
            }
            warn!("GOOSE_DEPLOY_PATH set but parent dir missing: {}", env_path);
        }

        // Check for Electron desktop bin directory
        let electron_bin_dir = workspace_root.join("ui").join("desktop").join("src").join("bin");
        if electron_bin_dir.exists() {
            let deploy = electron_bin_dir.join(binary_name);
            info!("Detected Electron deploy path: {}", deploy.display());
            return Some(deploy);
        }

        // No deploy path found — binary stays in target/release/
        info!("No deploy path detected; binary will remain in target/release/");
        None
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
    /// History of completed update cycles (most recent last).
    cycle_history: Vec<UpdateResult>,
    /// Timestamp when the last update was attempted.
    last_update_time: Option<chrono::DateTime<chrono::Utc>>,
    /// Where to copy the built binary for the Electron supervisor to find on restart.
    deploy_path: Option<PathBuf>,
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
            cycle_history: Vec::new(),
            last_update_time: None,
            deploy_path: config.deploy_path,
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

    /// Get the history of completed update cycles.
    pub fn cycle_history(&self) -> &[UpdateResult] {
        &self.cycle_history
    }

    /// Get the timestamp of the last update attempt.
    pub fn last_update_time(&self) -> Option<&chrono::DateTime<chrono::Utc>> {
        self.last_update_time.as_ref()
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
        self.last_update_time = Some(chrono::Utc::now());

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
                        restart_required: false,
                        deployed_path: None,
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
                    restart_required: false,
                    deployed_path: None,
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
                    restart_required: false,
                    deployed_path: None,
                });
            }
        };

        // Step 4: Health check
        self.status = UpdateStatus::HealthChecking;
        let health_report = self.health_checker.run_all_checks().await?;

        let result = if health_report.healthy {
            // Success! Deploy binary if deploy_path is configured
            let deployed_path = if let Some(ref deploy_target) = self.deploy_path {
                if let Some(ref built_binary) = build_result.binary_path {
                    match Self::deploy_binary(built_binary, deploy_target).await {
                        Ok(()) => {
                            info!("Binary deployed to: {}", deploy_target.display());
                            Some(deploy_target.clone())
                        }
                        Err(e) => {
                            warn!("Binary deploy failed (non-fatal): {}", e);
                            None
                        }
                    }
                } else {
                    None
                }
            } else {
                None
            };

            self.status = UpdateStatus::Completed;
            self.update_scheduler.record_success().await;
            info!("OTA update completed successfully");

            UpdateResult {
                status: UpdateStatus::Completed,
                build_result: Some(build_result),
                health_report: Some(health_report),
                rollback_record: None,
                summary: "Update completed successfully".to_string(),
                restart_required: true,
                deployed_path,
            }
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
                UpdateResult {
                    status: UpdateStatus::RolledBack,
                    build_result: Some(build_result),
                    health_report: Some(health_report),
                    rollback_record: Some(rollback_record),
                    summary: "Health check failed, successfully rolled back".to_string(),
                    restart_required: false,
                    deployed_path: None,
                }
            } else {
                self.status = UpdateStatus::Failed;
                UpdateResult {
                    status: UpdateStatus::Failed,
                    build_result: Some(build_result),
                    health_report: Some(health_report),
                    rollback_record: Some(rollback_record),
                    summary: "Health check failed AND rollback failed".to_string(),
                    restart_required: false,
                    deployed_path: None,
                }
            }
        };

        // Record in cycle history
        self.cycle_history.push(result.clone());
        Ok(result)
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
            restart_required: false,
            deployed_path: None,
        }
    }

    /// Copy the built binary to the deploy target path.
    async fn deploy_binary(source: &std::path::Path, target: &std::path::Path) -> Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await
                .context("Failed to create deploy directory")?;
        }

        // Copy with retry (target might be locked briefly on Windows)
        let mut last_err = None;
        for attempt in 0..3 {
            match tokio::fs::copy(source, target).await {
                Ok(bytes) => {
                    info!(
                        "Deployed binary: {} → {} ({} bytes)",
                        source.display(),
                        target.display(),
                        bytes
                    );
                    return Ok(());
                }
                Err(e) => {
                    warn!("Deploy attempt {} failed: {}", attempt + 1, e);
                    last_err = Some(e);
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
            }
        }

        Err(last_err
            .map(|e| anyhow::anyhow!("Deploy failed after 3 attempts: {}", e))
            .unwrap_or_else(|| anyhow::anyhow!("Deploy failed")))
    }

    /// Get the configured deploy path.
    pub fn deploy_path(&self) -> Option<&PathBuf> {
        self.deploy_path.as_ref()
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
            restart_required: true,
            deployed_path: Some(PathBuf::from("/deploy/goosed")),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: UpdateResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, UpdateStatus::Completed);
        assert_eq!(deserialized.summary, "Test update");
        assert!(deserialized.restart_required);
        assert_eq!(deserialized.deployed_path.unwrap().to_string_lossy(), "/deploy/goosed");
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
        assert_eq!(config.build_config.package, "goose-server");
    }
}
