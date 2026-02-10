//! Phase 7: Explicit Task Graph / DAG Execution System
//!
//! Provides a LangGraph-inspired node/edge API for composing agent workflows
//! as directed acyclic graphs. Wraps the existing orchestrator infrastructure
//! with an explicit, type-safe graph construction API.
//!
//! # Architecture
//!
//! - **TaskGraph** — the core DAG data structure with nodes and edges
//! - **GraphNode** — a unit of work (function, tool call, sub-graph, conditional)
//! - **GraphEdge** — directed connection between nodes (standard or conditional)
//! - **GraphExecutor** — walks the DAG respecting dependencies, runs nodes
//! - **GraphValidation** — cycle detection, orphan detection, completeness checks

use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Graph Node Types
// ---------------------------------------------------------------------------

/// Unique identifier for a graph node.
pub type NodeId = String;

/// A node in the task graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    /// Unique node identifier
    pub id: NodeId,
    /// Human-readable name
    pub name: String,
    /// What this node does
    pub node_type: NodeType,
    /// Maximum execution time
    pub timeout: Duration,
    /// Retry count on failure
    pub max_retries: u32,
    /// Metadata tags
    #[serde(default)]
    pub tags: Vec<String>,
}

/// The type of work a node performs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeType {
    /// Execute a tool by name with arguments
    ToolCall { tool_name: String, args: HashMap<String, String> },
    /// Run a prompt through the agent
    Prompt { text: String },
    /// Execute a skill by name
    SkillInvoke { skill_name: String, params: HashMap<String, String> },
    /// A conditional branch — evaluates condition and routes to one of two targets
    Conditional { condition: String },
    /// A sub-graph (nested DAG)
    SubGraph { graph_name: String },
    /// Parallel fork — all outgoing edges execute concurrently
    ParallelFork,
    /// Join point — waits for all incoming edges
    Join,
    /// Entry point (synthetic, no work)
    Entry,
    /// Exit point (synthetic, no work)
    Exit,
}

// ---------------------------------------------------------------------------
// Graph Edge Types
// ---------------------------------------------------------------------------

/// A directed edge between two nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub from: NodeId,
    pub to: NodeId,
    pub edge_type: EdgeType,
    /// Optional label for visualization
    pub label: Option<String>,
}

/// Edge routing type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EdgeType {
    /// Standard — always follows this edge
    Standard,
    /// Conditional — follows only if condition evaluates to this branch
    ConditionalTrue,
    ConditionalFalse,
    /// Error edge — follows on node failure
    OnError,
}

// ---------------------------------------------------------------------------
// Node Execution State
// ---------------------------------------------------------------------------

/// Runtime state of a node during execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeState {
    pub node_id: NodeId,
    pub status: NodeStatus,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration: Option<Duration>,
    pub retries: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeStatus {
    Pending,
    Ready,
    Running,
    Completed,
    Failed,
    Skipped,
}

// ---------------------------------------------------------------------------
// Task Graph (DAG)
// ---------------------------------------------------------------------------

/// A directed acyclic graph of tasks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGraph {
    pub name: String,
    pub description: String,
    nodes: HashMap<NodeId, GraphNode>,
    edges: Vec<GraphEdge>,
    entry_point: Option<NodeId>,
    exit_point: Option<NodeId>,
}

impl TaskGraph {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: String::new(),
            nodes: HashMap::new(),
            edges: Vec::new(),
            entry_point: None,
            exit_point: None,
        }
    }

    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = desc.into();
        self
    }

    /// Add a node to the graph.
    pub fn add_node(&mut self, node: GraphNode) -> &mut Self {
        self.nodes.insert(node.id.clone(), node);
        self
    }

    /// Add a directed edge between two nodes.
    pub fn add_edge(&mut self, from: impl Into<NodeId>, to: impl Into<NodeId>) -> &mut Self {
        self.edges.push(GraphEdge {
            from: from.into(),
            to: to.into(),
            edge_type: EdgeType::Standard,
            label: None,
        });
        self
    }

    /// Add a conditional edge.
    pub fn add_conditional_edge(
        &mut self,
        from: impl Into<NodeId>,
        to: impl Into<NodeId>,
        branch: EdgeType,
        label: Option<String>,
    ) -> &mut Self {
        self.edges.push(GraphEdge {
            from: from.into(),
            to: to.into(),
            edge_type: branch,
            label,
        });
        self
    }

    /// Set the entry point node.
    pub fn set_entry_point(&mut self, node_id: impl Into<NodeId>) -> &mut Self {
        self.entry_point = Some(node_id.into());
        self
    }

    /// Set the exit point node.
    pub fn set_exit_point(&mut self, node_id: impl Into<NodeId>) -> &mut Self {
        self.exit_point = Some(node_id.into());
        self
    }

    /// Get a node by ID.
    pub fn get_node(&self, id: &str) -> Option<&GraphNode> {
        self.nodes.get(id)
    }

    /// Get all nodes.
    pub fn nodes(&self) -> &HashMap<NodeId, GraphNode> {
        &self.nodes
    }

    /// Get all edges.
    pub fn edges(&self) -> &[GraphEdge] {
        &self.edges
    }

    /// Number of nodes.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Number of edges.
    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    /// Get the entry point.
    pub fn entry_point(&self) -> Option<&NodeId> {
        self.entry_point.as_ref()
    }

    /// Get the exit point.
    pub fn exit_point(&self) -> Option<&NodeId> {
        self.exit_point.as_ref()
    }

    /// Get outgoing edges from a node.
    pub fn outgoing_edges(&self, node_id: &str) -> Vec<&GraphEdge> {
        self.edges.iter().filter(|e| e.from == node_id).collect()
    }

    /// Get incoming edges to a node.
    pub fn incoming_edges(&self, node_id: &str) -> Vec<&GraphEdge> {
        self.edges.iter().filter(|e| e.to == node_id).collect()
    }

    /// Get predecessor node IDs.
    pub fn predecessors(&self, node_id: &str) -> Vec<&NodeId> {
        self.edges
            .iter()
            .filter(|e| e.to == node_id)
            .map(|e| &e.from)
            .collect()
    }

    /// Get successor node IDs.
    pub fn successors(&self, node_id: &str) -> Vec<&NodeId> {
        self.edges
            .iter()
            .filter(|e| e.from == node_id)
            .map(|e| &e.to)
            .collect()
    }

    /// Remove a node and all its edges.
    pub fn remove_node(&mut self, node_id: &str) -> Option<GraphNode> {
        self.edges.retain(|e| e.from != node_id && e.to != node_id);
        if self.entry_point.as_deref() == Some(node_id) {
            self.entry_point = None;
        }
        if self.exit_point.as_deref() == Some(node_id) {
            self.exit_point = None;
        }
        self.nodes.remove(node_id)
    }

    /// Validate the graph structure.
    pub fn validate(&self) -> Vec<GraphValidationError> {
        let mut errors = Vec::new();

        // Check entry/exit points exist
        if let Some(entry) = &self.entry_point {
            if !self.nodes.contains_key(entry) {
                errors.push(GraphValidationError::MissingNode(entry.clone()));
            }
        } else {
            errors.push(GraphValidationError::NoEntryPoint);
        }

        if let Some(exit) = &self.exit_point {
            if !self.nodes.contains_key(exit) {
                errors.push(GraphValidationError::MissingNode(exit.clone()));
            }
        }

        // Check all edges reference existing nodes
        for edge in &self.edges {
            if !self.nodes.contains_key(&edge.from) {
                errors.push(GraphValidationError::MissingNode(edge.from.clone()));
            }
            if !self.nodes.contains_key(&edge.to) {
                errors.push(GraphValidationError::MissingNode(edge.to.clone()));
            }
        }

        // Detect cycles
        if self.has_cycle() {
            errors.push(GraphValidationError::CycleDetected);
        }

        // Detect orphan nodes (no incoming or outgoing edges, not entry/exit)
        for node_id in self.nodes.keys() {
            let has_incoming = self.edges.iter().any(|e| &e.to == node_id);
            let has_outgoing = self.edges.iter().any(|e| &e.from == node_id);
            let is_entry = self.entry_point.as_ref() == Some(node_id);
            let is_exit = self.exit_point.as_ref() == Some(node_id);

            if !has_incoming && !has_outgoing && !is_entry && !is_exit {
                errors.push(GraphValidationError::OrphanNode(node_id.clone()));
            }
        }

        errors
    }

    /// Detect cycles using DFS-based topological sort approach.
    pub fn has_cycle(&self) -> bool {
        let mut visited = HashSet::new();
        let mut in_stack = HashSet::new();

        for node_id in self.nodes.keys() {
            if self.dfs_cycle_check(node_id, &mut visited, &mut in_stack) {
                return true;
            }
        }
        false
    }

    fn dfs_cycle_check(
        &self,
        node_id: &str,
        visited: &mut HashSet<String>,
        in_stack: &mut HashSet<String>,
    ) -> bool {
        if in_stack.contains(node_id) {
            return true; // Back edge found = cycle
        }
        if visited.contains(node_id) {
            return false; // Already fully explored
        }

        visited.insert(node_id.to_string());
        in_stack.insert(node_id.to_string());

        for successor in self.successors(node_id) {
            if self.dfs_cycle_check(successor, visited, in_stack) {
                return true;
            }
        }

        in_stack.remove(node_id);
        false
    }

    /// Topological sort — returns nodes in dependency order.
    pub fn topological_sort(&self) -> Result<Vec<NodeId>, GraphValidationError> {
        let mut in_degree: HashMap<&str, usize> = HashMap::new();
        for node_id in self.nodes.keys() {
            in_degree.insert(node_id.as_str(), 0);
        }

        for edge in &self.edges {
            if let Some(count) = in_degree.get_mut(edge.to.as_str()) {
                *count += 1;
            }
        }

        let mut queue: VecDeque<&str> = in_degree
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(&id, _)| id)
            .collect();

        let mut sorted = Vec::new();

        while let Some(node_id) = queue.pop_front() {
            sorted.push(node_id.to_string());

            for successor in self.successors(node_id) {
                if let Some(count) = in_degree.get_mut(successor.as_str()) {
                    *count -= 1;
                    if *count == 0 {
                        queue.push_back(successor.as_str());
                    }
                }
            }
        }

        if sorted.len() != self.nodes.len() {
            return Err(GraphValidationError::CycleDetected);
        }

        Ok(sorted)
    }

    /// Export graph as Mermaid diagram syntax.
    pub fn to_mermaid(&self) -> String {
        let mut lines = vec!["graph TD".to_string()];

        for (id, node) in &self.nodes {
            let shape = match &node.node_type {
                NodeType::Entry | NodeType::Exit => format!("(({}))", node.name),
                NodeType::Conditional { .. } => format!("{{{{{}}}}}", node.name),
                NodeType::ParallelFork | NodeType::Join => format!("[/{}\\]", node.name),
                _ => format!("[{}]", node.name),
            };
            lines.push(format!("    {}{}", id, shape));
        }

        for edge in &self.edges {
            let arrow = match &edge.edge_type {
                EdgeType::Standard => "-->",
                EdgeType::ConditionalTrue => "-->|true|",
                EdgeType::ConditionalFalse => "-->|false|",
                EdgeType::OnError => "-.->|error|",
            };
            if let Some(label) = &edge.label {
                lines.push(format!("    {} {}|{}| {}", edge.from, arrow, label, edge.to));
            } else {
                lines.push(format!("    {} {} {}", edge.from, arrow, edge.to));
            }
        }

        lines.join("\n")
    }
}

impl fmt::Display for TaskGraph {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "📊 TaskGraph: {} ({} nodes, {} edges)", self.name, self.node_count(), self.edge_count())?;
        if let Some(entry) = &self.entry_point {
            write!(f, "  Entry: {}", entry)?;
        }
        if let Some(exit) = &self.exit_point {
            write!(f, " → Exit: {}", exit)?;
        }
        writeln!(f)?;
        for (id, node) in &self.nodes {
            writeln!(f, "  [{}] {} ({:?})", id, node.name, node.node_type)?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Validation Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphValidationError {
    NoEntryPoint,
    MissingNode(NodeId),
    CycleDetected,
    OrphanNode(NodeId),
    UnreachableFromEntry(NodeId),
    DuplicateEdge { from: NodeId, to: NodeId },
}

impl fmt::Display for GraphValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GraphValidationError::NoEntryPoint => write!(f, "Graph has no entry point"),
            GraphValidationError::MissingNode(id) => write!(f, "Referenced node '{}' does not exist", id),
            GraphValidationError::CycleDetected => write!(f, "Graph contains a cycle"),
            GraphValidationError::OrphanNode(id) => write!(f, "Node '{}' has no connections", id),
            GraphValidationError::UnreachableFromEntry(id) => write!(f, "Node '{}' is unreachable from entry", id),
            GraphValidationError::DuplicateEdge { from, to } => write!(f, "Duplicate edge: {} → {}", from, to),
        }
    }
}

// ---------------------------------------------------------------------------
// Graph Executor
// ---------------------------------------------------------------------------

/// Executes a TaskGraph, tracking state for each node.
pub struct GraphExecutor {
    graph: TaskGraph,
    states: HashMap<NodeId, NodeState>,
}

impl GraphExecutor {
    pub fn new(graph: TaskGraph) -> Self {
        let mut states = HashMap::new();
        for node_id in graph.nodes().keys() {
            states.insert(node_id.clone(), NodeState {
                node_id: node_id.clone(),
                status: NodeStatus::Pending,
                output: None,
                error: None,
                duration: None,
                retries: 0,
            });
        }
        Self { graph, states }
    }

    /// Get the current graph.
    pub fn graph(&self) -> &TaskGraph {
        &self.graph
    }

    /// Get state for a specific node.
    pub fn node_state(&self, node_id: &str) -> Option<&NodeState> {
        self.states.get(node_id)
    }

    /// Get all node states.
    pub fn all_states(&self) -> &HashMap<NodeId, NodeState> {
        &self.states
    }

    /// Get nodes that are ready to execute (all predecessors completed).
    pub fn ready_nodes(&self) -> Vec<NodeId> {
        self.states
            .iter()
            .filter(|(_, state)| state.status == NodeStatus::Pending)
            .filter(|(node_id, _)| {
                let predecessors = self.graph.predecessors(node_id);
                predecessors.iter().all(|pred_id| {
                    self.states
                        .get(pred_id.as_str())
                        .map(|s| s.status == NodeStatus::Completed)
                        .unwrap_or(false)
                })
            })
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// Mark a node as running.
    pub fn start_node(&mut self, node_id: &str) {
        if let Some(state) = self.states.get_mut(node_id) {
            state.status = NodeStatus::Running;
        }
    }

    /// Mark a node as completed with output.
    pub fn complete_node(&mut self, node_id: &str, output: Option<String>, duration: Duration) {
        if let Some(state) = self.states.get_mut(node_id) {
            state.status = NodeStatus::Completed;
            state.output = output;
            state.duration = Some(duration);
        }
    }

    /// Mark a node as failed.
    pub fn fail_node(&mut self, node_id: &str, error: String, duration: Duration) {
        if let Some(state) = self.states.get_mut(node_id) {
            state.retries += 1;
            let node = self.graph.get_node(node_id);
            let max = node.map(|n| n.max_retries).unwrap_or(0);
            if state.retries > max {
                state.status = NodeStatus::Failed;
                state.error = Some(error);
            } else {
                state.status = NodeStatus::Pending; // Will retry
            }
            state.duration = Some(duration);
        }
    }

    /// Skip a node.
    pub fn skip_node(&mut self, node_id: &str) {
        if let Some(state) = self.states.get_mut(node_id) {
            state.status = NodeStatus::Skipped;
        }
    }

    /// Check if the graph execution is complete.
    pub fn is_complete(&self) -> bool {
        self.states.values().all(|s| {
            matches!(
                s.status,
                NodeStatus::Completed | NodeStatus::Failed | NodeStatus::Skipped
            )
        })
    }

    /// Check if any node has failed.
    pub fn has_failures(&self) -> bool {
        self.states.values().any(|s| s.status == NodeStatus::Failed)
    }

    /// Get execution summary.
    pub fn summary(&self) -> GraphExecutionSummary {
        let total = self.states.len();
        let completed = self.states.values().filter(|s| s.status == NodeStatus::Completed).count();
        let failed = self.states.values().filter(|s| s.status == NodeStatus::Failed).count();
        let skipped = self.states.values().filter(|s| s.status == NodeStatus::Skipped).count();
        let pending = self.states.values().filter(|s| s.status == NodeStatus::Pending).count();
        let running = self.states.values().filter(|s| s.status == NodeStatus::Running).count();

        let total_duration: Duration = self.states.values()
            .filter_map(|s| s.duration)
            .sum();

        GraphExecutionSummary {
            total,
            completed,
            failed,
            skipped,
            pending,
            running,
            total_duration,
        }
    }
}

/// Summary of graph execution state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphExecutionSummary {
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub pending: usize,
    pub running: usize,
    pub total_duration: Duration,
}

impl fmt::Display for GraphExecutionSummary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Graph: {}/{} completed, {} failed, {} skipped, {} pending ({:.1}s)",
            self.completed,
            self.total,
            self.failed,
            self.skipped,
            self.pending,
            self.total_duration.as_secs_f64()
        )
    }
}

// ---------------------------------------------------------------------------
// Builder Helpers
// ---------------------------------------------------------------------------

/// Convenience builder for creating graph nodes.
pub fn node(id: impl Into<String>, name: impl Into<String>, node_type: NodeType) -> GraphNode {
    GraphNode {
        id: id.into(),
        name: name.into(),
        node_type,
        timeout: Duration::from_secs(300),
        max_retries: 1,
        tags: Vec::new(),
    }
}

/// Create a prompt node.
pub fn prompt_node(id: impl Into<String>, name: impl Into<String>, prompt: impl Into<String>) -> GraphNode {
    node(id, name, NodeType::Prompt { text: prompt.into() })
}

/// Create a tool call node.
pub fn tool_node(id: impl Into<String>, name: impl Into<String>, tool: impl Into<String>) -> GraphNode {
    node(id, name, NodeType::ToolCall { tool_name: tool.into(), args: HashMap::new() })
}

/// Create an entry node.
pub fn entry_node(id: impl Into<String>) -> GraphNode {
    node(id, "START", NodeType::Entry)
}

/// Create an exit node.
pub fn exit_node(id: impl Into<String>) -> GraphNode {
    node(id, "END", NodeType::Exit)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_graph() -> TaskGraph {
        let mut g = TaskGraph::new("test-graph")
            .with_description("A test graph");

        g.add_node(entry_node("start"));
        g.add_node(prompt_node("analyze", "Analyze Code", "Analyze the code for bugs"));
        g.add_node(tool_node("fix", "Fix Bugs", "edit_file"));
        g.add_node(prompt_node("review", "Review Fix", "Review the fix for correctness"));
        g.add_node(exit_node("end"));

        g.set_entry_point("start");
        g.set_exit_point("end");

        g.add_edge("start", "analyze");
        g.add_edge("analyze", "fix");
        g.add_edge("fix", "review");
        g.add_edge("review", "end");

        g
    }

    #[test]
    fn test_graph_creation() {
        let g = sample_graph();
        assert_eq!(g.node_count(), 5);
        assert_eq!(g.edge_count(), 4);
        assert_eq!(g.entry_point(), Some(&"start".to_string()));
        assert_eq!(g.exit_point(), Some(&"end".to_string()));
    }

    #[test]
    fn test_graph_validation_valid() {
        let g = sample_graph();
        let errors = g.validate();
        assert!(errors.is_empty(), "Expected no errors, got {:?}", errors);
    }

    #[test]
    fn test_graph_validation_no_entry() {
        let mut g = TaskGraph::new("bad-graph");
        g.add_node(prompt_node("a", "A", "prompt"));
        let errors = g.validate();
        assert!(errors.iter().any(|e| matches!(e, GraphValidationError::NoEntryPoint)));
    }

    #[test]
    fn test_cycle_detection() {
        let mut g = TaskGraph::new("cyclic");
        g.add_node(prompt_node("a", "A", "x"));
        g.add_node(prompt_node("b", "B", "x"));
        g.add_node(prompt_node("c", "C", "x"));
        g.add_edge("a", "b");
        g.add_edge("b", "c");
        g.add_edge("c", "a"); // Cycle!
        assert!(g.has_cycle());
    }

    #[test]
    fn test_no_cycle() {
        let g = sample_graph();
        assert!(!g.has_cycle());
    }

    #[test]
    fn test_topological_sort() {
        let g = sample_graph();
        let sorted = g.topological_sort().unwrap();
        assert_eq!(sorted.len(), 5);

        // start must come before analyze, analyze before fix, etc.
        let pos = |id: &str| sorted.iter().position(|x| x == id).unwrap();
        assert!(pos("start") < pos("analyze"));
        assert!(pos("analyze") < pos("fix"));
        assert!(pos("fix") < pos("review"));
        assert!(pos("review") < pos("end"));
    }

    #[test]
    fn test_topological_sort_cycle_error() {
        let mut g = TaskGraph::new("cyclic");
        g.add_node(prompt_node("a", "A", "x"));
        g.add_node(prompt_node("b", "B", "x"));
        g.add_edge("a", "b");
        g.add_edge("b", "a");
        assert!(g.topological_sort().is_err());
    }

    #[test]
    fn test_predecessors_successors() {
        let g = sample_graph();
        assert_eq!(g.predecessors("fix"), vec![&"analyze".to_string()]);
        assert_eq!(g.successors("analyze"), vec![&"fix".to_string()]);
        assert!(g.predecessors("start").is_empty());
        assert!(g.successors("end").is_empty());
    }

    #[test]
    fn test_remove_node() {
        let mut g = sample_graph();
        g.remove_node("fix");
        assert_eq!(g.node_count(), 4);
        assert!(g.get_node("fix").is_none());
        // Edges referencing "fix" should be gone
        assert!(g.edges().iter().all(|e| e.from != "fix" && e.to != "fix"));
    }

    #[test]
    fn test_conditional_edges() {
        let mut g = TaskGraph::new("conditional");
        g.add_node(entry_node("start"));
        g.add_node(node("check", "Check Result", NodeType::Conditional { condition: "tests_pass".into() }));
        g.add_node(prompt_node("deploy", "Deploy", "Deploy the app"));
        g.add_node(prompt_node("fix", "Fix", "Fix the issues"));
        g.add_node(exit_node("end"));

        g.set_entry_point("start");
        g.set_exit_point("end");

        g.add_edge("start", "check");
        g.add_conditional_edge("check", "deploy", EdgeType::ConditionalTrue, Some("pass".into()));
        g.add_conditional_edge("check", "fix", EdgeType::ConditionalFalse, Some("fail".into()));
        g.add_edge("deploy", "end");
        g.add_edge("fix", "end");

        assert_eq!(g.edge_count(), 5);
        let errors = g.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_executor_ready_nodes() {
        let g = sample_graph();
        let executor = GraphExecutor::new(g);
        let ready = executor.ready_nodes();
        assert_eq!(ready, vec!["start"]);
    }

    #[test]
    fn test_executor_progression() {
        let g = sample_graph();
        let mut executor = GraphExecutor::new(g);

        // Start should be ready
        let ready = executor.ready_nodes();
        assert!(ready.contains(&"start".to_string()));

        // Complete start
        executor.start_node("start");
        executor.complete_node("start", None, Duration::from_millis(10));

        // Now analyze should be ready
        let ready = executor.ready_nodes();
        assert!(ready.contains(&"analyze".to_string()));
        assert!(!ready.contains(&"fix".to_string())); // Not ready yet

        // Complete analyze
        executor.start_node("analyze");
        executor.complete_node("analyze", Some("Found 3 bugs".into()), Duration::from_secs(2));

        // Fix is ready
        let ready = executor.ready_nodes();
        assert!(ready.contains(&"fix".to_string()));
    }

    #[test]
    fn test_executor_completion() {
        let g = sample_graph();
        let mut executor = GraphExecutor::new(g);

        for node_id in ["start", "analyze", "fix", "review", "end"] {
            executor.start_node(node_id);
            executor.complete_node(node_id, None, Duration::from_millis(100));
        }

        assert!(executor.is_complete());
        assert!(!executor.has_failures());

        let summary = executor.summary();
        assert_eq!(summary.total, 5);
        assert_eq!(summary.completed, 5);
        assert_eq!(summary.failed, 0);
    }

    #[test]
    fn test_executor_failure_with_retry() {
        let mut g = TaskGraph::new("retry-test");
        let mut n = prompt_node("task", "Task", "do something");
        n.max_retries = 2;
        g.add_node(n);
        g.set_entry_point("task");

        let mut executor = GraphExecutor::new(g);

        // First failure — should go back to Pending for retry
        executor.start_node("task");
        executor.fail_node("task", "Error 1".into(), Duration::from_millis(100));
        assert_eq!(executor.node_state("task").unwrap().status, NodeStatus::Pending);
        assert_eq!(executor.node_state("task").unwrap().retries, 1);

        // Second failure — still under max_retries
        executor.start_node("task");
        executor.fail_node("task", "Error 2".into(), Duration::from_millis(100));
        assert_eq!(executor.node_state("task").unwrap().status, NodeStatus::Pending);
        assert_eq!(executor.node_state("task").unwrap().retries, 2);

        // Third failure — exceeds max_retries, marked Failed
        executor.start_node("task");
        executor.fail_node("task", "Error 3".into(), Duration::from_millis(100));
        assert_eq!(executor.node_state("task").unwrap().status, NodeStatus::Failed);
    }

    #[test]
    fn test_mermaid_export() {
        let g = sample_graph();
        let mermaid = g.to_mermaid();
        assert!(mermaid.contains("graph TD"));
        assert!(mermaid.contains("start"));
        assert!(mermaid.contains("end"));
        assert!(mermaid.contains("-->"));
    }

    #[test]
    fn test_display() {
        let g = sample_graph();
        let display = g.to_string();
        assert!(display.contains("test-graph"));
        assert!(display.contains("5 nodes"));
    }

    #[test]
    fn test_serialization() {
        let g = sample_graph();
        let json = serde_json::to_string(&g).unwrap();
        let deserialized: TaskGraph = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.node_count(), g.node_count());
        assert_eq!(deserialized.edge_count(), g.edge_count());
    }

    #[test]
    fn test_summary_display() {
        let summary = GraphExecutionSummary {
            total: 10,
            completed: 7,
            failed: 1,
            skipped: 2,
            pending: 0,
            running: 0,
            total_duration: Duration::from_secs(45),
        };
        let s = summary.to_string();
        assert!(s.contains("7/10"));
        assert!(s.contains("1 failed"));
    }
}
