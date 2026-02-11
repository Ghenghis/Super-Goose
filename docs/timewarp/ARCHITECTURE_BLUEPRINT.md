# TimeWarp: Architecture Blueprint

**Version:** 0.1 (Design Phase)  
**Target Integration:** Super-Goose (Ghenghis/Super-Goose)  
**Architecture Pattern:** Event Sourcing + Content-Addressed Storage + DAG Branching

---

## 1. System Overview

TimeWarp is an event-sourced time-travel system for AI coding agents. It captures every agent action as an immutable event, stores workspace snapshots in a content-addressed store, and provides a Fusion 360-style timeline UI for navigation, branching, and replay.

```mermaid
graph TB
    subgraph "User Interface Layer"
        CLI[CLI Timeline Commands<br/>tw jump / tw branch / tw replay]
        GUI[Timeline UI<br/>Fusion 360-style<br/>Tauri + React]
    end

    subgraph "TimeWarp Core"
        IM[Instrumentation Middleware<br/>MCP Proxy Layer]
        ES[Event Store<br/>Append-only SQLite<br/>Hash Chain]
        SS[Snapshot Store<br/>Content-Addressed<br/>SHA-256 Blobs]
        RE[Replay Engine<br/>Deterministic<br/>Containerized]
        CE[Conflict Engine<br/>Structural + Semantic<br/>+ Drift Detection]
        BM[Branch Manager<br/>DAG Operations<br/>Fork / Merge / Prune]
        FP[Forward Projector<br/>What-If Simulation<br/>Sandboxed]
    end

    subgraph "Storage Layer"
        DB[(SQLite Database<br/>events / snapshots index<br/>branches / metadata)]
        BLOBS[(Blob Store<br/>Content-Addressed Files<br/>.timewarp/blobs/)]
    end

    subgraph "Agent Layer"
        GOOSE[Super-Goose Agent<br/>ALMAS / EvoAgentX<br/>Coach-Player]
        MCP[MCP Tools<br/>File Ops / Shell<br/>Git / API Calls]
        LLM[LLM Provider<br/>Claude / GPT / Local]
    end

    subgraph "External Systems"
        GIT[Git Repository<br/>Local / GitHub / GitLab]
        DOCKER[Container Runtime<br/>Docker / Podman]
        FS[File System<br/>Workspace Directory]
    end

    CLI --> ES
    CLI --> BM
    CLI --> RE
    GUI --> ES
    GUI --> BM
    GUI --> SS

    GOOSE --> MCP
    GOOSE --> LLM
    MCP --> IM
    IM --> ES
    IM --> SS
    IM --> MCP

    ES --> DB
    SS --> DB
    SS --> BLOBS
    BM --> DB

    RE --> DOCKER
    RE --> SS
    RE --> ES
    CE --> SS
    FP --> RE
    FP --> CE

    ES -.sync.-> GIT
    SS -.read.-> FS

    style ES fill:#4a9eff,color:#fff
    style SS fill:#4a9eff,color:#fff
    style RE fill:#ff9f43,color:#fff
    style CE fill:#ee5a24,color:#fff
    style GUI fill:#2ecc71,color:#fff
    style IM fill:#9b59b6,color:#fff
```

---

## 2. Event Model — The Core Data Structure

Every agent action becomes an immutable event in a DAG (Directed Acyclic Graph).

```mermaid
erDiagram
    EVENT {
        string event_id PK "UUID v7 (time-ordered)"
        string[] parent_ids "DAG edges (1+ parents)"
        string branch_id FK "Which branch"
        string event_type "file_write|cmd_exec|llm_call|git_op|..."
        json inputs "What triggered this event"
        json outputs "What the event produced"
        string[] file_touches "Paths modified"
        string snapshot_id FK "Workspace state after"
        string prev_hash "SHA-256 of previous event"
        string event_hash "SHA-256 of this event"
        datetime created_at "Timestamp"
        json metadata "Model version, tool version, etc."
    }

    SNAPSHOT {
        string snapshot_id PK "SHA-256 of tree"
        string base_snapshot_id FK "Delta base (null for full)"
        json file_tree "Path -> blob_hash mapping"
        int total_files "File count"
        int total_bytes "Uncompressed size"
        datetime created_at "Timestamp"
    }

    BLOB {
        string blob_hash PK "SHA-256 of content"
        bytes content "File content (compressed)"
        int original_size "Uncompressed size"
        string compression "zstd|none"
    }

    BRANCH {
        string branch_id PK "UUID"
        string name "human-readable name"
        string parent_branch_id FK "Branched from"
        string fork_event_id FK "Event where branched"
        string head_event_id FK "Latest event"
        string status "active|merged|archived"
        datetime created_at "Timestamp"
    }

    EVENT ||--o{ EVENT : "parent_ids"
    EVENT }o--|| BRANCH : "branch_id"
    EVENT }o--|| SNAPSHOT : "snapshot_id"
    SNAPSHOT }o--o{ BLOB : "file_tree references"
    SNAPSHOT }o--o| SNAPSHOT : "base_snapshot_id"
    BRANCH }o--o| BRANCH : "parent_branch_id"
    BRANCH }o--|| EVENT : "head_event_id"
    BRANCH }o--|| EVENT : "fork_event_id"
```

---

## 3. Event Flow — How Actions Become Events

```mermaid
sequenceDiagram
    participant User
    participant Agent as Super-Goose Agent
    participant MCP as MCP Tool
    participant IM as Instrumentation<br/>Middleware
    participant ES as Event Store
    participant SS as Snapshot Store
    participant FS as File System

    User->>Agent: "Add authentication to the API"
    Agent->>MCP: tool_call: read_file("src/main.rs")
    MCP->>IM: intercept: read_file
    IM->>ES: record: FileRead event
    IM->>MCP: pass through
    MCP-->>Agent: file contents

    Agent->>MCP: tool_call: write_file("src/auth.rs", code)
    MCP->>IM: intercept: write_file
    IM->>FS: write file to disk
    IM->>SS: snapshot changed files
    SS->>SS: compute blob hashes
    SS->>SS: store new/changed blobs
    SS->>SS: create snapshot (tree of hashes)
    IM->>ES: record: FileWrite event + snapshot_id
    ES->>ES: compute hash chain
    IM->>MCP: pass through
    MCP-->>Agent: success

    Agent->>MCP: tool_call: shell("cargo build")
    MCP->>IM: intercept: shell
    IM->>ES: record: CommandExec event (start)
    IM->>MCP: pass through
    MCP-->>Agent: build output
    IM->>ES: record: CommandExec event (complete + output)

    Agent->>MCP: tool_call: shell("cargo test")
    MCP->>IM: intercept: shell
    IM->>SS: snapshot workspace (post-build artifacts)
    IM->>ES: record: CommandExec event + snapshot_id
    IM->>MCP: pass through
    MCP-->>Agent: test results

    Note over ES: Timeline now has 5 events<br/>with 2 snapshots and hash chain
```

---

## 4. Branch DAG — Forking and Merging

```mermaid
gitGraph
    commit id: "E1: init project"
    commit id: "E2: add src/main.rs"
    commit id: "E3: add auth module"
    branch feature-oauth
    commit id: "E4: add OAuth provider"
    commit id: "E5: add token refresh"
    checkout main
    commit id: "E6: add rate limiting"
    commit id: "E7: add logging"
    branch feature-jwt
    commit id: "E8: add JWT validation"
    commit id: "E9: add JWT tests"
    checkout main
    merge feature-oauth id: "E10: merge OAuth" tag: "conflict-free"
    merge feature-jwt id: "E11: merge JWT" tag: "CONFLICT: auth.rs"
```

---

## 5. Snapshot Store — Content-Addressed Architecture

```mermaid
graph LR
    subgraph "Snapshot S1 (Full Base)"
        S1[Snapshot S1<br/>base: null<br/>files: 3]
        S1 --> T1[Tree Hash: abc123]
        T1 --> B1["src/main.rs → blob:ff01"]
        T1 --> B2["Cargo.toml → blob:ff02"]
        T1 --> B3["README.md → blob:ff03"]
    end

    subgraph "Snapshot S2 (Delta from S1)"
        S2[Snapshot S2<br/>base: S1<br/>delta: 1 file changed]
        S2 --> T2[Tree Hash: def456]
        T2 --> B1ref["src/main.rs → blob:ff01 ✓ unchanged"]
        T2 --> B2ref["Cargo.toml → blob:ff02 ✓ unchanged"]
        T2 --> B4["src/auth.rs → blob:ff04 ★ NEW"]
    end

    subgraph "Snapshot S3 (Delta from S2)"
        S3[Snapshot S3<br/>base: S2<br/>delta: 1 file modified]
        S3 --> T3[Tree Hash: ghi789]
        T3 --> B5["src/main.rs → blob:ff05 ★ MODIFIED"]
        T3 --> B2ref2["Cargo.toml → blob:ff02 ✓ unchanged"]
        T3 --> B4ref["src/auth.rs → blob:ff04 ✓ unchanged"]
    end

    subgraph "Blob Store (.timewarp/blobs/)"
        BS["ff01: (main.rs v1, 245 bytes)"]
        BS2["ff02: (Cargo.toml, 180 bytes)"]
        BS3["ff03: (README.md, 90 bytes)"]
        BS4["ff04: (auth.rs, 520 bytes)"]
        BS5["ff05: (main.rs v2, 310 bytes)"]
    end

    S1 -.-> S2
    S2 -.-> S3

    style S1 fill:#3498db,color:#fff
    style S2 fill:#2ecc71,color:#fff
    style S3 fill:#e67e22,color:#fff
```

**Key properties:**
- Identical files are stored once (deduplication via content addressing)
- Delta snapshots only record changed files (storage efficiency)
- Any snapshot can be fully reconstructed by walking the delta chain to its base
- Periodic full snapshots prevent long delta chains

---

## 6. Conflict Detection — Three Layers

```mermaid
graph TB
    subgraph "Layer 1: Structural Conflicts"
        SC[Structural Conflict Engine<br/>Line-level diff/patch]
        SC1[Same file modified<br/>in both branches]
        SC2[Overlapping line ranges<br/>changed differently]
        SC3[File deleted in one branch<br/>modified in other]
        SC --> SC1
        SC --> SC2
        SC --> SC3
    end

    subgraph "Layer 2: Semantic Conflicts"
        SM[Semantic Conflict Engine<br/>AST-aware via tree-sitter]
        SM1[Function renamed in branch A<br/>Called by name in branch B]
        SM2[Return type changed in A<br/>Caller expects old type in B]
        SM3[Import removed in A<br/>New usage added in B]
        SM4[Variable type narrowed in A<br/>Broader usage in B]
        SM --> SM1
        SM --> SM2
        SM --> SM3
        SM --> SM4
    end

    subgraph "Layer 3: External Drift"
        DR[Drift Detection Engine<br/>Environment changes]
        DR1[Dependency version changed<br/>between branch creation and now]
        DR2[API contract changed<br/>at external service]
        DR3[Tool version differs<br/>from when branch was created]
        DR4[OS/platform dependency<br/>no longer available]
        DR --> DR1
        DR --> DR2
        DR --> DR3
        DR --> DR4
    end

    MERGE[Merge Request<br/>Branch A + Branch B] --> SC
    SC -->|Pass| SM
    SC -->|Fail| BLOCK1[Block: Fix structural conflicts first]
    SM -->|Pass| DR
    SM -->|Fail| WARN1[Warn: Semantic conflicts detected]
    DR -->|Pass| OK[Safe to merge ✅]
    DR -->|Drift detected| WARN2[Warn: Environment has drifted]

    style SC fill:#3498db,color:#fff
    style SM fill:#e67e22,color:#fff
    style DR fill:#e74c3c,color:#fff
    style OK fill:#2ecc71,color:#fff
```

---

## 7. Replay Engine — Deterministic Re-Execution

```mermaid
flowchart TB
    START[Replay Request<br/>from_event: E5<br/>to_event: E15<br/>mode: verify] --> PREP

    PREP[Prepare Sandbox] --> |1| RESTORE[Restore Snapshot<br/>at E5's snapshot_id]
    RESTORE --> |2| PIN[Pin Environment<br/>Container digest<br/>Tool versions<br/>Lockfile versions]
    PIN --> |3| CACHE[Load LLM Cache<br/>Cached responses for<br/>deterministic replay]

    CACHE --> LOOP{Next Event?}

    LOOP -->|E6: file_write| EXEC_FW[Execute File Write<br/>Compare output to original]
    LOOP -->|E7: cmd_exec| EXEC_CMD[Execute Command<br/>Compare output to original]
    LOOP -->|E8: llm_call| EXEC_LLM{LLM Cache Hit?}
    LOOP -->|E15: done| VERIFY

    EXEC_LLM -->|Cache hit| USE_CACHED[Use Cached Response<br/>Score: 1.0 deterministic]
    EXEC_LLM -->|Cache miss| CALL_LLM[Call LLM<br/>Compare to original<br/>Score: 0.0-1.0]

    EXEC_FW --> CHECK_FW{Output matches<br/>original?}
    EXEC_CMD --> CHECK_CMD{Output matches<br/>original?}
    USE_CACHED --> CHECK_LLM{Response matches<br/>original?}
    CALL_LLM --> CHECK_LLM

    CHECK_FW -->|Yes| LOOP
    CHECK_FW -->|No| DIVERGE[Record Divergence<br/>Continue or Abort]
    CHECK_CMD -->|Yes| LOOP
    CHECK_CMD -->|No| DIVERGE
    CHECK_LLM -->|Yes| LOOP
    CHECK_LLM -->|No| DIVERGE

    DIVERGE --> LOOP

    VERIFY[Verify Final State] --> COMPARE[Compare Final Snapshot<br/>to Original E15 Snapshot]
    COMPARE --> SCORE[Reproducibility Score<br/>0.0 - 1.0]

    SCORE -->|1.0| PERFECT[✅ Perfect Replay<br/>Deterministic]
    SCORE -->|0.8-0.99| CLOSE[⚠️ Close Replay<br/>Minor LLM divergence]
    SCORE -->|< 0.8| DIVERGED[❌ Significant Divergence<br/>Review required]

    style PERFECT fill:#2ecc71,color:#fff
    style CLOSE fill:#f39c12,color:#fff
    style DIVERGED fill:#e74c3c,color:#fff
```

---

## 8. Timeline UI — Fusion 360-Style Interface

```mermaid
graph LR
    subgraph "Timeline Bar (bottom of screen, always visible)"
        direction LR
        E1((📁)) --> E2((📝)) --> E3((📝)) --> E4((⚡)) --> E5((✅))
        E5 --> E6((📝)) --> E7((⚡)) --> E8((❌)) --> E9((📝)) --> E10((✅))

        E3 -.fork.-> F1((📝)) --> F2((⚡)) --> F3((✅))
    end

    subgraph "Legend"
        L1((📁)) --- L1T[File Created]
        L2((📝)) --- L2T[File Modified]
        L3((⚡)) --- L3T[Command Executed]
        L4((✅)) --- L4T[Tests Passed]
        L5((❌)) --- L5T[Tests Failed]
    end

    subgraph "Interactions"
        I1[Click: Jump to event]
        I2[Right-click: Fork from here]
        I3[Drag marker: Scrub through time]
        I4[Double-click: Inspect event details]
        I5[Hover: Preview workspace diff]
    end
```

### Timeline UI Wireframe (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Super-Goose                                                    [≡] [×] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─── Code Editor / Agent Chat ──────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [Agent output, file diffs, terminal output...]                   │  │
│  │                                                                    │  │
│  │                                                                    │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Event Inspector ───────────────────────────────────────────────┐  │
│  │  Event E7: shell("cargo test")                                     │  │
│  │  Branch: main  │  Time: 14:23:05  │  Duration: 3.2s               │  │
│  │  Files touched: src/auth.rs, tests/auth_test.rs                    │  │
│  │  Result: 12 tests passed, 0 failed                                 │  │
│  │  Snapshot: snap_a1b2c3  │  Reproducibility: 0.95                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─── Timeline ──────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  main:    ●──●──●──●──●──●──●──●──▼──●──●──●                     │  │
│  │                    ╲                                               │  │
│  │  oauth:             ●──●──●──●                                    │  │
│  │                          ╲                                        │  │
│  │  jwt:                     ●──●──●                                 │  │
│  │                                                                    │  │
│  │  ◀────────────────────────[▲]────────────────────────────────▶    │  │
│  │  E1    E3    E5    E7    E9    E11   E13   E15   E17   E19       │  │
│  │                                                                    │  │
│  │  [⏮] [◀] [▶] [⏭]  │  Branch: main  │  Event 9/19  │  [🔍]     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Hash Chain — Tamper-Evident Integrity

```mermaid
graph LR
    E1[Event E1<br/>hash: a1b2c3<br/>prev: 000000] --> E2[Event E2<br/>hash: d4e5f6<br/>prev: a1b2c3]
    E2 --> E3[Event E3<br/>hash: g7h8i9<br/>prev: d4e5f6]
    E3 --> E4[Event E4<br/>hash: j0k1l2<br/>prev: g7h8i9]

    E4 --> VERIFY{Verify Chain}
    VERIFY -->|SHA256 of E3 == E4.prev_hash| OK[✅ Intact]
    VERIFY -->|SHA256 of E3 ≠ E4.prev_hash| TAMPERED[❌ Tampered!]

    style OK fill:#2ecc71,color:#fff
    style TAMPERED fill:#e74c3c,color:#fff
```

**Hash computation:**
```
event_hash = SHA256(
    event_id +
    parent_ids.join(",") +
    branch_id +
    event_type +
    JSON(inputs) +
    JSON(outputs) +
    snapshot_id +
    prev_hash +
    created_at.to_string()
)
```

---

## 10. Component Dependency Map

```mermaid
graph BT
    subgraph "Layer 0: Storage"
        SQLite[(SQLite via rusqlite)]
        BlobFS[Blob Filesystem<br/>.timewarp/blobs/]
    end

    subgraph "Layer 1: Core Stores"
        ES[Event Store] --> SQLite
        SS[Snapshot Store] --> SQLite
        SS --> BlobFS
    end

    subgraph "Layer 2: Operations"
        BM[Branch Manager] --> ES
        RE[Replay Engine] --> ES
        RE --> SS
        CE[Conflict Engine] --> SS
        CE --> TS[tree-sitter AST]
        FP[Forward Projector] --> RE
        FP --> CE
    end

    subgraph "Layer 3: Integration"
        IM[MCP Instrumentation] --> ES
        IM --> SS
        GI[Git Integration] --> ES
        GI --> SS
    end

    subgraph "Layer 4: Interface"
        CLI[CLI Commands] --> BM
        CLI --> RE
        CLI --> ES
        GUI[Timeline UI] --> ES
        GUI --> BM
        GUI --> SS
    end

    style ES fill:#4a9eff,color:#fff
    style SS fill:#4a9eff,color:#fff
```

---

## 11. Data Flow for Key Operations

### 11.1 Jump (Restore to Past State)

```mermaid
sequenceDiagram
    participant User
    participant CLI as tw jump E7
    participant ES as Event Store
    participant SS as Snapshot Store
    participant FS as File System

    User->>CLI: tw jump E7
    CLI->>ES: get_event(E7)
    ES-->>CLI: Event E7 (snapshot_id: snap_x)
    CLI->>SS: reconstruct_snapshot(snap_x)
    SS->>SS: walk delta chain to base
    SS->>SS: collect all blob hashes
    SS-->>CLI: complete file tree
    CLI->>FS: restore workspace files
    CLI->>CLI: update HEAD pointer to E7
    CLI-->>User: Workspace restored to E7
```

### 11.2 Fork (Create Branch from Past Event)

```mermaid
sequenceDiagram
    participant User
    participant CLI as tw branch --from E5 "oauth"
    participant BM as Branch Manager
    participant ES as Event Store

    User->>CLI: tw branch --from E5 "oauth"
    CLI->>BM: create_branch("oauth", fork_event=E5)
    BM->>ES: get_event(E5)
    ES-->>BM: Event E5 validated
    BM->>ES: create branch record
    Note over BM: Branch "oauth"<br/>parent: main<br/>fork_event: E5<br/>head: E5
    BM-->>CLI: Branch "oauth" created
    CLI-->>User: Now on branch "oauth" at E5
```

---

## 12. SQLite Schema (Logical)

```sql
-- Events: append-only, hash-chained
CREATE TABLE events (
    event_id       TEXT PRIMARY KEY,    -- UUID v7
    parent_ids     TEXT NOT NULL,       -- JSON array of parent event IDs
    branch_id      TEXT NOT NULL,       -- FK to branches
    event_type     TEXT NOT NULL,       -- file_write|cmd_exec|llm_call|...
    inputs         TEXT,                -- JSON
    outputs        TEXT,                -- JSON
    file_touches   TEXT,                -- JSON array of paths
    snapshot_id    TEXT,                -- FK to snapshots (nullable)
    prev_hash      TEXT NOT NULL,       -- SHA-256 of previous event
    event_hash     TEXT NOT NULL,       -- SHA-256 of this event
    created_at     TEXT NOT NULL,       -- ISO 8601
    metadata       TEXT                 -- JSON (model version, tool version, etc.)
);

-- Snapshots: content-addressed workspace states
CREATE TABLE snapshots (
    snapshot_id    TEXT PRIMARY KEY,    -- SHA-256 of file tree
    base_snapshot  TEXT,                -- FK for delta (null = full snapshot)
    file_tree      TEXT NOT NULL,       -- JSON: {path: blob_hash}
    total_files    INTEGER NOT NULL,
    total_bytes    INTEGER NOT NULL,
    created_at     TEXT NOT NULL
);

-- Branches: DAG of development paths
CREATE TABLE branches (
    branch_id         TEXT PRIMARY KEY,
    name              TEXT NOT NULL UNIQUE,
    parent_branch_id  TEXT,             -- FK to branches
    fork_event_id     TEXT,             -- FK to events
    head_event_id     TEXT NOT NULL,    -- FK to events
    status            TEXT NOT NULL DEFAULT 'active', -- active|merged|archived
    created_at        TEXT NOT NULL
);

-- Indexes for timeline queries
CREATE INDEX idx_events_branch ON events(branch_id, created_at);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_hash ON events(event_hash);
CREATE INDEX idx_snapshots_base ON snapshots(base_snapshot);
```

---

## 13. Integration Points with Super-Goose

```mermaid
graph TB
    subgraph "Existing Super-Goose Systems"
        ALMAS[ALMAS Team Coordinator<br/>5-Role Pipeline]
        EVO[EvoAgentX<br/>Memory + Evolution]
        CP[Coach/Player<br/>Quality Review]
        CON[Conscious<br/>Voice Interface]
    end

    subgraph "TimeWarp Integration"
        IM[MCP Instrumentation<br/>Middleware]
        TW[TimeWarp Core<br/>Event Store + Snapshots]
        TL[Timeline UI<br/>Integrated in Desktop]
    end

    ALMAS -->|"Role transitions<br/>become events"| IM
    EVO -->|"Prompt optimizations<br/>become events"| IM
    CP -->|"Review cycles<br/>become events"| IM
    CON -->|"Voice commands<br/>become events"| IM

    IM --> TW
    TW --> TL

    ALMAS -.->|"Architect → Developer<br/>handoff = branch point"| TW
    CP -.->|"Coach rejection<br/>= fork for retry"| TW
    EVO -.->|"A/B prompt test<br/>= parallel branches"| TW

    style TW fill:#4a9eff,color:#fff
    style IM fill:#9b59b6,color:#fff
    style TL fill:#2ecc71,color:#fff
```

---

*This architecture blueprint serves as the design reference for TimeWarp implementation. All diagrams render in GitHub-flavored Mermaid.*
