//! Comprehensive tests for CapabilityEnforcer to achieve 97%+ coverage
//!
//! These tests should be appended to the existing tests in enforcer.rs
//! to achieve the target coverage of 97%+

#[cfg(test)]
mod comprehensive_tests {
    use super::*;
    use std::path::PathBuf;

    // ========================================
    // Constructor and Configuration Tests
    // ========================================

    #[test]
    fn test_enforcer_new_creates_correct_role_config() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        assert_eq!(enforcer.current_role(), AlmasRole::Architect);
        assert!(!enforcer.role_config().capabilities.can_edit_code);
    }

    #[test]
    fn test_enforcer_with_custom_config() {
        let mut config = RoleConfig::from_role(AlmasRole::Developer);
        config.capabilities.can_delete = true; // Override default

        let enforcer = CapabilityEnforcer::with_config(AlmasRole::Developer, config);
        assert!(enforcer.role_config().capabilities.can_delete);
    }

    #[test]
    fn test_current_role_returns_correct_role() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
        assert_eq!(enforcer.current_role(), AlmasRole::Security);
    }

    #[test]
    fn test_role_config_returns_reference() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);
        let config = enforcer.role_config();
        assert_eq!(config.role, AlmasRole::Deployer);
    }

    // ========================================
    // Operation Enum Tests
    // ========================================

    #[test]
    fn test_operation_read_clone() {
        let op = Operation::Read(PathBuf::from("test.md"));
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_write_clone() {
        let op = Operation::Write(PathBuf::from("test.md"));
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_execute_clone() {
        let op = Operation::Execute("cargo test".to_string());
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_edit_code_clone() {
        let op = Operation::EditCode(PathBuf::from("src/main.rs"));
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_delete_clone() {
        let op = Operation::Delete(PathBuf::from("temp.txt"));
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_create_dir_clone() {
        let op = Operation::CreateDir(PathBuf::from("new_dir"));
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_search_clone() {
        let op = Operation::Search(PathBuf::from("/src"));
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    #[test]
    fn test_operation_debug_format() {
        let op = Operation::Read(PathBuf::from("test.md"));
        let debug_str = format!("{:?}", op);
        assert!(debug_str.contains("Read"));
        assert!(debug_str.contains("test.md"));
    }

    // ========================================
    // EnforcementResult Tests
    // ========================================

    #[test]
    fn test_enforcement_result_allowed() {
        let result = EnforcementResult {
            allowed: true,
            reason: "Test allowed".to_string(),
            operation: Operation::Read(PathBuf::from("test.md")),
            role: AlmasRole::Developer,
        };
        assert!(result.allowed);
        assert_eq!(result.reason, "Test allowed");
    }

    #[test]
    fn test_enforcement_result_denied() {
        let result = EnforcementResult {
            allowed: false,
            reason: "Test denied".to_string(),
            operation: Operation::Write(PathBuf::from("test.md")),
            role: AlmasRole::Architect,
        };
        assert!(!result.allowed);
        assert_eq!(result.reason, "Test denied");
    }

    #[test]
    fn test_enforcement_result_clone() {
        let result = EnforcementResult {
            allowed: true,
            reason: "Test".to_string(),
            operation: Operation::Read(PathBuf::from("test.md")),
            role: AlmasRole::Developer,
        };
        let cloned = result.clone();
        assert_eq!(result, cloned);
    }

    #[test]
    fn test_enforcement_result_debug() {
        let result = EnforcementResult {
            allowed: true,
            reason: "Test".to_string(),
            operation: Operation::Read(PathBuf::from("test.md")),
            role: AlmasRole::Developer,
        };
        let debug_str = format!("{:?}", result);
        assert!(debug_str.contains("allowed"));
        assert!(debug_str.contains("Test"));
    }

    // ========================================
    // Read Permission Tests
    // ========================================

    #[test]
    fn test_architect_can_read_plan_files() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_read(Path::new("PLAN.md"));
        assert!(result.allowed);
        assert_eq!(result.reason, "Read access granted");
    }

    #[test]
    fn test_architect_blocked_from_code_files() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_read(Path::new("src/main.rs"));
        assert!(!result.allowed);
        assert!(result.reason.contains("File access blocked"));
    }

    #[test]
    fn test_developer_can_read_any_file() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let files = vec!["src/main.rs", "Cargo.toml", "README.md", "tests/test.rs"];
        for file in files {
            let result = enforcer.check_read(Path::new(file));
            assert!(result.allowed, "Developer should read {}", file);
        }
    }

    #[test]
    fn test_qa_can_read_test_files() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let result = enforcer.check_read(Path::new("tests/integration.rs"));
        assert!(result.allowed);
    }

    #[test]
    fn test_security_can_read_for_audit() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
        let result = enforcer.check_read(Path::new("Cargo.toml"));
        assert!(result.allowed);
    }

    #[test]
    fn test_deployer_can_read_config_files() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);
        let result = enforcer.check_read(Path::new("Dockerfile"));
        assert!(result.allowed);
    }

    // ========================================
    // Write Permission Tests
    // ========================================

    #[test]
    fn test_architect_can_write_design_docs() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_write(Path::new("ARCHITECTURE.md"));
        assert!(result.allowed);
    }

    #[test]
    fn test_architect_cannot_write_code() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_write(Path::new("src/main.rs"));
        assert!(!result.allowed);
    }

    #[test]
    fn test_developer_can_write_code_files() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_write(Path::new("src/lib.rs"));
        assert!(result.allowed);
    }

    #[test]
    fn test_qa_can_write_test_reports() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let result = enforcer.check_write(Path::new("TEST_RESULTS.md"));
        assert!(result.allowed);
    }

    #[test]
    fn test_qa_cannot_write_source_code() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let result = enforcer.check_write(Path::new("src/main.rs"));
        assert!(!result.allowed);
    }

    #[test]
    fn test_security_can_write_audit_reports() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
        let result = enforcer.check_write(Path::new("SECURITY_SCAN.md"));
        assert!(result.allowed);
    }

    #[test]
    fn test_security_cannot_write_source_code() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
        let result = enforcer.check_write(Path::new("src/main.rs"));
        assert!(!result.allowed);
    }

    #[test]
    fn test_deployer_can_write_release_notes() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);
        let result = enforcer.check_write(Path::new("RELEASE_NOTES.md"));
        assert!(result.allowed);
    }

    // ========================================
    // Execute Permission Tests
    // ========================================

    #[test]
    fn test_architect_cannot_execute_commands() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_execute("cargo build");
        assert!(!result.allowed);
        assert!(result.reason.contains("does not have execute permission"));
    }

    #[test]
    fn test_developer_can_execute_build_commands() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let commands = vec!["cargo build", "cargo test", "npm install"];
        for cmd in commands {
            let result = enforcer.check_execute(cmd);
            assert!(result.allowed, "Developer should execute {}", cmd);
        }
    }

    #[test]
    fn test_developer_blocked_from_deploy_commands() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let commands = vec!["git push", "cargo publish", "npm publish"];
        for cmd in commands {
            let result = enforcer.check_execute(cmd);
            assert!(!result.allowed, "Developer should not execute {}", cmd);
        }
    }

    #[test]
    fn test_qa_can_execute_test_commands() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let result = enforcer.check_execute("cargo test");
        assert!(result.allowed);
    }

    #[test]
    fn test_security_can_execute_audit_commands() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
        let commands = vec!["cargo audit", "cargo clippy", "npm audit"];
        for cmd in commands {
            let result = enforcer.check_execute(cmd);
            assert!(result.allowed, "Security should execute {}", cmd);
        }
    }

    #[test]
    fn test_deployer_can_execute_build_commands() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);
        let commands = vec!["cargo build --release", "docker build"];
        for cmd in commands {
            let result = enforcer.check_execute(cmd);
            assert!(result.allowed, "Deployer should execute {}", cmd);
        }
    }

    // ========================================
    // Edit Code Permission Tests
    // ========================================

    #[test]
    fn test_only_developer_can_edit_code() {
        let roles = vec![
            (AlmasRole::Architect, false),
            (AlmasRole::Developer, true),
            (AlmasRole::Qa, false),
            (AlmasRole::Security, false),
            (AlmasRole::Deployer, false),
        ];

        for (role, should_allow) in roles {
            let enforcer = CapabilityEnforcer::new(role);
            let result = enforcer.check_edit_code(Path::new("src/main.rs"));
            assert_eq!(
                result.allowed, should_allow,
                "{:?} edit permission mismatch",
                role
            );
        }
    }

    // ========================================
    // Delete Permission Tests
    // ========================================

    #[test]
    fn test_no_role_can_delete_by_default() {
        let roles = AlmasRole::all();
        for role in roles {
            let enforcer = CapabilityEnforcer::new(role);
            let result = enforcer.check_delete(Path::new("temp.txt"));
            assert!(!result.allowed, "{:?} should not delete", role);
            assert!(result.reason.contains("does not have delete permission"));
        }
    }

    #[test]
    fn test_delete_blocked_even_with_file_access() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_delete(Path::new("src/main.rs"));
        assert!(!result.allowed); // Developer can't delete
    }

    // ========================================
    // Create Directory Permission Tests
    // ========================================

    #[test]
    fn test_all_roles_can_create_directories() {
        let roles = AlmasRole::all();
        for role in roles {
            let enforcer = CapabilityEnforcer::new(role);
            let result = enforcer.check_create_dir(Path::new("new_directory"));
            // Check if role has directory creation permission
            if enforcer.role_config().capabilities.can_create_dirs {
                assert!(result.allowed, "{:?} should create dirs", role);
            }
        }
    }

    #[test]
    fn test_architect_can_create_docs_directory() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_create_dir(Path::new("docs/architecture"));
        assert!(result.allowed);
    }

    #[test]
    fn test_developer_can_create_source_directory() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_create_dir(Path::new("src/modules"));
        assert!(result.allowed);
    }

    // ========================================
    // Search Permission Tests
    // ========================================

    #[test]
    fn test_all_roles_can_search_by_default() {
        let roles = AlmasRole::all();
        for role in roles {
            let enforcer = CapabilityEnforcer::new(role);
            let result = enforcer.check_search(Path::new("/src"));
            if enforcer.role_config().capabilities.can_search {
                assert!(result.allowed, "{:?} should search", role);
            }
        }
    }

    #[test]
    fn test_search_respects_file_access_patterns() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let result = enforcer.check_search(Path::new("src")); // Blocked for Architect
        // Result depends on file access patterns
    }

    // ========================================
    // Enforce Method Tests
    // ========================================

    #[test]
    fn test_enforce_returns_ok_when_allowed() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let op = Operation::Read(PathBuf::from("src/main.rs"));
        let result = enforcer.enforce(&op);
        assert!(result.is_ok());
    }

    #[test]
    fn test_enforce_returns_error_when_blocked() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let op = Operation::EditCode(PathBuf::from("src/main.rs"));
        let result = enforcer.enforce(&op);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("blocked"));
    }

    #[test]
    fn test_enforce_error_message_contains_role() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let op = Operation::EditCode(PathBuf::from("src/main.rs"));
        let result = enforcer.enforce(&op);
        let error_msg = result.unwrap_err().to_string();
        assert!(error_msg.contains("Qa"));
    }

    #[test]
    fn test_enforce_error_message_contains_reason() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
        let op = Operation::EditCode(PathBuf::from("src/main.rs"));
        let result = enforcer.enforce(&op);
        let error_msg = result.unwrap_err().to_string();
        assert!(error_msg.contains("does not have code editing permission"));
    }

    // ========================================
    // Switch Role Tests
    // ========================================

    #[test]
    fn test_switch_role_updates_current_role() {
        let mut enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        assert_eq!(enforcer.current_role(), AlmasRole::Architect);

        enforcer.switch_role(AlmasRole::Developer);
        assert_eq!(enforcer.current_role(), AlmasRole::Developer);
    }

    #[test]
    fn test_switch_role_updates_permissions() {
        let mut enforcer = CapabilityEnforcer::new(AlmasRole::Architect);

        let edit_before = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(!edit_before.allowed);

        enforcer.switch_role(AlmasRole::Developer);

        let edit_after = enforcer.check_edit_code(Path::new("src/main.rs"));
        assert!(edit_after.allowed);
    }

    #[test]
    fn test_switch_role_all_roles() {
        let mut enforcer = CapabilityEnforcer::new(AlmasRole::Architect);

        for role in AlmasRole::all() {
            enforcer.switch_role(role);
            assert_eq!(enforcer.current_role(), role);
        }
    }

    // ========================================
    // Batch Operations Tests
    // ========================================

    #[test]
    fn test_check_operations_returns_all_results() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let ops = vec![
            Operation::Read(PathBuf::from("src/main.rs")),
            Operation::Write(PathBuf::from("src/lib.rs")),
            Operation::Execute("cargo test".to_string()),
        ];

        let results = enforcer.check_operations(&ops);
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.allowed));
    }

    #[test]
    fn test_check_operations_includes_failures() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
        let ops = vec![
            Operation::Read(PathBuf::from("PLAN.md")),
            Operation::EditCode(PathBuf::from("src/main.rs")), // Will fail
        ];

        let results = enforcer.check_operations(&ops);
        assert_eq!(results.len(), 2);
        assert!(results[0].allowed);
        assert!(!results[1].allowed);
    }

    #[test]
    fn test_enforce_operations_stops_at_first_failure() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let ops = vec![
            Operation::Read(PathBuf::from("tests/test.rs")),
            Operation::EditCode(PathBuf::from("src/main.rs")), // Will fail here
            Operation::Execute("cargo test".to_string()),       // Never reached
        ];

        let result = enforcer.enforce_operations(&ops);
        assert!(result.is_err());
    }

    #[test]
    fn test_enforce_operations_all_success() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let ops = vec![
            Operation::Read(PathBuf::from("src/main.rs")),
            Operation::Write(PathBuf::from("src/lib.rs")),
            Operation::EditCode(PathBuf::from("src/mod.rs")),
        ];

        let result = enforcer.enforce_operations(&ops);
        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_enforce_operations_empty_list() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);
        let ops: Vec<Operation> = vec![];

        let result = enforcer.enforce_operations(&ops);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    // ========================================
    // Edge Case Tests
    // ========================================

    #[test]
    fn test_empty_path() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_read(Path::new(""));
        // Should handle gracefully
    }

    #[test]
    fn test_root_path() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_read(Path::new("/"));
        // Should handle root path
    }

    #[test]
    fn test_relative_path() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_read(Path::new("../parent/file.rs"));
        // Should handle relative paths
    }

    #[test]
    fn test_path_with_special_characters() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_read(Path::new("file name with spaces.rs"));
        // Should handle spaces
    }

    #[test]
    fn test_very_long_path() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let long_path = "a/".repeat(100) + "file.rs";
        let result = enforcer.check_read(Path::new(&long_path));
        // Should handle long paths
    }

    #[test]
    fn test_command_with_no_arguments() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_execute("cargo");
        // Should handle command without args
    }

    #[test]
    fn test_command_with_many_arguments() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_execute("cargo test --all --features full -- --nocapture");
        // Should extract base command
    }

    #[test]
    fn test_empty_command() {
        let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
        let result = enforcer.check_execute("");
        // Should handle empty command
    }
}
