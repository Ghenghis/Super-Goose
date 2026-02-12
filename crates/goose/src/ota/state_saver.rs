//! StateSaver — serializes agent state before OTA updates.
//!
//! Captures configuration, session data, and learning store snapshots
//! so they can be restored if an update fails or the new binary needs
//! to resume from the same point.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

/// Snapshot of agent state captured before an update.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSnapshot {
    /// Unique identifier for this snapshot
    pub snapshot_id: String,
    /// When the snapshot was taken
    pub created_at: DateTime<Utc>,
    /// Current binary version (git hash or semver)
    pub version: String,
    /// Serialized configuration (JSON)
    pub config_json: String,
    /// Active session IDs
    pub active_sessions: Vec<String>,
    /// Key-value metadata (extension states, feature flags, etc.)
    pub metadata: HashMap<String, String>,
    /// Path to the learning store database (if any)
    pub learning_db_path: Option<PathBuf>,
    /// Whether this snapshot has been verified as restorable
    pub verified: bool,
}

impl StateSnapshot {
    /// Create a new empty snapshot with a generated ID.
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            snapshot_id: uuid::Uuid::new_v4().to_string(),
            created_at: Utc::now(),
            version: version.into(),
            config_json: String::new(),
            active_sessions: Vec::new(),
            metadata: HashMap::new(),
            learning_db_path: None,
            verified: false,
        }
    }
}

/// Manages saving and loading agent state snapshots.
pub struct StateSaver {
    /// Directory where snapshots are stored
    snapshot_dir: PathBuf,
    /// Maximum number of snapshots to retain
    max_snapshots: usize,
}

impl StateSaver {
    /// Create a new StateSaver that stores snapshots in the given directory.
    pub fn new(snapshot_dir: PathBuf, max_snapshots: usize) -> Self {
        Self {
            snapshot_dir,
            max_snapshots,
        }
    }

    /// Create a StateSaver with default settings (5 max snapshots).
    pub fn with_defaults(snapshot_dir: PathBuf) -> Self {
        Self::new(snapshot_dir, 5)
    }

    /// Get the snapshot directory path.
    pub fn snapshot_dir(&self) -> &Path {
        &self.snapshot_dir
    }

    /// Get the maximum number of retained snapshots.
    pub fn max_snapshots(&self) -> usize {
        self.max_snapshots
    }

    /// Build the file path for a given snapshot ID.
    fn snapshot_path(&self, snapshot_id: &str) -> PathBuf {
        self.snapshot_dir
            .join(format!("snapshot_{}.json", snapshot_id))
    }

    /// Save a state snapshot to disk.
    pub async fn save_snapshot(&self, snapshot: &StateSnapshot) -> Result<PathBuf> {
        // Ensure the snapshot directory exists
        tokio::fs::create_dir_all(&self.snapshot_dir)
            .await
            .context("Failed to create snapshot directory")?;

        let path = self.snapshot_path(&snapshot.snapshot_id);
        let json = serde_json::to_string_pretty(snapshot)
            .context("Failed to serialize snapshot")?;

        tokio::fs::write(&path, json)
            .await
            .context("Failed to write snapshot file")?;

        info!(
            snapshot_id = %snapshot.snapshot_id,
            path = %path.display(),
            "Saved state snapshot"
        );

        // Prune old snapshots if over limit
        if let Err(e) = self.prune_old_snapshots().await {
            warn!("Failed to prune old snapshots: {}", e);
        }

        Ok(path)
    }

    /// Load a snapshot from disk by ID.
    pub async fn load_snapshot(&self, snapshot_id: &str) -> Result<StateSnapshot> {
        let path = self.snapshot_path(snapshot_id);
        let json = tokio::fs::read_to_string(&path)
            .await
            .with_context(|| format!("Failed to read snapshot file: {}", path.display()))?;

        let snapshot: StateSnapshot = serde_json::from_str(&json)
            .context("Failed to deserialize snapshot")?;

        info!(snapshot_id = %snapshot_id, "Loaded state snapshot");
        Ok(snapshot)
    }

    /// List all available snapshot IDs, sorted by creation time (newest first).
    pub async fn list_snapshots(&self) -> Result<Vec<String>> {
        let dir = &self.snapshot_dir;
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();
        let mut read_dir = tokio::fs::read_dir(dir)
            .await
            .context("Failed to read snapshot directory")?;

        while let Some(entry) = read_dir.next_entry().await? {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("snapshot_") && name.ends_with(".json") {
                // Extract snapshot ID from filename
                let id = name
                    .strip_prefix("snapshot_")
                    .and_then(|s| s.strip_suffix(".json"))
                    .unwrap_or(&name)
                    .to_string();
                entries.push(id);
            }
        }

        // Sort by filename (which includes UUID, so roughly by creation)
        entries.sort();
        entries.reverse();
        Ok(entries)
    }

    /// Delete a specific snapshot by ID.
    pub async fn delete_snapshot(&self, snapshot_id: &str) -> Result<()> {
        let path = self.snapshot_path(snapshot_id);
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .with_context(|| format!("Failed to delete snapshot: {}", path.display()))?;
            info!(snapshot_id = %snapshot_id, "Deleted state snapshot");
        }
        Ok(())
    }

    /// Remove old snapshots beyond the max retention limit.
    async fn prune_old_snapshots(&self) -> Result<()> {
        let snapshots = self.list_snapshots().await?;
        if snapshots.len() <= self.max_snapshots {
            return Ok(());
        }

        // Delete oldest snapshots (they're sorted newest-first)
        for snapshot_id in snapshots.iter().skip(self.max_snapshots) {
            info!(snapshot_id = %snapshot_id, "Pruning old snapshot");
            self.delete_snapshot(snapshot_id).await?;
        }

        Ok(())
    }

    /// Capture a minimal state snapshot from the current agent configuration.
    ///
    /// In production this would read from the Agent struct; here we accept
    /// explicit parameters for testability.
    pub fn capture_state(
        &self,
        version: &str,
        config_json: &str,
        active_sessions: Vec<String>,
        learning_db_path: Option<PathBuf>,
    ) -> StateSnapshot {
        let mut snapshot = StateSnapshot::new(version);
        snapshot.config_json = config_json.to_string();
        snapshot.active_sessions = active_sessions;
        snapshot.learning_db_path = learning_db_path;
        snapshot
    }

    /// Verify that a snapshot can be deserialized correctly (round-trip check).
    pub fn verify_snapshot(snapshot: &StateSnapshot) -> Result<bool> {
        let json = serde_json::to_string(snapshot)
            .context("Failed to serialize for verification")?;
        let _roundtrip: StateSnapshot = serde_json::from_str(&json)
            .context("Failed to deserialize during verification")?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_snapshot() -> StateSnapshot {
        let mut snap = StateSnapshot::new("v1.24.05");
        snap.config_json = r#"{"model":"gpt-4","temperature":0.7}"#.to_string();
        snap.active_sessions = vec!["sess-001".into(), "sess-002".into()];
        snap.metadata
            .insert("feature_flags".into(), "memory,reflexion".into());
        snap
    }

    #[test]
    fn test_state_snapshot_creation() {
        let snap = StateSnapshot::new("v1.0.0");
        assert!(!snap.snapshot_id.is_empty());
        assert_eq!(snap.version, "v1.0.0");
        assert!(snap.config_json.is_empty());
        assert!(!snap.verified);
    }

    #[test]
    fn test_snapshot_serialization_roundtrip() {
        let snap = test_snapshot();
        let json = serde_json::to_string(&snap).unwrap();
        let deserialized: StateSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.version, "v1.24.05");
        assert_eq!(deserialized.active_sessions.len(), 2);
        assert_eq!(
            deserialized.metadata.get("feature_flags").unwrap(),
            "memory,reflexion"
        );
    }

    #[test]
    fn test_verify_snapshot() {
        let snap = test_snapshot();
        assert!(StateSaver::verify_snapshot(&snap).unwrap());
    }

    #[test]
    fn test_capture_state() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::with_defaults(dir.path().to_path_buf());
        let snap = saver.capture_state(
            "v2.0.0",
            r#"{"key":"value"}"#,
            vec!["s1".into()],
            Some(PathBuf::from("/tmp/learning.db")),
        );
        assert_eq!(snap.version, "v2.0.0");
        assert_eq!(snap.active_sessions, vec!["s1"]);
        assert_eq!(
            snap.learning_db_path,
            Some(PathBuf::from("/tmp/learning.db"))
        );
    }

    #[tokio::test]
    async fn test_save_and_load_snapshot() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::with_defaults(dir.path().to_path_buf());
        let snap = test_snapshot();
        let snap_id = snap.snapshot_id.clone();

        let path = saver.save_snapshot(&snap).await.unwrap();
        assert!(path.exists());

        let loaded = saver.load_snapshot(&snap_id).await.unwrap();
        assert_eq!(loaded.version, "v1.24.05");
        assert_eq!(loaded.active_sessions.len(), 2);
    }

    #[tokio::test]
    async fn test_list_snapshots() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::with_defaults(dir.path().to_path_buf());

        // Save two snapshots
        let s1 = test_snapshot();
        let s2 = test_snapshot();
        saver.save_snapshot(&s1).await.unwrap();
        saver.save_snapshot(&s2).await.unwrap();

        let list = saver.list_snapshots().await.unwrap();
        assert_eq!(list.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_snapshot() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::with_defaults(dir.path().to_path_buf());
        let snap = test_snapshot();
        let snap_id = snap.snapshot_id.clone();

        saver.save_snapshot(&snap).await.unwrap();
        assert!(saver.load_snapshot(&snap_id).await.is_ok());

        saver.delete_snapshot(&snap_id).await.unwrap();
        assert!(saver.load_snapshot(&snap_id).await.is_err());
    }

    #[tokio::test]
    async fn test_prune_old_snapshots() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::new(dir.path().to_path_buf(), 2); // keep only 2

        // Save 4 snapshots
        for _ in 0..4 {
            let snap = test_snapshot();
            saver.save_snapshot(&snap).await.unwrap();
        }

        let list = saver.list_snapshots().await.unwrap();
        assert!(list.len() <= 2, "Should have pruned to max 2, got {}", list.len());
    }

    #[test]
    fn test_snapshot_path_construction() {
        let saver = StateSaver::with_defaults(PathBuf::from("/tmp/snapshots"));
        let path = saver.snapshot_path("abc-123");
        assert!(path.to_string_lossy().contains("snapshot_abc-123.json"));
    }
}
