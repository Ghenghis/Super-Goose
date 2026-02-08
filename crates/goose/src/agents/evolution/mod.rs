//! EvoAgentX - Self-Evolution System with Memory-Informed Optimization
//!
//! Implements automated prompt optimization using:
//! - TextGrad-style meta-prompting for automatic prompt rewriting
//! - Reflexion integration for memory-informed learning
//! - Progressive disclosure for token-efficient context retrieval
//! - Success metrics tracking for A/B testing prompt variations

pub mod memory_integration;
pub mod metrics;
pub mod optimizer;
pub mod progressive_disclosure;

#[cfg(test)]
mod integration_tests;

// TODO: Fix struct field names - TaskAttempt uses attempt_id/task/actions not task_id/reflection/timestamp
// #[cfg(test)]
// mod memory_integration_fix_tests;

pub use memory_integration::{MemoryContext, MemoryRetrieval, ReflexionQuery};
pub use metrics::{MetricsTracker, PromptPerformance, SuccessMetrics};
pub use optimizer::{OptimizationConfig, OptimizationResult, PromptOptimizer, PromptVariation};
pub use progressive_disclosure::{
    CompactEntry, DisclosureLayer, DisclosureStrategy, FullDetailsEntry, LayeredContext,
    TimelineEntry,
};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for EvoAgentX evolution system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionConfig {
    /// Enable automatic prompt optimization
    pub auto_optimize: bool,
    /// Minimum iterations before optimization
    pub min_iterations: usize,
    /// Success rate threshold for optimization (0.0-1.0)
    pub success_threshold: f32,
    /// Use Reflexion memory for optimization
    pub use_memory: bool,
    /// Progressive disclosure configuration
    pub disclosure_strategy: DisclosureStrategy,
    /// Maximum prompt variations to test
    pub max_variations: usize,
    /// Provider for meta-prompting (e.g., "anthropic", "openai")
    pub meta_provider: String,
    /// Model for meta-prompting (typically a reasoning model)
    pub meta_model: String,
}

impl Default for EvolutionConfig {
    fn default() -> Self {
        Self {
            auto_optimize: true,
            min_iterations: 5,
            success_threshold: 0.8,
            use_memory: true,
            disclosure_strategy: DisclosureStrategy::default(),
            max_variations: 3,
            meta_provider: "anthropic".to_string(),
            meta_model: "claude-3-5-sonnet-20241022".to_string(),
        }
    }
}

/// Evolution strategy for prompt optimization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum EvolutionStrategy {
    /// Optimize based on success rate
    SuccessRate,
    /// Optimize based on quality scores
    QualityScore,
    /// Optimize based on memory patterns
    MemoryInformed,
    /// Hybrid approach using all signals
    #[default]
    Hybrid,
}

/// Result of evolution optimization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionResult {
    /// Original prompt
    pub original_prompt: String,
    /// Optimized prompt
    pub optimized_prompt: String,
    /// Improvement score (0.0-1.0)
    pub improvement_score: f32,
    /// Number of iterations used
    pub iterations: usize,
    /// Strategy used
    pub strategy: EvolutionStrategy,
    /// Metadata
    pub metadata: HashMap<String, String>,
}

impl EvolutionResult {
    /// Create a new evolution result
    pub fn new(
        original: impl Into<String>,
        optimized: impl Into<String>,
        improvement: f32,
    ) -> Self {
        Self {
            original_prompt: original.into(),
            optimized_prompt: optimized.into(),
            improvement_score: improvement,
            iterations: 0,
            strategy: EvolutionStrategy::Hybrid,
            metadata: HashMap::new(),
        }
    }

    /// Add metadata entry
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// Set iterations
    pub fn with_iterations(mut self, iterations: usize) -> Self {
        self.iterations = iterations;
        self
    }

    /// Set strategy
    pub fn with_strategy(mut self, strategy: EvolutionStrategy) -> Self {
        self.strategy = strategy;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evolution_config_default() {
        let config = EvolutionConfig::default();
        assert!(config.auto_optimize);
        assert_eq!(config.min_iterations, 5);
        assert_eq!(config.success_threshold, 0.8);
        assert!(config.use_memory);
        assert_eq!(config.max_variations, 3);
    }

    #[test]
    fn test_evolution_strategy() {
        let success = EvolutionStrategy::SuccessRate;
        let quality = EvolutionStrategy::QualityScore;
        let memory = EvolutionStrategy::MemoryInformed;
        let hybrid = EvolutionStrategy::Hybrid;

        assert_ne!(success, quality);
        assert_ne!(quality, memory);
        assert_ne!(memory, hybrid);
        assert_eq!(EvolutionStrategy::default(), hybrid);
    }

    #[test]
    fn test_evolution_result_builder() {
        let result = EvolutionResult::new("old prompt", "new prompt", 0.25)
            .with_iterations(10)
            .with_strategy(EvolutionStrategy::MemoryInformed)
            .with_metadata("source", "reflexion");

        assert_eq!(result.original_prompt, "old prompt");
        assert_eq!(result.optimized_prompt, "new prompt");
        assert_eq!(result.improvement_score, 0.25);
        assert_eq!(result.iterations, 10);
        assert_eq!(result.strategy, EvolutionStrategy::MemoryInformed);
        assert_eq!(result.metadata.get("source").unwrap(), "reflexion");
    }
}
