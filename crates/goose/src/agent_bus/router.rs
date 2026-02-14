use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use super::messages::{
    AgentId, AgentMessage, AgentRole, AgentStatus, MessageTarget,
};
use super::registry::AgentRegistry;

// ---------------------------------------------------------------------------
// Mailbox — per-agent queue
// ---------------------------------------------------------------------------

/// In-memory mailbox for a single agent.
#[derive(Debug, Default)]
struct Mailbox {
    /// Messages waiting to be consumed, ordered by priority (highest first).
    queue: VecDeque<AgentMessage>,
}

impl Mailbox {
    fn push(&mut self, msg: AgentMessage) {
        // Insert in priority-sorted order (highest priority at front).
        let pos = self
            .queue
            .iter()
            .position(|m| m.priority < msg.priority)
            .unwrap_or(self.queue.len());
        self.queue.insert(pos, msg);
    }

    fn pop(&mut self) -> Option<AgentMessage> {
        self.queue.pop_front()
    }

    fn drain_all(&mut self) -> Vec<AgentMessage> {
        self.queue.drain(..).collect()
    }

    fn len(&self) -> usize {
        self.queue.len()
    }
}

// ---------------------------------------------------------------------------
// Topic subscriptions
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct TopicSubscriptions {
    /// topic_name -> set of subscribed agent ids
    subs: HashMap<String, Vec<AgentId>>,
}

impl TopicSubscriptions {
    fn subscribe(&mut self, topic: &str, agent: AgentId) {
        let entry = self.subs.entry(topic.to_string()).or_default();
        if !entry.iter().any(|a| a.0 == agent.0) {
            entry.push(agent);
        }
    }

    fn unsubscribe(&mut self, topic: &str, agent: &AgentId) {
        if let Some(entry) = self.subs.get_mut(topic) {
            entry.retain(|a| a.0 != agent.0);
        }
    }

    fn subscribers(&self, topic: &str) -> Vec<AgentId> {
        self.subs.get(topic).cloned().unwrap_or_default()
    }
}

// ---------------------------------------------------------------------------
// RouteOutcome — result of routing one message
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct RouteOutcome {
    pub delivered_to: Vec<AgentId>,
    pub queued_for: Vec<AgentId>,
    pub dropped: bool,
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// MessageRouter
// ---------------------------------------------------------------------------

/// Routes `AgentMessage`s to their intended recipients.
///
/// Online agents get messages delivered immediately (placed in their mailbox).
/// Offline agents have messages queued until they come back online or the
/// message expires.
pub struct MessageRouter {
    mailboxes: Mutex<HashMap<String, Mailbox>>,
    topics: Mutex<TopicSubscriptions>,
}

impl MessageRouter {
    pub fn new() -> Self {
        Self {
            mailboxes: Mutex::new(HashMap::new()),
            topics: Mutex::new(TopicSubscriptions::default()),
        }
    }

    // -- topic management ---------------------------------------------------

    pub fn subscribe(&self, topic: &str, agent: AgentId) {
        let mut topics = self.topics.lock().unwrap();
        topics.subscribe(topic, agent);
    }

    pub fn unsubscribe(&self, topic: &str, agent: &AgentId) {
        let mut topics = self.topics.lock().unwrap();
        topics.unsubscribe(topic, agent);
    }

    // -- routing ------------------------------------------------------------

    /// Route a message based on its `MessageTarget`.
    ///
    /// The registry is used to look up agent statuses and resolve role-based
    /// targets.
    pub fn route(
        &self,
        msg: AgentMessage,
        registry: &AgentRegistry,
    ) -> anyhow::Result<RouteOutcome> {
        // Drop expired messages immediately.
        if msg.is_expired() {
            return Ok(RouteOutcome {
                delivered_to: vec![],
                queued_for: vec![],
                dropped: true,
                reason: Some("message expired".into()),
            });
        }

        match &msg.to {
            MessageTarget::Agent(target_id) => {
                self.route_to_agent(&msg, target_id, registry)
            }
            MessageTarget::Role(role) => {
                self.route_to_role(&msg, role, registry)
            }
            MessageTarget::Team(team_id) => {
                let agents = registry.agents_by_team(team_id)?;
                self.route_to_many(&msg, &agents.iter().map(|a| a.id.clone()).collect::<Vec<_>>(), registry)
            }
            MessageTarget::Broadcast => {
                let agents = registry.list_agents(None)?;
                // Exclude sender from broadcast.
                let targets: Vec<AgentId> = agents
                    .into_iter()
                    .filter(|a| a.id.0 != msg.from.0)
                    .map(|a| a.id)
                    .collect();
                self.route_to_many(&msg, &targets, registry)
            }
            MessageTarget::Topic(topic) => {
                let subs = {
                    let topics = self.topics.lock().unwrap();
                    topics.subscribers(topic)
                };
                self.route_to_many(&msg, &subs, registry)
            }
        }
    }

    // -- delivery -----------------------------------------------------------

    /// Retrieve the next message for an agent (highest priority first).
    pub fn receive(&self, agent: &AgentId) -> Option<AgentMessage> {
        let mut mailboxes = self.mailboxes.lock().unwrap();
        mailboxes.get_mut(&agent.0).and_then(|mb| mb.pop())
    }

    /// Drain all pending messages for an agent.
    pub fn receive_all(&self, agent: &AgentId) -> Vec<AgentMessage> {
        let mut mailboxes = self.mailboxes.lock().unwrap();
        mailboxes
            .get_mut(&agent.0)
            .map(|mb| mb.drain_all())
            .unwrap_or_default()
    }

    /// Number of pending messages for an agent.
    pub fn pending_count(&self, agent: &AgentId) -> usize {
        let mailboxes = self.mailboxes.lock().unwrap();
        mailboxes.get(&agent.0).map_or(0, |mb| mb.len())
    }

    // -- internal helpers ---------------------------------------------------

    fn route_to_agent(
        &self,
        msg: &AgentMessage,
        target: &AgentId,
        registry: &AgentRegistry,
    ) -> anyhow::Result<RouteOutcome> {
        let agent = registry.get_agent(target)?;
        let mut delivered_to = Vec::new();
        let mut queued_for = Vec::new();

        match agent {
            Some(rec) if rec.status == AgentStatus::Online || rec.status == AgentStatus::Busy => {
                self.enqueue(target, msg.clone());
                delivered_to.push(target.clone());
            }
            Some(_) => {
                // Agent is offline / error / maintenance — queue the message.
                self.enqueue(target, msg.clone());
                queued_for.push(target.clone());
            }
            None => {
                return Ok(RouteOutcome {
                    delivered_to: vec![],
                    queued_for: vec![],
                    dropped: true,
                    reason: Some(format!("agent {} not found", target.0)),
                });
            }
        }

        Ok(RouteOutcome {
            delivered_to,
            queued_for,
            dropped: false,
            reason: None,
        })
    }

    fn route_to_role(
        &self,
        msg: &AgentMessage,
        role: &AgentRole,
        registry: &AgentRegistry,
    ) -> anyhow::Result<RouteOutcome> {
        let candidates = registry.agents_by_role(role)?;
        // Pick the first online agent (simple round-robin could be added later).
        if let Some(online) = candidates.iter().find(|a| a.status == AgentStatus::Online) {
            self.enqueue(&online.id, msg.clone());
            return Ok(RouteOutcome {
                delivered_to: vec![online.id.clone()],
                queued_for: vec![],
                dropped: false,
                reason: None,
            });
        }
        // No online agent with this role — queue for the first one.
        if let Some(first) = candidates.first() {
            self.enqueue(&first.id, msg.clone());
            return Ok(RouteOutcome {
                delivered_to: vec![],
                queued_for: vec![first.id.clone()],
                dropped: false,
                reason: None,
            });
        }
        Ok(RouteOutcome {
            delivered_to: vec![],
            queued_for: vec![],
            dropped: true,
            reason: Some(format!("no agents with role {:?}", role)),
        })
    }

    fn route_to_many(
        &self,
        msg: &AgentMessage,
        targets: &[AgentId],
        registry: &AgentRegistry,
    ) -> anyhow::Result<RouteOutcome> {
        let mut delivered_to = Vec::new();
        let mut queued_for = Vec::new();

        for target in targets {
            if let Some(rec) = registry.get_agent(target)? {
                self.enqueue(target, msg.clone());
                if rec.status == AgentStatus::Online || rec.status == AgentStatus::Busy {
                    delivered_to.push(target.clone());
                } else {
                    queued_for.push(target.clone());
                }
            }
        }

        let dropped = delivered_to.is_empty() && queued_for.is_empty();
        let reason = if dropped {
            Some("no valid targets".into())
        } else {
            None
        };

        Ok(RouteOutcome {
            delivered_to,
            queued_for,
            dropped,
            reason,
        })
    }

    fn enqueue(&self, agent: &AgentId, msg: AgentMessage) {
        let mut mailboxes = self.mailboxes.lock().unwrap();
        mailboxes
            .entry(agent.0.clone())
            .or_default()
            .push(msg);
    }
}

impl Default for MessageRouter {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_bus::messages::*;
    use crate::agent_bus::registry::{AgentRecord, AgentRegistry};
    use chrono::Utc;

    fn setup() -> (AgentRegistry, MessageRouter) {
        let reg = AgentRegistry::in_memory().unwrap();
        let router = MessageRouter::new();
        (reg, router)
    }

    fn register(reg: &AgentRegistry, id: &str, role: AgentRole, status: AgentStatus) {
        reg.register_agent(&AgentRecord {
            id: AgentId::new(id),
            display_name: id.into(),
            role,
            team: None,
            status,
            capabilities: vec![],
            registered_at: Utc::now(),
            last_heartbeat: None,
            metadata: serde_json::json!({}),
        })
        .unwrap();
    }

    fn make_msg(from: &str, to: MessageTarget) -> AgentMessage {
        AgentMessage::new(
            AgentId::new(from),
            to,
            MessageChannel::Direct,
            MessagePayload::StatusRequest,
        )
    }

    #[test]
    fn direct_message_to_online_agent() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);

        let msg = make_msg("b", MessageTarget::Agent(AgentId::new("a")));
        let outcome = router.route(msg, &reg).unwrap();

        assert_eq!(outcome.delivered_to.len(), 1);
        assert!(!outcome.dropped);
        assert_eq!(router.pending_count(&AgentId::new("a")), 1);
    }

    #[test]
    fn direct_message_to_offline_agent_is_queued() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Offline);

        let msg = make_msg("b", MessageTarget::Agent(AgentId::new("a")));
        let outcome = router.route(msg, &reg).unwrap();

        assert!(outcome.delivered_to.is_empty());
        assert_eq!(outcome.queued_for.len(), 1);
        assert!(!outcome.dropped);
        assert_eq!(router.pending_count(&AgentId::new("a")), 1);
    }

    #[test]
    fn direct_message_to_unknown_agent_is_dropped() {
        let (reg, router) = setup();

        let msg = make_msg("b", MessageTarget::Agent(AgentId::new("ghost")));
        let outcome = router.route(msg, &reg).unwrap();

        assert!(outcome.dropped);
        assert!(outcome.reason.is_some());
    }

    #[test]
    fn role_based_routing() {
        let (reg, router) = setup();
        register(&reg, "r1", AgentRole::Reviewer, AgentStatus::Online);
        register(&reg, "r2", AgentRole::Reviewer, AgentStatus::Offline);

        let msg = make_msg("coder", MessageTarget::Role(AgentRole::Reviewer));
        let outcome = router.route(msg, &reg).unwrap();

        // Should pick the online reviewer.
        assert_eq!(outcome.delivered_to.len(), 1);
        assert_eq!(outcome.delivered_to[0].0, "r1");
    }

    #[test]
    fn broadcast_reaches_all_except_sender() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);
        register(&reg, "b", AgentRole::Tester, AgentStatus::Online);
        register(&reg, "c", AgentRole::Reviewer, AgentStatus::Online);

        let msg = make_msg("a", MessageTarget::Broadcast);
        let outcome = router.route(msg, &reg).unwrap();

        // b and c should receive, not a.
        assert_eq!(outcome.delivered_to.len(), 2);
        assert!(outcome.delivered_to.iter().all(|id| id.0 != "a"));
    }

    #[test]
    fn topic_routing() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);
        register(&reg, "b", AgentRole::Tester, AgentStatus::Online);
        register(&reg, "c", AgentRole::Monitor, AgentStatus::Online);

        router.subscribe("builds", AgentId::new("a"));
        router.subscribe("builds", AgentId::new("c"));

        let msg = make_msg("ci", MessageTarget::Topic("builds".into()));
        let outcome = router.route(msg, &reg).unwrap();

        assert_eq!(outcome.delivered_to.len(), 2);
        assert!(outcome.delivered_to.iter().any(|id| id.0 == "a"));
        assert!(outcome.delivered_to.iter().any(|id| id.0 == "c"));
    }

    #[test]
    fn unsubscribe_removes_from_topic() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);

        router.subscribe("builds", AgentId::new("a"));
        router.unsubscribe("builds", &AgentId::new("a"));

        let msg = make_msg("ci", MessageTarget::Topic("builds".into()));
        let outcome = router.route(msg, &reg).unwrap();

        assert!(outcome.dropped);
    }

    #[test]
    fn receive_returns_highest_priority_first() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);

        let low = make_msg("x", MessageTarget::Agent(AgentId::new("a")));
        let high = make_msg("x", MessageTarget::Agent(AgentId::new("a")))
            .with_priority(Priority::High);
        let critical = make_msg("x", MessageTarget::Agent(AgentId::new("a")))
            .with_priority(Priority::Critical);

        // Route in low-to-high order.
        router.route(low, &reg).unwrap();
        router.route(high, &reg).unwrap();
        router.route(critical, &reg).unwrap();

        // Should receive critical first.
        let first = router.receive(&AgentId::new("a")).unwrap();
        assert_eq!(first.priority, Priority::Critical);
        let second = router.receive(&AgentId::new("a")).unwrap();
        assert_eq!(second.priority, Priority::High);
        let third = router.receive(&AgentId::new("a")).unwrap();
        assert_eq!(third.priority, Priority::Normal);
        assert!(router.receive(&AgentId::new("a")).is_none());
    }

    #[test]
    fn expired_message_is_dropped() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);

        let msg = make_msg("b", MessageTarget::Agent(AgentId::new("a")))
            .with_expiry(Utc::now() - chrono::Duration::seconds(60));
        let outcome = router.route(msg, &reg).unwrap();

        assert!(outcome.dropped);
        assert_eq!(router.pending_count(&AgentId::new("a")), 0);
    }

    #[test]
    fn receive_all_drains_mailbox() {
        let (reg, router) = setup();
        register(&reg, "a", AgentRole::Coder, AgentStatus::Online);

        for _ in 0..5 {
            let msg = make_msg("x", MessageTarget::Agent(AgentId::new("a")));
            router.route(msg, &reg).unwrap();
        }

        let all = router.receive_all(&AgentId::new("a"));
        assert_eq!(all.len(), 5);
        assert_eq!(router.pending_count(&AgentId::new("a")), 0);
    }
}
