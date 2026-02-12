use crate::agents::ExtensionConfig;
use crate::providers::base::Provider;
use std::env;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Default maximum number of turns for task execution
pub const DEFAULT_SUBAGENT_MAX_TURNS: usize = 25;

/// Environment variable name for configuring max turns
pub const GOOSE_SUBAGENT_MAX_TURNS_ENV_VAR: &str = "GOOSE_SUBAGENT_MAX_TURNS";

/// Default maximum nesting depth for subagent spawning.
/// Subagents can spawn their own subagents up to this depth.
/// This prevents infinite recursion while allowing multi-level delegation
/// needed by orchestrator and swarm cores.
pub const DEFAULT_MAX_NESTING_DEPTH: u32 = 10;

/// Environment variable name for configuring max nesting depth
pub const GOOSE_MAX_NESTING_DEPTH_ENV_VAR: &str = "GOOSE_MAX_NESTING_DEPTH";

/// Configuration for task execution with all necessary dependencies
#[derive(Clone)]
pub struct TaskConfig {
    pub provider: Arc<dyn Provider>,
    pub parent_session_id: String,
    pub parent_working_dir: PathBuf,
    pub extensions: Vec<ExtensionConfig>,
    pub max_turns: Option<usize>,
    /// Current nesting depth of this subagent (0 = top-level agent).
    /// Incremented each time a subagent spawns another subagent.
    pub nesting_depth: u32,
    /// Maximum allowed nesting depth. Configurable via GOOSE_MAX_NESTING_DEPTH env var.
    pub max_nesting_depth: u32,
}

impl fmt::Debug for TaskConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TaskConfig")
            .field("provider", &"<dyn Provider>")
            .field("parent_session_id", &self.parent_session_id)
            .field("parent_working_dir", &self.parent_working_dir)
            .field("max_turns", &self.max_turns)
            .field("nesting_depth", &self.nesting_depth)
            .field("max_nesting_depth", &self.max_nesting_depth)
            .field("extensions", &self.extensions)
            .finish()
    }
}

impl TaskConfig {
    pub fn new(
        provider: Arc<dyn Provider>,
        parent_session_id: &str,
        parent_working_dir: &Path,
        extensions: Vec<ExtensionConfig>,
    ) -> Self {
        let max_nesting_depth = env::var(GOOSE_MAX_NESTING_DEPTH_ENV_VAR)
            .ok()
            .and_then(|val| val.parse::<u32>().ok())
            .unwrap_or(DEFAULT_MAX_NESTING_DEPTH);

        Self {
            provider,
            parent_session_id: parent_session_id.to_owned(),
            parent_working_dir: parent_working_dir.to_owned(),
            extensions,
            max_turns: Some(
                env::var(GOOSE_SUBAGENT_MAX_TURNS_ENV_VAR)
                    .ok()
                    .and_then(|val| val.parse::<usize>().ok())
                    .unwrap_or(DEFAULT_SUBAGENT_MAX_TURNS),
            ),
            nesting_depth: 0,
            max_nesting_depth,
        }
    }

    pub fn with_max_turns(mut self, max_turns: Option<usize>) -> Self {
        if let Some(turns) = max_turns {
            self.max_turns = Some(turns);
        }
        self
    }

    /// Returns true if a subagent at this depth is allowed to spawn another subagent.
    pub fn can_nest(&self) -> bool {
        self.nesting_depth < self.max_nesting_depth
    }

    /// Create a new TaskConfig for a child subagent with incremented nesting depth.
    /// Inherits max_nesting_depth from the parent.
    pub fn for_child(&self) -> Self {
        let mut child = self.clone();
        child.nesting_depth = self.nesting_depth + 1;
        child
    }
}
