use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Identity types
// ---------------------------------------------------------------------------

/// Unique identifier for an agent instance.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AgentId(pub String);

impl AgentId {
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }
}

impl std::fmt::Display for AgentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Identifier for a team of agents.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TeamId(pub String);

impl TeamId {
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }
}

// ---------------------------------------------------------------------------
// Agent role
// ---------------------------------------------------------------------------

/// Well-known agent roles used for role-based routing.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgentRole {
    Coder,
    Reviewer,
    Tester,
    Planner,
    Researcher,
    Builder,
    Monitor,
    Coach,
    Custom(String),
}

// ---------------------------------------------------------------------------
// Agent status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStatus {
    Online,
    Offline,
    Busy,
    Error,
    Maintenance,
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/// The top-level message passed between agents on the bus.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: Uuid,
    pub from: AgentId,
    pub to: MessageTarget,
    pub channel: MessageChannel,
    pub priority: Priority,
    pub payload: MessagePayload,
    /// If this message is a reply, the id of the original message.
    pub reply_to: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub delivered: bool,
    pub acknowledged: bool,
}

impl AgentMessage {
    /// Create a new message with sensible defaults.
    pub fn new(
        from: AgentId,
        to: MessageTarget,
        channel: MessageChannel,
        payload: MessagePayload,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            from,
            to,
            channel,
            priority: Priority::Normal,
            payload,
            reply_to: None,
            created_at: Utc::now(),
            expires_at: None,
            delivered: false,
            acknowledged: false,
        }
    }

    pub fn with_priority(mut self, priority: Priority) -> Self {
        self.priority = priority;
        self
    }

    pub fn with_reply_to(mut self, reply_to: Uuid) -> Self {
        self.reply_to = Some(reply_to);
        self
    }

    pub fn with_expiry(mut self, expires_at: DateTime<Utc>) -> Self {
        self.expires_at = Some(expires_at);
        self
    }

    /// Returns true when the message has passed its expiry time.
    pub fn is_expired(&self) -> bool {
        self.expires_at.map_or(false, |exp| Utc::now() > exp)
    }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageTarget {
    /// Send to a specific agent.
    Agent(AgentId),
    /// Send to any online agent that has the given role.
    Role(AgentRole),
    /// Send to every agent on a team.
    Team(TeamId),
    /// Send to every online agent.
    Broadcast,
    /// Send to all subscribers of a named topic.
    Topic(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageChannel {
    Direct,
    Team,
    Broadcast,
    System,
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Priority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessagePayload {
    TaskAssignment {
        task: TaskSpec,
        deadline: Option<DateTime<Utc>>,
    },
    TaskUpdate {
        task_id: Uuid,
        status: TaskStatus,
        details: String,
    },
    TaskComplete {
        task_id: Uuid,
        result: TaskResult,
        artifacts: Vec<Artifact>,
    },
    CodeChange {
        files: Vec<FileDiff>,
        reason: String,
    },
    TestResult {
        suite: String,
        passed: u32,
        failed: u32,
        details: Vec<TestDetail>,
    },
    Insight {
        category: InsightCategory,
        content: String,
        confidence: f32,
    },
    MemoryShare {
        key: String,
        value: serde_json::Value,
    },
    PlanProposal {
        plan: Plan,
        needs_approval: bool,
    },
    StatusRequest,
    StatusResponse {
        status: AgentStatus,
        current_task: Option<String>,
    },
    WakeUp {
        reason: String,
    },
    GoingOffline {
        reason: String,
    },
    ComingOnline {
        capabilities: Vec<String>,
    },
    Heartbeat {
        load: f32,
    },
    BuildStarting {
        version: String,
    },
    BuildComplete {
        version: String,
        success: bool,
    },
    Custom {
        event_type: String,
        data: serde_json::Value,
    },
}

// ---------------------------------------------------------------------------
// Supporting types referenced by payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub required_role: Option<AgentRole>,
    pub priority: Priority,
    pub tags: Vec<String>,
}

impl TaskSpec {
    pub fn new(title: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            title: title.into(),
            description: description.into(),
            required_role: None,
            priority: Priority::Normal,
            tags: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Blocked,
    Complete,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub success: bool,
    pub summary: String,
    pub output: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub name: String,
    pub artifact_type: ArtifactType,
    pub path: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArtifactType {
    File,
    Diff,
    Log,
    Report,
    Binary,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub diff: String,
    pub added_lines: u32,
    pub removed_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestDetail {
    pub name: String,
    pub passed: bool,
    pub duration_ms: u64,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum InsightCategory {
    Performance,
    Security,
    Quality,
    Architecture,
    Testing,
    Documentation,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: Uuid,
    pub title: String,
    pub steps: Vec<PlanStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub order: u32,
    pub description: String,
    pub assigned_to: Option<AgentId>,
    pub estimated_duration_secs: Option<u64>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_message_round_trip_json() {
        let msg = AgentMessage::new(
            AgentId::new("coder-1"),
            MessageTarget::Agent(AgentId::new("reviewer-1")),
            MessageChannel::Direct,
            MessagePayload::TaskAssignment {
                task: TaskSpec::new("Implement feature X", "Add the X module"),
                deadline: None,
            },
        )
        .with_priority(Priority::High);

        let json = serde_json::to_string_pretty(&msg).unwrap();
        let decoded: AgentMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.id, msg.id);
        assert_eq!(decoded.from.0, "coder-1");
        assert_eq!(decoded.priority, Priority::High);
        assert!(!decoded.delivered);
    }

    #[test]
    fn broadcast_payload_round_trip() {
        let msg = AgentMessage::new(
            AgentId::new("monitor"),
            MessageTarget::Broadcast,
            MessageChannel::Broadcast,
            MessagePayload::Heartbeat { load: 0.42 },
        );

        let json = serde_json::to_string(&msg).unwrap();
        let decoded: AgentMessage = serde_json::from_str(&json).unwrap();

        if let MessagePayload::Heartbeat { load } = decoded.payload {
            assert!((load - 0.42).abs() < f32::EPSILON);
        } else {
            panic!("wrong payload variant");
        }
    }

    #[test]
    fn custom_payload_round_trip() {
        let data = serde_json::json!({ "key": "value", "nested": [1, 2, 3] });
        let msg = AgentMessage::new(
            AgentId::new("a"),
            MessageTarget::Topic("builds".into()),
            MessageChannel::System,
            MessagePayload::Custom {
                event_type: "ci.complete".into(),
                data: data.clone(),
            },
        );

        let json = serde_json::to_string(&msg).unwrap();
        let decoded: AgentMessage = serde_json::from_str(&json).unwrap();

        if let MessagePayload::Custom { event_type, data: d } = decoded.payload {
            assert_eq!(event_type, "ci.complete");
            assert_eq!(d, data);
        } else {
            panic!("wrong payload variant");
        }
    }

    #[test]
    fn test_result_payload() {
        let msg = AgentMessage::new(
            AgentId::new("tester"),
            MessageTarget::Role(AgentRole::Reviewer),
            MessageChannel::Team,
            MessagePayload::TestResult {
                suite: "unit".into(),
                passed: 100,
                failed: 2,
                details: vec![TestDetail {
                    name: "test_foo".into(),
                    passed: false,
                    duration_ms: 42,
                    message: Some("assertion failed".into()),
                }],
            },
        );

        let json = serde_json::to_string(&msg).unwrap();
        let decoded: AgentMessage = serde_json::from_str(&json).unwrap();

        if let MessagePayload::TestResult { passed, failed, details, .. } = decoded.payload {
            assert_eq!(passed, 100);
            assert_eq!(failed, 2);
            assert_eq!(details.len(), 1);
            assert_eq!(details[0].name, "test_foo");
        } else {
            panic!("wrong payload variant");
        }
    }

    #[test]
    fn priority_ordering() {
        assert!(Priority::Critical > Priority::High);
        assert!(Priority::High > Priority::Normal);
        assert!(Priority::Normal > Priority::Low);
    }

    #[test]
    fn message_expiry() {
        let mut msg = AgentMessage::new(
            AgentId::new("a"),
            MessageTarget::Broadcast,
            MessageChannel::System,
            MessagePayload::StatusRequest,
        );

        // Not expired by default.
        assert!(!msg.is_expired());

        // Expired in the past.
        msg.expires_at = Some(Utc::now() - chrono::Duration::seconds(10));
        assert!(msg.is_expired());

        // Not expired in the future.
        msg.expires_at = Some(Utc::now() + chrono::Duration::seconds(3600));
        assert!(!msg.is_expired());
    }

    #[test]
    fn all_payload_variants_serialize() {
        // Make sure every variant can round-trip without panic.
        let payloads: Vec<MessagePayload> = vec![
            MessagePayload::TaskAssignment {
                task: TaskSpec::new("t", "d"),
                deadline: Some(Utc::now()),
            },
            MessagePayload::TaskUpdate {
                task_id: Uuid::new_v4(),
                status: TaskStatus::InProgress,
                details: "working".into(),
            },
            MessagePayload::TaskComplete {
                task_id: Uuid::new_v4(),
                result: TaskResult {
                    success: true,
                    summary: "done".into(),
                    output: None,
                },
                artifacts: vec![Artifact {
                    name: "output.log".into(),
                    artifact_type: ArtifactType::Log,
                    path: Some("/tmp/output.log".into()),
                    content: None,
                }],
            },
            MessagePayload::CodeChange {
                files: vec![FileDiff {
                    path: "src/main.rs".into(),
                    diff: "+line".into(),
                    added_lines: 1,
                    removed_lines: 0,
                }],
                reason: "feature".into(),
            },
            MessagePayload::Insight {
                category: InsightCategory::Security,
                content: "SQL injection risk".into(),
                confidence: 0.95,
            },
            MessagePayload::MemoryShare {
                key: "context".into(),
                value: serde_json::json!({"a": 1}),
            },
            MessagePayload::PlanProposal {
                plan: Plan {
                    id: Uuid::new_v4(),
                    title: "Refactor".into(),
                    steps: vec![PlanStep {
                        order: 1,
                        description: "Extract module".into(),
                        assigned_to: None,
                        estimated_duration_secs: Some(600),
                    }],
                },
                needs_approval: true,
            },
            MessagePayload::StatusRequest,
            MessagePayload::StatusResponse {
                status: AgentStatus::Online,
                current_task: Some("coding".into()),
            },
            MessagePayload::WakeUp { reason: "urgent task".into() },
            MessagePayload::GoingOffline { reason: "shutdown".into() },
            MessagePayload::ComingOnline { capabilities: vec!["code".into(), "test".into()] },
            MessagePayload::Heartbeat { load: 0.5 },
            MessagePayload::BuildStarting { version: "1.0.0".into() },
            MessagePayload::BuildComplete { version: "1.0.0".into(), success: true },
            MessagePayload::Custom {
                event_type: "custom".into(),
                data: serde_json::Value::Null,
            },
        ];

        for payload in payloads {
            let msg = AgentMessage::new(
                AgentId::new("test"),
                MessageTarget::Broadcast,
                MessageChannel::System,
                payload,
            );
            let json = serde_json::to_string(&msg).unwrap();
            let _decoded: AgentMessage = serde_json::from_str(&json).unwrap();
        }
    }
}
