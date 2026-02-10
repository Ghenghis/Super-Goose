//! Human-in-the-Loop (HITL) system for interactive agent execution.
//!
//! Provides breakpoints, pause/resume, feedback injection, plan approval,
//! and state inspection. Sits on top of existing approval/permission/hooks
//! infrastructure — does NOT duplicate their functionality.
//!
//! # Architecture
//!
//! - **Breakpoints** gate execution at tool calls, turn boundaries, or plan transitions
//! - **InteractiveSession** manages HITL state per agent instance
//! - **Pause/Resume** uses `ActionRequiredManager` (global singleton with oneshot channels)
//! - **Feedback** is drained into the system prompt so the LLM naturally incorporates it
//! - **Plan approval** gates PlanStatus::Ready → InProgress via elicitation

use std::collections::VecDeque;
use std::fmt;

use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::agents::planner::Plan;

// ---------------------------------------------------------------------------
// Breakpoint types
// ---------------------------------------------------------------------------

/// A breakpoint that can pause agent execution at specific points.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Breakpoint {
    /// Pause before a specific tool is called (exact name match).
    BeforeToolCall { tool_name: String },
    /// Pause before any tool whose name matches a regex pattern.
    BeforeToolPattern { pattern: String },
    /// Pause after a plan is generated but before execution begins.
    AfterPlanGeneration,
    /// Pause when any tool execution error occurs.
    OnError,
    /// Pause every N turns for a periodic check-in.
    EveryNTurns { n: u32 },
}

impl fmt::Display for Breakpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Breakpoint::BeforeToolCall { tool_name } => write!(f, "tool:{}", tool_name),
            Breakpoint::BeforeToolPattern { pattern } => write!(f, "pattern:{}", pattern),
            Breakpoint::AfterPlanGeneration => write!(f, "after_plan"),
            Breakpoint::OnError => write!(f, "on_error"),
            Breakpoint::EveryNTurns { n } => write!(f, "every_{}_turns", n),
        }
    }
}

// ---------------------------------------------------------------------------
// Pause reason
// ---------------------------------------------------------------------------

/// Why the agent is currently paused.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PauseReason {
    /// A breakpoint condition was satisfied.
    BreakpointHit(Breakpoint),
    /// The user explicitly requested a pause via `/pause`.
    UserRequested,
    /// A plan requires user review before execution.
    PlanReviewRequired,
    /// A tool execution error triggered a pause.
    ErrorOccurred { error: String },
}

impl fmt::Display for PauseReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PauseReason::BreakpointHit(bp) => write!(f, "Breakpoint hit: {}", bp),
            PauseReason::UserRequested => write!(f, "User requested pause"),
            PauseReason::PlanReviewRequired => write!(f, "Plan review required"),
            PauseReason::ErrorOccurred { error } => write!(f, "Error: {}", error),
        }
    }
}

// ---------------------------------------------------------------------------
// User feedback
// ---------------------------------------------------------------------------

/// Feedback injected by the user during a pause or via `/resume`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserFeedback {
    pub text: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl UserFeedback {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            timestamp: chrono::Utc::now(),
        }
    }
}

// ---------------------------------------------------------------------------
// State snapshot (for /inspect)
// ---------------------------------------------------------------------------

/// A read-only snapshot of the agent's HITL state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSnapshot {
    pub session_id: String,
    pub current_turn: u32,
    pub active_breakpoints: Vec<String>,
    pub is_paused: bool,
    pub pause_reason: Option<String>,
    pub plan_summary: Option<String>,
    pub plan_status: Option<String>,
    pub pending_feedback_count: usize,
    pub memory_stats: Option<String>,
}

impl fmt::Display for StateSnapshot {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "📊 **Agent State Inspection**")?;
        writeln!(f, "───────────────────────────")?;
        writeln!(f, "Session: {}", self.session_id)?;
        writeln!(f, "Turn: {}", self.current_turn)?;
        writeln!(
            f,
            "Status: {}",
            if self.is_paused { "⏸ PAUSED" } else { "▶ RUNNING" }
        )?;
        if let Some(ref reason) = self.pause_reason {
            writeln!(f, "Pause reason: {}", reason)?;
        }
        writeln!(f)?;

        writeln!(f, "**Breakpoints** ({})", self.active_breakpoints.len())?;
        if self.active_breakpoints.is_empty() {
            writeln!(f, "  (none)")?;
        } else {
            for (i, bp) in self.active_breakpoints.iter().enumerate() {
                writeln!(f, "  [{}] {}", i, bp)?;
            }
        }
        writeln!(f)?;

        if let Some(ref status) = self.plan_status {
            writeln!(f, "**Plan**: {}", status)?;
            if let Some(ref summary) = self.plan_summary {
                writeln!(f, "  {}", summary)?;
            }
        } else {
            writeln!(f, "**Plan**: (none)")?;
        }
        writeln!(f)?;

        writeln!(f, "Pending feedback: {}", self.pending_feedback_count)?;

        if let Some(ref stats) = self.memory_stats {
            writeln!(f)?;
            writeln!(f, "**Memory**: {}", stats)?;
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// InteractiveSession — central HITL state manager
// ---------------------------------------------------------------------------

/// Manages all human-in-the-loop state for a single agent instance.
///
/// This struct is stored as `Mutex<InteractiveSession>` on the Agent and
/// accessed from both the main loop (for breakpoint checks) and slash
/// commands (for user interactions).
pub struct InteractiveSession {
    breakpoints: Vec<Breakpoint>,
    paused: bool,
    pause_reason: Option<PauseReason>,
    feedback_queue: VecDeque<UserFeedback>,
    turn_counter: u32,
}

impl InteractiveSession {
    /// Create a new interactive session with no breakpoints.
    pub fn new() -> Self {
        Self {
            breakpoints: Vec::new(),
            paused: false,
            pause_reason: None,
            feedback_queue: VecDeque::new(),
            turn_counter: 0,
        }
    }

    // --- Breakpoint Management ---

    /// Add a breakpoint.
    pub fn add_breakpoint(&mut self, bp: Breakpoint) {
        self.breakpoints.push(bp);
    }

    /// Remove a breakpoint by index. Returns the removed breakpoint if valid.
    pub fn remove_breakpoint(&mut self, index: usize) -> Option<Breakpoint> {
        if index < self.breakpoints.len() {
            Some(self.breakpoints.remove(index))
        } else {
            None
        }
    }

    /// Remove all breakpoints.
    pub fn clear_breakpoints(&mut self) {
        self.breakpoints.clear();
    }

    /// List all active breakpoints.
    pub fn list_breakpoints(&self) -> &[Breakpoint] {
        &self.breakpoints
    }

    /// Number of active breakpoints.
    pub fn breakpoint_count(&self) -> usize {
        self.breakpoints.len()
    }

    // --- Breakpoint Checking ---

    /// Check if any breakpoint matches the given tool name.
    /// Returns the first matching breakpoint, or None.
    pub fn should_break_for_tool(&self, tool_name: &str) -> Option<&Breakpoint> {
        for bp in &self.breakpoints {
            match bp {
                Breakpoint::BeforeToolCall { tool_name: name } => {
                    if name == tool_name {
                        return Some(bp);
                    }
                }
                Breakpoint::BeforeToolPattern { pattern } => {
                    // Compile regex per-check (breakpoints are rare, not hot-path)
                    if let Ok(re) = Regex::new(pattern) {
                        if re.is_match(tool_name) {
                            return Some(bp);
                        }
                    }
                }
                _ => {} // Non-tool breakpoints don't match here
            }
        }
        None
    }

    /// Check if a turn-based breakpoint should fire at the given turn.
    pub fn should_break_for_turn(&self, turn: u32) -> Option<&Breakpoint> {
        for bp in &self.breakpoints {
            if let Breakpoint::EveryNTurns { n } = bp {
                if *n > 0 && turn > 0 && turn % n == 0 {
                    return Some(bp);
                }
            }
        }
        None
    }

    /// Check if any breakpoint is an `AfterPlanGeneration` breakpoint.
    pub fn has_plan_breakpoint(&self) -> bool {
        self.breakpoints
            .iter()
            .any(|bp| matches!(bp, Breakpoint::AfterPlanGeneration))
    }

    /// Check if any breakpoint is an `OnError` breakpoint.
    pub fn has_error_breakpoint(&self) -> bool {
        self.breakpoints
            .iter()
            .any(|bp| matches!(bp, Breakpoint::OnError))
    }

    /// Increment the internal turn counter.
    pub fn tick_turn(&mut self) {
        self.turn_counter = self.turn_counter.saturating_add(1);
    }

    /// Get current turn count.
    pub fn current_turn(&self) -> u32 {
        self.turn_counter
    }

    // --- Pause / Resume ---

    /// Pause execution with the given reason.
    pub fn pause(&mut self, reason: PauseReason) {
        self.paused = true;
        self.pause_reason = Some(reason);
    }

    /// Resume execution. Clears pause state.
    pub fn resume(&mut self) {
        self.paused = false;
        self.pause_reason = None;
    }

    /// Whether the session is currently paused.
    pub fn is_paused(&self) -> bool {
        self.paused
    }

    /// Get the current pause reason, if paused.
    pub fn pause_reason(&self) -> Option<&PauseReason> {
        self.pause_reason.as_ref()
    }

    // --- Feedback ---

    /// Inject user feedback into the queue.
    pub fn inject_feedback(&mut self, feedback: UserFeedback) {
        self.feedback_queue.push_back(feedback);
    }

    /// Drain all pending feedback. Returns owned Vec.
    pub fn drain_feedback(&mut self) -> Vec<UserFeedback> {
        self.feedback_queue.drain(..).collect()
    }

    /// Whether there is pending feedback.
    pub fn has_pending_feedback(&self) -> bool {
        !self.feedback_queue.is_empty()
    }

    /// Number of pending feedback items.
    pub fn pending_feedback_count(&self) -> usize {
        self.feedback_queue.len()
    }

    // --- State Inspection ---

    /// Build a read-only snapshot of the current HITL state.
    pub fn snapshot(
        &self,
        session_id: &str,
        plan: Option<&Plan>,
        memory_stats: Option<String>,
    ) -> StateSnapshot {
        StateSnapshot {
            session_id: session_id.to_string(),
            current_turn: self.turn_counter,
            active_breakpoints: self.breakpoints.iter().map(|bp| bp.to_string()).collect(),
            is_paused: self.paused,
            pause_reason: self.pause_reason.as_ref().map(|r| r.to_string()),
            plan_summary: plan.map(|p| {
                let total = p.steps.len();
                let completed = p
                    .steps
                    .iter()
                    .filter(|s| s.status == crate::agents::planner::StepStatus::Completed)
                    .count();
                format!("{}: {} ({}/{} steps)", p.goal, p.status, completed, total)
            }),
            plan_status: plan.map(|p| p.status.to_string()),
            pending_feedback_count: self.feedback_queue.len(),
            memory_stats,
        }
    }
}

impl Default for InteractiveSession {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Plan approval gate
// ---------------------------------------------------------------------------

/// Gate that pauses execution until the user approves a plan.
///
/// Uses `ActionRequiredManager::global().request_and_wait()` — no new
/// channel infrastructure needed.
///
/// Returns `Ok(true)` if approved, `Ok(false)` if rejected or timed out.
pub async fn await_plan_approval(plan: &Plan) -> Result<bool> {
    use crate::action_required_manager::ActionRequiredManager;
    use std::time::Duration;

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "approved": { "type": "boolean" },
            "feedback": { "type": "string" }
        },
        "required": ["approved"]
    });

    let step_list: String = plan
        .steps
        .iter()
        .enumerate()
        .map(|(i, s)| format!("  {}. {}", i + 1, s.description))
        .collect::<Vec<_>>()
        .join("\n");

    let message = format!(
        "📋 **Plan Review Required**\n\n\
         **Goal:** {}\n\n\
         **Steps:**\n{}\n\n\
         Approve this plan to begin execution.",
        plan.goal, step_list
    );

    match ActionRequiredManager::global()
        .request_and_wait(message, schema, Duration::from_secs(600))
        .await
    {
        Ok(response) => {
            let approved = response
                .get("approved")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            Ok(approved)
        }
        Err(_) => {
            // Timeout or channel error — treat as rejection
            Ok(false)
        }
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- Breakpoint Display ---

    #[test]
    fn test_breakpoint_display() {
        assert_eq!(
            Breakpoint::BeforeToolCall {
                tool_name: "bash".into()
            }
            .to_string(),
            "tool:bash"
        );
        assert_eq!(
            Breakpoint::BeforeToolPattern {
                pattern: "file_.*".into()
            }
            .to_string(),
            "pattern:file_.*"
        );
        assert_eq!(Breakpoint::AfterPlanGeneration.to_string(), "after_plan");
        assert_eq!(Breakpoint::OnError.to_string(), "on_error");
        assert_eq!(
            Breakpoint::EveryNTurns { n: 5 }.to_string(),
            "every_5_turns"
        );
    }

    // --- Session Lifecycle ---

    #[test]
    fn test_session_new_defaults() {
        let session = InteractiveSession::new();
        assert!(!session.is_paused());
        assert!(session.pause_reason().is_none());
        assert_eq!(session.breakpoint_count(), 0);
        assert_eq!(session.current_turn(), 0);
        assert!(!session.has_pending_feedback());
    }

    #[test]
    fn test_session_add_remove_breakpoint() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::OnError);
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 3 });
        assert_eq!(session.breakpoint_count(), 2);

        let removed = session.remove_breakpoint(0);
        assert!(removed.is_some());
        assert!(matches!(removed.unwrap(), Breakpoint::OnError));
        assert_eq!(session.breakpoint_count(), 1);

        // Out-of-bounds returns None
        assert!(session.remove_breakpoint(99).is_none());
    }

    #[test]
    fn test_session_clear_breakpoints() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::OnError);
        session.add_breakpoint(Breakpoint::AfterPlanGeneration);
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 1 });
        assert_eq!(session.breakpoint_count(), 3);

        session.clear_breakpoints();
        assert_eq!(session.breakpoint_count(), 0);
    }

    // --- Pause / Resume ---

    #[test]
    fn test_session_pause_resume_cycle() {
        let mut session = InteractiveSession::new();
        assert!(!session.is_paused());

        session.pause(PauseReason::UserRequested);
        assert!(session.is_paused());
        assert!(matches!(
            session.pause_reason(),
            Some(PauseReason::UserRequested)
        ));

        session.resume();
        assert!(!session.is_paused());
        assert!(session.pause_reason().is_none());
    }

    #[test]
    fn test_session_double_pause_overwrites_reason() {
        let mut session = InteractiveSession::new();
        session.pause(PauseReason::UserRequested);
        session.pause(PauseReason::ErrorOccurred {
            error: "timeout".into(),
        });
        assert!(session.is_paused());
        assert!(matches!(
            session.pause_reason(),
            Some(PauseReason::ErrorOccurred { .. })
        ));
    }

    #[test]
    fn test_session_resume_when_not_paused_is_noop() {
        let mut session = InteractiveSession::new();
        session.resume(); // Should not panic
        assert!(!session.is_paused());
    }

    // --- Tool Breakpoint Matching ---

    #[test]
    fn test_breakpoint_exact_tool_match() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::BeforeToolCall {
            tool_name: "bash".into(),
        });

        assert!(session.should_break_for_tool("bash").is_some());
        assert!(session.should_break_for_tool("file_read").is_none());
        assert!(session.should_break_for_tool("BASH").is_none()); // case-sensitive
    }

    #[test]
    fn test_breakpoint_pattern_match() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::BeforeToolPattern {
            pattern: "file_.*".into(),
        });

        assert!(session.should_break_for_tool("file_read").is_some());
        assert!(session.should_break_for_tool("file_write").is_some());
        assert!(session.should_break_for_tool("bash").is_none());
    }

    #[test]
    fn test_breakpoint_pattern_no_match_invalid_regex() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::BeforeToolPattern {
            pattern: "[invalid".into(), // bad regex
        });
        // Invalid regex should not match anything (graceful)
        assert!(session.should_break_for_tool("anything").is_none());
    }

    #[test]
    fn test_breakpoint_multiple_active() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::BeforeToolCall {
            tool_name: "bash".into(),
        });
        session.add_breakpoint(Breakpoint::BeforeToolPattern {
            pattern: "file_.*".into(),
        });

        // Should match exact first
        let hit = session.should_break_for_tool("bash");
        assert!(hit.is_some());
        assert!(matches!(hit.unwrap(), Breakpoint::BeforeToolCall { .. }));

        // Should match pattern
        let hit = session.should_break_for_tool("file_write");
        assert!(hit.is_some());
        assert!(matches!(hit.unwrap(), Breakpoint::BeforeToolPattern { .. }));
    }

    // --- Turn Breakpoint ---

    #[test]
    fn test_breakpoint_every_n_turns_hits() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 3 });

        assert!(session.should_break_for_turn(3).is_some());
        assert!(session.should_break_for_turn(6).is_some());
        assert!(session.should_break_for_turn(9).is_some());
    }

    #[test]
    fn test_breakpoint_every_n_turns_misses() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 3 });

        assert!(session.should_break_for_turn(1).is_none());
        assert!(session.should_break_for_turn(2).is_none());
        assert!(session.should_break_for_turn(4).is_none());
        assert!(session.should_break_for_turn(5).is_none());
    }

    #[test]
    fn test_breakpoint_every_n_turns_zero_n_never_hits() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 0 });

        assert!(session.should_break_for_turn(0).is_none());
        assert!(session.should_break_for_turn(1).is_none());
        assert!(session.should_break_for_turn(100).is_none());
    }

    #[test]
    fn test_breakpoint_turn_zero_never_hits() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 5 });

        // Turn 0 should never trigger (no work done yet)
        assert!(session.should_break_for_turn(0).is_none());
    }

    // --- Tick Turn ---

    #[test]
    fn test_tick_turn_increments() {
        let mut session = InteractiveSession::new();
        assert_eq!(session.current_turn(), 0);
        session.tick_turn();
        assert_eq!(session.current_turn(), 1);
        session.tick_turn();
        assert_eq!(session.current_turn(), 2);
    }

    // --- Has plan / error breakpoint ---

    #[test]
    fn test_has_plan_breakpoint() {
        let mut session = InteractiveSession::new();
        assert!(!session.has_plan_breakpoint());

        session.add_breakpoint(Breakpoint::AfterPlanGeneration);
        assert!(session.has_plan_breakpoint());

        session.add_breakpoint(Breakpoint::OnError);
        assert!(session.has_plan_breakpoint());
    }

    #[test]
    fn test_has_error_breakpoint() {
        let mut session = InteractiveSession::new();
        assert!(!session.has_error_breakpoint());

        session.add_breakpoint(Breakpoint::OnError);
        assert!(session.has_error_breakpoint());
    }

    // --- Feedback ---

    #[test]
    fn test_feedback_inject_and_drain() {
        let mut session = InteractiveSession::new();
        session.inject_feedback(UserFeedback::new("focus on security"));
        session.inject_feedback(UserFeedback::new("skip the tests"));

        assert!(session.has_pending_feedback());
        assert_eq!(session.pending_feedback_count(), 2);

        let feedback = session.drain_feedback();
        assert_eq!(feedback.len(), 2);
        assert_eq!(feedback[0].text, "focus on security");
        assert_eq!(feedback[1].text, "skip the tests");
    }

    #[test]
    fn test_feedback_drain_clears_queue() {
        let mut session = InteractiveSession::new();
        session.inject_feedback(UserFeedback::new("test"));

        let _ = session.drain_feedback();
        assert!(!session.has_pending_feedback());
        assert_eq!(session.pending_feedback_count(), 0);

        // Second drain returns empty
        let feedback = session.drain_feedback();
        assert!(feedback.is_empty());
    }

    #[test]
    fn test_feedback_has_pending_empty() {
        let session = InteractiveSession::new();
        assert!(!session.has_pending_feedback());
        assert_eq!(session.pending_feedback_count(), 0);
    }

    // --- State Snapshot ---

    #[test]
    fn test_snapshot_basic() {
        let session = InteractiveSession::new();
        let snap = session.snapshot("sess-123", None, None);

        assert_eq!(snap.session_id, "sess-123");
        assert_eq!(snap.current_turn, 0);
        assert!(!snap.is_paused);
        assert!(snap.pause_reason.is_none());
        assert!(snap.active_breakpoints.is_empty());
        assert!(snap.plan_summary.is_none());
        assert!(snap.plan_status.is_none());
        assert_eq!(snap.pending_feedback_count, 0);
        assert!(snap.memory_stats.is_none());
    }

    #[test]
    fn test_snapshot_while_paused_with_breakpoints() {
        let mut session = InteractiveSession::new();
        session.add_breakpoint(Breakpoint::BeforeToolCall {
            tool_name: "bash".into(),
        });
        session.add_breakpoint(Breakpoint::EveryNTurns { n: 5 });
        session.tick_turn();
        session.tick_turn();
        session.pause(PauseReason::UserRequested);
        session.inject_feedback(UserFeedback::new("waiting"));

        let snap = session.snapshot("sess-456", None, Some("working: 3, episodic: 12".into()));

        assert_eq!(snap.current_turn, 2);
        assert!(snap.is_paused);
        assert!(snap.pause_reason.is_some());
        assert_eq!(snap.active_breakpoints.len(), 2);
        assert_eq!(snap.active_breakpoints[0], "tool:bash");
        assert_eq!(snap.active_breakpoints[1], "every_5_turns");
        assert_eq!(snap.pending_feedback_count, 1);
        assert_eq!(
            snap.memory_stats.as_deref(),
            Some("working: 3, episodic: 12")
        );
    }

    #[test]
    fn test_snapshot_with_plan() {
        use crate::agents::planner::PlanStep;

        let session = InteractiveSession::new();
        let mut plan = Plan::new("Implement auth system");
        plan.steps.push(PlanStep::new(0, "Design schema"));
        plan.steps.push(PlanStep::new(1, "Write migrations"));
        plan.mark_ready();

        let snap = session.snapshot("sess-789", Some(&plan), None);

        assert!(snap.plan_status.is_some());
        assert_eq!(snap.plan_status.as_deref(), Some("ready"));
        assert!(snap.plan_summary.is_some());
        let summary = snap.plan_summary.unwrap();
        assert!(summary.contains("Implement auth system"));
        assert!(summary.contains("0/2"));
    }

    // --- Serialization ---

    #[test]
    fn test_pause_reason_serialization() {
        let reason = PauseReason::BreakpointHit(Breakpoint::OnError);
        let json = serde_json::to_string(&reason).unwrap();
        let deserialized: PauseReason = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized,
            PauseReason::BreakpointHit(Breakpoint::OnError)
        ));
    }

    #[test]
    fn test_breakpoint_serialization_roundtrip() {
        let breakpoints = vec![
            Breakpoint::BeforeToolCall {
                tool_name: "bash".into(),
            },
            Breakpoint::BeforeToolPattern {
                pattern: "file_.*".into(),
            },
            Breakpoint::AfterPlanGeneration,
            Breakpoint::OnError,
            Breakpoint::EveryNTurns { n: 10 },
        ];

        let json = serde_json::to_string(&breakpoints).unwrap();
        let deserialized: Vec<Breakpoint> = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.len(), 5);
    }

    #[test]
    fn test_state_snapshot_display() {
        let session = InteractiveSession::new();
        let snap = session.snapshot("test", None, None);
        let display = snap.to_string();
        assert!(display.contains("Agent State Inspection"));
        assert!(display.contains("RUNNING"));
        assert!(display.contains("Turn: 0"));
    }
}
