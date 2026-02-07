//! Capability Enforcement Engine for ALMAS Role-Based Access Control
//!
//! This module provides runtime enforcement of role capabilities, validating
//! all file access, command execution, and code modification operations against
//! the permissions defined for each ALMAS role.

use super::roles::{AlmasRole, CommandPermissions, FileAccessPatterns, RoleCapabilities, RoleConfig};
use anyhow::{anyhow, Result};
use glob::Pattern;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use tracing::{debug, warn};

/// Capability enforcement engine that validates operations against role permissions
#[derive(Debug)]
pub struct CapabilityEnforcer {
    current_role: AlmasRole,
    role_config: RoleConfig,
}

/// Represents different types of operations that can be enforced
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operation {
    Read(PathBuf),
    Write(PathBuf),
    Execute(String),
    EditCode(PathBuf),
    Delete(PathBuf),
    CreateDir(PathBuf),
    Search(PathBuf),
}

/// Result of capability enforcement check
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnforcementResult {
    pub allowed: bool,
    pub reason: String,
    pub operation: Operation,
    pub role: AlmasRole,
}

impl CapabilityEnforcer {
    /// Create a new capability enforcer for the specified role
    pub fn new(role: AlmasRole) -> Self {
        let role_config = RoleConfig::from_role(role);
        Self {
            current_role: role,
            role_config,
        }
    }

    /// Create an enforcer with custom role configuration
    pub fn with_config(role: AlmasRole, config: RoleConfig) -> Self {
        Self {
            current_role: role,
            role_config: config,
        }
    }

    /// Get the current role
    pub fn current_role(&self) -> AlmasRole {
        self.current_role
    }

    /// Get the role configuration
    pub fn role_config(&self) -> &RoleConfig {
        &self.role_config
    }

    /// Check if an operation is allowed for the current role
    pub fn check_operation(&self, operation: &Operation) -> EnforcementResult {
        match operation {
            Operation::Read(path) => self.check_read(path),
            Operation::Write(path) => self.check_write(path),
            Operation::Execute(command) => self.check_execute(command),
            Operation::EditCode(path) => self.check_edit_code(path),
            Operation::Delete(path) => self.check_delete(path),
            Operation::CreateDir(path) => self.check_create_dir(path),
            Operation::Search(path) => self.check_search(path),
        }
    }

    /// Enforce an operation, returning an error if not allowed
    pub fn enforce(&self, operation: &Operation) -> Result<()> {
        let result = self.check_operation(operation);
        if result.allowed {
            debug!(
                role = ?self.current_role,
                operation = ?operation,
                "Operation allowed"
            );
            Ok(())
        } else {
            warn!(
                role = ?self.current_role,
                operation = ?operation,
                reason = %result.reason,
                "Operation blocked"
            );
            Err(anyhow!(
                "Operation blocked for role {:?}: {}",
                self.current_role,
                result.reason
            ))
        }
    }

    /// Check if file read is allowed
    fn check_read(&self, path: &Path) -> EnforcementResult {
        if !self.role_config.capabilities.can_read {
            return EnforcementResult {
                allowed: false,
                reason: format!("Role {:?} does not have read permission", self.current_role),
                operation: Operation::Read(path.to_path_buf()),
                role: self.current_role,
            };
        }

        if !self.check_file_access(path) {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "File access blocked by role policy for path: {}",
                    path.display()
                ),
                operation: Operation::Read(path.to_path_buf()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Read access granted".to_string(),
            operation: Operation::Read(path.to_path_buf()),
            role: self.current_role,
        }
    }

    /// Check if file write is allowed
    fn check_write(&self, path: &Path) -> EnforcementResult {
        if !self.role_config.capabilities.can_write {
            return EnforcementResult {
                allowed: false,
                reason: format!("Role {:?} does not have write permission", self.current_role),
                operation: Operation::Write(path.to_path_buf()),
                role: self.current_role,
            };
        }

        if !self.check_file_access(path) {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "File access blocked by role policy for path: {}",
                    path.display()
                ),
                operation: Operation::Write(path.to_path_buf()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Write access granted".to_string(),
            operation: Operation::Write(path.to_path_buf()),
            role: self.current_role,
        }
    }

    /// Check if command execution is allowed
    fn check_execute(&self, command: &str) -> EnforcementResult {
        if !self.role_config.capabilities.can_execute {
            return EnforcementResult {
                allowed: false,
                reason: format!("Role {:?} does not have execute permission", self.current_role),
                operation: Operation::Execute(command.to_string()),
                role: self.current_role,
            };
        }

        if !self.check_command_permission(command) {
            return EnforcementResult {
                allowed: false,
                reason: format!("Command execution blocked by role policy: {}", command),
                operation: Operation::Execute(command.to_string()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Command execution granted".to_string(),
            operation: Operation::Execute(command.to_string()),
            role: self.current_role,
        }
    }

    /// Check if code editing is allowed
    fn check_edit_code(&self, path: &Path) -> EnforcementResult {
        if !self.role_config.capabilities.can_edit_code {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "Role {:?} does not have code editing permission",
                    self.current_role
                ),
                operation: Operation::EditCode(path.to_path_buf()),
                role: self.current_role,
            };
        }

        if !self.check_file_access(path) {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "File access blocked by role policy for path: {}",
                    path.display()
                ),
                operation: Operation::EditCode(path.to_path_buf()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Code editing granted".to_string(),
            operation: Operation::EditCode(path.to_path_buf()),
            role: self.current_role,
        }
    }

    /// Check if file deletion is allowed
    fn check_delete(&self, path: &Path) -> EnforcementResult {
        if !self.role_config.capabilities.can_delete {
            return EnforcementResult {
                allowed: false,
                reason: format!("Role {:?} does not have delete permission", self.current_role),
                operation: Operation::Delete(path.to_path_buf()),
                role: self.current_role,
            };
        }

        if !self.check_file_access(path) {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "File access blocked by role policy for path: {}",
                    path.display()
                ),
                operation: Operation::Delete(path.to_path_buf()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Delete access granted".to_string(),
            operation: Operation::Delete(path.to_path_buf()),
            role: self.current_role,
        }
    }

    /// Check if directory creation is allowed
    fn check_create_dir(&self, path: &Path) -> EnforcementResult {
        if !self.role_config.capabilities.can_create_dirs {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "Role {:?} does not have directory creation permission",
                    self.current_role
                ),
                operation: Operation::CreateDir(path.to_path_buf()),
                role: self.current_role,
            };
        }

        if !self.check_file_access(path) {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "File access blocked by role policy for path: {}",
                    path.display()
                ),
                operation: Operation::CreateDir(path.to_path_buf()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Directory creation granted".to_string(),
            operation: Operation::CreateDir(path.to_path_buf()),
            role: self.current_role,
        }
    }

    /// Check if search is allowed
    fn check_search(&self, path: &Path) -> EnforcementResult {
        if !self.role_config.capabilities.can_search {
            return EnforcementResult {
                allowed: false,
                reason: format!("Role {:?} does not have search permission", self.current_role),
                operation: Operation::Search(path.to_path_buf()),
                role: self.current_role,
            };
        }

        if !self.check_file_access(path) {
            return EnforcementResult {
                allowed: false,
                reason: format!(
                    "File access blocked by role policy for path: {}",
                    path.display()
                ),
                operation: Operation::Search(path.to_path_buf()),
                role: self.current_role,
            };
        }

        EnforcementResult {
            allowed: true,
            reason: "Search access granted".to_string(),
            operation: Operation::Search(path.to_path_buf()),
            role: self.current_role,
        }
    }

    /// Check if file access is allowed based on glob patterns
    fn check_file_access(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy();

        // Check blocked patterns first (deny list takes precedence)
        for pattern_str in &self.role_config.file_access.blocked_patterns {
            if let Ok(pattern) = Pattern::new(pattern_str) {
                if pattern.matches(&path_str) {
                    debug!(
                        role = ?self.current_role,
                        path = %path_str,
                        pattern = %pattern_str,
                        "File access blocked by deny pattern"
                    );
                    return false;
                }
            }
        }

        // If allowed patterns is empty, allow all (except blocked)
        if self.role_config.file_access.allowed_patterns.is_empty() {
            return true;
        }

        // Check allowed patterns
        for pattern_str in &self.role_config.file_access.allowed_patterns {
            if let Ok(pattern) = Pattern::new(pattern_str) {
                if pattern.matches(&path_str) {
                    debug!(
                        role = ?self.current_role,
                        path = %path_str,
                        pattern = %pattern_str,
                        "File access granted by allow pattern"
                    );
                    return true;
                }
            }
        }

        // No matching allow pattern found
        debug!(
            role = ?self.current_role,
            path = %path_str,
            "File access denied: no matching allow pattern"
        );
        false
    }

    /// Check if command execution is allowed based on command permissions
    fn check_command_permission(&self, command: &str) -> bool {
        // Extract the base command (first word)
        let base_command = command.split_whitespace().next().unwrap_or(command);

        // Check blocked commands first (deny list takes precedence)
        if self.role_config.command_permissions.blocked_commands.contains(base_command) {
            debug!(
                role = ?self.current_role,
                command = %base_command,
                "Command blocked by deny list"
            );
            return false;
        }

        // If allowed commands is empty, allow all (except blocked)
        if self.role_config.command_permissions.allowed_commands.is_empty() {
            return true;
        }

        // Check allowed commands
        if self.role_config.command_permissions.allowed_commands.contains(base_command) {
            debug!(
                role = ?self.current_role,
                command = %base_command,
                "Command allowed by allow list"
            );
            return true;
        }

        // No matching allow command found
        debug!(
            role = ?self.current_role,
            command = %base_command,
            "Command denied: not in allow list"
        );
        false
    }

    /// Update the enforcer to a new role
    pub fn switch_role(&mut self, new_role: AlmasRole) {
        debug!(
            old_role = ?self.current_role,
            new_role = ?new_role,
            "Switching role"
        );
        self.current_role = new_role;
        self.role_config = RoleConfig::from_role(new_role);
    }

    /// Batch check multiple operations
    pub fn check_operations(&self, operations: &[Operation]) -> Vec<EnforcementResult> {
        operations.iter().map(|op| self.check_operation(op)).collect()
    }

    /// Batch enforce multiple operations, returning the first error encountered
    pub fn enforce_operations(&self, operations: &[Operation]) -> Result<Vec<EnforcementResult>> {
        let mut results = Vec::new();
        for operation in operations {
            let result = self.check_operation(operation);
            if !result.allowed {
                return Err(anyhow!(
                    "Operation blocked for role {:?}: {}",
                    self.current_role,
                    result.reason
                ));
            }
            results.push(result);
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_architect_read_allowed() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_read(Path::new("PLAN.md"));
        assert!(result.allowed);
    }

    #[test]
    fn test_architect_code_edit_blocked() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(!result.allowed);
        assert!(result.reason.contains("does not have code editing permission"));
    }

    #[test]
    fn test_developer_full_permissions() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

        let read_result = enforcer.check_read(Path::new("src/main.rs"));
        assert!(read_result.allowed);

        let write_result = enforcer.check_write(Path::new("src/main.rs"));
        assert!(write_result.allowed);

        let edit_result = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(edit_result.allowed);

        let execute_result = enforcer.check_execute("cargo build");
        assert!(execute_result.allowed);
    }

    #[test]
    fn test_qa_no_edit_permissions() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);

        let read_result = enforcer.check_read(Path::new("tests/integration.rs"));
        assert!(read_result.allowed);

        let edit_result = enforcer.check_edit_code(Path::new("tests/integration.rs"));
        assert!(!edit_result.allowed);

        let execute_result = enforcer.check_execute("cargo test");
        assert!(execute_result.allowed);
    }

    #[test]
    fn test_security_read_only() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);

        let read_result = enforcer.check_read(Path::new("Cargo.toml"));
        assert!(read_result.allowed);

        let write_result = enforcer.check_write(Path::new("Cargo.toml"));
        assert!(!write_result.allowed);

        let execute_result = enforcer.check_execute("cargo audit");
        assert!(execute_result.allowed);
    }

    #[test]
    fn test_deployer_no_code_edit() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);

        let read_result = enforcer.check_read(Path::new("Dockerfile"));
        assert!(read_result.allowed);

        let edit_result = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(!edit_result.allowed);

        let execute_result = enforcer.check_execute("docker build");
        assert!(execute_result.allowed);
    }

    #[test]
    fn test_file_pattern_matching() {
        let mut config = RoleConfig::from_role(AlmasRole::Architect);
        config.file_access.allowed_patterns.insert("*.md".to_string());
        config.file_access.blocked_patterns.insert("SECRET.md".to_string());

        let enforcer = CapabilityEnforcer::with_config(AlmasRole::Architect, config);

        let allowed_result = enforcer.check_read(Path::new("PLAN.md"));
        assert!(allowed_result.allowed);

        let blocked_result = enforcer.check_read(Path::new("SECRET.md"));
        assert!(!blocked_result.allowed);

        let not_matched_result = enforcer.check_read(Path::new("main.rs"));
        assert!(!not_matched_result.allowed);
    }

    #[test]
    fn test_command_permission_checking() {
        let mut config = RoleConfig::from_role(AlmasRole::Developer);
        config.command_permissions.allowed_commands.insert("cargo".to_string());
        config.command_permissions.blocked_commands.insert("rm".to_string());

        let enforcer = CapabilityEnforcer::with_config(AlmasRole::Developer, config);

        let allowed_result = enforcer.check_execute("cargo build --release");
        assert!(allowed_result.allowed);

        let blocked_result = enforcer.check_execute("rm -rf /");
        assert!(!blocked_result.allowed);
    }

    #[test]
    fn test_enforce_operation_success() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let operation = Operation::Read(PathBuf::from("src/main.rs"));

        let result = enforcer.enforce(&operation);
        assert!(result.is_ok());
    }

    #[test]
    fn test_enforce_operation_failure() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let operation = Operation::EditCode(PathBuf::from("src/main.rs"));

        let result = enforcer.enforce(&operation);
        assert!(result.is_err());
    }

    #[test]
    fn test_batch_operations() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let operations = vec![
            Operation::Read(PathBuf::from("src/main.rs")),
            Operation::Write(PathBuf::from("src/lib.rs")),
            Operation::Execute("cargo test".to_string()),
        ];

        let results = enforcer.check_operations(&operations);
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.allowed));
    }

    #[test]
    fn test_batch_enforce_with_failure() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let operations = vec![
            Operation::Read(PathBuf::from("tests/test.rs")),
            Operation::EditCode(PathBuf::from("src/main.rs")), // Should fail
            Operation::Execute("cargo test".to_string()),
        ];

        let result = enforcer.enforce_operations(&operations);
        assert!(result.is_err());
    }

    #[test]
    fn test_switch_role() {
        let mut enforcer = CapabilityEnforcer::new(AlmasRole::Qa);

        let edit_before = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(!edit_before.allowed);

        enforcer.switch_role(AlmasRole::Developer);

        let edit_after = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(edit_after.allowed);
    }
}
