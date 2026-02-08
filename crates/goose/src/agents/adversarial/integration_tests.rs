//! Integration tests for the Coach/Player adversarial system

#[cfg(test)]
mod tests {
    use crate::agents::adversarial::{
        AdversarialConfig, CoachAgent, CoachConfig, CoachReview, IssueCategory, IssueSeverity,
        PlayerAgent, PlayerConfig, PlayerResult, QualityStandards, ReviewCycle, ReviewIssue,
        ReviewOutcome,
    };

    /// Test complete adversarial workflow with approval
    #[tokio::test]
    async fn test_complete_workflow_with_approval() {
        let mut cycle = ReviewCycle::new();

        let stats = cycle
            .execute_with_review("Implement a simple hello world function")
            .await
            .unwrap();

        // Should get approved (placeholder always approves successful tasks)
        assert_eq!(stats.final_outcome, ReviewOutcome::Approved);
        assert!(stats.total_cycles > 0);
        assert!(stats.avg_quality_score > 0.0);
        assert!(stats.total_duration_ms > 0);
    }

    /// Test workflow with custom configuration
    #[tokio::test]
    async fn test_custom_configuration() {
        let mut config = AdversarialConfig {
            max_review_cycles: 5,
            ..Default::default()
        };
        config.player_config.temperature = 0.8;
        config.coach_config.temperature = 0.2;
        config.coach_config.quality_standards = QualityStandards::strict();

        let mut cycle = ReviewCycle::with_config(config);

        let stats = cycle
            .execute_with_review("Write production-ready code")
            .await
            .unwrap();

        assert!(stats.total_cycles <= 5);
    }

    /// Test Player and Coach using different providers
    #[tokio::test]
    async fn test_multi_provider_setup() {
        let mut config = AdversarialConfig::default();

        // Player uses Anthropic Claude
        config.player_config.provider = "anthropic".to_string();
        config.player_config.model = "claude-3-5-sonnet-20241022".to_string();

        // Coach uses OpenAI GPT-4 for review
        config.coach_config.provider = "openai".to_string();
        config.coach_config.model = "gpt-4".to_string();

        let cycle = ReviewCycle::with_config(config);

        assert_eq!(cycle.player().config().provider, "anthropic");
        assert_eq!(cycle.coach().config().provider, "openai");
    }

    /// Test quality standards enforcement
    #[tokio::test]
    async fn test_quality_standards() {
        let strict = QualityStandards::strict();
        assert!(strict.zero_errors);
        assert!(strict.zero_warnings);
        assert!(strict.tests_must_pass);
        assert_eq!(strict.min_coverage, Some(0.9));
        assert!(strict.no_todos);
        assert!(strict.require_docs);
        assert_eq!(strict.custom_checks.len(), 2);

        let relaxed = QualityStandards::relaxed();
        assert!(relaxed.zero_errors);
        assert!(!relaxed.zero_warnings);
        assert!(!relaxed.tests_must_pass);
        assert_eq!(relaxed.min_coverage, None);
    }

    /// Test review feedback and improvement
    #[tokio::test]
    async fn test_review_feedback_loop() {
        let mut player = PlayerAgent::new();
        let mut coach = CoachAgent::new();

        // First execution
        let result1 = player.execute_task("Write code").await.unwrap();
        let review1 = coach.review_work(&result1).await.unwrap();

        // Apply feedback
        player.apply_feedback(&review1.feedback).unwrap();

        // Second execution (should incorporate feedback)
        let result2 = player.execute_task("Write improved code").await.unwrap();
        let _review2 = coach.review_work(&result2).await.unwrap();

        assert_eq!(player.task_count(), 2);
        assert_eq!(coach.review_count(), 2);
    }

    /// Test Coach approval statistics
    #[tokio::test]
    async fn test_coach_statistics() {
        let mut coach = CoachAgent::new();

        // Mix of successes and failures
        coach
            .review_work(&PlayerResult::success("Good work"))
            .await
            .unwrap();
        coach
            .review_work(&PlayerResult::success("Great work"))
            .await
            .unwrap();
        coach
            .review_work(&PlayerResult::failure("Failed"))
            .await
            .unwrap();
        coach
            .review_work(&PlayerResult::success("Excellent"))
            .await
            .unwrap();

        assert_eq!(coach.review_count(), 4);
        assert_eq!(coach.approval_rate(), 0.75); // 3 out of 4 approved
    }

    /// Test review outcome variations
    #[tokio::test]
    async fn test_review_outcomes() {
        let approved = ReviewOutcome::Approved;
        let rejected = ReviewOutcome::Rejected;
        let max_cycles = ReviewOutcome::MaxCyclesReached;
        let error = ReviewOutcome::Error;

        assert_ne!(approved, rejected);
        assert_ne!(rejected, max_cycles);
        assert_ne!(max_cycles, error);
    }

    /// Test Coach review with issues
    #[tokio::test]
    async fn test_coach_review_with_issues() {
        let critical_issue = ReviewIssue {
            severity: IssueSeverity::Critical,
            category: IssueCategory::CompilationError,
            description: "Missing semicolon at line 10".to_string(),
            location: Some("main.rs:10".to_string()),
        };

        let major_issue = ReviewIssue {
            severity: IssueSeverity::Major,
            category: IssueCategory::CodeQuality,
            description: "Complex function needs refactoring".to_string(),
            location: Some("lib.rs:50".to_string()),
        };

        let review = CoachReview::rejected("Multiple issues found")
            .with_issue(critical_issue)
            .with_issue(major_issue)
            .with_suggestion("Break down large function into smaller ones")
            .with_suggestion("Add error handling");

        assert!(!review.approved);
        assert_eq!(review.issues.len(), 2);
        assert_eq!(review.critical_issues(), 1);
        assert_eq!(review.major_issues(), 1);
        assert_eq!(review.suggestions.len(), 2);
    }

    /// Test Player result building
    #[tokio::test]
    async fn test_player_result_building() {
        use std::path::PathBuf;

        let result = PlayerResult::success("Implementation complete")
            .with_file_change(PathBuf::from("src/lib.rs"))
            .with_file_change(PathBuf::from("src/main.rs"))
            .with_command("cargo build")
            .with_command("cargo test")
            .with_tool("Write")
            .with_tool("Edit")
            .with_tool("Bash")
            .with_duration(5000)
            .with_metadata("complexity", "medium")
            .with_metadata("lines_of_code", "150");

        assert!(result.success);
        assert_eq!(result.files_changed.len(), 2);
        assert_eq!(result.commands_executed.len(), 2);
        assert_eq!(result.tools_used.len(), 3);
        assert_eq!(result.duration_ms, 5000);
        assert_eq!(result.metadata.get("complexity").unwrap(), "medium");
    }

    /// Test review cycle without approval requirement (bypass mode)
    #[tokio::test]
    async fn test_review_cycle_bypass() {
        let mut cycle = ReviewCycle::new();

        let result = cycle
            .execute_without_review("Quick prototype task")
            .await
            .unwrap();

        assert!(result.success);
        // No review should have occurred
        assert_eq!(cycle.coach().review_count(), 0);
        assert_eq!(cycle.player().task_count(), 1);
    }

    /// Test improvement trend calculation
    #[tokio::test]
    async fn test_improvement_trend() {
        use crate::agents::adversarial::{ReviewFeedback, ReviewStats};

        let mut stats = ReviewStats::new();

        // First cycle: low quality
        stats.add_feedback(ReviewFeedback {
            cycle: 1,
            player_result: PlayerResult::success("Initial attempt"),
            coach_review: CoachReview::approved(0.5),
            outcome: ReviewOutcome::Rejected,
        });

        // Second cycle: improved
        stats.add_feedback(ReviewFeedback {
            cycle: 2,
            player_result: PlayerResult::success("Better attempt"),
            coach_review: CoachReview::approved(0.7),
            outcome: ReviewOutcome::Rejected,
        });

        // Third cycle: high quality
        stats.add_feedback(ReviewFeedback {
            cycle: 3,
            player_result: PlayerResult::success("Final attempt"),
            coach_review: CoachReview::approved(0.95),
            outcome: ReviewOutcome::Approved,
        });

        let trend = stats.improvement_trend();
        assert_eq!(trend, 0.45); // Improved from 0.5 to 0.95

        assert_eq!(stats.total_cycles, 3);
        assert_eq!(stats.avg_quality_score, (0.5 + 0.7 + 0.95) / 3.0);
    }

    /// Test Player with different models
    #[tokio::test]
    async fn test_player_model_variations() {
        let claude_config = PlayerConfig {
            provider: "anthropic".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: 0.7,
            ..Default::default()
        };

        let gpt4_config = PlayerConfig {
            provider: "openai".to_string(),
            model: "gpt-4-turbo".to_string(),
            temperature: 0.8,
            ..Default::default()
        };

        let claude_player = PlayerAgent::with_config(claude_config);
        let gpt4_player = PlayerAgent::with_config(gpt4_config);

        assert_eq!(claude_player.config().model, "claude-3-5-sonnet-20241022");
        assert_eq!(gpt4_player.config().model, "gpt-4-turbo");
    }

    /// Test Coach with different models for higher quality review
    #[tokio::test]
    async fn test_coach_model_variations() {
        let opus_config = CoachConfig {
            provider: "anthropic".to_string(),
            model: "claude-3-opus-20240229".to_string(),
            temperature: 0.2, // Lower temperature for consistent reviews
            ..Default::default()
        };

        let o1_config = CoachConfig {
            provider: "openai".to_string(),
            model: "o1-preview".to_string(),
            temperature: 0.1, // Even lower for reasoning models
            ..Default::default()
        };

        let opus_coach = CoachAgent::with_config(opus_config);
        let o1_coach = CoachAgent::with_config(o1_config);

        assert_eq!(opus_coach.config().model, "claude-3-opus-20240229");
        assert_eq!(o1_coach.config().model, "o1-preview");
        assert_eq!(opus_coach.config().temperature, 0.2);
        assert_eq!(o1_coach.config().temperature, 0.1);
    }

    /// Test self-improvement disabled
    #[tokio::test]
    async fn test_self_improvement_disabled() {
        let config = AdversarialConfig {
            enable_self_improvement: false,
            ..Default::default()
        };

        let cycle = ReviewCycle::with_config(config);

        assert!(!cycle.config().enable_self_improvement);
    }

    /// Test max cycles enforcement
    #[tokio::test]
    async fn test_max_cycles_enforcement() {
        let config = AdversarialConfig {
            max_review_cycles: 2,
            ..Default::default()
        };

        let mut cycle = ReviewCycle::with_config(config);

        let stats = cycle.execute_with_review("Test task").await.unwrap();

        // Should not exceed max cycles
        assert!(stats.total_cycles <= 2);
    }

    /// Test different issue severities and categories
    #[tokio::test]
    async fn test_issue_severity_and_categories() {
        use crate::agents::adversarial::{IssueCategory, IssueSeverity};

        let severities = [
            IssueSeverity::Critical,
            IssueSeverity::Major,
            IssueSeverity::Minor,
            IssueSeverity::Info,
        ];

        let categories = vec![
            IssueCategory::CompilationError,
            IssueCategory::TestFailure,
            IssueCategory::CodeQuality,
            IssueCategory::Documentation,
            IssueCategory::Security,
            IssueCategory::Performance,
            IssueCategory::BestPractice,
            IssueCategory::Incomplete,
            IssueCategory::Other,
        ];

        assert_eq!(severities.len(), 4);
        assert_eq!(categories.len(), 9);

        // Ensure all are unique
        for i in 0..severities.len() {
            for j in i + 1..severities.len() {
                assert_ne!(severities[i], severities[j]);
            }
        }
    }

    /// Test comprehensive workflow with metadata tracking
    #[tokio::test]
    async fn test_comprehensive_workflow_with_metadata() {
        let mut cycle = ReviewCycle::new();

        let stats = cycle
            .execute_with_review("Create a new feature with tests")
            .await
            .unwrap();

        // Verify stats structure
        assert!(stats.total_cycles > 0);
        assert!(stats.total_duration_ms > 0);
        assert!(!stats.all_feedback.is_empty());

        // Verify each feedback has complete information
        for feedback in &stats.all_feedback {
            assert!(feedback.cycle > 0);
            assert!(!feedback.player_result.output.is_empty());
            assert!(feedback.coach_review.quality_score >= 0.0);
            assert!(feedback.coach_review.quality_score <= 1.0);
        }
    }
}
