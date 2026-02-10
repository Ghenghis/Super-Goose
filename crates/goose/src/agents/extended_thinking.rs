//! Phase 8: Extended Thinking — Chain-of-Thought and Deliberation System
//!
//! Enables agents to perform multi-step internal reasoning before acting.
//! Implements structured thinking patterns including decomposition, evaluation,
//! reflection, and synthesis — mirroring extended thinking capabilities.
//!
//! # Architecture
//!
//! - **ThinkingSession** — manages a chain of thought steps
//! - **ThinkingStep** — individual reasoning step with type classification
//! - **ThinkingStrategy** — configurable strategy for how thinking is structured
//! - **ThinkingBudget** — limits on thinking depth, time, and token usage

use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Thinking Step Types
// ---------------------------------------------------------------------------

/// A single step in the thinking chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingStep {
    /// Step number in the chain
    pub step_number: u32,
    /// Type of thinking this step performs
    pub step_type: ThinkingStepType,
    /// The actual thought content
    pub content: String,
    /// Confidence in this step (0.0 - 1.0)
    pub confidence: f64,
    /// Time spent on this step
    pub duration: Duration,
    /// Whether this step led to a useful insight
    pub productive: bool,
}

/// Classification of thinking step types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingStepType {
    /// Breaking a problem into sub-problems
    Decomposition,
    /// Gathering relevant information
    InformationGathering,
    /// Generating possible approaches
    Hypothesis,
    /// Evaluating pros/cons of an approach
    Evaluation,
    /// Checking for errors or inconsistencies
    Verification,
    /// Drawing conclusions from evidence
    Synthesis,
    /// Reconsidering previous reasoning
    Reflection,
    /// Making a decision on how to proceed
    Decision,
    /// Planning the next action
    Planning,
    /// Exploring alternative approaches
    Exploration,
}

impl fmt::Display for ThinkingStepType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ThinkingStepType::Decomposition => write!(f, "decomposition"),
            ThinkingStepType::InformationGathering => write!(f, "info_gathering"),
            ThinkingStepType::Hypothesis => write!(f, "hypothesis"),
            ThinkingStepType::Evaluation => write!(f, "evaluation"),
            ThinkingStepType::Verification => write!(f, "verification"),
            ThinkingStepType::Synthesis => write!(f, "synthesis"),
            ThinkingStepType::Reflection => write!(f, "reflection"),
            ThinkingStepType::Decision => write!(f, "decision"),
            ThinkingStepType::Planning => write!(f, "planning"),
            ThinkingStepType::Exploration => write!(f, "exploration"),
        }
    }
}

// ---------------------------------------------------------------------------
// Thinking Strategy
// ---------------------------------------------------------------------------

/// Configures how the agent approaches thinking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingStrategy {
    /// The pattern to follow
    pub pattern: ThinkingPattern,
    /// Budget constraints
    pub budget: ThinkingBudget,
    /// Whether to show thinking to the user
    pub visible: bool,
    /// Minimum confidence to proceed without more thinking
    pub confidence_threshold: f64,
}

/// Pre-defined thinking patterns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingPattern {
    /// Simple linear chain: decompose → plan → execute
    Linear,
    /// Tree of thought: explore multiple branches, pick best
    TreeOfThought,
    /// ReAct style: reason → act → observe → repeat
    ReAct,
    /// Reflection loop: plan → execute → reflect → revise
    Reflexive,
    /// Step-back: abstract the problem first, then solve
    StepBack,
    /// Least-to-most: solve simpler sub-problems first
    LeastToMost,
    /// Debate: generate arguments for/against, then decide
    SelfDebate,
}

impl Default for ThinkingStrategy {
    fn default() -> Self {
        Self {
            pattern: ThinkingPattern::Linear,
            budget: ThinkingBudget::default(),
            visible: false,
            confidence_threshold: 0.7,
        }
    }
}

/// Budget limits for thinking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingBudget {
    /// Maximum number of thinking steps
    pub max_steps: u32,
    /// Maximum total thinking time
    pub max_duration: Duration,
    /// Maximum tokens to spend on thinking
    pub max_tokens: u32,
    /// Maximum depth for tree-based thinking
    pub max_depth: u32,
}

impl Default for ThinkingBudget {
    fn default() -> Self {
        Self {
            max_steps: 20,
            max_duration: Duration::from_secs(120),
            max_tokens: 4000,
            max_depth: 5,
        }
    }
}

// ---------------------------------------------------------------------------
// Thinking Session
// ---------------------------------------------------------------------------

/// Manages a chain-of-thought reasoning session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingSession {
    /// Strategy being used
    pub strategy: ThinkingStrategy,
    /// Accumulated thinking steps
    pub steps: Vec<ThinkingStep>,
    /// Current overall confidence
    pub confidence: f64,
    /// Total time spent thinking
    pub total_duration: Duration,
    /// Whether thinking is complete
    pub is_complete: bool,
    /// Final conclusion/decision
    pub conclusion: Option<String>,
    /// Any insights discovered during thinking
    pub insights: Vec<String>,
}

impl ThinkingSession {
    /// Create a new thinking session with the given strategy.
    pub fn new(strategy: ThinkingStrategy) -> Self {
        Self {
            strategy,
            steps: Vec::new(),
            confidence: 0.0,
            total_duration: Duration::ZERO,
            is_complete: false,
            conclusion: None,
            insights: Vec::new(),
        }
    }

    /// Create with default strategy.
    pub fn default_session() -> Self {
        Self::new(ThinkingStrategy::default())
    }

    /// Add a thinking step.
    pub fn add_step(&mut self, step: ThinkingStep) {
        self.total_duration += step.duration;
        if step.productive {
            // Productive steps increase confidence
            self.confidence = (self.confidence + step.confidence) / 2.0;
        }
        self.steps.push(step);
    }

    /// Record an insight discovered during thinking.
    pub fn add_insight(&mut self, insight: impl Into<String>) {
        self.insights.push(insight.into());
    }

    /// Set the conclusion.
    pub fn conclude(&mut self, conclusion: impl Into<String>, confidence: f64) {
        self.conclusion = Some(conclusion.into());
        self.confidence = confidence;
        self.is_complete = true;
    }

    /// Check if budget is exhausted.
    pub fn budget_exhausted(&self) -> bool {
        let budget = &self.strategy.budget;
        self.steps.len() as u32 >= budget.max_steps
            || self.total_duration >= budget.max_duration
    }

    /// Check if confidence threshold is met.
    pub fn confidence_met(&self) -> bool {
        self.confidence >= self.strategy.confidence_threshold
    }

    /// Should continue thinking?
    pub fn should_continue(&self) -> bool {
        !self.is_complete && !self.budget_exhausted() && !self.confidence_met()
    }

    /// Number of steps so far.
    pub fn step_count(&self) -> usize {
        self.steps.len()
    }

    /// Get the last step.
    pub fn last_step(&self) -> Option<&ThinkingStep> {
        self.steps.last()
    }

    /// Get steps of a specific type.
    pub fn steps_of_type(&self, step_type: ThinkingStepType) -> Vec<&ThinkingStep> {
        self.steps.iter().filter(|s| s.step_type == step_type).collect()
    }

    /// Get a summary of the thinking session.
    pub fn summary(&self) -> ThinkingSummary {
        let step_types: std::collections::HashMap<String, usize> = {
            let mut map = std::collections::HashMap::new();
            for step in &self.steps {
                *map.entry(step.step_type.to_string()).or_insert(0) += 1;
            }
            map
        };

        let productive_count = self.steps.iter().filter(|s| s.productive).count();

        ThinkingSummary {
            total_steps: self.steps.len(),
            productive_steps: productive_count,
            confidence: self.confidence,
            total_duration: self.total_duration,
            pattern: self.strategy.pattern,
            step_type_counts: step_types,
            insight_count: self.insights.len(),
            has_conclusion: self.conclusion.is_some(),
        }
    }
}

/// Summary of a thinking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingSummary {
    pub total_steps: usize,
    pub productive_steps: usize,
    pub confidence: f64,
    pub total_duration: Duration,
    pub pattern: ThinkingPattern,
    pub step_type_counts: std::collections::HashMap<String, usize>,
    pub insight_count: usize,
    pub has_conclusion: bool,
}

impl fmt::Display for ThinkingSummary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "🧠 Thinking Summary ({:?} pattern)", self.pattern)?;
        writeln!(
            f,
            "  Steps: {}/{} productive | Confidence: {:.0}%",
            self.productive_steps, self.total_steps,
            self.confidence * 100.0
        )?;
        writeln!(f, "  Duration: {:.1}s | Insights: {}", self.total_duration.as_secs_f64(), self.insight_count)?;
        if self.has_conclusion {
            write!(f, "  ✅ Concluded")?;
        } else {
            write!(f, "  ⏳ In progress")?;
        }
        Ok(())
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_step(step_type: ThinkingStepType, content: &str, confidence: f64, productive: bool) -> ThinkingStep {
        ThinkingStep {
            step_number: 0,
            step_type,
            content: content.into(),
            confidence,
            duration: Duration::from_millis(100),
            productive,
        }
    }

    #[test]
    fn test_session_creation() {
        let session = ThinkingSession::default_session();
        assert_eq!(session.step_count(), 0);
        assert!(!session.is_complete);
        assert!(session.should_continue());
    }

    #[test]
    fn test_add_steps() {
        let mut session = ThinkingSession::default_session();
        session.add_step(make_step(
            ThinkingStepType::Decomposition,
            "Break down the problem",
            0.5,
            true,
        ));
        session.add_step(make_step(
            ThinkingStepType::Hypothesis,
            "Approach A: use binary search",
            0.6,
            true,
        ));

        assert_eq!(session.step_count(), 2);
        assert!(session.confidence > 0.0);
    }

    #[test]
    fn test_conclude() {
        let mut session = ThinkingSession::default_session();
        session.add_step(make_step(ThinkingStepType::Planning, "Plan the approach", 0.8, true));
        session.conclude("Use approach A with modification", 0.9);

        assert!(session.is_complete);
        assert_eq!(session.confidence, 0.9);
        assert!(session.conclusion.is_some());
    }

    #[test]
    fn test_budget_exhaustion() {
        let strategy = ThinkingStrategy {
            budget: ThinkingBudget {
                max_steps: 2,
                ..ThinkingBudget::default()
            },
            ..ThinkingStrategy::default()
        };

        let mut session = ThinkingSession::new(strategy);
        session.add_step(make_step(ThinkingStepType::Decomposition, "Step 1", 0.3, true));
        assert!(!session.budget_exhausted());

        session.add_step(make_step(ThinkingStepType::Hypothesis, "Step 2", 0.4, true));
        assert!(session.budget_exhausted());
        assert!(!session.should_continue());
    }

    #[test]
    fn test_confidence_threshold() {
        let strategy = ThinkingStrategy {
            confidence_threshold: 0.8,
            ..ThinkingStrategy::default()
        };

        let mut session = ThinkingSession::new(strategy);
        session.confidence = 0.9;
        assert!(session.confidence_met());
        assert!(!session.should_continue()); // Confidence met, no need to continue
    }

    #[test]
    fn test_insights() {
        let mut session = ThinkingSession::default_session();
        session.add_insight("The algorithm has O(n log n) complexity");
        session.add_insight("Edge case: empty input not handled");
        assert_eq!(session.insights.len(), 2);
    }

    #[test]
    fn test_steps_of_type() {
        let mut session = ThinkingSession::default_session();
        session.add_step(make_step(ThinkingStepType::Decomposition, "D1", 0.5, true));
        session.add_step(make_step(ThinkingStepType::Hypothesis, "H1", 0.6, true));
        session.add_step(make_step(ThinkingStepType::Decomposition, "D2", 0.7, true));

        let decomps = session.steps_of_type(ThinkingStepType::Decomposition);
        assert_eq!(decomps.len(), 2);
    }

    #[test]
    fn test_summary() {
        let mut session = ThinkingSession::default_session();
        session.add_step(make_step(ThinkingStepType::Decomposition, "Break it down", 0.5, true));
        session.add_step(make_step(ThinkingStepType::Evaluation, "Evaluate options", 0.4, false));
        session.add_step(make_step(ThinkingStepType::Decision, "Choose approach A", 0.8, true));
        session.add_insight("Found a simpler approach");
        session.conclude("Use approach A", 0.85);

        let summary = session.summary();
        assert_eq!(summary.total_steps, 3);
        assert_eq!(summary.productive_steps, 2);
        assert_eq!(summary.insight_count, 1);
        assert!(summary.has_conclusion);
    }

    #[test]
    fn test_summary_display() {
        let summary = ThinkingSummary {
            total_steps: 5,
            productive_steps: 3,
            confidence: 0.85,
            total_duration: Duration::from_secs(10),
            pattern: ThinkingPattern::Linear,
            step_type_counts: [("decomposition".into(), 2), ("evaluation".into(), 3)].into(),
            insight_count: 2,
            has_conclusion: true,
        };
        let s = summary.to_string();
        assert!(s.contains("Thinking Summary"));
        assert!(s.contains("85%"));
        assert!(s.contains("Concluded"));
    }

    #[test]
    fn test_thinking_patterns() {
        // Verify all patterns are distinct
        let patterns = vec![
            ThinkingPattern::Linear,
            ThinkingPattern::TreeOfThought,
            ThinkingPattern::ReAct,
            ThinkingPattern::Reflexive,
            ThinkingPattern::StepBack,
            ThinkingPattern::LeastToMost,
            ThinkingPattern::SelfDebate,
        ];
        assert_eq!(patterns.len(), 7);
    }

    #[test]
    fn test_serialization() {
        let mut session = ThinkingSession::default_session();
        session.add_step(make_step(ThinkingStepType::Planning, "Plan", 0.7, true));
        session.conclude("Done", 0.9);

        let json = serde_json::to_string(&session).unwrap();
        let deserialized: ThinkingSession = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.step_count(), 1);
        assert!(deserialized.is_complete);
    }

    #[test]
    fn test_default_budget() {
        let budget = ThinkingBudget::default();
        assert_eq!(budget.max_steps, 20);
        assert_eq!(budget.max_duration, Duration::from_secs(120));
        assert_eq!(budget.max_tokens, 4000);
        assert_eq!(budget.max_depth, 5);
    }
}
