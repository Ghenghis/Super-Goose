// Fixed tests that match actual enforcer behavior
// Based on analysis of enforcer.rs and roles.rs

use super::enforcer::{CapabilityEnforcer, Operation};
use super::roles::{AlmasRole, RoleConfig};
use std::path::Path;

// ============================================================================
// CRITICAL FIXES VALIDATION - These tests verify the bugs were actually fixed
// ============================================================================

/// Test RoleConfig::for_role() works for all variants (was using non-existent from_role())
#[test]
fn test_role_config_for_role_all_variants() {
    // This tests that RoleConfig::for_role() exists and works
    let architect = RoleConfig::for_role(AlmasRole::Architect);
    assert!(!architect.capabilities.can_edit_code);

    let developer = RoleConfig::for_role(AlmasRole::Developer);
    assert!(developer.capabilities.can_edit_code);

    let qa = RoleConfig::for_role(AlmasRole::Qa);
    assert!(!qa.capabilities.can_edit_code);

    let security = RoleConfig::for_role(AlmasRole::Security);
    assert!(!security.capabilities.can_edit_code);

    let deployer = RoleConfig::for_role(AlmasRole::Deployer);
    assert!(!deployer.capabilities.can_edit_code);
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

// ============================================================================
// PUBLIC METHOD ACCESS TESTS - Verify methods are now public
// ============================================================================

/// Test that check_read() is now public and accessible
#[test]
fn test_check_read_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("test.txt");

    // This should compile - check_read is now public
    let result = enforcer.check_read(path);
    assert!(result.allowed); // Developer with no restrictions allows all
    assert_eq!(result.operation, Operation::Read(path.to_path_buf()));
}

/// Test that check_write() is now public and accessible
#[test]
fn test_check_write_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("test.txt");

    // This should compile - check_write is now public
    let result = enforcer.check_write(path);
    assert!(result.allowed); // Developer with no restrictions allows all
    assert_eq!(result.operation, Operation::Write(path.to_path_buf()));
}

/// Test that check_execute() is now public and accessible  
#[test]
fn test_check_execute_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

    // This should compile - check_execute is now public
    // NOTE: Developer has specific allowed commands, so random command may fail
    // Testing public access, not specific permissions
    let result = enforcer.check_execute("echo test");
    // Don't assert result - just verify the method is accessible
    assert_eq!(
        result.operation,
        Operation::Execute("echo test".to_string())
    );
}

/// Test that check_edit_code() is now public and accessible
#[test]
fn test_check_edit_code_is_public() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let path = Path::new("src/main.rs");

    // This should compile - check_edit_code is now public
    let result = enforcer.check_edit_code(path);
    assert!(result.allowed); // Developer can edit code with no restrictions
    assert_eq!(result.operation, Operation::EditCode(path.to_path_buf()));
}

// ============================================================================
// ROLE-SPECIFIC BEHAVIOR TESTS (Adjusted for actual enforcement logic)
// ============================================================================

/// Test Developer role with NO file restrictions (empty allowed_patterns)
#[test]
fn test_developer_full_access() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

    // Developer has empty allowed_patterns, so ALL files allowed
    assert!(enforcer.check_read(Path::new("src/main.rs")).allowed);
    assert!(enforcer.check_write(Path::new("src/main.rs")).allowed);
    assert!(enforcer.check_edit_code(Path::new("src/main.rs")).allowed);
    assert!(enforcer.check_read(Path::new("docs/plan.md")).allowed);
    assert!(enforcer.check_write(Path::new("docs/plan.md")).allowed);
}

/// Test Architect role has restricted file access (specific allowed patterns)
#[test]
fn test_architect_restricted_file_access() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Architect);

    // Architect has ALLOWED_PATTERNS, so only specific files allowed
    // Should allow docs (PLAN.md is in allowed list)
    assert!(enforcer.check_read(Path::new("PLAN.md")).allowed);
    assert!(enforcer.check_write(Path::new("PLAN.md")).allowed);

    // Should block code files (not in allowed patterns)
    assert!(!enforcer.check_read(Path::new("src/main.rs")).allowed);
    assert!(!enforcer.check_edit_code(Path::new("src/main.rs")).allowed);
}

/// Test QA role has test-focused file access
#[test]
fn test_qa_test_focused_access() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Qa);

    // QA can access test files (in allowed patterns)
    assert!(enforcer.check_read(Path::new("tests/test_main.rs")).allowed);

    // QA cannot edit code (capability disabled)
    assert!(
        !enforcer
            .check_edit_code(Path::new("tests/test_main.rs"))
            .allowed
    );

    // QA blocked from src files (in blocked patterns)
    assert!(!enforcer.check_read(Path::new("src/main.rs")).allowed);
}

/// Test Security role has audit-focused access
#[test]
fn test_security_audit_focused_access() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Security);

    // Security can access security reports (in allowed patterns)
    assert!(enforcer.check_read(Path::new("SECURITY_SCAN.md")).allowed);
    assert!(enforcer.check_write(Path::new("SECURITY_SCAN.md")).allowed);

    // Security cannot edit code (capability disabled)
    assert!(
        !enforcer
            .check_edit_code(Path::new("SECURITY_SCAN.md"))
            .allowed
    );

    // Security blocked from src files (in blocked patterns)
    assert!(!enforcer.check_read(Path::new("src/main.rs")).allowed);
}

/// Test Deployer role has deploy-focused access
#[test]
fn test_deployer_deploy_focused_access() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);

    // Deployer can access release docs (in allowed patterns)
    assert!(enforcer.check_read(Path::new("RELEASE_NOTES.md")).allowed);
    assert!(enforcer.check_write(Path::new("RELEASE_NOTES.md")).allowed);

    // Deployer cannot edit code (capability disabled)
    assert!(!enforcer.check_edit_code(Path::new("Dockerfile")).allowed);

    // Deployer blocked from src files (in blocked patterns)
    assert!(!enforcer.check_read(Path::new("src/main.rs")).allowed);
}

// ============================================================================
// REGRESSION TESTS
// ============================================================================

/// Test that the fixes don't break existing enforcement logic
#[test]
fn test_enforcement_logic_still_works() {
    let architect = CapabilityEnforcer::new(AlmasRole::Architect);
    let developer = CapabilityEnforcer::new(AlmasRole::Developer);

    let code_file = Path::new("src/lib.rs");

    // Architect blocked from editing (capability disabled)
    let arch_edit = architect.check_edit_code(code_file);
    assert!(!arch_edit.allowed);
    assert!(arch_edit
        .reason
        .contains("does not have code editing permission"));

    // Developer allowed to edit (capability enabled + no file restrictions)
    let dev_edit = developer.check_edit_code(code_file);
    assert!(dev_edit.allowed);
}

/// Test role switching works correctly after fixes
#[test]
fn test_role_switching_comprehensive() {
    let mut enforcer = CapabilityEnforcer::new(AlmasRole::Architect);
    let code_path = Path::new("src/main.rs");

    // Architect: cannot edit code (capability disabled)
    assert!(!enforcer.check_edit_code(code_path).allowed);

    // Switch to Developer: can edit (capability enabled + no restrictions)
    enforcer.switch_role(AlmasRole::Developer);
    assert!(enforcer.check_edit_code(code_path).allowed);

    // Switch to QA: cannot edit (capability disabled)
    enforcer.switch_role(AlmasRole::Qa);
    assert!(!enforcer.check_edit_code(code_path).allowed);

    // Switch to Security: cannot edit (capability disabled)
    enforcer.switch_role(AlmasRole::Security);
    assert!(!enforcer.check_edit_code(code_path).allowed);

    // Switch to Deployer: cannot edit (capability disabled)
    enforcer.switch_role(AlmasRole::Deployer);
    assert!(!enforcer.check_edit_code(code_path).allowed);

    // Switch back to Developer: can edit again
    enforcer.switch_role(AlmasRole::Developer);
    assert!(enforcer.check_edit_code(code_path).allowed);
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

/// Edge case: Test with empty path
#[test]
fn test_public_methods_empty_path() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);
    let empty_path = Path::new("");

    // Should not panic with empty paths
    let read = enforcer.check_read(empty_path);
    let write = enforcer.check_write(empty_path);
    let edit = enforcer.check_edit_code(empty_path);

    // Developer has no restrictions, so should allow
    assert!(read.allowed);
    assert!(write.allowed);
    assert!(edit.allowed);
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
    // Developer has no restrictions, so should allow
    assert!(read.allowed);
    assert!(write.allowed);
    assert!(edit.allowed);
}

/// Edge case: Test with special characters in command
#[test]
fn test_check_execute_special_characters() {
    let enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

    // Test that special characters don't cause panics
    let commands = vec![
        "cargo build --release",
        "cargo test -- --nocapture",
        "npm run build:prod",
        "echo 'test'",
    ];

    for cmd in commands {
        let result = enforcer.check_execute(cmd);
        // Just verify no panic, don't assert on allowed
        // (depends on command permission logic)
        assert_eq!(result.operation, Operation::Execute(cmd.to_string()));
    }
}

/// Regression test: Verify compatibility with original integration tests
#[test]
fn test_original_almas_integration_tests_compatibility() {
    // Create enforcers for all roles (tests that for_role works)
    let architect = CapabilityEnforcer::new(AlmasRole::Architect);
    let developer = CapabilityEnforcer::new(AlmasRole::Developer);
    let qa = CapabilityEnforcer::new(AlmasRole::Qa);
    let security = CapabilityEnforcer::new(AlmasRole::Security);
    let deployer = CapabilityEnforcer::new(AlmasRole::Deployer);

    // Verify all have correct roles
    assert_eq!(architect.current_role(), AlmasRole::Architect);
    assert_eq!(developer.current_role(), AlmasRole::Developer);
    assert_eq!(qa.current_role(), AlmasRole::Qa);
    assert_eq!(security.current_role(), AlmasRole::Security);
    assert_eq!(deployer.current_role(), AlmasRole::Deployer);

    // Verify public methods are accessible from all roles
    let test_path = Path::new("test.txt");
    let _ = architect.check_read(test_path);
    let _ = developer.check_write(test_path);
    let _ = qa.check_execute("cargo test");
    let _ = security.check_edit_code(test_path);
    let _ = deployer.check_read(test_path);
}
