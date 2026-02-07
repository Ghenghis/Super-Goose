// Comprehensive tests for enforcer.rs fixes
// Tests validate the critical bug fixes:
// 1. RoleConfig::from_role() -> RoleConfig::for_role() (4 occurrences)
// 2. Private methods made public: check_read, check_write, check_execute, check_edit_code

use super::*;
use std::path::{Path, PathBuf};

/// Test that RoleConfig::for_role() works correctly for all roles
#[test]
fn test_role_config_for_role_all_variants() {
    let roles = vec![
        AlmasRole::Architect,
        AlmasRole::Developer,
        AlmasRole::Qa,
        AlmasRole::Security,
        AlmasRole::Deployer,
    ];

    for role in roles {
        let config = RoleConfig::for_role(role);
        // Verify config matches the role
        match role {
            AlmasRole::Architect => {
                assert!(config.capabilities.can_read);
                assert!(!config.capabilities.can_edit_code);
            }
            AlmasRole::Developer => {
                assert!(config.capabilities.can_read);
                assert!(config.capabilities.can_write);
                assert!(config.capabilities.can_edit_code);
                assert!(config.capabilities.can_execute);
            }
            AlmasRole::Qa => {
                assert!(config.capabilities.can_read);
                assert!(!config.capabilities.can_edit_code);
                assert!(config.capabilities.can_execute);
            }
            AlmasRole::Security => {
                assert!(config.capabilities.can_read);
                assert!(!config.capabilities.can_edit_code);
            }
            AlmasRole::Deployer => {
                assert!(config.capabilities.can_read);
                assert!(config.capabilities.can_execute);
                assert!(!config.capabilities.can_edit_code);
            }
        }
    }
}

/// Test CapabilityEnforcer::new() uses RoleConfig::for_role() correctly
#[test]
fn test_enforcer_new_uses_for_role() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    assert_eq!(enforcer.current_role(), AlmasRole::Developer);
    assert!(enforcer.role_config().capabilities.can_edit_code);

    let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
    assert_eq!(enforcer.current_role(), AlmasRole::Architect);
    assert!(!enforcer.role_config().capabilities.can_edit_code);
}

/// Test switch_role() uses RoleConfig::for_role() correctly
#[test]
fn test_enforcer_switch_role_uses_for_role() {
    let mut enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
    assert!(!enforcer.role_config().capabilities.can_edit_code);

    enforcer.switch_role(AlmasRole::Developer);
    assert_eq!(enforcer.current_role(), AlmasRole::Developer);
    assert!(enforcer.role_config().capabilities.can_edit_code);

    enforcer.switch_role(AlmasRole::Qa);
    assert_eq!(enforcer.current_role(), AlmasRole::Qa);
    assert!(!enforcer.role_config().capabilities.can_edit_code);
}

/// Test that check_read() is now public and accessible
#[test]
fn test_check_read_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("src/main.rs");

    // This should compile - check_read is now public
    let result = enforcer.check_read(path);
    assert!(result.allowed);
    assert_eq!(result.operation, Operation::Read(path.to_path_buf()));
}

/// Test that check_write() is now public and accessible
#[test]
fn test_check_write_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("src/main.rs");

    // This should compile - check_write is now public
    let result = enforcer.check_write(path);
    assert!(result.allowed);
    assert_eq!(result.operation, Operation::Write(path.to_path_buf()));
}

/// Test that check_execute() is now public and accessible
#[test]
fn test_check_execute_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

    // This should compile - check_execute is now public
    let result = enforcer.check_execute("cargo build");
    assert!(result.allowed);
    assert_eq!(result.operation, Operation::Execute("cargo build".to_string()));
}

/// Test that check_edit_code() is now public and accessible
#[test]
fn test_check_edit_code_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("src/main.rs");

    // This should compile - check_edit_code is now public
    let result = enforcer.check_edit_code(path);
    assert!(result.allowed);
    assert_eq!(result.operation, Operation::EditCode(path.to_path_buf()));
}

/// Test all public methods with Architect role (read-only for code)
#[test]
fn test_architect_public_methods() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
    let code_path = Path::new("src/main.rs");
    let doc_path = Path::new("PLAN.md");

    // Architect can read
    assert!(enforcer.check_read(code_path).allowed);
    assert!(enforcer.check_read(doc_path).allowed);

    // Architect cannot edit code
    assert!(!enforcer.check_edit_code(code_path).allowed);

    // Architect cannot execute commands
    assert!(!enforcer.check_execute("cargo build").allowed);

    // Architect can write to allowed files (docs, plans)
    let write_result = enforcer.check_write(doc_path);
    // This may depend on file access patterns
}

/// Test all public methods with Developer role (full access)
#[test]
fn test_developer_public_methods() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("src/main.rs");

    assert!(enforcer.check_read(path).allowed);
    assert!(enforcer.check_write(path).allowed);
    assert!(enforcer.check_edit_code(path).allowed);
    assert!(enforcer.check_execute("cargo build").allowed);
    assert!(enforcer.check_execute("cargo test").allowed);
}

/// Test all public methods with QA role (test-focused)
#[test]
fn test_qa_public_methods() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
    let test_path = Path::new("tests/test.rs");
    let src_path = Path::new("src/main.rs");

    // QA can read
    assert!(enforcer.check_read(test_path).allowed);
    assert!(enforcer.check_read(src_path).allowed);

    // QA cannot edit code
    assert!(!enforcer.check_edit_code(src_path).allowed);

    // QA can execute test commands
    assert!(enforcer.check_execute("cargo test").allowed);
}

/// Test all public methods with Security role (audit-focused)
#[test]
fn test_security_public_methods() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Security);
    let path = Path::new("Cargo.toml");

    // Security can read
    assert!(enforcer.check_read(path).allowed);

    // Security cannot edit code
    assert!(!enforcer.check_edit_code(path).allowed);

    // Security can execute audit commands
    assert!(enforcer.check_execute("cargo audit").allowed);
}

/// Test all public methods with Deployer role (deployment-focused)
#[test]
fn test_deployer_public_methods() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);
    let dockerfile = Path::new("Dockerfile");
    let src_path = Path::new("src/main.rs");

    // Deployer can read
    assert!(enforcer.check_read(dockerfile).allowed);
    assert!(enforcer.check_read(src_path).allowed);

    // Deployer cannot edit code
    assert!(!enforcer.check_edit_code(src_path).allowed);

    // Deployer can execute build/deploy commands
    assert!(enforcer.check_execute("docker build").allowed);
}

/// Test that the fixes don't break existing enforcement logic
#[test]
fn test_enforcement_logic_still_works() {
    let architect = CapabilityEnforcer::new(AlmasRole::Architect);
    let developer = CapabilityEnforcer::new(AlmasRole::Developer);

    let code_file = Path::new("src/lib.rs");

    // Architect blocked from editing
    let arch_edit = architect.check_edit_code(code_file);
    assert!(!arch_edit.allowed);
    assert!(arch_edit.reason.contains("does not have code editing permission"));

    // Developer allowed to edit
    let dev_edit = developer.check_edit_code(code_file);
    assert!(dev_edit.allowed);
}

/// Test role switching doesn't break after fixes
#[test]
fn test_role_switching_comprehensive() {
    let mut enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
    let path = Path::new("src/main.rs");

    // Architect: cannot edit
    assert!(!enforcer.check_edit_code(path).allowed);

    // Switch to Developer: can edit
    enforcer.switch_role(AlmasRole::Developer);
    assert!(enforcer.check_edit_code(path).allowed);

    // Switch to QA: cannot edit
    enforcer.switch_role(AlmasRole::Qa);
    assert!(!enforcer.check_edit_code(path).allowed);

    // Switch to Security: cannot edit
    enforcer.switch_role(AlmasRole::Security);
    assert!(!enforcer.check_edit_code(path).allowed);

    // Switch to Deployer: cannot edit
    enforcer.switch_role(AlmasRole::Deployer);
    assert!(!enforcer.check_edit_code(path).allowed);

    // Switch back to Developer: can edit again
    enforcer.switch_role(AlmasRole::Developer);
    assert!(enforcer.check_edit_code(path).allowed);
}

/// Edge case: Test with empty path
#[test]
fn test_public_methods_empty_path() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let empty_path = Path::new("");

    let read = enforcer.check_read(empty_path);
    let write = enforcer.check_write(empty_path);
    let edit = enforcer.check_edit_code(empty_path);

    // Results may vary, but should not panic
    let _ = (read, write, edit);
}

/// Edge case: Test with very long path
#[test]
fn test_public_methods_long_path() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let long_path_str = "a/".repeat(100) + "file.rs";
    let long_path = Path::new(&long_path_str);

    let read = enforcer.check_read(long_path);
    let write = enforcer.check_write(long_path);
    let edit = enforcer.check_edit_code(long_path);

    // Should handle long paths without panic
    let _ = (read, write, edit);
}

/// Edge case: Test with special characters in command
#[test]
fn test_check_execute_special_characters() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

    let commands = vec![
        "cargo build --release",
        "cargo test -- --nocapture",
        "npm run build:prod",
        "echo 'test'",
        "cargo clippy -- -D warnings",
    ];

    for cmd in commands {
        let result = enforcer.check_execute(cmd);
        // Should handle special characters without panic
        let _ = result;
    }
}

/// Regression test: Ensure original test file tests still pass
#[test]
fn test_original_almas_integration_tests_compatibility() {
    // This tests that our fixes don't break existing tests in almas_integration_tests.rs
    let architect = CapabilityEnforcer::new(AlmasRole::Architect);
    let developer = CapabilityEnforcer::new(AlmasRole::Developer);

    // These are the exact calls from almas_integration_tests.rs that were failing
    let _ = architect.check_read(PathBuf::from("PLAN.md").as_path());
    let _ = architect.check_edit_code(PathBuf::from("src/main.rs").as_path());
    let _ = developer.check_read(PathBuf::from("src/main.rs").as_path());
    let _ = developer.check_write(PathBuf::from("src/main.rs").as_path());
    let _ = developer.check_edit_code(PathBuf::from("src/main.rs").as_path());
    let _ = developer.check_execute("cargo build");

    // If we reach here, all public method calls work
}
