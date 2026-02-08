//! ALMAS Team Role Definitions
//!
//! Defines the five specialized roles in the Autonomous Multi-Agent
//! Software Engineering (ALMAS) system:
//! - Architect: System design and planning
//! - Developer: Code implementation
//! - QA: Quality assurance and testing
//! - Security: Security scanning and validation
//! - Deployer: Build and deployment
//!
//! Each role has strict capabilities and handoff rules enforced at runtime.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// The five ALMAS specialist roles
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlmasRole {
    /// System architect - designs and plans
    Architect,
    /// Developer - implements code
    Developer,
    /// QA engineer - tests and validates
    Qa,
    /// Security analyst - scans for vulnerabilities
    Security,
    /// Deployer - builds and releases
    Deployer,
}

impl AlmasRole {
    /// Get all ALMAS roles in workflow order
    pub fn all() -> Vec<AlmasRole> {
        vec![
            AlmasRole::Architect,
            AlmasRole::Developer,
            AlmasRole::Qa,
            AlmasRole::Security,
            AlmasRole::Deployer,
        ]
    }

    /// Get the role ID string
    pub fn role_id(&self) -> &'static str {
        match self {
            AlmasRole::Architect => "architect",
            AlmasRole::Developer => "developer",
            AlmasRole::Qa => "qa",
            AlmasRole::Security => "security",
            AlmasRole::Deployer => "deployer",
        }
    }

    /// Get the human-readable role name
    pub fn role_name(&self) -> &'static str {
        match self {
            AlmasRole::Architect => "ALMAS Architect",
            AlmasRole::Developer => "ALMAS Developer",
            AlmasRole::Qa => "ALMAS QA Engineer",
            AlmasRole::Security => "ALMAS Security Analyst",
            AlmasRole::Deployer => "ALMAS Deployer",
        }
    }

    /// Get role description
    pub fn description(&self) -> &'static str {
        match self {
            AlmasRole::Architect => "System design and architecture planning specialist",
            AlmasRole::Developer => "Code implementation specialist following architectural plans",
            AlmasRole::Qa => "Quality assurance and comprehensive testing specialist",
            AlmasRole::Security => "Security scanning and vulnerability detection specialist",
            AlmasRole::Deployer => "Build, packaging, and deployment specialist",
        }
    }

    /// Check if this is the final role in the workflow
    pub fn is_final(&self) -> bool {
        matches!(self, AlmasRole::Deployer)
    }
}

impl std::fmt::Display for AlmasRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.role_id())
    }
}

/// Capabilities that can be granted or denied to roles
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleCapabilities {
    /// Can read files
    pub can_read: bool,
    /// Can write files
    pub can_write: bool,
    /// Can execute commands
    pub can_execute: bool,
    /// Can edit code files
    pub can_edit_code: bool,
    /// Can delete files
    pub can_delete: bool,
    /// Can create directories
    pub can_create_dirs: bool,
    /// Can search/grep files
    pub can_search: bool,
}

impl RoleCapabilities {
    /// Create capabilities for Architect role
    pub fn architect() -> Self {
        Self {
            can_read: true,
            can_write: true, // Only to planning docs
            can_execute: false,
            can_edit_code: false,
            can_delete: false,
            can_create_dirs: true,
            can_search: true,
        }
    }

    /// Create capabilities for Developer role
    pub fn developer() -> Self {
        Self {
            can_read: true,
            can_write: true,
            can_execute: true, // Limited commands
            can_edit_code: true,
            can_delete: false,
            can_create_dirs: true,
            can_search: true,
        }
    }

    /// Create capabilities for QA role
    pub fn qa() -> Self {
        Self {
            can_read: true,
            can_write: true,   // Only test files and reports
            can_execute: true, // Only test commands
            can_edit_code: false,
            can_delete: false,
            can_create_dirs: true,
            can_search: true,
        }
    }

    /// Create capabilities for Security role
    pub fn security() -> Self {
        Self {
            can_read: true,
            can_write: true,   // Only security reports
            can_execute: true, // Only security tools
            can_edit_code: false,
            can_delete: false,
            can_create_dirs: true,
            can_search: true,
        }
    }

    /// Create capabilities for Deployer role
    pub fn deployer() -> Self {
        Self {
            can_read: true,
            can_write: true,   // Only deployment reports
            can_execute: true, // Build and deploy commands
            can_edit_code: false,
            can_delete: false,
            can_create_dirs: true,
            can_search: true,
        }
    }

    /// Get capabilities for a specific role
    pub fn for_role(role: AlmasRole) -> Self {
        match role {
            AlmasRole::Architect => Self::architect(),
            AlmasRole::Developer => Self::developer(),
            AlmasRole::Qa => Self::qa(),
            AlmasRole::Security => Self::security(),
            AlmasRole::Deployer => Self::deployer(),
        }
    }
}

/// File access patterns for role-based file restrictions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAccessPatterns {
    /// File patterns this role is allowed to access (read)
    pub allowed_patterns: HashSet<String>,
    /// File patterns this role is explicitly blocked from (read and write)
    pub blocked_patterns: HashSet<String>,
    /// File patterns that are read-only (can read but not write)
    pub read_only_patterns: HashSet<String>,
}

impl FileAccessPatterns {
    /// Create file patterns for Architect role
    pub fn architect() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("PLAN.md".to_string());
        allowed.insert("ARCHITECTURE.md".to_string());
        allowed.insert("INTERFACES.md".to_string());
        allowed.insert("RISKS.md".to_string());
        allowed.insert("docs/design/**".to_string());
        allowed.insert("docs/architecture/**".to_string());

        let mut blocked = HashSet::new();
        blocked.insert("**/*.rs".to_string());
        blocked.insert("**/*.py".to_string());
        blocked.insert("**/*.ts".to_string());
        blocked.insert("**/*.tsx".to_string());
        blocked.insert("**/*.js".to_string());
        blocked.insert("**/Cargo.toml".to_string());
        blocked.insert("**/package.json".to_string());

        let read_only = HashSet::new(); // Architect has no read-only restrictions

        Self {
            allowed_patterns: allowed,
            blocked_patterns: blocked,
            read_only_patterns: read_only,
        }
    }

    /// Create file patterns for Developer role (no restrictions)
    pub fn developer() -> Self {
        Self {
            allowed_patterns: HashSet::new(), // Empty means all allowed
            blocked_patterns: HashSet::new(),
            read_only_patterns: HashSet::new(),
        }
    }

    /// Create file patterns for QA role
    pub fn qa() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("TEST_RESULTS.md".to_string());
        allowed.insert("ISSUES.md".to_string());
        allowed.insert("COVERAGE_REPORT.md".to_string());
        allowed.insert("PERFORMANCE_REPORT.md".to_string());
        allowed.insert("**/tests/**/*.rs".to_string());
        allowed.insert("**/tests/**/*.py".to_string());
        allowed.insert("**/*_test.rs".to_string());

        let mut blocked = HashSet::new();
        blocked.insert("**/src/**/*.rs".to_string());
        blocked.insert("**/src/**/*.py".to_string());
        blocked.insert("**/src/**/*.ts".to_string());

        let read_only = HashSet::new(); // QA has no read-only restrictions

        Self {
            allowed_patterns: allowed,
            blocked_patterns: blocked,
            read_only_patterns: read_only,
        }
    }

    /// Create file patterns for Security role
    pub fn security() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("SECURITY_SCAN.md".to_string());
        allowed.insert("VULNERABILITIES.md".to_string());
        allowed.insert("COMPLIANCE_CHECK.md".to_string());
        allowed.insert("security/**/*.md".to_string());
        allowed.insert("**/.env.example".to_string());

        let mut blocked = HashSet::new();
        blocked.insert("**/src/**/*.rs".to_string());
        blocked.insert("**/src/**/*.py".to_string());
        blocked.insert("**/.env".to_string()); // Block actual secrets

        // Config files Security can read but NOT write (read-only for auditing)
        let mut read_only = HashSet::new();
        read_only.insert("**/Cargo.toml".to_string());
        read_only.insert("**/Cargo.lock".to_string());
        read_only.insert("**/package.json".to_string());
        read_only.insert("**/package-lock.json".to_string());
        read_only.insert("**/Dockerfile".to_string());
        read_only.insert("**/*.yaml".to_string());
        read_only.insert("**/*.yml".to_string());

        Self {
            allowed_patterns: allowed,
            blocked_patterns: blocked,
            read_only_patterns: read_only,
        }
    }

    /// Create file patterns for Deployer role
    pub fn deployer() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("BUILD_LOG.md".to_string());
        allowed.insert("RELEASE_NOTES.md".to_string());
        allowed.insert("DEPLOYMENT_REPORT.md".to_string());
        allowed.insert("ROLLBACK_PLAN.md".to_string());
        allowed.insert("releases/**/*".to_string());
        // Allow reading deployment configuration files
        allowed.insert("**/Dockerfile".to_string());
        allowed.insert("**/*.dockerfile".to_string());
        allowed.insert("**/docker-compose.yml".to_string());
        allowed.insert("**/docker-compose.yaml".to_string());
        allowed.insert("**/.dockerignore".to_string());

        let mut blocked = HashSet::new();
        blocked.insert("**/src/**/*.rs".to_string());
        blocked.insert("**/src/**/*.py".to_string());

        let read_only = HashSet::new(); // Deployer has no read-only restrictions

        Self {
            allowed_patterns: allowed,
            blocked_patterns: blocked,
            read_only_patterns: read_only,
        }
    }

    /// Get file patterns for a specific role
    pub fn for_role(role: AlmasRole) -> Self {
        match role {
            AlmasRole::Architect => Self::architect(),
            AlmasRole::Developer => Self::developer(),
            AlmasRole::Qa => Self::qa(),
            AlmasRole::Security => Self::security(),
            AlmasRole::Deployer => Self::deployer(),
        }
    }

    /// Check if a file path is allowed for this role
    pub fn is_file_allowed(&self, path: &str) -> bool {
        // If blocked patterns exist and match, deny
        if !self.blocked_patterns.is_empty() {
            for pattern in &self.blocked_patterns {
                if Self::matches_pattern(path, pattern) {
                    return false;
                }
            }
        }

        // If allowed patterns is empty, allow all (unless blocked)
        if self.allowed_patterns.is_empty() {
            return true;
        }

        // Check if matches any allowed pattern
        for pattern in &self.allowed_patterns {
            if Self::matches_pattern(path, pattern) {
                return true;
            }
        }

        false
    }

    /// Simple glob pattern matching
    fn matches_pattern(path: &str, pattern: &str) -> bool {
        // Convert glob pattern to regex-like matching
        if pattern.contains("**") {
            // Recursive wildcard
            let parts: Vec<&str> = pattern.split("**").collect();
            if parts.len() == 2 {
                let prefix = parts[0];
                let suffix = parts[1].trim_start_matches('/');
                return path.starts_with(prefix) && path.ends_with(suffix);
            }
        } else if pattern.contains('*') {
            // Simple wildcard
            let parts: Vec<&str> = pattern.split('*').collect();
            if parts.len() == 2 {
                return path.starts_with(parts[0]) && path.ends_with(parts[1]);
            }
        } else {
            // Exact match
            return path == pattern;
        }
        false
    }
}

/// Command execution permissions for roles
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPermissions {
    /// Commands this role is allowed to execute
    pub allowed_commands: HashSet<String>,
    /// Commands this role is explicitly blocked from
    pub blocked_commands: HashSet<String>,
}

impl CommandPermissions {
    /// Create command permissions for Developer role
    pub fn developer() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("cargo test".to_string());
        allowed.insert("cargo build".to_string());
        allowed.insert("cargo clippy".to_string());
        allowed.insert("cargo fmt".to_string());
        allowed.insert("cargo doc".to_string());
        allowed.insert("cargo bench".to_string());
        allowed.insert("npm test".to_string());
        allowed.insert("npm run lint".to_string());
        allowed.insert("npm run build".to_string());

        let mut blocked = HashSet::new();
        blocked.insert("git push".to_string());
        blocked.insert("cargo publish".to_string());
        blocked.insert("npm publish".to_string());
        blocked.insert("docker push".to_string());
        blocked.insert("kubectl".to_string());

        Self {
            allowed_commands: allowed,
            blocked_commands: blocked,
        }
    }

    /// Create command permissions for QA role
    pub fn qa() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("cargo test".to_string());
        allowed.insert("cargo bench".to_string());
        allowed.insert("cargo tarpaulin".to_string());
        allowed.insert("npm test".to_string());
        allowed.insert("pytest".to_string());

        Self {
            allowed_commands: allowed,
            blocked_commands: HashSet::new(),
        }
    }

    /// Create command permissions for Security role
    pub fn security() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("cargo clippy".to_string());
        allowed.insert("cargo audit".to_string());
        allowed.insert("cargo deny".to_string());
        allowed.insert("bandit".to_string());
        allowed.insert("semgrep".to_string());
        allowed.insert("npm audit".to_string());

        Self {
            allowed_commands: allowed,
            blocked_commands: HashSet::new(),
        }
    }

    /// Create command permissions for Deployer role
    pub fn deployer() -> Self {
        let mut allowed = HashSet::new();
        allowed.insert("cargo build --release".to_string());
        allowed.insert("npm run build".to_string());
        allowed.insert("docker build".to_string());
        allowed.insert("git tag".to_string());

        Self {
            allowed_commands: allowed,
            blocked_commands: HashSet::new(),
        }
    }

    /// Get command permissions for a specific role
    pub fn for_role(role: AlmasRole) -> Self {
        match role {
            AlmasRole::Architect => Self {
                allowed_commands: HashSet::new(),
                blocked_commands: HashSet::new(),
            },
            AlmasRole::Developer => Self::developer(),
            AlmasRole::Qa => Self::qa(),
            AlmasRole::Security => Self::security(),
            AlmasRole::Deployer => Self::deployer(),
        }
    }

    /// Check if a command is allowed
    pub fn is_command_allowed(&self, command: &str) -> bool {
        // Check if explicitly blocked
        for blocked in &self.blocked_commands {
            if command.starts_with(blocked) {
                return false;
            }
        }

        // If allowed list is empty, allow all (unless blocked)
        if self.allowed_commands.is_empty() {
            return true;
        }

        // Check if matches any allowed command
        for allowed in &self.allowed_commands {
            if command.starts_with(allowed) {
                return true;
            }
        }

        false
    }
}

/// Complete role configuration combining all aspects
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleConfig {
    pub role: AlmasRole,
    pub capabilities: RoleCapabilities,
    pub file_access: FileAccessPatterns,
    pub command_permissions: CommandPermissions,
}

impl RoleConfig {
    /// Create complete configuration for a role
    pub fn for_role(role: AlmasRole) -> Self {
        Self {
            role,
            capabilities: RoleCapabilities::for_role(role),
            file_access: FileAccessPatterns::for_role(role),
            command_permissions: CommandPermissions::for_role(role),
        }
    }

    /// Get all role configurations
    pub fn all_configs() -> Vec<Self> {
        AlmasRole::all().into_iter().map(Self::for_role).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_almas_role_ids() {
        assert_eq!(AlmasRole::Architect.role_id(), "architect");
        assert_eq!(AlmasRole::Developer.role_id(), "developer");
        assert_eq!(AlmasRole::Qa.role_id(), "qa");
        assert_eq!(AlmasRole::Security.role_id(), "security");
        assert_eq!(AlmasRole::Deployer.role_id(), "deployer");
    }

    #[test]
    fn test_role_display() {
        assert_eq!(format!("{}", AlmasRole::Architect), "architect");
    }

    #[test]
    fn test_is_final_role() {
        assert!(!AlmasRole::Architect.is_final());
        assert!(!AlmasRole::Developer.is_final());
        assert!(!AlmasRole::Qa.is_final());
        assert!(!AlmasRole::Security.is_final());
        assert!(AlmasRole::Deployer.is_final());
    }

    #[test]
    fn test_architect_cannot_edit_code() {
        let caps = RoleCapabilities::architect();
        assert!(!caps.can_edit_code);
        assert!(!caps.can_execute);
    }

    #[test]
    fn test_developer_full_access() {
        let caps = RoleCapabilities::developer();
        assert!(caps.can_edit_code);
        assert!(caps.can_execute);
        assert!(caps.can_write);
    }

    #[test]
    fn test_qa_cannot_edit_code() {
        let caps = RoleCapabilities::qa();
        assert!(!caps.can_edit_code);
        assert!(caps.can_execute); // Can run tests
    }

    #[test]
    fn test_file_pattern_matching() {
        let patterns = FileAccessPatterns::architect();

        // Allowed files
        assert!(patterns.is_file_allowed("PLAN.md"));
        assert!(patterns.is_file_allowed("ARCHITECTURE.md"));

        // Blocked files
        assert!(!patterns.is_file_allowed("src/main.rs"));
        assert!(!patterns.is_file_allowed("package.json"));
    }

    #[test]
    fn test_command_permissions() {
        let perms = CommandPermissions::developer();

        // Allowed commands
        assert!(perms.is_command_allowed("cargo test"));
        assert!(perms.is_command_allowed("cargo build --release"));

        // Blocked commands
        assert!(!perms.is_command_allowed("git push origin main"));
        assert!(!perms.is_command_allowed("cargo publish"));
    }

    #[test]
    fn test_role_config_creation() {
        let config = RoleConfig::for_role(AlmasRole::Developer);
        assert_eq!(config.role, AlmasRole::Developer);
        assert!(config.capabilities.can_edit_code);
    }

    #[test]
    fn test_all_roles_have_configs() {
        let configs = RoleConfig::all_configs();
        assert_eq!(configs.len(), 5);
    }
}
