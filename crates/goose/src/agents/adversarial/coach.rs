//! Coach Agent - Reviews and critiques Player's work
//!
//! The Coach agent is the "critic" in the Coach/Player adversarial system.
//! It has read-only access and reviews all Player output against quality
//! standards before allowing it to reach the user.

use super::QualityStandards;
use crate::agents::adversarial::player::PlayerResult;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// Configuration for Coach agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachConfig {
    /// Provider to use for Coach (e.g., "openai", "anthropic")
    pub provider: String,
    /// Model to use for Coach (e.g., "gpt-4", "claude-3-opus")
    /// Typically a higher-quality model than Player
    pub model: String,
    /// Temperature for Coach reviews (lower = more consistent)
    pub temperature: f32,
    /// Maximum tokens for Coach reviews
    pub max_tokens: usize,
    /// Quality standards to enforce
    pub quality_standards: QualityStandards,
    /// Coach's system prompt
    pub system_prompt: String,
    /// Read-only mode (Coach cannot modify files)
    pub read_only: bool,
}

impl Default for CoachConfig {
    fn default() -> Self {
        Self {
            provider: "anthropic".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(), // Use same or better model
            temperature: 0.3, // Lower temperature for more consistent reviews
            max_tokens: 4096,
            quality_standards: QualityStandards::default(),
            system_prompt: "You are a Coach agent in an adversarial system. \
                Your role is to review Player agent's work with high standards. \
                Provide constructive criticism and ensure quality before work \
                reaches the user. Be thorough but fair. Focus on correctness, \
                completeness, code quality, and adherence to best practices.".to_string(),
            read_only: true,
        }
    }
}

/// Coach's review of Player's work
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachReview {
    /// Whether the work is approved
    pub approved: bool,
    /// Overall quality score (0.0 to 1.0)
    pub quality_score: f32,
    /// Detailed feedback for Player
    pub feedback: String,
    /// Specific issues found
    pub issues: Vec<ReviewIssue>,
    /// Suggestions for improvement
    pub suggestions: Vec<String>,
    /// Review duration in milliseconds
    pub duration_ms: u64,
    /// Review metadata
    pub metadata: HashMap<String, String>,
}

/// Issue found during review
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewIssue {
    /// Severity of the issue
    pub severity: IssueSeverity,
    /// Category of the issue
    pub category: IssueCategory,
    /// Description of the issue
    pub description: String,
    /// Location of the issue (file path, line number, etc.)
    pub location: Option<String>,
}

/// Severity of a review issue
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IssueSeverity {
    /// Critical issue that must be fixed
    Critical,
    /// Major issue that should be fixed
    Major,
    /// Minor issue or suggestion
    Minor,
    /// Informational note
    Info,
}

/// Category of review issue
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IssueCategory {
    /// Compilation or syntax errors
    CompilationError,
    /// Test failures
    TestFailure,
    /// Code quality issues
    CodeQuality,
    /// Missing documentation
    Documentation,
    /// Security vulnerabilities
    Security,
    /// Performance concerns
    Performance,
    /// Best practice violations
    BestPractice,
    /// Incomplete implementation
    Incomplete,
    /// Other issues
    Other,
}

impl CoachReview {
    /// Create an approved review
    pub fn approved(quality_score: f32) -> Self {
        Self {
            approved: true,
            quality_score,
            feedback: "Work approved".to_string(),
            issues: Vec::new(),
            suggestions: Vec::new(),
            duration_ms: 0,
            metadata: HashMap::new(),
        }
    }

    /// Create a rejected review
    pub fn rejected(feedback: impl Into<String>) -> Self {
        Self {
            approved: false,
            quality_score: 0.0,
            feedback: feedback.into(),
            issues: Vec::new(),
            suggestions: Vec::new(),
            duration_ms: 0,
            metadata: HashMap::new(),
        }
    }

    /// Add an issue to the review
    pub fn with_issue(mut self, issue: ReviewIssue) -> Self {
        self.issues.push(issue);
        self
    }

    /// Add a suggestion to the review
    pub fn with_suggestion(mut self, suggestion: impl Into<String>) -> Self {
        self.suggestions.push(suggestion.into());
        self
    }

    /// Set review duration
    pub fn with_duration(mut self, duration_ms: u64) -> Self {
        self.duration_ms = duration_ms;
        self
    }

    /// Add metadata
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// Count critical issues
    pub fn critical_issues(&self) -> usize {
        self.issues
            .iter()
            .filter(|i| i.severity == IssueSeverity::Critical)
            .count()
    }

    /// Count major issues
    pub fn major_issues(&self) -> usize {
        self.issues
            .iter()
            .filter(|i| i.severity == IssueSeverity::Major)
            .count()
    }
}

/// Coach agent that reviews Player's work
#[derive(Debug)]
pub struct CoachAgent {
    config: CoachConfig,
    review_count: usize,
    total_approvals: usize,
    total_rejections: usize,
}

impl CoachAgent {
    /// Create a new Coach agent with default configuration
    pub fn new() -> Self {
        Self {
            config: CoachConfig::default(),
            review_count: 0,
            total_approvals: 0,
            total_rejections: 0,
        }
    }

    /// Create a new Coach agent with custom configuration
    pub fn with_config(config: CoachConfig) -> Self {
        Self {
            config,
            review_count: 0,
            total_approvals: 0,
            total_rejections: 0,
        }
    }

    /// Get the current configuration
    pub fn config(&self) -> &CoachConfig {
        &self.config
    }

    /// Update the configuration
    pub fn set_config(&mut self, config: CoachConfig) {
        self.config = config;
    }

    /// Get review statistics
    pub fn review_count(&self) -> usize {
        self.review_count
    }

    /// Get approval rate (0.0 to 1.0)
    pub fn approval_rate(&self) -> f32 {
        if self.review_count == 0 {
            return 0.0;
        }
        self.total_approvals as f32 / self.review_count as f32
    }

    /// Review Player's work
    pub async fn review_work(&mut self, player_result: &PlayerResult) -> Result<CoachReview> {
        let start_time = std::time::Instant::now();

        info!(
            provider = %self.config.provider,
            model = %self.config.model,
            "Coach agent reviewing Player's work"
        );

        let review = self.review_work_internal(player_result).await?;

        let duration_ms = start_time.elapsed().as_millis() as u64;
        self.review_count += 1;

        if review.approved {
            self.total_approvals += 1;
            debug!(
                approval_rate = self.approval_rate(),
                "Work approved by Coach"
            );
        } else {
            self.total_rejections += 1;
            warn!(
                issues = review.issues.len(),
                approval_rate = self.approval_rate(),
                "Work rejected by Coach"
            );
        }

        Ok(review.with_duration(duration_ms))
    }

    /// Internal review logic (placeholder)
    async fn review_work_internal(&self, player_result: &PlayerResult) -> Result<CoachReview> {
        // This is a placeholder that would integrate with the actual LLM provider
        // In production, this would:
        // 1. Analyze Player's output against quality standards
        // 2. Check for compilation errors, test failures, etc.
        // 3. Review code quality, documentation, best practices
        // 4. Generate detailed feedback and suggestions
        // 5. Calculate quality score
        // 6. Return comprehensive review

        debug!(
            provider = %self.config.provider,
            model = %self.config.model,
            success = player_result.success,
            "Simulating review"
        );

        // Basic validation based on quality standards
        let mut review = if !player_result.success {
            CoachReview::rejected("Player task failed")
                .with_issue(ReviewIssue {
                    severity: IssueSeverity::Critical,
                    category: IssueCategory::Other,
                    description: "Task execution failed".to_string(),
                    location: None,
                })
        } else {
            // Check quality standards
            let mut quality_score = 1.0;
            let mut issues = Vec::new();

            // In production, would run actual checks here
            if self.config.quality_standards.zero_errors {
                // Would check: cargo build
            }
            if self.config.quality_standards.tests_must_pass {
                // Would check: cargo test
            }
            if self.config.quality_standards.no_todos {
                // Would check: grep for TODO/FIXME
            }

            if issues.is_empty() {
                CoachReview::approved(quality_score)
            } else {
                quality_score -= issues.len() as f32 * 0.1;
                let mut review = CoachReview::rejected("Quality standards not met");
                for issue in issues {
                    review = review.with_issue(issue);
                }
                review.quality_score = quality_score.max(0.0);
                review
            }
        };

        review = review
            .with_metadata("player_provider", &player_result.metadata.get("provider").map(|s| s.as_str()).unwrap_or("unknown"))
            .with_metadata("files_changed", &player_result.files_changed.len().to_string());

        Ok(review)
    }

    /// Reset statistics
    pub fn reset_stats(&mut self) {
        self.review_count = 0;
        self.total_approvals = 0;
        self.total_rejections = 0;
    }
}

impl Default for CoachAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_coach_config_default() {
        let config = CoachConfig::default();
        assert_eq!(config.provider, "anthropic");
        assert_eq!(config.temperature, 0.3);
        assert!(config.read_only);
        assert!(config.quality_standards.zero_errors);
    }

    #[test]
    fn test_coach_review_approved() {
        let review = CoachReview::approved(0.95);
        assert!(review.approved);
        assert_eq!(review.quality_score, 0.95);
        assert_eq!(review.issues.len(), 0);
    }

    #[test]
    fn test_coach_review_rejected() {
        let review = CoachReview::rejected("Too many errors");
        assert!(!review.approved);
        assert_eq!(review.quality_score, 0.0);
        assert_eq!(review.feedback, "Too many errors");
    }

    #[test]
    fn test_coach_review_with_issues() {
        let issue = ReviewIssue {
            severity: IssueSeverity::Critical,
            category: IssueCategory::CompilationError,
            description: "Missing semicolon".to_string(),
            location: Some("main.rs:10".to_string()),
        };

        let review = CoachReview::rejected("Compilation failed")
            .with_issue(issue)
            .with_suggestion("Add semicolon at line 10");

        assert!(!review.approved);
        assert_eq!(review.issues.len(), 1);
        assert_eq!(review.suggestions.len(), 1);
        assert_eq!(review.critical_issues(), 1);
    }

    #[test]
    fn test_issue_severity() {
        let critical = IssueSeverity::Critical;
        let major = IssueSeverity::Major;
        let minor = IssueSeverity::Minor;

        assert_ne!(critical, major);
        assert_ne!(major, minor);
    }

    #[test]
    fn test_issue_category() {
        let compilation = IssueCategory::CompilationError;
        let quality = IssueCategory::CodeQuality;

        assert_ne!(compilation, quality);
    }

    #[test]
    fn test_coach_agent_creation() {
        let agent = CoachAgent::new();
        assert_eq!(agent.review_count(), 0);
        assert_eq!(agent.approval_rate(), 0.0);
    }

    #[tokio::test]
    async fn test_coach_review_success() {
        let mut coach = CoachAgent::new();
        let player_result = PlayerResult::success("Task completed")
            .with_metadata("provider", "anthropic");

        let review = coach.review_work(&player_result).await;
        assert!(review.is_ok());

        let review = review.unwrap();
        assert!(review.approved);
        assert_eq!(coach.review_count(), 1);
        assert_eq!(coach.approval_rate(), 1.0);
    }

    #[tokio::test]
    async fn test_coach_review_failure() {
        let mut coach = CoachAgent::new();
        let player_result = PlayerResult::failure("Task failed");

        let review = coach.review_work(&player_result).await;
        assert!(review.is_ok());

        let review = review.unwrap();
        assert!(!review.approved);
        assert_eq!(coach.review_count(), 1);
        assert_eq!(coach.approval_rate(), 0.0);
    }

    #[tokio::test]
    async fn test_coach_approval_rate() {
        let mut coach = CoachAgent::new();

        // Approve 3 out of 4
        coach.review_work(&PlayerResult::success("1")).await.unwrap();
        coach.review_work(&PlayerResult::success("2")).await.unwrap();
        coach.review_work(&PlayerResult::failure("3")).await.unwrap();
        coach.review_work(&PlayerResult::success("4")).await.unwrap();

        assert_eq!(coach.review_count(), 4);
        assert_eq!(coach.approval_rate(), 0.75);
    }

    #[test]
    fn test_coach_reset_stats() {
        let mut coach = CoachAgent::new();
        coach.review_count = 10;
        coach.total_approvals = 8;
        coach.total_rejections = 2;

        coach.reset_stats();
        assert_eq!(coach.review_count(), 0);
        assert_eq!(coach.approval_rate(), 0.0);
    }
}
