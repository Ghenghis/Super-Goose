# Super-Goose Agentic Core System -- Architecture

> Comprehensive architecture reference for the Super-Goose multi-core agent system,
> learning engine, sidebar panels, and dispatch pipeline.

---

## Table of Contents

1. [AgentCore Trait and Implementations](#1-agentcore-trait-and-implementations)
2. [Learning Engine Pipeline](#2-learning-engine-pipeline)
3. [8-Panel Sidebar Architecture](#3-8-panel-sidebar-architecture)
4. [Core Dispatch Flow](#4-core-dispatch-flow)
5. [Test Coverage](#5-test-coverage)
6. [File Tree](#6-file-tree)

---

## 1. AgentCore Trait and Implementations

The `AgentCore` trait provides a unified interface for six distinct execution strategies.
Each core wraps an existing subsystem and can be hot-swapped at runtime via `/core <name>`.
The `AgentCoreRegistry` manages all registered cores and provides the active core to `Agent::reply()`.

```mermaid
graph TB
    subgraph "AgentCore Trait"
        TRAIT["<b>trait AgentCore</b><br/>Send + Sync + async_trait"]
    end

    TRAIT --- METHODS["<i>Methods:</i><br/>name() -> &str<br/>core_type() -> CoreType<br/>capabilities() -> CoreCapabilities<br/>description() -> &str<br/>suitability_score(hint) -> f32<br/>execute(ctx, task) -> Result&lt;CoreOutput&gt;<br/>metrics() -> CoreMetrics<br/>reset_metrics()"]

    TRAIT --> FREEFORM["<b>FreeformCore</b><br/><i>freeform.rs</i><br/>Default LLM loop<br/>Open-ended chat & research"]
    TRAIT --> STRUCTURED["<b>StructuredCore</b><br/><i>structured.rs</i><br/>Code-Test-Fix FSM<br/>Deterministic state graph"]
    TRAIT --> ORCHESTRATOR["<b>OrchestratorCore</b><br/><i>orchestrator_core.rs</i><br/>DAG task decomposition<br/>Multi-specialist coordination"]
    TRAIT --> SWARM["<b>SwarmCore</b><br/><i>swarm_core.rs</i><br/>Parallel agent teams<br/>Concurrent execution"]
    TRAIT --> WORKFLOW["<b>WorkflowCore</b><br/><i>workflow_core.rs</i><br/>Template pipelines<br/>Reproducible workflows"]
    TRAIT --> ADVERSARIAL["<b>AdversarialCore</b><br/><i>adversarial_core.rs</i><br/>Coach/Player review cycles<br/>Self-improving outputs"]

    subgraph "Support Types"
        CT["CoreType<br/>(enum: 6 variants)"]
        CC["CoreCapabilities<br/>(10 boolean/int fields)"]
        CO["CoreOutput<br/>(completed, summary,<br/>turns_used, artifacts, metrics)"]
        CM["CoreMetrics<br/>+ CoreMetricsSnapshot"]
        CTX["AgentContext<br/>(provider, extensions,<br/>cost tracker, sessions)"]
        TH["TaskHint + TaskCategory"]
    end

    subgraph "Registry"
        REG["<b>AgentCoreRegistry</b><br/><i>registry.rs</i><br/>register(core)<br/>set_active(CoreType)<br/>active_core() -> &dyn AgentCore<br/>list_cores() -> Vec<br/>/core and /cores commands"]
    end

    FREEFORM --> REG
    STRUCTURED --> REG
    ORCHESTRATOR --> REG
    SWARM --> REG
    WORKFLOW --> REG
    ADVERSARIAL --> REG

    style TRAIT fill:#1a1a2e,stroke:#e94560,stroke-width:3px,color:#eee
    style FREEFORM fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style STRUCTURED fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style ORCHESTRATOR fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style SWARM fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style WORKFLOW fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style ADVERSARIAL fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style REG fill:#0a3d62,stroke:#60a3bc,stroke-width:2px,color:#eee
```

### Core Capabilities Matrix

| Core | Code Gen | Testing | Multi-Agent | Parallel | Workflow | Adversarial | Freeform | State Machine |
|------|----------|---------|-------------|----------|----------|-------------|----------|---------------|
| FreeformCore | yes | -- | -- | -- | -- | -- | **yes** | -- |
| StructuredCore | **yes** | **yes** | -- | -- | -- | -- | -- | **yes** |
| OrchestratorCore | yes | yes | **yes** | -- | -- | -- | -- | -- |
| SwarmCore | yes | yes | **yes** | **yes** | -- | -- | -- | -- |
| WorkflowCore | yes | yes | -- | -- | **yes** | -- | -- | yes |
| AdversarialCore | yes | yes | **yes** | -- | -- | **yes** | -- | -- |

---

## 2. Learning Engine Pipeline

The Learning Engine provides cross-session intelligence. It records task outcomes, extracts
reusable insights, and builds a verified skill library. The `CoreSelector` uses historical
data from the `ExperienceStore` to auto-select the best core for each new task.

```mermaid
graph LR
    subgraph "Runtime Loop"
        TASK["User Task"]
        AGENT["Agent::reply()"]
        CORE["Active Core<br/>execute()"]
        RESULT["CoreOutput"]
    end

    TASK --> AGENT --> CORE --> RESULT

    subgraph "Learning Engine (Phase 2)"
        direction TB
        ES["<b>ExperienceStore</b><br/><i>experience_store.rs</i><br/>SQLite cross-session DB<br/>task, core, outcome, insights<br/>11 tests"]
        IE["<b>InsightExtractor</b><br/><i>insight_extractor.rs</i><br/>ExpeL-style analysis<br/>core_selection patterns<br/>failure patterns<br/>optimization patterns<br/>7 tests"]
        SL["<b>SkillLibrary</b><br/><i>skill_library.rs</i><br/>Voyager-style strategies<br/>verified-only retrieval<br/>reusable task solutions<br/>7 tests"]
    end

    RESULT -->|"record_experience()"| ES
    ES -->|"extract_insights()"| IE
    IE -->|"store_skill()"| SL
    SL -->|"retrieve_skills(task)"| AGENT

    subgraph "Reflexion System"
        REF["<b>Reflexion</b><br/><i>reflexion.rs</i><br/>Self-critique after failures<br/>Retry with reflection<br/>7 tests"]
        RS["<b>SqliteReflectionStore</b><br/><i>persistence/reflection_store.rs</i><br/>Persistent reflection data<br/>7 tests"]
    end

    RESULT -->|"on failure"| REF
    REF -->|"persist()"| RS
    REF -->|"retry with reflection"| CORE
    RS -->|"feed history"| ES

    subgraph "Auto Core Selection (Phase 3)"
        CS["<b>CoreSelector</b><br/><i>core/selector.rs</i><br/>Suitability scoring<br/>Historical performance<br/>Experience-weighted"]
    end

    ES -->|"historical outcomes"| CS
    CS -->|"select_core()"| CORE

    subgraph "Planning"
        PL["<b>LlmPlanner</b><br/><i>planner.rs</i><br/>SharedProvider LLM calls<br/>SimplePatternPlanner fallback<br/>CriticManager auto-invoked<br/>13 tests"]
    end

    TASK --> PL
    PL -->|"plan"| AGENT

    subgraph "Commands"
        CMD1["/experience<br/>/experience stats"]
        CMD2["/skills"]
        CMD3["/insights"]
    end

    ES --- CMD1
    SL --- CMD2
    IE --- CMD3

    style ES fill:#1b4332,stroke:#52b788,stroke-width:2px,color:#eee
    style IE fill:#1b4332,stroke:#52b788,stroke-width:2px,color:#eee
    style SL fill:#1b4332,stroke:#52b788,stroke-width:2px,color:#eee
    style REF fill:#3c1642,stroke:#a663cc,stroke-width:2px,color:#eee
    style RS fill:#3c1642,stroke:#a663cc,stroke-width:2px,color:#eee
    style CS fill:#0a3d62,stroke:#60a3bc,stroke-width:2px,color:#eee
    style PL fill:#462521,stroke:#d4a373,stroke-width:2px,color:#eee
```

### Data Flow Summary

1. **Record**: After each task, `Agent` writes an experience entry (task description, chosen core, outcome, duration) into `ExperienceStore` (SQLite).
2. **Extract**: `InsightExtractor` periodically analyzes stored experiences to identify patterns -- which cores succeed for which task categories, common failure modes, and optimization opportunities.
3. **Build Skills**: High-confidence, verified task strategies are promoted into the `SkillLibrary` for future retrieval.
4. **Reflect**: On failure, `Reflexion` generates a self-critique, stores it in `SqliteReflectionStore`, and retries the task with the reflection context appended.
5. **Auto-Select**: `CoreSelector` combines suitability scores from each core's `suitability_score()` method with historical success rates from `ExperienceStore` to pick the optimal core.

---

## 3. 8-Panel Sidebar Architecture

The Super-Goose desktop UI features an expandable sidebar with eight panels, managed by
`AgentPanelContext` and rendered through `AppSidebar`.

```mermaid
graph TB
    subgraph "Provider Hierarchy"
        TWP["TimeWarpProvider"]
        APC["AgentPanelProvider"]
        CLIP["CLIProvider"]
        SBP["SidebarProvider"]
        TWP --> APC --> CLIP --> SBP
    end

    subgraph "AppSidebar (GooseSidebar/)"
        SB["<b>AppSidebar.tsx</b><br/>Main sidebar shell<br/>Panel switcher"]
    end

    SBP --> SB

    subgraph "8 Sidebar Panels"
        P1["<b>AgentStatusPanel</b><br/>Dashboard: core status,<br/>active tasks, health"]
        P2["<b>TaskBoardPanel</b><br/>Studios: task queue,<br/>progress tracking"]
        P3["<b>AgentMessagesPanel</b><br/>Agents: message stream,<br/>inter-agent comms"]
        P4["<b>SkillsPluginsPanel</b><br/>Marketplace: extensions,<br/>3-tier plugin display"]
        P5["<b>FileActivityPanel</b><br/>GPU/Files: file ops,<br/>resource monitoring"]
        P6["<b>ConnectorStatusPanel</b><br/>Connections: MCP servers,<br/>external integrations"]
        P7["<b>ToolCallLog</b><br/>Monitor: tool calls,<br/>execution trace"]
        P8["<b>Settings</b><br/>Enterprise panels,<br/>theme, environment"]
    end

    SB --> P1
    SB --> P2
    SB --> P3
    SB --> P4
    SB --> P5
    SB --> P6
    SB --> P7
    SB --> P8

    subgraph "Enterprise Settings (settings/enterprise/)"
        ES1["EnterpriseSettingsSection"]
        ES2["GatewayPanel"]
        ES3["GuardrailsPanel"]
        ES4["HooksPanel"]
        ES5["MemoryPanel"]
        ES6["ObservabilityPanel"]
        ES7["PoliciesPanel"]
        ES8["EnterpriseRoutePanel"]
    end

    P8 --> ES1
    ES1 --> ES2
    ES1 --> ES3
    ES1 --> ES4
    ES1 --> ES5
    ES1 --> ES6
    ES1 --> ES7
    ES1 --> ES8

    subgraph "Context"
        CTX["<b>AgentPanelContext.tsx</b><br/>activePanel state<br/>panel switching<br/>data subscriptions"]
    end

    CTX --> SB

    subgraph "Supporting Components"
        ENV["EnvironmentBadge.tsx"]
        THM["ThemeSelector.tsx"]
    end

    SB --> ENV
    SB --> THM

    style SB fill:#1a1a2e,stroke:#e94560,stroke-width:2px,color:#eee
    style CTX fill:#0a3d62,stroke:#60a3bc,stroke-width:2px,color:#eee
    style P1 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P2 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P3 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P4 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P5 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P6 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P7 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style P8 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
```

---

## 4. Core Dispatch Flow

This sequence diagram shows the complete path from user input through core selection,
registry lookup, execution, and learning feedback.

```mermaid
sequenceDiagram
    participant U as User
    participant A as Agent
    participant PL as LlmPlanner
    participant CS as CoreSelector
    participant REG as AgentCoreRegistry
    participant CORE as Chosen Core
    participant ES as ExperienceStore
    participant IE as InsightExtractor
    participant SL as SkillLibrary
    participant REF as Reflexion

    U->>A: send task message
    A->>PL: create_plan(task)
    PL-->>A: Plan (steps + hints)

    A->>SL: retrieve_skills(task)
    SL-->>A: Vec<Skill> (verified strategies)

    A->>CS: select_core(task_hint)
    CS->>ES: get_historical_outcomes(task_category)
    ES-->>CS: Vec<Experience>
    CS->>REG: list_cores()
    REG-->>CS: Vec<&dyn AgentCore>

    loop for each core
        CS->>CORE: suitability_score(hint)
        CORE-->>CS: f32 (0.0 - 1.0)
    end

    CS-->>A: SelectionResult { core_type, confidence }
    A->>REG: set_active(core_type)
    REG-->>A: Ok

    A->>REG: active_core()
    REG-->>A: &dyn AgentCore
    A->>CORE: execute(ctx, task)

    alt Success
        CORE-->>A: CoreOutput { completed: true }
        A->>ES: record_experience(task, core, Success)
        ES->>IE: extract_insights() (async)
        IE->>SL: store_skill() (if high confidence)
        A-->>U: response
    else Failure
        CORE-->>A: CoreOutput { completed: false }
        A->>REF: reflect(task, output)
        REF->>REF: generate self-critique
        REF->>CORE: retry with reflection context
        CORE-->>REF: CoreOutput (retry)
        REF-->>A: final output
        A->>ES: record_experience(task, core, outcome)
        A-->>U: response
    end
```

### Dispatch Phases

| Phase | Component | Action |
|-------|-----------|--------|
| 1. Planning | `LlmPlanner` | Decomposes task into steps, generates `TaskHint` |
| 2. Skill Lookup | `SkillLibrary` | Retrieves verified strategies matching the task |
| 3. Core Selection | `CoreSelector` | Scores all cores using suitability + historical data |
| 4. Registry Activation | `AgentCoreRegistry` | Sets the chosen core as active |
| 5. Execution | Active `AgentCore` | Runs `execute(ctx, task)` with the core's strategy |
| 6. Learning | `ExperienceStore` | Records outcome for future selection improvement |
| 7. Reflection | `Reflexion` | On failure: self-critique, retry, then record |

---

## 5. Test Coverage

All tests verified passing as of 2026-02-12.

| Module | File(s) | Tests | Status |
|--------|---------|-------|--------|
| Core (6 cores + registry + selector) | `core/*.rs` | 87 | ALL PASS |
| ExperienceStore | `experience_store.rs` | 11 | ALL PASS |
| InsightExtractor | `insight_extractor.rs` | 7 | ALL PASS |
| SkillLibrary | `skill_library.rs` | 7 | ALL PASS |
| ReflectionStore | `persistence/reflection_store.rs` | 7 | ALL PASS |
| Reflexion | `reflexion.rs` | 7 | ALL PASS |
| Planner | `planner.rs` | 13 | ALL PASS |
| **Backend Total** | -- | **139** | **ALL PASS** |
| Frontend Vitest | `ui/desktop/src/**/*.test.*` | 2086 | ALL PASS |
| SuperGoosePanel (Sidebar) | `GooseSidebar/__tests__/` | 11 | ALL PASS |
| Pipeline Visualization | `pipeline/__tests__/` | 58 | ALL PASS |

### Running the Tests

```bash
# Backend -- all agentic core tests
cargo test --lib -p goose -- core::

# Backend -- learning engine tests
cargo test --lib -p goose -- experience_store::
cargo test --lib -p goose -- insight_extractor::
cargo test --lib -p goose -- skill_library::
cargo test --lib -p goose -- reflexion::
cargo test --lib -p goose -- reflection_store::
cargo test --lib -p goose -- planner::

# Backend -- all 139 tests at once
cargo test --lib -p goose

# Frontend -- all Vitest tests
cd ui/desktop && npx vitest run

# Frontend -- sidebar panel tests only
cd ui/desktop && npx vitest run src/components/GooseSidebar/

# Frontend -- pipeline visualization tests only
cd ui/desktop && npx vitest run src/components/pipeline/
```

---

## 6. File Tree

All files created or modified for the Agentic Core System, Learning Engine, and supporting
UI components.

```
crates/goose/src/agents/
+-- core/                              # Agentic Core System (Phase 1)
|   +-- mod.rs                         # AgentCore trait, CoreType enum, CoreCapabilities,
|   |                                  #   CoreOutput, re-exports
|   +-- context.rs                     # AgentContext, TaskHint, TaskCategory
|   +-- freeform.rs                    # FreeformCore -- default LLM loop
|   +-- structured.rs                  # StructuredCore -- Code-Test-Fix state graph
|   +-- orchestrator_core.rs           # OrchestratorCore -- DAG multi-specialist
|   +-- swarm_core.rs                  # SwarmCore -- parallel agent teams
|   +-- workflow_core.rs               # WorkflowCore -- template pipelines
|   +-- adversarial_core.rs            # AdversarialCore -- Coach/Player review
|   +-- registry.rs                    # AgentCoreRegistry -- registration, hot-swap,
|   |                                  #   /core and /cores commands
|   +-- metrics.rs                     # CoreMetrics, CoreMetricsSnapshot
|   +-- selector.rs                    # CoreSelector, SelectionResult
|
+-- persistence/                       # Persistence Layer
|   +-- mod.rs                         # Module root
|   +-- memory.rs                      # In-memory message store
|   +-- sqlite.rs                      # SQLite session persistence
|   +-- reflection_store.rs            # SqliteReflectionStore (7 tests)
|
+-- experience_store.rs                # ExperienceStore -- SQLite cross-session learning
|                                      #   (task, core, outcome, insights) (11 tests)
+-- insight_extractor.rs               # InsightExtractor -- ExpeL-style pattern analysis
|                                      #   (core selection, failure, optimization) (7 tests)
+-- skill_library.rs                   # SkillLibrary -- Voyager-style verified strategies
|                                      #   (7 tests)
+-- reflexion.rs                       # Reflexion -- self-critique + retry (7 tests)
+-- planner.rs                         # LlmPlanner + SimplePatternPlanner + CriticManager
|                                      #   (13 tests)
+-- agent.rs                           # Agent struct (experience_store, skill_library fields)
+-- mod.rs                             # Module declarations

ui/desktop/src/components/
+-- GooseSidebar/                      # 8-Panel Sidebar System
|   +-- index.ts                       # Barrel exports
|   +-- AppSidebar.tsx                 # Main sidebar shell + panel switcher
|   +-- AgentPanelContext.tsx           # React context for panel state
|   +-- AgentStatusPanel.tsx           # Dashboard panel
|   +-- TaskBoardPanel.tsx             # Studios / task queue panel
|   +-- AgentMessagesPanel.tsx         # Agent messages panel
|   +-- SkillsPluginsPanel.tsx         # Marketplace / extensions panel
|   +-- FileActivityPanel.tsx          # File activity / GPU panel
|   +-- ConnectorStatusPanel.tsx       # MCP connections panel
|   +-- ToolCallLog.tsx                # Tool call monitor panel
|   +-- EnvironmentBadge.tsx           # Environment indicator
|   +-- ThemeSelector.tsx              # Theme picker
|   +-- __tests__/                     # 11 test files
|       +-- AgentMessagesPanel.test.tsx
|       +-- AgentPanelContext.test.tsx
|       +-- AgentStatusPanel.test.tsx
|       +-- ConnectorStatusPanel.test.tsx
|       +-- FileActivityPanel.test.tsx
|       +-- SkillsPluginsPanel.test.tsx
|       +-- TaskBoardPanel.test.tsx
|       +-- ToolCallLog.test.tsx
|       +-- AppSidebar.test.tsx
|       +-- ThemeSelector.test.tsx
|       +-- EnvironmentBadge.test.tsx
|
+-- pipeline/                          # Pipeline Visualization (9/10 complete)
|   +-- index.ts                       # Barrel exports
|   +-- AnimatedPipeline.tsx           # Quantum particle animation
|   +-- PipelineContext.tsx            # Pipeline state context
|   +-- usePipelineBridge.ts           # Bridge to ChatState
|   +-- __tests__/
|       +-- AnimatedPipeline.test.tsx
|       +-- PipelineContext.test.tsx
|       +-- usePipelineBridge.test.tsx
|
+-- settings/enterprise/               # Enterprise Settings Panels
    +-- EnterpriseSettingsSection.tsx   # Section wrapper
    +-- EnterpriseRoutePanel.tsx        # Route-level panel
    +-- GatewayPanel.tsx               # API gateway config
    +-- GuardrailsPanel.tsx            # Safety guardrails config
    +-- HooksPanel.tsx                 # Lifecycle hooks config
    +-- MemoryPanel.tsx                # Memory system config
    +-- ObservabilityPanel.tsx         # Observability config
    +-- PoliciesPanel.tsx              # Policy management
    +-- __tests__/                     # 6 test files
        +-- EnterpriseRoutePanel.test.tsx
        +-- GatewayPanel.test.tsx
        +-- PoliciesPanel.test.tsx
        +-- HooksPanel.test.tsx
        +-- MemoryPanel.test.tsx
        +-- ObservabilityPanel.test.tsx
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `-->` | Direct dependency / call |
| `-.->` | Async or periodic dependency |
| SQLite | Persistent cross-session storage |
| `Phase N` | Implementation phase in the 10-agent master plan |
| `/core`, `/cores` | Runtime slash commands for core management |
| `/experience`, `/skills`, `/insights` | Learning engine slash commands |

---

*Generated 2026-02-12. Corresponds to commit history on branch `feat/comprehensive-testing`.*
