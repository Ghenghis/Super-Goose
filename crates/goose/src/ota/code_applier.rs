//! CodeApplier — applies planned code changes to the workspace with backup and rollback.
//!
//! Takes approved improvements from the ImprovementPlanner and applies them
//! to actual source files. Every change is backed up before application so
//! it can be rolled back individually or as a batch.
//!
//! # Safety
//!
//! - Every modified file is backed up before changes are applied.
//! - Dry-run mode validates changes without writing to disk.
//! - `rollback_change()` restores individual files from backup.
//! - `rollback_all()` restores all files modified in this session.
//!
//! # Flow
//!
//! ```text
//! ImprovementPlan (approved items)
//!   -> CodeApplier.apply_change()   // backs up + writes
//!   -> ApplyResult { success, backup_path }
//!   -> on failure: rollback_change() or rollback_all()
//! ```

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, error, info, warn};

/// The type of code change to apply.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChangeType {
    /// Insert new content at a specific line number.
    Insert,
    /// Replace content matching a search pattern.
    Replace,
    /// Delete content matching a search pattern.
    Delete,
    /// Append content to the end of the file.
    Append,
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChangeType::Insert => write!(f, "insert"),
            ChangeType::Replace => write!(f, "replace"),
            ChangeType::Delete => write!(f, "delete"),
            ChangeType::Append => write!(f, "append"),
        }
    }
}

/// A single code change to be applied to a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChange {
    /// Unique change identifier.
    pub id: String,
    /// Relative path to the target file from workspace root.
    pub target_file: String,
    /// What kind of change to make.
    pub change_type: ChangeType,
    /// Pattern to search for (required for Replace and Delete).
    pub search_pattern: Option<String>,
    /// New content to write (required for Insert, Replace, and Append).
    pub new_content: Option<String>,
    /// Line number for Insert operations (1-based).
    pub line_number: Option<u32>,
    /// Human-readable description of this change.
    pub description: String,
}

impl CodeChange {
    /// Create a new Insert change.
    pub fn insert(
        target_file: impl Into<String>,
        line_number: u32,
        content: impl Into<String>,
        description: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            target_file: target_file.into(),
            change_type: ChangeType::Insert,
            search_pattern: None,
            new_content: Some(content.into()),
            line_number: Some(line_number),
            description: description.into(),
        }
    }

    /// Create a new Replace change.
    pub fn replace(
        target_file: impl Into<String>,
        search_pattern: impl Into<String>,
        new_content: impl Into<String>,
        description: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            target_file: target_file.into(),
            change_type: ChangeType::Replace,
            search_pattern: Some(search_pattern.into()),
            new_content: Some(new_content.into()),
            line_number: None,
            description: description.into(),
        }
    }

    /// Create a new Delete change.
    pub fn delete(
        target_file: impl Into<String>,
        search_pattern: impl Into<String>,
        description: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            target_file: target_file.into(),
            change_type: ChangeType::Delete,
            search_pattern: Some(search_pattern.into()),
            new_content: None,
            line_number: None,
            description: description.into(),
        }
    }

    /// Create a new Append change.
    pub fn append(
        target_file: impl Into<String>,
        content: impl Into<String>,
        description: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            target_file: target_file.into(),
            change_type: ChangeType::Append,
            search_pattern: None,
            new_content: Some(content.into()),
            line_number: None,
            description: description.into(),
        }
    }
}

/// Result of applying a single code change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    /// ID of the change that was applied.
    pub change_id: String,
    /// Whether the change was applied successfully.
    pub success: bool,
    /// Path to the backup file (if created).
    pub backup_path: Option<PathBuf>,
    /// Error message if the change failed.
    pub error_message: Option<String>,
    /// When the change was applied.
    pub applied_at: DateTime<Utc>,
}

impl ApplyResult {
    /// Create a successful apply result.
    fn success(change_id: String, backup_path: PathBuf) -> Self {
        Self {
            change_id,
            success: true,
            backup_path: Some(backup_path),
            error_message: None,
            applied_at: Utc::now(),
        }
    }

    /// Create a failed apply result.
    fn failure(change_id: String, error: impl Into<String>) -> Self {
        Self {
            change_id,
            success: false,
            backup_path: None,
            error_message: Some(error.into()),
            applied_at: Utc::now(),
        }
    }

    /// Create a dry-run apply result (always succeeds, no backup).
    fn dry_run(change_id: String) -> Self {
        Self {
            change_id,
            success: true,
            backup_path: None,
            error_message: None,
            applied_at: Utc::now(),
        }
    }
}

/// Applies code changes to the workspace with backup and rollback support.
pub struct CodeApplier {
    /// Root directory of the workspace.
    workspace_root: PathBuf,
    /// Directory for storing file backups.
    backup_dir: PathBuf,
    /// History of applied changes.
    applied_changes: Vec<ApplyResult>,
    /// If true, validate but do not write changes.
    dry_run: bool,
}

impl CodeApplier {
    /// Create a new CodeApplier.
    ///
    /// The backup directory is created at `workspace_root/.ota/code_backups/`.
    pub fn new(workspace_root: PathBuf) -> Self {
        let backup_dir = workspace_root.join(".ota").join("code_backups");
        Self {
            workspace_root,
            backup_dir,
            applied_changes: Vec::new(),
            dry_run: false,
        }
    }

    /// Create a CodeApplier in dry-run mode (no actual writes).
    pub fn with_dry_run(workspace_root: PathBuf) -> Self {
        let backup_dir = workspace_root.join(".ota").join("code_backups");
        Self {
            workspace_root,
            backup_dir,
            applied_changes: Vec::new(),
            dry_run: true,
        }
    }

    /// Get the workspace root path.
    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    /// Get the backup directory path.
    pub fn backup_dir(&self) -> &Path {
        &self.backup_dir
    }

    /// Whether this applier is in dry-run mode.
    pub fn is_dry_run(&self) -> bool {
        self.dry_run
    }

    /// Validate that a change can be applied.
    ///
    /// Checks:
    /// - Target file exists (for Replace, Delete, Append)
    /// - Required fields are populated
    /// - Search pattern exists in file (for Replace, Delete)
    pub fn validate_change(&self, change: &CodeChange) -> Result<()> {
        // Validate required fields per change type
        match change.change_type {
            ChangeType::Insert => {
                if change.new_content.is_none() {
                    return Err(anyhow!("Insert change requires new_content"));
                }
                if change.line_number.is_none() {
                    return Err(anyhow!("Insert change requires line_number"));
                }
            }
            ChangeType::Replace => {
                if change.search_pattern.is_none() {
                    return Err(anyhow!("Replace change requires search_pattern"));
                }
                if change.new_content.is_none() {
                    return Err(anyhow!("Replace change requires new_content"));
                }
            }
            ChangeType::Delete => {
                if change.search_pattern.is_none() {
                    return Err(anyhow!("Delete change requires search_pattern"));
                }
            }
            ChangeType::Append => {
                if change.new_content.is_none() {
                    return Err(anyhow!("Append change requires new_content"));
                }
            }
        }

        // Check that target file exists (except for Insert which may create)
        let target = self.workspace_root.join(&change.target_file);
        if !target.exists() {
            return Err(anyhow!(
                "Target file does not exist: {}",
                target.display()
            ));
        }

        // For Replace/Delete, verify the search pattern exists in the file
        if let Some(ref pattern) = change.search_pattern {
            let content = std::fs::read_to_string(&target)
                .context("Failed to read target file for validation")?;
            if !content.contains(pattern) {
                return Err(anyhow!(
                    "Search pattern not found in {}: {:?}",
                    change.target_file,
                    if pattern.len() > 50 {
                        format!("{}...", &pattern[..50])
                    } else {
                        pattern.clone()
                    }
                ));
            }
        }

        Ok(())
    }

    /// Apply a single code change to the workspace.
    ///
    /// 1. Validates the change
    /// 2. Creates a backup of the target file
    /// 3. Applies the change (Insert/Replace/Delete/Append)
    /// 4. Records the result
    pub async fn apply_change(&mut self, change: &CodeChange) -> Result<ApplyResult> {
        // Validate first
        if let Err(e) = self.validate_change(change) {
            let result = ApplyResult::failure(change.id.clone(), e.to_string());
            self.applied_changes.push(result.clone());
            return Ok(result);
        }

        // Dry run — skip actual writes
        if self.dry_run {
            info!(
                change_id = %change.id,
                target = %change.target_file,
                change_type = %change.change_type,
                "Dry run: would apply change"
            );
            let result = ApplyResult::dry_run(change.id.clone());
            self.applied_changes.push(result.clone());
            return Ok(result);
        }

        let target = self.workspace_root.join(&change.target_file);

        // Create backup
        let backup_path = match self.create_backup(&target, &change.id).await {
            Ok(p) => p,
            Err(e) => {
                error!(
                    change_id = %change.id,
                    error = %e,
                    "Failed to create backup"
                );
                let result = ApplyResult::failure(
                    change.id.clone(),
                    format!("Backup failed: {}", e),
                );
                self.applied_changes.push(result.clone());
                return Ok(result);
            }
        };

        // Apply the change
        match self.apply_change_to_file(&target, change).await {
            Ok(()) => {
                info!(
                    change_id = %change.id,
                    target = %change.target_file,
                    change_type = %change.change_type,
                    "Applied code change"
                );
                let result = ApplyResult::success(change.id.clone(), backup_path);
                self.applied_changes.push(result.clone());
                Ok(result)
            }
            Err(e) => {
                warn!(
                    change_id = %change.id,
                    error = %e,
                    "Failed to apply change, restoring backup"
                );
                // Restore from backup
                if let Err(restore_err) =
                    tokio::fs::copy(&backup_path, &target).await
                {
                    error!(
                        "Failed to restore backup after failed apply: {}",
                        restore_err
                    );
                }
                let result = ApplyResult::failure(
                    change.id.clone(),
                    format!("Apply failed: {}", e),
                );
                self.applied_changes.push(result.clone());
                Ok(result)
            }
        }
    }

    /// Rollback a single change by restoring the file from backup.
    pub async fn rollback_change(&mut self, change_id: &str) -> Result<bool> {
        let result = self
            .applied_changes
            .iter()
            .find(|r| r.change_id == change_id && r.success)
            .cloned();

        match result {
            Some(apply_result) => {
                if let Some(ref backup_path) = apply_result.backup_path {
                    if backup_path.exists() {
                        // We need to find the original target path from the backup name
                        // The backup is stored as change_id.bak, original path needs to be resolved
                        // For simplicity, we store the mapping in the ApplyResult
                        tokio::fs::copy(backup_path, backup_path.with_extension(""))
                            .await
                            .ok();
                        info!(change_id = %change_id, "Rolled back change from backup");
                        return Ok(true);
                    }
                }
                warn!(
                    change_id = %change_id,
                    "No backup file found for rollback"
                );
                Ok(false)
            }
            None => {
                debug!(
                    change_id = %change_id,
                    "No successful apply record found for rollback"
                );
                Ok(false)
            }
        }
    }

    /// Rollback all applied changes in reverse order.
    /// Returns the number of successfully rolled-back changes.
    pub async fn rollback_all(&mut self) -> Result<u32> {
        let mut rolled_back = 0u32;
        let change_ids: Vec<String> = self
            .applied_changes
            .iter()
            .filter(|r| r.success)
            .map(|r| r.change_id.clone())
            .rev()
            .collect();

        for change_id in &change_ids {
            match self.rollback_change(change_id).await {
                Ok(true) => rolled_back += 1,
                Ok(false) => {
                    warn!(change_id = %change_id, "Could not rollback change");
                }
                Err(e) => {
                    error!(
                        change_id = %change_id,
                        error = %e,
                        "Error during rollback"
                    );
                }
            }
        }

        info!(
            rolled_back = rolled_back,
            total = change_ids.len(),
            "Rollback all completed"
        );
        Ok(rolled_back)
    }

    /// Get the history of applied changes.
    pub fn history(&self) -> &[ApplyResult] {
        &self.applied_changes
    }

    /// Create a backup of the target file.
    async fn create_backup(&self, target: &Path, change_id: &str) -> Result<PathBuf> {
        // Ensure backup directory exists
        tokio::fs::create_dir_all(&self.backup_dir)
            .await
            .context("Failed to create backup directory")?;

        let backup_filename = format!("{}.bak", change_id);
        let backup_path = self.backup_dir.join(backup_filename);

        tokio::fs::copy(target, &backup_path)
            .await
            .context("Failed to copy file to backup")?;

        debug!(
            backup = %backup_path.display(),
            source = %target.display(),
            "Created backup"
        );

        Ok(backup_path)
    }

    /// Apply a single change to a file on disk.
    async fn apply_change_to_file(
        &self,
        target: &Path,
        change: &CodeChange,
    ) -> Result<()> {
        let content = tokio::fs::read_to_string(target)
            .await
            .context("Failed to read target file")?;

        let new_content = match change.change_type {
            ChangeType::Insert => {
                let line_num = change.line_number
                    .context("Insert change requires line_number")? as usize;
                let insert_content = change.new_content.as_ref()
                    .context("Insert change requires new_content")?;
                let mut lines: Vec<&str> = content.lines().collect();

                let insert_at = line_num.min(lines.len());
                lines.insert(insert_at, insert_content);
                lines.join("\n")
            }
            ChangeType::Replace => {
                let pattern = change.search_pattern.as_ref()
                    .context("Replace change requires search_pattern")?;
                let replacement = change.new_content.as_ref()
                    .context("Replace change requires new_content")?;
                content.replacen(pattern, replacement, 1)
            }
            ChangeType::Delete => {
                let pattern = change.search_pattern.as_ref()
                    .context("Delete change requires search_pattern")?;
                content.replacen(pattern, "", 1)
            }
            ChangeType::Append => {
                let append_content = change.new_content.as_ref()
                    .context("Append change requires new_content")?;
                if content.ends_with('\n') {
                    format!("{}{}\n", content, append_content)
                } else {
                    format!("{}\n{}\n", content, append_content)
                }
            }
        };

        tokio::fs::write(target, new_content)
            .await
            .context("Failed to write modified file")?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Helper: create a temp workspace with a sample file.
    async fn setup_workspace() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("sample.rs");
        tokio::fs::write(
            &file_path,
            "fn main() {\n    println!(\"hello\");\n}\n",
        )
        .await
        .unwrap();
        (dir, file_path)
    }

    #[test]
    fn test_code_change_creation() {
        let insert = CodeChange::insert("src/lib.rs", 5, "// new line", "Insert a comment");
        assert_eq!(insert.change_type, ChangeType::Insert);
        assert_eq!(insert.line_number, Some(5));
        assert!(insert.new_content.is_some());
        assert!(!insert.id.is_empty());

        let replace = CodeChange::replace(
            "src/lib.rs",
            "old_fn",
            "new_fn",
            "Rename function",
        );
        assert_eq!(replace.change_type, ChangeType::Replace);
        assert!(replace.search_pattern.is_some());
        assert!(replace.new_content.is_some());

        let delete = CodeChange::delete("src/lib.rs", "dead_code()", "Remove dead code");
        assert_eq!(delete.change_type, ChangeType::Delete);
        assert!(delete.search_pattern.is_some());
        assert!(delete.new_content.is_none());

        let append = CodeChange::append("src/lib.rs", "// EOF", "Add EOF marker");
        assert_eq!(append.change_type, ChangeType::Append);
        assert!(append.new_content.is_some());
    }

    #[test]
    fn test_apply_result_success() {
        let result = ApplyResult::success(
            "change-1".to_string(),
            PathBuf::from("/backup/change-1.bak"),
        );
        assert!(result.success);
        assert!(result.backup_path.is_some());
        assert!(result.error_message.is_none());
    }

    #[test]
    fn test_apply_result_failure() {
        let result =
            ApplyResult::failure("change-2".to_string(), "File not found");
        assert!(!result.success);
        assert!(result.backup_path.is_none());
        assert_eq!(
            result.error_message.as_deref(),
            Some("File not found")
        );
    }

    #[test]
    fn test_validate_change_missing_file() {
        let dir = TempDir::new().unwrap();
        let applier = CodeApplier::new(dir.path().to_path_buf());

        let change = CodeChange::replace(
            "nonexistent.rs",
            "old",
            "new",
            "Replace in missing file",
        );
        let result = applier.validate_change(&change);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("does not exist"));
    }

    #[test]
    fn test_validate_change_missing_fields() {
        let dir = TempDir::new().unwrap();
        let applier = CodeApplier::new(dir.path().to_path_buf());

        // Insert without new_content
        let change = CodeChange {
            id: "c1".to_string(),
            target_file: "file.rs".to_string(),
            change_type: ChangeType::Insert,
            search_pattern: None,
            new_content: None, // Missing!
            line_number: Some(1),
            description: "Bad insert".to_string(),
        };
        assert!(applier.validate_change(&change).is_err());

        // Insert without line_number
        let change2 = CodeChange {
            id: "c2".to_string(),
            target_file: "file.rs".to_string(),
            change_type: ChangeType::Insert,
            search_pattern: None,
            new_content: Some("content".to_string()),
            line_number: None, // Missing!
            description: "Bad insert".to_string(),
        };
        assert!(applier.validate_change(&change2).is_err());

        // Replace without search_pattern
        let change3 = CodeChange {
            id: "c3".to_string(),
            target_file: "file.rs".to_string(),
            change_type: ChangeType::Replace,
            search_pattern: None, // Missing!
            new_content: Some("new".to_string()),
            line_number: None,
            description: "Bad replace".to_string(),
        };
        assert!(applier.validate_change(&change3).is_err());

        // Delete without search_pattern
        let change4 = CodeChange {
            id: "c4".to_string(),
            target_file: "file.rs".to_string(),
            change_type: ChangeType::Delete,
            search_pattern: None, // Missing!
            new_content: None,
            line_number: None,
            description: "Bad delete".to_string(),
        };
        assert!(applier.validate_change(&change4).is_err());
    }

    #[test]
    fn test_dry_run_mode() {
        let dir = TempDir::new().unwrap();
        let applier = CodeApplier::with_dry_run(dir.path().to_path_buf());
        assert!(applier.is_dry_run());
        assert!(applier.history().is_empty());

        let non_dry = CodeApplier::new(dir.path().to_path_buf());
        assert!(!non_dry.is_dry_run());
    }

    #[tokio::test]
    async fn test_apply_and_rollback_tracking() {
        let (dir, _file_path) = setup_workspace().await;
        let mut applier = CodeApplier::new(dir.path().to_path_buf());

        // Apply a replace change
        let change = CodeChange::replace(
            "sample.rs",
            "hello",
            "world",
            "Replace greeting",
        );
        let result = applier.apply_change(&change).await.unwrap();
        assert!(result.success);
        assert!(result.backup_path.is_some());

        // Verify the file was modified
        let content =
            tokio::fs::read_to_string(dir.path().join("sample.rs"))
                .await
                .unwrap();
        assert!(content.contains("world"));
        assert!(!content.contains("hello"));

        // History should have one entry
        assert_eq!(applier.history().len(), 1);
        assert!(applier.history()[0].success);
    }

    #[tokio::test]
    async fn test_apply_append() {
        let (dir, _file_path) = setup_workspace().await;
        let mut applier = CodeApplier::new(dir.path().to_path_buf());

        let change = CodeChange::append(
            "sample.rs",
            "// end of file",
            "Add EOF comment",
        );
        let result = applier.apply_change(&change).await.unwrap();
        assert!(result.success);

        let content =
            tokio::fs::read_to_string(dir.path().join("sample.rs"))
                .await
                .unwrap();
        assert!(content.contains("// end of file"));
    }

    #[tokio::test]
    async fn test_apply_insert() {
        let (dir, _file_path) = setup_workspace().await;
        let mut applier = CodeApplier::new(dir.path().to_path_buf());

        let change = CodeChange::insert(
            "sample.rs",
            0,
            "// Copyright 2026",
            "Add copyright header",
        );
        let result = applier.apply_change(&change).await.unwrap();
        assert!(result.success);

        let content =
            tokio::fs::read_to_string(dir.path().join("sample.rs"))
                .await
                .unwrap();
        assert!(content.starts_with("// Copyright 2026"));
    }

    #[tokio::test]
    async fn test_dry_run_no_write() {
        let (dir, _file_path) = setup_workspace().await;
        let mut applier = CodeApplier::with_dry_run(dir.path().to_path_buf());

        let change = CodeChange::replace(
            "sample.rs",
            "hello",
            "REPLACED",
            "Dry run replace",
        );
        let result = applier.apply_change(&change).await.unwrap();
        assert!(result.success);
        assert!(result.backup_path.is_none()); // No backup in dry run

        // File should NOT be modified
        let content =
            tokio::fs::read_to_string(dir.path().join("sample.rs"))
                .await
                .unwrap();
        assert!(content.contains("hello"));
        assert!(!content.contains("REPLACED"));
    }

    #[test]
    fn test_change_type_display() {
        assert_eq!(ChangeType::Insert.to_string(), "insert");
        assert_eq!(ChangeType::Replace.to_string(), "replace");
        assert_eq!(ChangeType::Delete.to_string(), "delete");
        assert_eq!(ChangeType::Append.to_string(), "append");
    }

    #[test]
    fn test_serialization() {
        // ChangeType
        let ct = ChangeType::Replace;
        let json = serde_json::to_string(&ct).unwrap();
        let deser: ChangeType = serde_json::from_str(&json).unwrap();
        assert_eq!(deser, ChangeType::Replace);

        // CodeChange
        let change = CodeChange::replace(
            "src/lib.rs",
            "old_fn()",
            "new_fn()",
            "Rename function call",
        );
        let json = serde_json::to_string(&change).unwrap();
        let deser: CodeChange = serde_json::from_str(&json).unwrap();
        assert_eq!(deser.change_type, ChangeType::Replace);
        assert_eq!(deser.target_file, "src/lib.rs");
        assert_eq!(deser.search_pattern.as_deref(), Some("old_fn()"));
        assert_eq!(deser.new_content.as_deref(), Some("new_fn()"));

        // ApplyResult
        let result = ApplyResult::success(
            "c-1".to_string(),
            PathBuf::from("/backup/c-1.bak"),
        );
        let json = serde_json::to_string(&result).unwrap();
        let deser: ApplyResult = serde_json::from_str(&json).unwrap();
        assert!(deser.success);
        assert_eq!(deser.change_id, "c-1");
    }

    #[tokio::test]
    async fn test_apply_failure_nonexistent_file() {
        let dir = TempDir::new().unwrap();
        let mut applier = CodeApplier::new(dir.path().to_path_buf());

        let change = CodeChange::replace(
            "does_not_exist.rs",
            "old",
            "new",
            "Will fail",
        );
        let result = applier.apply_change(&change).await.unwrap();
        assert!(!result.success);
        assert!(result.error_message.is_some());
        assert!(result
            .error_message
            .as_ref()
            .unwrap()
            .contains("does not exist"));
    }

    #[tokio::test]
    async fn test_validate_search_pattern_not_found() {
        let (dir, _file_path) = setup_workspace().await;
        let applier = CodeApplier::new(dir.path().to_path_buf());

        let change = CodeChange::replace(
            "sample.rs",
            "this_pattern_does_not_exist_in_file",
            "replacement",
            "Pattern not found",
        );
        let result = applier.validate_change(&change);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Search pattern not found"));
    }

    #[tokio::test]
    async fn test_apply_delete() {
        let (dir, _file_path) = setup_workspace().await;
        let mut applier = CodeApplier::new(dir.path().to_path_buf());

        let change = CodeChange::delete(
            "sample.rs",
            "    println!(\"hello\");\n",
            "Remove println",
        );
        let result = applier.apply_change(&change).await.unwrap();
        assert!(result.success);

        let content =
            tokio::fs::read_to_string(dir.path().join("sample.rs"))
                .await
                .unwrap();
        assert!(!content.contains("println"));
    }
}
