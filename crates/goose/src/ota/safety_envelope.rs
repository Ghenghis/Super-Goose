//! SafetyEnvelope — invariant checks wrapping all self-modification operations.
//!
//! Before and after any OTA self-modification, the safety envelope verifies
//! that critical project invariants still hold:
//!
//! - Required files exist (Cargo.toml, Cargo.lock, lib.rs)
//! - Cargo.toml is parseable
//! - Test count has not regressed below the baseline
//! - No regressions introduced (before vs. after counts)
//!
//! If any invariant fails, the modification must be rolled back.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{error, info, warn};

/// The type of invariant being checked.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum InvariantType {
    /// A required file must exist on disk.
    FileExists,
    /// Cargo.toml must be parseable.
    CargoValid,
    /// Test count must not drop below the baseline.
    TestCountStable,
    /// The binary must be runnable.
    BinaryRunnable,
    /// Configuration must be valid.
    ConfigValid,
    /// No test regressions (before count <= after count).
    NoRegressions,
}

impl std::fmt::Display for InvariantType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InvariantType::FileExists => write!(f, "file_exists"),
            InvariantType::CargoValid => write!(f, "cargo_valid"),
            InvariantType::TestCountStable => write!(f, "test_count_stable"),
            InvariantType::BinaryRunnable => write!(f, "binary_runnable"),
            InvariantType::ConfigValid => write!(f, "config_valid"),
            InvariantType::NoRegressions => write!(f, "no_regressions"),
        }
    }
}

/// Result of a single invariant check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvariantResult {
    /// What was checked.
    pub invariant_type: InvariantType,
    /// Whether the invariant holds.
    pub passed: bool,
    /// Human-readable explanation.
    pub message: String,
    /// When the check was performed.
    pub checked_at: DateTime<Utc>,
}

impl InvariantResult {
    /// Create a passing invariant result.
    pub fn pass(invariant_type: InvariantType, message: impl Into<String>) -> Self {
        Self {
            invariant_type,
            passed: true,
            message: message.into(),
            checked_at: Utc::now(),
        }
    }

    /// Create a failing invariant result.
    pub fn fail(invariant_type: InvariantType, message: impl Into<String>) -> Self {
        Self {
            invariant_type,
            passed: false,
            message: message.into(),
            checked_at: Utc::now(),
        }
    }
}

/// Aggregated report from running all invariant checks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyReport {
    /// Individual check results.
    pub results: Vec<InvariantResult>,
    /// Whether every invariant passed.
    pub all_passed: bool,
    /// When the report was generated.
    pub checked_at: DateTime<Utc>,
    /// Summary message.
    pub summary: String,
}

impl SafetyReport {
    /// Build a report from a list of invariant results.
    pub fn from_results(results: Vec<InvariantResult>) -> Self {
        let all_passed = results.iter().all(|r| r.passed);
        let passed_count = results.iter().filter(|r| r.passed).count();
        let total = results.len();

        let summary = if all_passed {
            format!("All {}/{} invariants passed", passed_count, total)
        } else {
            let failed: Vec<_> = results
                .iter()
                .filter(|r| !r.passed)
                .map(|r| r.invariant_type.to_string())
                .collect();
            format!(
                "{}/{} passed, FAILED: {}",
                passed_count,
                total,
                failed.join(", ")
            )
        };

        Self {
            results,
            all_passed,
            checked_at: Utc::now(),
            summary,
        }
    }

    /// Count of passing checks.
    pub fn passed_count(&self) -> usize {
        self.results.iter().filter(|r| r.passed).count()
    }

    /// Count of failing checks.
    pub fn failed_count(&self) -> usize {
        self.results.iter().filter(|r| !r.passed).count()
    }
}

/// Wraps all self-modification operations with invariant checks.
pub struct SafetyEnvelope {
    /// Root directory of the workspace.
    workspace_root: PathBuf,
    /// Files that must exist for the project to be valid.
    required_files: Vec<String>,
    /// Minimum number of tests that must pass (baseline).
    min_test_count: u32,
    /// Last generated safety report.
    last_report: Option<SafetyReport>,
}

impl SafetyEnvelope {
    /// Create a new safety envelope for the given workspace.
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            workspace_root,
            required_files: vec![
                "Cargo.toml".to_string(),
                "Cargo.lock".to_string(),
                "crates/goose/src/lib.rs".to_string(),
            ],
            min_test_count: 1700,
            last_report: None,
        }
    }

    /// Run all invariant checks and produce a safety report.
    pub fn check_all(&mut self) -> SafetyReport {
        let mut results = Vec::new();

        // Check required files exist
        for file in &self.required_files.clone() {
            results.push(self.check_file_exists(file));
        }

        // Check Cargo.toml is parseable
        results.push(self.check_cargo_valid());

        let report = SafetyReport::from_results(results);

        if report.all_passed {
            info!(summary = %report.summary, "Safety envelope: all invariants passed");
        } else {
            error!(summary = %report.summary, "Safety envelope: invariant FAILURE");
        }

        self.last_report = Some(report.clone());
        report
    }

    /// Check whether a file exists relative to the workspace root.
    pub fn check_file_exists(&self, path: &str) -> InvariantResult {
        let full_path = self.workspace_root.join(path);
        if full_path.exists() {
            InvariantResult::pass(
                InvariantType::FileExists,
                format!("File exists: {}", path),
            )
        } else {
            InvariantResult::fail(
                InvariantType::FileExists,
                format!("File MISSING: {}", path),
            )
        }
    }

    /// Check that Cargo.toml exists and looks structurally valid.
    ///
    /// Performs a lightweight check: file is readable, non-empty, and contains
    /// the expected `[package]` section header. Does not pull in a full TOML
    /// parser dependency.
    pub fn check_cargo_valid(&self) -> InvariantResult {
        let cargo_path = self.workspace_root.join("Cargo.toml");
        match std::fs::read_to_string(&cargo_path) {
            Ok(contents) => {
                if contents.trim().is_empty() {
                    warn!("Cargo.toml is empty");
                    return InvariantResult::fail(
                        InvariantType::CargoValid,
                        "Cargo.toml is empty",
                    );
                }
                // Basic structural check: must contain [package] or [workspace]
                if contents.contains("[package]") || contents.contains("[workspace]") {
                    InvariantResult::pass(
                        InvariantType::CargoValid,
                        "Cargo.toml is readable and contains expected sections",
                    )
                } else {
                    warn!("Cargo.toml missing [package] or [workspace] section");
                    InvariantResult::fail(
                        InvariantType::CargoValid,
                        "Cargo.toml missing [package] or [workspace] section",
                    )
                }
            }
            Err(e) => InvariantResult::fail(
                InvariantType::CargoValid,
                format!("Cannot read Cargo.toml: {}", e),
            ),
        }
    }

    /// Check that the current test count is at or above the baseline.
    pub fn check_test_count_stable(&self, current_count: u32) -> InvariantResult {
        if current_count >= self.min_test_count {
            InvariantResult::pass(
                InvariantType::TestCountStable,
                format!(
                    "Test count {} >= baseline {}",
                    current_count, self.min_test_count
                ),
            )
        } else {
            InvariantResult::fail(
                InvariantType::TestCountStable,
                format!(
                    "Test count {} BELOW baseline {}",
                    current_count, self.min_test_count
                ),
            )
        }
    }

    /// Check that no regressions occurred (after >= before).
    pub fn check_no_regressions(&self, before: u32, after: u32) -> InvariantResult {
        if after >= before {
            InvariantResult::pass(
                InvariantType::NoRegressions,
                format!("No regressions: {} -> {}", before, after),
            )
        } else {
            let lost = before - after;
            InvariantResult::fail(
                InvariantType::NoRegressions,
                format!(
                    "REGRESSION: {} -> {} ({} tests lost)",
                    before, after, lost
                ),
            )
        }
    }

    /// Get the last generated safety report (if any).
    pub fn last_report(&self) -> Option<&SafetyReport> {
        self.last_report.as_ref()
    }

    /// Quick check: is it safe to proceed based on the last report?
    ///
    /// Returns false if no report has been generated yet.
    pub fn is_safe_to_proceed(&self) -> bool {
        self.last_report
            .as_ref()
            .map(|r| r.all_passed)
            .unwrap_or(false)
    }

    /// Get the workspace root path.
    pub fn workspace_root(&self) -> &PathBuf {
        &self.workspace_root
    }

    /// Get the minimum test count baseline.
    pub fn min_test_count(&self) -> u32 {
        self.min_test_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_file_exists_check_pass() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("test_file.rs");
        std::fs::write(&file_path, b"fn main() {}").unwrap();

        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());
        let result = envelope.check_file_exists("test_file.rs");
        assert!(result.passed);
        assert_eq!(result.invariant_type, InvariantType::FileExists);
        assert!(result.message.contains("exists"));
    }

    #[test]
    fn test_file_exists_check_fail() {
        let dir = TempDir::new().unwrap();
        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());
        let result = envelope.check_file_exists("nonexistent.rs");
        assert!(!result.passed);
        assert!(result.message.contains("MISSING"));
    }

    #[test]
    fn test_cargo_valid_check() {
        let dir = TempDir::new().unwrap();
        let cargo_path = dir.path().join("Cargo.toml");
        std::fs::write(
            &cargo_path,
            r#"
[package]
name = "test-project"
version = "0.1.0"
edition = "2021"
"#,
        )
        .unwrap();

        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());
        let result = envelope.check_cargo_valid();
        assert!(result.passed);
        assert_eq!(result.invariant_type, InvariantType::CargoValid);
    }

    #[test]
    fn test_cargo_invalid_check() {
        let dir = TempDir::new().unwrap();
        let cargo_path = dir.path().join("Cargo.toml");
        // File with content but no [package] or [workspace] section
        std::fs::write(&cargo_path, "this is not valid cargo content").unwrap();

        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());
        let result = envelope.check_cargo_valid();
        assert!(!result.passed);
        assert!(result.message.contains("missing"));
    }

    #[test]
    fn test_cargo_empty_check() {
        let dir = TempDir::new().unwrap();
        let cargo_path = dir.path().join("Cargo.toml");
        std::fs::write(&cargo_path, "").unwrap();

        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());
        let result = envelope.check_cargo_valid();
        assert!(!result.passed);
        assert!(result.message.contains("empty"));
    }

    #[test]
    fn test_test_count_stable() {
        let dir = TempDir::new().unwrap();
        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());

        // Above baseline
        let result = envelope.check_test_count_stable(1800);
        assert!(result.passed);
        assert!(result.message.contains("1800"));

        // Exactly at baseline
        let result = envelope.check_test_count_stable(1700);
        assert!(result.passed);
    }

    #[test]
    fn test_test_count_regression() {
        let dir = TempDir::new().unwrap();
        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());

        let result = envelope.check_test_count_stable(1500);
        assert!(!result.passed);
        assert!(result.message.contains("BELOW"));
    }

    #[test]
    fn test_no_regressions_pass() {
        let dir = TempDir::new().unwrap();
        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());

        // Same count
        let result = envelope.check_no_regressions(100, 100);
        assert!(result.passed);

        // Increased count
        let result = envelope.check_no_regressions(100, 110);
        assert!(result.passed);
        assert!(result.message.contains("100 -> 110"));
    }

    #[test]
    fn test_no_regressions_fail() {
        let dir = TempDir::new().unwrap();
        let envelope = SafetyEnvelope::new(dir.path().to_path_buf());

        let result = envelope.check_no_regressions(100, 95);
        assert!(!result.passed);
        assert!(result.message.contains("REGRESSION"));
        assert!(result.message.contains("5 tests lost"));
    }

    #[test]
    fn test_safety_report_summary() {
        // All pass
        let results = vec![
            InvariantResult::pass(InvariantType::FileExists, "ok"),
            InvariantResult::pass(InvariantType::CargoValid, "ok"),
        ];
        let report = SafetyReport::from_results(results);
        assert!(report.all_passed);
        assert_eq!(report.passed_count(), 2);
        assert_eq!(report.failed_count(), 0);
        assert!(report.summary.contains("2/2"));

        // Some fail
        let results = vec![
            InvariantResult::pass(InvariantType::FileExists, "ok"),
            InvariantResult::fail(InvariantType::CargoValid, "broken"),
            InvariantResult::pass(InvariantType::TestCountStable, "ok"),
        ];
        let report = SafetyReport::from_results(results);
        assert!(!report.all_passed);
        assert_eq!(report.passed_count(), 2);
        assert_eq!(report.failed_count(), 1);
        assert!(report.summary.contains("FAILED"));
        assert!(report.summary.contains("cargo_valid"));
    }

    #[test]
    fn test_is_safe_to_proceed() {
        let dir = TempDir::new().unwrap();

        // Create the required files so check_all passes
        std::fs::write(dir.path().join("Cargo.toml"), "[package]\nname = \"t\"\nversion = \"0.1.0\"\nedition = \"2021\"").unwrap();
        std::fs::write(dir.path().join("Cargo.lock"), "").unwrap();
        let nested = dir.path().join("crates").join("goose").join("src");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("lib.rs"), "").unwrap();

        let mut envelope = SafetyEnvelope::new(dir.path().to_path_buf());

        // No report yet
        assert!(!envelope.is_safe_to_proceed());

        // Run checks — all files present, Cargo.toml valid
        envelope.check_all();
        assert!(envelope.is_safe_to_proceed());
        assert!(envelope.last_report().is_some());
    }

    #[test]
    fn test_is_safe_to_proceed_fails_missing_files() {
        let dir = TempDir::new().unwrap();
        // Don't create required files
        let mut envelope = SafetyEnvelope::new(dir.path().to_path_buf());
        envelope.check_all();
        assert!(!envelope.is_safe_to_proceed());
    }

    #[test]
    fn test_invariant_result_serialization() {
        let result = InvariantResult::pass(InvariantType::FileExists, "All good");
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: InvariantResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.invariant_type, InvariantType::FileExists);
        assert!(deserialized.passed);
    }

    #[test]
    fn test_safety_report_serialization() {
        let results = vec![
            InvariantResult::pass(InvariantType::FileExists, "ok"),
            InvariantResult::fail(InvariantType::NoRegressions, "regression"),
        ];
        let report = SafetyReport::from_results(results);
        let json = serde_json::to_string(&report).unwrap();
        let deserialized: SafetyReport = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.results.len(), 2);
        assert!(!deserialized.all_passed);
    }

    #[test]
    fn test_invariant_type_display() {
        assert_eq!(InvariantType::FileExists.to_string(), "file_exists");
        assert_eq!(InvariantType::CargoValid.to_string(), "cargo_valid");
        assert_eq!(InvariantType::TestCountStable.to_string(), "test_count_stable");
        assert_eq!(InvariantType::BinaryRunnable.to_string(), "binary_runnable");
        assert_eq!(InvariantType::ConfigValid.to_string(), "config_valid");
        assert_eq!(InvariantType::NoRegressions.to_string(), "no_regressions");
    }
}
