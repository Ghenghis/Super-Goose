use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::messages::{AgentId, AgentStatus, Priority};
use super::registry::AgentRegistry;

// ---------------------------------------------------------------------------
// WakePolicy
// ---------------------------------------------------------------------------

/// Policy that governs when an offline agent should be automatically woken up.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakePolicy {
    /// Whether automatic wake-up is enabled at all.
    pub auto_wake: bool,
    /// Minimum priority required for a message to trigger an automatic wake.
    pub wake_on_priority: Priority,
    /// Minimum cooldown between consecutive wake-ups for the same agent.
    #[serde(with = "serde_duration_secs")]
    pub cooldown: Duration,
    /// Maximum number of agents that may be online at the same time.
    /// `0` means unlimited.
    pub max_concurrent_agents: usize,
    /// If true, perform a resource availability check before waking.
    pub resource_check: bool,
}

impl Default for WakePolicy {
    fn default() -> Self {
        Self {
            auto_wake: true,
            wake_on_priority: Priority::High,
            cooldown: Duration::from_secs(30),
            max_concurrent_agents: 0, // unlimited
            resource_check: false,
        }
    }
}

impl WakePolicy {
    /// Determine whether we should wake a given agent right now.
    ///
    /// Returns `Ok(true)` if wake is allowed, `Ok(false)` with the reason
    /// encoded in the `WakeDecision`.
    pub fn should_wake(
        &self,
        agent_id: &AgentId,
        message_priority: Priority,
        registry: &AgentRegistry,
        wake_history: &WakeHistory,
    ) -> anyhow::Result<WakeDecision> {
        // 1. Global switch.
        if !self.auto_wake {
            return Ok(WakeDecision::denied("auto_wake is disabled"));
        }

        // 2. Priority threshold.
        if message_priority < self.wake_on_priority {
            return Ok(WakeDecision::denied(format!(
                "message priority {:?} below threshold {:?}",
                message_priority, self.wake_on_priority
            )));
        }

        // 3. Cooldown.
        if let Some(last) = wake_history.last_wake(agent_id) {
            let elapsed = last.elapsed();
            if elapsed < self.cooldown {
                return Ok(WakeDecision::denied(format!(
                    "cooldown not elapsed ({:.1}s / {:.1}s)",
                    elapsed.as_secs_f64(),
                    self.cooldown.as_secs_f64()
                )));
            }
        }

        // 4. Concurrency limit.
        if self.max_concurrent_agents > 0 {
            let online_count = registry
                .list_agents(Some(AgentStatus::Online))?
                .len()
                + registry.list_agents(Some(AgentStatus::Busy))?.len();
            if online_count >= self.max_concurrent_agents {
                return Ok(WakeDecision::denied(format!(
                    "max concurrent agents reached ({}/{})",
                    online_count, self.max_concurrent_agents
                )));
            }
        }

        // 5. Resource check (placeholder — real implementation would inspect
        //    system metrics like CPU / memory).
        if self.resource_check && !Self::resources_available() {
            return Ok(WakeDecision::denied("insufficient resources"));
        }

        Ok(WakeDecision::allowed())
    }

    /// Placeholder for a real system resource check.
    fn resources_available() -> bool {
        // In production this would inspect CPU load, free memory, GPU
        // utilisation etc.  For now always returns true.
        true
    }
}

// ---------------------------------------------------------------------------
// WakeDecision
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct WakeDecision {
    pub allowed: bool,
    pub reason: Option<String>,
}

impl WakeDecision {
    pub fn allowed() -> Self {
        Self {
            allowed: true,
            reason: None,
        }
    }

    pub fn denied(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            reason: Some(reason.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// WakeHistory — tracks when agents were last woken
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct WakeHistory {
    map: HashMap<String, Instant>,
}

impl WakeHistory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record that an agent was just woken up.
    pub fn record_wake(&mut self, id: &AgentId) {
        self.map.insert(id.0.clone(), Instant::now());
    }

    /// Get the instant when the agent was last woken, if ever.
    pub fn last_wake(&self, id: &AgentId) -> Option<Instant> {
        self.map.get(&id.0).copied()
    }
}

// ---------------------------------------------------------------------------
// Serde helper — Duration as seconds (u64)
// ---------------------------------------------------------------------------

mod serde_duration_secs {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S: Serializer>(dur: &Duration, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_u64(dur.as_secs())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Duration, D::Error> {
        let secs = u64::deserialize(d)?;
        Ok(Duration::from_secs(secs))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_bus::messages::{AgentId, AgentRole, AgentStatus, Priority};
    use crate::agent_bus::registry::{AgentRecord, AgentRegistry};
    use chrono::Utc;

    fn reg_with_agents(count: usize) -> AgentRegistry {
        let reg = AgentRegistry::in_memory().unwrap();
        for i in 0..count {
            reg.register_agent(&AgentRecord {
                id: AgentId::new(format!("a{i}")),
                display_name: format!("Agent {i}"),
                role: AgentRole::Coder,
                team: None,
                status: AgentStatus::Online,
                capabilities: vec![],
                registered_at: Utc::now(),
                last_heartbeat: None,
                metadata: serde_json::json!({}),
            })
            .unwrap();
        }
        reg
    }

    #[test]
    fn default_policy_allows_high_priority() {
        let policy = WakePolicy::default();
        let reg = reg_with_agents(0);
        let history = WakeHistory::new();

        let decision = policy
            .should_wake(&AgentId::new("x"), Priority::High, &reg, &history)
            .unwrap();
        assert!(decision.allowed);
    }

    #[test]
    fn disabled_policy_denies_all() {
        let policy = WakePolicy {
            auto_wake: false,
            ..Default::default()
        };
        let reg = reg_with_agents(0);
        let history = WakeHistory::new();

        let decision = policy
            .should_wake(&AgentId::new("x"), Priority::Critical, &reg, &history)
            .unwrap();
        assert!(!decision.allowed);
        assert!(decision.reason.unwrap().contains("disabled"));
    }

    #[test]
    fn low_priority_denied() {
        let policy = WakePolicy::default(); // threshold = High
        let reg = reg_with_agents(0);
        let history = WakeHistory::new();

        let decision = policy
            .should_wake(&AgentId::new("x"), Priority::Normal, &reg, &history)
            .unwrap();
        assert!(!decision.allowed);
        assert!(decision.reason.unwrap().contains("priority"));
    }

    #[test]
    fn cooldown_enforced() {
        let policy = WakePolicy {
            cooldown: Duration::from_secs(3600), // 1 hour
            ..Default::default()
        };
        let reg = reg_with_agents(0);
        let mut history = WakeHistory::new();

        // Record a recent wake.
        history.record_wake(&AgentId::new("x"));

        let decision = policy
            .should_wake(&AgentId::new("x"), Priority::Critical, &reg, &history)
            .unwrap();
        assert!(!decision.allowed);
        assert!(decision.reason.unwrap().contains("cooldown"));
    }

    #[test]
    fn max_concurrent_enforced() {
        let policy = WakePolicy {
            max_concurrent_agents: 2,
            ..Default::default()
        };
        // Register 2 online agents (at limit).
        let reg = reg_with_agents(2);
        let history = WakeHistory::new();

        let decision = policy
            .should_wake(&AgentId::new("new"), Priority::Critical, &reg, &history)
            .unwrap();
        assert!(!decision.allowed);
        assert!(decision.reason.unwrap().contains("concurrent"));
    }

    #[test]
    fn under_limit_allowed() {
        let policy = WakePolicy {
            max_concurrent_agents: 5,
            ..Default::default()
        };
        let reg = reg_with_agents(2); // only 2 online
        let history = WakeHistory::new();

        let decision = policy
            .should_wake(&AgentId::new("new"), Priority::High, &reg, &history)
            .unwrap();
        assert!(decision.allowed);
    }

    #[test]
    fn policy_round_trip_json() {
        let policy = WakePolicy {
            auto_wake: true,
            wake_on_priority: Priority::Critical,
            cooldown: Duration::from_secs(60),
            max_concurrent_agents: 10,
            resource_check: true,
        };

        let json = serde_json::to_string_pretty(&policy).unwrap();
        let decoded: WakePolicy = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.auto_wake, true);
        assert_eq!(decoded.wake_on_priority, Priority::Critical);
        assert_eq!(decoded.cooldown, Duration::from_secs(60));
        assert_eq!(decoded.max_concurrent_agents, 10);
        assert_eq!(decoded.resource_check, true);
    }

    #[test]
    fn wake_history_tracks_agents() {
        let mut history = WakeHistory::new();
        let id = AgentId::new("agent-1");

        assert!(history.last_wake(&id).is_none());

        history.record_wake(&id);
        assert!(history.last_wake(&id).is_some());
    }
}
