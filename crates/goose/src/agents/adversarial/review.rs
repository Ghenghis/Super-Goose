//! Review Cycle System - Orchestrates Coach/Player interaction
//!
//! Manages the iterative review loop where Player executes tasks
//! and Coach reviews the work until approval or max cycles reached.

use super::coach::{CoachAgent, CoachReview};
use super::player::{PlayerAgent, PlayerResult};
use super::AdversarialConfig;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tracing::{debug, info, warn};

/// Outcome of a review cycle
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReviewOutcome {
    /// Work approved by Coach
    Approved,
    /// Work rejected, needs revision
    Rejected,
    /// Maximum cycles reached without approval
    MaxCyclesReached,
    /// Error occurred during review
    Error,
}

/// Feedback from a single review iteration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFeedback {
    /// Cycle number (1-based)
    pub cycle: usize,
    /// Player's result
    pub player_result: PlayerResult,
    /// Coach's review
    pub coach_review: CoachReview,
    /// Outcome of this cycle
    pub outcome: ReviewOutcome,
}

/// Statistics for a complete review cycle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewStats {
    /// Total number of cycles executed
    pub total_cycles: usize,
    /// Final outcome
    pub final_outcome: ReviewOutcome,
    /// Total duration in milliseconds
    pub total_duration_ms: u64,
    /// Average quality score across all reviews
    pub avg_quality_score: f32,
    /// All feedback from each cycle
    pub all_feedback: Vec<ReviewFeedback>,
}

impl ReviewStats {
    /// Create new review stats
    pub fn new() -> Self {
        Self {
            total_cycles: 0,
            final_outcome: ReviewOutcome::Error,
            total_duration_ms: 0,
            avg_quality_score: 0.0,
            all_feedback: Vec::new(),
        }
    }

    /// Add feedback from a cycle
    pub fn add_feedback(&mut self, feedback: ReviewFeedback) {
        self.total_cycles += 1;
        self.all_feedback.push(feedback);
        self.recalculate_avg_quality();
    }

    /// Recalculate average quality score
    fn recalculate_avg_quality(&mut self) {
        if self.all_feedback.is_empty() {
            self.avg_quality_score = 0.0;
            return;
        }

        let sum: f32 = self
            .all_feedback
            .iter()
            .map(|f| f.coach_review.quality_score)
            .sum();

        self.avg_quality_score = sum / self.all_feedback.len() as f32;
    }

    /// Get improvement trend (positive = improving, negative = declining)
    pub fn improvement_trend(&self) -> f32 {
        if self.all_feedback.len() < 2 {
            return 0.0;
        }

        let first_score = self.all_feedback[0].coach_review.quality_score;
        // Safety: len() >= 2 is guaranteed by the early return above
        let last_score = match self.all_feedback.last() {
            Some(fb) => fb.coach_review.quality_score,
            None => return 0.0,
        };

        last_score - first_score
    }
}

impl Default for ReviewStats {
    fn default() -> Self {
        Self::new()
    }
}

/// Review cycle manager
#[derive(Debug)]
pub struct ReviewCycle {
    player: PlayerAgent,
    coach: CoachAgent,
    config: AdversarialConfig,
}

impl ReviewCycle {
    /// Create a new review cycle with default configuration
    pub fn new() -> Self {
        Self {
            player: PlayerAgent::new(),
            coach: CoachAgent::new(),
            config: AdversarialConfig::default(),
        }
    }

    /// Create a new review cycle with custom configuration
    pub fn with_config(config: AdversarialConfig) -> Self {
        Self {
            player: PlayerAgent::with_config(config.player_config.clone()),
            coach: CoachAgent::with_config(config.coach_config.clone()),
            config,
        }
    }

    /// Get the Player agent
    pub fn player(&self) -> &PlayerAgent {
        &self.player
    }

    /// Get the Coach agent
    pub fn coach(&self) -> &CoachAgent {
        &self.coach
    }

    /// Get the configuration
    pub fn config(&self) -> &AdversarialConfig {
        &self.config
    }

    /// Execute a task with iterative review
    pub async fn execute_with_review(&mut self, task_description: &str) -> Result<ReviewStats> {
        let start_time = Instant::now();
        let mut stats = ReviewStats::new();

        info!(
            task = %task_description,
            max_cycles = self.config.max_review_cycles,
            "Starting adversarial review cycle"
        );

        for cycle in 1..=self.config.max_review_cycles {
            debug!(cycle = cycle, "Starting review cycle");

            // Player executes task
            let player_result = match self.player.execute_task(task_description).await {
                Ok(result) => result,
                Err(e) => {
                    warn!(error = %e, "Player execution failed");
                    stats.final_outcome = ReviewOutcome::Error;
                    return Ok(stats);
                }
            };

            // Coach reviews Player's work
            let coach_review = match self.coach.review_work(&player_result).await {
                Ok(review) => review,
                Err(e) => {
                    warn!(error = %e, "Coach review failed");
                    stats.final_outcome = ReviewOutcome::Error;
                    return Ok(stats);
                }
            };

            // Determine outcome
            let outcome = if coach_review.approved {
                ReviewOutcome::Approved
            } else if cycle == self.config.max_review_cycles {
                ReviewOutcome::MaxCyclesReached
            } else {
                ReviewOutcome::Rejected
            };

            // Record feedback
            let feedback = ReviewFeedback {
                cycle,
                player_result: player_result.clone(),
                coach_review: coach_review.clone(),
                outcome: outcome.clone(),
            };

            stats.add_feedback(feedback);

            // Handle outcome
            match outcome {
                ReviewOutcome::Approved => {
                    info!(
                        cycle = cycle,
                        quality_score = coach_review.quality_score,
                        "Work approved by Coach"
                    );
                    stats.final_outcome = ReviewOutcome::Approved;
                    break;
                }
                ReviewOutcome::Rejected => {
                    info!(
                        cycle = cycle,
                        issues = coach_review.issues.len(),
                        "Work rejected, applying feedback for next cycle"
                    );

                    // Apply Coach feedback to Player for self-improvement
                    if self.config.enable_self_improvement {
                        if let Err(e) = self.player.apply_feedback(&coach_review.feedback) {
                            warn!(error = %e, "Failed to apply Coach feedback");
                        }
                    }
                }
                ReviewOutcome::MaxCyclesReached => {
                    warn!(
                        max_cycles = self.config.max_review_cycles,
                        final_score = coach_review.quality_score,
                        "Maximum review cycles reached without approval"
                    );
                    stats.final_outcome = ReviewOutcome::MaxCyclesReached;
                    break;
                }
                ReviewOutcome::Error => {
                    unreachable!("Error outcome handled above");
                }
            }
        }

        // Note: sub-millisecond operations may yield 0ms, which is valid
        stats.total_duration_ms = start_time.elapsed().as_millis() as u64;

        info!(
            total_cycles = stats.total_cycles,
            outcome = ?stats.final_outcome,
            avg_quality = stats.avg_quality_score,
            duration_ms = stats.total_duration_ms,
            "Review cycle complete"
        );

        Ok(stats)
    }

    /// Execute task without review (bypass Coach)
    pub async fn execute_without_review(&mut self, task_description: &str) -> Result<PlayerResult> {
        info!(task = %task_description, "Executing without review");
        self.player.execute_task(task_description).await
    }
}

impl Default for ReviewCycle {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_review_outcome() {
        let approved = ReviewOutcome::Approved;
        let rejected = ReviewOutcome::Rejected;
        let max_cycles = ReviewOutcome::MaxCyclesReached;

        assert_ne!(approved, rejected);
        assert_ne!(rejected, max_cycles);
    }

    #[test]
    fn test_review_stats_creation() {
        let stats = ReviewStats::new();
        assert_eq!(stats.total_cycles, 0);
        assert_eq!(stats.avg_quality_score, 0.0);
        assert_eq!(stats.all_feedback.len(), 0);
    }

    #[test]
    fn test_review_stats_add_feedback() {
        let mut stats = ReviewStats::new();

        let feedback = ReviewFeedback {
            cycle: 1,
            player_result: PlayerResult::success("Done"),
            coach_review: CoachReview::approved(0.9),
            outcome: ReviewOutcome::Approved,
        };

        stats.add_feedback(feedback);

        assert_eq!(stats.total_cycles, 1);
        assert_eq!(stats.avg_quality_score, 0.9);
        assert_eq!(stats.all_feedback.len(), 1);
    }

    #[test]
    fn test_review_stats_average_quality() {
        let mut stats = ReviewStats::new();

        stats.add_feedback(ReviewFeedback {
            cycle: 1,
            player_result: PlayerResult::success("1"),
            coach_review: CoachReview::approved(0.8),
            outcome: ReviewOutcome::Rejected,
        });

        stats.add_feedback(ReviewFeedback {
            cycle: 2,
            player_result: PlayerResult::success("2"),
            coach_review: CoachReview::approved(1.0),
            outcome: ReviewOutcome::Approved,
        });

        assert_eq!(stats.total_cycles, 2);
        assert_eq!(stats.avg_quality_score, 0.9);
    }

    #[test]
    fn test_review_stats_improvement_trend() {
        let mut stats = ReviewStats::new();

        stats.add_feedback(ReviewFeedback {
            cycle: 1,
            player_result: PlayerResult::success("1"),
            coach_review: CoachReview::approved(0.6),
            outcome: ReviewOutcome::Rejected,
        });

        stats.add_feedback(ReviewFeedback {
            cycle: 2,
            player_result: PlayerResult::success("2"),
            coach_review: CoachReview::approved(0.9),
            outcome: ReviewOutcome::Approved,
        });

        let trend = stats.improvement_trend();
        assert_eq!(trend, 0.3); // Improved from 0.6 to 0.9
    }

    #[test]
    fn test_review_cycle_creation() {
        let cycle = ReviewCycle::new();
        assert_eq!(cycle.config().max_review_cycles, 3);
        assert!(cycle.config().require_approval);
    }

    #[test]
    fn test_review_cycle_custom_config() {
        let config = AdversarialConfig {
            max_review_cycles: 5,
            ..Default::default()
        };

        let cycle = ReviewCycle::with_config(config);
        assert_eq!(cycle.config().max_review_cycles, 5);
    }

    #[tokio::test]
    async fn test_execute_with_review_approval() {
        let mut cycle = ReviewCycle::new();
        let stats = cycle.execute_with_review("Simple task").await;

        assert!(stats.is_ok());
        let stats = stats.unwrap();

        // Should approve on first cycle (placeholder implementation always approves success)
        assert_eq!(stats.final_outcome, ReviewOutcome::Approved);
        assert!(stats.total_cycles > 0);
        assert!(stats.avg_quality_score > 0.0);
    }

    #[tokio::test]
    async fn test_execute_without_review() {
        let mut cycle = ReviewCycle::new();
        let result = cycle.execute_without_review("Task without review").await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.success);
    }

    #[tokio::test]
    async fn test_review_cycle_max_cycles() {
        let config = AdversarialConfig {
            max_review_cycles: 2,
            ..Default::default()
        };

        let mut cycle = ReviewCycle::with_config(config);

        // Note: With placeholder implementation, tasks succeed and get approved
        // In production with real LLM, would test actual rejection scenarios
        let stats = cycle.execute_with_review("Test task").await.unwrap();

        assert!(stats.total_cycles <= 2);
    }
}
