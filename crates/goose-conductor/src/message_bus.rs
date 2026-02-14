//! Inter-agent message bus.
//!
//! Provides topic-based pub/sub with persistent queuing for offline agents.
//! Messages sent to an agent that is currently down are stored in SQLite
//! (via [`StateStore`]) and delivered when the agent wakes up.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info};

use crate::state_store::StateStore;

/// A message flowing through the bus.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusMessage {
    /// Unique message ID.
    pub id: String,
    /// Topic (e.g. "health", "task", "agent.goosed").
    pub topic: String,
    /// Sender identifier.
    pub sender: String,
    /// Optional direct recipient. If `None`, broadcast to all topic subscribers.
    pub recipient: Option<String>,
    /// JSON payload.
    pub payload: serde_json::Value,
    /// ISO-8601 timestamp.
    pub timestamp: String,
}

impl BusMessage {
    /// Create a new message with a fresh UUID and timestamp.
    pub fn new(
        topic: impl Into<String>,
        sender: impl Into<String>,
        recipient: Option<String>,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            topic: topic.into(),
            sender: sender.into(),
            recipient,
            payload,
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}

/// Subscription registry: maps topic -> set of subscriber IDs.
type Subscriptions = HashMap<String, HashSet<String>>;

/// The message bus.
pub struct MessageBus {
    /// Broadcast channel for real-time delivery to in-process listeners.
    tx: broadcast::Sender<BusMessage>,
    /// Topic -> subscriber IDs.
    subs: Arc<RwLock<Subscriptions>>,
    /// Set of agent IDs currently considered "online".
    online: Arc<RwLock<HashSet<String>>>,
    /// Persistent store for offline message queuing.
    store: Arc<StateStore>,
}

impl MessageBus {
    /// Create a new message bus backed by the given state store.
    pub fn new(store: Arc<StateStore>) -> Self {
        let (tx, _rx) = broadcast::channel(1024);
        Self {
            tx,
            subs: Arc::new(RwLock::new(HashMap::new())),
            online: Arc::new(RwLock::new(HashSet::new())),
            store,
        }
    }

    /// Subscribe an agent to a topic.
    #[allow(dead_code)]
    pub async fn subscribe(&self, agent_id: &str, topic: &str) {
        let mut subs = self.subs.write().await;
        subs.entry(topic.to_string())
            .or_default()
            .insert(agent_id.to_string());
        debug!(agent_id, topic, "subscribed");
    }

    /// Unsubscribe an agent from a topic.
    #[allow(dead_code)]
    pub async fn unsubscribe(&self, agent_id: &str, topic: &str) {
        let mut subs = self.subs.write().await;
        if let Some(set) = subs.get_mut(topic) {
            set.remove(agent_id);
            if set.is_empty() {
                subs.remove(topic);
            }
        }
        debug!(agent_id, topic, "unsubscribed");
    }

    /// Mark an agent as online.
    pub async fn mark_online(&self, agent_id: &str) {
        self.online.write().await.insert(agent_id.to_string());
        info!(agent_id, "agent marked online");
    }

    /// Mark an agent as offline.
    #[allow(dead_code)]
    pub async fn mark_offline(&self, agent_id: &str) {
        self.online.write().await.remove(agent_id);
        info!(agent_id, "agent marked offline");
    }

    /// Get a broadcast receiver for real-time messages.
    #[allow(dead_code)]
    pub fn receiver(&self) -> broadcast::Receiver<BusMessage> {
        self.tx.subscribe()
    }

    /// Publish a message. Online subscribers receive it via the broadcast
    /// channel; offline subscribers get it queued in SQLite.
    pub async fn publish(&self, msg: BusMessage) -> anyhow::Result<()> {
        let subs = self.subs.read().await;
        let online = self.online.read().await;

        // Determine who should receive this message.
        let recipients: Vec<String> = if let Some(ref direct) = msg.recipient {
            // Direct message — single recipient.
            vec![direct.clone()]
        } else if let Some(set) = subs.get(&msg.topic) {
            // Broadcast to all topic subscribers.
            set.iter().cloned().collect()
        } else {
            vec![]
        };

        // Broadcast on the channel for real-time listeners.
        // Ignore the "no receivers" error — it just means nobody is listening right now.
        let _ = self.tx.send(msg.clone());

        // Queue for any offline recipients.
        for recipient in &recipients {
            if !online.contains(recipient) {
                let payload_str = serde_json::to_string(&msg.payload)?;
                self.store
                    .queue_message(&msg.topic, &msg.sender, recipient, &payload_str)
                    .await
                    .map_err(|e| anyhow::anyhow!("failed to queue message: {}", e))?;
                debug!(
                    recipient,
                    topic = msg.topic,
                    "queued message for offline agent"
                );
            }
        }

        Ok(())
    }

    /// Deliver all pending messages for an agent (called on wake-up).
    /// Returns the messages that were pending.
    pub async fn deliver_pending(
        &self,
        agent_id: &str,
    ) -> anyhow::Result<Vec<crate::state_store::PendingMessage>> {
        let messages = self
            .store
            .drain_messages(agent_id)
            .await
            .map_err(|e| anyhow::anyhow!("failed to drain messages: {}", e))?;

        if !messages.is_empty() {
            info!(
                agent_id,
                count = messages.len(),
                "delivered pending messages on wake-up"
            );
        }

        Ok(messages)
    }

    /// List all current subscriptions (for debugging / status).
    #[allow(dead_code)]
    pub async fn list_subscriptions(&self) -> HashMap<String, Vec<String>> {
        let subs = self.subs.read().await;
        subs.iter()
            .map(|(topic, agents)| (topic.clone(), agents.iter().cloned().collect()))
            .collect()
    }
}
