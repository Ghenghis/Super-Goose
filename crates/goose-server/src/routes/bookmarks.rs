//! Bookmarks API routes — session bookmark management.
//!
//! The frontend's `backendApi.getBookmarks()`, `createBookmark()`, and
//! `deleteBookmark()` call these endpoints. Bookmarks are stored in-memory
//! for now; a future iteration can persist them via the session database.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub label: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBookmarkRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub label: String,
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/// Shared bookmark store. Keyed by bookmark ID.
///
/// TODO: Migrate to SQLite or the session database for persistence across
/// server restarts.
#[derive(Clone)]
pub struct BookmarkStore {
    bookmarks: Arc<RwLock<HashMap<String, Bookmark>>>,
}

impl BookmarkStore {
    pub fn new() -> Self {
        Self {
            bookmarks: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/bookmarks` — List all bookmarks.
async fn list_bookmarks(
    State(store): State<BookmarkStore>,
) -> Json<Vec<Bookmark>> {
    let bookmarks = store.bookmarks.read().await;
    let mut list: Vec<Bookmark> = bookmarks.values().cloned().collect();
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Json(list)
}

/// `POST /api/bookmarks` — Create a new bookmark.
async fn create_bookmark(
    State(store): State<BookmarkStore>,
    Json(req): Json<CreateBookmarkRequest>,
) -> (StatusCode, Json<Bookmark>) {
    let bookmark = Bookmark {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: req.session_id,
        label: req.label,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut bookmarks = store.bookmarks.write().await;
    bookmarks.insert(bookmark.id.clone(), bookmark.clone());

    (StatusCode::CREATED, Json(bookmark))
}

/// `DELETE /api/bookmarks/{id}` — Delete a bookmark.
async fn delete_bookmark(
    State(store): State<BookmarkStore>,
    Path(id): Path<String>,
) -> StatusCode {
    let mut bookmarks = store.bookmarks.write().await;
    if bookmarks.remove(&id).is_some() {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(_app_state: Arc<AppState>) -> Router {
    let store = BookmarkStore::new();

    Router::new()
        .route("/api/bookmarks", get(list_bookmarks).post(create_bookmark))
        .route("/api/bookmarks/{id}", delete(delete_bookmark))
        .with_state(store)
}
