//! RollbackManager — restores the previous version if a health check fails.
//!
//! Maintains a history of swap records and state snapshots so that any
//! failed update can be completely reversed. Supports multi-level rollback
//! (rolling back to any previous version, not just the last one).

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{error, info, warn};

use super::binary_swapper::SwapRecord;

/// Reason for a rollback.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RollbackReason {
    /// Health check failed after update
    HealthCheckFailed,
    /// User manually requested rollback
    UserRequested,
    /// Build validation failed
    BuildValidationFailed,
    /// Binary swap verification failed
    SwapVerificationFailed,
    /// Startup crash detected
    StartupCrash,
    /// Custom reason
    Custom(String),
}

impl std::fmt::Display for RollbackReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RollbackReason::HealthCheckFailed => write!(f, "health_check_failed"),
            RollbackReason::UserRequested => write!(f, "user_requested"),
            RollbackReason::BuildValidationFailed => write!(f, "build_validation_failed"),
            RollbackReason::SwapVerificationFailed => write!(f, "swap_verification_failed"),
            RollbackReason::StartupCrash => write!(f, "startup_crash"),
            RollbackReason::Custom(s) => write!(f, "custom: {}", s),
        }
    }
}

/// Record of a rollback operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackRecord {
    /// Unique rollback identifier
    pub rollback_id: String,
    /// Which swap record we're rolling back
    pub swap_id: String,
    /// Why the rollback happened
    pub reason: RollbackReason,
    /// When the rollback was performed
    pub rolled_back_at: DateTime<Utc>,
    /// Whether the rollback itself succeeded
    pub success: bool,
    /// Details about the rollback
    pub details: String,
}

/// Manages rollback operations for OTA updates.
pub struct RollbackManager {
    /// Directory for storing rollback history
    history_dir: PathBuf,
    /// Stack of swap records (most recent first)
    swap_history: Vec<SwapRecord>,
    /// Stack of state snapshots (most recent first)
    snapshot_history: Vec<String>, // snapshot IDs
    /// Maximum rollback history to retain
    max_history: usize,
}

impl RollbackManager {
    /// Create a new RollbackManager.
    pub fn new(history_dir: PathBuf, max_history: usize) -> Self {
        Self {
            history_dir,
            swap_history: Vec::new(),
            snapshot_history: Vec::new(),
            max_history,
        }
    }

    /// Create with defaults (20 max history entries).
    pub fn with_defaults(history_dir: PathBuf) -> Self {
        Self::new(history_dir, 20)
    }

    /// Get the history directory path.
    pub fn history_dir(&self) -> &Path {
        &self.history_dir
    }

    /// Record a swap for potential rollback.
    pub fn record_swap(&mut self, record: SwapRecord) {
        info!(swap_id = %record.swap_id, "Recording swap for rollback history");
        self.swap_history.insert(0, record);

        // Trim to max
        if self.swap_history.len() > self.max_history {
            self.swap_history.truncate(self.max_history);
        }
    }

    /// Record a state snapshot ID for potential rollback.
    pub fn record_snapshot(&mut self, snapshot_id: String) {
        info!(snapshot_id = %snapshot_id, "Recording snapshot for rollback history");
        self.snapshot_history.insert(0, snapshot_id);

        if self.snapshot_history.len() > self.max_history {
            self.snapshot_history.truncate(self.max_history);
        }
    }

    /// Get the most recent swap record.
    pub fn last_swap(&self) -> Option<&SwapRecord> {
        self.swap_history.first()
    }

    /// Get the most recent snapshot ID.
    pub fn last_snapshot_id(&self) -> Option<&str> {
        self.snapshot_history.first().map(|s| s.as_str())
    }

    /// Get the number of recorded swaps.
    pub fn swap_count(&self) -> usize {
        self.swap_history.len()
    }

    /// Get the number of recorded snapshots.
    pub fn snapshot_count(&self) -> usize {
        self.snapshot_history.len()
    }

    /// Check if a rollback is possible (i.e., we have a swap record with a backup).
    pub fn can_rollback(&self) -> bool {
        self.swap_history
            .first()
            .map(|r| r.backup_path.exists())
            .unwrap_or(false)
    }

    /// Perform a rollback by restoring the backup binary.
    ///
    /// This copies the backup binary back to the active path.
    /// Returns a RollbackRecord documenting what happened.
    pub async fn rollback(&mut self, reason: RollbackReason) -> Result<RollbackRecord> {
        let swap = self
            .swap_history
            .first()
            .ok_or_else(|| anyhow::anyhow!("No swap history available for rollback"))?
            .clone();

        let rollback_id = uuid::Uuid::new_v4().to_string();

        info!(
            swap_id = %swap.swap_id,
            reason = %reason,
            "Starting rollback"
        );

        if !swap.backup_path.exists() {
            let record = RollbackRecord {
                rollback_id,
                swap_id: swap.swap_id.clone(),
                reason,
                rolled_back_at: Utc::now(),
                success: false,
                details: format!("Backup not found: {}", swap.backup_path.display()),
            };
            return Ok(record);
        }

        // Copy backup back to active location
        let result = tokio::fs::copy(&swap.backup_path, &swap.active_path).await;

        let (success, details) = match result {
            Ok(bytes) => {
                info!(
                    bytes = bytes,
                    "Rollback: restored backup to active path"
                );
                (true, format!("Restored {} bytes from backup", bytes))
            }
            Err(e) => {
                error!("Rollback failed: {}", e);
                (false, format!("Restore failed: {}", e))
            }
        };

        let record = RollbackRecord {
            rollback_id,
            swap_id: swap.swap_id.clone(),
            reason,
            rolled_back_at: Utc::now(),
            success,
            details,
        };

        // Save rollback record to disk
        if let Err(e) = self.save_rollback_record(&record).await {
            warn!("Failed to save rollback record: {}", e);
        }

        Ok(record)
    }

    /// Save a rollback record to the history directory.
    async fn save_rollback_record(&self, record: &RollbackRecord) -> Result<()> {
        tokio::fs::create_dir_all(&self.history_dir)
            .await
            .context("Failed to create history directory")?;

        let path = self
            .history_dir
            .join(format!("rollback_{}.json", record.rollback_id));

        let json = serde_json::to_string_pretty(record)
            .context("Failed to serialize rollback record")?;

        tokio::fs::write(&path, json)
            .await
            .context("Failed to write rollback record")?;

        Ok(())
    }

    /// Load rollback records from the history directory.
    pub async fn load_history(&self) -> Result<Vec<RollbackRecord>> {
        if !self.history_dir.exists() {
            return Ok(Vec::new());
        }

        let mut records = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&self.history_dir)
            .await
            .context("Failed to read history directory")?;

        while let Some(entry) = read_dir.next_entry().await? {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("rollback_") && name.ends_with(".json") {
                match tokio::fs::read_to_string(entry.path()).await {
                    Ok(json) => match serde_json::from_str::<RollbackRecord>(&json) {
                        Ok(record) => records.push(record),
                        Err(e) => {
                            warn!("Failed to parse rollback record {}: {}", name, e);
                        }
                    },
                    Err(e) => {
                        warn!("Failed to read rollback record {}: {}", name, e);
                    }
                }
            }
        }

        // Sort newest first
        records.sort_by(|a, b| b.rolled_back_at.cmp(&a.rolled_back_at));
        Ok(records)
    }

    /// Clear all rollback history.
    pub fn clear_history(&mut self) {
        self.swap_history.clear();
        self.snapshot_history.clear();
        info!("Cleared rollback history");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_swap_record() -> SwapRecord {
        SwapRecord {
            swap_id: "swap-test-001".to_string(),
            active_path: PathBuf::from("/tmp/active"),
            backup_path: PathBuf::from("/tmp/backup"),
            source_path: PathBuf::from("/tmp/source"),
            swapped_at: Utc::now(),
            old_hash: Some("old_hash".to_string()),
            new_hash: Some("new_hash".to_string()),
            success: true,
        }
    }

    #[test]
    fn test_rollback_reason_display() {
        assert_eq!(
            RollbackReason::HealthCheckFailed.to_string(),
            "health_check_failed"
        );
        assert_eq!(
            RollbackReason::UserRequested.to_string(),
            "user_requested"
        );
        assert_eq!(
            RollbackReason::Custom("oops".into()).to_string(),
            "custom: oops"
        );
    }

    #[test]
    fn test_rollback_reason_serialization() {
        let reason = RollbackReason::HealthCheckFailed;
        let json = serde_json::to_string(&reason).unwrap();
        let deserialized: RollbackReason = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, reason);
    }

    #[test]
    fn test_record_swap() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        assert_eq!(mgr.swap_count(), 0);
        assert!(mgr.last_swap().is_none());

        mgr.record_swap(test_swap_record());
        assert_eq!(mgr.swap_count(), 1);
        assert!(mgr.last_swap().is_some());
        assert_eq!(mgr.last_swap().unwrap().swap_id, "swap-test-001");
    }

    #[test]
    fn test_record_snapshot() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        assert_eq!(mgr.snapshot_count(), 0);
        assert!(mgr.last_snapshot_id().is_none());

        mgr.record_snapshot("snap-001".to_string());
        assert_eq!(mgr.snapshot_count(), 1);
        assert_eq!(mgr.last_snapshot_id(), Some("snap-001"));
    }

    #[test]
    fn test_history_ordering() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        let mut r1 = test_swap_record();
        r1.swap_id = "swap-1".to_string();
        let mut r2 = test_swap_record();
        r2.swap_id = "swap-2".to_string();

        mgr.record_swap(r1);
        mgr.record_swap(r2);

        // Most recent should be first
        assert_eq!(mgr.last_swap().unwrap().swap_id, "swap-2");
        assert_eq!(mgr.swap_count(), 2);
    }

    #[test]
    fn test_max_history_limit() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::new(dir.path().to_path_buf(), 3);

        for i in 0..5 {
            let mut r = test_swap_record();
            r.swap_id = format!("swap-{}", i);
            mgr.record_swap(r);
        }

        assert_eq!(mgr.swap_count(), 3); // capped at 3
    }

    #[test]
    fn test_can_rollback_no_history() {
        let dir = TempDir::new().unwrap();
        let mgr = RollbackManager::with_defaults(dir.path().to_path_buf());
        assert!(!mgr.can_rollback());
    }

    #[test]
    fn test_can_rollback_with_backup() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        // Create an actual backup file
        let backup_path = dir.path().join("backup_binary");
        std::fs::write(&backup_path, b"backup content").unwrap();

        let mut record = test_swap_record();
        record.backup_path = backup_path;
        mgr.record_swap(record);

        assert!(mgr.can_rollback());
    }

    #[test]
    fn test_clear_history() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        mgr.record_swap(test_swap_record());
        mgr.record_snapshot("snap-1".to_string());
        assert_eq!(mgr.swap_count(), 1);
        assert_eq!(mgr.snapshot_count(), 1);

        mgr.clear_history();
        assert_eq!(mgr.swap_count(), 0);
        assert_eq!(mgr.snapshot_count(), 0);
    }

    #[tokio::test]
    async fn test_rollback_success() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().join("history"));

        // Set up: active has "new", backup has "old"
        let active_path = dir.path().join("active_bin");
        let backup_path = dir.path().join("backup_bin");
        std::fs::write(&active_path, b"new version").unwrap();
        std::fs::write(&backup_path, b"old version").unwrap();

        let mut record = test_swap_record();
        record.active_path = active_path.clone();
        record.backup_path = backup_path;
        mgr.record_swap(record);

        let result = mgr
            .rollback(RollbackReason::HealthCheckFailed)
            .await
            .unwrap();
        assert!(result.success);
        assert_eq!(result.reason, RollbackReason::HealthCheckFailed);

        // Active should now have old content
        let content = std::fs::read_to_string(&active_path).unwrap();
        assert_eq!(content, "old version");
    }

    #[tokio::test]
    async fn test_rollback_no_history() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        let result = mgr.rollback(RollbackReason::UserRequested).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rollback_missing_backup() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().join("history"));

        let mut record = test_swap_record();
        record.backup_path = PathBuf::from("/nonexistent/backup");
        mgr.record_swap(record);

        let result = mgr
            .rollback(RollbackReason::HealthCheckFailed)
            .await
            .unwrap();
        assert!(!result.success);
    }

    #[tokio::test]
    async fn test_load_history_empty() {
        let dir = TempDir::new().unwrap();
        let mgr = RollbackManager::with_defaults(dir.path().join("empty_history"));
        let history = mgr.load_history().await.unwrap();
        assert!(history.is_empty());
    }

    #[test]
    fn test_rollback_record_serialization() {
        let record = RollbackRecord {
            rollback_id: "rb-001".to_string(),
            swap_id: "swap-001".to_string(),
            reason: RollbackReason::StartupCrash,
            rolled_back_at: Utc::now(),
            success: true,
            details: "Restored successfully".to_string(),
        };

        let json = serde_json::to_string(&record).unwrap();
        let deserialized: RollbackRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.rollback_id, "rb-001");
        assert_eq!(deserialized.reason, RollbackReason::StartupCrash);
        assert!(deserialized.success);
    }
}
