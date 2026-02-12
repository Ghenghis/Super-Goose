# Super-Goose Architecture

> Comprehensive architecture reference for Super-Goose, a fork of [Block Inc's Goose](https://github.com/block/goose) AI coding agent enhanced with enterprise agentic capabilities, cross-session learning, OTA self-build, autonomous operations, and a multi-panel Electron UI.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Crate Architecture](#2-crate-architecture)
3. [Agent Core System](#3-agent-core-system)
4. [Learning Engine](#4-learning-engine)
5. [UI Layout System](#5-ui-layout-system)
6. [Enterprise Features](#6-enterprise-features)
7. [OTA Self-Build Pipeline](#7-ota-self-build-pipeline)
8. [Autonomous Daemon](#8-autonomous-daemon)
9. [Pipeline Visualization](#9-pipeline-visualization)
10. [Data Flow](#10-data-flow)

---

## 1. System Overview

Super-Goose is structured as a Rust backend powering an Electron/React desktop application, with communication over Server-Sent Events (SSE) and WebSocket channels.

```mermaid
graph TB
    subgraph "Electron / React Frontend"
        direction TB
        EP["Electron Main Process<br/>(Node.js)"]
        RP["React Renderer<br/>(Vite + TypeScript)"]
        PV["Pipeline Visualization<br/>(Quantum Particles)"]
        SG["Super-Goose Panel<br/>(8-Panel Sidebar)"]
        PS["Panel System<br/>(react-resizable-panels)"]
    end

    subgraph "Rust Backend"
        direction TB
        GS["goose-server<br/>(Axum HTTP + SSE)"]
        GA["goose (core library)<br/>Agent + Cores + Learning"]
        GM["goose-mcp<br/>(MCP Client)"]
        GAC["goose-acp<br/>(ACP Client)"]
        CLI["goose-cli<br/>(Terminal Interface)"]
    end

    subgraph "LLM Providers"
        direction LR
        AN[Anthropic]
        OA[OpenAI]
        GG[Google Gemini]
        OL[Ollama / Local]
    end

    subgraph "External Services"
        direction LR
        MCP["MCP Servers<br/>(stdio / HTTP)"]
        GH["GitHub Actions"]
        DB[(SQLite)]
    end

    EP <-->|"spawn / IPC"| GS
    EP <--> RP
    RP --> PV
    RP --> SG
    RP --> PS

    GS <-->|"SSE + REST"| RP
    GS --> GA
    GA --> GM
    GA --> GAC
    GA <-->|"SharedProvider"| AN
    GA <-->|"SharedProvider"| OA
    GA <-->|"SharedProvider"| GG
    GA <-->|"SharedProvider"| OL

    GM <-->|"stdio / streamable_http"| MCP
    GA -->|"ExperienceStore"| DB
    GA -->|"SkillLibrary"| DB
    GA -->|"AuditLog"| DB
    GA -->|"CiWatcher"| GH

    CLI -->|"HTTP"| GS

    style EP fill:#1e3a5f,color:#fff
    style RP fill:#1e3a5f,color:#fff
    style GS fill:#2d5016,color:#fff
    style GA fill:#2d5016,color:#fff
    style AN fill:#4a1942,color:#fff
    style OA fill:#4a1942,color:#fff
    style GG fill:#4a1942,color:#fff
    style OL fill:#4a1942,color:#fff
```

### Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Backend** | Rust (edition 2021) | Workspace with 7 crates, async via Tokio |
| **Frontend** | Electron + React 18 | TypeScript, Vite bundler, Tailwind CSS |
| **Communication** | SSE / WebSocket | Real-time streaming from backend to UI |
| **Database** | SQLite (via sqlx) | ExperienceStore, SkillLibrary, AuditLog, ReflectionStore |
| **AI Protocol** | MCP + ACP | Model Context Protocol and Agent Communication Protocol |
| **Build** | Cargo + Electron Forge | Cross-platform builds (Windows, macOS, Linux) |
| **CI/CD** | GitHub Actions | ci-main.yml, ci-comprehensive.yml, release workflows |

---

## 2. Crate Architecture

The Rust workspace contains 7 crates with clearly defined responsibilities and dependency relationships.

```mermaid
graph TD
    subgraph "Application Crates"
        CLI["goose-cli<br/><i>Binary: CLI interface</i>"]
        SRV["goose-server<br/><i>Binary: HTTP/SSE server</i>"]
    end

    subgraph "Core Library"
        CORE["goose<br/><i>Library: Agent + Cores + Learning<br/>+ OTA + Autonomous + Enterprise</i>"]
    end

    subgraph "Protocol Crates"
        MCP["goose-mcp<br/><i>MCP client implementation</i>"]
        ACP["goose-acp<br/><i>ACP client implementation</i>"]
    end

    subgraph "Testing Crates"
        TEST["goose-test<br/><i>Integration test harness</i>"]
        TSUP["goose-test-support<br/><i>Test utilities + fixtures</i>"]
    end

    CLI --> CORE
    CLI --> SRV
    SRV --> CORE
    SRV --> MCP
    SRV --> ACP
    CORE --> MCP
    CORE --> ACP
    TEST --> CORE
    TEST --> TSUP
    TSUP --> CORE

    style CORE fill:#2d5016,color:#fff,stroke:#4a8c1c,stroke-width:3px
    style CLI fill:#1e3a5f,color:#fff
    style SRV fill:#1e3a5f,color:#fff
    style MCP fill:#5c3d1e,color:#fff
    style ACP fill:#5c3d1e,color:#fff
    style TEST fill:#4a1942,color:#fff
    style TSUP fill:#4a1942,color:#fff
```

### Crate Details

| Crate | Type | Description |
|-------|------|-------------|
| **goose** | Library | Core agent logic, 6 execution cores, learning engine, OTA pipeline, autonomous daemon, enterprise features |
| **goose-cli** | Binary | Terminal-based interface, readline input, streaming output |
| **goose-server** | Binary | Axum-based HTTP server with SSE streaming, session management, REST API |
| **goose-mcp** | Library | Model Context Protocol client for stdio and streamable HTTP transports |
| **goose-acp** | Library | Agent Communication Protocol client for agent-to-agent messaging |
| **goose-test** | Binary | Integration test runner with end-to-end scenario support |
| **goose-test-support** | Library | Shared test utilities, mock providers, fixture generation |

### Key Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `tokio` | 1.49 | Async runtime |
| `axum` | latest | HTTP framework for goose-server |
| `sqlx` | latest | Async SQLite driver |
| `rmcp` | 0.14.0 | MCP protocol implementation |
| `serde` / `serde_json` | 1.0 | Serialization framework |
| `regex` | 1.12 | Pattern matching for guardrails, routing |

---

## 3. Agent Core System

The Agent Core System provides hot-swappable execution strategies. Each core implements the `AgentCore` trait and wraps a different problem-solving paradigm. The system lives in `crates/goose/src/agents/core/` (11 files).

```mermaid
graph TD
    subgraph "Agent::reply()"
        REPLY["reply() entry point"]
    end

    subgraph "Core Selection Layer"
        CS["CoreSelector<br/><i>Auto-selects best core</i><br/><i>confidence > 0.7 threshold</i>"]
        REG["AgentCoreRegistry<br/><i>Hot-swap via /core command</i>"]
    end

    subgraph "Six Execution Cores"
        FC["FreeformCore<br/><i>Default: open-ended LLM loop</i><br/>reply_internal()"]
        SC["StructuredCore<br/><i>Plan-Execute-Verify FSM</i><br/>state_graph/"]
        OC["OrchestratorCore<br/><i>Sub-task delegation DAG</i><br/>orchestrator + specialists"]
        SWC["SwarmCore<br/><i>Parallel multi-agent</i><br/>swarm + team"]
        WC["WorkflowCore<br/><i>DAG-based pipelines</i><br/>workflow_engine"]
        AC["AdversarialCore<br/><i>Red-team Coach/Player</i><br/>adversarial/"]
    end

    subgraph "Core Infrastructure"
        CTX["AgentContext<br/><i>TaskHint + TaskCategory</i>"]
        MET["CoreMetrics<br/><i>Per-core performance tracking</i>"]
        CAP["CoreCapabilities<br/><i>Suitability scoring bitmask</i>"]
    end

    REPLY --> CS
    CS -->|"experience data"| REG
    CS -->|"suitability scores"| REG
    REG --> FC
    REG --> SC
    REG --> OC
    REG --> SWC
    REG --> WC
    REG --> AC

    FC --> CTX
    SC --> CTX
    OC --> CTX
    SWC --> CTX
    WC --> CTX
    AC --> CTX

    FC --> MET
    SC --> MET
    OC --> MET
    SWC --> MET
    WC --> MET
    AC --> MET

    style REPLY fill:#1e3a5f,color:#fff
    style CS fill:#7d4e1e,color:#fff,stroke:#c47f2c,stroke-width:2px
    style REG fill:#7d4e1e,color:#fff
    style FC fill:#2d5016,color:#fff,stroke:#4a8c1c,stroke-width:2px
    style SC fill:#2d5016,color:#fff
    style OC fill:#2d5016,color:#fff
    style SWC fill:#2d5016,color:#fff
    style WC fill:#2d5016,color:#fff
    style AC fill:#2d5016,color:#fff
```

### Core Descriptions

| Core | Strategy | Use Case | Key Capabilities |
|------|----------|----------|-----------------|
| **FreeformCore** | Open-ended LLM loop | General chat, research, exploration | `freeform_chat`, `persistent_learning` |
| **StructuredCore** | Plan-Execute-Verify FSM | Code generation, test-fix cycles | `code_generation`, `testing`, `state_machine` |
| **OrchestratorCore** | Sub-task delegation DAG | Large refactoring, multi-file changes | `multi_agent`, `code_generation` |
| **SwarmCore** | Parallel multi-agent | Parallel analysis, broad searches | `parallel_execution`, `multi_agent` |
| **WorkflowCore** | DAG-based pipelines | Repeatable workflows, CI/CD tasks | `workflow_templates`, `state_machine` |
| **AdversarialCore** | Red-team Coach/Player | Security audits, quality reviews | `adversarial_review`, `testing` |

### CoreSelector Algorithm

```
1. Categorize task via keyword analysis -> TaskCategory
2. Query ExperienceStore for best core in that category
3. If data_points >= min_experiences (default: 3):
     -> Use historical winner (source: "experience")
4. Else:
     -> Fall back to static suitability scores from AgentCoreRegistry (source: "suitability")
5. If confidence > 0.7:
     -> Switch active core in registry
6. Return SelectionResult { core_type, confidence, rationale, source }
```

### AgentCoreRegistry

The registry manages core lifecycle and provides the `/core` and `/cores` slash commands:

- `/cores` -- list all registered cores with capabilities
- `/core <name>` -- hot-swap to a specific core
- Auto-fallback: if a non-freeform core fails, execution falls back to FreeformCore

### Source Files

| File | Lines | Description |
|------|-------|-------------|
| `mod.rs` | ~100 | Module root, `AgentCore` trait, `CoreType` enum, `CoreCapabilities`, `CoreOutput` |
| `freeform.rs` | ~80 | FreeformCore wrapping `reply_internal()` |
| `structured.rs` | ~120 | StructuredCore with plan/execute/verify FSM |
| `orchestrator_core.rs` | ~130 | OrchestratorCore with sub-task DAG |
| `swarm_core.rs` | ~120 | SwarmCore for parallel execution |
| `workflow_core.rs` | ~130 | WorkflowCore for template pipelines |
| `adversarial_core.rs` | ~120 | AdversarialCore Coach/Player review |
| `registry.rs` | ~200 | AgentCoreRegistry with hot-swap |
| `selector.rs` | ~180 | CoreSelector with experience-based selection |
| `context.rs` | ~100 | AgentContext, TaskHint, TaskCategory |
| `metrics.rs` | ~80 | CoreMetrics and CoreMetricsSnapshot |

---

## 4. Learning Engine

The Learning Engine provides cross-session intelligence through four components that work together to remember outcomes, extract patterns, and build a library of reusable strategies.

```mermaid
graph TD
    subgraph "Agent Execution"
        EXEC["Agent::reply()<br/><i>Task execution</i>"]
    end

    subgraph "Recording Layer"
        ES["ExperienceStore<br/><i>SQLite: task + core + outcome</i><br/><i>11 tests</i>"]
    end

    subgraph "Analysis Layer"
        IE["InsightExtractor<br/><i>ExpeL-style pattern analysis</i><br/><i>7 tests</i>"]
        SL["SkillLibrary<br/><i>Voyager-style reusable strategies</i><br/><i>7 tests</i>"]
    end

    subgraph "Reflexion Layer"
        RS["SqliteReflectionStore<br/><i>Persistent reflection data</i><br/><i>7 tests</i>"]
    end

    subgraph "Planning Layer"
        LP["LlmPlanner<br/><i>SharedProvider-wired planning</i><br/><i>13 tests</i>"]
        CM["CriticManager<br/><i>Auto-invoked after plan creation</i>"]
    end

    subgraph "Selection Feedback"
        CSF["CoreSelector<br/><i>Uses historical success rates</i>"]
    end

    EXEC -->|"record outcome"| ES
    EXEC -->|"success: store strategy"| SL
    EXEC -->|"reflect on result"| RS

    ES -->|"batch analysis"| IE
    IE -->|"core selection insights"| CSF
    IE -->|"failure patterns"| RS
    IE -->|"optimization tips"| SL

    ES -->|"historical stats"| CSF
    SL -->|"retrieve verified strategies"| EXEC
    RS -->|"past reflections"| LP
    LP -->|"create plan"| CM
    CM -->|"critique + revise"| LP

    style ES fill:#7d4e1e,color:#fff,stroke:#c47f2c,stroke-width:2px
    style IE fill:#4a1942,color:#fff
    style SL fill:#2d5016,color:#fff
    style RS fill:#1e3a5f,color:#fff
    style LP fill:#5c3d1e,color:#fff
    style CM fill:#5c3d1e,color:#fff
    style CSF fill:#7d4e1e,color:#fff
```

### Component Details

| Component | File | Storage | Purpose |
|-----------|------|---------|---------|
| **ExperienceStore** | `experience_store.rs` | SQLite | Records task, core_type, succeeded, turns_used, cost_dollars, time_ms, task_category, insights, tags |
| **InsightExtractor** | `insight_extractor.rs` | In-memory | Analyzes accumulated experiences to extract three insight types: core selection, failure patterns, optimization opportunities |
| **SkillLibrary** | `skill_library.rs` | SQLite | Stores verified reusable strategies with name, description, steps, prerequisites, verified flag. Only verified strategies are retrieved. |
| **SqliteReflectionStore** | `persistence/reflection_store.rs` | SQLite | Persists Reflexion loop data: reflections, self-assessments, improvement plans |

### Agent Struct Integration

The learning stores are integrated into the `Agent` struct using interior mutability:

```
Agent {
    experience_store: Mutex<Option<Arc<ExperienceStore>>>,
    skill_library: Mutex<Option<Arc<SkillLibrary>>>,
    ...
}
```

- **Lazy initialization**: `init_learning_stores()` takes `&self` and initializes on first call via `reply()`
- **Thread-safe**: `Mutex<Option<Arc<...>>>` pattern allows shared access across async tasks
- **Commands**: `/experience`, `/experience stats`, `/skills`, `/insights`

---

## 5. UI Layout System

The frontend uses `react-resizable-panels` to provide a flexible, persistent panel layout with 4 zones.

```mermaid
graph TD
    subgraph "Provider Hierarchy"
        TWP["TimeWarpProvider"]
        APP["AgentPanelProvider"]
        CLIP["CLIProvider"]
        SBP["SidebarProvider"]
        PSP["PanelSystemProvider<br/><i>State + Persistence</i>"]
    end

    TWP --> APP --> CLIP --> SBP --> PSP

    subgraph "Layout Zones"
        LZ["Left Zone<br/><i>Sidebar, Search, Bookmarks</i>"]
        CZ["Center Zone<br/><i>Chat, Pipeline</i>"]
        RZ["Right Zone<br/><i>Agent Panel, Super-Goose, Logs</i>"]
        BZ["Bottom Zone<br/><i>Terminal</i>"]
        SB["StatusBar<br/><i>Core, Cost, Session</i>"]
    end

    PSP --> LZ
    PSP --> CZ
    PSP --> RZ
    PSP --> BZ
    PSP --> SB

    subgraph "9 Registered Panels"
        P1["sidebar"]
        P2["chat"]
        P3["pipeline"]
        P4["terminal"]
        P5["agentPanel"]
        P6["superGoose"]
        P7["logs"]
        P8["search"]
        P9["bookmarks"]
    end

    LZ --> P1
    LZ --> P8
    LZ --> P9
    CZ --> P2
    CZ --> P3
    RZ --> P5
    RZ --> P6
    RZ --> P7
    BZ --> P4

    style PSP fill:#7d4e1e,color:#fff,stroke:#c47f2c,stroke-width:2px
    style CZ fill:#2d5016,color:#fff
    style LZ fill:#1e3a5f,color:#fff
    style RZ fill:#4a1942,color:#fff
    style BZ fill:#5c3d1e,color:#fff
```

### Layout Presets

| Preset | Left | Center | Right | Bottom | Description |
|--------|------|--------|-------|--------|-------------|
| **Focus** | Hidden | Chat 100% | Hidden | Hidden | Distraction-free chat |
| **Standard** | Sidebar 20% | Chat 60% | Hidden | Terminal 20% | Default development layout |
| **Full** | Sidebar 15% | Chat 45% | Agent 25% | Terminal 15% | All panels visible |
| **Agent** | Hidden | Chat 50% | Agent 50% | Hidden | Agent-focused interaction |
| **Custom** | User-defined | User-defined | User-defined | User-defined | Saved to localStorage |

### Super-Goose 8-Panel Sidebar

Located in `ui/desktop/src/components/super/`, the sidebar provides enterprise-grade dashboards:

| Panel | Component | Purpose |
|-------|-----------|---------|
| **Dashboard** | `DashboardPanel.tsx` | System overview, metrics, status |
| **Studios** | `StudiosPanel.tsx` | Workspace/project management |
| **Agents** | `AgentsPanel.tsx` | Active agent monitoring |
| **Marketplace** | `MarketplacePanel.tsx` | Extension discovery/install |
| **GPU** | `GPUPanel.tsx` | GPU resource monitoring |
| **Connections** | `ConnectionsPanel.tsx` | MCP server management |
| **Monitor** | `MonitorPanel.tsx` | Real-time performance monitoring |
| **Settings** | `SGSettingsPanel.tsx` | Super-Goose configuration |

All Super-Goose panels use `data-super="true"` attribute and `sg-*` CSS custom properties for dual color scoping, keeping stock Goose styles untouched.

---

## 6. Enterprise Features

Enterprise capabilities are implemented across 5 phases in the `crates/goose/src/` directory.

```mermaid
graph TD
    subgraph "Phase 1: Security Guardrails"
        GE["GuardrailsEngine<br/><i>Parallel async scanning</i>"]
        D1["PromptInjectionDetector<br/><i>50+ regex patterns</i>"]
        D2["PiiDetector<br/><i>Email, SSN, CC (Luhn), Phone</i>"]
        D3["JailbreakDetector<br/><i>DAN, DevMode, Bypass</i>"]
        D4["TopicDetector<br/><i>Violence, Drugs, Hate</i>"]
        D5["KeywordDetector<br/><i>Exact, Phrase, Fuzzy (Levenshtein)</i>"]
        D6["SecretDetector<br/><i>30+ patterns: AWS, GitHub, API keys</i>"]
    end

    subgraph "Phase 2: MCP Gateway"
        MGW["McpGateway<br/><i>Unified MCP endpoint</i>"]
        RTR["McpRouter<br/><i>Multi-server routing</i>"]
        PRM["PermissionManager<br/><i>Function-level ACL</i>"]
        CRD["CredentialStore<br/><i>Org/User/Session scopes</i>"]
        AUD["AuditLogger<br/><i>Redacted audit trail</i>"]
        BND["BundleManager<br/><i>Tool grouping per user</i>"]
    end

    subgraph "Phase 3: Observability"
        OBS["Observability<br/><i>OpenTelemetry GenAI conventions</i>"]
        CT["CostTracker<br/><i>30+ model pricing, session tracking</i>"]
        GM["GenAiMetrics<br/><i>Tokens, latency, errors</i>"]
        MM["McpMetrics<br/><i>Tool calls, server health</i>"]
        PX["PrometheusExporter<br/><i>Prometheus + Grafana dashboards</i>"]
    end

    subgraph "Phase 4: Policy Rule Engine"
        PE["PolicyEngine<br/><i>YAML-based rule evaluation</i>"]
        RE["RuleEngine<br/><i>26 condition types, 11 actions</i>"]
        LD["PolicyLoader<br/><i>YAML loading + hot-reload</i>"]
    end

    subgraph "Phase 5: Prompt Patterns"
        PM["PromptManager<br/><i>14 patterns, 5 categories</i>"]
        PL["PatternLibrary<br/><i>Reasoning, Structure, Safety, Task, Meta</i>"]
        TE["TemplateEngine<br/><i>Variable substitution + validation</i>"]
    end

    GE --> D1
    GE --> D2
    GE --> D3
    GE --> D4
    GE --> D5
    GE --> D6

    MGW --> RTR
    MGW --> PRM
    MGW --> CRD
    MGW --> AUD
    MGW --> BND

    OBS --> CT
    OBS --> GM
    OBS --> MM
    CT --> PX

    PE --> RE
    PE --> LD

    PM --> PL
    PM --> TE

    style GE fill:#8b1a1a,color:#fff
    style MGW fill:#1e3a5f,color:#fff
    style OBS fill:#2d5016,color:#fff
    style PE fill:#7d4e1e,color:#fff
    style PM fill:#4a1942,color:#fff
```

### Phase 1: Security Guardrails

Located in `crates/goose/src/guardrails/` (10 files).

| Detector | Patterns | Detection Method |
|----------|----------|-----------------|
| **PromptInjectionDetector** | 50+ | RegexSet parallel matching |
| **PiiDetector** | Email, SSN, CC, Phone | Regex + Luhn validation for credit cards |
| **JailbreakDetector** | DAN, DevMode, Bypass | RegexSet with sensitivity multipliers |
| **TopicDetector** | Violence, Drugs, Hate | Keyword lists with blocklist/allowlist modes |
| **KeywordDetector** | User-defined | Exact, phrase, fuzzy (Levenshtein distance) matching |
| **SecretDetector** | 30+ | AWS, GitHub, OpenAI, Anthropic, Azure, Generic keys |

Configuration: `GuardrailsConfig` with `Sensitivity` (Low/Medium/High), `FailMode` (FailClosed/FailOpen), and per-detector enable/disable.

### Phase 2: MCP Gateway

Located in `crates/goose/src/mcp_gateway/` (7 files).

- **McpRouter**: Server registration, tool discovery, health tracking, tool search
- **PermissionManager**: Policy-based ACL with wildcard patterns, user/group/role subjects, priority evaluation, expiring allow-lists
- **CredentialStore**: Organization-shared, per-user, and per-session credentials with expiration
- **AuditLogger**: Buffered writes with argument redaction for privacy
- **BundleManager**: Group tools into bundles with rate limiting per bundle

### Phase 3: Observability

Located in `crates/goose/src/observability/` (7 files).

- **Semantic Conventions**: Implements OpenTelemetry GenAI conventions (35+ attributes) plus MCP-specific and Goose-specific extensions
- **CostTracker**: Pre-loaded pricing for 30+ models (Anthropic Claude, OpenAI GPT, Google Gemini, Mistral, Cohere, Bedrock, Ollama); supports cached token pricing and custom pricing overrides
- **Export Formats**: JSON, CSV, Markdown, Prometheus text format, Grafana dashboard JSON

### Phase 4: Policy Rule Engine

Located in `crates/goose/src/policies/` (6 files).

| Category | Condition Types |
|----------|----------------|
| **String** | Contains, Matches (regex), Equals, StartsWith, EndsWith, IsEmpty, IsNotEmpty |
| **Numeric** | GreaterThan, GreaterThanOrEqual, LessThan, LessThanOrEqual, Between |
| **Collection** | InList, NotInList, HasKey, HasLength, ArrayContains |
| **Temporal** | Before, After, WithinLast |
| **Logical** | And, Or, Not |
| **Special** | Always, Never, Custom |

**Total: 26 condition types, 11 action types** (Block, Warn, Log, Notify, RequireApproval, Modify, RateLimit, Delay, AddMetadata, Webhook, Custom).

Features: YAML loading, hot-reload via `notify` crate, severity-based rule ordering, dry-run mode, fail-open/fail-closed modes, regex caching.

### Phase 5: Prompt Patterns

Located in `crates/goose/src/prompts/` (4 files).

| Category | Patterns |
|----------|----------|
| **Reasoning** | Chain of Thought, Tree of Thought, Self-Consistency |
| **Structure** | Role Definition, Output Formatting, Few-Shot Examples |
| **Safety** | Guardrail Instructions, Boundary Setting, Ethical Guidelines |
| **Task** | Code Generation, Code Review, Summarization |
| **Meta** | Self-Reflection, Uncertainty Expression |

**14 pre-built patterns** with a `PatternBuilder` API for fluent construction and a `TemplateEngine` for variable substitution with type validation.

---

## 7. OTA Self-Build Pipeline

The OTA (Over-The-Air) system enables Super-Goose to update itself through a validated pipeline. Located in `crates/goose/src/ota/` (7 modules, 90 tests).

```mermaid
graph TD
    subgraph "OTA Pipeline Flow"
        CHK["1. Check<br/><i>Detect source changes</i><br/><i>or config updates</i>"]
        SAV["2. Save<br/><i>Serialize agent state</i><br/><i>(config, sessions, learning)</i>"]
        BLD["3. Build<br/><i>cargo build with validation</i><br/><i>(profile, features)</i>"]
        SWP["4. Swap<br/><i>Atomic binary replacement</i><br/><i>(backup old, install new)</i>"]
        VER["5. Verify<br/><i>Health checks: binary runs,</i><br/><i>tests pass, API responds</i>"]
        RBK["6. Rollback<br/><i>Restore previous version</i><br/><i>if any check fails</i>"]
    end

    subgraph "OTA Modules"
        US["UpdateScheduler<br/><i>Cron / startup / manual triggers</i>"]
        SS["StateSaver<br/><i>Config + session serialization</i>"]
        SB["SelfBuilder<br/><i>Cargo build with profiles</i>"]
        BS["BinarySwapper<br/><i>Atomic file replacement</i>"]
        HC["HealthChecker<br/><i>Post-update verification</i>"]
        RM["RollbackManager<br/><i>Version restoration</i>"]
        OM["OtaManager<br/><i>Orchestrates full pipeline</i>"]
    end

    CHK --> SAV --> BLD --> SWP --> VER
    VER -->|"PASS"| DONE["Update Complete"]
    VER -->|"FAIL"| RBK
    RBK --> RESTORED["Previous Version Restored"]

    OM --> US
    OM --> SS
    OM --> SB
    OM --> BS
    OM --> HC
    OM --> RM

    US -.-> CHK
    SS -.-> SAV
    SB -.-> BLD
    BS -.-> SWP
    HC -.-> VER
    RM -.-> RBK

    style OM fill:#7d4e1e,color:#fff,stroke:#c47f2c,stroke-width:2px
    style DONE fill:#2d5016,color:#fff
    style RESTORED fill:#8b1a1a,color:#fff
```

### Module Details

| Module | File | Purpose |
|--------|------|---------|
| **OtaManager** | `mod.rs` | Orchestrates the full update pipeline, manages `UpdateStatus` state machine |
| **UpdateScheduler** | `update_scheduler.rs` | Cron-like scheduling, startup checks, manual triggers via `SchedulerConfig` and `UpdatePolicy` |
| **StateSaver** | `state_saver.rs` | Serializes config, sessions, and learning data to `StateSnapshot` |
| **SelfBuilder** | `self_builder.rs` | Runs `cargo build` with configurable `BuildConfig` and `BuildProfile` (Dev/Release/Custom) |
| **BinarySwapper** | `binary_swapper.rs` | Atomic binary replacement with backup, records `SwapRecord` |
| **HealthChecker** | `health_checker.rs` | Post-update checks: binary executes, test suite passes, HTTP API responds; produces `HealthReport` |
| **RollbackManager** | `rollback.rs` | Restores previous binary from backup, records `RollbackRecord` with `RollbackReason` |

### Update Status State Machine

```
Idle -> Checking -> SavingState -> Building -> Swapping -> HealthChecking -> Completed
                                                                         \-> RollingBack -> RolledBack
                                                                         \-> Failed
```

---

## 8. Autonomous Daemon

The Autonomous Daemon provides scheduled, self-directed task execution. Located in `crates/goose/src/autonomous/` (8 modules, 86 tests).

```mermaid
graph TD
    subgraph "AutonomousDaemon"
        AD["AutonomousDaemon<br/><i>Main coordinator</i>"]
    end

    subgraph "Task Management"
        TS["TaskScheduler<br/><i>Priority queue + cron scheduling</i>"]
    end

    subgraph "Git Operations"
        BM["BranchManager<br/><i>Create, switch, PR, merge</i>"]
        RM["ReleaseManager<br/><i>SemVer, tags, changelogs</i>"]
    end

    subgraph "CI/CD Integration"
        CW["CiWatcher<br/><i>GitHub Actions polling</i>"]
        DG["DocsGenerator<br/><i>README, Docusaurus, Mermaid</i>"]
    end

    subgraph "Safety & Audit"
        FS["Failsafe<br/><i>Circuit breaker + cascade</i>"]
        AL["AuditLog<br/><i>SQLite audit trail</i>"]
    end

    AD --> TS
    AD --> BM
    AD --> RM
    AD --> CW
    AD --> DG
    AD --> FS
    AD --> AL

    TS -->|"schedule"| BM
    TS -->|"schedule"| RM
    TS -->|"schedule"| CW
    TS -->|"schedule"| DG

    BM -->|"audit"| AL
    RM -->|"audit"| AL
    CW -->|"audit"| AL

    FS -->|"circuit break"| AD

    style AD fill:#1e3a5f,color:#fff,stroke:#4a8c1c,stroke-width:2px
    style TS fill:#7d4e1e,color:#fff
    style FS fill:#8b1a1a,color:#fff
    style AL fill:#2d5016,color:#fff
```

### Module Details

| Module | File | Purpose |
|--------|------|---------|
| **AutonomousDaemon** | `mod.rs` | Main coordinator with `Mutex`-protected components, running state via `AtomicBool` |
| **TaskScheduler** | `scheduler.rs` | Priority queue with `ActionType` enum, `Schedule` (cron/interval/once), `TaskStatus` tracking |
| **BranchManager** | `branch_manager.rs` | Git operations: create branch, switch, create `PullRequestSpec`, merge; returns `GitOpResult` |
| **ReleaseManager** | `release_manager.rs` | `SemVer` parsing, `BumpType` (Major/Minor/Patch), `ChangelogEntry` generation, `ReleaseSpec` |
| **DocsGenerator** | `docs_generator.rs` | Generate `DocSection` content, `FeatureEntry` tables, `MermaidDiagram` generation |
| **CiWatcher** | `ci_watcher.rs` | Poll GitHub Actions for `CiRun` status via `CiWatcherConfig`, returns `CiStatus` |
| **Failsafe** | `failsafe.rs` | `CircuitBreaker` with `CircuitState` (Closed/Open/HalfOpen), cascade detection via `FailsafeConfig` |
| **AuditLog** | `audit_log.rs` | SQLite-backed `AuditEntry` recording with `ActionOutcome` (Success/Failure/Skipped) |

---

## 9. Pipeline Visualization

The Pipeline Visualization renders a real-time animated view of agent activity, reading directly from `ChatState`. Located in `ui/desktop/src/components/pipeline/` (4 source files, 69 tests).

```mermaid
graph LR
    subgraph "ChatState Source"
        CS["useChatStream()<br/><i>Real streaming state</i>"]
    end

    subgraph "PipelineContext"
        PC["PipelineContext<br/><i>Maps ChatState to stages</i>"]
        STAGES["6 Stages:<br/>PLAN - TEAM - EXECUTE<br/>EVOLVE - REVIEW - OBSERVE"]
        PARTS["Quantum Particles<br/><i>Flow between stages</i>"]
        ACTS["ActivityLog<br/><i>Real-time entries</i>"]
        METS["StageMetrics<br/><i>Tokens, tools, time</i>"]
    end

    subgraph "Pipeline UI"
        AP["AnimatedPipeline<br/><i>SVG rendering + animation</i>"]
        BR["usePipelineBridge<br/><i>Wires ChatState to context</i>"]
    end

    subgraph "Settings"
        TG["Pipeline Toggle<br/><i>AppSettingsSection</i><br/><i>localStorage persist</i>"]
    end

    CS --> BR
    BR --> PC
    PC --> STAGES
    PC --> PARTS
    PC --> ACTS
    PC --> METS
    PC --> AP
    TG -->|"enable/disable"| AP

    style CS fill:#1e3a5f,color:#fff
    style PC fill:#7d4e1e,color:#fff,stroke:#c47f2c,stroke-width:2px
    style AP fill:#4a1942,color:#fff
```

### Pipeline Stages

| Stage | Maps From | Description |
|-------|-----------|-------------|
| **PLAN** | Agent thinking/planning | Initial task analysis and strategy |
| **TEAM** | Agent selecting core/tools | Team assembly and core selection |
| **EXECUTE** | Tool calls, code generation | Active execution of the plan |
| **EVOLVE** | Learning store updates | Strategy evolution from outcomes |
| **REVIEW** | Reflexion/critique | Quality review and self-assessment |
| **OBSERVE** | Metrics recording | Observability and telemetry |

### Particle System

Each particle has: `id`, `fromStage`, `toStage`, `progress` (0..1), `color`, `size`, `speed`. Particles flow between active stages to visualize agent workflow transitions.

### Pipeline Modes

| Mode | Trigger | Visual |
|------|---------|--------|
| **active** | Agent is processing | Animated particles flowing |
| **waiting** | Idle, awaiting input | Gentle pulse animation |
| **error** | Execution error | Red glow effect |
| **complete** | Task finished | Completion sweep animation |

---

## 10. Data Flow

The complete request lifecycle from user input to response delivery:

```mermaid
sequenceDiagram
    participant U as User
    participant E as Electron<br/>(React)
    participant S as goose-server<br/>(Axum)
    participant A as Agent<br/>(Core Library)
    participant CS as CoreSelector
    participant C as Active Core
    participant P as LLM Provider
    participant M as MCP Server
    participant L as Learning Engine

    U->>E: Type message
    E->>S: POST /reply (SSE stream)

    S->>A: agent.reply(messages)

    Note over A: Check if learning stores initialized
    A->>A: init_learning_stores() [lazy, first call only]

    Note over A: Core selection
    A->>CS: select_core(task_hint)
    CS->>L: query ExperienceStore
    L-->>CS: historical success rates
    CS-->>A: SelectionResult {core_type, confidence, rationale}

    alt confidence > 0.7
        A->>A: switch to selected core
    end

    Note over A: Execute via active core
    A->>C: core.execute(context)

    loop Tool + LLM Loop
        C->>P: send messages + tools
        P-->>C: response (text + tool_calls)

        opt Tool calls present
            C->>M: execute tool via MCP
            M-->>C: tool result
        end

        C-->>S: SSE: stream response chunks
        S-->>E: SSE: forward chunks
        E-->>U: Render streaming text
    end

    C-->>A: CoreOutput {completed, summary, turns_used}

    Note over A: Record learning data
    A->>L: ExperienceStore.record(task, core, outcome)
    A->>L: SkillLibrary.store(strategy) [if successful]

    A-->>S: Final response
    S-->>E: SSE: complete
    E-->>U: Display final result
```

### Extension System (3-Tier)

```mermaid
graph LR
    subgraph "Tier 1: Builtin"
        B1["developer"]
        B2["computercontroller"]
        B3["autovisualiser"]
        B4["memory"]
        B5["tutorial"]
    end

    subgraph "Tier 2: Bundled"
        BD["bundled-extensions.json<br/><i>30 entries</i>"]
    end

    subgraph "Tier 3: Custom"
        CU["User config.yaml<br/><i>stdio / streamable_http</i>"]
    end

    B1 --> AGENT["Agent"]
    B2 --> AGENT
    B3 --> AGENT
    B4 --> AGENT
    B5 --> AGENT
    BD -->|"auto-discover"| AGENT
    CU -->|"user-configured"| AGENT

    style B1 fill:#2d5016,color:#fff
    style B2 fill:#2d5016,color:#fff
    style B3 fill:#2d5016,color:#fff
    style B4 fill:#2d5016,color:#fff
    style B5 fill:#2d5016,color:#fff
    style BD fill:#7d4e1e,color:#fff
    style CU fill:#4a1942,color:#fff
```

### Feature Flags

| Flag | Default | Scope |
|------|---------|-------|
| `memory` | ON | Memory extension, bookmarks, HITL, extended thinking |
| `swarm-experimental` | OFF | Swarm features (empty stub) |
| Reflexion, Guardrails, Cost Tracking | Always compiled | Not feature-gated |

---

## Test Coverage Summary

| Module | Tests | Status |
|--------|-------|--------|
| Agent Core System | 87 | All passing |
| Learning Engine | 52 | All passing |
| OTA Self-Build | 90 | All passing |
| Autonomous Daemon | 86 | All passing |
| Pipeline Visualization (Vitest) | 69 | All passing |
| Super-Goose Panel (Vitest) | 11 | All passing |
| Frontend (total Vitest) | 2,097 | All passing |
| Playwright E2E | 291 passed, 68 skipped | Zero failures |
| Rust Backend (total) | 1,754 passed (of 1,763) | 9 pre-existing failures (JWT crypto + evolution) |
| TypeScript (tsc --noEmit) | Clean | Zero errors |

---

## Directory Structure

```
G:\goose/
  crates/
    goose/                          # Core library
      src/
        agents/
          core/                     # 11 files: 6 cores + registry + selector + context + metrics
          experience_store.rs       # SQLite cross-session learning
          insight_extractor.rs      # ExpeL-style pattern analysis
          skill_library.rs          # Voyager-style reusable strategies
          persistence/
            reflection_store.rs     # Reflexion data store
        ota/                        # 7 modules: OTA self-build pipeline
        autonomous/                 # 8 modules: Autonomous daemon
        guardrails/                 # Enterprise Phase 1: Security detectors
        mcp_gateway/                # Enterprise Phase 2: MCP routing + ACL
        observability/              # Enterprise Phase 3: OpenTelemetry + cost
        policies/                   # Enterprise Phase 4: Rule engine
        prompts/                    # Enterprise Phase 5: Prompt patterns
    goose-cli/                      # CLI binary
    goose-server/                   # HTTP/SSE server binary
    goose-mcp/                      # MCP protocol client
    goose-acp/                      # ACP protocol client
    goose-test/                     # Integration test runner
    goose-test-support/             # Test utilities
  ui/desktop/
    src/
      components/
        pipeline/                   # Real-time pipeline visualization
        super/                      # 8-panel Super-Goose sidebar
        GooseSidebar/               # Agent panel (8 components)
        timewarp/                   # TimeWarp bar (8 components)
        settings/enterprise/        # Enterprise settings (7 panels)
      styles/
        main.css                    # sg-* design tokens (255 lines)
```

---

## Build and Run

### Prerequisites

- Rust toolchain (edition 2021)
- Node.js (v24 or earlier recommended; v25+ requires cross-zip patch)
- Windows: `LIB` environment variable pointing to Windows SDK and MSVC paths

### Backend

```bash
cargo build -p goose-cli -p goose-server
cargo test --workspace
```

### Frontend

```bash
cd ui/desktop
npm install --include=dev
npm run make   # Electron Forge build
```

### Docker

```bash
docker build -t super-goose .
docker run -p 3284:3284 super-goose
```
