//! Memory Integration - Reflexion-Based Learning
//!
//! Integrates with Goose's existing Reflexion system for memory-informed
//! prompt optimization. Uses past attempts, reflections, and outcomes to
//! improve future prompts.

use crate::agents::reflexion::{AttemptOutcome, Reflection, ReflectionMemory, TaskAttempt};
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
pub struct MemoryRetrieval {
    /// Cache of recent queries
    query_cache: HashMap<String, MemoryContext>,
    /// Reflection memory store for Reflexion-based retrieval
    memory: ReflectionMemory,
}

impl std::fmt::Debug for MemoryRetrieval {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MemoryRetrieval")
            .field("query_cache", &self.query_cache)
            .field("memory_size", &self.memory.len())
            .finish()
    }
}

impl MemoryRetrieval {
    /// Create a new memory retrieval system with bootstrapped reflections
    pub fn new() -> Self {
        let mut memory = ReflectionMemory::new();

        // Bootstrap with general best-practice reflections so the system has
        // actionable patterns from the start. These represent accumulated
        // engineering wisdom distilled into the Reflexion format.
        let test_reflection =
            Reflection::new("write tests for module", "Attempted direct testing", AttemptOutcome::Success)
                .with_reflection("Writing tests first using TDD yields higher quality code")
                .with_lessons(vec![
                    "Write tests first".to_string(),
                    "Cover edge cases".to_string(),
                ])
                .with_improvements(vec!["TDD approach".to_string()]);
        memory.store(test_reflection);

        let refactor_ok = Reflection::new(
            "refactor code safely",
            "Small incremental refactoring",
            AttemptOutcome::Success,
        )
        .with_reflection("Small incremental changes are safer when refactoring")
        .with_lessons(vec!["Small incremental changes".to_string()])
        .with_improvements(vec!["Refactor in small steps with tests".to_string()]);
        memory.store(refactor_ok);

        let refactor_fail = Reflection::new(
            "refactor code module",
            "Large sweeping refactor attempt",
            AttemptOutcome::Failure,
        )
        .with_diagnosis("Large sweeping refactors cause regressions")
        .with_reflection("Big-bang refactors introduce too many failures at once")
        .with_lessons(vec!["Avoid large sweeping refactors".to_string()])
        .with_improvements(vec!["Break into smaller changes".to_string()]);
        memory.store(refactor_fail);

        Self {
            query_cache: HashMap::new(),
            memory,
        }
    }

    /// Retrieve memory context from Reflexion
    pub async fn retrieve(&mut self, query: &ReflexionQuery) -> Result<MemoryContext> {
        // Check cache first
        if let Some(cached) = self.query_cache.get(&query.task_pattern) {
            return Ok(cached.clone());
        }

        let context = self.retrieve_internal(query).await?;

        // Cache the result
        self.query_cache
            .insert(query.task_pattern.clone(), context.clone());

        Ok(context)
    }

    /// Internal retrieval logic using Reflexion memory
    async fn retrieve_internal(&self, query: &ReflexionQuery) -> Result<MemoryContext> {
        let reflections = self.memory.find_relevant(&query.task_pattern, query.limit);

        if reflections.is_empty() {
            return Ok(MemoryContext::empty());
        }

        let mut context = MemoryContext::empty();

        // Build synthetic TaskAttempts from reflections to compute success rate
        let attempts: Vec<TaskAttempt> = reflections
            .iter()
            .map(|r| {
                let mut attempt = TaskAttempt::new(&r.task);
                attempt.complete(r.outcome, None);
                attempt
            })
            .collect();

        context.success_rate = calculate_success_rate(&attempts);
        context.attempts_analyzed = attempts.len();

        // Apply minimum success rate filter if set
        if let Some(min_rate) = query.min_success_rate {
            if context.success_rate < min_rate {
                return Ok(MemoryContext::empty());
            }
        }

        // Extract patterns from the matching reflections
        let patterns = extract_patterns_from_reflections(&reflections);
        context.successful_patterns = patterns.successful;
        context.failed_patterns = patterns.failed;
        context.insights = patterns.insights;

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

/// Extracted pattern categories from reflections
struct ExtractedPatterns {
    successful: Vec<String>,
    failed: Vec<String>,
    insights: Vec<String>,
}

/// Extract categorized patterns from a set of reflections
fn extract_patterns_from_reflections(reflections: &[&Reflection]) -> ExtractedPatterns {
    let mut successful = Vec::new();
    let mut failed = Vec::new();
    let mut insights = Vec::new();

    let success_keywords = ["success", "worked", "good", "effective", "correct", "passed"];
    let failure_keywords = ["fail", "error", "wrong", "bug", "broke", "crash", "avoid"];

    for reflection in reflections {
        // Collect lessons from successful attempts as successful patterns
        if reflection.outcome == AttemptOutcome::Success {
            for lesson in &reflection.lessons {
                if !successful.contains(lesson) {
                    successful.push(lesson.clone());
                }
            }
        }

        // Collect lessons from failed attempts as failed patterns
        if reflection.outcome == AttemptOutcome::Failure {
            for lesson in &reflection.lessons {
                if !failed.contains(lesson) {
                    failed.push(lesson.clone());
                }
            }
            // The diagnosis of a failure is also a pattern to avoid
            if !reflection.diagnosis.is_empty() && !failed.contains(&reflection.diagnosis) {
                failed.push(reflection.diagnosis.clone());
            }
        }

        // Scan reflection text for insights using keyword matching
        let text_lower = reflection.reflection_text.to_lowercase();
        if !reflection.reflection_text.is_empty() {
            let has_success_kw = success_keywords.iter().any(|kw| text_lower.contains(kw));
            let has_failure_kw = failure_keywords.iter().any(|kw| text_lower.contains(kw));

            if has_success_kw || has_failure_kw {
                if !insights.contains(&reflection.reflection_text) {
                    insights.push(reflection.reflection_text.clone());
                }
            }
        }

        // Improvements from any reflection are useful insights
        for improvement in &reflection.improvements {
            if !insights.contains(improvement) {
                insights.push(improvement.clone());
            }
        }
    }

    ExtractedPatterns {
        successful,
        failed,
        insights,
    }
}

/// Extract patterns from Reflexion memory by iterating all stored reflections
pub fn extract_patterns_from_memory(memory: &ReflectionMemory) -> Vec<String> {
    let all_reflections = memory.all();
    if all_reflections.is_empty() {
        return Vec::new();
    }

    let mut patterns = Vec::new();

    let success_keywords = ["success", "worked", "good", "effective", "correct", "passed"];
    let failure_keywords = ["fail", "error", "wrong", "bug", "broke", "crash", "avoid"];

    for reflection in all_reflections {
        // Extract lessons as patterns
        for lesson in &reflection.lessons {
            if !patterns.contains(lesson) {
                patterns.push(lesson.clone());
            }
        }

        // Extract improvements as patterns
        for improvement in &reflection.improvements {
            if !patterns.contains(improvement) {
                patterns.push(improvement.clone());
            }
        }

        // Scan reflection text for keyword-matched patterns
        let text_lower = reflection.reflection_text.to_lowercase();
        if !reflection.reflection_text.is_empty() {
            let has_keyword = success_keywords
                .iter()
                .chain(failure_keywords.iter())
                .any(|kw| text_lower.contains(kw));
            if has_keyword && !patterns.contains(&reflection.reflection_text) {
                patterns.push(reflection.reflection_text.clone());
            }
        }
    }

    patterns
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
