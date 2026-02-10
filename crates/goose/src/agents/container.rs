//! Docker container management for sandboxed code execution.
//!
//! Provides container lifecycle management (create, execute, copy, destroy)
//! for running untrusted code in isolated Docker containers.
//!
//! # Usage
//!
//! There are two ways to obtain a `Container`:
//!
//! 1. **Wrap an existing container** (backward-compatible path used by `--container` CLI flag):
//!    ```ignore
//!    let c = Container::new("abc123");
//!    ```
//!
//! 2. **Create a new managed container** that is automatically destroyed on drop:
//!    ```ignore
//!    let config = ContainerConfig::default();
//!    let c = Container::create(&config)?;
//!    let result = c.exec("echo hello")?;
//!    // container is destroyed when `c` is dropped
//!    ```

use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tracing::{debug, info, warn};

// ---------------------------------------------------------------------------
// ContainerConfig
// ---------------------------------------------------------------------------

/// Configuration for creating a new Docker container.
#[derive(Debug, Clone)]
pub struct ContainerConfig {
    /// Docker image to use (default: `"python:3.12-slim"`).
    pub image: String,
    /// Working directory inside the container.
    pub workdir: String,
    /// Memory limit (e.g. `"512m"`).
    pub memory_limit: Option<String>,
    /// CPU limit (e.g. `1.0` maps to `--cpus=1.0`).
    pub cpu_limit: Option<f64>,
    /// Network mode (default: `"none"` for full isolation).
    pub network: String,
    /// Bind-mount volumes as `(host_path, container_path)` pairs.
    pub volumes: Vec<(String, String)>,
    /// Environment variables as `(key, value)` pairs.
    pub env_vars: Vec<(String, String)>,
    /// Default timeout in seconds for container operations.
    pub timeout_secs: u64,
}

impl Default for ContainerConfig {
    fn default() -> Self {
        Self {
            image: "python:3.12-slim".to_string(),
            workdir: "/workspace".to_string(),
            memory_limit: Some("512m".to_string()),
            cpu_limit: Some(1.0),
            network: "none".to_string(),
            volumes: Vec::new(),
            env_vars: Vec::new(),
            timeout_secs: 30,
        }
    }
}

// ---------------------------------------------------------------------------
// ContainerExecResult
// ---------------------------------------------------------------------------

/// The result of executing a command inside a container.
#[derive(Debug, Clone)]
pub struct ContainerExecResult {
    /// Standard output captured from the command.
    pub stdout: String,
    /// Standard error captured from the command.
    pub stderr: String,
    /// Process exit code (`0` typically means success).
    pub exit_code: i32,
}

impl ContainerExecResult {
    /// Returns `true` when the command exited with code 0.
    pub fn success(&self) -> bool {
        self.exit_code == 0
    }
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

/// A Docker container handle.
///
/// When created through [`Container::create`] the container is *managed* and
/// will be force-removed when the handle is dropped.  When created through
/// [`Container::new`] (wrapping a pre-existing container ID) no automatic
/// cleanup is performed.
#[derive(Debug)]
pub struct Container {
    /// The Docker container ID (full or short form).
    id: String,
    /// Whether this handle owns the container lifecycle.
    /// `true` means we created it and should destroy on drop.
    managed: bool,
}

// We need Clone for backward compatibility (agent.rs stores Mutex<Option<Container>>
// and clones it).  Cloned handles are always *unmanaged* so only the original
// creator performs cleanup.
impl Clone for Container {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            managed: false, // clones never own the lifecycle
        }
    }
}

// PartialEq / Eq compare only the container ID which is the meaningful identity.
impl PartialEq for Container {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}
impl Eq for Container {}

impl Container {
    // -- constructors -------------------------------------------------------

    /// Wrap a **pre-existing** container ID.  No lifecycle management is
    /// performed; the caller is responsible for the container's lifetime.
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            managed: false,
        }
    }

    /// Create a **new** Docker container from the given configuration.
    ///
    /// The container is started in detached mode with `tail -f /dev/null` as
    /// the entrypoint so it stays alive until explicitly destroyed (or this
    /// handle is dropped).
    pub fn create(config: &ContainerConfig) -> Result<Self> {
        info!(image = %config.image, workdir = %config.workdir, "Creating Docker container");

        // First verify Docker is available
        let version_output = Command::new("docker")
            .args(["version", "--format", "{{.Server.Version}}"])
            .output()
            .context("Failed to run `docker version` -- is Docker installed and running?")?;

        if !version_output.status.success() {
            let stderr = String::from_utf8_lossy(&version_output.stderr);
            bail!(
                "Docker daemon is not reachable: {}",
                stderr.trim()
            );
        }

        // Build the `docker create` command
        let mut cmd = Command::new("docker");
        cmd.arg("create");

        // Working directory
        cmd.args(["-w", &config.workdir]);

        // Network isolation
        cmd.args(["--network", &config.network]);

        // Memory limit
        if let Some(ref mem) = config.memory_limit {
            cmd.args(["--memory", mem]);
        }

        // CPU limit
        if let Some(cpus) = config.cpu_limit {
            cmd.args(["--cpus", &cpus.to_string()]);
        }

        // Volumes
        for (host, container_path) in &config.volumes {
            cmd.args(["-v", &format!("{}:{}", host, container_path)]);
        }

        // Environment variables
        for (key, value) in &config.env_vars {
            cmd.args(["-e", &format!("{}={}", key, value)]);
        }

        // Image and keep-alive entrypoint
        cmd.arg(&config.image);
        cmd.args(["tail", "-f", "/dev/null"]);

        debug!(cmd = ?cmd, "docker create command");

        let output = cmd
            .output()
            .context("Failed to execute `docker create`")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("docker create failed: {}", stderr.trim());
        }

        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if container_id.is_empty() {
            bail!("docker create returned an empty container ID");
        }

        info!(container_id = %container_id, "Container created, starting...");

        // Start the container
        let start_output = Command::new("docker")
            .args(["start", &container_id])
            .output()
            .context("Failed to execute `docker start`")?;

        if !start_output.status.success() {
            let stderr = String::from_utf8_lossy(&start_output.stderr);
            // Best-effort cleanup of the created container
            let _ = Command::new("docker").args(["rm", "-f", &container_id]).output();
            bail!("docker start failed: {}", stderr.trim());
        }

        info!(container_id = %container_id, "Container started successfully");

        Ok(Self {
            id: container_id,
            managed: true,
        })
    }

    // -- accessors ----------------------------------------------------------

    /// Returns the Docker container ID.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Returns `true` if this handle manages the container lifecycle (i.e. it
    /// was created via [`Container::create`] and is the original, non-cloned
    /// handle).
    pub fn is_managed(&self) -> bool {
        self.managed
    }

    // -- operations ---------------------------------------------------------

    /// Execute a command inside the container using `docker exec`.
    ///
    /// The command string is passed to `/bin/sh -c` inside the container.
    pub fn exec(&self, command: &str) -> Result<ContainerExecResult> {
        debug!(container = %self.id, command = %truncate(command, 120), "docker exec");

        let output = Command::new("docker")
            .args(["exec", &self.id, "/bin/sh", "-c", command])
            .output()
            .with_context(|| format!("Failed to execute `docker exec` in container {}", &self.id))?;

        let result = ContainerExecResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        };

        debug!(
            container = %self.id,
            exit_code = result.exit_code,
            stdout_len = result.stdout.len(),
            stderr_len = result.stderr.len(),
            "docker exec completed"
        );

        Ok(result)
    }

    /// Execute a command with a timeout.
    ///
    /// This spawns a background thread for the blocking Docker CLI call and
    /// enforces the timeout from the calling thread.  If the timeout expires
    /// the child process is killed.
    pub fn exec_with_timeout(
        &self,
        command: &str,
        timeout_secs: u64,
    ) -> Result<ContainerExecResult> {
        debug!(
            container = %self.id,
            command = %truncate(command, 120),
            timeout_secs = timeout_secs,
            "docker exec (with timeout)"
        );

        let mut child = Command::new("docker")
            .args(["exec", &self.id, "/bin/sh", "-c", command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .with_context(|| {
                format!(
                    "Failed to spawn `docker exec` in container {}",
                    &self.id
                )
            })?;

        let timeout = Duration::from_secs(timeout_secs);

        match child.wait_timeout(timeout) {
            Ok(Some(status)) => {
                // Process finished within the timeout
                let stdout = read_child_stream(child.stdout.take());
                let stderr = read_child_stream(child.stderr.take());
                Ok(ContainerExecResult {
                    stdout,
                    stderr,
                    exit_code: status.code().unwrap_or(-1),
                })
            }
            Ok(None) => {
                // Timeout expired -- kill the child
                warn!(
                    container = %self.id,
                    timeout_secs = timeout_secs,
                    "docker exec timed out, killing child process"
                );
                let _ = child.kill();
                let _ = child.wait(); // reap
                bail!(
                    "Command timed out after {}s in container {}",
                    timeout_secs,
                    self.id,
                );
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                Err(e).context(format!(
                    "Error waiting for docker exec in container {}",
                    self.id
                ))
            }
        }
    }

    /// Copy a file or directory from the host into the container.
    pub fn copy_to(&self, host_path: &str, container_path: &str) -> Result<()> {
        info!(
            container = %self.id,
            host_path = %host_path,
            container_path = %container_path,
            "docker cp (host -> container)"
        );

        // Validate host path exists
        if !Path::new(host_path).exists() {
            bail!("Host path does not exist: {}", host_path);
        }

        let dest = format!("{}:{}", self.id, container_path);
        let output = Command::new("docker")
            .args(["cp", host_path, &dest])
            .output()
            .context("Failed to execute `docker cp` (host -> container)")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("docker cp to container failed: {}", stderr.trim());
        }

        debug!(container = %self.id, "docker cp (host -> container) succeeded");
        Ok(())
    }

    /// Copy a file or directory from the container to the host.
    pub fn copy_from(&self, container_path: &str, host_path: &str) -> Result<()> {
        info!(
            container = %self.id,
            container_path = %container_path,
            host_path = %host_path,
            "docker cp (container -> host)"
        );

        let src = format!("{}:{}", self.id, container_path);
        let output = Command::new("docker")
            .args(["cp", &src, host_path])
            .output()
            .context("Failed to execute `docker cp` (container -> host)")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("docker cp from container failed: {}", stderr.trim());
        }

        debug!(container = %self.id, "docker cp (container -> host) succeeded");
        Ok(())
    }

    /// Force-remove the container (`docker rm -f`).
    ///
    /// Safe to call multiple times; subsequent calls after the container has
    /// already been removed will succeed silently.
    pub fn destroy(&self) -> Result<()> {
        info!(container = %self.id, "Destroying Docker container");

        let output = Command::new("docker")
            .args(["rm", "-f", &self.id])
            .output()
            .context("Failed to execute `docker rm -f`")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // "No such container" is fine -- already removed
            if !stderr.contains("No such container") {
                bail!("docker rm -f failed: {}", stderr.trim());
            }
        }

        info!(container = %self.id, "Container destroyed");
        Ok(())
    }

    /// Check whether the container is currently running via `docker inspect`.
    pub fn is_running(&self) -> Result<bool> {
        let output = Command::new("docker")
            .args([
                "inspect",
                "--format",
                "{{.State.Running}}",
                &self.id,
            ])
            .output()
            .with_context(|| {
                format!("Failed to inspect container {}", self.id)
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("No such") {
                return Ok(false);
            }
            bail!("docker inspect failed: {}", stderr.trim());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim() == "true")
    }
}

// ---------------------------------------------------------------------------
// Drop -- auto-destroy managed containers
// ---------------------------------------------------------------------------

impl Drop for Container {
    fn drop(&mut self) {
        if self.managed {
            info!(container = %self.id, "Auto-destroying managed container on drop");
            if let Err(e) = self.destroy() {
                warn!(
                    container = %self.id,
                    error = %e,
                    "Failed to auto-destroy container on drop (best-effort)"
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Truncate a string for log display.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        let truncated: String = s.chars().take(max_len.saturating_sub(3)).collect();
        format!("{}...", truncated)
    } else {
        s.to_string()
    }
}

/// Read the entirety of an optional child stream into a `String`.
fn read_child_stream<R: std::io::Read>(stream: Option<R>) -> String {
    match stream {
        Some(mut r) => {
            let mut buf = String::new();
            let _ = r.read_to_string(&mut buf);
            buf
        }
        None => String::new(),
    }
}

// ---------------------------------------------------------------------------
// wait_timeout helper -- portable Child::wait with timeout
// ---------------------------------------------------------------------------

/// Extension trait for `std::process::Child` to support waiting with a timeout.
trait WaitTimeout {
    fn wait_timeout(
        &mut self,
        timeout: Duration,
    ) -> std::io::Result<Option<std::process::ExitStatus>>;
}

impl WaitTimeout for std::process::Child {
    /// Wait for the child to exit, but no longer than `timeout`.
    ///
    /// Returns `Ok(Some(status))` if the child exited within the timeout,
    /// `Ok(None)` if the timeout expired, or `Err` on I/O error.
    fn wait_timeout(
        &mut self,
        timeout: Duration,
    ) -> std::io::Result<Option<std::process::ExitStatus>> {
        let start = std::time::Instant::now();
        let poll_interval = Duration::from_millis(50);

        loop {
            match self.try_wait()? {
                Some(status) => return Ok(Some(status)),
                None => {
                    if start.elapsed() >= timeout {
                        return Ok(None);
                    }
                    std::thread::sleep(poll_interval.min(timeout - start.elapsed()));
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Unit tests that do NOT require Docker --------------------------------

    #[test]
    fn test_container_new_sets_id() {
        let c = Container::new("abc123");
        assert_eq!(c.id(), "abc123");
        assert!(!c.is_managed());
    }

    #[test]
    fn test_container_clone_is_unmanaged() {
        let c = Container {
            id: "xyz".to_string(),
            managed: true,
        };
        let c2 = c.clone();
        assert_eq!(c2.id(), "xyz");
        assert!(!c2.is_managed(), "cloned container must not be managed");
    }

    #[test]
    fn test_container_equality() {
        let a = Container::new("same");
        let b = Container::new("same");
        let c = Container::new("different");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn test_container_config_default() {
        let cfg = ContainerConfig::default();
        assert_eq!(cfg.image, "python:3.12-slim");
        assert_eq!(cfg.workdir, "/workspace");
        assert_eq!(cfg.network, "none");
        assert_eq!(cfg.memory_limit, Some("512m".to_string()));
        assert_eq!(cfg.cpu_limit, Some(1.0));
        assert!(cfg.volumes.is_empty());
        assert!(cfg.env_vars.is_empty());
        assert_eq!(cfg.timeout_secs, 30);
    }

    #[test]
    fn test_exec_result_success() {
        let ok = ContainerExecResult {
            stdout: "hello".into(),
            stderr: String::new(),
            exit_code: 0,
        };
        assert!(ok.success());

        let fail = ContainerExecResult {
            stdout: String::new(),
            stderr: "error".into(),
            exit_code: 1,
        };
        assert!(!fail.success());
    }

    #[test]
    fn test_truncate_helper() {
        assert_eq!(truncate("short", 100), "short");
        assert_eq!(truncate("hello world", 8), "hello...");
    }

    #[test]
    fn test_copy_to_validates_host_path() {
        let c = Container::new("fake-id");
        let err = c
            .copy_to("/nonexistent/path/that/does/not/exist", "/dest")
            .unwrap_err();
        assert!(
            err.to_string().contains("does not exist"),
            "Expected host path validation error, got: {}",
            err
        );
    }

    // -- Integration tests that require Docker --------------------------------
    // These are gated behind the `docker_tests` cfg so they don't run in CI
    // unless explicitly enabled: `cargo test --features docker_tests`

    #[cfg(feature = "docker_tests")]
    mod docker_integration {
        use super::*;

        #[test]
        fn test_create_exec_destroy() {
            let config = ContainerConfig {
                image: "alpine:latest".to_string(),
                ..ContainerConfig::default()
            };

            let container = Container::create(&config)
                .expect("Failed to create container (is Docker running?)");
            assert!(!container.id().is_empty());
            assert!(container.is_managed());
            assert!(container.is_running().unwrap());

            let result = container.exec("echo hello").unwrap();
            assert_eq!(result.exit_code, 0);
            assert_eq!(result.stdout.trim(), "hello");
            assert!(result.stderr.is_empty());

            container.destroy().unwrap();
            assert!(!container.is_running().unwrap());
        }

        #[test]
        fn test_exec_with_timeout_succeeds() {
            let config = ContainerConfig {
                image: "alpine:latest".to_string(),
                ..ContainerConfig::default()
            };
            let container = Container::create(&config).unwrap();

            let result = container
                .exec_with_timeout("echo fast", 5)
                .unwrap();
            assert_eq!(result.exit_code, 0);
            assert_eq!(result.stdout.trim(), "fast");

            container.destroy().unwrap();
        }

        #[test]
        fn test_exec_with_timeout_expires() {
            let config = ContainerConfig {
                image: "alpine:latest".to_string(),
                ..ContainerConfig::default()
            };
            let container = Container::create(&config).unwrap();

            let err = container
                .exec_with_timeout("sleep 60", 1)
                .unwrap_err();
            assert!(
                err.to_string().contains("timed out"),
                "Expected timeout error, got: {}",
                err
            );

            container.destroy().unwrap();
        }

        #[test]
        fn test_copy_to_and_from() {
            let config = ContainerConfig {
                image: "alpine:latest".to_string(),
                ..ContainerConfig::default()
            };
            let container = Container::create(&config).unwrap();

            // Create a temp file on the host
            let tmp = tempfile::NamedTempFile::new().unwrap();
            std::fs::write(tmp.path(), "test content").unwrap();

            // Copy into container
            container
                .copy_to(
                    tmp.path().to_str().unwrap(),
                    "/workspace/test_file.txt",
                )
                .unwrap();

            // Verify it arrived
            let result = container
                .exec("cat /workspace/test_file.txt")
                .unwrap();
            assert_eq!(result.stdout, "test content");

            // Copy back out
            let out_dir = tempfile::tempdir().unwrap();
            let out_path = out_dir.path().join("copied_back.txt");
            container
                .copy_from(
                    "/workspace/test_file.txt",
                    out_path.to_str().unwrap(),
                )
                .unwrap();

            let contents = std::fs::read_to_string(&out_path).unwrap();
            assert_eq!(contents, "test content");

            container.destroy().unwrap();
        }

        #[test]
        fn test_drop_destroys_managed_container() {
            let config = ContainerConfig {
                image: "alpine:latest".to_string(),
                ..ContainerConfig::default()
            };
            let container = Container::create(&config).unwrap();
            let cid = container.id().to_string();

            // Drop the container
            drop(container);

            // Verify it's gone
            let output = Command::new("docker")
                .args(["inspect", &cid])
                .output()
                .unwrap();
            assert!(
                !output.status.success(),
                "Container should have been removed on drop"
            );
        }
    }
}
