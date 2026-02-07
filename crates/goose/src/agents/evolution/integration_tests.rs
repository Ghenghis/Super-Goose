//! Integration tests for EvoAgentX self-evolution system

#[cfg(test)]
mod tests {
    use crate::agents::evolution::{
        DisclosureStrategy, EvolutionConfig, LayeredContext, MemoryContext, MemoryRetrieval,
        MetricsTracker, OptimizationConfig, PromptOptimizer, PromptVariation, ReflexionQuery,
        SuccessMetrics, DisclosureLayer, CompactEntry, TimelineEntry, FullDetailsEntry,
    };

    /// Test complete prompt optimization workflow
    #[tokio::test]
    async fn test_complete_optimization_workflow() {
        let mut optimizer = PromptOptimizer::new();

        let original_prompt = "Write a function to process data";
        let task_description = "Create a data processing function with error handling";

        let result = optimizer
            .optimize_prompt(original_prompt, task_description)
            .await
            .unwrap();

        assert!(!result.original_prompt.is_empty());
        assert!(!result.optimized_prompt.is_empty());
        assert!(result.improvement_score >= 0.0);
        assert_eq!(optimizer.get_variations().len(), 2); // Original + optimized
    }

    /// Test memory-informed optimization
    #[tokio::test]
    async fn test_memory_informed_optimization() {
        let config = OptimizationConfig {
            use_memory: true,
            ..Default::default()
        };

        let mut optimizer = PromptOptimizer::with_config(config);

        let result = optimizer
            .optimize_prompt(
                "Write tests for the function",
                "Create comprehensive unit tests",
            )
            .await
            .unwrap();

        // Placeholder returns memory-informed optimizations
        assert!(result.improvement_score >= 0.0);
    }

    /// Test progressive disclosure workflow
    #[tokio::test]
    async fn test_progressive_disclosure_workflow() {
        let mut context = LayeredContext::new();
        let _strategy = DisclosureStrategy::default();

        // Layer 1: Add compact index
        for i in 0..5 {
            context.add_compact(
                CompactEntry::new(format!("id{}", i), format!("Entry {}", i), 0.8)
                    .with_type("reflection"),
            );
        }

        assert_eq!(context.current_layer, DisclosureLayer::CompactIndex);
        assert_eq!(context.compact_index.len(), 5);

        // Promote to Layer 2
        context.promote_layer().unwrap();
        assert_eq!(context.current_layer, DisclosureLayer::Timeline);

        // Layer 2: Add timeline entries
        for i in 0..3 {
            context.add_timeline(
                TimelineEntry::new(format!("id{}", i))
                    .with_context_before("Previous step")
                    .with_context_after("Next step"),
            );
        }

        assert_eq!(context.timeline.len(), 3);

        // Promote to Layer 3
        context.promote_layer().unwrap();
        assert_eq!(context.current_layer, DisclosureLayer::FullDetails);

        // Layer 3: Add full details
        context.add_full_details(
            FullDetailsEntry::new("id0", "Complete detailed content here")
                .with_metadata("type", "success"),
        );

        assert_eq!(context.full_details.len(), 1);
        assert!(context.tokens_used > 0);
    }

    /// Test metrics tracking across prompt variations
    #[tokio::test]
    async fn test_metrics_tracking_workflow() {
        let mut tracker = MetricsTracker::with_min_attempts(3);

        tracker.track_prompt("v0", "original prompt hash");
        tracker.track_prompt("v1", "optimized prompt hash");

        // Simulate multiple attempts
        for _ in 0..5 {
            tracker.record_attempt("v0", true, 0.7, 1000).unwrap();
            tracker.record_attempt("v1", true, 0.9, 900).unwrap();
        }

        // Compare performance
        let comparison = tracker.compare("v0", "v1");
        assert!(comparison.is_some());
        assert!(comparison.unwrap() > 0.0); // v1 should be better

        let best = tracker.get_best_prompt().unwrap();
        assert_eq!(best.prompt_id, "v1");
    }

    /// Test memory retrieval and caching
    #[tokio::test]
    async fn test_memory_retrieval_workflow() {
        let mut retrieval = MemoryRetrieval::new();

        let query = ReflexionQuery::new("write tests")
            .with_limit(10)
            .with_min_success(0.8);

        // First retrieval
        let context1 = retrieval.retrieve(&query).await.unwrap();
        assert_eq!(retrieval.cache_size(), 1);

        // Second retrieval (should use cache)
        let context2 = retrieval.retrieve(&query).await.unwrap();
        assert_eq!(retrieval.cache_size(), 1);

        // Verify cache hit
        assert_eq!(context1.success_rate, context2.success_rate);
    }

    /// Test prompt evolution over multiple generations
    #[tokio::test]
    async fn test_multi_generation_evolution() {
        let mut optimizer = PromptOptimizer::new();

        // First optimization
        let _result1 = optimizer
            .optimize_prompt("Basic prompt", "Do the task")
            .await
            .unwrap();

        assert_eq!(optimizer.get_variations().len(), 2);

        // Record performance for v1
        optimizer.record_performance("v1", true, 0.9, 1000).unwrap();

        // Variations track generations
        let v0 = &optimizer.get_variations()[0];
        let v1 = &optimizer.get_variations()[1];

        assert_eq!(v0.generation, 0);
        assert_eq!(v1.generation, 1);
        assert_eq!(v1.parent_id, Some("v0".to_string()));
    }

    /// Test token-efficient progressive disclosure
    #[tokio::test]
    async fn test_token_efficient_disclosure() {
        let mut context = LayeredContext::new();
        let strategy = DisclosureStrategy::default();

        // Add compact entries until we approach token limit
        for i in 0..20 {
            context.add_compact(CompactEntry::new(
                format!("id{}", i),
                format!("Short entry {}", i),
                0.8,
            ));
        }

        // Check if we can promote based on strategy
        let initial_tokens = context.tokens_used;
        assert!(initial_tokens > 0);

        // Token count should be reasonable for Layer 1
        assert!(initial_tokens < strategy.layer1_max_tokens * 2);
    }

    /// Test memory context optimization hints
    #[tokio::test]
    async fn test_memory_optimization_hints() {
        let mut memory = MemoryContext::empty();

        memory.successful_patterns.push("Use TDD approach".to_string());
        memory.successful_patterns.push("Write small functions".to_string());
        memory.failed_patterns.push("Large monolithic functions".to_string());
        memory.insights.push("Testing improves quality".to_string());
        memory.success_rate = 0.85;
        memory.attempts_analyzed = 10;

        let hints = memory.get_optimization_hints();

        assert!(hints.contains("TDD"));
        assert!(hints.contains("small functions"));
        assert!(hints.contains("monolithic"));
        assert!(hints.contains("85"));
        assert!(hints.contains("10 attempts"));
    }

    /// Test A/B testing workflow
    #[tokio::test]
    async fn test_ab_testing_workflow() {
        let mut tracker = MetricsTracker::with_min_attempts(5);

        // Track two prompt variations
        tracker.track_prompt("control", "control prompt");
        tracker.track_prompt("experiment", "experimental prompt");

        // Control group: 70% success
        for i in 0..10 {
            let success = i < 7;
            tracker
                .record_attempt("control", success, if success { 0.8 } else { 0.3 }, 1000)
                .unwrap();
        }

        // Experiment group: 90% success
        for i in 0..10 {
            let success = i < 9;
            tracker
                .record_attempt("experiment", success, if success { 0.9 } else { 0.4 }, 950)
                .unwrap();
        }

        // Compare results
        let improvement = tracker.compare("control", "experiment");
        assert!(improvement.is_some());

        let improvement_pct = improvement.unwrap();
        assert!(improvement_pct > 0.0); // Experiment should be better
    }

    /// Test evolution with custom configuration
    #[tokio::test]
    async fn test_custom_evolution_config() {
        let config = EvolutionConfig {
            min_iterations: 3,
            success_threshold: 0.9,
            max_variations: 5,
            ..Default::default()
        };

        let opt_config = OptimizationConfig {
            evolution: config,
            min_improvement: 0.2,
            ..Default::default()
        };

        let optimizer = PromptOptimizer::with_config(opt_config);

        assert_eq!(optimizer.config().evolution.min_iterations, 3);
        assert_eq!(optimizer.config().evolution.success_threshold, 0.9);
        assert_eq!(optimizer.config().min_improvement, 0.2);
    }

    /// Test statistical significance in metrics
    #[tokio::test]
    async fn test_statistical_significance() {
        let mut metrics = SuccessMetrics::new();

        // Not significant with few attempts
        assert!(!metrics.is_significant(5));

        // Record enough attempts
        for _ in 0..5 {
            metrics.record_attempt(true, 0.9, 1000);
        }

        // Now significant
        assert!(metrics.is_significant(5));
    }

    /// Test prompt variation lineage tracking
    #[tokio::test]
    async fn test_variation_lineage() {
        let v0 = PromptVariation::new("v0", "Original");
        let v1 = PromptVariation::evolve("v1", "Gen 1", &v0, "Improved clarity");
        let v2 = PromptVariation::evolve("v2", "Gen 2", &v1, "Added error handling");

        assert_eq!(v0.generation, 0);
        assert!(v0.parent_id.is_none());

        assert_eq!(v1.generation, 1);
        assert_eq!(v1.parent_id, Some("v0".to_string()));

        assert_eq!(v2.generation, 2);
        assert_eq!(v2.parent_id, Some("v1".to_string()));
    }

    /// Test memory context usefulness filtering
    #[tokio::test]
    async fn test_memory_usefulness_filtering() {
        let empty = MemoryContext::empty();
        assert!(!empty.is_useful());

        let mut with_patterns = MemoryContext::empty();
        with_patterns.successful_patterns.push("Pattern".to_string());
        assert!(with_patterns.is_useful());

        let mut with_insights = MemoryContext::empty();
        with_insights.insights.push("Insight".to_string());
        assert!(with_insights.is_useful());
    }

    /// Test complete end-to-end evolution cycle
    #[tokio::test]
    async fn test_end_to_end_evolution_cycle() {
        let mut optimizer = PromptOptimizer::new();

        // Step 1: Optimize prompt
        let result = optimizer
            .optimize_prompt(
                "Process the data",
                "Implement data processing with validation",
            )
            .await
            .unwrap();

        assert!(result.improvement_score >= 0.0);

        // Step 2: Record performance
        optimizer.record_performance("v0", true, 0.7, 1200).unwrap();
        optimizer.record_performance("v1", true, 0.9, 1000).unwrap();

        // Step 3: Get best variation
        let variations = optimizer.get_variations();
        assert_eq!(variations.len(), 2);

        // Step 4: Verify metrics tracking
        let metrics = optimizer.metrics();
        assert!(metrics.get_performance("v0").is_some());
        assert!(metrics.get_performance("v1").is_some());
    }
}
