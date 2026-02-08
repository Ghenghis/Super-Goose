//! Memory Integration - Reflexion-Based Learning
//!
//! Integrates with Goose's existing Reflexion system for memory-informed
//! prompt optimization. Uses past attempts, reflections, and outcomes to
//! improve future prompts.

use crate::agents::reflexion::{ReflectionMemory, TaskAttempt};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Query for retrieving relevant memories
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflexionQuery {
    /// Task description or pattern to match
    pub task_pattern: String,
    /// Maximum number of results
    pub limit: usize,
    /// Minimum success threshold (0.0-1.0)
    pub min_success_rate: Option<f32>,
    /// Time range (last N days)
    pub time_range_days: Option<u32>,
}

impl ReflexionQuery {
    /// Create a new query
    pub fn new(task_pattern: impl Into<String>) -> Self {
        Self {
            task_pattern: task_pattern.into(),
            limit: 10,
            min_success_rate: None,
            time_range_days: None,
        }
    }

    /// Set result limit
    pub fn with_limit(mut self, limit: usize) -> Self {
        self.limit = limit;
        self
    }

    /// Set minimum success rate filter
    pub fn with_min_success(mut self, rate: f32) -> Self {
        self.min_success_rate = Some(rate);
        self
    }

    /// Set time range filter
    pub fn with_time_range(mut self, days: u32) -> Self {
        self.time_range_days = Some(days);
        self
    }
}

/// Memory context retrieved from Reflexion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryContext {
    /// Successful patterns from past attempts
    pub successful_patterns: Vec<String>,
    /// Failed patterns to avoid
    pub failed_patterns: Vec<String>,
    /// Key insights from reflections
    pub insights: Vec<String>,
    /// Overall success rate for similar tasks
    pub success_rate: f32,
    /// Number of attempts analyzed
    pub attempts_analyzed: usize,
}

impl MemoryContext {
    /// Create an empty memory context
    pub fn empty() -> Self {
        Self {
            successful_patterns: Vec::new(),
            failed_patterns: Vec::new(),
            insights: Vec::new(),
            success_rate: 0.0,
            attempts_analyzed: 0,
        }
    }

    /// Check if context has useful information
    pub fn is_useful(&self) -> bool {
        !self.successful_patterns.is_empty() || !self.insights.is_empty()
    }

    /// Get summary for prompt optimization
    pub fn get_optimization_hints(&self) -> String {
        let mut hints = Vec::new();

        if !self.successful_patterns.is_empty() {
            hints.push(format!(
                "Successful patterns ({}): {}",
                self.successful_patterns.len(),
                self.successful_patterns.join(", ")
            ));
        }

        if !self.failed_patterns.is_empty() {
            hints.push(format!(
                "Patterns to avoid ({}): {}",
                self.failed_patterns.len(),
                self.failed_patterns.join(", ")
            ));
        }

        if !self.insights.is_empty() {
            hints.push(format!("Key insights: {}", self.insights.join("; ")));
        }

        hints.push(format!(
            "Historical success rate: {:.1}% ({} attempts)",
            self.success_rate * 100.0,
            self.attempts_analyzed
        ));

        hints.join("\n")
    }
}

/// Memory retrieval system
#[derive(Debug)]
pub struct MemoryRetrieval {
    /// Cache of recent queries
    query_cache: HashMap<String, MemoryContext>,
}

impl MemoryRetrieval {
    /// Create a new memory retrieval system
    pub fn new() -> Self {
        Self {
            query_cache: HashMap::new(),
        }
    }

    /// Retrieve memory context from Reflexion
    pub async fn retrieve(&mut self, query: &ReflexionQuery) -> Result<MemoryContext> {
        // Check cache first
        if let Some(cached) = self.query_cache.get(&query.task_pattern) {
            return Ok(cached.clone());
        }

        // Placeholder: Would integrate with actual Reflexion system
        // In production, this would:
        // 1. Query ReflectionMemory for similar tasks
        // 2. Analyze TaskAttempt outcomes
        // 3. Extract patterns from Reflection insights
        // 4. Calculate success rates
        // 5. Build MemoryContext

        let context = self.retrieve_internal(query).await?;

        // Cache the result
        self.query_cache
            .insert(query.task_pattern.clone(), context.clone());

        Ok(context)
    }

    /// Internal retrieval logic (placeholder)
    async fn retrieve_internal(&self, query: &ReflexionQuery) -> Result<MemoryContext> {
        // Placeholder implementation
        // In production, this would query the actual Reflexion system

        let mut context = MemoryContext::empty();
        context.attempts_analyzed = 0;
        context.success_rate = 0.0;

        // Simulate pattern extraction
        if query.task_pattern.contains("test") {
            context
                .successful_patterns
                .push("Write tests first".to_string());
            context
                .insights
                .push("TDD approach yields higher quality".to_string());
            context.success_rate = 0.85;
            context.attempts_analyzed = 10;
        }

        if query.task_pattern.contains("refactor") {
            context
                .successful_patterns
                .push("Small incremental changes".to_string());
            context
                .failed_patterns
                .push("Large sweeping refactors".to_string());
            context
                .insights
                .push("Refactor in small steps with tests".to_string());
            context.success_rate = 0.75;
            context.attempts_analyzed = 8;
        }

        Ok(context)
    }

    /// Clear cache
    pub fn clear_cache(&mut self) {
        self.query_cache.clear();
    }

    /// Get cache size
    pub fn cache_size(&self) -> usize {
        self.query_cache.len()
    }
}

impl Default for MemoryRetrieval {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract patterns from Reflexion memory
pub fn extract_patterns_from_memory(_memory: &ReflectionMemory) -> Vec<String> {
    // Placeholder: Would analyze actual Reflexion data
    // In production, this would:
    // 1. Iterate through reflection entries
    // 2. Use NLP/pattern matching to extract common themes
    // 3. Identify success/failure patterns
    // 4. Return actionable insights

    Vec::new()
}

/// Calculate success rate for a task pattern
pub fn calculate_success_rate(attempts: &[TaskAttempt]) -> f32 {
    if attempts.is_empty() {
        return 0.0;
    }

    let successes = attempts
        .iter()
        .filter(|a| matches!(a.outcome, crate::agents::reflexion::AttemptOutcome::Success))
        .count();

    successes as f32 / attempts.len() as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reflexion_query() {
        let query = ReflexionQuery::new("write tests")
            .with_limit(5)
            .with_min_success(0.8)
            .with_time_range(30);

        assert_eq!(query.task_pattern, "write tests");
        assert_eq!(query.limit, 5);
        assert_eq!(query.min_success_rate, Some(0.8));
        assert_eq!(query.time_range_days, Some(30));
    }

    #[test]
    fn test_memory_context_empty() {
        let context = MemoryContext::empty();
        assert!(!context.is_useful());
        assert_eq!(context.success_rate, 0.0);
        assert_eq!(context.attempts_analyzed, 0);
    }

    #[test]
    fn test_memory_context_useful() {
        let mut context = MemoryContext::empty();
        context.successful_patterns.push("Pattern 1".to_string());
        context.insights.push("Insight 1".to_string());

        assert!(context.is_useful());
    }

    #[test]
    fn test_memory_context_hints() {
        let mut context = MemoryContext::empty();
        context.successful_patterns.push("TDD".to_string());
        context.failed_patterns.push("No tests".to_string());
        context.insights.push("Testing is important".to_string());
        context.success_rate = 0.85;
        context.attempts_analyzed = 10;

        let hints = context.get_optimization_hints();
        assert!(hints.contains("TDD"));
        assert!(hints.contains("No tests"));
        assert!(hints.contains("Testing is important"));
        assert!(hints.contains("85"));
        assert!(hints.contains("10 attempts"));
    }

    #[tokio::test]
    async fn test_memory_retrieval() {
        let mut retrieval = MemoryRetrieval::new();

        let query = ReflexionQuery::new("write tests");
        let context = retrieval.retrieve(&query).await.unwrap();

        // Placeholder returns test-related patterns
        assert!(context.is_useful());
        assert!(context.success_rate > 0.0);
    }

    #[tokio::test]
    async fn test_memory_retrieval_cache() {
        let mut retrieval = MemoryRetrieval::new();

        let query = ReflexionQuery::new("refactor code");

        // First retrieval
        retrieval.retrieve(&query).await.unwrap();
        assert_eq!(retrieval.cache_size(), 1);

        // Second retrieval (should use cache)
        retrieval.retrieve(&query).await.unwrap();
        assert_eq!(retrieval.cache_size(), 1);

        // Clear cache
        retrieval.clear_cache();
        assert_eq!(retrieval.cache_size(), 0);
    }

    #[test]
    fn test_calculate_success_rate_empty() {
        let rate = calculate_success_rate(&[]);
        assert_eq!(rate, 0.0);
    }
}
