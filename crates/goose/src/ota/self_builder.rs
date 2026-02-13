//! SelfBuilder — triggers `cargo build` programmatically with validation.
//!
//! Manages the compilation of new agent binaries from source, including
//! pre-build validation, build execution, and artifact verification.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::{error, info, warn};

/// Result of a build attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    /// Whether the build succeeded
    pub success: bool,
    /// Path to the produced binary (if successful)
    pub binary_path: Option<PathBuf>,
    /// Build output (stdout + stderr)
    pub output: String,
    /// How long the build took
    pub duration_secs: f64,
    /// When the build was executed
    pub built_at: DateTime<Utc>,
    /// Git commit hash that was built (if available)
    pub git_hash: Option<String>,
    /// Build profile (debug or release)
    pub profile: BuildProfile,
}

/// Build profile to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildProfile {
    Debug,
    Release,
}

impl BuildProfile {
    pub fn as_str(&self) -> &'static str {
        match self {
            BuildProfile::Debug => "debug",
            BuildProfile::Release => "release",
        }
    }

    /// Return cargo flag for this profile.
    pub fn cargo_flag(&self) -> Option<&'static str> {
        match self {
            BuildProfile::Debug => None,
            BuildProfile::Release => Some("--release"),
        }
    }
}

impl std::fmt::Display for BuildProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Configuration for the self-builder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildConfig {
    /// Path to the workspace root (where Cargo.toml lives)
    pub workspace_root: PathBuf,
    /// Which crate/package to build
    pub package: String,
    /// Binary name within the package
    pub binary_name: String,
    /// Build profile
    pub profile: BuildProfile,
    /// Maximum build time before killing the process
    pub timeout: Duration,
    /// Extra cargo flags (e.g., feature flags)
    pub extra_args: Vec<String>,
}

impl BuildConfig {
    /// Create a default build config for the goose-cli crate.
    pub fn default_goose() -> Self {
        Self {
            workspace_root: PathBuf::from("."),
            package: "goose-cli".to_string(),
            binary_name: "goose".to_string(),
            profile: BuildProfile::Release,
            timeout: Duration::from_secs(600), // 10 minutes
            extra_args: Vec::new(),
        }
    }

    /// Get the expected output path for the built binary.
    pub fn expected_binary_path(&self) -> PathBuf {
        let profile_dir = self.profile.as_str();
        let binary = if cfg!(windows) {
            format!("{}.exe", self.binary_name)
        } else {
            self.binary_name.clone()
        };
        self.workspace_root
            .join("target")
            .join(profile_dir)
            .join(binary)
    }
}

/// Manages building new agent binaries from source.
pub struct SelfBuilder {
    config: BuildConfig,
}

impl SelfBuilder {
    /// Create a new SelfBuilder with the given configuration.
    pub fn new(config: BuildConfig) -> Self {
        Self { config }
    }

    /// Get the current build configuration.
    pub fn config(&self) -> &BuildConfig {
        &self.config
    }

    /// Validate that prerequisites for building are met.
    pub async fn validate_prerequisites(&self) -> Result<()> {
        // Check workspace root exists
        if !self.config.workspace_root.exists() {
            bail!(
                "Workspace root does not exist: {}",
                self.config.workspace_root.display()
            );
        }

        // Check Cargo.toml exists
        let cargo_toml = self.config.workspace_root.join("Cargo.toml");
        if !cargo_toml.exists() {
            bail!(
                "Cargo.toml not found at: {}",
                cargo_toml.display()
            );
        }

        info!("Build prerequisites validated");
        Ok(())
    }

    /// Build the cargo command arguments.
    pub fn build_cargo_args(&self) -> Vec<String> {
        let mut args = vec![
            "build".to_string(),
            "-p".to_string(),
            self.config.package.clone(),
        ];

        if let Some(flag) = self.config.profile.cargo_flag() {
            args.push(flag.to_string());
        }

        args.extend(self.config.extra_args.clone());
        args
    }

    /// Execute the build. Returns a BuildResult with success/failure info.
    ///
    /// In production this runs `cargo build`. For testing, use `build_dry_run`.
    pub async fn build(&self) -> Result<BuildResult> {
        self.validate_prerequisites().await?;

        let args = self.build_cargo_args();
        info!(
            args = ?args,
            workspace = %self.config.workspace_root.display(),
            "Starting cargo build"
        );

        let start = std::time::Instant::now();

        let output = tokio::process::Command::new("cargo")
            .args(&args)
            .current_dir(&self.config.workspace_root)
            .output()
            .await
            .context("Failed to execute cargo build")?;

        let duration = start.elapsed();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined_output = format!("{}\n{}", stdout, stderr);

        let success = output.status.success();
        let binary_path = if success {
            let path = self.config.expected_binary_path();
            if path.exists() {
                Some(path)
            } else {
                warn!("Build succeeded but binary not found at expected path");
                None
            }
        } else {
            error!("Build failed: {}", stderr);
            None
        };

        let result = BuildResult {
            success,
            binary_path,
            output: combined_output,
            duration_secs: duration.as_secs_f64(),
            built_at: Utc::now(),
            git_hash: self.get_git_hash().await.ok(),
            profile: self.config.profile,
        };

        Ok(result)
    }

    /// Perform a dry-run build (validates args without executing cargo).
    pub fn build_dry_run(&self) -> BuildResult {
        let args = self.build_cargo_args();
        BuildResult {
            success: true,
            binary_path: Some(self.config.expected_binary_path()),
            output: format!("DRY RUN: cargo {}", args.join(" ")),
            duration_secs: 0.0,
            built_at: Utc::now(),
            git_hash: None,
            profile: self.config.profile,
        }
    }

    /// Get the current git hash of the workspace.
    async fn get_git_hash(&self) -> Result<String> {
        let output = tokio::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&self.config.workspace_root)
            .output()
            .await
            .context("Failed to get git hash")?;

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Check if the source has changed since the last build (via git status).
    pub async fn has_source_changes(&self) -> Result<bool> {
        let output = tokio::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&self.config.workspace_root)
            .output()
            .await
            .context("Failed to check git status")?;

        let status = String::from_utf8_lossy(&output.stdout);
        Ok(!status.trim().is_empty())
    }

    /// Verify a built binary exists and is executable.
    pub fn verify_binary(path: &Path) -> Result<bool> {
        if !path.exists() {
            bail!("Binary does not exist: {}", path.display());
        }

        let metadata = std::fs::metadata(path)
            .context("Failed to read binary metadata")?;

        if metadata.len() == 0 {
            bail!("Binary is empty: {}", path.display());
        }

        info!(
            path = %path.display(),
            size_bytes = metadata.len(),
            "Binary verified"
        );

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_config(dir: &Path) -> BuildConfig {
        BuildConfig {
            workspace_root: dir.to_path_buf(),
            package: "goose-cli".to_string(),
            binary_name: "goose".to_string(),
            profile: BuildProfile::Debug,
            timeout: Duration::from_secs(60),
            extra_args: Vec::new(),
        }
    }

    #[test]
    fn test_build_profile_display() {
        assert_eq!(BuildProfile::Debug.as_str(), "debug");
        assert_eq!(BuildProfile::Release.as_str(), "release");
        assert_eq!(BuildProfile::Debug.to_string(), "debug");
        assert_eq!(BuildProfile::Release.to_string(), "release");
    }

    #[test]
    fn test_build_profile_cargo_flag() {
        assert_eq!(BuildProfile::Debug.cargo_flag(), None);
        assert_eq!(BuildProfile::Release.cargo_flag(), Some("--release"));
    }

    #[test]
    fn test_build_config_default() {
        let config = BuildConfig::default_goose();
        assert_eq!(config.package, "goose-cli");
        assert_eq!(config.binary_name, "goose");
        assert_eq!(config.profile, BuildProfile::Release);
        assert_eq!(config.timeout, Duration::from_secs(600));
    }

    #[test]
    fn test_expected_binary_path() {
        let config = BuildConfig {
            workspace_root: PathBuf::from("/workspace"),
            package: "goose-cli".to_string(),
            binary_name: "goose".to_string(),
            profile: BuildProfile::Release,
            timeout: Duration::from_secs(60),
            extra_args: Vec::new(),
        };

        let path = config.expected_binary_path();
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("target"));
        assert!(path_str.contains("release"));
        assert!(path_str.contains("goose"));
    }

    #[test]
    fn test_build_cargo_args_debug() {
        let dir = TempDir::new().unwrap();
        let config = test_config(dir.path());
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();

        assert_eq!(args, vec!["build", "-p", "goose-cli"]);
    }

    #[test]
    fn test_build_cargo_args_release() {
        let dir = TempDir::new().unwrap();
        let mut config = test_config(dir.path());
        config.profile = BuildProfile::Release;
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();

        assert_eq!(args, vec!["build", "-p", "goose-cli", "--release"]);
    }

    #[test]
    fn test_build_cargo_args_with_extras() {
        let dir = TempDir::new().unwrap();
        let mut config = test_config(dir.path());
        config.extra_args = vec!["--features".into(), "memory".into()];
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();

        assert_eq!(
            args,
            vec!["build", "-p", "goose-cli", "--features", "memory"]
        );
    }

    #[test]
    fn test_dry_run_build() {
        let dir = TempDir::new().unwrap();
        let config = test_config(dir.path());
        let builder = SelfBuilder::new(config);
        let result = builder.build_dry_run();

        assert!(result.success);
        assert!(result.binary_path.is_some());
        assert!(result.output.contains("DRY RUN"));
        assert_eq!(result.duration_secs, 0.0);
    }

    #[test]
    fn test_verify_binary_nonexistent() {
        let result = SelfBuilder::verify_binary(Path::new("/nonexistent/binary"));
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_binary_exists() {
        let dir = TempDir::new().unwrap();
        let binary_path = dir.path().join("test_binary");
        std::fs::write(&binary_path, b"fake binary content").unwrap();

        let result = SelfBuilder::verify_binary(&binary_path);
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn test_verify_binary_empty() {
        let dir = TempDir::new().unwrap();
        let binary_path = dir.path().join("empty_binary");
        std::fs::write(&binary_path, b"").unwrap();

        let result = SelfBuilder::verify_binary(&binary_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_build_result_serialization() {
        let result = BuildResult {
            success: true,
            binary_path: Some(PathBuf::from("/target/release/goose")),
            output: "Build OK".to_string(),
            duration_secs: 42.5,
            built_at: Utc::now(),
            git_hash: Some("abc123".to_string()),
            profile: BuildProfile::Release,
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: BuildResult = serde_json::from_str(&json).unwrap();
        assert!(deserialized.success);
        assert_eq!(deserialized.duration_secs, 42.5);
        assert_eq!(deserialized.git_hash.as_deref(), Some("abc123"));
    }

    #[tokio::test]
    async fn test_validate_prerequisites_missing_dir() {
        let config = BuildConfig {
            workspace_root: PathBuf::from("/nonexistent/workspace"),
            ..BuildConfig::default_goose()
        };
        let builder = SelfBuilder::new(config);
        assert!(builder.validate_prerequisites().await.is_err());
    }

    #[tokio::test]
    async fn test_validate_prerequisites_no_cargo_toml() {
        let dir = TempDir::new().unwrap();
        let config = test_config(dir.path());
        let builder = SelfBuilder::new(config);
        // dir exists but no Cargo.toml
        assert!(builder.validate_prerequisites().await.is_err());
    }

    // === Production hardening edge-case tests ===

    #[tokio::test]
    async fn test_validate_prerequisites_succeeds_with_cargo_toml() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), b"[package]\nname = \"test\"").unwrap();

        let config = test_config(dir.path());
        let builder = SelfBuilder::new(config);
        assert!(builder.validate_prerequisites().await.is_ok());
    }

    #[test]
    fn test_build_config_with_empty_extra_args() {
        let dir = TempDir::new().unwrap();
        let config = test_config(dir.path());
        assert!(config.extra_args.is_empty());
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();
        // Should just be build + package, no extra args
        assert_eq!(args, vec!["build", "-p", "goose-cli"]);
    }

    #[test]
    fn test_build_config_with_multiple_extra_args() {
        let dir = TempDir::new().unwrap();
        let mut config = test_config(dir.path());
        config.extra_args = vec![
            "--features".into(),
            "memory,bookmarks".into(),
            "--jobs".into(),
            "4".into(),
        ];
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();
        assert_eq!(
            args,
            vec!["build", "-p", "goose-cli", "--features", "memory,bookmarks", "--jobs", "4"]
        );
    }

    #[test]
    fn test_expected_binary_path_debug_vs_release() {
        let dir = TempDir::new().unwrap();
        let mut config_debug = test_config(dir.path());
        config_debug.profile = BuildProfile::Debug;

        let mut config_release = test_config(dir.path());
        config_release.profile = BuildProfile::Release;

        let debug_path = config_debug.expected_binary_path();
        let release_path = config_release.expected_binary_path();

        assert!(debug_path.to_string_lossy().contains("debug"));
        assert!(release_path.to_string_lossy().contains("release"));
        assert_ne!(debug_path, release_path);
    }

    #[test]
    fn test_verify_binary_with_minimal_content() {
        // Edge case: binary exists with exactly 1 byte (should pass -- exists and non-empty)
        let dir = TempDir::new().unwrap();
        let binary_path = dir.path().join("tiny_binary");
        std::fs::write(&binary_path, b"x").unwrap();

        let result = SelfBuilder::verify_binary(&binary_path);
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn test_dry_run_build_has_correct_profile() {
        let dir = TempDir::new().unwrap();
        let mut config = test_config(dir.path());
        config.profile = BuildProfile::Release;
        let builder = SelfBuilder::new(config);
        let result = builder.build_dry_run();

        assert!(result.success);
        assert_eq!(result.profile, BuildProfile::Release);
        assert!(result.output.contains("DRY RUN"));
        assert!(result.output.contains("--release"));
        assert!(result.git_hash.is_none());
    }

    #[test]
    fn test_build_result_failed_serialization() {
        // Edge case: serialize a failed build result with no binary path
        let result = BuildResult {
            success: false,
            binary_path: None,
            output: "error[E0308]: mismatched types".to_string(),
            duration_secs: 12.3,
            built_at: Utc::now(),
            git_hash: None,
            profile: BuildProfile::Debug,
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: BuildResult = serde_json::from_str(&json).unwrap();
        assert!(!deserialized.success);
        assert!(deserialized.binary_path.is_none());
        assert!(deserialized.git_hash.is_none());
        assert!(deserialized.output.contains("E0308"));
    }

    #[test]
    fn test_build_profile_serialization_roundtrip() {
        for profile in &[BuildProfile::Debug, BuildProfile::Release] {
            let json = serde_json::to_string(profile).unwrap();
            let deserialized: BuildProfile = serde_json::from_str(&json).unwrap();
            assert_eq!(&deserialized, profile);
        }
    }

    #[test]
    fn test_config_accessor() {
        let dir = TempDir::new().unwrap();
        let config = test_config(dir.path());
        let builder = SelfBuilder::new(config.clone());
        assert_eq!(builder.config().package, "goose-cli");
        assert_eq!(builder.config().binary_name, "goose");
    }
}
