//! TaskScheduler — Priority queue with cron-like scheduling for autonomous tasks.
//!
//! Supports three schedule types:
//! - Once: runs exactly once at a specified time
//! - Recurring: runs at a fixed interval
//! - Cron: runs according to a simplified cron expression
//!
//! Tasks are ordered by priority (higher = more important) and scheduled time.

use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use uuid::Uuid;
use tracing::info;

/// The type of action a scheduled task performs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionType {
    /// Create a git branch.
    CreateBranch { name: String },
    /// Create a pull request.
    CreatePR { title: String, branch: String },
    /// Run CI check.
    RunCiCheck { repo: String },
    /// Generate documentation.
    GenerateDocs { target: String },
    /// Create a release.
    CreateRelease { version: String },
    /// Run an arbitrary command.
    RunCommand { command: String },
    /// Custom action with a string payload.
    Custom { action: String, payload: String },
}

impl std::fmt::Display for ActionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionType::CreateBranch { name } => write!(f, "create-branch:{}", name),
            ActionType::CreatePR { title, .. } => write!(f, "create-pr:{}", title),
            ActionType::RunCiCheck { repo } => write!(f, "ci-check:{}", repo),
            ActionType::GenerateDocs { target } => write!(f, "gen-docs:{}", target),
            ActionType::CreateRelease { version } => write!(f, "release:{}", version),
            ActionType::RunCommand { command } => write!(f, "run:{}", command),
            ActionType::Custom { action, .. } => write!(f, "custom:{}", action),
        }
    }
}

/// How a task is scheduled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Schedule {
    /// Run once at the specified time.
    Once { at: DateTime<Utc> },
    /// Run at a fixed interval (in seconds) starting from `start`.
    Recurring { interval_secs: u64, start: DateTime<Utc> },
    /// Cron-like expression (simplified: "minute hour day_of_month month day_of_week").
    Cron { expression: String },
}

/// The status of a scheduled task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed { error: String },
    Cancelled,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::Running => write!(f, "running"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Failed { error } => write!(f, "failed: {}", error),
            TaskStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// A scheduled task in the priority queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    /// Unique identifier.
    pub id: String,
    /// Human-readable description.
    pub description: String,
    /// Priority (1-10, higher = more important).
    pub priority: u8,
    /// When the task is scheduled to run next.
    pub next_run: DateTime<Utc>,
    /// The schedule type.
    pub schedule: Schedule,
    /// The action to perform.
    pub action: ActionType,
    /// Current status.
    pub status: TaskStatus,
    /// When the task was created.
    pub created_at: DateTime<Utc>,
    /// How many times this task has executed.
    pub execution_count: u32,
}

impl ScheduledTask {
    /// Create a new scheduled task.
    pub fn new(
        description: impl Into<String>,
        priority: u8,
        schedule: Schedule,
        action: ActionType,
    ) -> Self {
        let priority = priority.clamp(1, 10);
        let next_run = match &schedule {
            Schedule::Once { at } => *at,
            Schedule::Recurring { start, .. } => *start,
            Schedule::Cron { .. } => Utc::now(), // Simplified: run immediately, then compute next
        };
        Self {
            id: Uuid::new_v4().to_string(),
            description: description.into(),
            priority,
            next_run,
            schedule,
            action,
            status: TaskStatus::Pending,
            created_at: Utc::now(),
            execution_count: 0,
        }
    }

    /// Check if this task is due to run.
    pub fn is_due(&self) -> bool {
        self.status == TaskStatus::Pending && Utc::now() >= self.next_run
    }

    /// Compute the next run time for recurring tasks.
    pub fn compute_next_run(&mut self) {
        match &self.schedule {
            Schedule::Once { .. } => {
                // One-shot — mark completed
                self.status = TaskStatus::Completed;
            }
            Schedule::Recurring { interval_secs, .. } => {
                self.next_run = Utc::now() + chrono::Duration::seconds(*interval_secs as i64);
                self.status = TaskStatus::Pending;
            }
            Schedule::Cron { .. } => {
                // Simplified: treat as recurring 1-hour for now
                self.next_run = Utc::now() + chrono::Duration::hours(1);
                self.status = TaskStatus::Pending;
            }
        }
    }
}

// For BinaryHeap: higher priority first, then earlier scheduled time.
impl Eq for ScheduledTask {}

impl PartialEq for ScheduledTask {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Ord for ScheduledTask {
    fn cmp(&self, other: &Self) -> Ordering {
        // Higher priority first
        self.priority
            .cmp(&other.priority)
            // Then earlier time first (reverse because BinaryHeap is max-heap)
            .then_with(|| other.next_run.cmp(&self.next_run))
    }
}

impl PartialOrd for ScheduledTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// The task scheduler with a priority queue.
pub struct TaskScheduler {
    /// Priority queue of scheduled tasks.
    queue: BinaryHeap<ScheduledTask>,
    /// Tasks that have been completed (for history).
    completed: Vec<ScheduledTask>,
    /// Maximum number of completed tasks to keep in history.
    max_history: usize,
}

impl TaskScheduler {
    /// Create a new task scheduler.
    pub fn new(max_history: usize) -> Self {
        Self {
            queue: BinaryHeap::new(),
            completed: Vec::new(),
            max_history,
        }
    }

    /// Create a scheduler with default settings.
    pub fn with_defaults() -> Self {
        Self::new(100)
    }

    /// Add a task to the scheduler.
    pub fn add_task(&mut self, task: ScheduledTask) -> String {
        let id = task.id.clone();
        info!(
            task_id = %id,
            description = %task.description,
            priority = task.priority,
            "Scheduling task"
        );
        self.queue.push(task);
        id
    }

    /// Schedule a one-time task.
    pub fn schedule_once(
        &mut self,
        description: impl Into<String>,
        priority: u8,
        at: DateTime<Utc>,
        action: ActionType,
    ) -> String {
        let task = ScheduledTask::new(
            description,
            priority,
            Schedule::Once { at },
            action,
        );
        self.add_task(task)
    }

    /// Schedule a recurring task.
    pub fn schedule_recurring(
        &mut self,
        description: impl Into<String>,
        priority: u8,
        interval_secs: u64,
        action: ActionType,
    ) -> String {
        let task = ScheduledTask::new(
            description,
            priority,
            Schedule::Recurring {
                interval_secs,
                start: Utc::now(),
            },
            action,
        );
        self.add_task(task)
    }

    /// Get the next task that is due to run.
    pub fn next_due(&mut self) -> Option<ScheduledTask> {
        // Peek at the highest-priority task
        if self.queue.peek().map_or(false, |t| t.is_due()) {
            self.queue.pop()
        } else {
            None
        }
    }

    /// Get all tasks that are currently due, ordered by priority.
    pub fn all_due(&mut self) -> Vec<ScheduledTask> {
        let mut due = Vec::new();
        let mut not_due = Vec::new();

        while let Some(task) = self.queue.pop() {
            if task.is_due() {
                due.push(task);
            } else {
                not_due.push(task);
            }
        }

        // Put non-due tasks back
        for task in not_due {
            self.queue.push(task);
        }

        due
    }

    /// Mark a task as completed and optionally re-schedule if recurring.
    pub fn complete_task(&mut self, mut task: ScheduledTask) {
        task.execution_count += 1;
        let was_recurring = !matches!(task.schedule, Schedule::Once { .. });

        if was_recurring {
            // Compute next run and re-add
            task.compute_next_run();
            if task.status == TaskStatus::Pending {
                self.queue.push(task);
                return;
            }
        } else {
            task.status = TaskStatus::Completed;
        }

        // Add to history
        self.completed.push(task);
        if self.completed.len() > self.max_history {
            self.completed.remove(0);
        }
    }

    /// Mark a task as failed.
    pub fn fail_task(&mut self, mut task: ScheduledTask, error: String) {
        task.status = TaskStatus::Failed { error };
        task.execution_count += 1;
        self.completed.push(task);
        if self.completed.len() > self.max_history {
            self.completed.remove(0);
        }
    }

    /// Cancel a task by ID.
    pub fn cancel_task(&mut self, task_id: &str) -> Result<()> {
        let mut tasks: Vec<ScheduledTask> = Vec::new();
        let mut found = false;

        while let Some(task) = self.queue.pop() {
            if task.id == task_id {
                found = true;
                let mut cancelled = task;
                cancelled.status = TaskStatus::Cancelled;
                self.completed.push(cancelled);
            } else {
                tasks.push(task);
            }
        }

        for task in tasks {
            self.queue.push(task);
        }

        if found {
            Ok(())
        } else {
            bail!("Task '{}' not found in queue", task_id)
        }
    }

    /// Get the number of pending tasks.
    pub fn pending_count(&self) -> usize {
        self.queue.len()
    }

    /// Get the number of completed tasks in history.
    pub fn completed_count(&self) -> usize {
        self.completed.len()
    }

    /// Get all pending tasks (snapshot — does not consume).
    pub fn pending_tasks(&self) -> Vec<&ScheduledTask> {
        self.queue.iter().collect()
    }

    /// Get completed task history.
    pub fn completed_tasks(&self) -> &[ScheduledTask] {
        &self.completed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_action() -> ActionType {
        ActionType::RunCommand {
            command: "echo hello".into(),
        }
    }

    #[test]
    fn test_schedule_and_count() {
        let mut scheduler = TaskScheduler::with_defaults();
        assert_eq!(scheduler.pending_count(), 0);

        scheduler.schedule_once(
            "Test task",
            5,
            Utc::now() + chrono::Duration::hours(1),
            make_action(),
        );
        assert_eq!(scheduler.pending_count(), 1);
    }

    #[test]
    fn test_due_tasks() {
        let mut scheduler = TaskScheduler::with_defaults();

        // Task in the past — should be due
        scheduler.schedule_once(
            "Past task",
            5,
            Utc::now() - chrono::Duration::seconds(10),
            make_action(),
        );

        // Task in the future — should not be due
        scheduler.schedule_once(
            "Future task",
            5,
            Utc::now() + chrono::Duration::hours(1),
            make_action(),
        );

        let due = scheduler.all_due();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].description, "Past task");
        assert_eq!(scheduler.pending_count(), 1); // Future task remains
    }

    #[test]
    fn test_priority_ordering() {
        let mut scheduler = TaskScheduler::with_defaults();
        let past = Utc::now() - chrono::Duration::seconds(10);

        scheduler.schedule_once("Low priority", 1, past, make_action());
        scheduler.schedule_once("High priority", 10, past, make_action());
        scheduler.schedule_once("Medium priority", 5, past, make_action());

        let due = scheduler.all_due();
        assert_eq!(due.len(), 3);
        assert_eq!(due[0].description, "High priority");
        assert_eq!(due[0].priority, 10);
    }

    #[test]
    fn test_complete_task() {
        let mut scheduler = TaskScheduler::with_defaults();
        let past = Utc::now() - chrono::Duration::seconds(10);
        scheduler.schedule_once("Task to complete", 5, past, make_action());

        let task = scheduler.next_due().unwrap();
        scheduler.complete_task(task);

        assert_eq!(scheduler.pending_count(), 0);
        assert_eq!(scheduler.completed_count(), 1);
        assert_eq!(
            scheduler.completed_tasks()[0].status,
            TaskStatus::Completed
        );
    }

    #[test]
    fn test_recurring_task_re_schedules() {
        let mut scheduler = TaskScheduler::with_defaults();

        scheduler.schedule_recurring("Recurring task", 5, 3600, make_action());

        // Force it to be due by manipulating — we'll pop and re-add with past time
        let mut task = scheduler.queue.pop().unwrap();
        task.next_run = Utc::now() - chrono::Duration::seconds(10);
        scheduler.queue.push(task);

        let due_task = scheduler.next_due().unwrap();
        assert_eq!(due_task.description, "Recurring task");

        // Complete it — should re-schedule
        scheduler.complete_task(due_task);
        assert_eq!(scheduler.pending_count(), 1); // Re-added
        assert_eq!(scheduler.completed_count(), 0); // Not in history (re-scheduled)
    }

    #[test]
    fn test_cancel_task() {
        let mut scheduler = TaskScheduler::with_defaults();
        let id = scheduler.schedule_once(
            "Task to cancel",
            5,
            Utc::now() + chrono::Duration::hours(1),
            make_action(),
        );

        assert_eq!(scheduler.pending_count(), 1);
        scheduler.cancel_task(&id).unwrap();
        assert_eq!(scheduler.pending_count(), 0);
        assert_eq!(scheduler.completed_count(), 1);
        assert!(matches!(
            scheduler.completed_tasks()[0].status,
            TaskStatus::Cancelled
        ));
    }

    #[test]
    fn test_cancel_nonexistent_task() {
        let mut scheduler = TaskScheduler::with_defaults();
        assert!(scheduler.cancel_task("nonexistent").is_err());
    }

    #[test]
    fn test_fail_task() {
        let mut scheduler = TaskScheduler::with_defaults();
        let past = Utc::now() - chrono::Duration::seconds(10);
        scheduler.schedule_once("Failing task", 5, past, make_action());

        let task = scheduler.next_due().unwrap();
        scheduler.fail_task(task, "Something went wrong".into());

        assert_eq!(scheduler.completed_count(), 1);
        assert!(matches!(
            &scheduler.completed_tasks()[0].status,
            TaskStatus::Failed { error } if error == "Something went wrong"
        ));
    }

    #[test]
    fn test_action_type_display() {
        let action = ActionType::CreateBranch {
            name: "feat/foo".into(),
        };
        assert_eq!(action.to_string(), "create-branch:feat/foo");

        let action = ActionType::CreateRelease {
            version: "1.2.3".into(),
        };
        assert_eq!(action.to_string(), "release:1.2.3");
    }

    #[test]
    fn test_priority_clamped() {
        let task = ScheduledTask::new(
            "Over priority",
            20, // Should clamp to 10
            Schedule::Once { at: Utc::now() },
            make_action(),
        );
        assert_eq!(task.priority, 10);

        let task = ScheduledTask::new(
            "Zero priority",
            0, // Should clamp to 1
            Schedule::Once { at: Utc::now() },
            make_action(),
        );
        assert_eq!(task.priority, 1);
    }
}
