//! HealthChecker — post-update validation for OTA builds.
//!
//! After a binary swap, runs a suite of health checks to verify the new
//! binary works correctly. Checks include: binary executes, tests pass,
//! API responds, and configuration loads.

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tracing::{error, info};

/// Individual health check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    /// Name of the check
    pub name: String,
    /// Whether the check passed
    pub passed: bool,
    /// Human-readable message
    pub message: String,
    /// How long the check took
    pub duration_secs: f64,
}

impl CheckResult {
    /// Create a passing check result.
    pub fn pass(name: impl Into<String>, message: impl Into<String>, duration_secs: f64) -> Self {
        Self {
            name: name.into(),
            passed: true,
            message: message.into(),
            duration_secs,
        }
    }

    /// Create a failing check result.
    pub fn fail(name: impl Into<String>, message: impl Into<String>, duration_secs: f64) -> Self {
        Self {
            name: name.into(),
            passed: false,
            message: message.into(),
            duration_secs,
        }
    }
}

/// Overall health report after running all checks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthReport {
    /// All check results
    pub checks: Vec<CheckResult>,
    /// Overall pass/fail
    pub healthy: bool,
    /// When the health check was performed
    pub checked_at: DateTime<Utc>,
    /// Total duration of all checks
    pub total_duration_secs: f64,
    /// Summary message
    pub summary: String,
}

impl HealthReport {
    /// Create a health report from a list of check results.
    pub fn from_checks(checks: Vec<CheckResult>) -> Self {
        let healthy = checks.iter().all(|c| c.passed);
        let total_duration: f64 = checks.iter().map(|c| c.duration_secs).sum();
        let passed = checks.iter().filter(|c| c.passed).count();
        let total = checks.len();

        let summary = if healthy {
            format!("All {}/{} health checks passed", passed, total)
        } else {
            let failed: Vec<_> = checks
                .iter()
                .filter(|c| !c.passed)
                .map(|c| c.name.as_str())
                .collect();
            format!(
                "{}/{} checks passed, failed: {}",
                passed,
                total,
                failed.join(", ")
            )
        };

        Self {
            checks,
            healthy,
            checked_at: Utc::now(),
            total_duration_secs: total_duration,
            summary,
        }
    }

    /// Get the number of passing checks.
    pub fn passed_count(&self) -> usize {
        self.checks.iter().filter(|c| c.passed).count()
    }

    /// Get the number of failing checks.
    pub fn failed_count(&self) -> usize {
        self.checks.iter().filter(|c| !c.passed).count()
    }
}

/// Which checks to run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckConfig {
    /// Path to the binary to check
    pub binary_path: PathBuf,
    /// Path to the workspace for running tests
    pub workspace_path: PathBuf,
    /// Whether to run cargo tests
    pub run_tests: bool,
    /// Whether to check binary version output
    pub check_version: bool,
    /// Whether to check API health endpoint
    pub check_api: bool,
    /// API URL to check (if check_api is true)
    pub api_url: Option<String>,
    /// Timeout for each individual check
    pub check_timeout: Duration,
    /// Package to test (if run_tests is true)
    pub test_package: Option<String>,
    /// Test filter pattern
    pub test_filter: Option<String>,
}

impl HealthCheckConfig {
    /// Create a minimal config that only checks binary existence.
    pub fn minimal(binary_path: PathBuf) -> Self {
        Self {
            binary_path,
            workspace_path: PathBuf::from("."),
            run_tests: false,
            check_version: true,
            check_api: false,
            api_url: None,
            check_timeout: Duration::from_secs(30),
            test_package: None,
            test_filter: None,
        }
    }

    /// Create a full config with all checks enabled.
    pub fn full(binary_path: PathBuf, workspace_path: PathBuf) -> Self {
        Self {
            binary_path,
            workspace_path,
            run_tests: true,
            check_version: true,
            check_api: false,
            api_url: None,
            check_timeout: Duration::from_secs(120),
            test_package: Some("goose".to_string()),
            test_filter: None,
        }
    }
}

/// Runs health checks on a newly built/swapped binary.
pub struct HealthChecker {
    config: HealthCheckConfig,
}

impl HealthChecker {
    /// Create a new HealthChecker with the given configuration.
    pub fn new(config: HealthCheckConfig) -> Self {
        Self { config }
    }

    /// Get the configuration.
    pub fn config(&self) -> &HealthCheckConfig {
        &self.config
    }

    /// Run all configured health checks and return a report.
    pub async fn run_all_checks(&self) -> Result<HealthReport> {
        let mut checks = Vec::new();

        // Always check binary exists
        checks.push(self.check_binary_exists().await);

        // Check binary size
        checks.push(self.check_binary_size().await);

        // Optional checks
        if self.config.check_version {
            checks.push(self.check_binary_version().await);
        }

        if self.config.run_tests {
            checks.push(self.check_cargo_tests().await);
        }

        if self.config.check_api {
            checks.push(self.check_api_health().await);
        }

        let report = HealthReport::from_checks(checks);

        if report.healthy {
            info!(summary = %report.summary, "Health check passed");
        } else {
            error!(summary = %report.summary, "Health check FAILED");
        }

        Ok(report)
    }

    /// Check that the binary file exists and is not empty.
    async fn check_binary_exists(&self) -> CheckResult {
        let start = std::time::Instant::now();
        let path = &self.config.binary_path;

        if !path.exists() {
            return CheckResult::fail(
                "binary_exists",
                format!("Binary not found: {}", path.display()),
                start.elapsed().as_secs_f64(),
            );
        }

        CheckResult::pass(
            "binary_exists",
            format!("Binary found at: {}", path.display()),
            start.elapsed().as_secs_f64(),
        )
    }

    /// Check binary is a reasonable size (> 1KB, < 1GB).
    async fn check_binary_size(&self) -> CheckResult {
        let start = std::time::Instant::now();
        let path = &self.config.binary_path;

        match std::fs::metadata(path) {
            Ok(meta) => {
                let size = meta.len();
                if size < 1024 {
                    CheckResult::fail(
                        "binary_size",
                        format!("Binary too small: {} bytes", size),
                        start.elapsed().as_secs_f64(),
                    )
                } else if size > 1_073_741_824 {
                    CheckResult::fail(
                        "binary_size",
                        format!("Binary suspiciously large: {} bytes", size),
                        start.elapsed().as_secs_f64(),
                    )
                } else {
                    CheckResult::pass(
                        "binary_size",
                        format!("Binary size OK: {} bytes", size),
                        start.elapsed().as_secs_f64(),
                    )
                }
            }
            Err(e) => CheckResult::fail(
                "binary_size",
                format!("Cannot read binary metadata: {}", e),
                start.elapsed().as_secs_f64(),
            ),
        }
    }

    /// Check that the binary responds to `--version`.
    async fn check_binary_version(&self) -> CheckResult {
        let start = std::time::Instant::now();
        let path = &self.config.binary_path;

        match tokio::process::Command::new(path)
            .arg("--version")
            .output()
            .await
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if output.status.success() {
                    CheckResult::pass(
                        "binary_version",
                        format!("Version output: {}", stdout.trim()),
                        start.elapsed().as_secs_f64(),
                    )
                } else {
                    CheckResult::fail(
                        "binary_version",
                        "Binary exited with non-zero status on --version",
                        start.elapsed().as_secs_f64(),
                    )
                }
            }
            Err(e) => CheckResult::fail(
                "binary_version",
                format!("Failed to execute binary: {}", e),
                start.elapsed().as_secs_f64(),
            ),
        }
    }

    /// Run cargo tests for the specified package.
    async fn check_cargo_tests(&self) -> CheckResult {
        let start = std::time::Instant::now();

        let mut cmd = tokio::process::Command::new("cargo");
        cmd.arg("test").arg("--lib");

        if let Some(pkg) = &self.config.test_package {
            cmd.args(["-p", pkg]);
        }

        if let Some(filter) = &self.config.test_filter {
            cmd.arg("--").arg(filter);
        }

        cmd.current_dir(&self.config.workspace_path);

        match cmd.output().await {
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if output.status.success() {
                    CheckResult::pass(
                        "cargo_tests",
                        "All tests passed",
                        start.elapsed().as_secs_f64(),
                    )
                } else {
                    CheckResult::fail(
                        "cargo_tests",
                        format!("Tests failed: {}", stderr.lines().last().unwrap_or("")),
                        start.elapsed().as_secs_f64(),
                    )
                }
            }
            Err(e) => CheckResult::fail(
                "cargo_tests",
                format!("Failed to run tests: {}", e),
                start.elapsed().as_secs_f64(),
            ),
        }
    }

    /// Check API health endpoint responds.
    async fn check_api_health(&self) -> CheckResult {
        let start = std::time::Instant::now();

        let url = match &self.config.api_url {
            Some(url) => url.clone(),
            None => {
                // Respect GOOSE_SERVER__PORT if set; otherwise fall back to 3284.
                let port = std::env::var("GOOSE_SERVER__PORT").unwrap_or_else(|_| "3284".into());
                format!("http://localhost:{}/health", port)
            }
        };

        match reqwest::Client::new()
            .get(&url)
            .timeout(self.config.check_timeout)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    CheckResult::pass(
                        "api_health",
                        format!("API responded with status {}", response.status()),
                        start.elapsed().as_secs_f64(),
                    )
                } else {
                    CheckResult::fail(
                        "api_health",
                        format!("API returned status {}", response.status()),
                        start.elapsed().as_secs_f64(),
                    )
                }
            }
            Err(e) => CheckResult::fail(
                "api_health",
                format!("API unreachable: {}", e),
                start.elapsed().as_secs_f64(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_check_result_pass() {
        let r = CheckResult::pass("test_check", "All good", 0.5);
        assert!(r.passed);
        assert_eq!(r.name, "test_check");
        assert_eq!(r.message, "All good");
        assert_eq!(r.duration_secs, 0.5);
    }

    #[test]
    fn test_check_result_fail() {
        let r = CheckResult::fail("test_check", "Something broke", 1.0);
        assert!(!r.passed);
        assert_eq!(r.name, "test_check");
    }

    #[test]
    fn test_health_report_all_pass() {
        let checks = vec![
            CheckResult::pass("a", "ok", 0.1),
            CheckResult::pass("b", "ok", 0.2),
            CheckResult::pass("c", "ok", 0.3),
        ];
        let report = HealthReport::from_checks(checks);
        assert!(report.healthy);
        assert_eq!(report.passed_count(), 3);
        assert_eq!(report.failed_count(), 0);
        assert!(report.summary.contains("3/3"));
    }

    #[test]
    fn test_health_report_some_fail() {
        let checks = vec![
            CheckResult::pass("a", "ok", 0.1),
            CheckResult::fail("b", "broken", 0.2),
            CheckResult::pass("c", "ok", 0.3),
        ];
        let report = HealthReport::from_checks(checks);
        assert!(!report.healthy);
        assert_eq!(report.passed_count(), 2);
        assert_eq!(report.failed_count(), 1);
        assert!(report.summary.contains("b"));
    }

    #[test]
    fn test_health_report_empty() {
        let report = HealthReport::from_checks(Vec::new());
        assert!(report.healthy); // vacuously true
        assert_eq!(report.passed_count(), 0);
        assert_eq!(report.total_duration_secs, 0.0);
    }

    #[test]
    fn test_health_report_serialization() {
        let checks = vec![
            CheckResult::pass("check1", "passed", 0.5),
            CheckResult::fail("check2", "failed", 1.0),
        ];
        let report = HealthReport::from_checks(checks);
        let json = serde_json::to_string(&report).unwrap();
        let deserialized: HealthReport = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.checks.len(), 2);
        assert!(!deserialized.healthy);
    }

    #[test]
    fn test_health_check_config_minimal() {
        let config = HealthCheckConfig::minimal(PathBuf::from("/usr/bin/goose"));
        assert!(!config.run_tests);
        assert!(config.check_version);
        assert!(!config.check_api);
        assert_eq!(config.check_timeout, Duration::from_secs(30));
    }

    #[test]
    fn test_health_check_config_full() {
        let config = HealthCheckConfig::full(
            PathBuf::from("/usr/bin/goose"),
            PathBuf::from("/workspace"),
        );
        assert!(config.run_tests);
        assert!(config.check_version);
        assert_eq!(config.test_package.as_deref(), Some("goose"));
    }

    #[tokio::test]
    async fn test_check_binary_exists_present() {
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("test_binary");
        std::fs::write(&binary, b"binary content here").unwrap();

        let config = HealthCheckConfig::minimal(binary);
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_exists().await;
        assert!(result.passed);
    }

    #[tokio::test]
    async fn test_check_binary_exists_missing() {
        let config = HealthCheckConfig::minimal(PathBuf::from("/nonexistent/binary"));
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_exists().await;
        assert!(!result.passed);
    }

    #[tokio::test]
    async fn test_check_binary_size_ok() {
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("test_binary");
        // Write >1KB of data
        std::fs::write(&binary, vec![0u8; 2048]).unwrap();

        let config = HealthCheckConfig::minimal(binary);
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_size().await;
        assert!(result.passed);
    }

    #[tokio::test]
    async fn test_check_binary_size_too_small() {
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("tiny_binary");
        std::fs::write(&binary, b"tiny").unwrap();

        let config = HealthCheckConfig::minimal(binary);
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_size().await;
        assert!(!result.passed);
    }

    #[tokio::test]
    async fn test_run_all_checks_no_binary() {
        let config = HealthCheckConfig {
            binary_path: PathBuf::from("/nonexistent/binary"),
            workspace_path: PathBuf::from("."),
            run_tests: false,
            check_version: false,
            check_api: false,
            api_url: None,
            check_timeout: Duration::from_secs(5),
            test_package: None,
            test_filter: None,
        };
        let checker = HealthChecker::new(config);
        let report = checker.run_all_checks().await.unwrap();
        assert!(!report.healthy);
    }

    // === Production hardening edge-case tests ===

    #[tokio::test]
    async fn test_check_binary_size_missing_file() {
        // Edge case: binary path does not exist at all
        let config = HealthCheckConfig::minimal(PathBuf::from("/nonexistent/binary"));
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_size().await;
        assert!(!result.passed);
        assert!(result.message.contains("Cannot read binary metadata"));
    }

    #[tokio::test]
    async fn test_check_binary_size_exact_boundary_1kb() {
        // Edge case: binary is exactly 1024 bytes (right at the boundary)
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("boundary_binary");
        std::fs::write(&binary, vec![0u8; 1024]).unwrap();

        let config = HealthCheckConfig::minimal(binary);
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_size().await;
        assert!(result.passed); // 1024 is >= 1024, should pass
    }

    #[tokio::test]
    async fn test_check_binary_size_just_under_1kb() {
        // Edge case: binary is 1023 bytes (just under the threshold)
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("under_boundary");
        std::fs::write(&binary, vec![0u8; 1023]).unwrap();

        let config = HealthCheckConfig::minimal(binary);
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_size().await;
        assert!(!result.passed);
        assert!(result.message.contains("too small"));
    }

    #[tokio::test]
    async fn test_health_report_all_fail() {
        // Edge case: every single check fails
        let checks = vec![
            CheckResult::fail("a", "fail a", 0.1),
            CheckResult::fail("b", "fail b", 0.2),
            CheckResult::fail("c", "fail c", 0.3),
        ];
        let report = HealthReport::from_checks(checks);
        assert!(!report.healthy);
        assert_eq!(report.passed_count(), 0);
        assert_eq!(report.failed_count(), 3);
        // Summary should list all failed check names
        assert!(report.summary.contains("a"));
        assert!(report.summary.contains("b"));
        assert!(report.summary.contains("c"));
    }

    #[test]
    fn test_health_report_total_duration_accuracy() {
        let checks = vec![
            CheckResult::pass("a", "ok", 1.5),
            CheckResult::pass("b", "ok", 2.3),
            CheckResult::fail("c", "fail", 0.7),
        ];
        let report = HealthReport::from_checks(checks);
        assert!((report.total_duration_secs - 4.5).abs() < 0.001);
    }

    #[test]
    fn test_health_report_single_failure_names_it() {
        let checks = vec![
            CheckResult::pass("binary_exists", "ok", 0.01),
            CheckResult::fail("binary_version", "bad version", 1.0),
            CheckResult::pass("binary_size", "ok", 0.01),
        ];
        let report = HealthReport::from_checks(checks);
        assert!(!report.healthy);
        assert!(report.summary.contains("binary_version"));
        assert!(!report.summary.contains("binary_exists")); // Passing check not in summary
    }

    #[test]
    fn test_check_result_serialization() {
        let check = CheckResult::pass("test_check", "All good", 0.42);
        let json = serde_json::to_string(&check).unwrap();
        let deserialized: CheckResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test_check");
        assert!(deserialized.passed);
        assert_eq!(deserialized.duration_secs, 0.42);
    }

    #[tokio::test]
    async fn test_run_all_checks_binary_exists_but_too_small() {
        // Edge case: binary exists but is tiny (should fail size check)
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("tiny_bin");
        std::fs::write(&binary, b"tiny").unwrap();

        let config = HealthCheckConfig {
            binary_path: binary,
            workspace_path: PathBuf::from("."),
            run_tests: false,
            check_version: false,
            check_api: false,
            api_url: None,
            check_timeout: Duration::from_secs(5),
            test_package: None,
            test_filter: None,
        };
        let checker = HealthChecker::new(config);
        let report = checker.run_all_checks().await.unwrap();
        // binary_exists passes, but binary_size should fail
        assert!(!report.healthy);
        assert_eq!(report.passed_count(), 1); // binary_exists
        assert_eq!(report.failed_count(), 1); // binary_size
    }

    #[test]
    fn test_config_accessor() {
        let config = HealthCheckConfig::minimal(PathBuf::from("/usr/bin/goose"));
        let checker = HealthChecker::new(config);
        assert_eq!(checker.config().binary_path, PathBuf::from("/usr/bin/goose"));
        assert!(checker.config().check_version);
    }

    #[test]
    fn test_health_check_config_serialization() {
        let config = HealthCheckConfig::full(
            PathBuf::from("/usr/bin/goose"),
            PathBuf::from("/workspace"),
        );
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: HealthCheckConfig = serde_json::from_str(&json).unwrap();
        assert!(deserialized.run_tests);
        assert!(deserialized.check_version);
        assert_eq!(deserialized.test_package.as_deref(), Some("goose"));
    }

    // === Production hardening: timeout, config edge cases, report boundary tests ===

    #[test]
    fn test_config_zero_timeout() {
        // Edge case: zero-duration timeout
        let mut config = HealthCheckConfig::minimal(PathBuf::from("/bin/goose"));
        config.check_timeout = Duration::from_secs(0);
        assert_eq!(config.check_timeout, Duration::from_secs(0));
        // Should still construct a checker without panic
        let checker = HealthChecker::new(config);
        assert_eq!(checker.config().check_timeout, Duration::from_secs(0));
    }

    #[test]
    fn test_config_custom_api_url() {
        // Edge case: config with custom API URL
        let mut config = HealthCheckConfig::minimal(PathBuf::from("/bin/goose"));
        config.check_api = true;
        config.api_url = Some("https://custom.api:8443/healthz".to_string());
        assert_eq!(config.api_url.as_deref(), Some("https://custom.api:8443/healthz"));
    }

    #[test]
    fn test_config_with_test_filter() {
        // Edge case: full config with test filter pattern
        let mut config = HealthCheckConfig::full(
            PathBuf::from("/bin/goose"),
            PathBuf::from("/workspace"),
        );
        config.test_filter = Some("test_health".to_string());
        assert_eq!(config.test_filter.as_deref(), Some("test_health"));
    }

    #[tokio::test]
    async fn test_run_all_checks_version_disabled_tests_disabled() {
        // Edge case: all optional checks disabled — only binary_exists + binary_size run
        let dir = TempDir::new().unwrap();
        let binary = dir.path().join("good_binary");
        std::fs::write(&binary, vec![0u8; 2048]).unwrap();

        let config = HealthCheckConfig {
            binary_path: binary,
            workspace_path: PathBuf::from("."),
            run_tests: false,
            check_version: false,
            check_api: false,
            api_url: None,
            check_timeout: Duration::from_secs(5),
            test_package: None,
            test_filter: None,
        };
        let checker = HealthChecker::new(config);
        let report = checker.run_all_checks().await.unwrap();
        // Only binary_exists and binary_size should run
        assert_eq!(report.checks.len(), 2);
        assert!(report.healthy);
        assert_eq!(report.passed_count(), 2);
    }

    #[tokio::test]
    async fn test_check_binary_version_nonexistent_binary() {
        // Edge case: --version check on nonexistent binary → should fail gracefully
        let config = HealthCheckConfig::minimal(PathBuf::from("/nonexistent/bin/goosed_fake"));
        let checker = HealthChecker::new(config);
        let result = checker.check_binary_version().await;
        assert!(!result.passed);
        assert!(result.message.contains("Failed to execute binary"));
    }

    #[test]
    fn test_health_report_from_single_check() {
        // Edge case: report with exactly one check
        let checks = vec![CheckResult::pass("only_check", "ok", 0.01)];
        let report = HealthReport::from_checks(checks);
        assert!(report.healthy);
        assert_eq!(report.checks.len(), 1);
        assert_eq!(report.passed_count(), 1);
        assert_eq!(report.failed_count(), 0);
        assert!(report.summary.contains("1/1"));
    }

    #[test]
    fn test_health_report_from_single_failing_check() {
        // Edge case: report with exactly one failing check
        let checks = vec![CheckResult::fail("only_check", "broke", 0.5)];
        let report = HealthReport::from_checks(checks);
        assert!(!report.healthy);
        assert_eq!(report.passed_count(), 0);
        assert_eq!(report.failed_count(), 1);
        assert!(report.summary.contains("only_check"));
    }

    #[test]
    fn test_check_result_zero_duration() {
        // Edge case: check completes in exactly zero seconds
        let r = CheckResult::pass("instant", "Instant check", 0.0);
        assert!(r.passed);
        assert_eq!(r.duration_secs, 0.0);
    }

    #[test]
    fn test_check_result_large_duration() {
        // Edge case: extremely long-running check
        let r = CheckResult::fail("slow", "Timed out", 86400.0);
        assert!(!r.passed);
        assert_eq!(r.duration_secs, 86400.0);
    }

    #[test]
    fn test_health_report_many_failures_summary_lists_all() {
        // Edge case: many failures — summary should list all failed check names
        let checks: Vec<CheckResult> = (0..10)
            .map(|i| CheckResult::fail(&format!("check_{}", i), "fail", 0.1))
            .collect();
        let report = HealthReport::from_checks(checks);
        assert!(!report.healthy);
        assert_eq!(report.failed_count(), 10);
        for i in 0..10 {
            assert!(report.summary.contains(&format!("check_{}", i)));
        }
    }
}
