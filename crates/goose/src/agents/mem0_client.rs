//! Mem0 HTTP Client — Optional graph memory integration for Super-Goose.
//!
//! Provides a lightweight async HTTP client for the Mem0 REST API.
//! Falls back gracefully when Mem0 is not running — the local
//! MemoryManager continues to work independently.
//!
//! Mem0 API: http://localhost:8080 (default, configurable via MEM0_API_URL)

use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tracing::{debug, info, warn};

/// HTTP client for the Mem0 graph memory service.
pub struct Mem0Client {
    client: Client,
    base_url: String,
    available: bool,
}

impl Mem0Client {
    /// Create a new Mem0Client. Does NOT check health yet.
    pub fn new() -> Self {
        let base_url =
            std::env::var("MEM0_API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            base_url,
            available: false,
        }
    }

    /// Ping the Mem0 service. Sets self.available accordingly.
    pub async fn check_health(&mut self) -> bool {
        match self
            .client
            .get(format!("{}/health", self.base_url))
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                info!(url = %self.base_url, "Mem0 service is available");
                self.available = true;
                true
            }
            Ok(resp) => {
                debug!(
                    url = %self.base_url,
                    status = %resp.status(),
                    "Mem0 service returned non-success status"
                );
                self.available = false;
                false
            }
            Err(e) => {
                debug!(
                    url = %self.base_url,
                    error = %e,
                    "Mem0 service unavailable (this is OK — local memory still works)"
                );
                self.available = false;
                false
            }
        }
    }

    /// Whether Mem0 is currently available.
    pub fn is_available(&self) -> bool {
        self.available
    }

    /// Store a memory in Mem0. No-op if Mem0 is unavailable.
    pub async fn add_memory(&self, content: &str, user_id: &str) -> anyhow::Result<()> {
        if !self.available {
            return Ok(());
        }
        let resp = self
            .client
            .post(format!("{}/v1/memories", self.base_url))
            .json(&json!({
                "messages": [{"role": "user", "content": content}],
                "user_id": user_id
            }))
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                debug!(user_id, "Memory stored in Mem0");
                Ok(())
            }
            Ok(r) => {
                warn!(
                    status = %r.status(),
                    "Mem0 add_memory returned non-success"
                );
                Ok(()) // Non-fatal
            }
            Err(e) => {
                warn!(error = %e, "Mem0 add_memory failed (non-fatal)");
                Ok(()) // Non-fatal — local memory still works
            }
        }
    }

    /// Search memories in Mem0. Returns empty vec if Mem0 is unavailable.
    pub async fn search_memory(&self, query: &str, user_id: &str) -> Vec<String> {
        if !self.available {
            return vec![];
        }
        match self
            .client
            .post(format!("{}/v1/memories/search", self.base_url))
            .json(&json!({"query": query, "user_id": user_id}))
            .send()
            .await
        {
            Ok(resp) => {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    body.as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| {
                                    v.get("memory")
                                        .and_then(|m| m.as_str())
                                        .map(String::from)
                                })
                                .collect()
                        })
                        .unwrap_or_default()
                } else {
                    vec![]
                }
            }
            Err(e) => {
                debug!(error = %e, "Mem0 search failed (returning empty)");
                vec![]
            }
        }
    }
}

impl Default for Mem0Client {
    fn default() -> Self {
        Self::new()
    }
}
