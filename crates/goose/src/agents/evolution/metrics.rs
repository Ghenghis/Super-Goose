//! Metrics Tracking - Success Measurement for Prompt Optimization
//!
//! Tracks prompt performance metrics for A/B testing and optimization decisions.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Success metrics for a prompt variation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuccessMetrics {
    /// Number of attempts with this prompt
    pub attempts: usize,
    /// Number of successful outcomes
    pub successes: usize,
    /// Average quality score (0.0-1.0)
    pub avg_quality: f32,
    /// Average completion time (milliseconds)
    pub avg_duration_ms: u64,
    /// Token efficiency (output_quality / tokens_used)
    pub token_efficiency: f32,
}

impl SuccessMetrics {
    /// Create new empty metrics
    pub fn new() -> Self {
        Self {
            attempts: 0,
            successes: 0,
            avg_quality: 0.0,
            avg_duration_ms: 0,
            token_efficiency: 0.0,
        }
    }

    /// Calculate success rate
    pub fn success_rate(&self) -> f32 {
        if self.attempts == 0 {
            return 0.0;
        }
        self.successes as f32 / self.attempts as f32
    }

    /// Record a new attempt
    pub fn record_attempt(&mut self, success: bool, quality: f32, duration_ms: u64) {
        self.attempts += 1;
        if success {
            self.successes += 1;
        }

        // Update running average for quality
        let total_quality = self.avg_quality * (self.attempts - 1) as f32 + quality;
        self.avg_quality = total_quality / self.attempts as f32;

        // Update running average for duration
        let total_duration = self.avg_duration_ms * (self.attempts - 1) as u64 + duration_ms;
        self.avg_duration_ms = total_duration / self.attempts as u64;
    }

    /// Update token efficiency
    pub fn update_token_efficiency(&mut self, tokens_used: usize) {
        if tokens_used > 0 {
            self.token_efficiency = self.avg_quality / tokens_used as f32;
        }
    }

    /// Check if metrics are statistically significant
    pub fn is_significant(&self, min_attempts: usize) -> bool {
        self.attempts >= min_attempts
    }
}

impl Default for SuccessMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Performance comparison between prompts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptPerformance {
    /// Prompt identifier
    pub prompt_id: String,
    /// Prompt text (hash or short version)
    pub prompt_hash: String,
    /// Success metrics
    pub metrics: SuccessMetrics,
    /// When this prompt was created
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Last used timestamp
    pub last_used: chrono::DateTime<chrono::Utc>,
}

impl PromptPerformance {
    /// Create new performance tracker for a prompt
    pub fn new(prompt_id: impl Into<String>, prompt_hash: impl Into<String>) -> Self {
        let now = chrono::Utc::now();
        Self {
            prompt_id: prompt_id.into(),
            prompt_hash: prompt_hash.into(),
            metrics: SuccessMetrics::new(),
            created_at: now,
            last_used: now,
        }
    }

    /// Record usage
    pub fn record_usage(&mut self, success: bool, quality: f32, duration_ms: u64) {
        self.metrics.record_attempt(success, quality, duration_ms);
        self.last_used = chrono::Utc::now();
    }

    /// Calculate improvement over baseline
    pub fn improvement_over(&self, baseline: &PromptPerformance) -> f32 {
        // Calculate combined score: success_rate * quality * (1 / duration)
        // This accounts for success rate, quality, and speed
        let baseline_score = baseline.metrics.success_rate()
            * baseline.metrics.avg_quality
            * (1000.0 / baseline.metrics.avg_duration_ms.max(1) as f32);

        let new_score = self.metrics.success_rate()
            * self.metrics.avg_quality
            * (1000.0 / self.metrics.avg_duration_ms.max(1) as f32);

        if baseline_score == 0.0 {
            return 0.0;
        }

        (new_score - baseline_score) / baseline_score
    }
}

/// Metrics tracker for prompt optimization
#[derive(Debug)]
pub struct MetricsTracker {
    /// Performance data by prompt ID
    performances: HashMap<String, PromptPerformance>,
    /// Minimum attempts before comparison
    min_attempts: usize,
}

impl MetricsTracker {
    /// Create a new metrics tracker
    pub fn new() -> Self {
        Self {
            performances: HashMap::new(),
            min_attempts: 5,
        }
    }

    /// Create with custom minimum attempts
    pub fn with_min_attempts(min_attempts: usize) -> Self {
        Self {
            performances: HashMap::new(),
            min_attempts,
        }
    }

    /// Track a prompt
    pub fn track_prompt(&mut self, prompt_id: impl Into<String>, prompt_hash: impl Into<String>) {
        let id = prompt_id.into();
        let hash = prompt_hash.into();

        self.performances
            .entry(id.clone())
            .or_insert_with(|| PromptPerformance::new(id, hash));
    }

    /// Record attempt for a prompt
    pub fn record_attempt(
        &mut self,
        prompt_id: &str,
        success: bool,
        quality: f32,
        duration_ms: u64,
    ) -> Result<()> {
        let performance = self
            .performances
            .get_mut(prompt_id)
            .ok_or_else(|| anyhow::anyhow!("Prompt not tracked: {}", prompt_id))?;

        performance.record_usage(success, quality, duration_ms);
        Ok(())
    }

    /// Get performance for a prompt
    pub fn get_performance(&self, prompt_id: &str) -> Option<&PromptPerformance> {
        self.performances.get(prompt_id)
    }

    /// Compare two prompts
    pub fn compare(&self, prompt_id_a: &str, prompt_id_b: &str) -> Option<f32> {
        let perf_a = self.performances.get(prompt_id_a)?;
        let perf_b = self.performances.get(prompt_id_b)?;

        // Only compare if both have enough data
        if !perf_a.metrics.is_significant(self.min_attempts)
            || !perf_b.metrics.is_significant(self.min_attempts)
        {
            return None;
        }

        Some(perf_b.improvement_over(perf_a))
    }

    /// Get best performing prompt
    pub fn get_best_prompt(&self) -> Option<&PromptPerformance> {
        self.performances
            .values()
            .filter(|p| p.metrics.is_significant(self.min_attempts))
            .max_by(|a, b| {
                a.metrics
                    .success_rate()
                    .partial_cmp(&b.metrics.success_rate())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }

    /// Get all tracked prompts
    pub fn get_all_prompts(&self) -> Vec<&PromptPerformance> {
        self.performances.values().collect()
    }

    /// Clear all metrics
    pub fn clear(&mut self) {
        self.performances.clear();
    }
}

impl Default for MetricsTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_success_metrics() {
        let mut metrics = SuccessMetrics::new();

        assert_eq!(metrics.success_rate(), 0.0);
        assert_eq!(metrics.attempts, 0);

        // Record successful attempt
        metrics.record_attempt(true, 0.9, 1000);
        assert_eq!(metrics.attempts, 1);
        assert_eq!(metrics.successes, 1);
        assert_eq!(metrics.success_rate(), 1.0);
        assert_eq!(metrics.avg_quality, 0.9);
        assert_eq!(metrics.avg_duration_ms, 1000);

        // Record failed attempt
        metrics.record_attempt(false, 0.3, 2000);
        assert_eq!(metrics.attempts, 2);
        assert_eq!(metrics.successes, 1);
        assert_eq!(metrics.success_rate(), 0.5);
        assert_eq!(metrics.avg_quality, 0.6); // (0.9 + 0.3) / 2
        assert_eq!(metrics.avg_duration_ms, 1500); // (1000 + 2000) / 2
    }

    #[test]
    fn test_token_efficiency() {
        let mut metrics = SuccessMetrics::new();
        metrics.record_attempt(true, 0.8, 1000);
        metrics.update_token_efficiency(1000);

        assert!(metrics.token_efficiency > 0.0);
    }

    #[test]
    fn test_prompt_performance() {
        let mut perf = PromptPerformance::new("prompt1", "hash123");

        perf.record_usage(true, 0.9, 1000);
        perf.record_usage(true, 0.95, 1200);

        assert_eq!(perf.metrics.attempts, 2);
        assert_eq!(perf.metrics.success_rate(), 1.0);
    }

    #[test]
    fn test_improvement_calculation() {
        let mut baseline = PromptPerformance::new("old", "hash1");
        baseline.record_usage(true, 0.8, 1000);
        baseline.record_usage(false, 0.4, 1000);
        // Success rate: 0.5

        let mut improved = PromptPerformance::new("new", "hash2");
        improved.record_usage(true, 0.9, 1000);
        improved.record_usage(true, 0.95, 1000);
        // Success rate: 1.0

        let improvement = improved.improvement_over(&baseline);
        assert_eq!(improvement, 1.0); // 100% improvement
    }

    #[test]
    fn test_metrics_tracker() {
        let mut tracker = MetricsTracker::new();

        tracker.track_prompt("prompt1", "hash1");
        tracker.track_prompt("prompt2", "hash2");

        tracker.record_attempt("prompt1", true, 0.9, 1000).unwrap();
        tracker.record_attempt("prompt2", false, 0.3, 1000).unwrap();

        let perf1 = tracker.get_performance("prompt1").unwrap();
        assert_eq!(perf1.metrics.success_rate(), 1.0);

        let perf2 = tracker.get_performance("prompt2").unwrap();
        assert_eq!(perf2.metrics.success_rate(), 0.0);
    }

    #[test]
    fn test_compare_prompts() {
        let mut tracker = MetricsTracker::with_min_attempts(2);

        tracker.track_prompt("old", "hash1");
        tracker.track_prompt("new", "hash2");

        // Record enough attempts for significance
        for _ in 0..3 {
            tracker.record_attempt("old", true, 0.7, 1000).unwrap();
            tracker.record_attempt("new", true, 0.9, 1000).unwrap();
        }

        let comparison = tracker.compare("old", "new");
        assert!(comparison.is_some());
        assert!(comparison.unwrap() > 0.0); // New is better
    }

    #[test]
    fn test_get_best_prompt() {
        let mut tracker = MetricsTracker::with_min_attempts(2);

        tracker.track_prompt("prompt1", "hash1");
        tracker.track_prompt("prompt2", "hash2");
        tracker.track_prompt("prompt3", "hash3");

        // Prompt 1: 50% success
        tracker.record_attempt("prompt1", true, 0.8, 1000).unwrap();
        tracker.record_attempt("prompt1", false, 0.4, 1000).unwrap();

        // Prompt 2: 100% success
        tracker.record_attempt("prompt2", true, 0.9, 1000).unwrap();
        tracker.record_attempt("prompt2", true, 0.95, 1000).unwrap();

        // Prompt 3: 0% success
        tracker.record_attempt("prompt3", false, 0.3, 1000).unwrap();
        tracker.record_attempt("prompt3", false, 0.2, 1000).unwrap();

        let best = tracker.get_best_prompt().unwrap();
        assert_eq!(best.prompt_id, "prompt2");
        assert_eq!(best.metrics.success_rate(), 1.0);
    }

    #[test]
    fn test_statistical_significance() {
        let mut metrics = SuccessMetrics::new();

        assert!(!metrics.is_significant(5));

        for _ in 0..5 {
            metrics.record_attempt(true, 0.9, 1000);
        }

        assert!(metrics.is_significant(5));
    }
}
