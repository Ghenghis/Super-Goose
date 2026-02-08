//! Progressive Disclosure - Token-Efficient Context Retrieval
//!
//! Inspired by claude-mem's 3-layer approach:
//! 1. Compact index (50-100 tokens per result)
//! 2. Timeline context (chronological overview)
//! 3. Full details (500-1000 tokens per result)

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Strategy for progressive context disclosure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisclosureStrategy {
    /// Enable progressive disclosure
    pub enabled: bool,
    /// Maximum tokens for Layer 1 (index)
    pub layer1_max_tokens: usize,
    /// Maximum tokens for Layer 2 (timeline)
    pub layer2_max_tokens: usize,
    /// Maximum tokens for Layer 3 (full details)
    pub layer3_max_tokens: usize,
    /// Automatically promote relevant results to next layer
    pub auto_promote: bool,
}

impl Default for DisclosureStrategy {
    fn default() -> Self {
        Self {
            enabled: true,
            layer1_max_tokens: 1000, // ~10-20 compact results
            layer2_max_tokens: 3000, // Timeline context
            layer3_max_tokens: 8000, // Full details for selected items
            auto_promote: true,
        }
    }
}

/// Disclosure layer in progressive retrieval
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DisclosureLayer {
    /// Layer 1: Compact index (IDs, titles, scores)
    CompactIndex,
    /// Layer 2: Timeline context (chronological overview)
    Timeline,
    /// Layer 3: Full details (complete content)
    FullDetails,
}

/// Compact index entry for Layer 1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactEntry {
    /// Unique identifier
    pub id: String,
    /// Entry title/summary
    pub title: String,
    /// Relevance score (0.0-1.0)
    pub score: f32,
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Entry type (e.g., "reflection", "attempt", "success")
    pub entry_type: String,
}

impl CompactEntry {
    /// Create a new compact entry
    pub fn new(id: impl Into<String>, title: impl Into<String>, score: f32) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            score,
            timestamp: chrono::Utc::now(),
            entry_type: "unknown".to_string(),
        }
    }

    /// Set entry type
    pub fn with_type(mut self, entry_type: impl Into<String>) -> Self {
        self.entry_type = entry_type.into();
        self
    }

    /// Set timestamp
    pub fn with_timestamp(mut self, timestamp: chrono::DateTime<chrono::Utc>) -> Self {
        self.timestamp = timestamp;
        self
    }

    /// Estimated token count (title + metadata)
    pub fn estimated_tokens(&self) -> usize {
        // Very rough estimate: ~4 chars per token
        (self.title.len() + self.id.len() + self.entry_type.len()) / 4 + 10
    }
}

/// Timeline entry for Layer 2
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEntry {
    /// Reference to compact entry
    pub id: String,
    /// Brief context before this entry
    pub context_before: String,
    /// Brief context after this entry
    pub context_after: String,
    /// Related entry IDs
    pub related_ids: Vec<String>,
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl TimelineEntry {
    /// Create a new timeline entry
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            context_before: String::new(),
            context_after: String::new(),
            related_ids: Vec::new(),
            timestamp: chrono::Utc::now(),
        }
    }

    /// Add context before
    pub fn with_context_before(mut self, context: impl Into<String>) -> Self {
        self.context_before = context.into();
        self
    }

    /// Add context after
    pub fn with_context_after(mut self, context: impl Into<String>) -> Self {
        self.context_after = context.into();
        self
    }

    /// Add related ID
    pub fn with_related(mut self, id: impl Into<String>) -> Self {
        self.related_ids.push(id.into());
        self
    }

    /// Estimated token count
    pub fn estimated_tokens(&self) -> usize {
        (self.context_before.len() + self.context_after.len()) / 4 + 20
    }
}

/// Full details entry for Layer 3
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullDetailsEntry {
    /// Reference to compact entry
    pub id: String,
    /// Complete content
    pub content: String,
    /// Associated metadata
    pub metadata: HashMap<String, String>,
    /// Related artifacts (file paths, etc.)
    pub artifacts: Vec<String>,
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl FullDetailsEntry {
    /// Create a new full details entry
    pub fn new(id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            content: content.into(),
            metadata: HashMap::new(),
            artifacts: Vec::new(),
            timestamp: chrono::Utc::now(),
        }
    }

    /// Add metadata
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// Add artifact
    pub fn with_artifact(mut self, path: impl Into<String>) -> Self {
        self.artifacts.push(path.into());
        self
    }

    /// Estimated token count
    pub fn estimated_tokens(&self) -> usize {
        self.content.len() / 4 + 50
    }
}

/// Layered context with progressive disclosure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayeredContext {
    /// Layer 1: Compact index
    pub compact_index: Vec<CompactEntry>,
    /// Layer 2: Timeline context
    pub timeline: Vec<TimelineEntry>,
    /// Layer 3: Full details
    pub full_details: Vec<FullDetailsEntry>,
    /// Current disclosure layer
    pub current_layer: DisclosureLayer,
    /// Total tokens used
    pub tokens_used: usize,
}

impl LayeredContext {
    /// Create a new layered context
    pub fn new() -> Self {
        Self {
            compact_index: Vec::new(),
            timeline: Vec::new(),
            full_details: Vec::new(),
            current_layer: DisclosureLayer::CompactIndex,
            tokens_used: 0,
        }
    }

    /// Add compact entry
    pub fn add_compact(&mut self, entry: CompactEntry) {
        self.tokens_used += entry.estimated_tokens();
        self.compact_index.push(entry);
    }

    /// Add timeline entry
    pub fn add_timeline(&mut self, entry: TimelineEntry) {
        self.tokens_used += entry.estimated_tokens();
        self.timeline.push(entry);
    }

    /// Add full details entry
    pub fn add_full_details(&mut self, entry: FullDetailsEntry) {
        self.tokens_used += entry.estimated_tokens();
        self.full_details.push(entry);
    }

    /// Promote to next layer
    pub fn promote_layer(&mut self) -> Result<DisclosureLayer> {
        self.current_layer = match self.current_layer {
            DisclosureLayer::CompactIndex => DisclosureLayer::Timeline,
            DisclosureLayer::Timeline => DisclosureLayer::FullDetails,
            DisclosureLayer::FullDetails => DisclosureLayer::FullDetails, // Already at max
        };
        Ok(self.current_layer)
    }

    /// Check if can promote based on token budget
    pub fn can_promote(&self, strategy: &DisclosureStrategy) -> bool {
        match self.current_layer {
            DisclosureLayer::CompactIndex => self.tokens_used < strategy.layer1_max_tokens,
            DisclosureLayer::Timeline => self.tokens_used < strategy.layer2_max_tokens,
            DisclosureLayer::FullDetails => false,
        }
    }

    /// Get entries for current layer
    pub fn get_current_layer_summary(&self) -> String {
        match self.current_layer {
            DisclosureLayer::CompactIndex => {
                format!(
                    "Layer 1 (Compact Index): {} entries, ~{} tokens",
                    self.compact_index.len(),
                    self.tokens_used
                )
            }
            DisclosureLayer::Timeline => {
                format!(
                    "Layer 2 (Timeline): {} entries, ~{} tokens",
                    self.timeline.len(),
                    self.tokens_used
                )
            }
            DisclosureLayer::FullDetails => {
                format!(
                    "Layer 3 (Full Details): {} entries, ~{} tokens",
                    self.full_details.len(),
                    self.tokens_used
                )
            }
        }
    }
}

impl Default for LayeredContext {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disclosure_strategy_default() {
        let strategy = DisclosureStrategy::default();
        assert!(strategy.enabled);
        assert_eq!(strategy.layer1_max_tokens, 1000);
        assert_eq!(strategy.layer2_max_tokens, 3000);
        assert_eq!(strategy.layer3_max_tokens, 8000);
        assert!(strategy.auto_promote);
    }

    #[test]
    fn test_disclosure_layers() {
        let layer1 = DisclosureLayer::CompactIndex;
        let layer2 = DisclosureLayer::Timeline;
        let layer3 = DisclosureLayer::FullDetails;

        assert_ne!(layer1, layer2);
        assert_ne!(layer2, layer3);
    }

    #[test]
    fn test_compact_entry() {
        let entry = CompactEntry::new("id1", "Test entry", 0.95).with_type("reflection");

        assert_eq!(entry.id, "id1");
        assert_eq!(entry.title, "Test entry");
        assert_eq!(entry.score, 0.95);
        assert_eq!(entry.entry_type, "reflection");
        assert!(entry.estimated_tokens() > 0);
    }

    #[test]
    fn test_timeline_entry() {
        let entry = TimelineEntry::new("id1")
            .with_context_before("Previous attempt failed")
            .with_context_after("Next attempt succeeded")
            .with_related("id2");

        assert_eq!(entry.id, "id1");
        assert!(!entry.context_before.is_empty());
        assert!(!entry.context_after.is_empty());
        assert_eq!(entry.related_ids.len(), 1);
        assert!(entry.estimated_tokens() > 0);
    }

    #[test]
    fn test_full_details_entry() {
        let entry = FullDetailsEntry::new("id1", "Complete content here")
            .with_metadata("type", "success")
            .with_artifact("/path/to/file.rs");

        assert_eq!(entry.id, "id1");
        assert_eq!(entry.content, "Complete content here");
        assert_eq!(entry.metadata.get("type").unwrap(), "success");
        assert_eq!(entry.artifacts.len(), 1);
        assert!(entry.estimated_tokens() > 0);
    }

    #[test]
    fn test_layered_context() {
        let mut context = LayeredContext::new();

        assert_eq!(context.current_layer, DisclosureLayer::CompactIndex);
        assert_eq!(context.tokens_used, 0);

        // Add compact entry
        context.add_compact(CompactEntry::new("id1", "Entry 1", 0.9));
        assert_eq!(context.compact_index.len(), 1);
        assert!(context.tokens_used > 0);

        // Promote layer
        context.promote_layer().unwrap();
        assert_eq!(context.current_layer, DisclosureLayer::Timeline);

        // Add timeline entry
        context.add_timeline(TimelineEntry::new("id1"));
        assert_eq!(context.timeline.len(), 1);

        // Promote to full details
        context.promote_layer().unwrap();
        assert_eq!(context.current_layer, DisclosureLayer::FullDetails);

        // Try to promote beyond max (should stay at FullDetails)
        context.promote_layer().unwrap();
        assert_eq!(context.current_layer, DisclosureLayer::FullDetails);
    }

    #[test]
    fn test_can_promote() {
        let mut context = LayeredContext::new();
        let strategy = DisclosureStrategy::default();

        // Start at Layer 1, should be able to promote
        assert!(context.can_promote(&strategy));

        // Add many entries to exceed budget
        for i in 0..100 {
            context.add_compact(CompactEntry::new(format!("id{}", i), "Entry", 0.5));
        }

        // Now should not be able to promote
        assert!(!context.can_promote(&strategy));
    }

    #[test]
    fn test_layer_summary() {
        let mut context = LayeredContext::new();
        context.add_compact(CompactEntry::new("id1", "Entry", 0.9));

        let summary = context.get_current_layer_summary();
        assert!(summary.contains("Layer 1"));
        assert!(summary.contains("1 entries"));
    }
}
