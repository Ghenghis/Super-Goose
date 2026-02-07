//! Player Agent - Executes tasks with full capabilities
//!
//! The Player agent is the "doer" in the Coach/Player adversarial system.
//! It has full access to all tools and executes tasks, but all work is
//! reviewed by the Coach before reaching the user.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{debug, info};

/// Configuration for Player agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerConfig {
    /// Provider to use for Player (e.g., "openai", "anthropic")
    pub provider: String,
    /// Model to use for Player (e.g., "gpt-4", "claude-3-5-sonnet")
    pub model: String,
    /// Temperature for Player responses (0.0 to 1.0)
    pub temperature: f32,
    /// Maximum tokens for Player responses
    pub max_tokens: usize,
    /// Allow Player to use all available tools
    pub full_tool_access: bool,
    /// Player's system prompt
    pub system_prompt: String,
}

impl Default for PlayerConfig {
    fn default() -> Self {
        Self {
            provider: "anthropic".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: 0.7,
            max_tokens: 8192,
            full_tool_access: true,
            system_prompt: "You are a Player agent in an adversarial system. \
                Execute tasks thoroughly and efficiently. Your work will be \
                reviewed by a Coach agent before reaching the user. Focus on \
                implementation quality and completeness.".to_string(),
        }
    }
}

/// Result of Player agent execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerResult {
    /// Whether the task was completed successfully
    pub success: bool,
    /// Output from the Player agent
    pub output: String,
    /// Files created or modified
    pub files_changed: Vec<PathBuf>,
    /// Commands executed
    pub commands_executed: Vec<String>,
    /// Tools used during execution
    pub tools_used: Vec<String>,
    /// Execution time in milliseconds
    pub duration_ms: u64,
    /// Metadata about the execution
    pub metadata: HashMap<String, String>,
}

impl PlayerResult {
    /// Create a new successful result
    pub fn success(output: impl Into<String>) -> Self {
        Self {
            success: true,
            output: output.into(),
            files_changed: Vec::new(),
            commands_executed: Vec::new(),
            tools_used: Vec::new(),
            duration_ms: 0,
            metadata: HashMap::new(),
        }
    }

    /// Create a new failed result
    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            success: false,
            output: error.into(),
            files_changed: Vec::new(),
            commands_executed: Vec::new(),
            tools_used: Vec::new(),
            duration_ms: 0,
            metadata: HashMap::new(),
        }
    }

    /// Add a file change record
    pub fn with_file_change(mut self, path: PathBuf) -> Self {
        self.files_changed.push(path);
        self
    }

    /// Add a command execution record
    pub fn with_command(mut self, command: impl Into<String>) -> Self {
        self.commands_executed.push(command.into());
        self
    }

    /// Add a tool usage record
    pub fn with_tool(mut self, tool: impl Into<String>) -> Self {
        self.tools_used.push(tool.into());
        self
    }

    /// Set execution duration
    pub fn with_duration(mut self, duration_ms: u64) -> Self {
        self.duration_ms = duration_ms;
        self
    }

    /// Add metadata entry
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}

/// Player agent that executes tasks
#[derive(Debug)]
pub struct PlayerAgent {
    config: PlayerConfig,
    task_count: usize,
}

impl PlayerAgent {
    /// Create a new Player agent with default configuration
    pub fn new() -> Self {
        Self {
            config: PlayerConfig::default(),
            task_count: 0,
        }
    }

    /// Create a new Player agent with custom configuration
    pub fn with_config(config: PlayerConfig) -> Self {
        Self {
            config,
            task_count: 0,
        }
    }

    /// Get the current configuration
    pub fn config(&self) -> &PlayerConfig {
        &self.config
    }

    /// Update the configuration
    pub fn set_config(&mut self, config: PlayerConfig) {
        self.config = config;
    }

    /// Get the number of tasks executed
    pub fn task_count(&self) -> usize {
        self.task_count
    }

    /// Execute a task
    pub async fn execute_task(&mut self, task_description: &str) -> Result<PlayerResult> {
        let start_time = std::time::Instant::now();

        info!(
            task = %task_description,
            provider = %self.config.provider,
            model = %self.config.model,
            "Player agent executing task"
        );

        // Placeholder implementation - would integrate with actual LLM provider
        let result = self.execute_task_internal(task_description).await?;

        let duration_ms = start_time.elapsed().as_millis() as u64;
        self.task_count += 1;

        debug!(
            task_count = self.task_count,
            duration_ms = duration_ms,
            success = result.success,
            "Player task execution complete"
        );

        Ok(result.with_duration(duration_ms))
    }

    /// Internal task execution logic (placeholder)
    async fn execute_task_internal(&self, task_description: &str) -> Result<PlayerResult> {
        // This is a placeholder that would integrate with the actual LLM provider
        // In production, this would:
        // 1. Format the task with the system prompt
        // 2. Call the LLM provider (OpenAI, Anthropic, etc.)
        // 3. Execute any tool calls
        // 4. Track file changes and command executions
        // 5. Return comprehensive results

        if task_description.is_empty() {
            return Ok(PlayerResult::failure("Task description is empty"));
        }

        // Simulate execution
        debug!(
            provider = %self.config.provider,
            model = %self.config.model,
            "Simulating task execution"
        );

        Ok(PlayerResult::success("Task completed successfully")
            .with_metadata("task_description", task_description)
            .with_metadata("provider", &self.config.provider)
            .with_metadata("model", &self.config.model))
    }

    /// Apply feedback from Coach to improve future performance
    pub fn apply_feedback(&mut self, feedback: &str) -> Result<()> {
        info!(
            feedback_length = feedback.len(),
            "Player agent applying Coach feedback"
        );

        // Placeholder: In production, this would:
        // 1. Analyze feedback patterns
        // 2. Update system prompt to address common issues
        // 3. Adjust temperature/parameters based on feedback
        // 4. Store feedback for EvoAgentX self-improvement

        debug!("Feedback applied to Player configuration");
        Ok(())
    }

    /// Reset task counter
    pub fn reset_stats(&mut self) {
        self.task_count = 0;
    }
}

impl Default for PlayerAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_player_config_default() {
        let config = PlayerConfig::default();
        assert_eq!(config.provider, "anthropic");
        assert_eq!(config.model, "claude-3-5-sonnet-20241022");
        assert_eq!(config.temperature, 0.7);
        assert!(config.full_tool_access);
    }

    #[test]
    fn test_player_result_success() {
        let result = PlayerResult::success("Task completed");
        assert!(result.success);
        assert_eq!(result.output, "Task completed");
        assert_eq!(result.files_changed.len(), 0);
    }

    #[test]
    fn test_player_result_failure() {
        let result = PlayerResult::failure("Task failed");
        assert!(!result.success);
        assert_eq!(result.output, "Task failed");
    }

    #[test]
    fn test_player_result_builder() {
        let result = PlayerResult::success("Done")
            .with_file_change(PathBuf::from("test.rs"))
            .with_command("cargo build")
            .with_tool("Write")
            .with_duration(1000)
            .with_metadata("key", "value");

        assert!(result.success);
        assert_eq!(result.files_changed.len(), 1);
        assert_eq!(result.commands_executed.len(), 1);
        assert_eq!(result.tools_used.len(), 1);
        assert_eq!(result.duration_ms, 1000);
        assert_eq!(result.metadata.get("key").unwrap(), "value");
    }

    #[test]
    fn test_player_agent_creation() {
        let agent = PlayerAgent::new();
        assert_eq!(agent.task_count(), 0);
        assert_eq!(agent.config().provider, "anthropic");
    }

    #[test]
    fn test_player_agent_custom_config() {
        let config = PlayerConfig {
            provider: "openai".to_string(),
            model: "gpt-4".to_string(),
            temperature: 0.5,
            max_tokens: 4096,
            full_tool_access: false,
            system_prompt: "Custom prompt".to_string(),
        };

        let agent = PlayerAgent::with_config(config.clone());
        assert_eq!(agent.config().provider, "openai");
        assert_eq!(agent.config().model, "gpt-4");
        assert_eq!(agent.config().temperature, 0.5);
    }

    #[tokio::test]
    async fn test_player_execute_task() {
        let mut agent = PlayerAgent::new();
        let result = agent.execute_task("Write a test function").await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.success);
        assert_eq!(agent.task_count(), 1);
    }

    #[tokio::test]
    async fn test_player_execute_empty_task() {
        let mut agent = PlayerAgent::new();
        let result = agent.execute_task("").await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(!result.success);
        assert_eq!(result.output, "Task description is empty");
    }

    #[tokio::test]
    async fn test_player_task_count() {
        let mut agent = PlayerAgent::new();

        agent.execute_task("Task 1").await.unwrap();
        assert_eq!(agent.task_count(), 1);

        agent.execute_task("Task 2").await.unwrap();
        assert_eq!(agent.task_count(), 2);

        agent.reset_stats();
        assert_eq!(agent.task_count(), 0);
    }

    #[test]
    fn test_player_apply_feedback() {
        let mut agent = PlayerAgent::new();
        let result = agent.apply_feedback("Great work, but add more error handling");
        assert!(result.is_ok());
    }

    #[test]
    fn test_player_config_update() {
        let mut agent = PlayerAgent::new();

        let new_config = PlayerConfig {
            provider: "openrouter".to_string(),
            model: "anthropic/claude-3.5-sonnet".to_string(),
            temperature: 0.3,
            max_tokens: 16384,
            full_tool_access: true,
            system_prompt: "New prompt".to_string(),
        };

        agent.set_config(new_config);
        assert_eq!(agent.config().provider, "openrouter");
        assert_eq!(agent.config().temperature, 0.3);
    }
}
