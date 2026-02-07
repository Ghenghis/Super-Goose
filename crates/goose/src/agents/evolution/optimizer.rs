//! Prompt Optimizer - TextGrad-Style Meta-Prompting
//!
//! Automatically rewrites prompts based on performance feedback using
//! meta-prompting techniques inspired by TextGrad.

use super::memory_integration::{MemoryContext, MemoryRetrieval, ReflexionQuery};
use super::metrics::MetricsTracker;
use super::{EvolutionConfig, EvolutionResult, EvolutionStrategy};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

/// Prompt variation for A/B testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptVariation {
    /// Variation identifier
    pub id: String,
    /// The prompt text
    pub prompt: String,
    /// Generation number (0 = original)
    pub generation: usize,
    /// Parent variation ID (if evolved)
    pub parent_id: Option<String>,
    /// Optimization rationale
    pub rationale: String,
}

impl PromptVariation {
    /// Create a new prompt variation
    pub fn new(id: impl Into<String>, prompt: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            prompt: prompt.into(),
            generation: 0,
            parent_id: None,
            rationale: String::new(),
        }
    }

    /// Create evolved variation
    pub fn evolve(
        id: impl Into<String>,
        prompt: impl Into<String>,
        parent: &PromptVariation,
        rationale: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            prompt: prompt.into(),
            generation: parent.generation + 1,
            parent_id: Some(parent.id.clone()),
            rationale: rationale.into(),
        }
    }
}

/// Configuration for optimization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationConfig {
    /// Evolution configuration
    pub evolution: EvolutionConfig,
    /// Use memory for optimization
    pub use_memory: bool,
    /// Use progressive disclosure
    pub use_progressive_disclosure: bool,
    /// Minimum improvement to accept new prompt (0.0-1.0)
    pub min_improvement: f32,
}

impl Default for OptimizationConfig {
    fn default() -> Self {
        Self {
            evolution: EvolutionConfig::default(),
            use_memory: true,
            use_progressive_disclosure: true,
            min_improvement: 0.1, // 10% improvement required
        }
    }
}

/// Result of optimization attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    /// Best prompt variation
    pub best_variation: PromptVariation,
    /// All tested variations
    pub all_variations: Vec<PromptVariation>,
    /// Performance improvement (0.0-1.0)
    pub improvement: f32,
    /// Number of iterations
    pub iterations: usize,
    /// Memory context used
    pub memory_hints: Option<String>,
}

/// Prompt optimizer using TextGrad-style meta-prompting
#[derive(Debug)]
pub struct PromptOptimizer {
    config: OptimizationConfig,
    metrics_tracker: MetricsTracker,
    memory_retrieval: MemoryRetrieval,
    variations: Vec<PromptVariation>,
}

impl PromptOptimizer {
    /// Create a new prompt optimizer
    pub fn new() -> Self {
        Self {
            config: OptimizationConfig::default(),
            metrics_tracker: MetricsTracker::new(),
            memory_retrieval: MemoryRetrieval::new(),
            variations: Vec::new(),
        }
    }

    /// Create with custom configuration
    pub fn with_config(config: OptimizationConfig) -> Self {
        Self {
            config,
            metrics_tracker: MetricsTracker::new(),
            memory_retrieval: MemoryRetrieval::new(),
            variations: Vec::new(),
        }
    }

    /// Get the configuration
    pub fn config(&self) -> &OptimizationConfig {
        &self.config
    }

    /// Get the metrics tracker
    pub fn metrics(&self) -> &MetricsTracker {
        &self.metrics_tracker
    }

    /// Optimize a prompt based on feedback
    pub async fn optimize_prompt(
        &mut self,
        original_prompt: &str,
        task_description: &str,
    ) -> Result<EvolutionResult> {
        info!(
            task = %task_description,
            "Starting prompt optimization"
        );

        let start_time = std::time::Instant::now();

        // Create original variation
        let original = PromptVariation::new("v0", original_prompt);
        self.variations.push(original.clone());
        self.metrics_tracker.track_prompt(&original.id, original_prompt);

        // Retrieve memory context if enabled
        let memory_context = if self.config.use_memory {
            let query = ReflexionQuery::new(task_description).with_limit(10);
            Some(self.memory_retrieval.retrieve(&query).await?)
        } else {
            None
        };

        // Generate optimized variations using meta-prompting
        let optimized = self
            .generate_optimization(
                original_prompt,
                task_description,
                memory_context.as_ref(),
            )
            .await?;

        let duration_ms = start_time.elapsed().as_millis() as u64;

        info!(
            duration_ms = duration_ms,
            improvement = optimized.improvement_score,
            "Prompt optimization complete"
        );

        Ok(optimized)
    }

    /// Generate optimization using meta-prompting
    async fn generate_optimization(
        &mut self,
        original_prompt: &str,
        task_description: &str,
        memory_context: Option<&MemoryContext>,
    ) -> Result<EvolutionResult> {
        debug!("Generating prompt optimization via meta-prompting");

        // Build meta-prompt for optimization
        let _meta_prompt = self.build_meta_prompt(
            original_prompt,
            task_description,
            memory_context,
        );

        // Placeholder: Would call actual LLM provider for meta-prompting
        // In production, this would:
        // 1. Send meta-prompt to reasoning model (Claude Opus, GPT-4, etc.)
        // 2. Receive optimized prompt suggestion
        // 3. Extract rationale for changes
        // 4. Create new variation

        let optimized_prompt = self.simulate_optimization(original_prompt, memory_context);
        let rationale = "Optimized based on memory patterns and best practices".to_string();

        // Create optimized variation
        let original_var = &self.variations[0];
        let optimized_var = PromptVariation::evolve(
            "v1",
            &optimized_prompt,
            original_var,
            rationale,
        );

        self.variations.push(optimized_var.clone());

        // Calculate improvement (placeholder)
        let improvement = 0.15; // 15% improvement

        Ok(EvolutionResult::new(original_prompt, optimized_prompt, improvement)
            .with_iterations(1)
            .with_strategy(EvolutionStrategy::Hybrid))
    }

    /// Build meta-prompt for optimization
    fn build_meta_prompt(
        &self,
        original_prompt: &str,
        task_description: &str,
        memory_context: Option<&MemoryContext>,
    ) -> String {
        let mut meta_prompt = format!(
            "You are an expert prompt engineer. Optimize the following prompt for better results.\n\n\
            Task: {}\n\n\
            Current Prompt:\n{}\n\n",
            task_description, original_prompt
        );

        // Add memory context if available
        if let Some(context) = memory_context {
            if context.is_useful() {
                meta_prompt.push_str("Historical Context:\n");
                meta_prompt.push_str(&context.get_optimization_hints());
                meta_prompt.push_str("\n\n");
            }
        }

        meta_prompt.push_str(
            "Provide an optimized version of the prompt that:\n\
            1. Incorporates successful patterns from history\n\
            2. Avoids known failure modes\n\
            3. Is clearer and more specific\n\
            4. Maintains the original intent\n\n\
            Return ONLY the optimized prompt, no explanation.",
        );

        meta_prompt
    }

    /// Simulate optimization (placeholder)
    fn simulate_optimization(
        &self,
        original_prompt: &str,
        memory_context: Option<&MemoryContext>,
    ) -> String {
        // Placeholder: In production, this would call the actual LLM
        let mut optimized = original_prompt.to_string();

        // Add memory-informed improvements
        if let Some(context) = memory_context {
            if !context.successful_patterns.is_empty() {
                optimized.push_str("\n\nSuccessful approaches: ");
                optimized.push_str(&context.successful_patterns.join(", "));
            }
        }

        optimized
    }

    /// Record prompt performance
    pub fn record_performance(
        &mut self,
        variation_id: &str,
        success: bool,
        quality: f32,
        duration_ms: u64,
    ) -> Result<()> {
        self.metrics_tracker
            .record_attempt(variation_id, success, quality, duration_ms)
    }

    /// Get best performing variation
    pub fn get_best_variation(&self) -> Option<&PromptVariation> {
        let best_perf = self.metrics_tracker.get_best_prompt()?;
        self.variations
            .iter()
            .find(|v| v.id == best_perf.prompt_id)
    }

    /// Get all variations
    pub fn get_variations(&self) -> &[PromptVariation] {
        &self.variations
    }

    /// Clear all data
    pub fn reset(&mut self) {
        self.variations.clear();
        self.metrics_tracker.clear();
        self.memory_retrieval.clear_cache();
    }
}

impl Default for PromptOptimizer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_variation() {
        let v0 = PromptVariation::new("v0", "Original prompt");
        assert_eq!(v0.generation, 0);
        assert!(v0.parent_id.is_none());

        let v1 = PromptVariation::evolve("v1", "Improved prompt", &v0, "Better clarity");
        assert_eq!(v1.generation, 1);
        assert_eq!(v1.parent_id, Some("v0".to_string()));
        assert_eq!(v1.rationale, "Better clarity");
    }

    #[test]
    fn test_optimization_config_default() {
        let config = OptimizationConfig::default();
        assert!(config.use_memory);
        assert!(config.use_progressive_disclosure);
        assert_eq!(config.min_improvement, 0.1);
    }

    #[test]
    fn test_prompt_optimizer_creation() {
        let optimizer = PromptOptimizer::new();
        assert_eq!(optimizer.variations.len(), 0);
    }

    #[test]
    fn test_prompt_optimizer_custom_config() {
        let config = OptimizationConfig {
            min_improvement: 0.2,
            ..Default::default()
        };

        let optimizer = PromptOptimizer::with_config(config);
        assert_eq!(optimizer.config().min_improvement, 0.2);
    }

    #[tokio::test]
    async fn test_optimize_prompt() {
        let mut optimizer = PromptOptimizer::new();

        let result = optimizer
            .optimize_prompt("Write a function", "Create a utility function")
            .await
            .unwrap();

        assert!(!result.original_prompt.is_empty());
        assert!(!result.optimized_prompt.is_empty());
        assert!(result.improvement_score >= 0.0);
        assert_eq!(optimizer.variations.len(), 2); // Original + optimized
    }

    #[tokio::test]
    async fn test_record_performance() {
        let mut optimizer = PromptOptimizer::new();

        optimizer
            .optimize_prompt("Test prompt", "Test task")
            .await
            .unwrap();

        // Record performance for v0
        let result = optimizer.record_performance("v0", true, 0.9, 1000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_meta_prompt_building() {
        let optimizer = PromptOptimizer::new();

        let meta_prompt = optimizer.build_meta_prompt(
            "Do the task",
            "Write tests",
            None,
        );

        assert!(meta_prompt.contains("Do the task"));
        assert!(meta_prompt.contains("Write tests"));
        assert!(meta_prompt.contains("Optimize"));
    }

    #[test]
    fn test_meta_prompt_with_memory() {
        let optimizer = PromptOptimizer::new();

        let mut memory = MemoryContext::empty();
        memory.successful_patterns.push("TDD approach".to_string());
        memory.insights.push("Write tests first".to_string());

        let meta_prompt = optimizer.build_meta_prompt(
            "Write code",
            "Implement feature",
            Some(&memory),
        );

        assert!(meta_prompt.contains("Historical Context"));
        assert!(meta_prompt.contains("TDD approach"));
    }

    #[test]
    fn test_reset() {
        let mut optimizer = PromptOptimizer::new();

        let v0 = PromptVariation::new("v0", "Test");
        optimizer.variations.push(v0);

        assert_eq!(optimizer.variations.len(), 1);

        optimizer.reset();
        assert_eq!(optimizer.variations.len(), 0);
    }
}
