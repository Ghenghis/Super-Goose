//! BranchManager — Git branch operations for autonomous workflows.
//!
//! Provides methods for creating, switching, and managing git branches,
//! as well as creating pull requests and merging branches. All operations
//! go through a command executor trait that can be mocked for testing.

use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{info, warn};

/// Result of a git operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitOpResult {
    /// Whether the operation succeeded.
    pub success: bool,
    /// Human-readable description of what happened.
    pub description: String,
    /// The git command that was executed (for audit logging).
    pub command: String,
    /// Timestamp of the operation.
    pub timestamp: DateTime<Utc>,
}

impl GitOpResult {
    pub fn ok(description: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            success: true,
            description: description.into(),
            command: command.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn fail(description: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            success: false,
            description: description.into(),
            command: command.into(),
            timestamp: Utc::now(),
        }
    }
}

/// Pull request specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestSpec {
    pub title: String,
    pub body: String,
    pub head_branch: String,
    pub base_branch: String,
    pub labels: Vec<String>,
    pub draft: bool,
}

impl PullRequestSpec {
    pub fn new(
        title: impl Into<String>,
        head_branch: impl Into<String>,
        base_branch: impl Into<String>,
    ) -> Self {
        Self {
            title: title.into(),
            body: String::new(),
            head_branch: head_branch.into(),
            base_branch: base_branch.into(),
            labels: Vec::new(),
            draft: false,
        }
    }

    pub fn with_body(mut self, body: impl Into<String>) -> Self {
        self.body = body.into();
        self
    }

    pub fn with_labels(mut self, labels: Vec<String>) -> Self {
        self.labels = labels;
        self
    }

    pub fn as_draft(mut self) -> Self {
        self.draft = true;
        self
    }
}

/// Trait for executing git commands — allows mocking in tests.
pub trait GitExecutor: Send + Sync {
    fn execute(&self, args: &[&str], cwd: &PathBuf) -> Result<String>;
}

/// Real git executor that runs git commands via subprocess.
pub struct RealGitExecutor;

impl GitExecutor for RealGitExecutor {
    fn execute(&self, args: &[&str], cwd: &PathBuf) -> Result<String> {
        let output = std::process::Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            bail!("git {} failed: {}", args.join(" "), stderr)
        }
    }
}

/// Manages git branch operations for autonomous workflows.
pub struct BranchManager {
    /// Path to the git repository.
    repo_path: PathBuf,
    /// The command executor (real or mock).
    executor: Box<dyn GitExecutor>,
    /// History of operations.
    history: Vec<GitOpResult>,
}

impl BranchManager {
    /// Create a new branch manager with a real git executor.
    pub fn new(repo_path: PathBuf) -> Self {
        Self {
            repo_path,
            executor: Box::new(RealGitExecutor),
            history: Vec::new(),
        }
    }

    /// Create a branch manager with a custom executor (for testing).
    pub fn with_executor(repo_path: PathBuf, executor: Box<dyn GitExecutor>) -> Self {
        Self {
            repo_path,
            executor,
            history: Vec::new(),
        }
    }

    /// Create a new branch from the current HEAD or a specified base.
    pub fn create_branch(&mut self, name: &str, base: Option<&str>) -> Result<String> {
        let cmd = if let Some(base_branch) = base {
            format!("git checkout -b {} {}", name, base_branch)
        } else {
            format!("git checkout -b {}", name)
        };

        let args: Vec<&str> = if let Some(base_branch) = base {
            vec!["checkout", "-b", name, base_branch]
        } else {
            vec!["checkout", "-b", name]
        };

        match self.executor.execute(&args, &self.repo_path) {
            Ok(_output) => {
                let desc = format!("Created branch '{}'{}", name,
                    base.map_or(String::new(), |b| format!(" from '{}'", b)));
                info!(branch = name, "Created branch");
                self.history.push(GitOpResult::ok(&desc, &cmd));
                Ok(desc)
            }
            Err(e) => {
                let desc = format!("Failed to create branch '{}': {}", name, e);
                warn!(branch = name, error = %e, "Failed to create branch");
                self.history.push(GitOpResult::fail(&desc, &cmd));
                bail!(desc)
            }
        }
    }

    /// Switch to an existing branch.
    pub fn switch_branch(&mut self, name: &str) -> Result<String> {
        let cmd = format!("git checkout {}", name);
        match self.executor.execute(&["checkout", name], &self.repo_path) {
            Ok(_) => {
                let desc = format!("Switched to branch '{}'", name);
                info!(branch = name, "Switched branch");
                self.history.push(GitOpResult::ok(&desc, &cmd));
                Ok(desc)
            }
            Err(e) => {
                let desc = format!("Failed to switch to branch '{}': {}", name, e);
                warn!(branch = name, error = %e, "Failed to switch branch");
                self.history.push(GitOpResult::fail(&desc, &cmd));
                bail!(desc)
            }
        }
    }

    /// Create a pull request (via gh CLI or API — abstracted through executor).
    pub fn create_pr(&mut self, spec: &PullRequestSpec) -> Result<String> {
        let mut args = vec![
            "pr", "create",
            "--title", &spec.title,
            "--head", &spec.head_branch,
            "--base", &spec.base_branch,
        ];

        if !spec.body.is_empty() {
            args.push("--body");
            args.push(&spec.body);
        }

        if spec.draft {
            args.push("--draft");
        }

        let cmd = format!("gh {}", args.join(" "));

        // Use gh CLI for PR creation
        match self.execute_gh(&args) {
            Ok(url) => {
                let desc = format!("Created PR '{}': {}", spec.title, url);
                info!(pr = %spec.title, "Created pull request");
                self.history.push(GitOpResult::ok(&desc, &cmd));
                Ok(desc)
            }
            Err(e) => {
                let desc = format!("Failed to create PR '{}': {}", spec.title, e);
                warn!(pr = %spec.title, error = %e, "Failed to create PR");
                self.history.push(GitOpResult::fail(&desc, &cmd));
                bail!(desc)
            }
        }
    }

    /// Merge a branch into the current branch.
    pub fn merge_branch(&mut self, branch: &str, no_ff: bool) -> Result<String> {
        let args = if no_ff {
            vec!["merge", "--no-ff", branch]
        } else {
            vec!["merge", branch]
        };

        let cmd = format!("git {}", args.join(" "));

        match self.executor.execute(&args, &self.repo_path) {
            Ok(_) => {
                let desc = format!("Merged branch '{}'", branch);
                info!(branch = branch, "Merged branch");
                self.history.push(GitOpResult::ok(&desc, &cmd));
                Ok(desc)
            }
            Err(e) => {
                let desc = format!("Failed to merge branch '{}': {}", branch, e);
                warn!(branch = branch, error = %e, "Failed to merge branch");
                self.history.push(GitOpResult::fail(&desc, &cmd));
                bail!(desc)
            }
        }
    }

    /// Get the current branch name.
    pub fn current_branch(&self) -> Result<String> {
        self.executor
            .execute(&["rev-parse", "--abbrev-ref", "HEAD"], &self.repo_path)
    }

    /// List all branches.
    pub fn list_branches(&self) -> Result<Vec<String>> {
        let output = self
            .executor
            .execute(&["branch", "--list", "--format=%(refname:short)"], &self.repo_path)?;

        Ok(output.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
    }

    /// Delete a branch.
    pub fn delete_branch(&mut self, name: &str, force: bool) -> Result<String> {
        let flag = if force { "-D" } else { "-d" };
        let cmd = format!("git branch {} {}", flag, name);

        match self.executor.execute(&["branch", flag, name], &self.repo_path) {
            Ok(_) => {
                let desc = format!("Deleted branch '{}'", name);
                info!(branch = name, "Deleted branch");
                self.history.push(GitOpResult::ok(&desc, &cmd));
                Ok(desc)
            }
            Err(e) => {
                let desc = format!("Failed to delete branch '{}': {}", name, e);
                self.history.push(GitOpResult::fail(&desc, &cmd));
                bail!(desc)
            }
        }
    }

    /// Get operation history.
    pub fn history(&self) -> &[GitOpResult] {
        &self.history
    }

    /// Execute a `gh` CLI command (abstracted for testing).
    fn execute_gh(&self, args: &[&str]) -> Result<String> {
        // In production, this would call `gh` CLI
        // For now, delegate through the git executor with a different binary
        let output = std::process::Command::new("gh")
            .args(args)
            .current_dir(&self.repo_path)
            .output()?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            bail!("gh {} failed: {}", args.join(" "), stderr)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// Mock git executor that records commands and returns predefined responses.
    struct MockGitExecutor {
        responses: Arc<Mutex<Vec<Result<String>>>>,
        calls: Arc<Mutex<Vec<String>>>,
    }

    impl MockGitExecutor {
        fn new(responses: Vec<Result<String>>) -> Self {
            Self {
                responses: Arc::new(Mutex::new(responses)),
                calls: Arc::new(Mutex::new(Vec::new())),
            }
        }

        #[allow(dead_code)]
        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl GitExecutor for MockGitExecutor {
        fn execute(&self, args: &[&str], _cwd: &PathBuf) -> Result<String> {
            self.calls.lock().unwrap().push(args.join(" "));
            let mut responses = self.responses.lock().unwrap();
            if responses.is_empty() {
                bail!("No more mock responses")
            }
            responses.remove(0)
        }
    }

    fn make_mock_manager(responses: Vec<Result<String>>) -> (BranchManager, Arc<Mutex<Vec<String>>>) {
        let executor = MockGitExecutor::new(responses);
        let calls = executor.calls.clone();
        let manager = BranchManager::with_executor(
            PathBuf::from("/tmp/test-repo"),
            Box::new(executor),
        );
        (manager, calls)
    }

    #[test]
    fn test_create_branch() {
        let (mut manager, calls) = make_mock_manager(vec![
            Ok("Switched to a new branch 'feat/test'".into()),
        ]);

        let result = manager.create_branch("feat/test", None).unwrap();
        assert!(result.contains("Created branch 'feat/test'"));

        let recorded = calls.lock().unwrap();
        assert_eq!(recorded[0], "checkout -b feat/test");
    }

    #[test]
    fn test_create_branch_from_base() {
        let (mut manager, calls) = make_mock_manager(vec![
            Ok("Switched to a new branch 'feat/test'".into()),
        ]);

        let result = manager.create_branch("feat/test", Some("main")).unwrap();
        assert!(result.contains("from 'main'"));

        let recorded = calls.lock().unwrap();
        assert_eq!(recorded[0], "checkout -b feat/test main");
    }

    #[test]
    fn test_create_branch_failure() {
        let (mut manager, _) = make_mock_manager(vec![
            Err(anyhow::anyhow!("branch already exists")),
        ]);

        let result = manager.create_branch("feat/existing", None);
        assert!(result.is_err());
        assert_eq!(manager.history().len(), 1);
        assert!(!manager.history()[0].success);
    }

    #[test]
    fn test_switch_branch() {
        let (mut manager, calls) = make_mock_manager(vec![
            Ok("Switched to branch 'main'".into()),
        ]);

        let result = manager.switch_branch("main").unwrap();
        assert!(result.contains("Switched to branch 'main'"));

        let recorded = calls.lock().unwrap();
        assert_eq!(recorded[0], "checkout main");
    }

    #[test]
    fn test_merge_branch() {
        let (mut manager, calls) = make_mock_manager(vec![
            Ok("Merge made by recursive".into()),
        ]);

        let result = manager.merge_branch("feat/test", false).unwrap();
        assert!(result.contains("Merged branch 'feat/test'"));

        let recorded = calls.lock().unwrap();
        assert_eq!(recorded[0], "merge feat/test");
    }

    #[test]
    fn test_merge_branch_no_ff() {
        let (mut manager, calls) = make_mock_manager(vec![
            Ok("Merge made by recursive".into()),
        ]);

        manager.merge_branch("feat/test", true).unwrap();

        let recorded = calls.lock().unwrap();
        assert_eq!(recorded[0], "merge --no-ff feat/test");
    }

    #[test]
    fn test_current_branch() {
        let (manager, _) = make_mock_manager(vec![
            Ok("main".into()),
        ]);

        let branch = manager.current_branch().unwrap();
        assert_eq!(branch, "main");
    }

    #[test]
    fn test_list_branches() {
        let (manager, _) = make_mock_manager(vec![
            Ok("main\nfeat/test\nfeat/other".into()),
        ]);

        let branches = manager.list_branches().unwrap();
        assert_eq!(branches, vec!["main", "feat/test", "feat/other"]);
    }

    #[test]
    fn test_delete_branch() {
        let (mut manager, calls) = make_mock_manager(vec![
            Ok("Deleted branch 'feat/old'".into()),
        ]);

        let result = manager.delete_branch("feat/old", false).unwrap();
        assert!(result.contains("Deleted branch 'feat/old'"));

        let recorded = calls.lock().unwrap();
        assert_eq!(recorded[0], "branch -d feat/old");
    }

    #[test]
    fn test_history_tracking() {
        let (mut manager, _) = make_mock_manager(vec![
            Ok("ok".into()),
            Err(anyhow::anyhow!("fail")),
            Ok("ok".into()),
        ]);

        manager.switch_branch("feat/a").unwrap();
        let _ = manager.switch_branch("nonexistent");
        manager.switch_branch("main").unwrap();

        assert_eq!(manager.history().len(), 3);
        assert!(manager.history()[0].success);
        assert!(!manager.history()[1].success);
        assert!(manager.history()[2].success);
    }

    #[test]
    fn test_pull_request_spec() {
        let spec = PullRequestSpec::new("Fix bug", "feat/fix", "main")
            .with_body("This fixes the issue")
            .with_labels(vec!["bug".into()])
            .as_draft();

        assert_eq!(spec.title, "Fix bug");
        assert_eq!(spec.body, "This fixes the issue");
        assert_eq!(spec.head_branch, "feat/fix");
        assert_eq!(spec.base_branch, "main");
        assert!(spec.draft);
        assert_eq!(spec.labels, vec!["bug"]);
    }

    #[test]
    fn test_git_op_result() {
        let ok = GitOpResult::ok("Created branch", "git checkout -b test");
        assert!(ok.success);
        assert_eq!(ok.description, "Created branch");

        let fail = GitOpResult::fail("Failed", "git checkout bad");
        assert!(!fail.success);
    }
}
