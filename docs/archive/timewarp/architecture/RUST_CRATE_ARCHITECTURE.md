# TimeWarp: Rust Crate Architecture

**Version:** 1.0.0
**Status:** Implementation-Ready Specification
**Crate:** `crates/timewarp/`
**Target Integration:** Super-Goose workspace (`G:\goose`)
**Architecture Pattern:** Event Sourcing + Content-Addressed Storage + DAG Branching

---

## Table of Contents

1. [Crate Structure](#1-crate-structure)
2. [Data Models](#2-data-models)
3. [SQLite Schema](#3-sqlite-schema)
4. [Content-Addressed Storage](#4-content-addressed-storage)
5. [Public API (Traits)](#5-public-api-traits)
6. [Module Specifications](#6-module-specifications)
7. [Cargo.toml](#7-cargotoml)
8. [Integration with goose-server](#8-integration-with-goose-server)
9. [Testing Strategy](#9-testing-strategy)
10. [Migration System](#10-migration-system)

---

## 1. Crate Structure

```
crates/timewarp/
├── Cargo.toml
├── src/
│   ├── lib.rs                  # Public API surface, re-exports, crate documentation
│   ├── models.rs               # All data types: Event, Snapshot, Branch, Conflict, etc.
│   ├── errors.rs               # TimeWarpError enum via thiserror
│   ├── db.rs                   # SQLite connection pool, migrations, WAL mode setup
│   ├── event_store.rs          # Append-only event log with hash chain integrity
│   ├── snapshot_store.rs       # Content-addressed workspace snapshots (BLAKE3 blobs + deltas)
│   ├── branch_manager.rs       # DAG-based branching: create, switch, merge, delete, list
│   ├── replay_engine.rs        # Deterministic re-execution in Docker containers (bollard)
│   ├── conflict_engine.rs      # Three-layer conflict detection (structural, semantic, drift)
│   ├── mcp_middleware.rs        # Transparent MCP proxy for event capture
│   ├── forward_projector.rs    # "What-if" simulation engine
│   ├── backup_manager.rs       # Auto-backup, export/import, cloud sync
│   └── blob_store.rs           # Content-addressed blob storage on disk
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_indexes_and_views.sql
└── tests/
    ├── event_store_tests.rs
    ├── snapshot_store_tests.rs
    ├── branch_manager_tests.rs
    ├── replay_engine_tests.rs
    ├── conflict_engine_tests.rs
    ├── hash_chain_tests.rs
    └── integration_tests.rs
```

### Dependency Graph (Internal)

```
lib.rs
  ├── models.rs          (no internal deps)
  ├── errors.rs          (no internal deps)
  ├── db.rs              (errors)
  ├── blob_store.rs      (models, errors)
  ├── event_store.rs     (models, errors, db)
  ├── snapshot_store.rs  (models, errors, db, blob_store)
  ├── branch_manager.rs  (models, errors, db, event_store, snapshot_store)
  ├── replay_engine.rs   (models, errors, event_store, snapshot_store, branch_manager)
  ├── conflict_engine.rs (models, errors, snapshot_store, event_store)
  ├── mcp_middleware.rs   (models, errors, event_store, snapshot_store)
  ├── forward_projector.rs (models, errors, replay_engine, conflict_engine, branch_manager)
  └── backup_manager.rs  (models, errors, db, blob_store, event_store, snapshot_store)
```

---

## 2. Data Models

All data types live in `models.rs`. Every struct derives `Debug, Clone, Serialize, Deserialize` for storage and API transport.

### 2.1 Event

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::PathBuf;
use uuid::Uuid;

/// A single immutable event in the TimeWarp DAG.
///
/// Events form a hash-chained append-only log. Each event records
/// one discrete agent action (file write, command execution, LLM call, etc.)
/// along with a reference to the workspace snapshot after the action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Time-ordered unique identifier (UUID v7 for natural sort order).
    /// UUID v7 encodes a Unix timestamp in the most-significant bits,
    /// so lexicographic sort == chronological sort.
    pub event_id: Uuid,

    /// Parent event IDs forming the DAG edges.
    /// - Linear history: exactly 1 parent (except the root event which has 0).
    /// - Merge commits: 2+ parents.
    pub parent_ids: Vec<Uuid>,

    /// Branch this event belongs to.
    pub branch_id: Uuid,

    /// Classification of what happened.
    pub event_type: EventType,

    /// What triggered this event (tool arguments, user prompt, etc.).
    /// Stored as opaque JSON to accommodate any MCP tool schema.
    pub inputs: Value,

    /// What the event produced (tool result, LLM response, etc.).
    pub outputs: Value,

    /// Set of file paths touched by this event (created, modified, deleted).
    /// BTreeSet for deterministic serialization order.
    pub file_touches: BTreeSet<PathBuf>,

    /// Content-addressed snapshot ID capturing workspace state AFTER this event.
    /// This is the BLAKE3 hash of the snapshot manifest.
    pub snapshot_id: Option<String>,

    /// Hash of the immediately preceding event on this branch.
    /// Forms the hash chain for tamper detection.
    /// None only for the very first event (genesis).
    pub prev_hash: Option<String>,

    /// BLAKE3 hash of this event's canonical representation.
    /// Computed over: (event_id, parent_ids, branch_id, event_type,
    ///   inputs, outputs, file_touches, snapshot_id, prev_hash, created_at).
    pub event_hash: String,

    /// Timestamp of event creation (UTC).
    pub created_at: DateTime<Utc>,

    /// Extensible metadata (agent name, model used, token counts, cost, etc.).
    pub metadata: Value,
}

impl Event {
    /// Compute the canonical hash for this event.
    /// The hash covers all fields except `event_hash` itself.
    pub fn compute_hash(&self) -> String {
        use blake3::Hasher;

        let mut hasher = Hasher::new();

        // Hash each field in deterministic order
        hasher.update(self.event_id.as_bytes());

        for pid in &self.parent_ids {
            hasher.update(pid.as_bytes());
        }

        hasher.update(self.branch_id.as_bytes());
        hasher.update(serde_json::to_string(&self.event_type).unwrap().as_bytes());
        hasher.update(serde_json::to_string(&self.inputs).unwrap().as_bytes());
        hasher.update(serde_json::to_string(&self.outputs).unwrap().as_bytes());

        // BTreeSet is already sorted
        for path in &self.file_touches {
            hasher.update(path.to_string_lossy().as_bytes());
        }

        if let Some(ref sid) = self.snapshot_id {
            hasher.update(sid.as_bytes());
        }

        if let Some(ref ph) = self.prev_hash {
            hasher.update(ph.as_bytes());
        }

        hasher.update(self.created_at.to_rfc3339().as_bytes());
        hasher.update(serde_json::to_string(&self.metadata).unwrap().as_bytes());

        hasher.finalize().to_hex().to_string()
    }

    /// Verify this event's hash is correct.
    pub fn verify_hash(&self) -> bool {
        self.event_hash == self.compute_hash()
    }
}
```

### 2.2 EventType

```rust
/// Classification of agent actions captured by TimeWarp.
///
/// Each variant maps to a category of MCP tool call or agent lifecycle event.
/// The `Custom(String)` variant allows extension without schema changes.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", content = "detail", rename_all = "snake_case")]
pub enum EventType {
    // --- File Operations ---
    FileCreate,
    FileWrite,
    FileDelete,
    FileRename { from: PathBuf, to: PathBuf },
    FileChmod,

    // --- Command Execution ---
    CmdExec,
    CmdExecBackground,

    // --- LLM Interactions ---
    LlmCall,
    LlmStream,

    // --- Git Operations ---
    GitCommit,
    GitBranch,
    GitCheckout,
    GitMerge,
    GitPush,
    GitPull,
    GitOp,

    // --- MCP Tool Calls ---
    McpToolCall { server: String, tool: String },
    McpResourceRead,
    McpPromptGet,

    // --- TimeWarp Lifecycle ---
    BranchCreate,
    BranchMerge,
    BranchDelete,
    Checkpoint,
    Restore,

    // --- Agent Lifecycle ---
    RoleHandoff { from_role: String, to_role: String },
    SessionStart,
    SessionEnd,
    AgentSpawn { agent_id: String },
    AgentTerminate { agent_id: String },

    // --- Quality Gates ---
    TestRun,
    BuildRun,
    LintRun,
    SecurityScan,

    // --- Extensible ---
    Custom(String),
}
```

### 2.3 Snapshot

```rust
use std::collections::BTreeMap;
use std::path::PathBuf;

/// A content-addressed workspace snapshot.
///
/// A snapshot captures the complete state of all tracked files at a point in time.
/// The `snapshot_id` is the BLAKE3 hash of the serialized `file_tree`, making it
/// content-addressed: identical workspace states produce identical snapshot IDs.
///
/// Snapshots support delta compression: a snapshot can reference a `base_snapshot`
/// and store only the differences (added/modified/deleted files).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    /// Content-addressed ID: BLAKE3 hash of the canonical file_tree representation.
    pub snapshot_id: String,

    /// Optional base snapshot for delta compression.
    /// If present, only files that differ from the base are stored as blobs.
    pub base_snapshot: Option<String>,

    /// Map from relative file path to the BLAKE3 hash of the file content (blob hash).
    /// BTreeMap for deterministic serialization.
    pub file_tree: BTreeMap<PathBuf, BlobRef>,

    /// Total number of tracked files in the workspace.
    pub total_files: u64,

    /// Total size in bytes of all tracked files.
    pub total_bytes: u64,

    /// When this snapshot was created.
    pub created_at: DateTime<Utc>,

    /// Optional human-readable label (e.g., "after implementing auth module").
    pub label: Option<String>,
}

/// Reference to a blob in the content-addressed store.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BlobRef {
    /// BLAKE3 hash of the file content.
    pub hash: String,
    /// Size of the file in bytes.
    pub size: u64,
    /// Whether this blob is a delta against the base snapshot's version.
    pub is_delta: bool,
}

impl Snapshot {
    /// Compute the content-addressed snapshot ID from the file tree.
    pub fn compute_id(file_tree: &BTreeMap<PathBuf, BlobRef>) -> String {
        use blake3::Hasher;

        let mut hasher = Hasher::new();
        for (path, blob_ref) in file_tree {
            hasher.update(path.to_string_lossy().as_bytes());
            hasher.update(blob_ref.hash.as_bytes());
            hasher.update(&blob_ref.size.to_le_bytes());
        }
        hasher.finalize().to_hex().to_string()
    }
}
```

### 2.4 Branch

```rust
/// A branch in the TimeWarp DAG.
///
/// Branches represent parallel timelines of agent work.
/// The DAG structure allows arbitrary forking and merging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    /// Unique branch identifier.
    pub branch_id: Uuid,

    /// Human-readable branch name (e.g., "main", "experiment/new-auth").
    pub name: String,

    /// Parent branch from which this branch was forked.
    /// None for the root branch.
    pub parent_branch_id: Option<Uuid>,

    /// Event at which this branch was forked from the parent.
    pub fork_event_id: Option<Uuid>,

    /// The most recent event on this branch (tip of the branch).
    pub head_event_id: Option<Uuid>,

    /// Current lifecycle status.
    pub status: BranchStatus,

    /// When this branch was created.
    pub created_at: DateTime<Utc>,

    /// When this branch was last updated (new event appended).
    pub updated_at: DateTime<Utc>,

    /// Optional description of what this branch is for.
    pub description: Option<String>,

    /// Extensible metadata.
    pub metadata: Value,
}

/// Lifecycle status of a branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BranchStatus {
    /// Normal operating branch.
    Active,
    /// Branch has been merged into another branch.
    Merged,
    /// Branch is archived (read-only, not deleted).
    Archived,
    /// Branch is soft-deleted (can be recovered).
    Deleted,
}
```

### 2.5 Conflict

```rust
/// A conflict detected during branch merge or workspace restoration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conflict {
    /// Unique conflict identifier.
    pub conflict_id: Uuid,

    /// First branch involved.
    pub branch_a: Uuid,

    /// Second branch involved.
    pub branch_b: Uuid,

    /// Classification of the conflict.
    pub conflict_type: ConflictType,

    /// File path where the conflict occurs (if file-level).
    pub file_path: Option<PathBuf>,

    /// Human-readable description of the conflict.
    pub description: String,

    /// How the conflict was resolved (if resolved).
    pub resolution: Option<ConflictResolution>,

    /// Severity assessment (0.0 = trivial, 1.0 = critical).
    pub severity: f64,

    /// When this conflict was detected.
    pub detected_at: DateTime<Utc>,

    /// When this conflict was resolved.
    pub resolved_at: Option<DateTime<Utc>>,
}

/// Classification of conflict types, ordered by detection layer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "layer", rename_all = "snake_case")]
pub enum ConflictType {
    /// Layer 1: Byte-level / structural conflict.
    /// Same file modified on both branches with different content.
    Structural {
        /// Content hash on branch A.
        hash_a: String,
        /// Content hash on branch B.
        hash_b: String,
    },

    /// Layer 2: Semantic conflict detected via AST analysis (tree-sitter).
    /// Different changes that affect the same semantic unit (function, class, etc.).
    Semantic {
        /// The semantic unit (e.g., "fn handle_request").
        symbol: String,
        /// The language detected.
        language: String,
        /// AST node kind.
        node_kind: String,
    },

    /// Layer 3: Drift conflict.
    /// Changes on one branch invalidate assumptions made on the other
    /// (e.g., renaming a function that the other branch calls).
    Drift {
        /// What was assumed.
        assumption: String,
        /// What actually changed.
        reality: String,
    },
}

/// How a conflict was resolved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "strategy", rename_all = "snake_case")]
pub enum ConflictResolution {
    /// Keep branch A's version.
    TakeA,
    /// Keep branch B's version.
    TakeB,
    /// Manual merge (user-provided content).
    Manual { merged_content_hash: String },
    /// Automatic merge (e.g., non-overlapping changes).
    AutoMerge,
    /// Conflict was ignored / deferred.
    Deferred,
}
```

### 2.6 ReplayResult

```rust
/// Result of replaying a sequence of events in a container.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayResult {
    /// Unique replay run identifier.
    pub replay_id: Uuid,

    /// Branch that was replayed.
    pub branch_id: Uuid,

    /// Range of events replayed (inclusive).
    pub from_event_id: Uuid,
    pub to_event_id: Uuid,

    /// How closely the replay matched the original (0.0 = total divergence, 1.0 = exact match).
    pub reproducibility_score: f64,

    /// List of points where the replay diverged from the original.
    pub divergences: Vec<ReplayDivergence>,

    /// Total wall-clock time for the replay.
    pub duration: std::time::Duration,

    /// Number of events replayed.
    pub events_replayed: u64,

    /// Number of events skipped (e.g., LLM calls that cannot be deterministically replayed).
    pub events_skipped: u64,

    /// Snapshot ID of the final workspace state after replay.
    pub final_snapshot_id: Option<String>,

    /// When this replay was executed.
    pub executed_at: DateTime<Utc>,

    /// Container ID used for the replay (Docker).
    pub container_id: Option<String>,
}

/// A divergence point during replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayDivergence {
    /// Event that diverged.
    pub event_id: Uuid,

    /// What was expected (original output hash).
    pub expected_hash: String,

    /// What actually happened (replay output hash).
    pub actual_hash: String,

    /// Classification of the divergence.
    pub divergence_type: DivergenceType,

    /// Human-readable description.
    pub description: String,
}

/// Classification of why a replay diverged.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DivergenceType {
    /// Output content differs.
    ContentMismatch,
    /// Different files were touched.
    FileTouchMismatch,
    /// Command exited with different status.
    ExitCodeMismatch,
    /// Timing-dependent behavior differed.
    TimingDrift,
    /// Non-deterministic LLM response.
    LlmNonDeterminism,
    /// External dependency behaved differently.
    ExternalDependency,
}
```

### 2.7 Supporting Types

```rust
/// A point in the timeline for jump operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelinePoint {
    pub event_id: Uuid,
    pub branch_id: Uuid,
    pub snapshot_id: String,
    pub created_at: DateTime<Utc>,
    pub event_type: EventType,
    pub summary: String,
}

/// Query parameters for searching events.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EventQuery {
    pub branch_id: Option<Uuid>,
    pub event_types: Option<Vec<EventType>>,
    pub after: Option<DateTime<Utc>>,
    pub before: Option<DateTime<Utc>>,
    pub file_path: Option<PathBuf>,
    pub search_text: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Status of the TimeWarp system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeWarpStatus {
    pub current_branch: Branch,
    pub head_event: Option<Event>,
    pub total_events: u64,
    pub total_branches: u64,
    pub total_snapshots: u64,
    pub blob_store_size_bytes: u64,
    pub db_size_bytes: u64,
}

/// Backup metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub backup_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub total_events: u64,
    pub total_snapshots: u64,
    pub total_blobs: u64,
    pub compressed_size_bytes: u64,
    pub format_version: u32,
    pub description: Option<String>,
}
```

---

## 3. SQLite Schema

### 3.1 Migration System

TimeWarp uses a file-based migration system. Migrations are embedded in the binary
via `include_str!` and applied at startup in order. The `db.rs` module manages this.

### 3.2 Migration 001: Initial Schema

```sql
-- migrations/001_initial_schema.sql
-- TimeWarp initial database schema
-- Applied at first startup

-- Enable WAL mode for concurrent read/write.
-- WAL allows readers to proceed without blocking writers and vice versa.
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- =========================================================================
-- Schema version tracking
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    description TEXT
);

INSERT INTO tw_schema_version (version, description)
VALUES (1, 'Initial TimeWarp schema');

-- =========================================================================
-- Events table: append-only log of all agent actions
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_events (
    -- UUID v7 stored as TEXT (36 chars). TEXT comparison preserves time ordering.
    event_id      TEXT PRIMARY KEY NOT NULL,

    -- JSON array of parent event UUIDs. "[]" for genesis event.
    parent_ids    TEXT NOT NULL DEFAULT '[]',

    -- Branch this event belongs to.
    branch_id     TEXT NOT NULL,

    -- Event classification as JSON (tagged enum).
    event_type    TEXT NOT NULL,

    -- Inputs that triggered this event (opaque JSON).
    inputs        TEXT NOT NULL DEFAULT '{}',

    -- Outputs produced by this event (opaque JSON).
    outputs       TEXT NOT NULL DEFAULT '{}',

    -- JSON array of file paths touched.
    file_touches  TEXT NOT NULL DEFAULT '[]',

    -- Content-addressed snapshot ID (BLAKE3 hash, 64 hex chars).
    snapshot_id   TEXT,

    -- Hash of the previous event on this branch (hash chain link).
    prev_hash     TEXT,

    -- BLAKE3 hash of this event's canonical form.
    event_hash    TEXT NOT NULL UNIQUE,

    -- ISO 8601 timestamp with microsecond precision.
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Extensible metadata as JSON.
    metadata      TEXT NOT NULL DEFAULT '{}',

    -- Foreign key to branch.
    FOREIGN KEY (branch_id) REFERENCES tw_branches(branch_id)
);

-- =========================================================================
-- Snapshots table: index of content-addressed workspace snapshots
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_snapshots (
    -- Content-addressed ID (BLAKE3 hash of the file tree manifest).
    snapshot_id    TEXT PRIMARY KEY NOT NULL,

    -- Base snapshot for delta compression (NULL = full snapshot).
    base_snapshot  TEXT,

    -- Serialized BTreeMap<PathBuf, BlobRef> as JSON.
    file_tree      TEXT NOT NULL,

    -- Statistics.
    total_files    INTEGER NOT NULL DEFAULT 0,
    total_bytes    INTEGER NOT NULL DEFAULT 0,

    -- ISO 8601 timestamp.
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Optional human-readable label.
    label          TEXT,

    FOREIGN KEY (base_snapshot) REFERENCES tw_snapshots(snapshot_id)
);

-- =========================================================================
-- Branches table: DAG of parallel timelines
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_branches (
    branch_id        TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL,
    parent_branch_id TEXT,
    fork_event_id    TEXT,
    head_event_id    TEXT,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'merged', 'archived', 'deleted')),
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    description      TEXT,
    metadata         TEXT NOT NULL DEFAULT '{}',

    FOREIGN KEY (parent_branch_id) REFERENCES tw_branches(branch_id),
    FOREIGN KEY (fork_event_id)    REFERENCES tw_events(event_id),
    FOREIGN KEY (head_event_id)    REFERENCES tw_events(event_id)
);

-- =========================================================================
-- Blobs table: registry of content-addressed file blobs
-- (actual blob data lives on disk in .timewarp/blobs/)
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_blobs (
    -- BLAKE3 hash of the file content (64 hex chars).
    blob_hash    TEXT PRIMARY KEY NOT NULL,

    -- Size of the blob in bytes.
    size_bytes   INTEGER NOT NULL,

    -- Reference count (how many snapshots reference this blob).
    ref_count    INTEGER NOT NULL DEFAULT 1,

    -- Whether this is a delta blob.
    is_delta     INTEGER NOT NULL DEFAULT 0,

    -- Base blob for delta blobs.
    delta_base   TEXT,

    -- Compression algorithm used (none, zstd, lz4).
    compression  TEXT NOT NULL DEFAULT 'none',

    -- When first stored.
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (delta_base) REFERENCES tw_blobs(blob_hash)
);

-- =========================================================================
-- Conflicts table: merge conflicts
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_conflicts (
    conflict_id    TEXT PRIMARY KEY NOT NULL,
    branch_a       TEXT NOT NULL,
    branch_b       TEXT NOT NULL,
    conflict_type  TEXT NOT NULL,   -- JSON-serialized ConflictType
    file_path      TEXT,
    description    TEXT NOT NULL,
    resolution     TEXT,            -- JSON-serialized ConflictResolution, NULL if unresolved
    severity       REAL NOT NULL DEFAULT 0.5,
    detected_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    resolved_at    TEXT,

    FOREIGN KEY (branch_a) REFERENCES tw_branches(branch_id),
    FOREIGN KEY (branch_b) REFERENCES tw_branches(branch_id)
);

-- =========================================================================
-- Replay results table
-- =========================================================================
CREATE TABLE IF NOT EXISTS tw_replay_results (
    replay_id              TEXT PRIMARY KEY NOT NULL,
    branch_id              TEXT NOT NULL,
    from_event_id          TEXT NOT NULL,
    to_event_id            TEXT NOT NULL,
    reproducibility_score  REAL NOT NULL,
    divergences            TEXT NOT NULL DEFAULT '[]',  -- JSON array
    duration_ms            INTEGER NOT NULL,
    events_replayed        INTEGER NOT NULL,
    events_skipped         INTEGER NOT NULL DEFAULT 0,
    final_snapshot_id      TEXT,
    executed_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    container_id           TEXT,

    FOREIGN KEY (branch_id)     REFERENCES tw_branches(branch_id),
    FOREIGN KEY (from_event_id) REFERENCES tw_events(event_id),
    FOREIGN KEY (to_event_id)   REFERENCES tw_events(event_id)
);
```

### 3.3 Migration 002: Indexes and Views

```sql
-- migrations/002_indexes_and_views.sql
-- Performance indexes and convenience views

-- =========================================================================
-- Indexes for timeline queries
-- =========================================================================

-- Primary timeline query: events on a branch, ordered by time.
CREATE INDEX IF NOT EXISTS idx_events_branch_created
    ON tw_events(branch_id, created_at);

-- Filter by event type.
CREATE INDEX IF NOT EXISTS idx_events_type
    ON tw_events(event_type);

-- Lookup by hash (integrity verification).
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_hash
    ON tw_events(event_hash);

-- Snapshot lookup from events.
CREATE INDEX IF NOT EXISTS idx_events_snapshot
    ON tw_events(snapshot_id)
    WHERE snapshot_id IS NOT NULL;

-- Parent lookup for DAG traversal.
CREATE INDEX IF NOT EXISTS idx_events_parents
    ON tw_events(parent_ids);

-- File-level queries: "which events touched this file?"
-- Uses JSON_EACH for SQLite JSON array scanning.
-- (Requires SQLite 3.38+ for JSON_EACH index support; fallback to full scan on older.)
CREATE INDEX IF NOT EXISTS idx_events_created_at
    ON tw_events(created_at);

-- Snapshot base chain traversal.
CREATE INDEX IF NOT EXISTS idx_snapshots_base
    ON tw_snapshots(base_snapshot)
    WHERE base_snapshot IS NOT NULL;

-- Branch status filter.
CREATE INDEX IF NOT EXISTS idx_branches_status
    ON tw_branches(status);

-- Branch name lookup (unique within active branches).
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_active_name
    ON tw_branches(name)
    WHERE status = 'active';

-- Blob reference counting for garbage collection.
CREATE INDEX IF NOT EXISTS idx_blobs_ref_count
    ON tw_blobs(ref_count)
    WHERE ref_count = 0;

-- Conflict status for open conflicts.
CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved
    ON tw_conflicts(branch_a, branch_b)
    WHERE resolution IS NULL;

-- =========================================================================
-- Views
-- =========================================================================

-- Timeline view: human-readable event timeline for a branch.
CREATE VIEW IF NOT EXISTS tw_timeline AS
SELECT
    e.event_id,
    e.branch_id,
    b.name AS branch_name,
    e.event_type,
    e.file_touches,
    e.snapshot_id,
    e.event_hash,
    e.created_at,
    e.metadata
FROM tw_events e
JOIN tw_branches b ON e.branch_id = b.branch_id
ORDER BY e.created_at DESC;

-- Branch summary view.
CREATE VIEW IF NOT EXISTS tw_branch_summary AS
SELECT
    b.branch_id,
    b.name,
    b.status,
    b.created_at,
    b.updated_at,
    COUNT(e.event_id) AS event_count,
    MIN(e.created_at) AS first_event_at,
    MAX(e.created_at) AS last_event_at
FROM tw_branches b
LEFT JOIN tw_events e ON e.branch_id = b.branch_id
GROUP BY b.branch_id;
```

---

## 4. Content-Addressed Storage

### 4.1 Blob Store Design

```
.timewarp/
├── timewarp.db           # SQLite database
├── timewarp.db-wal       # WAL file (auto-managed)
├── timewarp.db-shm       # Shared memory (auto-managed)
└── blobs/
    ├── 00/
    │   ├── 0a1b2c...     # First 2 hex chars as directory sharding
    │   └── 0f3d4e...
    ├── 01/
    │   └── ...
    ├── ...
    └── ff/
        └── ...
```

### 4.2 blob_store.rs

```rust
use crate::errors::{TimeWarpError, TimeWarpResult};
use blake3::Hasher;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// Content-addressed blob storage on disk.
///
/// Blobs are stored in a sharded directory structure:
/// `.timewarp/blobs/{first_2_hex_chars}/{full_hash}`
///
/// Deduplication is automatic: storing the same content twice
/// is a no-op (the hash already exists).
pub struct BlobStore {
    /// Root directory for blob storage.
    root: PathBuf,
}

impl BlobStore {
    /// Create a new blob store rooted at the given directory.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Compute the BLAKE3 hash of the given data.
    pub fn hash(data: &[u8]) -> String {
        let mut hasher = Hasher::new();
        hasher.update(data);
        hasher.finalize().to_hex().to_string()
    }

    /// Get the filesystem path for a blob hash.
    fn blob_path(&self, hash: &str) -> PathBuf {
        let shard = &hash[..2];
        self.root.join(shard).join(hash)
    }

    /// Store a blob. Returns the BLAKE3 hash.
    /// If the blob already exists (same hash), this is a no-op.
    pub async fn store(&self, data: &[u8]) -> TimeWarpResult<String> {
        let hash = Self::hash(data);
        let path = self.blob_path(&hash);

        if path.exists() {
            return Ok(hash); // Dedup: already stored
        }

        // Ensure shard directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                TimeWarpError::Storage(format!("Failed to create shard dir: {}", e))
            })?;
        }

        // Write atomically: write to temp file, then rename
        let tmp_path = path.with_extension("tmp");
        let mut file = fs::File::create(&tmp_path).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to create temp blob: {}", e))
        })?;
        file.write_all(data).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to write blob: {}", e))
        })?;
        file.sync_all().await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to sync blob: {}", e))
        })?;

        fs::rename(&tmp_path, &path).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to rename blob: {}", e))
        })?;

        Ok(hash)
    }

    /// Retrieve a blob by hash. Returns None if not found.
    pub async fn get(&self, hash: &str) -> TimeWarpResult<Option<Vec<u8>>> {
        let path = self.blob_path(hash);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read(&path).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to read blob {}: {}", hash, e))
        })?;

        // Verify integrity
        let actual_hash = Self::hash(&data);
        if actual_hash != hash {
            return Err(TimeWarpError::Integrity(format!(
                "Blob hash mismatch: expected {}, got {}",
                hash, actual_hash
            )));
        }

        Ok(Some(data))
    }

    /// Check if a blob exists.
    pub async fn exists(&self, hash: &str) -> bool {
        self.blob_path(hash).exists()
    }

    /// Delete a blob by hash. Returns true if it existed.
    pub async fn delete(&self, hash: &str) -> TimeWarpResult<bool> {
        let path = self.blob_path(hash);
        if !path.exists() {
            return Ok(false);
        }
        fs::remove_file(&path).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to delete blob {}: {}", hash, e))
        })?;
        Ok(true)
    }

    /// Calculate total size of the blob store in bytes.
    pub async fn total_size(&self) -> TimeWarpResult<u64> {
        let mut total: u64 = 0;
        let mut read_dir = fs::read_dir(&self.root).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to read blob store: {}", e))
        })?;

        while let Some(shard_entry) = read_dir.next_entry().await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to iterate blob store: {}", e))
        })? {
            if shard_entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
                let mut shard_dir = fs::read_dir(shard_entry.path()).await.map_err(|e| {
                    TimeWarpError::Storage(format!("Failed to read shard: {}", e))
                })?;
                while let Some(blob_entry) = shard_dir.next_entry().await.map_err(|e| {
                    TimeWarpError::Storage(format!("Failed to iterate shard: {}", e))
                })? {
                    if let Ok(meta) = blob_entry.metadata().await {
                        total += meta.len();
                    }
                }
            }
        }

        Ok(total)
    }

    /// Garbage collect: remove blobs not referenced by any snapshot.
    /// This should be called with a set of hashes that are still referenced.
    pub async fn gc(&self, referenced: &std::collections::HashSet<String>) -> TimeWarpResult<GcReport> {
        let mut removed = 0u64;
        let mut freed_bytes = 0u64;

        let mut read_dir = fs::read_dir(&self.root).await.map_err(|e| {
            TimeWarpError::Storage(format!("Failed to read blob store for GC: {}", e))
        })?;

        while let Some(shard_entry) = read_dir.next_entry().await.unwrap_or(None).into_iter().next()
        {
            // Simplified: iterate shard directories
            if shard_entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
                let mut shard_dir = fs::read_dir(shard_entry.path()).await.map_err(|e| {
                    TimeWarpError::Storage(format!("GC shard read error: {}", e))
                })?;
                while let Some(blob_entry) = shard_dir.next_entry().await.unwrap_or(None).into_iter().next()
                {
                    let name = blob_entry.file_name().to_string_lossy().to_string();
                    if !name.ends_with(".tmp") && !referenced.contains(&name) {
                        if let Ok(meta) = blob_entry.metadata().await {
                            freed_bytes += meta.len();
                        }
                        let _ = fs::remove_file(blob_entry.path()).await;
                        removed += 1;
                    }
                }
            }
        }

        Ok(GcReport {
            blobs_removed: removed,
            bytes_freed: freed_bytes,
        })
    }
}

/// Report from garbage collection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GcReport {
    pub blobs_removed: u64,
    pub bytes_freed: u64,
}
```

### 4.3 Delta Compression Strategy

```
Full Snapshot (every N=50 deltas):
  file_tree: { "src/main.rs": <hash_A>, "Cargo.toml": <hash_B>, ... }

Delta Snapshot (subsequent events):
  base_snapshot: <full_snapshot_id>
  file_tree: { "src/main.rs": <hash_C> }   // Only changed files

Reconstruction:
  1. Find the nearest full snapshot by following base_snapshot chain.
  2. Start with the full snapshot's file_tree.
  3. Apply each delta in order (overlay changed files).
  4. Result = complete file_tree at the target event.
```

The `FULL_SNAPSHOT_INTERVAL` constant (default 50) controls compaction frequency.
After every 50 delta snapshots, a full snapshot is automatically created.

---

## 5. Public API (Traits)

All core components are defined as traits for testability (mock implementations) and
future extensibility (different storage backends).

### 5.1 Core Traits

```rust
// src/lib.rs — trait definitions

use crate::models::*;
use crate::errors::TimeWarpResult;
use async_trait::async_trait;

/// Top-level TimeWarp system interface.
#[async_trait]
pub trait TimeWarpStore: Send + Sync {
    /// Get the current system status.
    async fn status(&self) -> TimeWarpResult<TimeWarpStatus>;

    /// Jump to a specific event, restoring the workspace to that state.
    async fn jump(&self, event_id: Uuid) -> TimeWarpResult<Snapshot>;

    /// Get the timeline for the current branch (paginated).
    async fn timeline(&self, query: EventQuery) -> TimeWarpResult<Vec<TimelinePoint>>;

    /// Search events by text content in inputs/outputs.
    async fn search(&self, query: &str, limit: u32) -> TimeWarpResult<Vec<Event>>;

    /// Initialize the TimeWarp system for a workspace.
    async fn init(&self, workspace_root: &Path) -> TimeWarpResult<()>;
}

/// Append-only event log with hash chain integrity.
#[async_trait]
pub trait EventStore: Send + Sync {
    /// Append a new event to the log. Computes and sets event_hash.
    async fn append(&self, event: &mut Event) -> TimeWarpResult<()>;

    /// Get an event by ID.
    async fn get(&self, event_id: Uuid) -> TimeWarpResult<Option<Event>>;

    /// Get events matching a query.
    async fn query(&self, query: &EventQuery) -> TimeWarpResult<Vec<Event>>;

    /// Get the chain of events from root to the given event (ancestry path).
    async fn ancestry(&self, event_id: Uuid) -> TimeWarpResult<Vec<Event>>;

    /// Verify the hash chain integrity for a range of events.
    async fn verify_chain(
        &self,
        branch_id: Uuid,
        from: Option<Uuid>,
        to: Option<Uuid>,
    ) -> TimeWarpResult<ChainVerification>;

    /// Count events matching a query.
    async fn count(&self, query: &EventQuery) -> TimeWarpResult<u64>;
}

/// Verification result for hash chain integrity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainVerification {
    pub valid: bool,
    pub events_checked: u64,
    pub first_invalid: Option<Uuid>,
    pub error_message: Option<String>,
}

/// Content-addressed workspace snapshot store.
#[async_trait]
pub trait SnapshotStore: Send + Sync {
    /// Create a snapshot of the current workspace state.
    async fn capture(&self, workspace_root: &Path, label: Option<String>) -> TimeWarpResult<Snapshot>;

    /// Get a snapshot by ID.
    async fn get(&self, snapshot_id: &str) -> TimeWarpResult<Option<Snapshot>>;

    /// Restore a snapshot to the workspace (overwrite files).
    async fn restore(&self, snapshot_id: &str, workspace_root: &Path) -> TimeWarpResult<()>;

    /// Reconstruct the full file tree for a snapshot (resolving delta chain).
    async fn reconstruct(&self, snapshot_id: &str) -> TimeWarpResult<BTreeMap<PathBuf, BlobRef>>;

    /// Compute the diff between two snapshots.
    async fn diff(
        &self,
        snapshot_a: &str,
        snapshot_b: &str,
    ) -> TimeWarpResult<SnapshotDiff>;

    /// Trigger compaction: create a full snapshot from the current delta chain.
    async fn compact(&self, snapshot_id: &str) -> TimeWarpResult<Snapshot>;
}

/// Diff between two snapshots.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotDiff {
    pub added: Vec<PathBuf>,
    pub modified: Vec<PathBuf>,
    pub deleted: Vec<PathBuf>,
    pub unchanged: u64,
}

/// DAG-based branch management.
#[async_trait]
pub trait BranchManager: Send + Sync {
    /// Create a new branch forked from the current position.
    async fn create(
        &self,
        name: &str,
        fork_from_event: Option<Uuid>,
        description: Option<String>,
    ) -> TimeWarpResult<Branch>;

    /// Switch the active branch.
    async fn switch(&self, branch_id: Uuid) -> TimeWarpResult<Branch>;

    /// Merge a source branch into a target branch.
    async fn merge(
        &self,
        source_branch_id: Uuid,
        target_branch_id: Uuid,
    ) -> TimeWarpResult<MergeResult>;

    /// Delete (soft-delete) a branch.
    async fn delete(&self, branch_id: Uuid) -> TimeWarpResult<()>;

    /// List all branches with optional status filter.
    async fn list(&self, status: Option<BranchStatus>) -> TimeWarpResult<Vec<Branch>>;

    /// Get a branch by ID.
    async fn get(&self, branch_id: Uuid) -> TimeWarpResult<Option<Branch>>;

    /// Get the currently active branch.
    async fn current(&self) -> TimeWarpResult<Branch>;

    /// Rename a branch.
    async fn rename(&self, branch_id: Uuid, new_name: &str) -> TimeWarpResult<()>;
}

/// Result of merging two branches.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub merge_event_id: Uuid,
    pub conflicts: Vec<Conflict>,
    pub auto_resolved: u64,
    pub manual_required: u64,
}

/// Deterministic replay engine.
#[async_trait]
pub trait ReplayEngine: Send + Sync {
    /// Replay a range of events from a branch.
    async fn replay(
        &self,
        branch_id: Uuid,
        from_event: Option<Uuid>,
        to_event: Option<Uuid>,
        options: ReplayOptions,
    ) -> TimeWarpResult<ReplayResult>;

    /// Cancel a running replay.
    async fn cancel(&self, replay_id: Uuid) -> TimeWarpResult<()>;

    /// Get the status of a running replay.
    async fn status(&self, replay_id: Uuid) -> TimeWarpResult<Option<ReplayStatus>>;
}

/// Options for replay execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayOptions {
    /// Use Docker container for isolation.
    pub use_container: bool,
    /// Docker image to use (default: workspace-specific).
    pub container_image: Option<String>,
    /// Skip non-deterministic events (LLM calls).
    pub skip_llm_calls: bool,
    /// Timeout per event in seconds.
    pub event_timeout_secs: u64,
    /// Total timeout in seconds.
    pub total_timeout_secs: u64,
    /// Whether to capture output for comparison.
    pub capture_output: bool,
}

impl Default for ReplayOptions {
    fn default() -> Self {
        Self {
            use_container: true,
            container_image: None,
            skip_llm_calls: true,
            event_timeout_secs: 60,
            total_timeout_secs: 3600,
            capture_output: true,
        }
    }
}

/// Status of a running replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayStatus {
    pub replay_id: Uuid,
    pub state: ReplayState,
    pub events_completed: u64,
    pub events_total: u64,
    pub current_event_id: Option<Uuid>,
    pub elapsed: std::time::Duration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReplayState {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Three-layer conflict detection engine.
#[async_trait]
pub trait ConflictDetector: Send + Sync {
    /// Detect conflicts between two branches.
    async fn detect(
        &self,
        branch_a: Uuid,
        branch_b: Uuid,
    ) -> TimeWarpResult<Vec<Conflict>>;

    /// Detect conflicts for a specific file between two snapshots.
    async fn detect_file(
        &self,
        file_path: &Path,
        snapshot_a: &str,
        snapshot_b: &str,
    ) -> TimeWarpResult<Option<Conflict>>;

    /// Attempt to auto-resolve a conflict.
    async fn auto_resolve(&self, conflict_id: Uuid) -> TimeWarpResult<Option<ConflictResolution>>;

    /// Manually resolve a conflict.
    async fn resolve(
        &self,
        conflict_id: Uuid,
        resolution: ConflictResolution,
    ) -> TimeWarpResult<()>;

    /// List unresolved conflicts.
    async fn unresolved(&self) -> TimeWarpResult<Vec<Conflict>>;
}
```

---

## 6. Module Specifications

### 6.1 `db.rs` -- Database Layer

```rust
use rusqlite::{Connection, OpenFlags};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Database configuration.
#[derive(Debug, Clone)]
pub struct DbConfig {
    /// Path to the SQLite database file.
    pub path: PathBuf,
    /// Enable WAL mode (recommended: true).
    pub wal_mode: bool,
    /// Busy timeout in milliseconds.
    pub busy_timeout_ms: u32,
}

impl Default for DbConfig {
    fn default() -> Self {
        Self {
            path: PathBuf::from(".timewarp/timewarp.db"),
            wal_mode: true,
            busy_timeout_ms: 5000,
        }
    }
}

/// Database connection manager.
///
/// Uses rusqlite directly (not sqlx) for maximum control over
/// SQLite-specific features (PRAGMA, JSON functions, etc.).
/// Wraps the connection in Arc<Mutex<>> for async safety.
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open (or create) the database with migrations applied.
    pub async fn open(config: &DbConfig) -> TimeWarpResult<Self> {
        // Ensure parent directory exists
        if let Some(parent) = config.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                TimeWarpError::Storage(format!("Cannot create DB directory: {}", e))
            })?;
        }

        let conn = Connection::open_with_flags(
            &config.path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| TimeWarpError::Database(format!("Failed to open DB: {}", e)))?;

        // Apply PRAGMAs
        if config.wal_mode {
            conn.execute_batch("PRAGMA journal_mode = WAL;")
                .map_err(|e| TimeWarpError::Database(format!("WAL mode failed: {}", e)))?;
        }
        conn.execute_batch(&format!(
            "PRAGMA busy_timeout = {};",
            config.busy_timeout_ms
        ))
        .map_err(|e| TimeWarpError::Database(format!("busy_timeout failed: {}", e)))?;
        conn.execute_batch("PRAGMA synchronous = NORMAL;")
            .map_err(|e| TimeWarpError::Database(format!("synchronous failed: {}", e)))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| TimeWarpError::Database(format!("foreign_keys failed: {}", e)))?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        // Run migrations
        db.migrate().await?;

        Ok(db)
    }

    /// Run all pending migrations.
    async fn migrate(&self) -> TimeWarpResult<()> {
        let conn = self.conn.lock().await;

        let current_version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM tw_schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Embedded migrations
        let migrations: Vec<(i64, &str, &str)> = vec![
            (1, "Initial schema", include_str!("../migrations/001_initial_schema.sql")),
            (2, "Indexes and views", include_str!("../migrations/002_indexes_and_views.sql")),
        ];

        for (version, description, sql) in &migrations {
            if *version > current_version {
                conn.execute_batch(sql).map_err(|e| {
                    TimeWarpError::Database(format!(
                        "Migration {} ({}) failed: {}",
                        version, description, e
                    ))
                })?;
                conn.execute(
                    "INSERT INTO tw_schema_version (version, description) VALUES (?1, ?2)",
                    rusqlite::params![version, description],
                )
                .map_err(|e| {
                    TimeWarpError::Database(format!("Failed to record migration: {}", e))
                })?;
                tracing::info!("Applied migration {}: {}", version, description);
            }
        }

        Ok(())
    }

    /// Get a reference to the connection for executing queries.
    pub fn conn(&self) -> &Arc<Mutex<Connection>> {
        &self.conn
    }
}
```

### 6.2 `errors.rs`

```rust
use thiserror::Error;

/// TimeWarp error types.
#[derive(Error, Debug)]
pub enum TimeWarpError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Integrity error: {0}")]
    Integrity(String),

    #[error("Branch error: {0}")]
    Branch(String),

    #[error("Snapshot error: {0}")]
    Snapshot(String),

    #[error("Replay error: {0}")]
    Replay(String),

    #[error("Conflict error: {0}")]
    Conflict(String),

    #[error("MCP middleware error: {0}")]
    Middleware(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Docker error: {0}")]
    Docker(String),

    #[error("Tree-sitter error: {0}")]
    TreeSitter(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Convenience type alias.
pub type TimeWarpResult<T> = Result<T, TimeWarpError>;

impl From<rusqlite::Error> for TimeWarpError {
    fn from(err: rusqlite::Error) -> Self {
        TimeWarpError::Database(err.to_string())
    }
}

impl From<serde_json::Error> for TimeWarpError {
    fn from(err: serde_json::Error) -> Self {
        TimeWarpError::Serialization(err.to_string())
    }
}
```

### 6.3 `event_store.rs` -- Key Implementation Details

```rust
use crate::db::Database;
use crate::errors::{TimeWarpError, TimeWarpResult};
use crate::models::*;
use async_trait::async_trait;
use std::sync::Arc;

/// SQLite-backed event store with hash chain integrity.
pub struct SqliteEventStore {
    db: Arc<Database>,
}

impl SqliteEventStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl EventStore for SqliteEventStore {
    async fn append(&self, event: &mut Event) -> TimeWarpResult<()> {
        // 1. Retrieve the previous event's hash for this branch
        let conn = self.db.conn().lock().await;

        let prev_hash: Option<String> = conn
            .query_row(
                "SELECT event_hash FROM tw_events
                 WHERE branch_id = ?1
                 ORDER BY created_at DESC
                 LIMIT 1",
                rusqlite::params![event.branch_id.to_string()],
                |row| row.get(0),
            )
            .ok();

        event.prev_hash = prev_hash;

        // 2. Compute the event hash
        event.event_hash = event.compute_hash();

        // 3. Insert into the database
        conn.execute(
            "INSERT INTO tw_events
             (event_id, parent_ids, branch_id, event_type, inputs, outputs,
              file_touches, snapshot_id, prev_hash, event_hash, created_at, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                event.event_id.to_string(),
                serde_json::to_string(&event.parent_ids)?,
                event.branch_id.to_string(),
                serde_json::to_string(&event.event_type)?,
                event.inputs.to_string(),
                event.outputs.to_string(),
                serde_json::to_string(&event.file_touches)?,
                event.snapshot_id.as_deref(),
                event.prev_hash.as_deref(),
                &event.event_hash,
                event.created_at.to_rfc3339(),
                event.metadata.to_string(),
            ],
        )?;

        // 4. Update branch head
        conn.execute(
            "UPDATE tw_branches SET head_event_id = ?1, updated_at = ?2
             WHERE branch_id = ?3",
            rusqlite::params![
                event.event_id.to_string(),
                event.created_at.to_rfc3339(),
                event.branch_id.to_string(),
            ],
        )?;

        Ok(())
    }

    async fn get(&self, event_id: Uuid) -> TimeWarpResult<Option<Event>> {
        let conn = self.db.conn().lock().await;
        let result = conn.query_row(
            "SELECT event_id, parent_ids, branch_id, event_type, inputs, outputs,
                    file_touches, snapshot_id, prev_hash, event_hash, created_at, metadata
             FROM tw_events WHERE event_id = ?1",
            rusqlite::params![event_id.to_string()],
            |row| {
                Ok(Event {
                    event_id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap(),
                    parent_ids: serde_json::from_str(&row.get::<_, String>(1)?).unwrap_or_default(),
                    branch_id: Uuid::parse_str(&row.get::<_, String>(2)?).unwrap(),
                    event_type: serde_json::from_str(&row.get::<_, String>(3)?).unwrap(),
                    inputs: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(),
                    outputs: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
                    file_touches: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
                    snapshot_id: row.get(7)?,
                    prev_hash: row.get(8)?,
                    event_hash: row.get(9)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                    metadata: serde_json::from_str(&row.get::<_, String>(11)?).unwrap_or_default(),
                })
            },
        );

        match result {
            Ok(event) => Ok(Some(event)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(TimeWarpError::Database(e.to_string())),
        }
    }

    async fn verify_chain(
        &self,
        branch_id: Uuid,
        _from: Option<Uuid>,
        _to: Option<Uuid>,
    ) -> TimeWarpResult<ChainVerification> {
        let conn = self.db.conn().lock().await;

        let mut stmt = conn.prepare(
            "SELECT event_id, prev_hash, event_hash, parent_ids, branch_id,
                    event_type, inputs, outputs, file_touches, snapshot_id,
                    created_at, metadata
             FROM tw_events
             WHERE branch_id = ?1
             ORDER BY created_at ASC",
        )?;

        let events: Vec<Event> = stmt
            .query_map(rusqlite::params![branch_id.to_string()], |row| {
                Ok(Event {
                    event_id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap(),
                    parent_ids: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                    branch_id: Uuid::parse_str(&row.get::<_, String>(4)?).unwrap(),
                    event_type: serde_json::from_str(&row.get::<_, String>(5)?).unwrap(),
                    inputs: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
                    outputs: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
                    file_touches: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or_default(),
                    snapshot_id: row.get(9)?,
                    prev_hash: row.get(1)?,
                    event_hash: row.get(2)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                    metadata: serde_json::from_str(&row.get::<_, String>(11)?).unwrap_or_default(),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut prev_hash: Option<String> = None;
        for (i, event) in events.iter().enumerate() {
            // Verify the event's own hash
            if !event.verify_hash() {
                return Ok(ChainVerification {
                    valid: false,
                    events_checked: i as u64,
                    first_invalid: Some(event.event_id),
                    error_message: Some(format!(
                        "Event {} hash mismatch: stored={}, computed={}",
                        event.event_id,
                        event.event_hash,
                        event.compute_hash()
                    )),
                });
            }

            // Verify chain linkage
            if event.prev_hash != prev_hash {
                return Ok(ChainVerification {
                    valid: false,
                    events_checked: i as u64,
                    first_invalid: Some(event.event_id),
                    error_message: Some(format!(
                        "Chain break at event {}: expected prev_hash={:?}, got={:?}",
                        event.event_id, prev_hash, event.prev_hash
                    )),
                });
            }

            prev_hash = Some(event.event_hash.clone());
        }

        Ok(ChainVerification {
            valid: true,
            events_checked: events.len() as u64,
            first_invalid: None,
            error_message: None,
        })
    }

    // query(), ancestry(), count() follow similar patterns...
    async fn query(&self, _query: &EventQuery) -> TimeWarpResult<Vec<Event>> {
        todo!("Implement parameterized query builder")
    }

    async fn ancestry(&self, _event_id: Uuid) -> TimeWarpResult<Vec<Event>> {
        todo!("Implement recursive CTE for DAG ancestry")
    }

    async fn count(&self, _query: &EventQuery) -> TimeWarpResult<u64> {
        todo!("Implement count query")
    }
}
```

### 6.4 `conflict_engine.rs` -- Three-Layer Detection

```rust
/// Three-layer conflict detection.
///
/// Layer 1 (Structural): Compare file hashes between snapshots.
///   - Same file, different hash = structural conflict.
///   - Fast: O(n) where n = number of files.
///
/// Layer 2 (Semantic): Parse files with tree-sitter, compare ASTs.
///   - Same function modified differently = semantic conflict.
///   - Medium: O(n * m) where m = AST nodes per file.
///   - Languages supported: Rust, Python, TypeScript, JavaScript, Go, Java, C, C++.
///
/// Layer 3 (Drift): Detect cross-file dependency violations.
///   - Function renamed on branch A, called by new code on branch B = drift.
///   - Slow: requires symbol resolution across files.

pub struct ThreeLayerConflictEngine {
    snapshot_store: Arc<dyn SnapshotStore>,
    // tree-sitter parsers are created on demand per language
}

impl ThreeLayerConflictEngine {
    pub fn new(snapshot_store: Arc<dyn SnapshotStore>) -> Self {
        Self { snapshot_store }
    }

    /// Layer 1: Structural (hash-based) conflict detection.
    async fn detect_structural(
        &self,
        tree_a: &BTreeMap<PathBuf, BlobRef>,
        tree_b: &BTreeMap<PathBuf, BlobRef>,
        common_ancestor: &BTreeMap<PathBuf, BlobRef>,
    ) -> TimeWarpResult<Vec<Conflict>> {
        let mut conflicts = Vec::new();

        // Files modified in both branches relative to common ancestor
        for (path, ancestor_ref) in common_ancestor {
            let a_ref = tree_a.get(path);
            let b_ref = tree_b.get(path);

            match (a_ref, b_ref) {
                (Some(a), Some(b)) if a.hash != ancestor_ref.hash
                    && b.hash != ancestor_ref.hash
                    && a.hash != b.hash =>
                {
                    // Both branches modified the same file differently
                    conflicts.push(Conflict {
                        conflict_id: Uuid::new_v4(),
                        branch_a: Uuid::nil(), // filled by caller
                        branch_b: Uuid::nil(),
                        conflict_type: ConflictType::Structural {
                            hash_a: a.hash.clone(),
                            hash_b: b.hash.clone(),
                        },
                        file_path: Some(path.clone()),
                        description: format!("File '{}' modified on both branches", path.display()),
                        resolution: None,
                        severity: 0.7,
                        detected_at: Utc::now(),
                        resolved_at: None,
                    });
                }
                _ => {}
            }
        }

        Ok(conflicts)
    }

    /// Layer 2: Semantic (AST-based) conflict detection using tree-sitter.
    /// For each structural conflict, parse both versions and compare at the
    /// function/class/method level.
    async fn detect_semantic(
        &self,
        _structural_conflicts: &[Conflict],
        _snapshot_a: &str,
        _snapshot_b: &str,
    ) -> TimeWarpResult<Vec<Conflict>> {
        // For each file with a structural conflict:
        // 1. Detect language from file extension
        // 2. Parse both versions with tree-sitter
        // 3. Extract function/class definitions
        // 4. Compare: if the same symbol was modified differently, emit semantic conflict
        //
        // This requires tree-sitter language grammars loaded at runtime.
        // See Cargo.toml for the grammar crates.
        todo!("Implement tree-sitter based semantic diff")
    }

    /// Layer 3: Drift detection.
    /// Checks for cross-file dependencies that were broken.
    async fn detect_drift(
        &self,
        _tree_a: &BTreeMap<PathBuf, BlobRef>,
        _tree_b: &BTreeMap<PathBuf, BlobRef>,
    ) -> TimeWarpResult<Vec<Conflict>> {
        // 1. Build symbol index for each branch
        // 2. Find symbols referenced in branch B that were renamed/removed in branch A
        // 3. Emit drift conflicts
        todo!("Implement cross-file drift detection")
    }
}
```

### 6.5 `mcp_middleware.rs` -- Transparent Event Capture

```rust
/// MCP Middleware for transparent event capture.
///
/// This module sits between the goose agent and the MCP transport layer.
/// It observes every tool call, prompt, and resource access without
/// modifying the request or response.
///
/// Integration point: The middleware wraps the existing MCP client
/// and intercepts `call_tool`, `get_prompt`, and `read_resource` calls.

use crate::event_store::SqliteEventStore;
use crate::models::*;
use crate::snapshot_store::SqliteSnapshotStore;
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

/// MCP middleware that records events from tool calls.
pub struct McpTimeWarpMiddleware {
    event_store: Arc<dyn EventStore>,
    snapshot_store: Arc<dyn SnapshotStore>,
    branch_id: Arc<tokio::sync::RwLock<Uuid>>,
    workspace_root: PathBuf,
}

impl McpTimeWarpMiddleware {
    pub fn new(
        event_store: Arc<dyn EventStore>,
        snapshot_store: Arc<dyn SnapshotStore>,
        initial_branch_id: Uuid,
        workspace_root: PathBuf,
    ) -> Self {
        Self {
            event_store,
            snapshot_store,
            branch_id: Arc::new(tokio::sync::RwLock::new(initial_branch_id)),
            workspace_root,
        }
    }

    /// Record a tool call as an event.
    ///
    /// Called after the tool call completes. Captures both inputs and outputs.
    /// Determines the event type from the tool name and creates a snapshot
    /// if the tool modified files.
    pub async fn record_tool_call(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: &Value,
        result: &Value,
        file_touches: Vec<PathBuf>,
    ) -> crate::errors::TimeWarpResult<Uuid> {
        let event_type = self.classify_tool_call(server_name, tool_name, arguments);
        let branch_id = *self.branch_id.read().await;

        // Create snapshot only if files were touched
        let snapshot_id = if !file_touches.is_empty() {
            let snapshot = self
                .snapshot_store
                .capture(&self.workspace_root, None)
                .await?;
            Some(snapshot.snapshot_id)
        } else {
            None
        };

        let event_id = Uuid::now_v7();
        let mut event = Event {
            event_id,
            parent_ids: Vec::new(), // Set by event_store.append()
            branch_id,
            event_type,
            inputs: arguments.clone(),
            outputs: result.clone(),
            file_touches: file_touches.into_iter().collect(),
            snapshot_id,
            prev_hash: None, // Set by event_store.append()
            event_hash: String::new(), // Computed by event_store.append()
            created_at: chrono::Utc::now(),
            metadata: serde_json::json!({
                "server": server_name,
                "tool": tool_name,
            }),
        };

        self.event_store.append(&mut event).await?;

        Ok(event_id)
    }

    /// Classify a tool call into an EventType based on tool name.
    fn classify_tool_call(
        &self,
        server_name: &str,
        tool_name: &str,
        _arguments: &Value,
    ) -> EventType {
        match tool_name {
            // Developer tools (common MCP tool names)
            "write_file" | "create_file" | "edit_file" | "patch_file" => EventType::FileWrite,
            "read_file" | "read_multiple_files" => EventType::McpToolCall {
                server: server_name.to_string(),
                tool: tool_name.to_string(),
            },
            "delete_file" | "remove_file" => EventType::FileDelete,
            "rename_file" | "move_file" => EventType::FileRename {
                from: PathBuf::new(), // Extracted from arguments
                to: PathBuf::new(),
            },
            "execute_command" | "run_terminal_command" | "bash" => EventType::CmdExec,
            "git_commit" | "git_add" | "git_status" | "git_diff" | "git_log" => EventType::GitOp,

            // Default: generic MCP tool call
            _ => EventType::McpToolCall {
                server: server_name.to_string(),
                tool: tool_name.to_string(),
            },
        }
    }
}
```

### 6.6 `forward_projector.rs` -- What-If Simulation

```rust
/// Forward Projector: "What-If" simulation engine.
///
/// Creates temporary branches to explore hypothetical changes
/// without affecting the main timeline. Uses the replay engine
/// for sandboxed execution.
pub struct ForwardProjector {
    branch_manager: Arc<dyn BranchManager>,
    replay_engine: Arc<dyn ReplayEngine>,
    conflict_detector: Arc<dyn ConflictDetector>,
}

impl ForwardProjector {
    /// Create a what-if branch and replay modified events.
    pub async fn simulate(
        &self,
        base_event: Uuid,
        modified_events: Vec<Event>,
        options: SimulationOptions,
    ) -> TimeWarpResult<SimulationResult> {
        // 1. Create a temporary branch from base_event
        let branch = self
            .branch_manager
            .create(
                &format!("what-if/{}", Uuid::new_v4()),
                Some(base_event),
                Some("What-if simulation".to_string()),
            )
            .await?;

        // 2. Apply modified events on the temporary branch
        // 3. Run conflict detection against the original branch
        // 4. Return results including conflicts and final snapshot

        todo!("Implement forward projection")
    }
}

/// Options for what-if simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationOptions {
    /// Run in a Docker container for safety.
    pub sandboxed: bool,
    /// Auto-delete the simulation branch after completion.
    pub auto_cleanup: bool,
    /// Maximum events to simulate.
    pub max_events: u32,
    /// Timeout for the entire simulation.
    pub timeout_secs: u64,
}

/// Result of a what-if simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    pub simulation_id: Uuid,
    pub branch_id: Uuid,
    pub events_simulated: u64,
    pub conflicts_detected: Vec<Conflict>,
    pub final_snapshot_id: Option<String>,
    pub duration: std::time::Duration,
}
```

### 6.7 `backup_manager.rs`

```rust
/// Backup manager for export/import and cloud sync.
///
/// Backup format: a tar.zst archive containing:
///   manifest.json   -- BackupManifest
///   events.jsonl    -- All events as newline-delimited JSON
///   snapshots.jsonl -- All snapshot metadata as JSONL
///   blobs/          -- All referenced blob files
pub struct BackupManager {
    db: Arc<Database>,
    blob_store: Arc<BlobStore>,
}

impl BackupManager {
    /// Export the entire TimeWarp state to a compressed archive.
    pub async fn export(&self, output_path: &Path) -> TimeWarpResult<BackupManifest> {
        todo!("Implement tar.zst export")
    }

    /// Import a backup archive, merging with existing state.
    pub async fn import(&self, archive_path: &Path) -> TimeWarpResult<BackupManifest> {
        todo!("Implement tar.zst import")
    }

    /// Create an incremental backup (only events/blobs since last backup).
    pub async fn incremental_export(
        &self,
        output_path: &Path,
        since: DateTime<Utc>,
    ) -> TimeWarpResult<BackupManifest> {
        todo!("Implement incremental export")
    }
}
```

---

## 7. Cargo.toml

```toml
[package]
name = "timewarp"
version.workspace = true
edition.workspace = true
authors.workspace = true
license.workspace = true
repository.workspace = true
description = "Parametric timeline and time-travel for AI coding agents"

[lints]
workspace = true

[features]
default = []
# Enable Docker-based replay (requires bollard + Docker daemon)
docker-replay = ["bollard"]
# Enable tree-sitter semantic analysis
semantic-analysis = [
    "tree-sitter",
    "tree-sitter-rust",
    "tree-sitter-python",
    "tree-sitter-javascript",
    "tree-sitter-typescript",
]

[dependencies]
# --- Workspace dependencies ---
tokio = { workspace = true }
serde_json = { workspace = true }
tracing = { workspace = true }
anyhow = { workspace = true }

# --- Core ---
serde = { version = "1.0", features = ["derive"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4", "v7", "serde"] }
thiserror = "1.0"
async-trait = "0.1"

# --- Storage ---
rusqlite = { version = "0.31", features = ["bundled", "serde_json"] }
blake3 = "1.5"

# --- Docker (optional, for replay engine) ---
bollard = { version = "0.18", optional = true }

# --- Tree-sitter (optional, for semantic conflict detection) ---
tree-sitter = { version = "0.24", optional = true }
tree-sitter-rust = { version = "0.23", optional = true }
tree-sitter-python = { version = "0.23", optional = true }
tree-sitter-javascript = { version = "0.23", optional = true }
tree-sitter-typescript = { version = "0.23", optional = true }

# --- Compression ---
zstd = "0.13"

[dev-dependencies]
tokio = { workspace = true }
tempfile = "3.15"
proptest = "1.5"
criterion = { version = "0.5", features = ["async_tokio"] }
wiremock = { workspace = true }

[[bench]]
name = "snapshot_benchmark"
harness = false
```

### 7.1 Workspace Cargo.toml Addition

Add to the root `G:\goose\Cargo.toml` under `[workspace.dependencies]`:

```toml
# No changes needed: timewarp is auto-discovered via members = ["crates/*"]
```

The crate is auto-included by the existing `members = ["crates/*"]` glob.

---

## 8. Integration with goose-server

### 8.1 Route Module: `routes/timewarp.rs`

Add to `goose-server/Cargo.toml`:

```toml
[dependencies]
timewarp = { path = "../timewarp" }
```

Add to `goose-server/src/routes/mod.rs`:

```rust
pub mod timewarp;
// In configure():
.merge(timewarp::routes(state.clone()))
```

### 8.2 REST API Endpoints

```rust
// crates/goose-server/src/routes/timewarp.rs

use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use timewarp::models::*;
use utoipa::ToSchema;

// =========================================================================
// Request/Response types
// =========================================================================

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JumpRequest {
    event_id: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JumpResponse {
    snapshot_id: String,
    files_restored: u64,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateBranchRequest {
    name: String,
    fork_from_event: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MergeBranchRequest {
    source_branch_id: String,
    target_branch_id: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReplayRequest {
    branch_id: String,
    from_event: Option<String>,
    to_event: Option<String>,
    use_container: Option<bool>,
    skip_llm_calls: Option<bool>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventQueryParams {
    branch_id: Option<String>,
    event_type: Option<String>,
    after: Option<String>,
    before: Option<String>,
    file_path: Option<String>,
    search: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportRequest {
    description: Option<String>,
    incremental_since: Option<String>,
}

// =========================================================================
// Route handlers
// =========================================================================

/// GET /timewarp/status
/// Returns the current state of the TimeWarp system.
#[utoipa::path(
    get,
    path = "/timewarp/status",
    responses(
        (status = 200, description = "TimeWarp system status", body = TimeWarpStatus),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn get_status(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<TimeWarpStatus>, ErrorResponse> {
    // state.timewarp().status().await
    todo!()
}

/// GET /timewarp/events
/// List events with filtering and pagination.
#[utoipa::path(
    get,
    path = "/timewarp/events",
    params(EventQueryParams),
    responses(
        (status = 200, description = "List of events", body = Vec<Event>),
        (status = 400, description = "Invalid query parameters"),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn list_events(
    State(_state): State<Arc<AppState>>,
    Query(_params): Query<EventQueryParams>,
) -> Result<Json<Vec<Event>>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/events/{event_id}
/// Get a single event by ID.
#[utoipa::path(
    get,
    path = "/timewarp/events/{event_id}",
    params(("event_id" = String, Path, description = "Event UUID")),
    responses(
        (status = 200, description = "Event details", body = Event),
        (status = 404, description = "Event not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn get_event(
    State(_state): State<Arc<AppState>>,
    Path(_event_id): Path<String>,
) -> Result<Json<Event>, ErrorResponse> {
    todo!()
}

/// POST /timewarp/jump
/// Jump to a specific event, restoring the workspace to that point in time.
#[utoipa::path(
    post,
    path = "/timewarp/jump",
    request_body = JumpRequest,
    responses(
        (status = 200, description = "Jump successful", body = JumpResponse),
        (status = 404, description = "Event not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn jump_to_event(
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<JumpRequest>,
) -> Result<Json<JumpResponse>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/branches
/// List all branches.
#[utoipa::path(
    get,
    path = "/timewarp/branches",
    responses(
        (status = 200, description = "List of branches", body = Vec<Branch>),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn list_branches(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<Branch>>, ErrorResponse> {
    todo!()
}

/// POST /timewarp/branches
/// Create a new branch.
#[utoipa::path(
    post,
    path = "/timewarp/branches",
    request_body = CreateBranchRequest,
    responses(
        (status = 201, description = "Branch created", body = Branch),
        (status = 400, description = "Invalid branch name"),
        (status = 409, description = "Branch name already exists"),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn create_branch(
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<CreateBranchRequest>,
) -> Result<(StatusCode, Json<Branch>), ErrorResponse> {
    todo!()
}

/// PUT /timewarp/branches/{branch_id}/switch
/// Switch to a different branch.
async fn switch_branch(
    State(_state): State<Arc<AppState>>,
    Path(_branch_id): Path<String>,
) -> Result<Json<Branch>, ErrorResponse> {
    todo!()
}

/// POST /timewarp/merge
/// Merge two branches.
#[utoipa::path(
    post,
    path = "/timewarp/merge",
    request_body = MergeBranchRequest,
    responses(
        (status = 200, description = "Merge result", body = MergeResult),
        (status = 409, description = "Merge conflicts require resolution"),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn merge_branches(
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<MergeBranchRequest>,
) -> Result<Json<MergeResult>, ErrorResponse> {
    todo!()
}

/// DELETE /timewarp/branches/{branch_id}
/// Delete (soft-delete) a branch.
async fn delete_branch(
    State(_state): State<Arc<AppState>>,
    Path(_branch_id): Path<String>,
) -> Result<StatusCode, ErrorResponse> {
    todo!()
}

/// POST /timewarp/replay
/// Start a replay of a branch or event range.
#[utoipa::path(
    post,
    path = "/timewarp/replay",
    request_body = ReplayRequest,
    responses(
        (status = 202, description = "Replay started", body = ReplayResult),
        (status = 400, description = "Invalid replay parameters"),
        (status = 500, description = "Internal server error")
    ),
    tag = "TimeWarp"
)]
async fn start_replay(
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<ReplayRequest>,
) -> Result<(StatusCode, Json<ReplayResult>), ErrorResponse> {
    todo!()
}

/// GET /timewarp/replay/{replay_id}
/// Get replay status.
async fn get_replay_status(
    State(_state): State<Arc<AppState>>,
    Path(_replay_id): Path<String>,
) -> Result<Json<ReplayStatus>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/snapshots/{snapshot_id}
/// Get snapshot metadata.
async fn get_snapshot(
    State(_state): State<Arc<AppState>>,
    Path(_snapshot_id): Path<String>,
) -> Result<Json<Snapshot>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/snapshots/{snapshot_a}/diff/{snapshot_b}
/// Diff two snapshots.
async fn diff_snapshots(
    State(_state): State<Arc<AppState>>,
    Path((_snapshot_a, _snapshot_b)): Path<(String, String)>,
) -> Result<Json<SnapshotDiff>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/conflicts
/// List unresolved conflicts.
async fn list_conflicts(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<Conflict>>, ErrorResponse> {
    todo!()
}

/// POST /timewarp/conflicts/{conflict_id}/resolve
/// Resolve a conflict.
async fn resolve_conflict(
    State(_state): State<Arc<AppState>>,
    Path(_conflict_id): Path<String>,
    Json(_resolution): Json<ConflictResolution>,
) -> Result<StatusCode, ErrorResponse> {
    todo!()
}

/// POST /timewarp/backup/export
/// Export TimeWarp state to a backup archive.
async fn export_backup(
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<BackupExportRequest>,
) -> Result<Json<BackupManifest>, ErrorResponse> {
    todo!()
}

/// POST /timewarp/backup/import
/// Import a backup archive.
async fn import_backup(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<BackupManifest>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/events/stream
/// SSE endpoint for real-time timeline updates.
///
/// Clients receive events as they are recorded, allowing
/// the UI timeline bar to update in real-time.
async fn event_stream(
    State(_state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    // Uses tokio::sync::broadcast to fan out events to connected clients.
    // Each new event appended via event_store.append() also publishes
    // to the broadcast channel.
    let stream = futures::stream::pending(); // Placeholder
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// GET /timewarp/search
/// Full-text search across event inputs/outputs.
async fn search_events(
    State(_state): State<Arc<AppState>>,
    Query(_params): Query<EventQueryParams>,
) -> Result<Json<Vec<Event>>, ErrorResponse> {
    todo!()
}

/// GET /timewarp/verify
/// Verify hash chain integrity for a branch.
async fn verify_integrity(
    State(_state): State<Arc<AppState>>,
    Query(_params): Query<EventQueryParams>,
) -> Result<Json<ChainVerification>, ErrorResponse> {
    todo!()
}

// =========================================================================
// Router
// =========================================================================

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // Status
        .route("/timewarp/status", get(get_status))
        // Events
        .route("/timewarp/events", get(list_events))
        .route("/timewarp/events/stream", get(event_stream))
        .route("/timewarp/events/{event_id}", get(get_event))
        // Jump (time travel)
        .route("/timewarp/jump", post(jump_to_event))
        // Branches
        .route("/timewarp/branches", get(list_branches))
        .route("/timewarp/branches", post(create_branch))
        .route("/timewarp/branches/{branch_id}/switch", put(switch_branch))
        .route("/timewarp/branches/{branch_id}", delete(delete_branch))
        // Merge
        .route("/timewarp/merge", post(merge_branches))
        // Replay
        .route("/timewarp/replay", post(start_replay))
        .route("/timewarp/replay/{replay_id}", get(get_replay_status))
        // Snapshots
        .route("/timewarp/snapshots/{snapshot_id}", get(get_snapshot))
        .route(
            "/timewarp/snapshots/{snapshot_a}/diff/{snapshot_b}",
            get(diff_snapshots),
        )
        // Conflicts
        .route("/timewarp/conflicts", get(list_conflicts))
        .route(
            "/timewarp/conflicts/{conflict_id}/resolve",
            post(resolve_conflict),
        )
        // Backup
        .route("/timewarp/backup/export", post(export_backup))
        .route("/timewarp/backup/import", post(import_backup))
        // Search and verification
        .route("/timewarp/search", get(search_events))
        .route("/timewarp/verify", get(verify_integrity))
        .with_state(state)
}
```

### 8.3 AppState Integration

Add to `goose-server/src/state.rs`:

```rust
use timewarp::TimeWarpCore; // The concrete implementation of TimeWarpStore

pub struct AppState {
    // ... existing fields ...
    pub timewarp: Option<Arc<TimeWarpCore>>,
}

impl AppState {
    pub fn timewarp(&self) -> &Arc<TimeWarpCore> {
        self.timewarp
            .as_ref()
            .expect("TimeWarp not initialized. Call /timewarp/init first.")
    }
}
```

### 8.4 API Summary Table

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/timewarp/status` | System status and statistics |
| `GET` | `/timewarp/events` | List/filter events (paginated) |
| `GET` | `/timewarp/events/{id}` | Get single event |
| `GET` | `/timewarp/events/stream` | SSE real-time event stream |
| `POST` | `/timewarp/jump` | Jump to event (restore workspace) |
| `GET` | `/timewarp/branches` | List all branches |
| `POST` | `/timewarp/branches` | Create new branch |
| `PUT` | `/timewarp/branches/{id}/switch` | Switch active branch |
| `DELETE` | `/timewarp/branches/{id}` | Soft-delete a branch |
| `POST` | `/timewarp/merge` | Merge two branches |
| `POST` | `/timewarp/replay` | Start replay |
| `GET` | `/timewarp/replay/{id}` | Replay status |
| `GET` | `/timewarp/snapshots/{id}` | Snapshot metadata |
| `GET` | `/timewarp/snapshots/{a}/diff/{b}` | Diff two snapshots |
| `GET` | `/timewarp/conflicts` | List unresolved conflicts |
| `POST` | `/timewarp/conflicts/{id}/resolve` | Resolve a conflict |
| `POST` | `/timewarp/backup/export` | Export backup archive |
| `POST` | `/timewarp/backup/import` | Import backup archive |
| `GET` | `/timewarp/search` | Full-text search events |
| `GET` | `/timewarp/verify` | Verify hash chain integrity |

---

## 9. Testing Strategy

### 9.1 Unit Tests (per module)

Each module file contains a `#[cfg(test)] mod tests { ... }` section.

```rust
// Example: event_store_tests.rs

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    async fn setup() -> (Arc<Database>, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let config = DbConfig {
            path: db_path,
            wal_mode: true,
            busy_timeout_ms: 5000,
        };
        let db = Arc::new(Database::open(&config).await.unwrap());
        (db, dir)
    }

    #[tokio::test]
    async fn test_append_and_get_event() {
        let (db, _dir) = setup().await;
        let store = SqliteEventStore::new(db);

        // Create a test branch first...
        // Append an event...
        // Retrieve and verify...
    }

    #[tokio::test]
    async fn test_hash_chain_integrity() {
        let (db, _dir) = setup().await;
        let store = SqliteEventStore::new(db);

        // Append 100 events
        // Verify the chain
        // Tamper with one event's hash
        // Verify should fail
    }

    #[tokio::test]
    async fn test_event_query_by_branch() { ... }

    #[tokio::test]
    async fn test_event_query_by_type() { ... }

    #[tokio::test]
    async fn test_event_query_by_time_range() { ... }

    #[tokio::test]
    async fn test_event_query_by_file_path() { ... }
}
```

### 9.2 Integration Tests

```rust
// tests/integration_tests.rs

/// End-to-end: init -> record events -> snapshot -> jump -> verify
#[tokio::test]
async fn test_full_timeline_workflow() {
    // 1. Create TimeWarpCore with temp directory
    // 2. Record 10 file-write events
    // 3. Create a branch at event 5
    // 4. Record 5 more events on the branch
    // 5. Jump back to event 3
    // 6. Verify workspace matches snapshot at event 3
    // 7. Merge branch back
    // 8. Verify hash chain integrity
}

/// Snapshot delta compression and reconstruction
#[tokio::test]
async fn test_snapshot_delta_chain() {
    // 1. Create full snapshot
    // 2. Modify one file, create delta snapshot
    // 3. Reconstruct the delta snapshot
    // 4. Verify it matches a fresh full snapshot
}

/// Branch merge with conflicts
#[tokio::test]
async fn test_merge_with_conflicts() {
    // 1. Create branch A and B from the same point
    // 2. Modify the same file differently on each
    // 3. Attempt merge
    // 4. Verify structural conflict is detected
    // 5. Resolve and complete merge
}
```

### 9.3 Property-Based Tests

```rust
// tests/hash_chain_tests.rs

use proptest::prelude::*;

proptest! {
    /// Any sequence of events produces a valid hash chain.
    #[test]
    fn hash_chain_always_valid(
        event_count in 1..100usize,
        seed in any::<u64>(),
    ) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            // Generate `event_count` random events
            // Append all to a fresh store
            // Verify chain integrity
            // Assert valid == true
        });
    }

    /// Modifying any event's content causes hash verification failure.
    #[test]
    fn tampered_event_detected(
        event_count in 2..50usize,
        tamper_index in 0..49usize,
    ) {
        // Generate events, tamper with one, verify catches it
    }
}
```

### 9.4 Benchmark Tests

```rust
// benches/snapshot_benchmark.rs

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};

fn snapshot_capture_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("snapshot_capture");

    for file_count in [10, 100, 1000, 10000] {
        group.bench_with_input(
            BenchmarkId::from_parameter(file_count),
            &file_count,
            |b, &count| {
                b.iter(|| {
                    // Create a temp workspace with `count` files
                    // Capture a snapshot
                    // Measure time
                });
            },
        );
    }
    group.finish();
}

fn snapshot_reconstruct_benchmark(c: &mut Criterion) {
    // Benchmark reconstructing a snapshot from a chain of 50 deltas
}

fn event_append_benchmark(c: &mut Criterion) {
    // Benchmark appending events (target: < 1ms per event)
}

fn hash_chain_verify_benchmark(c: &mut Criterion) {
    // Benchmark verifying a chain of 10,000 events
}

criterion_group!(
    benches,
    snapshot_capture_benchmark,
    snapshot_reconstruct_benchmark,
    event_append_benchmark,
    hash_chain_verify_benchmark,
);
criterion_main!(benches);
```

---

## 10. Migration System

### 10.1 Design

Migrations are SQL files embedded in the binary at compile time via `include_str!`.
This avoids runtime file system dependencies and ensures the migration set is
immutable once compiled.

### 10.2 Migration Ordering

Migrations are numbered sequentially: `001_`, `002_`, etc. The `tw_schema_version`
table tracks which migrations have been applied. On startup, `Database::open()`
calls `migrate()` which applies any migrations with a version number higher than
the current maximum in `tw_schema_version`.

### 10.3 Adding New Migrations

1. Create a new file: `migrations/003_description.sql`
2. Add an entry to the `migrations` vector in `db.rs`:
   ```rust
   (3, "Description", include_str!("../migrations/003_description.sql")),
   ```
3. The migration will be applied on next startup.

### 10.4 Schema Version Table

```sql
SELECT * FROM tw_schema_version ORDER BY version;

-- version | applied_at                   | description
-- --------+------------------------------+------------------------
-- 1       | 2026-02-10T14:30:00.000000Z | Initial TimeWarp schema
-- 2       | 2026-02-10T14:30:00.001000Z | Indexes and views
```

---

## Appendix A: Dependency Rationale

| Dependency | Purpose | Why Not Alternative |
|------------|---------|-------------------|
| `rusqlite` | SQLite access | Direct control over PRAGMAs, JSON functions, WAL mode. `sqlx` (used in goose core) has async overhead we don't need for a local DB. |
| `blake3` | Hashing | 3-7x faster than SHA-256, already in workspace (`goose` crate uses it). |
| `uuid` v7 | Event IDs | Time-ordered UUIDs sort lexicographically = chronologically. |
| `bollard` | Docker API | Rust-native, async, well-maintained. For containerized replay. |
| `tree-sitter` | AST parsing | Industry standard for multi-language parsing. Incremental, fast. |
| `zstd` | Compression | Best ratio/speed tradeoff for backup archives. |
| `rusqlite` over `sqlx` | SQLite only | `sqlx` adds macro complexity and compile-time checking we don't need for a self-contained schema. `rusqlite` gives us raw access to SQLite-specific features. |
| `proptest` | Property tests | Better than `quickcheck` for complex generators. |

## Appendix B: Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Event append | < 1ms | Single row INSERT + hash computation |
| Event query (100 results) | < 10ms | Indexed by branch+created_at |
| Snapshot capture (1000 files) | < 500ms | Parallel hashing with rayon |
| Snapshot restore (1000 files) | < 1s | Parallel file writes |
| Delta reconstruction (50 deltas) | < 100ms | In-memory overlay |
| Hash chain verify (10,000 events) | < 500ms | Sequential scan |
| Blob store GC | < 5s | Shard-parallel deletion |
| Full backup export (100MB) | < 30s | Streaming tar+zstd |

## Appendix C: File Size Estimates

| File | Estimated Lines | Description |
|------|----------------|-------------|
| `lib.rs` | 150-200 | Re-exports, TimeWarpCore struct |
| `models.rs` | 400-500 | All data types |
| `errors.rs` | 60-80 | Error enum |
| `db.rs` | 150-200 | Database + migrations |
| `blob_store.rs` | 250-300 | Content-addressed storage |
| `event_store.rs` | 400-500 | Append-only log |
| `snapshot_store.rs` | 500-600 | Snapshots + delta compression |
| `branch_manager.rs` | 350-400 | DAG operations |
| `replay_engine.rs` | 400-500 | Docker-based replay |
| `conflict_engine.rs` | 500-600 | Three-layer detection |
| `mcp_middleware.rs` | 200-250 | MCP event capture |
| `forward_projector.rs` | 200-250 | What-if simulation |
| `backup_manager.rs` | 300-350 | Export/import |
| **Total** | **~4,000-4,500** | Excluding tests |
