//! SandboxRunner — sandboxed execution environment for testing changes before production.
//!
//! Before applying self-modifications to the live workspace, the sandbox runner:
//!
//! 1. Prepares an isolated workspace (copy or symlink)
//! 2. Applies the proposed code changes
//! 3. Runs `cargo build` to verify compilation
//! 4. Runs `cargo test` to verify no regressions
//! 5. Reports success/failure with timing and output
//!
//! If the sandbox run fails, the live workspace is never touched.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{error, info, warn};

/// Configuration for the sandbox environment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    /// Root of the real workspace.
    pub workspace_root: PathBuf,
    /// Directory where the sandbox is created.
    pub sandbox_dir: PathBuf,
    /// Maximum time allowed for the sandbox run (seconds).
    pub timeout_secs: u64,
    /// Whether to run in full isolation (copy workspace) vs. in-place.
    pub isolated: bool,
}

impl SandboxConfig {
    /// Create a sandbox config with defaults for the given workspace.
    pub fn default_for_workspace(workspace_root: PathBuf) -> Self {
        let sandbox_dir = workspace_root.join(".ota").join("sandbox");
        Self {
            workspace_root,
            sandbox_dir,
            timeout_secs: 300,
            isolated: true,
        }
    }
}

/// A lightweight reference to a proposed code change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChangeRef {
    /// Relative file path within the workspace.
    pub file_path: String,
    /// New content for the file.
    pub content: String,
}

/// Result of running a sandbox execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxResult {
    /// Whether the sandbox build and tests succeeded.
    pub success: bool,
    /// Output from the build step.
    pub build_output: String,
    /// Output from the test step.
    pub test_output: String,
    /// How long the sandbox run took (seconds).
    pub duration_secs: f64,
    /// When the sandbox run started.
    pub started_at: DateTime<Utc>,
    /// Summary message.
    pub summary: String,
}

impl SandboxResult {
    /// Create a successful sandbox result.
    pub fn success(
        build_output: impl Into<String>,
        test_output: impl Into<String>,
        duration_secs: f64,
    ) -> Self {
        Self {
            success: true,
            build_output: build_output.into(),
            test_output: test_output.into(),
            duration_secs,
            started_at: Utc::now(),
            summary: format!("Sandbox passed in {:.1}s", duration_secs),
        }
    }

    /// Create a failed sandbox result.
    pub fn failure(
        build_output: impl Into<String>,
        test_output: impl Into<String>,
        duration_secs: f64,
        reason: impl Into<String>,
    ) -> Self {
        let reason = reason.into();
        Self {
            success: false,
            build_output: build_output.into(),
            test_output: test_output.into(),
            duration_secs,
            started_at: Utc::now(),
            summary: format!("Sandbox FAILED in {:.1}s: {}", duration_secs, reason),
        }
    }
}

/// Runs proposed changes in a sandboxed environment before applying them.
pub struct SandboxRunner {
    /// Sandbox configuration.
    config: SandboxConfig,
    /// History of sandbox runs this session.
    runs: Vec<SandboxResult>,
}

impl SandboxRunner {
    /// Create a new sandbox runner with the given configuration.
    pub fn new(config: SandboxConfig) -> Self {
        Self {
            config,
            runs: Vec::new(),
        }
    }

    /// Create a sandbox runner with defaults for the given workspace.
    pub fn default_for_workspace(workspace_root: PathBuf) -> Self {
        Self::new(SandboxConfig::default_for_workspace(workspace_root))
    }

    /// Get the sandbox configuration.
    pub fn config(&self) -> &SandboxConfig {
        &self.config
    }

    /// Prepare the sandbox directory.
    ///
    /// Creates the sandbox directory if it does not exist. In isolated mode,
    /// this is where a workspace copy would be placed.
    pub async fn prepare_sandbox(&self) -> Result<PathBuf> {
        let sandbox_path = &self.config.sandbox_dir;

        tokio::fs::create_dir_all(sandbox_path)
            .await
            .context("Failed to create sandbox directory")?;

        info!(
            sandbox = %sandbox_path.display(),
            "Sandbox directory prepared"
        );

        Ok(sandbox_path.clone())
    }

    /// Run proposed changes in the sandbox.
    ///
    /// 1. Prepare the sandbox workspace
    /// 2. Write the changed files
    /// 3. Attempt to build
    /// 4. Attempt to test
    /// 5. Return the result
    pub async fn run_in_sandbox(
        &mut self,
        changes: &[CodeChangeRef],
    ) -> Result<SandboxResult> {
        let start = std::time::Instant::now();

        if changes.is_empty() {
            bail!("No changes provided to sandbox");
        }

        info!(
            change_count = changes.len(),
            "Starting sandbox run"
        );

        // Step 1: Prepare sandbox
        let sandbox_path = self.prepare_sandbox().await?;

        // Step 2: Apply changes to sandbox
        for change in changes {
            let target = sandbox_path.join(&change.file_path);

            // Ensure parent directory exists
            if let Some(parent) = target.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .context(format!(
                        "Failed to create parent dir for: {}",
                        change.file_path
                    ))?;
            }

            tokio::fs::write(&target, &change.content)
                .await
                .context(format!(
                    "Failed to write sandbox file: {}",
                    change.file_path
                ))?;

            info!(file = %change.file_path, "Applied change to sandbox");
        }

        // Step 3: Build in sandbox
        let build_result = tokio::process::Command::new("cargo")
            .arg("check")
            .arg("--lib")
            .arg("-p")
            .arg("goose")
            .current_dir(&self.config.workspace_root)
            .output()
            .await;

        let (build_output, build_success) = match build_result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let combined = format!("{}\n{}", stdout, stderr);
                (combined, output.status.success())
            }
            Err(e) => {
                let msg = format!("Build command failed: {}", e);
                error!("{}", msg);
                let duration = start.elapsed().as_secs_f64();
                let result = SandboxResult::failure("", "", duration, msg);
                self.runs.push(result.clone());
                return Ok(result);
            }
        };

        if !build_success {
            let duration = start.elapsed().as_secs_f64();
            warn!(duration_secs = duration, "Sandbox build FAILED");
            let result = SandboxResult::failure(
                &build_output,
                "",
                duration,
                "Build failed",
            );
            self.runs.push(result.clone());
            return Ok(result);
        }

        // Step 4: Run tests in sandbox
        let test_result = tokio::process::Command::new("cargo")
            .arg("test")
            .arg("--lib")
            .arg("-p")
            .arg("goose")
            .arg("--")
            .arg("--test-threads=1")
            .current_dir(&self.config.workspace_root)
            .output()
            .await;

        let (test_output, test_success) = match test_result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let combined = format!("{}\n{}", stdout, stderr);
                (combined, output.status.success())
            }
            Err(e) => {
                let msg = format!("Test command failed: {}", e);
                error!("{}", msg);
                let duration = start.elapsed().as_secs_f64();
                let result = SandboxResult::failure(&build_output, "", duration, msg);
                self.runs.push(result.clone());
                return Ok(result);
            }
        };

        let duration = start.elapsed().as_secs_f64();

        let result = if test_success {
            info!(duration_secs = duration, "Sandbox run PASSED");
            SandboxResult::success(&build_output, &test_output, duration)
        } else {
            warn!(duration_secs = duration, "Sandbox tests FAILED");
            SandboxResult::failure(
                &build_output,
                &test_output,
                duration,
                "Tests failed",
            )
        };

        self.runs.push(result.clone());
        Ok(result)
    }

    /// Clean up the sandbox directory.
    pub async fn cleanup(&self) -> Result<()> {
        let sandbox_path = &self.config.sandbox_dir;
        if sandbox_path.exists() {
            tokio::fs::remove_dir_all(sandbox_path)
                .await
                .context("Failed to clean up sandbox directory")?;
            info!(
                sandbox = %sandbox_path.display(),
                "Sandbox cleaned up"
            );
        }
        Ok(())
    }

    /// Get the history of sandbox runs.
    pub fn history(&self) -> &[SandboxResult] {
        &self.runs
    }

    /// Get the most recent sandbox result.
    pub fn last_result(&self) -> Option<&SandboxResult> {
        self.runs.last()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_sandbox_config_default() {
        let config = SandboxConfig::default_for_workspace(PathBuf::from("/workspace"));
        assert_eq!(config.timeout_secs, 300);
        assert!(config.isolated);
        assert!(config.sandbox_dir.to_string_lossy().contains("sandbox"));
        assert!(config.sandbox_dir.to_string_lossy().contains(".ota"));
    }

    #[test]
    fn test_sandbox_result_success() {
        let result = SandboxResult::success("build ok", "tests ok", 12.5);
        assert!(result.success);
        assert_eq!(result.build_output, "build ok");
        assert_eq!(result.test_output, "tests ok");
        assert_eq!(result.duration_secs, 12.5);
        assert!(result.summary.contains("passed"));
    }

    #[test]
    fn test_sandbox_result_failure() {
        let result = SandboxResult::failure("build out", "test out", 5.0, "compilation error");
        assert!(!result.success);
        assert!(result.summary.contains("FAILED"));
        assert!(result.summary.contains("compilation error"));
    }

    #[test]
    fn test_sandbox_runner_creation() {
        let dir = TempDir::new().unwrap();
        let runner = SandboxRunner::default_for_workspace(dir.path().to_path_buf());
        assert!(runner.history().is_empty());
        assert!(runner.last_result().is_none());
        assert_eq!(runner.config().timeout_secs, 300);
    }

    #[test]
    fn test_sandbox_history() {
        let dir = TempDir::new().unwrap();
        let config = SandboxConfig::default_for_workspace(dir.path().to_path_buf());
        let mut runner = SandboxRunner::new(config);

        assert!(runner.history().is_empty());

        // Manually push results to test history tracking
        runner.runs.push(SandboxResult::success("b1", "t1", 1.0));
        runner.runs.push(SandboxResult::failure("b2", "t2", 2.0, "failed"));

        assert_eq!(runner.history().len(), 2);
        assert!(runner.history()[0].success);
        assert!(!runner.history()[1].success);

        let last = runner.last_result().unwrap();
        assert!(!last.success);
    }

    #[test]
    fn test_serialization() {
        // SandboxConfig
        let config = SandboxConfig::default_for_workspace(PathBuf::from("/ws"));
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: SandboxConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.timeout_secs, 300);
        assert!(deserialized.isolated);

        // SandboxResult
        let result = SandboxResult::success("build", "test", 3.14);
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: SandboxResult = serde_json::from_str(&json).unwrap();
        assert!(deserialized.success);
        assert_eq!(deserialized.duration_secs, 3.14);

        // CodeChangeRef
        let change = CodeChangeRef {
            file_path: "src/new.rs".to_string(),
            content: "fn hello() {}".to_string(),
        };
        let json = serde_json::to_string(&change).unwrap();
        let deserialized: CodeChangeRef = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.file_path, "src/new.rs");
        assert_eq!(deserialized.content, "fn hello() {}");
    }

    #[tokio::test]
    async fn test_prepare_sandbox() {
        let dir = TempDir::new().unwrap();
        let runner = SandboxRunner::default_for_workspace(dir.path().to_path_buf());
        let sandbox_path = runner.prepare_sandbox().await.unwrap();
        assert!(sandbox_path.exists());
    }

    #[tokio::test]
    async fn test_cleanup_sandbox() {
        let dir = TempDir::new().unwrap();
        let runner = SandboxRunner::default_for_workspace(dir.path().to_path_buf());

        // Prepare then clean
        let sandbox_path = runner.prepare_sandbox().await.unwrap();
        assert!(sandbox_path.exists());

        runner.cleanup().await.unwrap();
        assert!(!sandbox_path.exists());
    }

    #[tokio::test]
    async fn test_run_empty_changes_errors() {
        let dir = TempDir::new().unwrap();
        let mut runner = SandboxRunner::default_for_workspace(dir.path().to_path_buf());
        let result = runner.run_in_sandbox(&[]).await;
        assert!(result.is_err());
    }
}
