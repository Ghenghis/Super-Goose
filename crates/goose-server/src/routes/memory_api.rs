use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::{Path, Query},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use utoipa::ToSchema;

// ===========================================================================
// Types
// ===========================================================================

/// A single shared memory entry.
///
/// Memories are organized by namespace and key. Common namespaces:
/// - `"shared"` — visible to all agents
/// - `"team-<name>"` — visible to agents in a specific team
/// - `"<agent-id>"` — private to one agent
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SharedMemoryEntry {
    /// Namespace this memory belongs to.
    pub namespace: String,
    /// Unique key within the namespace.
    pub key: String,
    /// Arbitrary JSON payload.
    pub value: serde_json::Value,
    /// ID of the agent that created / last wrote this entry.
    pub created_by: String,
    /// ISO-8601 timestamp of creation.
    pub created_at: String,
    /// ISO-8601 timestamp of last update.
    pub updated_at: String,
    /// Monotonically increasing version counter (optimistic concurrency).
    pub version: u64,
}

/// Response for `GET /api/memory/shared`.
#[derive(Debug, Serialize, ToSchema)]
pub struct ListMemoriesResponse {
    pub memories: Vec<SharedMemoryEntry>,
    pub total: usize,
}

/// Response for `GET /api/memory/namespaces`.
#[derive(Debug, Serialize, ToSchema)]
pub struct ListNamespacesResponse {
    pub namespaces: Vec<NamespaceSummary>,
}

/// Summary of a single namespace.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceSummary {
    pub namespace: String,
    pub entry_count: usize,
}

/// Request body for `PUT /api/memory/shared/{namespace}/{key}`.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PutMemoryRequest {
    /// Arbitrary JSON value to store.
    pub value: serde_json::Value,
    /// Agent ID that is writing this entry.
    pub created_by: String,
}

/// Response after creating or updating a memory entry.
#[derive(Debug, Serialize, ToSchema)]
pub struct PutMemoryResponse {
    pub created: bool,
    pub version: u64,
}

/// Response after deleting a memory entry.
#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteMemoryResponse {
    pub deleted: bool,
}

/// Query parameters for `GET /api/memory/shared`.
#[derive(Debug, Deserialize)]
pub struct ListMemoriesQuery {
    /// Optional namespace filter. If omitted, returns all.
    pub namespace: Option<String>,
}

// ===========================================================================
// In-Memory Store
// ===========================================================================

/// Composite key: (namespace, key).
type MemoryKey = (String, String);

/// Global shared-memory store.
/// In production this would be backed by SQLite or a shared KV store;
/// the in-process HashMap is sufficient for the API contract and tests.
static STORE: Lazy<Mutex<HashMap<MemoryKey, SharedMemoryEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ===========================================================================
// Handlers
// ===========================================================================

/// `GET /api/memory/shared` — list all shared memories.
///
/// Accepts an optional `?namespace=<ns>` query parameter to filter.
async fn list_memories(
    Query(params): Query<ListMemoriesQuery>,
) -> Result<Json<ListMemoriesResponse>, ErrorResponse> {
    let store = STORE
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let memories: Vec<SharedMemoryEntry> = store
        .values()
        .filter(|entry| {
            if let Some(ref ns) = params.namespace {
                &entry.namespace == ns
            } else {
                true
            }
        })
        .cloned()
        .collect();

    let total = memories.len();
    Ok(Json(ListMemoriesResponse { memories, total }))
}

/// `GET /api/memory/shared/{namespace}/{key}` — fetch a single memory.
async fn get_memory(
    Path((namespace, key)): Path<(String, String)>,
) -> Result<Json<SharedMemoryEntry>, ErrorResponse> {
    let store = STORE
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let entry = store
        .get(&(namespace.clone(), key.clone()))
        .ok_or_else(|| {
            ErrorResponse::not_found(format!(
                "Memory entry '{}/{}' not found",
                namespace, key
            ))
        })?;

    Ok(Json(entry.clone()))
}

/// `PUT /api/memory/shared/{namespace}/{key}` — create or update a memory.
async fn put_memory(
    Path((namespace, key)): Path<(String, String)>,
    Json(body): Json<PutMemoryRequest>,
) -> Result<Json<PutMemoryResponse>, ErrorResponse> {
    // Validate namespace format
    if namespace.is_empty() {
        return Err(ErrorResponse::bad_request("Namespace must not be empty"));
    }
    if key.is_empty() {
        return Err(ErrorResponse::bad_request("Key must not be empty"));
    }

    let mut store = STORE
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let composite = (namespace.clone(), key.clone());
    let now = Utc::now().to_rfc3339();

    if let Some(existing) = store.get_mut(&composite) {
        // Update existing entry.
        existing.value = body.value;
        existing.created_by = body.created_by;
        existing.updated_at = now;
        existing.version += 1;
        let version = existing.version;
        Ok(Json(PutMemoryResponse {
            created: false,
            version,
        }))
    } else {
        // Create new entry.
        let entry = SharedMemoryEntry {
            namespace,
            key,
            value: body.value,
            created_by: body.created_by,
            created_at: now.clone(),
            updated_at: now,
            version: 1,
        };
        store.insert(composite, entry);
        Ok(Json(PutMemoryResponse {
            created: true,
            version: 1,
        }))
    }
}

/// `DELETE /api/memory/shared/{namespace}/{key}` — delete a memory.
async fn delete_memory(
    Path((namespace, key)): Path<(String, String)>,
) -> Result<Json<DeleteMemoryResponse>, ErrorResponse> {
    let mut store = STORE
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    let removed = store.remove(&(namespace, key)).is_some();
    Ok(Json(DeleteMemoryResponse { deleted: removed }))
}

/// `GET /api/memory/namespaces` — list all namespaces with entry counts.
async fn list_namespaces() -> Result<Json<ListNamespacesResponse>, ErrorResponse> {
    let store = STORE
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    // Accumulate counts per namespace.
    let mut counts: HashMap<String, usize> = HashMap::new();
    for entry in store.values() {
        *counts.entry(entry.namespace.clone()).or_insert(0) += 1;
    }

    let mut namespaces: Vec<NamespaceSummary> = counts
        .into_iter()
        .map(|(namespace, entry_count)| NamespaceSummary {
            namespace,
            entry_count,
        })
        .collect();

    // Sort alphabetically for deterministic output.
    namespaces.sort_by(|a, b| a.namespace.cmp(&b.namespace));

    Ok(Json(ListNamespacesResponse { namespaces }))
}

// ===========================================================================
// Router
// ===========================================================================

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/memory/shared", get(list_memories))
        .route(
            "/api/memory/shared/{namespace}/{key}",
            get(get_memory).put(put_memory).delete(delete_memory),
        )
        .route("/api/memory/namespaces", get(list_namespaces))
        .with_state(state)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Router signature
    // -----------------------------------------------------------------------

    #[test]
    fn test_routes_creation() {
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }

    // -----------------------------------------------------------------------
    // Type serialization
    // -----------------------------------------------------------------------

    #[test]
    fn test_shared_memory_entry_serialization() {
        let entry = SharedMemoryEntry {
            namespace: "shared".to_string(),
            key: "build_status".to_string(),
            value: serde_json::json!({"status": "green"}),
            created_by: "agent-1".to_string(),
            created_at: "2026-02-14T10:00:00Z".to_string(),
            updated_at: "2026-02-14T10:05:00Z".to_string(),
            version: 3,
        };

        let json = serde_json::to_string(&entry).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["namespace"], "shared");
        assert_eq!(parsed["key"], "build_status");
        assert_eq!(parsed["createdBy"], "agent-1");
        assert_eq!(parsed["createdAt"], "2026-02-14T10:00:00Z");
        assert_eq!(parsed["updatedAt"], "2026-02-14T10:05:00Z");
        assert_eq!(parsed["version"], 3);
        assert_eq!(parsed["value"]["status"], "green");
    }

    #[test]
    fn test_shared_memory_entry_camel_case() {
        let entry = SharedMemoryEntry {
            namespace: "test".to_string(),
            key: "k".to_string(),
            value: serde_json::json!(null),
            created_by: "a".to_string(),
            created_at: "t".to_string(),
            updated_at: "t".to_string(),
            version: 1,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"createdBy\""));
        assert!(json.contains("\"createdAt\""));
        assert!(json.contains("\"updatedAt\""));
        assert!(!json.contains("created_by"));
        assert!(!json.contains("created_at"));
        assert!(!json.contains("updated_at"));
    }

    #[test]
    fn test_shared_memory_entry_roundtrip() {
        let original = SharedMemoryEntry {
            namespace: "team-alpha".to_string(),
            key: "config".to_string(),
            value: serde_json::json!({"retries": 3, "timeout": 30}),
            created_by: "agent-planner".to_string(),
            created_at: "2026-02-14T08:00:00Z".to_string(),
            updated_at: "2026-02-14T09:00:00Z".to_string(),
            version: 5,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: SharedMemoryEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.namespace, original.namespace);
        assert_eq!(deserialized.key, original.key);
        assert_eq!(deserialized.value, original.value);
        assert_eq!(deserialized.created_by, original.created_by);
        assert_eq!(deserialized.created_at, original.created_at);
        assert_eq!(deserialized.updated_at, original.updated_at);
        assert_eq!(deserialized.version, original.version);
    }

    #[test]
    fn test_put_memory_request_deserialization() {
        let json = r#"{"value": {"foo": "bar"}, "createdBy": "agent-7"}"#;
        let req: PutMemoryRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.created_by, "agent-7");
        assert_eq!(req.value["foo"], "bar");
    }

    #[test]
    fn test_list_memories_response_serialization() {
        let response = ListMemoriesResponse {
            memories: vec![SharedMemoryEntry {
                namespace: "shared".to_string(),
                key: "key1".to_string(),
                value: serde_json::json!(42),
                created_by: "a".to_string(),
                created_at: "t".to_string(),
                updated_at: "t".to_string(),
                version: 1,
            }],
            total: 1,
        };

        let json = serde_json::to_string(&response).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["total"], 1);
        assert!(parsed["memories"].is_array());
        assert_eq!(parsed["memories"][0]["namespace"], "shared");
    }

    #[test]
    fn test_namespace_summary_serialization() {
        let summary = NamespaceSummary {
            namespace: "team-beta".to_string(),
            entry_count: 42,
        };

        let json = serde_json::to_string(&summary).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["namespace"], "team-beta");
        assert_eq!(parsed["entryCount"], 42);
        assert!(!json.contains("entry_count"));
    }

    #[test]
    fn test_list_namespaces_response_serialization() {
        let response = ListNamespacesResponse {
            namespaces: vec![
                NamespaceSummary {
                    namespace: "shared".to_string(),
                    entry_count: 10,
                },
                NamespaceSummary {
                    namespace: "team-alpha".to_string(),
                    entry_count: 5,
                },
            ],
        };

        let json = serde_json::to_string(&response).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(parsed["namespaces"].is_array());
        assert_eq!(parsed["namespaces"].as_array().unwrap().len(), 2);
        assert_eq!(parsed["namespaces"][0]["namespace"], "shared");
        assert_eq!(parsed["namespaces"][0]["entryCount"], 10);
    }

    #[test]
    fn test_put_memory_response_serialization() {
        let response = PutMemoryResponse {
            created: true,
            version: 1,
        };

        let json = serde_json::to_string(&response).expect("serialize");
        assert!(json.contains("\"created\":true"));
        assert!(json.contains("\"version\":1"));
    }

    #[test]
    fn test_delete_memory_response_serialization() {
        let response = DeleteMemoryResponse { deleted: true };
        let json = serde_json::to_string(&response).expect("serialize");
        assert!(json.contains("\"deleted\":true"));

        let response_false = DeleteMemoryResponse { deleted: false };
        let json_f = serde_json::to_string(&response_false).expect("serialize");
        assert!(json_f.contains("\"deleted\":false"));
    }

    // -----------------------------------------------------------------------
    // Store logic (integration-style, direct function calls)
    // -----------------------------------------------------------------------

    /// Helper to clear the global store between tests.
    /// Tests that touch the store MUST be run serially or use unique keys.
    fn clear_store() {
        let mut store = STORE.lock().unwrap();
        store.clear();
    }

    #[test]
    fn test_store_put_and_get() {
        clear_store();

        // Insert
        {
            let mut store = STORE.lock().unwrap();
            let now = Utc::now().to_rfc3339();
            store.insert(
                ("shared".to_string(), "test_key".to_string()),
                SharedMemoryEntry {
                    namespace: "shared".to_string(),
                    key: "test_key".to_string(),
                    value: serde_json::json!({"hello": "world"}),
                    created_by: "test-agent".to_string(),
                    created_at: now.clone(),
                    updated_at: now,
                    version: 1,
                },
            );
        }

        // Retrieve
        {
            let store = STORE.lock().unwrap();
            let entry = store.get(&("shared".to_string(), "test_key".to_string()));
            assert!(entry.is_some());
            let entry = entry.unwrap();
            assert_eq!(entry.namespace, "shared");
            assert_eq!(entry.key, "test_key");
            assert_eq!(entry.value["hello"], "world");
            assert_eq!(entry.version, 1);
        }

        clear_store();
    }

    #[test]
    fn test_store_update_increments_version() {
        clear_store();

        let now = Utc::now().to_rfc3339();
        let key = ("shared".to_string(), "versioned".to_string());

        {
            let mut store = STORE.lock().unwrap();
            store.insert(
                key.clone(),
                SharedMemoryEntry {
                    namespace: "shared".to_string(),
                    key: "versioned".to_string(),
                    value: serde_json::json!(1),
                    created_by: "a".to_string(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    version: 1,
                },
            );
        }

        // Simulate update
        {
            let mut store = STORE.lock().unwrap();
            if let Some(entry) = store.get_mut(&key) {
                entry.value = serde_json::json!(2);
                entry.version += 1;
            }
        }

        {
            let store = STORE.lock().unwrap();
            let entry = store.get(&key).unwrap();
            assert_eq!(entry.version, 2);
            assert_eq!(entry.value, serde_json::json!(2));
        }

        clear_store();
    }

    #[test]
    fn test_store_delete() {
        clear_store();

        let now = Utc::now().to_rfc3339();
        let key = ("shared".to_string(), "to_delete".to_string());

        {
            let mut store = STORE.lock().unwrap();
            store.insert(
                key.clone(),
                SharedMemoryEntry {
                    namespace: "shared".to_string(),
                    key: "to_delete".to_string(),
                    value: serde_json::json!(null),
                    created_by: "a".to_string(),
                    created_at: now.clone(),
                    updated_at: now,
                    version: 1,
                },
            );
        }

        {
            let mut store = STORE.lock().unwrap();
            let removed = store.remove(&key);
            assert!(removed.is_some());
        }

        {
            let store = STORE.lock().unwrap();
            assert!(store.get(&key).is_none());
        }

        clear_store();
    }

    #[test]
    fn test_store_namespace_filtering() {
        clear_store();

        let now = Utc::now().to_rfc3339();

        {
            let mut store = STORE.lock().unwrap();
            for (ns, k) in &[
                ("shared", "a"),
                ("shared", "b"),
                ("team-alpha", "c"),
                ("agent-1", "d"),
            ] {
                store.insert(
                    (ns.to_string(), k.to_string()),
                    SharedMemoryEntry {
                        namespace: ns.to_string(),
                        key: k.to_string(),
                        value: serde_json::json!(null),
                        created_by: "test".to_string(),
                        created_at: now.clone(),
                        updated_at: now.clone(),
                        version: 1,
                    },
                );
            }
        }

        {
            let store = STORE.lock().unwrap();
            let shared_count = store
                .values()
                .filter(|e| e.namespace == "shared")
                .count();
            assert_eq!(shared_count, 2);

            let team_count = store
                .values()
                .filter(|e| e.namespace == "team-alpha")
                .count();
            assert_eq!(team_count, 1);

            let agent_count = store
                .values()
                .filter(|e| e.namespace == "agent-1")
                .count();
            assert_eq!(agent_count, 1);
        }

        // Count namespaces
        {
            let store = STORE.lock().unwrap();
            let mut counts: HashMap<String, usize> = HashMap::new();
            for entry in store.values() {
                *counts.entry(entry.namespace.clone()).or_insert(0) += 1;
            }
            assert_eq!(counts.len(), 3);
            assert_eq!(counts["shared"], 2);
            assert_eq!(counts["team-alpha"], 1);
            assert_eq!(counts["agent-1"], 1);
        }

        clear_store();
    }

    #[test]
    fn test_store_get_missing_key() {
        clear_store();

        let store = STORE.lock().unwrap();
        let entry = store.get(&("nonexistent".to_string(), "nope".to_string()));
        assert!(entry.is_none());
    }

    #[test]
    fn test_store_delete_missing_key() {
        clear_store();

        let mut store = STORE.lock().unwrap();
        let removed = store.remove(&("nonexistent".to_string(), "nope".to_string()));
        assert!(removed.is_none());
    }
}
