# TimeWarp: Diagrams Collection

All diagrams are in GitHub-compatible Mermaid format and render natively on GitHub.

---

## Diagram 1: System Architecture (High-Level)

```mermaid
graph TB
    subgraph "🖥️ User Interface"
        CLI["🔧 CLI<br/>tw jump / branch / replay"]
        GUI["📊 Timeline UI<br/>Fusion 360-style bar"]
    end

    subgraph "⚙️ TimeWarp Engine"
        IM["🔌 MCP Middleware<br/>Instruments agent actions"]
        ES["📋 Event Store<br/>Append-only • Hash chain"]
        SS["📦 Snapshot Store<br/>Content-addressed blobs"]
        BM["🌿 Branch Manager<br/>Fork • Merge • DAG"]
        RE["🔄 Replay Engine<br/>Containerized re-exec"]
        CE["🔍 Conflict Engine<br/>Structural + Semantic + Drift"]
    end

    subgraph "💾 Storage"
        DB[("SQLite<br/>Events • Branches • Index")]
        BLOBS[("Blob FS<br/>.timewarp/blobs/")]
    end

    subgraph "🤖 Agent Runtime"
        GOOSE["Super-Goose<br/>ALMAS • EvoAgentX<br/>Coach/Player • Conscious"]
        MCP["MCP Tools"]
        LLM["LLM Provider"]
    end

    CLI --> ES & BM & RE
    GUI --> ES & BM & SS
    GOOSE --> MCP --> IM
    IM --> ES & SS
    ES & SS --> DB
    SS --> BLOBS
    RE --> SS & ES
    CE --> SS
    BM --> ES
```

---

## Diagram 2: Event Lifecycle

```mermaid
stateDiagram-v2
    [*] --> AgentAction: Agent performs action

    AgentAction --> MCPIntercept: MCP middleware catches

    MCPIntercept --> CreateEvent: Build event record

    CreateEvent --> CaptureSnapshot: If state-changing
    CreateEvent --> SkipSnapshot: If read-only

    CaptureSnapshot --> ComputeHashes: SHA-256 blobs + tree
    ComputeHashes --> StoreDelta: Delta vs previous snapshot
    StoreDelta --> ChainHash: Compute event hash with prev_hash

    SkipSnapshot --> ChainHash

    ChainHash --> AppendToStore: Write to SQLite
    AppendToStore --> UpdateBranchHead: Move branch HEAD pointer
    UpdateBranchHead --> NotifyUI: Push to timeline UI

    NotifyUI --> [*]: Event recorded ✅
```

---

## Diagram 3: Competitive Landscape Positioning

```mermaid
quadrantChart
    title TimeWarp vs Existing Tools
    x-axis "Workspace Awareness" --> "Full File State"
    y-axis "Agent Awareness" --> "Full Agent State"

    LangGraph: [0.2, 0.9]
    Agent-Git: [0.15, 0.85]
    Cursor Checkpoints: [0.5, 0.3]
    Git + Scripts: [0.8, 0.1]
    Undo.io: [0.1, 0.2]
    TimeWarp: [0.9, 0.9]
```

---

## Diagram 4: Content-Addressed Snapshot Chain

```mermaid
graph TD
    S0["🟦 Snapshot S0 (FULL BASE)<br/>3 files • 515 bytes<br/>━━━━━━━━━━━━━━━━━<br/>src/main.rs → blob:aa11<br/>Cargo.toml → blob:bb22<br/>README.md → blob:cc33"]

    S1["🟩 Snapshot S1 (DELTA from S0)<br/>+1 file added<br/>━━━━━━━━━━━━━━━━━<br/>+ src/auth.rs → blob:dd44"]

    S2["🟨 Snapshot S2 (DELTA from S1)<br/>1 file modified<br/>━━━━━━━━━━━━━━━━━<br/>~ src/main.rs → blob:ee55"]

    S3["🟧 Snapshot S3 (DELTA from S2)<br/>2 files modified<br/>━━━━━━━━━━━━━━━━━<br/>~ src/auth.rs → blob:ff66<br/>~ Cargo.toml → blob:gg77"]

    S4["🟦 Snapshot S4 (FULL BASE)<br/>Periodic compaction<br/>━━━━━━━━━━━━━━━━━<br/>5 files • 1.2 KB<br/>(all current state)"]

    S0 --> S1 --> S2 --> S3 --> S4

    style S0 fill:#3498db,color:#fff
    style S1 fill:#2ecc71,color:#fff
    style S2 fill:#f1c40f,color:#000
    style S3 fill:#e67e22,color:#fff
    style S4 fill:#3498db,color:#fff
```

---

## Diagram 5: Branch DAG with Merge

```mermaid
gitGraph
    commit id: "E01: project init"
    commit id: "E02: scaffold structure"
    commit id: "E03: add API endpoints"

    branch feature/auth
    commit id: "E04: add auth module"
    commit id: "E05: add JWT validation"
    commit id: "E06: add token refresh"

    checkout main
    commit id: "E07: add rate limiting"

    branch feature/logging
    commit id: "E08: add structured logging"
    commit id: "E09: add log rotation"

    checkout main
    merge feature/auth id: "E10: merge auth ✅"
    commit id: "E11: update API docs"
    merge feature/logging id: "E12: merge logging ✅"

    branch feature/caching
    commit id: "E13: add Redis cache"
    commit id: "E14: add cache invalidation"

    checkout main
    commit id: "E15: security audit fixes"
    merge feature/caching id: "E16: merge caching ⚠️ conflict"
```

---

## Diagram 6: Replay Engine Flow

```mermaid
flowchart LR
    subgraph Input
        SEL[Select Event Range<br/>E5 → E15]
    end

    subgraph Prepare
        SNAP[Load Snapshot<br/>at E5]
        ENV[Pin Environment<br/>Container + versions]
        CACHE[Load LLM<br/>Response Cache]
    end

    subgraph Execute
        E6[Replay E6<br/>file_write]
        E7[Replay E7<br/>cmd_exec]
        E8[Replay E8<br/>llm_call]
        EN[Replay E..N]
    end

    subgraph Verify
        DIFF[Compare<br/>Final Snapshot]
        SCORE[Reproducibility<br/>Score: 0.0-1.0]
    end

    SEL --> SNAP --> ENV --> CACHE
    CACHE --> E6 --> E7 --> E8 --> EN
    EN --> DIFF --> SCORE
```

---

## Diagram 7: Conflict Detection Pipeline

```mermaid
flowchart TB
    MERGE["Merge Request<br/>Branch A → Branch B"] --> L1

    subgraph L1["Layer 1: Structural"]
        direction LR
        DIFF[Line-level diff] --> OVERLAP{Overlapping<br/>changes?}
        OVERLAP -->|No| L1_PASS[✅ Pass]
        OVERLAP -->|Yes| L1_FAIL[❌ Structural Conflict]
    end

    L1_PASS --> L2

    subgraph L2["Layer 2: Semantic (AST)"]
        direction LR
        PARSE[Parse ASTs<br/>tree-sitter] --> SYMBOLS{Symbol<br/>conflicts?}
        SYMBOLS -->|No| L2_PASS[✅ Pass]
        SYMBOLS -->|Yes| L2_WARN[⚠️ Semantic Conflict]
    end

    L2_PASS --> L3
    L2_WARN --> L3

    subgraph L3["Layer 3: Drift"]
        direction LR
        DEPS[Check dependency<br/>versions] --> CHANGED{Environment<br/>changed?}
        CHANGED -->|No| L3_PASS[✅ Pass]
        CHANGED -->|Yes| L3_WARN[⚠️ Drift Detected]
    end

    L3_PASS --> RESULT_OK["✅ Safe to merge"]
    L3_WARN --> RESULT_WARN["⚠️ Merge with caution"]
    L1_FAIL --> RESULT_BLOCK["❌ Fix conflicts first"]

    style L1 fill:#3498db22,stroke:#3498db
    style L2 fill:#e67e2222,stroke:#e67e22
    style L3 fill:#e74c3c22,stroke:#e74c3c
```

---

## Diagram 8: Super-Goose + TimeWarp Integration Map

```mermaid
graph LR
    subgraph "Super-Goose Existing"
        A[ALMAS<br/>Team Coordinator<br/>5 Specialist Roles]
        E[EvoAgentX<br/>Self-Evolution<br/>Memory + Prompts]
        C[Coach/Player<br/>Quality Assurance<br/>Dual-Model Review]
        V[Conscious<br/>Voice Interface<br/>Speech + Intent]
    end

    subgraph "TimeWarp New"
        TW[TimeWarp<br/>Time-Travel Engine<br/>Events + Snapshots]
        TL[Timeline UI<br/>Visual History<br/>Branch Navigation]
    end

    A -->|"Role transitions<br/>= timeline events"| TW
    A -->|"Architect→Dev<br/>= natural fork point"| TW
    E -->|"Prompt A/B tests<br/>= parallel branches"| TW
    E -->|"Memory snapshots<br/>= event metadata"| TW
    C -->|"Coach rejection<br/>= fork & retry"| TW
    C -->|"Quality scores<br/>= event annotations"| TW
    V -->|"Voice commands<br/>= event triggers"| TW
    TW --> TL

    style TW fill:#4a9eff,color:#fff
    style TL fill:#2ecc71,color:#fff
```

---

## Diagram 9: CLI Command Map

```mermaid
mindmap
    root((tw))
        Status
            tw status
            tw log
            tw log --branch oauth
        Inspect
            tw show E7
            tw diff E5 E10
            tw diff --branch main oauth
        Navigate
            tw jump E7
            tw jump --latest
        Branch
            tw branch "auth"
            tw branch --from E5 "auth"
            tw branches
            tw switch oauth
        Merge
            tw merge oauth
            tw conflicts
            tw resolve auth.rs
        Replay
            tw replay
            tw replay --from E5 --to E15
            tw replay --mode verify
            tw replay --mode execute
        Integrity
            tw verify
            tw verify --full
        Export
            tw export-git
            tw export-git --branch oauth
```

---

## Diagram 10: Timeline UI Layout

```mermaid
graph TB
    subgraph Window["Super-Goose Desktop Window"]
        subgraph Top["Main Area (Editor / Chat / Agent Output)"]
            EDITOR["Code Editor + Agent Chat Panel"]
        end

        subgraph Middle["Event Inspector (collapsible)"]
            INSPECT["Event E7: shell cargo test<br/>Branch: main │ 14:23:05 │ 3.2s<br/>Files: src/auth.rs, tests/auth_test.rs<br/>Result: 12 passed │ Reproducibility: 0.95"]
        end

        subgraph Bottom["Timeline Bar (always visible)"]
            direction LR
            TRACK["main:  ●─●─●─●─●─●─●─▼─●─●─●<br/>oauth:      ╲─●─●─●<br/>jwt:            ╲─●─●"]
            CONTROLS["⏮ ◀ ▶ ⏭ │ Branch: main │ Event 9/19 │ 🔍"]
        end
    end

    Top --> Middle --> Bottom

    style Top fill:#1a1a2e,color:#fff
    style Middle fill:#16213e,color:#fff
    style Bottom fill:#0f3460,color:#fff
```

---

*All diagrams use GitHub-compatible Mermaid syntax. View rendered diagrams by viewing this file on GitHub or any Mermaid-compatible renderer.*
