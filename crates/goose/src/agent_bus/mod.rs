//! # Agent Bus — inter-agent communication module
//!
//! This module provides the infrastructure for agents to communicate with each
//! other.  It is organised into five sub-modules:
//!
//! | Module          | Purpose                                              |
//! |-----------------|------------------------------------------------------|
//! | `messages`      | Message types, payloads, identifiers, and priorities |
//! | `registry`      | SQLite-backed agent registration and status tracking |
//! | `router`        | Priority-aware message routing and mailboxes         |
//! | `wake_policy`   | Automatic wake-up policy for offline agents          |
//! | `shared_memory` | SQLite-backed namespaced key-value store             |

pub mod messages;
pub mod registry;
pub mod router;
pub mod shared_memory;
pub mod wake_policy;

// Re-export the most commonly used types at the module root for convenience.
pub use messages::{
    AgentId, AgentMessage, AgentRole, AgentStatus, Artifact, ArtifactType, FileDiff,
    InsightCategory, MessageChannel, MessagePayload, MessageTarget, Plan, PlanStep, Priority,
    TaskResult, TaskSpec, TaskStatus, TeamId, TestDetail,
};
pub use registry::{AgentRecord, AgentRegistry};
pub use router::{MessageRouter, RouteOutcome};
pub use shared_memory::{MemoryEntry, Namespaces, SharedMemory};
pub use wake_policy::{WakeDecision, WakeHistory, WakePolicy};
