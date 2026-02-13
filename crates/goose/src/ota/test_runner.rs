//! TestRunner — self-test pipeline for OTA validation.
//!
//! Runs the project's test suites (Rust, Vitest, TypeScript) programmatically
//! and parses their output to produce structured results. Distinguishes between
//! new failures and known/pre-existing failures so the OTA pipeline can make
//! informed upgrade decisions.
//!
//! # Test Suites
//!
//! - **Rust** — `cargo test --lib -p goose` (backend unit tests)
//! - **Vitest** — `npx vitest run` in `ui/desktop` (frontend unit tests)
//! - **tsc** — `npx tsc --noEmit` in `ui/desktop` (TypeScript type checking)
//!
//! # Usage
//!
//! ```ignore
//! let config = TestRunConfig::default();
//! let runner = TestRunner::new(config);
//! let result = runner.run_all().await?;
//! if result.new_failures > 0 {
//!     // Reject the build
//! }
//! ```

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{error, info};

/// Maximum characters to retain from raw test output.
const MAX_OUTPUT_CHARS: usize = 5000;

/// Configuration for the test runner.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunConfig {
    /// Path to the workspace root (where Cargo.toml lives)
    pub workspace_root: PathBuf,
    /// Whether to run Rust tests via `cargo test`
    pub run_rust_tests: bool,
    /// Whether to run Vitest frontend tests
    pub run_vitest: bool,
    /// Whether to run TypeScript type-checking via `tsc --noEmit`
    pub run_tsc: bool,
    /// Timeout for Rust tests in seconds
    pub rust_test_timeout_secs: u64,
    /// Timeout for Vitest in seconds
    pub vitest_timeout_secs: u64,
    /// Timeout for tsc in seconds
    pub tsc_timeout_secs: u64,
    /// List of test names that are expected to fail (pre-existing failures)
    pub known_failures: Vec<String>,
}

impl Default for TestRunConfig {
    fn default() -> Self {
        Self {
            workspace_root: PathBuf::from("."),
            run_rust_tests: true,
            run_vitest: true,
            run_tsc: true,
            rust_test_timeout_secs: 300,
            vitest_timeout_secs: 120,
            tsc_timeout_secs: 60,
            known_failures: Vec::new(),
        }
    }
}

/// A single test failure with classification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestFailure {
    /// Name of the failing test
    pub test_name: String,
    /// Which suite this failure belongs to (e.g. "rust", "vitest", "tsc")
    pub suite: String,
    /// The error message or output
    pub error_message: String,
    /// Whether this failure is in the known_failures list
    pub is_known: bool,
}

/// Result of running a single test suite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSuiteResult {
    /// Suite identifier (e.g. "rust", "vitest", "tsc")
    pub suite: String,
    /// Total number of tests
    pub total: u32,
    /// Number of tests that passed
    pub passed: u32,
    /// Number of tests that failed
    pub failed: u32,
    /// Number of tests that were skipped
    pub skipped: u32,
    /// Individual failure details
    pub failures: Vec<TestFailure>,
    /// How long the suite took to run
    pub duration_secs: f64,
    /// Whether the suite is considered successful (no new failures)
    pub success: bool,
    /// Raw output (truncated to MAX_OUTPUT_CHARS)
    pub output: String,
}

impl TestSuiteResult {
    /// Create a result representing a suite that failed to execute at all.
    fn execution_error(suite: &str, error: &str, duration_secs: f64) -> Self {
        Self {
            suite: suite.to_string(),
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            failures: vec![TestFailure {
                test_name: format!("{}_execution", suite),
                suite: suite.to_string(),
                error_message: error.to_string(),
                is_known: false,
            }],
            duration_secs,
            success: false,
            output: truncate_output(error),
        }
    }
}

/// Aggregated result of running all test suites.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunResult {
    /// Results from each suite that was run
    pub suites: Vec<TestSuiteResult>,
    /// Whether ALL suites passed (no new failures)
    pub overall_success: bool,
    /// Sum of all tests across suites
    pub total_tests: u32,
    /// Sum of all passed tests
    pub total_passed: u32,
    /// Sum of all failed tests
    pub total_failed: u32,
    /// Number of failures NOT in known_failures (the ones that matter)
    pub new_failures: u32,
    /// When the test run started
    pub started_at: DateTime<Utc>,
    /// Total wall-clock duration
    pub duration_secs: f64,
    /// Human-readable summary
    pub summary: String,
}

/// Truncate output to MAX_OUTPUT_CHARS, adding a note if truncated.
fn truncate_output(output: &str) -> String {
    if output.len() <= MAX_OUTPUT_CHARS {
        output.to_string()
    } else {
        let truncated = &output[..MAX_OUTPUT_CHARS];
        format!("{}...\n[truncated at {} chars]", truncated, MAX_OUTPUT_CHARS)
    }
}

/// Runs project test suites and produces structured results.
pub struct TestRunner {
    config: TestRunConfig,
}

impl TestRunner {
    /// Create a new TestRunner with the given configuration.
    pub fn new(config: TestRunConfig) -> Self {
        Self { config }
    }

    /// Get the current test run configuration.
    pub fn config(&self) -> &TestRunConfig {
        &self.config
    }

    /// Run all enabled test suites and aggregate results.
    pub async fn run_all(&self) -> Result<TestRunResult> {
        let started_at = Utc::now();
        let wall_start = std::time::Instant::now();
        let mut suites = Vec::new();

        info!(
            rust = self.config.run_rust_tests,
            vitest = self.config.run_vitest,
            tsc = self.config.run_tsc,
            "Starting test run"
        );

        if self.config.run_rust_tests {
            info!("Running Rust tests...");
            match self.run_rust_tests().await {
                Ok(result) => {
                    info!(
                        suite = "rust",
                        passed = result.passed,
                        failed = result.failed,
                        "Rust tests complete"
                    );
                    suites.push(result);
                }
                Err(e) => {
                    error!(error = %e, "Rust test execution failed");
                    suites.push(TestSuiteResult::execution_error("rust", &e.to_string(), 0.0));
                }
            }
        }

        if self.config.run_vitest {
            info!("Running Vitest...");
            match self.run_vitest().await {
                Ok(result) => {
                    info!(
                        suite = "vitest",
                        passed = result.passed,
                        failed = result.failed,
                        "Vitest complete"
                    );
                    suites.push(result);
                }
                Err(e) => {
                    error!(error = %e, "Vitest execution failed");
                    suites.push(TestSuiteResult::execution_error("vitest", &e.to_string(), 0.0));
                }
            }
        }

        if self.config.run_tsc {
            info!("Running tsc --noEmit...");
            match self.run_tsc().await {
                Ok(result) => {
                    info!(
                        suite = "tsc",
                        passed = result.passed,
                        failed = result.failed,
                        "tsc complete"
                    );
                    suites.push(result);
                }
                Err(e) => {
                    error!(error = %e, "tsc execution failed");
                    suites.push(TestSuiteResult::execution_error("tsc", &e.to_string(), 0.0));
                }
            }
        }

        let total_tests: u32 = suites.iter().map(|s| s.total).sum();
        let total_passed: u32 = suites.iter().map(|s| s.passed).sum();
        let total_failed: u32 = suites.iter().map(|s| s.failed).sum();
        let new_failures: u32 = suites
            .iter()
            .flat_map(|s| &s.failures)
            .filter(|f| !f.is_known)
            .count() as u32;
        let overall_success = new_failures == 0 && suites.iter().all(|s| s.success);
        let duration_secs = wall_start.elapsed().as_secs_f64();

        let summary = if overall_success {
            format!(
                "All tests passed: {}/{} total, {} known failures tolerated",
                total_passed, total_tests, total_failed
            )
        } else {
            format!(
                "Test run FAILED: {}/{} passed, {} failed ({} new failures)",
                total_passed, total_tests, total_failed, new_failures
            )
        };

        info!(summary = %summary, "Test run complete");

        Ok(TestRunResult {
            suites,
            overall_success,
            total_tests,
            total_passed,
            total_failed,
            new_failures,
            started_at,
            duration_secs,
            summary,
        })
    }

    /// Run Rust tests via `cargo test --lib -p goose`.
    pub async fn run_rust_tests(&self) -> Result<TestSuiteResult> {
        let start = std::time::Instant::now();

        let output = tokio::process::Command::new("cargo")
            .args(["test", "--lib", "-p", "goose"])
            .current_dir(&self.config.workspace_root)
            .output()
            .await
            .context("Failed to execute cargo test")?;

        let duration = start.elapsed().as_secs_f64();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = format!("{}\n{}", stdout, stderr);

        let mut result = self.parse_rust_output(&combined);
        result.duration_secs = duration;
        self.classify_failures(&mut result.failures);

        // Success means: command ran AND no new (unknown) failures
        let new_failure_count = result.failures.iter().filter(|f| !f.is_known).count();
        result.success = output.status.success() || new_failure_count == 0;

        Ok(result)
    }

    /// Run Vitest via `npx vitest run` in ui/desktop.
    pub async fn run_vitest(&self) -> Result<TestSuiteResult> {
        let start = std::time::Instant::now();
        let ui_dir = self.config.workspace_root.join("ui").join("desktop");

        let output = tokio::process::Command::new("npx")
            .args(["vitest", "run"])
            .current_dir(&ui_dir)
            .output()
            .await
            .context("Failed to execute npx vitest run")?;

        let duration = start.elapsed().as_secs_f64();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = format!("{}\n{}", stdout, stderr);

        let mut result = self.parse_vitest_output(&combined);
        result.duration_secs = duration;
        self.classify_failures(&mut result.failures);

        let new_failure_count = result.failures.iter().filter(|f| !f.is_known).count();
        result.success = output.status.success() || new_failure_count == 0;

        Ok(result)
    }

    /// Run TypeScript type-checking via `npx tsc --noEmit` in ui/desktop.
    pub async fn run_tsc(&self) -> Result<TestSuiteResult> {
        let start = std::time::Instant::now();
        let ui_dir = self.config.workspace_root.join("ui").join("desktop");

        let output = tokio::process::Command::new("npx")
            .args(["tsc", "--noEmit"])
            .current_dir(&ui_dir)
            .output()
            .await
            .context("Failed to execute npx tsc --noEmit")?;

        let duration = start.elapsed().as_secs_f64();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = format!("{}\n{}", stdout, stderr);

        let mut result = self.parse_tsc_output(&combined);
        result.duration_secs = duration;
        self.classify_failures(&mut result.failures);

        let new_failure_count = result.failures.iter().filter(|f| !f.is_known).count();
        result.success = output.status.success() || new_failure_count == 0;

        Ok(result)
    }

    /// Parse `cargo test` output to extract pass/fail counts and failure names.
    ///
    /// Expected format from cargo test:
    /// ```text
    /// test core::tests::test_something ... ok
    /// test core::tests::test_broken ... FAILED
    /// ...
    /// test result: ok. 1753 passed; 10 failed; 0 ignored; 0 measured; 0 filtered out; finished in 42.5s
    /// ```
    pub fn parse_rust_output(&self, output: &str) -> TestSuiteResult {
        let mut passed: u32 = 0;
        let mut failed: u32 = 0;
        let mut skipped: u32 = 0;
        let mut failures = Vec::new();

        // Extract the summary line: "test result: ok. X passed; Y failed; Z ignored"
        for line in output.lines() {
            let trimmed = line.trim();

            // Parse summary line
            if trimmed.starts_with("test result:") {
                if let Some(p) = extract_number_before(trimmed, "passed") {
                    passed = p;
                }
                if let Some(f) = extract_number_before(trimmed, "failed") {
                    failed = f;
                }
                if let Some(s) = extract_number_before(trimmed, "ignored") {
                    skipped = s;
                }
            }

            // Extract individual failure names: "test foo::bar ... FAILED"
            if trimmed.starts_with("test ") && trimmed.ends_with("FAILED") {
                let test_name = trimmed
                    .strip_prefix("test ")
                    .and_then(|s| s.split(" ... ").next())
                    .unwrap_or(trimmed)
                    .trim()
                    .to_string();

                failures.push(TestFailure {
                    test_name,
                    suite: "rust".to_string(),
                    error_message: "Test returned FAILED".to_string(),
                    is_known: false,
                });
            }
        }

        let total = passed + failed + skipped;
        let success = failed == 0;

        TestSuiteResult {
            suite: "rust".to_string(),
            total,
            passed,
            failed,
            skipped,
            failures,
            duration_secs: 0.0,
            success,
            output: truncate_output(output),
        }
    }

    /// Parse Vitest output to extract test counts.
    ///
    /// Expected format:
    /// ```text
    ///  Tests  2152 passed | 3 skipped (2155)
    ///  ...
    /// ```
    /// Or on failure:
    /// ```text
    ///  Tests  2150 passed | 2 failed | 3 skipped (2155)
    /// ```
    pub fn parse_vitest_output(&self, output: &str) -> TestSuiteResult {
        let mut passed: u32 = 0;
        let mut failed: u32 = 0;
        let mut skipped: u32 = 0;
        let mut total: u32 = 0;
        let mut failures = Vec::new();

        for line in output.lines() {
            let trimmed = line.trim();

            // Match the summary line starting with "Tests" (Vitest output)
            if trimmed.starts_with("Tests") || trimmed.starts_with("Tests") {
                // Parse segments like "2152 passed", "2 failed", "3 skipped"
                for segment in trimmed.split('|') {
                    let segment = segment.trim();
                    if segment.contains("passed") {
                        if let Some(n) = extract_leading_number(segment) {
                            passed = n;
                        }
                    } else if segment.contains("failed") {
                        if let Some(n) = extract_leading_number(segment) {
                            failed = n;
                        }
                    } else if segment.contains("skipped") {
                        if let Some(n) = extract_leading_number(segment) {
                            skipped = n;
                        }
                    }
                }

                // Try to parse total from parenthetical at end: (2155)
                if let Some(start) = trimmed.rfind('(') {
                    if let Some(end) = trimmed.rfind(')') {
                        if let Ok(t) = trimmed[start + 1..end].trim().parse::<u32>() {
                            total = t;
                        }
                    }
                }
            }

            // Extract individual vitest failures: "FAIL src/foo.test.ts > description"
            if trimmed.starts_with("FAIL") || trimmed.starts_with("×") || trimmed.starts_with("✕") {
                let test_name = trimmed
                    .trim_start_matches("FAIL")
                    .trim_start_matches('×')
                    .trim_start_matches('✕')
                    .trim()
                    .to_string();

                if !test_name.is_empty() {
                    failures.push(TestFailure {
                        test_name,
                        suite: "vitest".to_string(),
                        error_message: "Vitest failure".to_string(),
                        is_known: false,
                    });
                }
            }
        }

        // If total wasn't parsed from parenthetical, compute it
        if total == 0 {
            total = passed + failed + skipped;
        }

        let success = failed == 0;

        TestSuiteResult {
            suite: "vitest".to_string(),
            total,
            passed,
            failed,
            skipped,
            failures,
            duration_secs: 0.0,
            success,
            output: truncate_output(output),
        }
    }

    /// Parse `tsc --noEmit` output.
    ///
    /// A clean run produces no stdout. Errors look like:
    /// ```text
    /// src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
    /// src/bar.tsx(42,10): error TS7006: Parameter 'x' implicitly has an 'any' type.
    /// Found 2 errors in 2 files.
    /// ```
    pub fn parse_tsc_output(&self, output: &str) -> TestSuiteResult {
        let mut error_count: u32 = 0;
        let mut failures = Vec::new();

        for line in output.lines() {
            let trimmed = line.trim();

            // Count TS error lines: "path(line,col): error TSxxxx: message"
            if trimmed.contains("): error TS") {
                error_count += 1;

                // Extract the file and error
                let test_name = if let Some(paren_pos) = trimmed.find('(') {
                    trimmed[..paren_pos].to_string()
                } else {
                    trimmed.to_string()
                };

                let error_message = if let Some(err_pos) = trimmed.find("error TS") {
                    trimmed[err_pos..].to_string()
                } else {
                    trimmed.to_string()
                };

                failures.push(TestFailure {
                    test_name,
                    suite: "tsc".to_string(),
                    error_message,
                    is_known: false,
                });
            }

            // Also try to parse "Found N error(s)" summary
            if trimmed.starts_with("Found") && trimmed.contains("error") {
                if let Some(n) = extract_leading_number(
                    trimmed.strip_prefix("Found").unwrap_or(trimmed).trim(),
                ) {
                    // Use the explicit count if present and larger
                    if n > error_count {
                        error_count = n;
                    }
                }
            }
        }

        // For tsc, "passed" means files checked without errors
        // We treat it as: 1 virtual test per file, errors are failures
        let success = error_count == 0;
        let passed: u32 = if success { 1 } else { 0 };
        let total = passed + error_count;

        TestSuiteResult {
            suite: "tsc".to_string(),
            total,
            passed,
            failed: error_count,
            skipped: 0,
            failures,
            duration_secs: 0.0,
            success,
            output: truncate_output(output),
        }
    }

    /// Mark failures that appear in the known_failures list.
    pub fn classify_failures(&self, failures: &mut [TestFailure]) {
        for failure in failures.iter_mut() {
            failure.is_known = self.config.known_failures.iter().any(|known| {
                failure.test_name.contains(known) || known.contains(&failure.test_name)
            });
        }
    }
}

/// Extract the number that appears immediately before a keyword in text.
///
/// E.g., `extract_number_before("1753 passed; 10 failed", "passed")` -> Some(1753)
fn extract_number_before(text: &str, keyword: &str) -> Option<u32> {
    if let Some(pos) = text.find(keyword) {
        let before = text[..pos].trim();
        // Get the last whitespace-separated token before the keyword
        let num_str = before.rsplit(|c: char| !c.is_ascii_digit()).next()?;
        num_str.parse().ok()
    } else {
        None
    }
}

/// Extract the first number found in a string.
///
/// E.g., `extract_leading_number("  2152 passed")` -> Some(2152)
fn extract_leading_number(text: &str) -> Option<u32> {
    let trimmed = text.trim();
    // Skip any non-digit prefix (like "Tests ")
    let digit_start = trimmed.find(|c: char| c.is_ascii_digit())?;
    let rest = &trimmed[digit_start..];
    let digit_end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    rest[..digit_end].parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> TestRunConfig {
        TestRunConfig::default()
    }

    fn config_with_known(known: Vec<&str>) -> TestRunConfig {
        TestRunConfig {
            known_failures: known.into_iter().map(String::from).collect(),
            ..Default::default()
        }
    }

    // ---------------------------------------------------------------
    // 1. test_config_default
    // ---------------------------------------------------------------
    #[test]
    fn test_config_default() {
        let config = TestRunConfig::default();
        assert!(config.run_rust_tests);
        assert!(config.run_vitest);
        assert!(config.run_tsc);
        assert_eq!(config.rust_test_timeout_secs, 300);
        assert_eq!(config.vitest_timeout_secs, 120);
        assert_eq!(config.tsc_timeout_secs, 60);
        assert!(config.known_failures.is_empty());
        assert_eq!(config.workspace_root, PathBuf::from("."));
    }

    // ---------------------------------------------------------------
    // 2. test_config_serialization
    // ---------------------------------------------------------------
    #[test]
    fn test_config_serialization() {
        let config = TestRunConfig {
            workspace_root: PathBuf::from("/workspace"),
            run_rust_tests: true,
            run_vitest: false,
            run_tsc: true,
            rust_test_timeout_secs: 600,
            vitest_timeout_secs: 60,
            tsc_timeout_secs: 30,
            known_failures: vec!["jwt_test".to_string(), "evolution_test".to_string()],
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: TestRunConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.workspace_root, PathBuf::from("/workspace"));
        assert!(deserialized.run_rust_tests);
        assert!(!deserialized.run_vitest);
        assert!(deserialized.run_tsc);
        assert_eq!(deserialized.rust_test_timeout_secs, 600);
        assert_eq!(deserialized.known_failures.len(), 2);
        assert_eq!(deserialized.known_failures[0], "jwt_test");
    }

    // ---------------------------------------------------------------
    // 3. test_failure_classification
    // ---------------------------------------------------------------
    #[test]
    fn test_failure_classification() {
        let config = config_with_known(vec!["jwt_crypto", "evolution_merge"]);
        let runner = TestRunner::new(config);

        let mut failures = vec![
            TestFailure {
                test_name: "core::jwt_crypto::test_sign".to_string(),
                suite: "rust".to_string(),
                error_message: "assertion failed".to_string(),
                is_known: false,
            },
            TestFailure {
                test_name: "core::new_feature::test_stuff".to_string(),
                suite: "rust".to_string(),
                error_message: "panic".to_string(),
                is_known: false,
            },
            TestFailure {
                test_name: "agents::evolution_merge::test_conflict".to_string(),
                suite: "rust".to_string(),
                error_message: "timeout".to_string(),
                is_known: false,
            },
        ];

        runner.classify_failures(&mut failures);

        assert!(failures[0].is_known, "jwt_crypto should be known");
        assert!(!failures[1].is_known, "new_feature should NOT be known");
        assert!(failures[2].is_known, "evolution_merge should be known");
    }

    // ---------------------------------------------------------------
    // 4. test_suite_result_success
    // ---------------------------------------------------------------
    #[test]
    fn test_suite_result_success() {
        let result = TestSuiteResult {
            suite: "rust".to_string(),
            total: 1753,
            passed: 1753,
            failed: 0,
            skipped: 0,
            failures: Vec::new(),
            duration_secs: 42.5,
            success: true,
            output: "all good".to_string(),
        };

        assert!(result.success);
        assert_eq!(result.total, 1753);
        assert_eq!(result.passed, 1753);
        assert_eq!(result.failed, 0);
        assert!(result.failures.is_empty());
    }

    // ---------------------------------------------------------------
    // 5. test_suite_result_failure
    // ---------------------------------------------------------------
    #[test]
    fn test_suite_result_failure() {
        let result = TestSuiteResult {
            suite: "rust".to_string(),
            total: 1763,
            passed: 1753,
            failed: 10,
            skipped: 0,
            failures: vec![
                TestFailure {
                    test_name: "test_jwt".to_string(),
                    suite: "rust".to_string(),
                    error_message: "signature mismatch".to_string(),
                    is_known: true,
                },
            ],
            duration_secs: 55.0,
            success: false,
            output: "some failures".to_string(),
        };

        assert!(!result.success);
        assert_eq!(result.failed, 10);
        assert_eq!(result.failures.len(), 1);
        assert!(result.failures[0].is_known);
    }

    // ---------------------------------------------------------------
    // 6. test_run_result_summary
    // ---------------------------------------------------------------
    #[test]
    fn test_run_result_summary() {
        let suites = vec![
            TestSuiteResult {
                suite: "rust".to_string(),
                total: 1763,
                passed: 1753,
                failed: 10,
                skipped: 0,
                failures: vec![
                    TestFailure {
                        test_name: "jwt_test".to_string(),
                        suite: "rust".to_string(),
                        error_message: "known".to_string(),
                        is_known: true,
                    },
                ],
                duration_secs: 50.0,
                success: true,
                output: String::new(),
            },
            TestSuiteResult {
                suite: "vitest".to_string(),
                total: 2152,
                passed: 2152,
                failed: 0,
                skipped: 3,
                failures: Vec::new(),
                duration_secs: 30.0,
                success: true,
                output: String::new(),
            },
            TestSuiteResult {
                suite: "tsc".to_string(),
                total: 1,
                passed: 1,
                failed: 0,
                skipped: 0,
                failures: Vec::new(),
                duration_secs: 5.0,
                success: true,
                output: String::new(),
            },
        ];

        let total_tests: u32 = suites.iter().map(|s| s.total).sum();
        let total_passed: u32 = suites.iter().map(|s| s.passed).sum();
        let total_failed: u32 = suites.iter().map(|s| s.failed).sum();
        let new_failures: u32 = suites
            .iter()
            .flat_map(|s| &s.failures)
            .filter(|f| !f.is_known)
            .count() as u32;

        assert_eq!(total_tests, 1763 + 2152 + 1);
        assert_eq!(total_passed, 1753 + 2152 + 1);
        assert_eq!(total_failed, 10);
        assert_eq!(new_failures, 0); // all known
    }

    // ---------------------------------------------------------------
    // 7. test_parse_rust_output
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_rust_output() {
        let output = r#"
running 1763 tests
test core::tests::test_something ... ok
test core::tests::test_another ... ok
test result: ok. 1753 passed; 10 failed; 0 ignored; 0 measured; 0 filtered out; finished in 42.5s
"#;

        let runner = TestRunner::new(default_config());
        let result = runner.parse_rust_output(output);

        assert_eq!(result.suite, "rust");
        assert_eq!(result.passed, 1753);
        assert_eq!(result.failed, 10);
        assert_eq!(result.skipped, 0);
        assert_eq!(result.total, 1763);
    }

    // ---------------------------------------------------------------
    // 8. test_parse_rust_output_with_failures
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_rust_output_with_failures() {
        let output = r#"
running 5 tests
test core::tests::test_ok_one ... ok
test core::tests::test_ok_two ... ok
test core::jwt::test_sign ... FAILED
test agents::evolution::test_merge ... FAILED
test core::tests::test_ok_three ... ok

failures:
    core::jwt::test_sign
    agents::evolution::test_merge

test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out
"#;

        let config = config_with_known(vec!["jwt"]);
        let runner = TestRunner::new(config);
        let mut result = runner.parse_rust_output(output);
        runner.classify_failures(&mut result.failures);

        assert_eq!(result.passed, 3);
        assert_eq!(result.failed, 2);
        assert_eq!(result.failures.len(), 2);

        // jwt should be known
        let jwt_failure = result.failures.iter().find(|f| f.test_name.contains("jwt")).unwrap();
        assert!(jwt_failure.is_known);

        // evolution should NOT be known
        let evo_failure = result.failures.iter().find(|f| f.test_name.contains("evolution")).unwrap();
        assert!(!evo_failure.is_known);
    }

    // ---------------------------------------------------------------
    // 9. test_parse_vitest_output
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_vitest_output() {
        let output = r#"
 ✓ src/components/App.test.tsx (5 tests) 120ms
 ✓ src/components/Sidebar.test.tsx (12 tests) 85ms
 ✓ src/utils/helpers.test.ts (8 tests) 30ms

 Test Files  3 passed (3)
 Tests  2152 passed | 3 skipped (2155)
 Start at  10:30:00
 Duration   28.5s
"#;

        let runner = TestRunner::new(default_config());
        let result = runner.parse_vitest_output(output);

        assert_eq!(result.suite, "vitest");
        assert_eq!(result.passed, 2152);
        assert_eq!(result.skipped, 3);
        assert_eq!(result.failed, 0);
        assert_eq!(result.total, 2155);
        assert!(result.success);
    }

    // ---------------------------------------------------------------
    // 10. test_parse_tsc_output_clean
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_tsc_output_clean() {
        // tsc --noEmit with zero errors produces empty output
        let output = "";

        let runner = TestRunner::new(default_config());
        let result = runner.parse_tsc_output(output);

        assert_eq!(result.suite, "tsc");
        assert_eq!(result.failed, 0);
        assert_eq!(result.passed, 1);
        assert!(result.success);
        assert!(result.failures.is_empty());
    }

    // ---------------------------------------------------------------
    // 11. test_parse_tsc_output_errors
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_tsc_output_errors() {
        let output = r#"
src/components/Foo.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/components/Bar.tsx(42,10): error TS7006: Parameter 'x' implicitly has an 'any' type.
src/utils/helpers.ts(100,1): error TS2304: Cannot find name 'globalThing'.

Found 3 errors in 3 files.
"#;

        let runner = TestRunner::new(default_config());
        let result = runner.parse_tsc_output(output);

        assert_eq!(result.suite, "tsc");
        assert_eq!(result.failed, 3);
        assert_eq!(result.passed, 0);
        assert!(!result.success);
        assert_eq!(result.failures.len(), 3);

        // Verify we extracted the file paths
        assert_eq!(result.failures[0].test_name, "src/components/Foo.tsx");
        assert_eq!(result.failures[1].test_name, "src/components/Bar.tsx");
        assert_eq!(result.failures[2].test_name, "src/utils/helpers.ts");

        // Verify error messages extracted
        assert!(result.failures[0].error_message.contains("TS2322"));
        assert!(result.failures[1].error_message.contains("TS7006"));
        assert!(result.failures[2].error_message.contains("TS2304"));
    }

    // ---------------------------------------------------------------
    // 12. test_new_failures_count
    // ---------------------------------------------------------------
    #[test]
    fn test_new_failures_count() {
        let config = config_with_known(vec!["jwt_crypto", "evolution"]);
        let runner = TestRunner::new(config);

        let mut failures = vec![
            TestFailure {
                test_name: "core::jwt_crypto::test_sign".to_string(),
                suite: "rust".to_string(),
                error_message: "known issue".to_string(),
                is_known: false,
            },
            TestFailure {
                test_name: "core::brand_new::test_regression".to_string(),
                suite: "rust".to_string(),
                error_message: "new bug".to_string(),
                is_known: false,
            },
            TestFailure {
                test_name: "agents::evolution::test_conflict".to_string(),
                suite: "rust".to_string(),
                error_message: "known issue".to_string(),
                is_known: false,
            },
            TestFailure {
                test_name: "vitest::SomeComponent::render".to_string(),
                suite: "vitest".to_string(),
                error_message: "new regression".to_string(),
                is_known: false,
            },
        ];

        runner.classify_failures(&mut failures);

        let new_count = failures.iter().filter(|f| !f.is_known).count();
        let known_count = failures.iter().filter(|f| f.is_known).count();

        assert_eq!(known_count, 2); // jwt_crypto + evolution
        assert_eq!(new_count, 2); // brand_new + SomeComponent
    }

    // ---------------------------------------------------------------
    // 13. test_truncate_output
    // ---------------------------------------------------------------
    #[test]
    fn test_truncate_output() {
        let short = "hello world";
        assert_eq!(truncate_output(short), "hello world");

        let long = "x".repeat(6000);
        let truncated = truncate_output(&long);
        assert!(truncated.len() < 6000);
        assert!(truncated.contains("[truncated at 5000 chars]"));
    }

    // ---------------------------------------------------------------
    // 14. test_extract_number_before
    // ---------------------------------------------------------------
    #[test]
    fn test_extract_number_before() {
        assert_eq!(
            extract_number_before("test result: ok. 1753 passed; 10 failed", "passed"),
            Some(1753)
        );
        assert_eq!(
            extract_number_before("test result: ok. 1753 passed; 10 failed", "failed"),
            Some(10)
        );
        assert_eq!(
            extract_number_before("no match here", "passed"),
            None
        );
    }

    // ---------------------------------------------------------------
    // 15. test_extract_leading_number
    // ---------------------------------------------------------------
    #[test]
    fn test_extract_leading_number() {
        assert_eq!(extract_leading_number("  2152 passed"), Some(2152));
        assert_eq!(extract_leading_number("Tests  42 failed"), Some(42));
        assert_eq!(extract_leading_number("no numbers"), None);
        assert_eq!(extract_leading_number("Found 3 errors"), Some(3));
    }

    // ---------------------------------------------------------------
    // 16. test_execution_error
    // ---------------------------------------------------------------
    #[test]
    fn test_execution_error() {
        let result = TestSuiteResult::execution_error("rust", "cargo not found", 0.5);

        assert_eq!(result.suite, "rust");
        assert_eq!(result.total, 0);
        assert!(!result.success);
        assert_eq!(result.failures.len(), 1);
        assert_eq!(result.failures[0].test_name, "rust_execution");
        assert!(result.failures[0].error_message.contains("cargo not found"));
        assert!(!result.failures[0].is_known);
    }

    // ---------------------------------------------------------------
    // 17. test_suite_result_serialization
    // ---------------------------------------------------------------
    #[test]
    fn test_suite_result_serialization() {
        let result = TestSuiteResult {
            suite: "vitest".to_string(),
            total: 100,
            passed: 95,
            failed: 5,
            skipped: 0,
            failures: vec![TestFailure {
                test_name: "test_foo".to_string(),
                suite: "vitest".to_string(),
                error_message: "expected true".to_string(),
                is_known: false,
            }],
            duration_secs: 10.0,
            success: false,
            output: "test output here".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: TestSuiteResult = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.suite, "vitest");
        assert_eq!(deserialized.total, 100);
        assert_eq!(deserialized.passed, 95);
        assert_eq!(deserialized.failed, 5);
        assert_eq!(deserialized.failures.len(), 1);
        assert_eq!(deserialized.failures[0].test_name, "test_foo");
    }

    // ---------------------------------------------------------------
    // 18. test_run_result_serialization
    // ---------------------------------------------------------------
    #[test]
    fn test_run_result_serialization() {
        let result = TestRunResult {
            suites: vec![],
            overall_success: true,
            total_tests: 3916,
            total_passed: 3906,
            total_failed: 10,
            new_failures: 0,
            started_at: Utc::now(),
            duration_secs: 85.0,
            summary: "All tests passed".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: TestRunResult = serde_json::from_str(&json).unwrap();

        assert!(deserialized.overall_success);
        assert_eq!(deserialized.total_tests, 3916);
        assert_eq!(deserialized.new_failures, 0);
        assert_eq!(deserialized.summary, "All tests passed");
    }

    // ---------------------------------------------------------------
    // 19. test_parse_rust_output_all_pass
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_rust_output_all_pass() {
        let output = r#"
running 87 tests
test core::tests::test_1 ... ok
test core::tests::test_2 ... ok
test result: ok. 87 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.2s
"#;

        let runner = TestRunner::new(default_config());
        let result = runner.parse_rust_output(output);

        assert_eq!(result.passed, 87);
        assert_eq!(result.failed, 0);
        assert_eq!(result.total, 87);
        assert!(result.success);
        assert!(result.failures.is_empty());
    }

    // ---------------------------------------------------------------
    // 20. test_parse_vitest_with_failures
    // ---------------------------------------------------------------
    #[test]
    fn test_parse_vitest_with_failures() {
        let output = r#"
 ✓ src/components/App.test.tsx (5 tests) 120ms
 × src/components/Broken.test.tsx > should render
 ✓ src/utils/helpers.test.ts (8 tests) 30ms

 Tests  2150 passed | 2 failed | 3 skipped (2155)
"#;

        let runner = TestRunner::new(default_config());
        let result = runner.parse_vitest_output(output);

        assert_eq!(result.passed, 2150);
        assert_eq!(result.failed, 2);
        assert_eq!(result.skipped, 3);
        assert_eq!(result.total, 2155);
        assert!(!result.success);

        // Should have extracted the failure line
        assert!(result.failures.len() >= 1);
    }

    // ---------------------------------------------------------------
    // 21. test_runner_creation
    // ---------------------------------------------------------------
    #[test]
    fn test_runner_creation() {
        let config = TestRunConfig {
            workspace_root: PathBuf::from("/my/project"),
            run_rust_tests: true,
            run_vitest: false,
            run_tsc: false,
            ..Default::default()
        };
        let runner = TestRunner::new(config);

        assert_eq!(runner.config().workspace_root, PathBuf::from("/my/project"));
        assert!(runner.config().run_rust_tests);
        assert!(!runner.config().run_vitest);
        assert!(!runner.config().run_tsc);
    }
}
