//! Integration tests for the complete ALMAS role-based system
//!
//! Tests the full workflow: Architect → Developer → QA → Security → Deployer

#[cfg(test)]
mod tests {
    use crate::agents::team::{AlmasRole, CapabilityEnforcer, Handoff, HandoffManager, Operation};
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// Test the complete ALMAS workflow from Architect through Deployer
    #[test]
    fn test_complete_almas_workflow() {
        let temp_dir = TempDir::new().unwrap();

        // Phase 1: Architect creates plan
        let mut manager = HandoffManager::new(AlmasRole::Architect);
        assert_eq!(manager.current_role(), AlmasRole::Architect);

        let plan_path = temp_dir.path().join("ARCHITECTURE.md");
        fs::write(
            &plan_path,
            "# Architecture Plan\n\n## Overview\nComplete system design",
        )
        .unwrap();

        // Handoff from Architect to Developer
        let handoff1 = HandoffManager::architect_to_developer(
            "feature-001",
            "Implement authentication system",
            plan_path.clone(),
        );

        let result1 = manager.execute_handoff(handoff1);
        assert!(result1.is_ok(), "Architect → Developer handoff failed");
        assert_eq!(manager.current_role(), AlmasRole::Developer);

        // Phase 2: Developer writes code
        let code_paths = vec![
            temp_dir.path().join("src/auth.rs"),
            temp_dir.path().join("src/user.rs"),
        ];

        for path in &code_paths {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, "// Production code\npub fn authenticate() {}").unwrap();
        }

        // Handoff from Developer to QA
        let handoff2 = HandoffManager::developer_to_qa(
            "feature-001",
            "Test authentication system",
            code_paths.clone(),
        );

        let result2 = manager.execute_handoff(handoff2);
        assert!(result2.is_ok(), "Developer → QA handoff failed");
        assert_eq!(manager.current_role(), AlmasRole::Qa);

        // Phase 3: QA writes tests
        let test_paths = vec![
            temp_dir.path().join("tests/auth_test.rs"),
            temp_dir.path().join("tests/integration_test.rs"),
        ];

        for path in &test_paths {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, "#[test]\nfn test_auth() { assert!(true); }").unwrap();
        }

        // Handoff from QA to Security
        let handoff3 = HandoffManager::qa_to_security(
            "feature-001",
            "Security audit authentication system",
            test_paths.clone(),
        );

        let result3 = manager.execute_handoff(handoff3);
        assert!(result3.is_ok(), "QA → Security handoff failed");
        assert_eq!(manager.current_role(), AlmasRole::Security);

        // Phase 4: Security performs audit
        let security_report_path = temp_dir.path().join("SECURITY_REPORT.md");
        fs::write(
            &security_report_path,
            "# Security Audit Report\n\n## Findings\nNo critical vulnerabilities found.",
        )
        .unwrap();

        // Handoff from Security to Deployer
        let handoff4 = HandoffManager::security_to_deployer(
            "feature-001",
            "Deploy authentication system",
            security_report_path.clone(),
        );

        let result4 = manager.execute_handoff(handoff4);
        assert!(result4.is_ok(), "Security → Deployer handoff failed");
        assert_eq!(manager.current_role(), AlmasRole::Deployer);

        // Verify complete workflow
        assert_eq!(
            manager.handoff_history().len(),
            4,
            "Should have 4 handoffs in history"
        );

        // Verify all handoffs succeeded
        for (i, handoff) in manager.handoff_history().iter().enumerate() {
            println!(
                "Handoff {}: {:?} → {:?}",
                i + 1,
                handoff.from_role,
                handoff.to_role
            );
        }
    }

    /// Test failure scenario with rollback to Developer
    #[test]
    fn test_qa_failure_rollback() {
        let _temp_dir = TempDir::new().unwrap();

        // Start at QA role
        let mut manager = HandoffManager::new(AlmasRole::Qa);

        // QA finds issues and sends back to Developer
        let failure_handoff = HandoffManager::failure_handoff(
            AlmasRole::Qa,
            "feature-002",
            "Fix authentication bugs",
            "3 test failures: login timeout, invalid token, session expiry",
        );

        let result = manager.execute_handoff(failure_handoff);
        assert!(result.is_ok(), "Failure handoff should succeed");
        assert_eq!(
            manager.current_role(),
            AlmasRole::Developer,
            "Should rollback to Developer"
        );

        // Verify failure reason in metadata
        let last_handoff = &manager.handoff_history()[0];
        assert_eq!(
            last_handoff.context.metadata.get("failure_reason").unwrap(),
            "3 test failures: login timeout, invalid token, session expiry"
        );
    }

    /// Test capability enforcement throughout workflow
    #[test]
    fn test_role_capability_enforcement() {
        // Architect: Can read/write docs, cannot edit code
        let architect_enforcer = CapabilityEnforcer::new(AlmasRole::Architect);

        let read_plan = architect_enforcer.check_read(PathBuf::from("PLAN.md").as_path());
        assert!(read_plan.allowed, "Architect should read documentation");

        let edit_code = architect_enforcer.check_edit_code(PathBuf::from("src/main.rs").as_path());
        assert!(
            !edit_code.allowed,
            "Architect should NOT edit code directly"
        );

        // Developer: Full permissions
        let developer_enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

        let dev_read = developer_enforcer.check_read(PathBuf::from("src/main.rs").as_path());
        assert!(dev_read.allowed, "Developer should read code");

        let dev_write = developer_enforcer.check_write(PathBuf::from("src/main.rs").as_path());
        assert!(dev_write.allowed, "Developer should write code");

        let dev_edit = developer_enforcer.check_edit_code(PathBuf::from("src/main.rs").as_path());
        assert!(dev_edit.allowed, "Developer should edit code");

        let dev_execute = developer_enforcer.check_execute("cargo build");
        assert!(dev_execute.allowed, "Developer should execute commands");

        // QA: Can read and execute, cannot edit
        let qa_enforcer = CapabilityEnforcer::new(AlmasRole::Qa);

        let qa_read = qa_enforcer.check_read(PathBuf::from("tests/test.rs").as_path());
        assert!(qa_read.allowed, "QA should read tests");

        let qa_execute = qa_enforcer.check_execute("cargo test");
        assert!(qa_execute.allowed, "QA should execute tests");

        let qa_edit = qa_enforcer.check_edit_code(PathBuf::from("src/main.rs").as_path());
        assert!(!qa_edit.allowed, "QA should NOT edit production code");

        // Security: Read-only with execute
        let security_enforcer = CapabilityEnforcer::new(AlmasRole::Security);

        let sec_read = security_enforcer.check_read(PathBuf::from("Cargo.toml").as_path());
        assert!(sec_read.allowed, "Security should read dependencies");

        let sec_write = security_enforcer.check_write(PathBuf::from("Cargo.toml").as_path());
        assert!(
            !sec_write.allowed,
            "Security should NOT modify dependencies"
        );

        let sec_execute = security_enforcer.check_execute("cargo audit");
        assert!(sec_execute.allowed, "Security should run audits");

        // Deployer: Execute-focused, no code editing
        let deployer_enforcer = CapabilityEnforcer::new(AlmasRole::Deployer);

        let deploy_read = deployer_enforcer.check_read(PathBuf::from("Dockerfile").as_path());
        assert!(deploy_read.allowed, "Deployer should read configs");

        let deploy_edit = deployer_enforcer.check_edit_code(PathBuf::from("src/main.rs").as_path());
        assert!(!deploy_edit.allowed, "Deployer should NOT edit source code");

        let deploy_execute = deployer_enforcer.check_execute("docker build");
        assert!(deploy_execute.allowed, "Deployer should execute builds");
    }

    /// Test batch operations with role enforcement
    #[test]
    fn test_batch_operations_enforcement() {
        let developer_enforcer = CapabilityEnforcer::new(AlmasRole::Developer);

        let operations = vec![
            Operation::Read(PathBuf::from("src/lib.rs")),
            Operation::Write(PathBuf::from("src/lib.rs")),
            Operation::EditCode(PathBuf::from("src/lib.rs")),
            Operation::Execute("cargo build".to_string()),
            Operation::Execute("cargo test".to_string()),
        ];

        let results = developer_enforcer.check_operations(&operations);
        assert_eq!(results.len(), 5);
        assert!(
            results.iter().all(|r| r.allowed),
            "Developer should pass all operations"
        );

        // Now test with QA role (should fail on Write and EditCode)
        let qa_enforcer = CapabilityEnforcer::new(AlmasRole::Qa);
        let enforce_result = qa_enforcer.enforce_operations(&operations);
        assert!(
            enforce_result.is_err(),
            "QA should fail batch enforcement due to write operations"
        );
    }

    /// Test invalid transition prevention
    #[test]
    fn test_invalid_transition_blocked() {
        let temp_dir = TempDir::new().unwrap();
        let plan_path = temp_dir.path().join("PLAN.md");
        fs::write(&plan_path, "# Plan").unwrap();

        let mut manager = HandoffManager::new(AlmasRole::Architect);

        // Try to skip Developer and go straight to Security (invalid)
        let invalid_handoff = Handoff {
            from_role: AlmasRole::Architect,
            to_role: AlmasRole::Security,
            artifacts: vec![],
            validation_rules: vec![],
            context: crate::agents::team::handoffs::HandoffContext {
                task_id: "task-invalid".to_string(),
                task_description: "Invalid skip".to_string(),
                timestamp: chrono::Utc::now(),
                metadata: std::collections::HashMap::new(),
            },
        };

        let result = manager.execute_handoff(invalid_handoff);
        assert!(result.is_err(), "Invalid transition should be blocked");
        assert_eq!(
            manager.current_role(),
            AlmasRole::Architect,
            "Role should not change on failed transition"
        );
    }

    /// Test Deployer as final role (no further handoffs)
    #[test]
    fn test_deployer_final_role() {
        let _temp_dir = TempDir::new().unwrap();

        let mut manager = HandoffManager::new(AlmasRole::Deployer);

        // Try to handoff from Deployer (should fail - it's the final role)
        let invalid_handoff = Handoff {
            from_role: AlmasRole::Deployer,
            to_role: AlmasRole::Architect,
            artifacts: vec![],
            validation_rules: vec![],
            context: crate::agents::team::handoffs::HandoffContext {
                task_id: "task-final".to_string(),
                task_description: "Invalid from final role".to_string(),
                timestamp: chrono::Utc::now(),
                metadata: std::collections::HashMap::new(),
            },
        };

        let result = manager.execute_handoff(invalid_handoff);
        assert!(result.is_err(), "Deployer cannot handoff (final role)");
    }

    /// Test role switching with enforcer
    #[test]
    fn test_role_switch_capability_changes() {
        let mut enforcer = CapabilityEnforcer::new(AlmasRole::Qa);

        // QA cannot edit code
        let edit_before = enforcer.check_edit_code(PathBuf::from("src/main.rs").as_path());
        assert!(!edit_before.allowed);

        // Switch to Developer
        enforcer.switch_role(AlmasRole::Developer);

        // Now can edit code
        let edit_after = enforcer.check_edit_code(PathBuf::from("src/main.rs").as_path());
        assert!(edit_after.allowed);
        assert_eq!(enforcer.current_role(), AlmasRole::Developer);
    }

    /// Test handoff artifact validation
    #[test]
    fn test_artifact_validation() {
        let temp_dir = TempDir::new().unwrap();

        // Create only one of two required artifacts
        let existing_path = temp_dir.path().join("existing.rs");
        fs::write(&existing_path, "code").unwrap();

        let missing_path = temp_dir.path().join("missing.rs");

        let mut manager = HandoffManager::new(AlmasRole::Developer);

        let handoff = HandoffManager::developer_to_qa(
            "task-artifacts",
            "Test with missing artifacts",
            vec![existing_path, missing_path],
        );

        let result = manager.execute_handoff(handoff);
        assert!(
            result.is_err(),
            "Handoff should fail with missing required artifacts"
        );
        assert_eq!(
            manager.current_role(),
            AlmasRole::Developer,
            "Role should not change when validation fails"
        );
    }

    /// Test metadata preservation through handoffs
    #[test]
    fn test_handoff_metadata_preservation() {
        let temp_dir = TempDir::new().unwrap();
        let plan_path = temp_dir.path().join("PLAN.md");
        fs::write(&plan_path, "# Plan").unwrap();

        let mut manager = HandoffManager::new(AlmasRole::Architect);

        let handoff = HandoffManager::architect_to_developer(
            "FEAT-123",
            "Implement OAuth2 authentication",
            plan_path,
        );

        let task_id_before = handoff.context.task_id.clone();
        let task_desc_before = handoff.context.task_description.clone();

        manager.execute_handoff(handoff).unwrap();

        let recorded_handoff = &manager.handoff_history()[0];
        assert_eq!(recorded_handoff.context.task_id, task_id_before);
        assert_eq!(recorded_handoff.context.task_description, task_desc_before);
    }
}
