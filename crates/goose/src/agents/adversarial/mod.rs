//! Adversarial Agent System - Coach/Player Pattern
//!
//! Implements the G3 adversarial cooperation pattern where:
//! - Player agent executes tasks (full capabilities)
//! - Coach agent reviews all work (read-only, higher quality standards)
//! - Nothing reaches the user without Coach approval
//! - Multi-provider support (different LLMs for Coach vs Player)

pub mod coach;
pub mod player;
pub mod review;

#[cfg(test)]
mod integration_tests;

pub use coach::{CoachAgent, CoachConfig, CoachReview, IssueCategory, IssueSeverity, ReviewIssue};
pub use player::{PlayerAgent, PlayerConfig, PlayerResult};
pub use review::{ReviewCycle, ReviewFeedback, ReviewOutcome, ReviewStats};

use serde::{Deserialize, Serialize};

/// Agent role in adversarial system
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdversarialRole {
    /// Executes tasks with full capabilities
    Player,
    /// Reviews and critiques work (read-only)
    Coach,
}

/// Configuration for adversarial agent system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdversarialConfig {
    /// Player agent configuration
    pub player_config: PlayerConfig,
    /// Coach agent configuration
    pub coach_config: CoachConfig,
    /// Maximum review iterations before forcing completion
    pub max_review_cycles: usize,
    /// Require Coach approval before showing to user
    pub require_approval: bool,
    /// Allow Player to self-improve based on Coach feedback
    pub enable_self_improvement: bool,
}

impl Default for AdversarialConfig {
    fn default() -> Self {
        Self {
            player_config: PlayerConfig::default(),
            coach_config: CoachConfig::default(),
            max_review_cycles: 3,
            require_approval: true,
            enable_self_improvement: true,
        }
    }
}

/// Quality standards enforced by Coach
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityStandards {
    /// Require zero compilation errors
    pub zero_errors: bool,
    /// Require zero warnings
    pub zero_warnings: bool,
    /// Require all tests to pass
    pub tests_must_pass: bool,
    /// Require code coverage minimum (0.0 to 1.0)
    pub min_coverage: Option<f32>,
    /// Require no TODO/FIXME comments
    pub no_todos: bool,
    /// Require documentation for public APIs
    pub require_docs: bool,
    /// Custom quality checks
    pub custom_checks: Vec<String>,
}

impl Default for QualityStandards {
    fn default() -> Self {
        Self {
            zero_errors: true,
            zero_warnings: true,
            tests_must_pass: true,
            min_coverage: Some(0.8), // 80% coverage
            no_todos: true,
            require_docs: true,
            custom_checks: Vec::new(),
        }
    }
}

impl QualityStandards {
    /// Relaxed standards for prototyping
    pub fn relaxed() -> Self {
        Self {
            zero_errors: true,
            zero_warnings: false,
            tests_must_pass: false,
            min_coverage: None,
            no_todos: false,
            require_docs: false,
            custom_checks: Vec::new(),
        }
    }

    /// Strict production standards
    pub fn strict() -> Self {
        Self {
            zero_errors: true,
            zero_warnings: true,
            tests_must_pass: true,
            min_coverage: Some(0.9), // 90% coverage
            no_todos: true,
            require_docs: true,
            custom_checks: vec![
                "cargo clippy --all-targets -- -D warnings".to_string(),
                "cargo audit".to_string(),
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adversarial_config_default() {
        let config = AdversarialConfig::default();
        assert_eq!(config.max_review_cycles, 3);
        assert!(config.require_approval);
        assert!(config.enable_self_improvement);
    }

    #[test]
    fn test_quality_standards_default() {
        let standards = QualityStandards::default();
        assert!(standards.zero_errors);
        assert!(standards.zero_warnings);
        assert!(standards.tests_must_pass);
        assert_eq!(standards.min_coverage, Some(0.8));
    }

    #[test]
    fn test_quality_standards_relaxed() {
        let standards = QualityStandards::relaxed();
        assert!(standards.zero_errors);
        assert!(!standards.zero_warnings);
        assert!(!standards.tests_must_pass);
        assert_eq!(standards.min_coverage, None);
    }

    #[test]
    fn test_quality_standards_strict() {
        let standards = QualityStandards::strict();
        assert!(standards.zero_errors);
        assert!(standards.zero_warnings);
        assert!(standards.tests_must_pass);
        assert_eq!(standards.min_coverage, Some(0.9));
        assert_eq!(standards.custom_checks.len(), 2);
    }

    #[test]
    fn test_adversarial_role() {
        let player = AdversarialRole::Player;
        let coach = AdversarialRole::Coach;

        assert_ne!(player, coach);
        assert_eq!(player, AdversarialRole::Player);
        assert_eq!(coach, AdversarialRole::Coach);
    }
}
