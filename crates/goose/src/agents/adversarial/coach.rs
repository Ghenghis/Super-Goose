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
                completeness, code quality, and adherence to best practices."
                .to_string(),
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

    /// Internal review logic — offline/fallback validation against quality standards.
    ///
    /// This checks the PlayerResult against the configured QualityStandards without
    /// making any LLM calls. It validates success state, scans for TODO/FIXME markers,
    /// detects test command failures, and scores quality accordingly.
    async fn review_work_internal(&self, player_result: &PlayerResult) -> Result<CoachReview> {
        let standards = &self.config.quality_standards;
        let mut issues: Vec<ReviewIssue> = Vec::new();
        let mut suggestions: Vec<String> = Vec::new();
        let mut positive_notes: Vec<String> = Vec::new();

        debug!(
            provider = %self.config.provider,
            model = %self.config.model,
            success = player_result.success,
            commands = player_result.commands_executed.len(),
            files = player_result.files_changed.len(),
            "Reviewing player result against quality standards"
        );

        // --- Check 1: zero_errors — player task must have succeeded ---
        if standards.zero_errors {
            if !player_result.success {
                issues.push(ReviewIssue {
                    severity: IssueSeverity::Critical,
                    category: IssueCategory::CompilationError,
                    description: format!(
                        "Task execution failed: {}",
                        player_result.output.lines().next().unwrap_or("unknown error")
                    ),
                    location: None,
                });
                suggestions.push(
                    "Fix the reported errors and re-run the task".to_string(),
                );
            } else {
                positive_notes.push("Task completed without errors".to_string());
            }
        }

        // --- Check 2: tests_must_pass — look for test commands and their outcomes ---
        if standards.tests_must_pass {
            let test_keywords = ["cargo test", "npm test", "pytest", "go test", "make test"];
            let test_commands: Vec<&String> = player_result
                .commands_executed
                .iter()
                .filter(|cmd| {
                    let lower = cmd.to_lowercase();
                    test_keywords.iter().any(|kw| lower.contains(kw))
                })
                .collect();

            if !test_commands.is_empty() {
                // Tests were executed — check output for failure indicators
                let output_lower = player_result.output.to_lowercase();
                let failure_markers = [
                    "test failed",
                    "tests failed",
                    "failure",
                    "failed",
                    "error[",
                    "panicked at",
                    "assertion failed",
                ];
                let has_failure = failure_markers
                    .iter()
                    .any(|marker| output_lower.contains(marker));

                if has_failure {
                    issues.push(ReviewIssue {
                        severity: IssueSeverity::Critical,
                        category: IssueCategory::TestFailure,
                        description: format!(
                            "Test failure detected after running: {}",
                            test_commands
                                .iter()
                                .map(|c| c.as_str())
                                .collect::<Vec<_>>()
                                .join(", ")
                        ),
                        location: None,
                    });
                    suggestions.push(
                        "Review test output, fix failing tests, and re-run".to_string(),
                    );
                } else {
                    positive_notes.push(format!(
                        "Tests executed and passed ({})",
                        test_commands.len()
                    ));
                }
            }
            // If no test commands were run, we do not penalize — tests may not
            // have been relevant to this task.
        }

        // --- Check 3: no_todos — scan output for TODO/FIXME markers ---
        if standards.no_todos {
            let todo_markers = ["TODO", "FIXME", "HACK", "XXX"];
            let mut found_markers: Vec<String> = Vec::new();

            for line in player_result.output.lines() {
                for marker in &todo_markers {
                    if line.contains(marker) {
                        found_markers.push(format!("{}: {}", marker, line.trim()));
                    }
                }
            }

            if !found_markers.is_empty() {
                let count = found_markers.len();
                issues.push(ReviewIssue {
                    severity: IssueSeverity::Major,
                    category: IssueCategory::CodeQuality,
                    description: format!(
                        "Found {} TODO/FIXME marker(s) in output: {}",
                        count,
                        found_markers
                            .iter()
                            .take(5)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join("; ")
                    ),
                    location: None,
                });
                suggestions.push(
                    "Resolve all TODO/FIXME comments before finalizing".to_string(),
                );
            } else {
                positive_notes.push("No TODO/FIXME markers found".to_string());
            }
        }

        // --- Check 4: zero_warnings — scan output for warning indicators ---
        if standards.zero_warnings {
            let output_lower = player_result.output.to_lowercase();
            let warning_markers = ["warning:", "warn[", "warn:"];
            let has_warnings = warning_markers
                .iter()
                .any(|marker| output_lower.contains(marker));

            if has_warnings {
                issues.push(ReviewIssue {
                    severity: IssueSeverity::Minor,
                    category: IssueCategory::CodeQuality,
                    description: "Compiler or tool warnings detected in output".to_string(),
                    location: None,
                });
                suggestions.push(
                    "Address all warnings to maintain clean build output".to_string(),
                );
            }
        }

        // --- Check 5: require_docs — look for documentation indicators ---
        if standards.require_docs && !player_result.files_changed.is_empty() {
            let has_doc_content = player_result.output.contains("///")
                || player_result.output.contains("//!")
                || player_result.output.to_lowercase().contains("documentation");

            if !has_doc_content {
                issues.push(ReviewIssue {
                    severity: IssueSeverity::Minor,
                    category: IssueCategory::Documentation,
                    description: "No documentation evidence found for changed files".to_string(),
                    location: None,
                });
                suggestions.push(
                    "Add documentation comments for public APIs in changed files".to_string(),
                );
            }
        }

        // --- Check 6: error line count — count error-like patterns in output ---
        {
            let error_patterns = [
                "error:", "error[", "Error:", "ERROR:", "panic:", "PANIC:",
                "exception:", "Exception:", "EXCEPTION:", "fatal:", "FATAL:",
            ];
            let error_line_count = player_result
                .output
                .lines()
                .filter(|line| error_patterns.iter().any(|pat| line.contains(pat)))
                .count();

            if error_line_count > 0 {
                // Enforce max_error_lines if configured (0 = no hard limit)
                if standards.max_error_lines > 0 && error_line_count > standards.max_error_lines {
                    issues.push(ReviewIssue {
                        severity: IssueSeverity::Critical,
                        category: IssueCategory::CompilationError,
                        description: format!(
                            "Output contains {} error lines (max allowed: {})",
                            error_line_count, standards.max_error_lines,
                        ),
                        location: None,
                    });
                    suggestions.push(format!(
                        "Reduce error count to at most {} before submitting",
                        standards.max_error_lines,
                    ));
                } else if error_line_count > 0 {
                    issues.push(ReviewIssue {
                        severity: IssueSeverity::Info,
                        category: IssueCategory::CodeQuality,
                        description: format!(
                            "Detected {} error-like line(s) in output",
                            error_line_count,
                        ),
                        location: None,
                    });
                }

                debug!(
                    error_line_count,
                    "Error-like lines detected in player output"
                );
            }
        }

        // --- Score calculation ---
        // Start at 1.0 and deduct based on issue severity
        let mut quality_score: f32 = 1.0;
        for issue in &issues {
            match issue.severity {
                IssueSeverity::Critical => quality_score -= 0.4,
                IssueSeverity::Major => quality_score -= 0.2,
                IssueSeverity::Minor => quality_score -= 0.1,
                IssueSeverity::Info => {} // No penalty for informational notes
            }
        }
        quality_score = quality_score.clamp(0.0, 1.0);

        // --- Build review ---
        let has_critical = issues
            .iter()
            .any(|i| i.severity == IssueSeverity::Critical);
        let has_major = issues.iter().any(|i| i.severity == IssueSeverity::Major);

        // Apply configurable quality threshold: even if no critical/major issues,
        // reject work that falls below the minimum quality score.
        let below_threshold = quality_score < standards.min_quality_score;
        if below_threshold && !has_critical && !has_major {
            info!(
                quality_score,
                min = standards.min_quality_score,
                "Work rejected: quality score below configurable threshold"
            );
        }

        let approved = !has_critical && !has_major && !below_threshold;

        let feedback = if approved {
            if positive_notes.is_empty() {
                "Work approved — all quality standards met.".to_string()
            } else {
                format!(
                    "Work approved — all quality standards met. Highlights: {}",
                    positive_notes.join("; ")
                )
            }
        } else {
            let mut failed_standards: Vec<&str> = issues
                .iter()
                .map(|i| match i.category {
                    IssueCategory::CompilationError => "zero-errors",
                    IssueCategory::TestFailure => "tests-must-pass",
                    IssueCategory::CodeQuality => "code-quality",
                    IssueCategory::Documentation => "documentation",
                    IssueCategory::Security => "security",
                    IssueCategory::Performance => "performance",
                    IssueCategory::BestPractice => "best-practice",
                    IssueCategory::Incomplete => "completeness",
                    IssueCategory::Other => "other",
                })
                .collect();
            failed_standards.sort_unstable();
            failed_standards.dedup();
            format!(
                "Work rejected — quality standards not met. Failed checks: {}",
                failed_standards.join(", ")
            )
        };

        let mut review = CoachReview {
            approved,
            quality_score,
            feedback,
            issues,
            suggestions,
            duration_ms: 0,
            metadata: HashMap::new(),
        };

        review = review
            .with_metadata(
                "player_provider",
                player_result
                    .metadata
                    .get("provider")
                    .map(|s| s.as_str())
                    .unwrap_or("unknown"),
            )
            .with_metadata(
                "files_changed",
                player_result.files_changed.len().to_string(),
            )
            .with_metadata("review_type", "offline_standards_check");

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
        let player_result =
            PlayerResult::success("Task completed").with_metadata("provider", "anthropic");

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
        coach
            .review_work(&PlayerResult::success("1"))
            .await
            .unwrap();
        coach
            .review_work(&PlayerResult::success("2"))
            .await
            .unwrap();
        coach
            .review_work(&PlayerResult::failure("3"))
            .await
            .unwrap();
        coach
            .review_work(&PlayerResult::success("4"))
            .await
            .unwrap();

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

    #[tokio::test]
    async fn test_coach_review_error_lines_detected() {
        let mut coach = CoachAgent::new();

        // Result with error lines in output
        let mut player_result = PlayerResult::success("Compiled with errors");
        player_result.output = "Building...\nerror: missing semicolon\nerror: unknown type\nDone.\n".to_string();

        let review = coach.review_work(&player_result).await.unwrap();
        // Should have an informational issue about error lines
        let error_issues: Vec<_> = review
            .issues
            .iter()
            .filter(|i| i.description.contains("error-like line"))
            .collect();
        assert!(!error_issues.is_empty());
    }

    #[tokio::test]
    async fn test_coach_review_max_error_lines_enforced() {
        let mut config = CoachConfig::default();
        config.quality_standards.max_error_lines = 1; // only allow 1 error line
        let mut coach = CoachAgent::with_config(config);

        // Result with 3 error lines — exceeds limit
        let mut player_result = PlayerResult::success("Build output");
        player_result.output =
            "error: first\nerror: second\nerror: third\n".to_string();

        let review = coach.review_work(&player_result).await.unwrap();

        // Should be rejected (critical issue for exceeding max_error_lines)
        assert!(!review.approved);
        let critical_errors: Vec<_> = review
            .issues
            .iter()
            .filter(|i| {
                i.severity == IssueSeverity::Critical
                    && i.description.contains("error lines")
            })
            .collect();
        assert!(!critical_errors.is_empty());
    }

    #[tokio::test]
    async fn test_coach_review_quality_threshold() {
        let mut config = CoachConfig::default();
        // Set a high threshold — even minor issues will cause rejection
        config.quality_standards.min_quality_score = 0.95;
        config.quality_standards.no_todos = true;
        let mut coach = CoachAgent::with_config(config);

        // Result with TODO markers (minor issue, -0.2 score)
        let mut player_result = PlayerResult::success("Task complete");
        player_result.output = "TODO: clean up later\nFIXME: handle edge case\n".to_string();

        let review = coach.review_work(&player_result).await.unwrap();
        // Score should be below 0.95 due to TODO markers (Major -0.2)
        assert!(review.quality_score < 0.95);
        assert!(!review.approved, "Should be rejected due to quality threshold");
    }

    #[tokio::test]
    async fn test_coach_review_relaxed_threshold_approves() {
        let mut config = CoachConfig::default();
        config.quality_standards = QualityStandards::relaxed();
        let mut coach = CoachAgent::with_config(config);

        // Clean success output — should pass relaxed standards easily
        let player_result = PlayerResult::success("Everything looks good");

        let review = coach.review_work(&player_result).await.unwrap();
        assert!(review.approved);
        assert!(review.quality_score >= 0.3); // relaxed threshold
    }
}
