//! Phase 8: Agentic Swarm Orchestration
//!
//! Implements multi-agent swarm patterns for parallel task execution,
//! agent specialization, communication, and dynamic scaling.
//!
//! # Architecture
//!
//! - **Swarm** — manages a collection of agents working together
//! - **SwarmAgent** — an individual agent in the swarm with role and state
//! - **SwarmConfig** — configuration for swarm behavior
//! - **SwarmRouter** — routes tasks to the best agent (hybrid routing)
//! - **SwarmMessage** — inter-agent communication
//! - **BatchProcessor** — processes multiple tasks in parallel

use std::collections::HashMap;
use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Swarm Agent
// ---------------------------------------------------------------------------

/// Unique identifier for a swarm agent.
pub type AgentId = String;

/// An individual agent within the swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmAgent {
    /// Unique identifier
    pub id: AgentId,
    /// Human-readable name
    pub name: String,
    /// The agent's specialization
    pub role: SwarmRole,
    /// Current state
    pub state: AgentState,
    /// Capabilities this agent has
    pub capabilities: Vec<String>,
    /// Maximum concurrent tasks
    pub max_concurrent: u32,
    /// Current task count
    pub current_tasks: u32,
    /// Cumulative performance score
    pub performance_score: f64,
    /// Number of tasks completed
    pub tasks_completed: u64,
    /// Number of tasks failed
    pub tasks_failed: u64,
}

/// Specialization role for an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SwarmRole {
    /// General-purpose agent
    Generalist,
    /// Code writing specialist
    Coder,
    /// Test writing specialist
    Tester,
    /// Code review specialist
    Reviewer,
    /// Documentation specialist
    Documenter,
    /// Security analysis specialist
    SecurityAnalyst,
    /// DevOps/deployment specialist
    Deployer,
    /// Architecture/design specialist
    Architect,
    /// Research and exploration
    Researcher,
    /// Coordination and planning
    Coordinator,
}

impl fmt::Display for SwarmRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SwarmRole::Generalist => write!(f, "generalist"),
            SwarmRole::Coder => write!(f, "coder"),
            SwarmRole::Tester => write!(f, "tester"),
            SwarmRole::Reviewer => write!(f, "reviewer"),
            SwarmRole::Documenter => write!(f, "documenter"),
            SwarmRole::SecurityAnalyst => write!(f, "security_analyst"),
            SwarmRole::Deployer => write!(f, "deployer"),
            SwarmRole::Architect => write!(f, "architect"),
            SwarmRole::Researcher => write!(f, "researcher"),
            SwarmRole::Coordinator => write!(f, "coordinator"),
        }
    }
}

/// Current state of a swarm agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Working,
    Paused,
    Failed,
    Terminated,
}

impl SwarmAgent {
    pub fn new(id: impl Into<String>, name: impl Into<String>, role: SwarmRole) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            role,
            state: AgentState::Idle,
            capabilities: Vec::new(),
            max_concurrent: 3,
            current_tasks: 0,
            performance_score: 1.0,
            tasks_completed: 0,
            tasks_failed: 0,
        }
    }

    pub fn with_capabilities(mut self, caps: Vec<String>) -> Self {
        self.capabilities = caps;
        self
    }

    pub fn is_available(&self) -> bool {
        self.state == AgentState::Idle || (self.state == AgentState::Working && self.current_tasks < self.max_concurrent)
    }

    pub fn success_rate(&self) -> f64 {
        let total = self.tasks_completed + self.tasks_failed;
        if total == 0 {
            1.0
        } else {
            self.tasks_completed as f64 / total as f64
        }
    }

    pub fn assign_task(&mut self) {
        self.current_tasks += 1;
        self.state = AgentState::Working;
    }

    pub fn complete_task(&mut self, success: bool) {
        self.current_tasks = self.current_tasks.saturating_sub(1);
        if success {
            self.tasks_completed += 1;
            self.performance_score = (self.performance_score * 0.9) + (1.0 * 0.1);
        } else {
            self.tasks_failed += 1;
            self.performance_score = (self.performance_score * 0.9) + (0.0 * 0.1);
        }
        if self.current_tasks == 0 {
            self.state = AgentState::Idle;
        }
    }
}

// ---------------------------------------------------------------------------
// Swarm Configuration
// ---------------------------------------------------------------------------

/// Configuration for swarm behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmConfig {
    /// Maximum number of agents in the swarm
    pub max_agents: usize,
    /// Routing strategy for task assignment
    pub routing: RoutingStrategy,
    /// Whether agents can communicate with each other
    pub inter_agent_communication: bool,
    /// Maximum time for any single task
    pub task_timeout: Duration,
    /// Whether to auto-scale agents based on load
    pub auto_scale: bool,
    /// Minimum performance score before agent is replaced
    pub min_performance: f64,
}

impl Default for SwarmConfig {
    fn default() -> Self {
        Self {
            max_agents: 10,
            routing: RoutingStrategy::SkillBased,
            inter_agent_communication: true,
            task_timeout: Duration::from_secs(300),
            auto_scale: false,
            min_performance: 0.5,
        }
    }
}

/// Strategy for routing tasks to agents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutingStrategy {
    /// Round-robin assignment
    RoundRobin,
    /// Route to least busy agent
    LeastBusy,
    /// Route based on agent skills/capabilities
    SkillBased,
    /// Route based on past performance
    PerformanceBased,
    /// Hybrid: skill match + performance + load balancing
    Hybrid,
    /// Random assignment
    Random,
}

// ---------------------------------------------------------------------------
// Swarm
// ---------------------------------------------------------------------------

/// A managed collection of agents working together.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Swarm {
    pub name: String,
    pub config: SwarmConfig,
    agents: HashMap<AgentId, SwarmAgent>,
    message_log: Vec<SwarmMessage>,
    round_robin_index: usize,
}

impl Swarm {
    pub fn new(name: impl Into<String>, config: SwarmConfig) -> Self {
        Self {
            name: name.into(),
            config,
            agents: HashMap::new(),
            message_log: Vec::new(),
            round_robin_index: 0,
        }
    }

    /// Add an agent to the swarm.
    pub fn add_agent(&mut self, agent: SwarmAgent) -> Result<(), SwarmError> {
        if self.agents.len() >= self.config.max_agents {
            return Err(SwarmError::CapacityReached(self.config.max_agents));
        }
        self.agents.insert(agent.id.clone(), agent);
        Ok(())
    }

    /// Remove an agent from the swarm.
    pub fn remove_agent(&mut self, agent_id: &str) -> Option<SwarmAgent> {
        self.agents.remove(agent_id)
    }

    /// Get an agent by ID.
    pub fn get_agent(&self, agent_id: &str) -> Option<&SwarmAgent> {
        self.agents.get(agent_id)
    }

    /// Get mutable reference to an agent.
    pub fn get_agent_mut(&mut self, agent_id: &str) -> Option<&mut SwarmAgent> {
        self.agents.get_mut(agent_id)
    }

    /// Number of agents in the swarm.
    pub fn agent_count(&self) -> usize {
        self.agents.len()
    }

    /// Get available agents.
    pub fn available_agents(&self) -> Vec<&SwarmAgent> {
        self.agents.values().filter(|a| a.is_available()).collect()
    }

    /// Route a task to the best agent based on strategy.
    pub fn route_task(&mut self, task: &SwarmTask) -> Result<AgentId, SwarmError> {
        let agent_id = match self.config.routing {
            RoutingStrategy::RoundRobin => self.route_round_robin()?,
            RoutingStrategy::LeastBusy => self.route_least_busy()?,
            RoutingStrategy::SkillBased => self.route_skill_based(task)?,
            RoutingStrategy::PerformanceBased => self.route_performance_based()?,
            RoutingStrategy::Hybrid => self.route_hybrid(task)?,
            RoutingStrategy::Random => self.route_random()?,
        };

        if let Some(agent) = self.agents.get_mut(&agent_id) {
            agent.assign_task();
        }

        Ok(agent_id)
    }

    fn route_round_robin(&mut self) -> Result<AgentId, SwarmError> {
        let available: Vec<_> = self.available_agents().iter().map(|a| a.id.clone()).collect();
        if available.is_empty() {
            return Err(SwarmError::NoAvailableAgents);
        }
        self.round_robin_index = (self.round_robin_index + 1) % available.len();
        Ok(available[self.round_robin_index].clone())
    }

    fn route_least_busy(&self) -> Result<AgentId, SwarmError> {
        self.available_agents()
            .iter()
            .min_by_key(|a| a.current_tasks)
            .map(|a| a.id.clone())
            .ok_or(SwarmError::NoAvailableAgents)
    }

    fn route_skill_based(&self, task: &SwarmTask) -> Result<AgentId, SwarmError> {
        // Find agents matching required capabilities
        let matching: Vec<_> = self
            .available_agents()
            .iter()
            .filter(|a| {
                task.required_capabilities.iter().all(|cap| a.capabilities.contains(cap))
                    || a.role == SwarmRole::Generalist
            })
            .map(|a| a.id.clone())
            .collect();

        matching.into_iter().next().ok_or(SwarmError::NoMatchingAgent {
            capabilities: task.required_capabilities.clone(),
        })
    }

    fn route_performance_based(&self) -> Result<AgentId, SwarmError> {
        self.available_agents()
            .iter()
            .max_by(|a, b| a.performance_score.partial_cmp(&b.performance_score).unwrap_or(std::cmp::Ordering::Equal))
            .map(|a| a.id.clone())
            .ok_or(SwarmError::NoAvailableAgents)
    }

    fn route_hybrid(&self, task: &SwarmTask) -> Result<AgentId, SwarmError> {
        // Score = skill_match * 0.4 + performance * 0.3 + availability * 0.3
        let available = self.available_agents();
        if available.is_empty() {
            return Err(SwarmError::NoAvailableAgents);
        }

        let scored: Vec<_> = available
            .iter()
            .map(|a| {
                let skill_score = if task.required_capabilities.is_empty() {
                    1.0
                } else {
                    let matched = task.required_capabilities.iter()
                        .filter(|cap| a.capabilities.contains(cap))
                        .count();
                    matched as f64 / task.required_capabilities.len() as f64
                };
                let perf_score = a.performance_score;
                let load_score = 1.0 - (a.current_tasks as f64 / a.max_concurrent as f64);

                let total = skill_score * 0.4 + perf_score * 0.3 + load_score * 0.3;
                (a.id.clone(), total)
            })
            .collect();

        scored
            .into_iter()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(id, _)| id)
            .ok_or(SwarmError::NoAvailableAgents)
    }

    fn route_random(&self) -> Result<AgentId, SwarmError> {
        let available = self.available_agents();
        if available.is_empty() {
            return Err(SwarmError::NoAvailableAgents);
        }
        // Deterministic "random" for testing — just pick first
        Ok(available[0].id.clone())
    }

    /// Send a message between agents.
    pub fn send_message(&mut self, message: SwarmMessage) {
        self.message_log.push(message);
    }

    /// Get messages for a specific agent.
    pub fn messages_for(&self, agent_id: &str) -> Vec<&SwarmMessage> {
        self.message_log.iter().filter(|m| m.to == agent_id).collect()
    }

    /// Get swarm-wide summary.
    pub fn summary(&self) -> SwarmSummary {
        let total_agents = self.agents.len();
        let idle = self.agents.values().filter(|a| a.state == AgentState::Idle).count();
        let working = self.agents.values().filter(|a| a.state == AgentState::Working).count();
        let total_completed: u64 = self.agents.values().map(|a| a.tasks_completed).sum();
        let total_failed: u64 = self.agents.values().map(|a| a.tasks_failed).sum();
        let avg_performance = if total_agents > 0 {
            self.agents.values().map(|a| a.performance_score).sum::<f64>() / total_agents as f64
        } else {
            0.0
        };

        SwarmSummary {
            name: self.name.clone(),
            total_agents,
            idle,
            working,
            total_completed,
            total_failed,
            avg_performance,
            messages_sent: self.message_log.len(),
        }
    }
}

// ---------------------------------------------------------------------------
// Swarm Task
// ---------------------------------------------------------------------------

/// A task to be executed by the swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTask {
    pub id: String,
    pub description: String,
    pub priority: TaskPriority,
    pub required_capabilities: Vec<String>,
    pub timeout: Option<Duration>,
    pub assigned_to: Option<AgentId>,
    pub status: SwarmTaskStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    Normal,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SwarmTaskStatus {
    Queued,
    Assigned,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

// ---------------------------------------------------------------------------
// Inter-Agent Communication
// ---------------------------------------------------------------------------

/// A message between agents in the swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmMessage {
    pub from: AgentId,
    pub to: AgentId,
    pub message_type: MessageType,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    TaskHandoff,
    StatusUpdate,
    Question,
    Answer,
    Feedback,
    Alert,
}

// ---------------------------------------------------------------------------
// Batch Processor
// ---------------------------------------------------------------------------

/// Processes multiple tasks concurrently through the swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchProcessor {
    pub name: String,
    pub tasks: Vec<SwarmTask>,
    pub max_concurrency: usize,
    pub completed: usize,
    pub failed: usize,
    pub status: BatchStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchStatus {
    Pending,
    Running,
    Completed,
    PartiallyFailed,
    Failed,
}

impl BatchProcessor {
    pub fn new(name: impl Into<String>, tasks: Vec<SwarmTask>) -> Self {
        Self {
            name: name.into(),
            tasks,
            max_concurrency: 5,
            completed: 0,
            failed: 0,
            status: BatchStatus::Pending,
        }
    }

    pub fn with_concurrency(mut self, concurrency: usize) -> Self {
        self.max_concurrency = concurrency;
        self
    }

    pub fn total_tasks(&self) -> usize {
        self.tasks.len()
    }

    pub fn progress(&self) -> f64 {
        if self.tasks.is_empty() {
            return 1.0;
        }
        (self.completed + self.failed) as f64 / self.tasks.len() as f64
    }

    pub fn record_completion(&mut self, success: bool) {
        if success {
            self.completed += 1;
        } else {
            self.failed += 1;
        }

        if self.completed + self.failed >= self.tasks.len() {
            self.status = if self.failed == 0 {
                BatchStatus::Completed
            } else if self.completed == 0 {
                BatchStatus::Failed
            } else {
                BatchStatus::PartiallyFailed
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Summary & Errors
// ---------------------------------------------------------------------------

/// Summary of swarm state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmSummary {
    pub name: String,
    pub total_agents: usize,
    pub idle: usize,
    pub working: usize,
    pub total_completed: u64,
    pub total_failed: u64,
    pub avg_performance: f64,
    pub messages_sent: usize,
}

impl fmt::Display for SwarmSummary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "🐝 Swarm: {} ({} agents)", self.name, self.total_agents)?;
        writeln!(f, "  Status: {} idle, {} working", self.idle, self.working)?;
        writeln!(f, "  Tasks: {} completed, {} failed", self.total_completed, self.total_failed)?;
        write!(f, "  Avg Performance: {:.0}% | Messages: {}", self.avg_performance * 100.0, self.messages_sent)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SwarmError {
    CapacityReached(usize),
    NoAvailableAgents,
    NoMatchingAgent { capabilities: Vec<String> },
    AgentNotFound(AgentId),
    TaskFailed { task_id: String, error: String },
}

impl fmt::Display for SwarmError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SwarmError::CapacityReached(max) => write!(f, "Swarm capacity reached: max {} agents", max),
            SwarmError::NoAvailableAgents => write!(f, "No available agents in swarm"),
            SwarmError::NoMatchingAgent { capabilities } => write!(f, "No agent matching: {:?}", capabilities),
            SwarmError::AgentNotFound(id) => write!(f, "Agent not found: {}", id),
            SwarmError::TaskFailed { task_id, error } => write!(f, "Task {} failed: {}", task_id, error),
        }
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn test_swarm() -> Swarm {
        let config = SwarmConfig::default();
        let mut swarm = Swarm::new("test-swarm", config);

        swarm.add_agent(
            SwarmAgent::new("coder-1", "Alice", SwarmRole::Coder)
                .with_capabilities(vec!["rust".into(), "python".into()])
        ).unwrap();

        swarm.add_agent(
            SwarmAgent::new("tester-1", "Bob", SwarmRole::Tester)
                .with_capabilities(vec!["testing".into(), "rust".into()])
        ).unwrap();

        swarm.add_agent(
            SwarmAgent::new("reviewer-1", "Charlie", SwarmRole::Reviewer)
                .with_capabilities(vec!["review".into(), "security".into()])
        ).unwrap();

        swarm
    }

    fn test_task(id: &str, caps: Vec<&str>) -> SwarmTask {
        SwarmTask {
            id: id.into(),
            description: format!("Task {}", id),
            priority: TaskPriority::Normal,
            required_capabilities: caps.into_iter().map(|s| s.to_string()).collect(),
            timeout: None,
            assigned_to: None,
            status: SwarmTaskStatus::Queued,
        }
    }

    #[test]
    fn test_swarm_creation() {
        let swarm = test_swarm();
        assert_eq!(swarm.agent_count(), 3);
        assert_eq!(swarm.available_agents().len(), 3);
    }

    #[test]
    fn test_add_remove_agent() {
        let mut swarm = test_swarm();
        assert_eq!(swarm.agent_count(), 3);

        swarm.remove_agent("coder-1");
        assert_eq!(swarm.agent_count(), 2);
        assert!(swarm.get_agent("coder-1").is_none());
    }

    #[test]
    fn test_capacity_limit() {
        let config = SwarmConfig {
            max_agents: 2,
            ..SwarmConfig::default()
        };
        let mut swarm = Swarm::new("small-swarm", config);
        swarm.add_agent(SwarmAgent::new("a1", "A", SwarmRole::Generalist)).unwrap();
        swarm.add_agent(SwarmAgent::new("a2", "B", SwarmRole::Generalist)).unwrap();

        let result = swarm.add_agent(SwarmAgent::new("a3", "C", SwarmRole::Generalist));
        assert!(matches!(result, Err(SwarmError::CapacityReached(2))));
    }

    #[test]
    fn test_route_skill_based() {
        let mut swarm = test_swarm();
        let task = test_task("t1", vec!["rust"]);

        let agent_id = swarm.route_task(&task).unwrap();
        // Should route to coder-1 or tester-1 (both have "rust")
        assert!(agent_id == "coder-1" || agent_id == "tester-1");
    }

    #[test]
    fn test_route_least_busy() {
        let config = SwarmConfig {
            routing: RoutingStrategy::LeastBusy,
            ..SwarmConfig::default()
        };
        let mut swarm = Swarm::new("lb-swarm", config);
        let mut a1 = SwarmAgent::new("a1", "A", SwarmRole::Generalist);
        a1.current_tasks = 3;
        a1.state = AgentState::Working;
        swarm.add_agent(a1).unwrap();
        swarm.add_agent(SwarmAgent::new("a2", "B", SwarmRole::Generalist)).unwrap();

        let task = test_task("t1", vec![]);
        let agent_id = swarm.route_task(&task).unwrap();
        assert_eq!(agent_id, "a2"); // a2 is less busy
    }

    #[test]
    fn test_route_performance_based() {
        let config = SwarmConfig {
            routing: RoutingStrategy::PerformanceBased,
            ..SwarmConfig::default()
        };
        let mut swarm = Swarm::new("perf-swarm", config);

        let mut a1 = SwarmAgent::new("a1", "A", SwarmRole::Generalist);
        a1.performance_score = 0.5;
        swarm.add_agent(a1).unwrap();

        let mut a2 = SwarmAgent::new("a2", "B", SwarmRole::Generalist);
        a2.performance_score = 0.9;
        swarm.add_agent(a2).unwrap();

        let task = test_task("t1", vec![]);
        let agent_id = swarm.route_task(&task).unwrap();
        assert_eq!(agent_id, "a2"); // a2 has higher performance
    }

    #[test]
    fn test_agent_task_lifecycle() {
        let mut agent = SwarmAgent::new("a1", "Agent", SwarmRole::Coder);
        assert!(agent.is_available());
        assert_eq!(agent.state, AgentState::Idle);

        agent.assign_task();
        assert_eq!(agent.state, AgentState::Working);
        assert_eq!(agent.current_tasks, 1);

        agent.complete_task(true);
        assert_eq!(agent.state, AgentState::Idle);
        assert_eq!(agent.tasks_completed, 1);
        assert_eq!(agent.current_tasks, 0);
    }

    #[test]
    fn test_agent_success_rate() {
        let mut agent = SwarmAgent::new("a1", "Agent", SwarmRole::Coder);
        assert_eq!(agent.success_rate(), 1.0); // No tasks yet

        agent.tasks_completed = 8;
        agent.tasks_failed = 2;
        assert!((agent.success_rate() - 0.8).abs() < 0.01);
    }

    #[test]
    fn test_inter_agent_messaging() {
        let mut swarm = test_swarm();

        swarm.send_message(SwarmMessage {
            from: "coder-1".into(),
            to: "reviewer-1".into(),
            message_type: MessageType::TaskHandoff,
            content: "Code ready for review".into(),
            timestamp: chrono::Utc::now(),
        });

        let messages = swarm.messages_for("reviewer-1");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].from, "coder-1");
    }

    #[test]
    fn test_batch_processor() {
        let tasks = vec![
            test_task("t1", vec![]),
            test_task("t2", vec![]),
            test_task("t3", vec![]),
        ];

        let mut batch = BatchProcessor::new("test-batch", tasks);
        assert_eq!(batch.total_tasks(), 3);
        assert_eq!(batch.status, BatchStatus::Pending);
        assert_eq!(batch.progress(), 0.0);

        batch.status = BatchStatus::Running;
        batch.record_completion(true);
        batch.record_completion(true);
        assert!((batch.progress() - 0.666).abs() < 0.01);

        batch.record_completion(false);
        assert_eq!(batch.status, BatchStatus::PartiallyFailed);
        assert_eq!(batch.completed, 2);
        assert_eq!(batch.failed, 1);
    }

    #[test]
    fn test_batch_all_success() {
        let tasks = vec![test_task("t1", vec![]), test_task("t2", vec![])];
        let mut batch = BatchProcessor::new("batch", tasks);
        batch.record_completion(true);
        batch.record_completion(true);
        assert_eq!(batch.status, BatchStatus::Completed);
    }

    #[test]
    fn test_batch_all_failed() {
        let tasks = vec![test_task("t1", vec![]), test_task("t2", vec![])];
        let mut batch = BatchProcessor::new("batch", tasks);
        batch.record_completion(false);
        batch.record_completion(false);
        assert_eq!(batch.status, BatchStatus::Failed);
    }

    #[test]
    fn test_swarm_summary() {
        let mut swarm = test_swarm();

        // Simulate some work
        if let Some(agent) = swarm.get_agent_mut("coder-1") {
            agent.assign_task();
            agent.complete_task(true);
            agent.assign_task();
        }

        let summary = swarm.summary();
        assert_eq!(summary.total_agents, 3);
        assert_eq!(summary.total_completed, 1);
    }

    #[test]
    fn test_summary_display() {
        let summary = SwarmSummary {
            name: "test-swarm".into(),
            total_agents: 5,
            idle: 3,
            working: 2,
            total_completed: 100,
            total_failed: 5,
            avg_performance: 0.85,
            messages_sent: 42,
        };
        let s = summary.to_string();
        assert!(s.contains("test-swarm"));
        assert!(s.contains("5 agents"));
        assert!(s.contains("100 completed"));
    }

    #[test]
    fn test_serialization() {
        let swarm = test_swarm();
        let json = serde_json::to_string(&swarm).unwrap();
        let deserialized: Swarm = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.agent_count(), swarm.agent_count());
    }

    #[test]
    fn test_swarm_roles() {
        let roles = vec![
            SwarmRole::Generalist, SwarmRole::Coder, SwarmRole::Tester,
            SwarmRole::Reviewer, SwarmRole::Documenter, SwarmRole::SecurityAnalyst,
            SwarmRole::Deployer, SwarmRole::Architect, SwarmRole::Researcher,
            SwarmRole::Coordinator,
        ];
        assert_eq!(roles.len(), 10);
        assert_eq!(SwarmRole::Coder.to_string(), "coder");
    }
}
