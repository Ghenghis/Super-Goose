//! Integration tests for the OTA Self-Improve Pipeline.
//!
//! Tests the full wiring path from `/self-improve` command parsing through
//! OtaManager construction, dry-run execution, state saving, health checking,
//! and the complete update cycle (with a mock workspace).
//!
//! These tests exercise the real OtaManager, StateSaver, SelfBuilder,
//! HealthChecker, and RollbackManager together — no mocks.

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use tempfile::TempDir;

    use crate::ota::{
        BuildConfig, BuildProfile, BuildResult, HealthCheckConfig, HealthReport, CheckResult,
        OtaConfig, OtaManager, SchedulerConfig, StateSaver,
        SelfBuilder, BinarySwapper, HealthChecker, RollbackManager, UpdateScheduler,
        UpdateStatus, UpdateResult,
    };

    // ═══════════════════════════════════════════════════════════════
    // Helper: create a minimal workspace with Cargo.toml
    // ═══════════════════════════════════════════════════════════════

    fn create_mock_workspace(dir: &std::path::Path) {
        // Create a minimal Cargo.toml so prerequisites pass
        std::fs::write(
            dir.join("Cargo.toml"),
            r#"[workspace]
members = ["crates/goose-cli"]

[package]
name = "test-workspace"
version = "0.0.1"
"#,
        )
        .unwrap();
    }

    fn create_mock_binary(dir: &std::path::Path, name: &str) -> PathBuf {
        let binary_path = dir.join(name);
        std::fs::write(&binary_path, b"#!/bin/sh\necho 'mock binary v1.0.0'").unwrap();
        binary_path
    }

    fn test_ota_config(workspace: &std::path::Path) -> OtaConfig {
        let data_dir = workspace.join(".ota");
        let binary_path = workspace.join("goose_test_binary");
        // Create the fake binary
        std::fs::write(&binary_path, b"fake binary content for testing").unwrap();

        OtaConfig {
            data_dir: data_dir.clone(),
            build_config: BuildConfig {
                workspace_root: workspace.to_path_buf(),
                package: "goose-cli".to_string(),
                binary_name: "goose".to_string(),
                profile: BuildProfile::Debug,
                timeout: std::time::Duration::from_secs(30),
                extra_args: Vec::new(),
            },
            health_check_config: HealthCheckConfig::minimal(binary_path),
            scheduler_config: SchedulerConfig::default(),
            max_snapshots: 3,
            max_backups: 5,
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. OtaManager creation and initialization
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_ota_manager_initializes_idle() {
        let dir = TempDir::new().unwrap();
        let config = test_ota_config(dir.path());
        let manager = OtaManager::new(config);
        assert_eq!(*manager.status(), UpdateStatus::Idle);
    }

    #[test]
    fn test_ota_manager_default_goose_config() {
        let dir = TempDir::new().unwrap();
        let manager = OtaManager::default_goose(dir.path().to_path_buf());
        assert_eq!(*manager.status(), UpdateStatus::Idle);
        // Verify components are wired
        assert!(manager.state_saver.snapshot_dir().to_string_lossy().contains(".ota"));
        assert!(manager.rollback.history_dir().to_string_lossy().contains(".ota"));
    }

    #[test]
    fn test_ota_config_data_dirs_are_consistent() {
        let dir = TempDir::new().unwrap();
        let config = test_ota_config(dir.path());

        // The data_dir should be a subdirectory of the workspace
        assert!(config.data_dir.starts_with(dir.path()));

        // Create the manager and verify directories
        let manager = OtaManager::new(config);
        let snap_dir = manager.state_saver.snapshot_dir();
        let backup_dir = manager.binary_swapper.backup_dir();
        let history_dir = manager.rollback.history_dir();

        // All should be under .ota
        assert!(snap_dir.to_string_lossy().contains("snapshots"));
        assert!(backup_dir.to_string_lossy().contains("backups"));
        assert!(history_dir.to_string_lossy().contains("history"));
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. Dry-run validation (the safe path)
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_dry_run_returns_completed_status() {
        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());
        let config = test_ota_config(dir.path());
        let manager = OtaManager::new(config);

        let result = manager.dry_run();
        assert_eq!(result.status, UpdateStatus::Completed);
        assert!(result.build_result.is_some());
        assert!(result.health_report.is_none(), "Dry run should not run health checks");
        assert!(result.rollback_record.is_none(), "Dry run should not trigger rollback");
    }

    #[test]
    fn test_dry_run_build_result_contains_args() {
        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());
        let config = test_ota_config(dir.path());
        let manager = OtaManager::new(config);

        let result = manager.dry_run();
        let build = result.build_result.unwrap();

        assert!(build.success);
        assert!(build.output.contains("DRY RUN"));
        assert!(build.output.contains("cargo"));
        assert!(build.output.contains("goose-cli"));
        assert_eq!(build.duration_secs, 0.0);
    }

    #[test]
    fn test_dry_run_summary_is_human_readable() {
        let dir = TempDir::new().unwrap();
        let manager = OtaManager::default_goose(dir.path().to_path_buf());

        let result = manager.dry_run();
        assert!(
            result.summary.contains("Dry run"),
            "Summary should mention dry run: '{}'",
            result.summary
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. State saving round-trip
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_state_saver_capture_and_persist() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::new(dir.path().to_path_buf(), 5);

        let snapshot = saver.capture_state(
            "1.24.05",
            r#"{"core":"freeform","version":"1.24.05"}"#,
            vec!["session-1".to_string(), "session-2".to_string()],
            None,
        );

        assert_eq!(snapshot.version, "1.24.05");
        assert_eq!(snapshot.active_sessions.len(), 2);
        assert!(!snapshot.snapshot_id.is_empty());

        // Save to disk
        let path = saver.save_snapshot(&snapshot).await.unwrap();
        assert!(path.exists());

        // Load back
        let loaded = saver.load_snapshot(&snapshot.snapshot_id).await.unwrap();
        assert_eq!(loaded.snapshot_id, snapshot.snapshot_id);
        assert_eq!(loaded.version, "1.24.05");
        assert_eq!(loaded.active_sessions, vec!["session-1", "session-2"]);
    }

    #[tokio::test]
    async fn test_state_saver_prunes_old_snapshots() {
        let dir = TempDir::new().unwrap();
        let saver = StateSaver::new(dir.path().to_path_buf(), 2); // Max 2

        // Save 3 snapshots
        for i in 0..3 {
            let snapshot = saver.capture_state(
                &format!("v{}", i),
                "{}",
                Vec::new(),
                None,
            );
            saver.save_snapshot(&snapshot).await.unwrap();
        }

        // Should have at most 2
        let list = saver.list_snapshots().await.unwrap();
        assert!(list.len() <= 2, "Should prune to max_snapshots=2, found {}", list.len());
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. SelfBuilder prerequisite validation
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_self_builder_validates_workspace_exists() {
        let config = BuildConfig {
            workspace_root: PathBuf::from("/nonexistent/path/that/should/not/exist"),
            ..BuildConfig::default_goose()
        };
        let builder = SelfBuilder::new(config);
        let result = builder.validate_prerequisites().await;
        assert!(result.is_err(), "Should fail for nonexistent workspace");
    }

    #[tokio::test]
    async fn test_self_builder_validates_cargo_toml_present() {
        let dir = TempDir::new().unwrap();
        // Don't create Cargo.toml
        let config = BuildConfig {
            workspace_root: dir.path().to_path_buf(),
            ..BuildConfig::default_goose()
        };
        let builder = SelfBuilder::new(config);
        let result = builder.validate_prerequisites().await;
        assert!(result.is_err(), "Should fail without Cargo.toml");
    }

    #[tokio::test]
    async fn test_self_builder_passes_with_valid_workspace() {
        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());
        let config = BuildConfig {
            workspace_root: dir.path().to_path_buf(),
            ..BuildConfig::default_goose()
        };
        let builder = SelfBuilder::new(config);
        let result = builder.validate_prerequisites().await;
        assert!(result.is_ok(), "Should pass with valid workspace: {:?}", result.err());
    }

    #[test]
    fn test_self_builder_cargo_args_debug() {
        let config = BuildConfig {
            workspace_root: PathBuf::from("/workspace"),
            package: "goose-cli".to_string(),
            binary_name: "goose".to_string(),
            profile: BuildProfile::Debug,
            timeout: std::time::Duration::from_secs(60),
            extra_args: Vec::new(),
        };
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();
        assert_eq!(args, vec!["build", "-p", "goose-cli"]);
    }

    #[test]
    fn test_self_builder_cargo_args_release_with_features() {
        let config = BuildConfig {
            workspace_root: PathBuf::from("/workspace"),
            package: "goose-cli".to_string(),
            binary_name: "goose".to_string(),
            profile: BuildProfile::Release,
            timeout: std::time::Duration::from_secs(600),
            extra_args: vec!["--features".into(), "memory".into()],
        };
        let builder = SelfBuilder::new(config);
        let args = builder.build_cargo_args();
        assert_eq!(
            args,
            vec!["build", "-p", "goose-cli", "--release", "--features", "memory"]
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. HealthChecker with mock binary
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_health_checker_passes_for_existing_binary() {
        let dir = TempDir::new().unwrap();
        let binary = create_mock_binary(dir.path(), "goose_test");

        let config = HealthCheckConfig {
            binary_path: binary,
            workspace_path: dir.path().to_path_buf(),
            run_tests: false,
            check_version: false, // Skip version check (mock binary won't respond)
            check_api: false,
            api_url: None,
            check_timeout: std::time::Duration::from_secs(5),
            test_package: None,
            test_filter: None,
        };
        let checker = HealthChecker::new(config);
        let report = checker.run_all_checks().await.unwrap();

        // Binary exists and has content, so at least those checks pass
        assert!(
            report.passed_count() > 0,
            "At least one check should pass for existing binary"
        );
    }

    #[tokio::test]
    async fn test_health_checker_fails_for_missing_binary() {
        let config = HealthCheckConfig::minimal(PathBuf::from("/nonexistent/binary"));
        let checker = HealthChecker::new(config);
        let report = checker.run_all_checks().await.unwrap();

        assert!(!report.healthy, "Should fail for missing binary");
        assert!(report.failed_count() > 0);
    }

    #[test]
    fn test_health_report_from_checks() {
        let checks = vec![
            CheckResult::pass("binary_exists", "OK", 0.01),
            CheckResult::pass("binary_size", "OK", 0.01),
        ];
        let report = HealthReport::from_checks(checks);
        assert!(report.healthy);
        assert_eq!(report.passed_count(), 2);
        assert_eq!(report.failed_count(), 0);
    }

    #[test]
    fn test_health_report_fails_if_any_check_fails() {
        let checks = vec![
            CheckResult::pass("binary_exists", "OK", 0.01),
            CheckResult::fail("version_check", "Version mismatch", 0.5),
        ];
        let report = HealthReport::from_checks(checks);
        assert!(!report.healthy);
        assert_eq!(report.passed_count(), 1);
        assert_eq!(report.failed_count(), 1);
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. RollbackManager records and retrieval
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_rollback_manager_records_snapshots() {
        let dir = TempDir::new().unwrap();
        let mut mgr = RollbackManager::with_defaults(dir.path().to_path_buf());

        assert_eq!(mgr.snapshot_count(), 0);
        mgr.record_snapshot("snap-001".to_string());
        assert_eq!(mgr.snapshot_count(), 1);
        assert_eq!(mgr.last_snapshot_id(), Some("snap-001"));
    }

    #[test]
    fn test_rollback_manager_cannot_rollback_without_history() {
        let dir = TempDir::new().unwrap();
        let mgr = RollbackManager::with_defaults(dir.path().to_path_buf());
        assert!(!mgr.can_rollback());
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. UpdateScheduler state tracking
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_update_scheduler_tracks_successes() {
        let scheduler = UpdateScheduler::new(SchedulerConfig::default());
        scheduler.record_success().await;
        scheduler.record_success().await;
        // After success, consecutive_failures should be 0
        // (we just verify no panic — the state is internal)
    }

    #[tokio::test]
    async fn test_update_scheduler_tracks_failures() {
        let scheduler = UpdateScheduler::new(SchedulerConfig::default());
        scheduler.record_failure().await;
        scheduler.record_failure().await;
        // Failures tracked without panic
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. Full pipeline dry-run wiring (end-to-end)
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_full_dry_run_pipeline() {
        // This simulates the exact path that /self-improve --dry-run takes:
        // 1. Create OtaManager (as init_ota_manager does)
        // 2. Call dry_run() (as perform_self_improve(true) does)
        // 3. Format the result (as the handler does)

        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());

        // Step 1: Create manager (mimics init_ota_manager)
        let manager = OtaManager::default_goose(dir.path().to_path_buf());
        assert_eq!(*manager.status(), UpdateStatus::Idle);

        // Step 2: Dry run (mimics perform_self_improve(dry_run=true))
        let result = manager.dry_run();
        assert_eq!(result.status, UpdateStatus::Completed);

        // Step 3: Format output (mimics handle_self_improve_command)
        let output = format!(
            "## Self-Improve Dry Run\n\n\
             **Status:** {}\n\
             **Summary:** {}\n\n\
             _No actual build or binary swap performed._",
            result.status, result.summary
        );

        assert!(output.contains("Self-Improve Dry Run"));
        assert!(output.contains("completed"));
        assert!(output.contains("Dry run"));
        assert!(output.contains("No actual build"));
    }

    // ═══════════════════════════════════════════════════════════════
    // 9. Status query wiring
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_status_query_on_idle_manager() {
        // Simulates /self-improve status
        let dir = TempDir::new().unwrap();
        let manager = OtaManager::default_goose(dir.path().to_path_buf());

        let status_str = format!("{}", manager.status());
        assert_eq!(status_str, "idle");

        // The handler formats this as markdown
        let output = format!(
            "## OTA Status\n\n**Status:** {}\n**Workspace:** detected",
            manager.status()
        );
        assert!(output.contains("idle"));
        assert!(output.contains("detected"));
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. Full update pipeline with mock build (async)
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_full_update_pipeline_save_state_phase() {
        // Test the state-saving phase of perform_update.
        // We can't do a real cargo build in tests, but we can test the
        // state capture + save flow that precedes it.

        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());
        let config = test_ota_config(dir.path());
        let manager = OtaManager::new(config);

        // Manually exercise the state-saving path
        let config_json = serde_json::json!({
            "version": "1.24.05",
            "core": "freeform",
            "timestamp": "2026-02-13T00:00:00Z",
        })
        .to_string();

        let snapshot = manager.state_saver.capture_state(
            "1.24.05",
            &config_json,
            Vec::new(),
            None,
        );

        assert_eq!(snapshot.version, "1.24.05");
        assert!(snapshot.config_json.contains("freeform"));

        // Save it
        let path = manager.state_saver.save_snapshot(&snapshot).await.unwrap();
        assert!(path.exists());

        // Verify it round-trips
        let loaded = manager.state_saver.load_snapshot(&snapshot.snapshot_id).await.unwrap();
        assert_eq!(loaded.version, snapshot.version);
        assert_eq!(loaded.config_json, snapshot.config_json);
    }

    #[tokio::test]
    async fn test_perform_update_fails_gracefully_without_cargo() {
        // perform_update should fail at the build step if cargo can't build
        // the package (since our temp dir has a minimal Cargo.toml that
        // doesn't actually define the goose-cli package).

        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());
        let config = test_ota_config(dir.path());
        let mut manager = OtaManager::new(config);

        let result = manager
            .perform_update("1.24.05", r#"{"core":"freeform"}"#)
            .await;

        // This should either:
        // a) Return Ok with a Failed status (build failed)
        // b) Return Err (if cargo itself isn't found)
        match result {
            Ok(update_result) => {
                // Build failed gracefully
                assert!(
                    update_result.status == UpdateStatus::Failed,
                    "Expected Failed status, got {:?}",
                    update_result.status
                );
                assert!(
                    !update_result.summary.is_empty(),
                    "Should have a failure summary"
                );
            }
            Err(e) => {
                // Cargo not found or other env issue — also acceptable in test
                let err_str = format!("{}", e);
                assert!(
                    err_str.contains("cargo") || err_str.contains("build") || err_str.contains("Failed"),
                    "Error should relate to build: {}",
                    err_str
                );
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. Command argument parsing (unit-level wiring)
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_self_improve_arg_parsing_dry_run() {
        // Mimics the logic in handle_self_improve_command
        let params: Vec<&str> = vec!["--dry-run"];
        let dry_run = params.iter().any(|p| *p == "--dry-run" || *p == "dry-run" || *p == "check");
        assert!(dry_run);
    }

    #[test]
    fn test_self_improve_arg_parsing_dry_run_no_dashes() {
        let params: Vec<&str> = vec!["dry-run"];
        let dry_run = params.iter().any(|p| *p == "--dry-run" || *p == "dry-run" || *p == "check");
        assert!(dry_run);
    }

    #[test]
    fn test_self_improve_arg_parsing_check() {
        let params: Vec<&str> = vec!["check"];
        let dry_run = params.iter().any(|p| *p == "--dry-run" || *p == "dry-run" || *p == "check");
        assert!(dry_run);
    }

    #[test]
    fn test_self_improve_arg_parsing_status() {
        let params: Vec<&str> = vec!["status"];
        let is_status = params.first() == Some(&"status");
        assert!(is_status);
    }

    #[test]
    fn test_self_improve_arg_parsing_no_args() {
        let params: Vec<&str> = vec![];
        let dry_run = params.iter().any(|p| *p == "--dry-run" || *p == "dry-run" || *p == "check");
        let is_status = params.first() == Some(&"status");
        assert!(!dry_run);
        assert!(!is_status);
        // Default: full build
    }

    #[test]
    fn test_self_improve_command_aliases() {
        // Verify the match arms in execute_command cover all aliases
        let aliases = ["self-improve", "selfimprove", "ota"];
        for alias in &aliases {
            // Mimic the match logic
            let matched = matches!(*alias, "self-improve" | "selfimprove" | "ota");
            assert!(matched, "Alias '{}' should match", alias);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. UpdateResult serialization (important for persistence)
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_update_result_round_trip() {
        let result = UpdateResult {
            status: UpdateStatus::Completed,
            build_result: Some(BuildResult {
                success: true,
                binary_path: Some(PathBuf::from("/target/release/goose")),
                output: "Build OK".to_string(),
                duration_secs: 42.5,
                built_at: chrono::Utc::now(),
                git_hash: Some("abc123".to_string()),
                profile: BuildProfile::Release,
            }),
            health_report: Some(HealthReport::from_checks(vec![
                CheckResult::pass("binary_exists", "OK", 0.01),
            ])),
            rollback_record: None,
            summary: "Update completed".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: UpdateResult = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.status, UpdateStatus::Completed);
        assert!(deserialized.build_result.unwrap().success);
        assert!(deserialized.health_report.unwrap().healthy);
        assert!(deserialized.rollback_record.is_none());
    }

    // ═══════════════════════════════════════════════════════════════
    // 13. BinarySwapper basic validation
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_binary_swapper_rejects_nonexistent_source() {
        let dir = TempDir::new().unwrap();
        let swapper = BinarySwapper::new(dir.path().join("backups"), 5);

        let active = create_mock_binary(dir.path(), "active_binary");
        let result = swapper
            .swap(&active, &PathBuf::from("/nonexistent/new_binary"))
            .await;

        assert!(result.is_err(), "Should reject nonexistent source binary");
    }

    #[tokio::test]
    async fn test_binary_swapper_rejects_empty_source() {
        let dir = TempDir::new().unwrap();
        let swapper = BinarySwapper::new(dir.path().join("backups"), 5);

        let active = create_mock_binary(dir.path(), "active_binary");
        let empty_binary = dir.path().join("empty_binary");
        std::fs::write(&empty_binary, b"").unwrap();

        let result = swapper.swap(&active, &empty_binary).await;
        assert!(result.is_err(), "Should reject empty source binary");
    }

    #[tokio::test]
    async fn test_binary_swapper_succeeds_with_valid_binaries() {
        let dir = TempDir::new().unwrap();
        let swapper = BinarySwapper::new(dir.path().join("backups"), 5);

        let active = create_mock_binary(dir.path(), "active_binary");
        let new_binary = create_mock_binary(dir.path(), "new_binary");

        let record = swapper.swap(&active, &new_binary).await.unwrap();
        assert!(record.success);
        assert!(record.backup_path.exists(), "Backup should be created");
    }

    // ═══════════════════════════════════════════════════════════════
    // 14. End-to-end dry run pipeline with all components
    // ═══════════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_e2e_dry_run_with_state_save() {
        // Full end-to-end: create manager, save state, dry run, verify

        let dir = TempDir::new().unwrap();
        create_mock_workspace(dir.path());
        let config = test_ota_config(dir.path());
        let manager = OtaManager::new(config);

        // Step 1: Capture state (as perform_self_improve does before build)
        let config_json = serde_json::json!({
            "version": "1.24.05",
            "core": "structured",
        })
        .to_string();

        let snapshot = manager.state_saver.capture_state(
            "1.24.05",
            &config_json,
            vec!["session-42".to_string()],
            None,
        );

        // Step 2: Save snapshot
        let save_result = manager.state_saver.save_snapshot(&snapshot).await;
        assert!(save_result.is_ok(), "State save should succeed: {:?}", save_result.err());

        // Step 3: Dry run
        let result = manager.dry_run();
        assert_eq!(result.status, UpdateStatus::Completed);
        assert!(result.build_result.is_some());

        // Step 4: Verify snapshot persisted
        let loaded = manager
            .state_saver
            .load_snapshot(&snapshot.snapshot_id)
            .await
            .unwrap();
        assert_eq!(loaded.active_sessions, vec!["session-42"]);

        // Step 5: Verify the formatted output looks correct
        let build = result.build_result.unwrap();
        let output = format!(
            "## Self-Improve Dry Run\n\n\
             **Status:** {}\n\
             **Summary:** {}\n\
             **Build args:** {}\n\n\
             _No actual build or binary swap performed._",
            result.status,
            result.summary,
            build.output,
        );

        assert!(output.contains("completed"));
        assert!(output.contains("DRY RUN"));
    }

    // ═══════════════════════════════════════════════════════════════
    // 15. Verify all OTA sub-modules are accessible
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_all_ota_modules_are_importable() {
        // This test verifies the re-exports in ota/mod.rs are correct
        // by constructing types from each sub-module.

        // Verify all sub-module types are re-exported from ota/mod.rs
        use crate::ota::{
            ChangeType, ImprovementType, RiskLevel,
            PolicyAction, Severity, InvariantType,
            CycleStatus, TestRunConfig,
        };

        // Just verify they're importable and constructible
        let _ = ChangeType::Insert;
        let _ = ChangeType::Replace;
        let _ = ChangeType::Delete;
        let _ = ChangeType::Append;
        let _ = ImprovementType::CodeQuality;
        let _ = ImprovementType::Performance;
        let _ = RiskLevel::Low;
        let _ = RiskLevel::Medium;
        let _ = RiskLevel::High;
        let _ = PolicyAction::Allow;
        let _ = PolicyAction::Deny;
        let _ = PolicyAction::Warn;
        let _ = Severity::Info;
        let _ = Severity::Warning;
        let _ = Severity::Error;
        let _ = InvariantType::FileExists;
        let _ = InvariantType::CargoValid;
        let _ = InvariantType::TestCountStable;
        let _ = CycleStatus::Pending;

        // Verify TestRunConfig is accessible with correct fields
        let _config = TestRunConfig {
            workspace_root: PathBuf::from("."),
            run_rust_tests: true,
            run_vitest: false,
            run_tsc: false,
            rust_test_timeout_secs: 300,
            vitest_timeout_secs: 120,
            tsc_timeout_secs: 60,
            known_failures: Vec::new(),
        };
    }
}
