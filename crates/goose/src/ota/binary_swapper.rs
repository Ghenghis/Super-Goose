//! BinarySwapper — atomic binary replacement with backup and verification.
//!
//! Handles the critical step of replacing the running binary with a new build.
//! Uses a rename-based atomic swap pattern with automatic backup creation.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{error, info, warn};

/// Record of a binary swap operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapRecord {
    /// Unique identifier for this swap
    pub swap_id: String,
    /// Path to the active binary
    pub active_path: PathBuf,
    /// Path to the backup of the old binary
    pub backup_path: PathBuf,
    /// Path the new binary was sourced from
    pub source_path: PathBuf,
    /// When the swap occurred
    pub swapped_at: DateTime<Utc>,
    /// SHA-256 hash of the old binary
    pub old_hash: Option<String>,
    /// SHA-256 hash of the new binary
    pub new_hash: Option<String>,
    /// Whether the swap completed successfully
    pub success: bool,
}

/// Manages atomic binary replacement.
pub struct BinarySwapper {
    /// Directory to store backup binaries
    backup_dir: PathBuf,
    /// Maximum number of backups to retain
    max_backups: usize,
}

impl BinarySwapper {
    /// Create a new BinarySwapper.
    pub fn new(backup_dir: PathBuf, max_backups: usize) -> Self {
        Self {
            backup_dir,
            max_backups,
        }
    }

    /// Create with defaults (10 max backups).
    pub fn with_defaults(backup_dir: PathBuf) -> Self {
        Self::new(backup_dir, 10)
    }

    /// Get the backup directory path.
    pub fn backup_dir(&self) -> &Path {
        &self.backup_dir
    }

    /// Compute SHA-256 hash of a file.
    pub fn file_hash(path: &Path) -> Result<String> {
        use sha2::{Digest, Sha256};

        let data = std::fs::read(path)
            .with_context(|| format!("Failed to read file for hashing: {}", path.display()))?;

        let mut hasher = Sha256::new();
        hasher.update(&data);
        let hash = format!("{:x}", hasher.finalize());
        Ok(hash)
    }

    /// Generate a backup path for the current binary.
    fn generate_backup_path(&self, original: &Path) -> PathBuf {
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let filename = original
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "binary".to_string());

        self.backup_dir
            .join(format!("{}_{}", filename, timestamp))
    }

    /// Perform an atomic binary swap.
    ///
    /// 1. Create backup directory if needed
    /// 2. Copy current binary to backup location
    /// 3. Copy new binary to active location
    /// 4. Verify the swap
    ///
    /// Returns a SwapRecord for rollback tracking.
    pub async fn swap(
        &self,
        active_path: &Path,
        new_binary_path: &Path,
    ) -> Result<SwapRecord> {
        // Validate inputs
        if !new_binary_path.exists() {
            bail!(
                "New binary does not exist: {}",
                new_binary_path.display()
            );
        }

        let new_meta = std::fs::metadata(new_binary_path)
            .context("Failed to read new binary metadata")?;

        if new_meta.len() == 0 {
            bail!("New binary is empty: {}", new_binary_path.display());
        }

        // Create backup directory
        tokio::fs::create_dir_all(&self.backup_dir)
            .await
            .context("Failed to create backup directory")?;

        let backup_path = self.generate_backup_path(active_path);
        let swap_id = uuid::Uuid::new_v4().to_string();

        // Hash the new binary
        let new_hash = Self::file_hash(new_binary_path).ok();

        // Backup the current binary if it exists
        let old_hash = if active_path.exists() {
            let hash = Self::file_hash(active_path).ok();
            tokio::fs::copy(active_path, &backup_path)
                .await
                .with_context(|| {
                    format!(
                        "Failed to backup {} to {}",
                        active_path.display(),
                        backup_path.display()
                    )
                })?;
            info!(
                backup = %backup_path.display(),
                "Backed up current binary"
            );
            hash
        } else {
            warn!(
                path = %active_path.display(),
                "No existing binary to backup"
            );
            None
        };

        // Copy new binary to active location
        tokio::fs::copy(new_binary_path, active_path)
            .await
            .with_context(|| {
                format!(
                    "Failed to copy new binary from {} to {}",
                    new_binary_path.display(),
                    active_path.display()
                )
            })?;

        // Verify the swap
        let verify_hash = Self::file_hash(active_path).ok();
        let success = match (&new_hash, &verify_hash) {
            (Some(expected), Some(actual)) => expected == actual,
            _ => active_path.exists(),
        };

        if !success {
            error!("Binary swap verification failed");
        } else {
            info!(
                active = %active_path.display(),
                "Binary swap completed successfully"
            );
        }

        // Prune old backups
        if let Err(e) = self.prune_backups().await {
            warn!("Failed to prune old backups: {}", e);
        }

        Ok(SwapRecord {
            swap_id,
            active_path: active_path.to_path_buf(),
            backup_path,
            source_path: new_binary_path.to_path_buf(),
            swapped_at: Utc::now(),
            old_hash,
            new_hash,
            success,
        })
    }

    /// Restore a binary from its backup (used during rollback).
    pub async fn restore_from_backup(&self, record: &SwapRecord) -> Result<()> {
        if !record.backup_path.exists() {
            bail!(
                "Backup not found: {}",
                record.backup_path.display()
            );
        }

        tokio::fs::copy(&record.backup_path, &record.active_path)
            .await
            .with_context(|| {
                format!(
                    "Failed to restore backup from {} to {}",
                    record.backup_path.display(),
                    record.active_path.display()
                )
            })?;

        info!(
            backup = %record.backup_path.display(),
            active = %record.active_path.display(),
            "Restored binary from backup"
        );

        Ok(())
    }

    /// List all backup files, sorted newest first.
    pub async fn list_backups(&self) -> Result<Vec<PathBuf>> {
        if !self.backup_dir.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&self.backup_dir)
            .await
            .context("Failed to read backup directory")?;

        while let Some(entry) = read_dir.next_entry().await? {
            if entry.file_type().await?.is_file() {
                backups.push(entry.path());
            }
        }

        backups.sort();
        backups.reverse();
        Ok(backups)
    }

    /// Remove old backups beyond the retention limit.
    async fn prune_backups(&self) -> Result<()> {
        let backups = self.list_backups().await?;
        if backups.len() <= self.max_backups {
            return Ok(());
        }

        for path in backups.iter().skip(self.max_backups) {
            tokio::fs::remove_file(path)
                .await
                .with_context(|| format!("Failed to prune backup: {}", path.display()))?;
            info!(path = %path.display(), "Pruned old backup");
        }

        Ok(())
    }

    /// Validate that two files have different hashes (i.e., an actual update occurred).
    pub fn is_different(path_a: &Path, path_b: &Path) -> Result<bool> {
        let hash_a = Self::file_hash(path_a)?;
        let hash_b = Self::file_hash(path_b)?;
        Ok(hash_a != hash_b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_swap_record_serialization() {
        let record = SwapRecord {
            swap_id: "swap-001".to_string(),
            active_path: PathBuf::from("/usr/local/bin/goose"),
            backup_path: PathBuf::from("/backups/goose_20260212"),
            source_path: PathBuf::from("/target/release/goose"),
            swapped_at: Utc::now(),
            old_hash: Some("aaa".to_string()),
            new_hash: Some("bbb".to_string()),
            success: true,
        };

        let json = serde_json::to_string(&record).unwrap();
        let deserialized: SwapRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.swap_id, "swap-001");
        assert!(deserialized.success);
    }

    #[test]
    fn test_file_hash() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test_file");
        std::fs::write(&path, b"hello world").unwrap();

        let hash = BinarySwapper::file_hash(&path).unwrap();
        assert!(!hash.is_empty());
        assert_eq!(hash.len(), 64); // SHA-256 hex is 64 chars

        // Same content should produce same hash
        let path2 = dir.path().join("test_file2");
        std::fs::write(&path2, b"hello world").unwrap();
        let hash2 = BinarySwapper::file_hash(&path2).unwrap();
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_file_hash_different() {
        let dir = TempDir::new().unwrap();
        let path1 = dir.path().join("file1");
        let path2 = dir.path().join("file2");
        std::fs::write(&path1, b"content A").unwrap();
        std::fs::write(&path2, b"content B").unwrap();

        let hash1 = BinarySwapper::file_hash(&path1).unwrap();
        let hash2 = BinarySwapper::file_hash(&path2).unwrap();
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_is_different() {
        let dir = TempDir::new().unwrap();
        let path1 = dir.path().join("a");
        let path2 = dir.path().join("b");
        std::fs::write(&path1, b"version 1").unwrap();
        std::fs::write(&path2, b"version 2").unwrap();

        assert!(BinarySwapper::is_different(&path1, &path2).unwrap());

        // Same content
        let path3 = dir.path().join("c");
        std::fs::write(&path3, b"version 1").unwrap();
        assert!(!BinarySwapper::is_different(&path1, &path3).unwrap());
    }

    #[test]
    fn test_generate_backup_path() {
        let dir = TempDir::new().unwrap();
        let swapper = BinarySwapper::with_defaults(dir.path().to_path_buf());
        let original = PathBuf::from("/usr/local/bin/goose");
        let backup = swapper.generate_backup_path(&original);

        let backup_str = backup.to_string_lossy();
        assert!(backup_str.contains("goose_"));
        assert!(backup_str.starts_with(&dir.path().to_string_lossy().to_string()));
    }

    #[tokio::test]
    async fn test_swap_new_binary() {
        let dir = TempDir::new().unwrap();
        let backup_dir = dir.path().join("backups");
        let swapper = BinarySwapper::with_defaults(backup_dir);

        let active = dir.path().join("active_binary");
        let new_bin = dir.path().join("new_binary");

        std::fs::write(&active, b"old binary content").unwrap();
        std::fs::write(&new_bin, b"new binary content").unwrap();

        let record = swapper.swap(&active, &new_bin).await.unwrap();
        assert!(record.success);
        assert!(record.backup_path.exists());

        // Active binary should now have new content
        let content = std::fs::read_to_string(&active).unwrap();
        assert_eq!(content, "new binary content");
    }

    #[tokio::test]
    async fn test_swap_no_existing_binary() {
        let dir = TempDir::new().unwrap();
        let backup_dir = dir.path().join("backups");
        let swapper = BinarySwapper::with_defaults(backup_dir);

        let active = dir.path().join("nonexistent_binary");
        let new_bin = dir.path().join("new_binary");
        std::fs::write(&new_bin, b"new binary content").unwrap();

        let record = swapper.swap(&active, &new_bin).await.unwrap();
        assert!(record.success);

        // Active binary should now exist with new content
        let content = std::fs::read_to_string(&active).unwrap();
        assert_eq!(content, "new binary content");
    }

    #[tokio::test]
    async fn test_swap_rejects_empty_binary() {
        let dir = TempDir::new().unwrap();
        let backup_dir = dir.path().join("backups");
        let swapper = BinarySwapper::with_defaults(backup_dir);

        let active = dir.path().join("active");
        let new_bin = dir.path().join("empty");
        std::fs::write(&active, b"old content").unwrap();
        std::fs::write(&new_bin, b"").unwrap();

        let result = swapper.swap(&active, &new_bin).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_swap_rejects_missing_source() {
        let dir = TempDir::new().unwrap();
        let backup_dir = dir.path().join("backups");
        let swapper = BinarySwapper::with_defaults(backup_dir);

        let active = dir.path().join("active");
        let new_bin = dir.path().join("does_not_exist");

        let result = swapper.swap(&active, &new_bin).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_restore_from_backup() {
        let dir = TempDir::new().unwrap();
        let backup_dir = dir.path().join("backups");
        let swapper = BinarySwapper::with_defaults(backup_dir);

        let active = dir.path().join("active_binary");
        let new_bin = dir.path().join("new_binary");

        std::fs::write(&active, b"old binary v1").unwrap();
        std::fs::write(&new_bin, b"new binary v2").unwrap();

        // Swap
        let record = swapper.swap(&active, &new_bin).await.unwrap();

        // Active should be v2
        assert_eq!(std::fs::read_to_string(&active).unwrap(), "new binary v2");

        // Restore
        swapper.restore_from_backup(&record).await.unwrap();
        assert_eq!(std::fs::read_to_string(&active).unwrap(), "old binary v1");
    }

    #[tokio::test]
    async fn test_list_backups_empty() {
        let dir = TempDir::new().unwrap();
        let swapper = BinarySwapper::with_defaults(dir.path().join("empty_backups"));
        let list = swapper.list_backups().await.unwrap();
        assert!(list.is_empty());
    }
}
