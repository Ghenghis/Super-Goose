---
title: Agentic Core System
sidebar_position: 2
---

# Agentic Core System

Super-Goose extends goose with a **swappable agentic core system** — six specialized execution strategies that can be hot-swapped at runtime. Each core wraps an existing subsystem and presents a unified interface through the `AgentCore` trait.

## Architecture Overview

```mermaid
graph TB
    subgraph Agent["Agent::reply()"]
        CS[CoreSelector] --> REG[AgentCoreRegistry]
        REG --> FC[FreeformCore]
        REG --> SC[StructuredCore]
        REG --> OC[OrchestratorCore]
        REG --> SWC[SwarmCore]
        REG --> WC[WorkflowCore]
        REG --> AC[AdversarialCore]
    end

    FC --> RI[reply_internal - Default LLM loop]
    SC --> SG[state_graph - Code→Test→Fix FSM]
    OC --> OR[orchestrator + specialists]
    SWC --> SW[swarm + team parallel agents]
    WC --> WE[workflow_engine templates]
    AC --> ADV[adversarial Coach/Player]
```

## The Six Cores

| Core | Strategy | Best For |
|:--|:--|:--|
| **FreeformCore** | Default LLM conversation loop | Chat, research, open-ended tasks |
| **StructuredCore** | Code→Test→Fix finite state machine | Deterministic code generation with test validation |
| **OrchestratorCore** | Multi-agent specialist DAG coordination | Complex multi-file tasks requiring multiple specialists |
| **SwarmCore** | Parallel agent pool | Large-scale refactoring across many files |
| **WorkflowCore** | Template-based task pipelines | CI/CD, deployment, release workflows |
| **AdversarialCore** | Coach/Player adversarial review cycle | Security audits, code review, quality gates |

## AgentCore Trait

Every core implements the `AgentCore` trait, which provides:

| Method | Purpose |
|:--|:--|
| `name()` | Unique identifier matching `CoreType` enum |
| `core_type()` | Returns the `CoreType` variant |
| `capabilities()` | Declares what this core can do (code gen, testing, parallel, etc.) |
| `description()` | Human-readable description for `/cores` listing |
| `suitability_score(hint)` | Scores how suitable this core is for a task (0.0–1.0) |
| `execute(ctx, task)` | Runs the task within this core's execution strategy |
| `metrics()` | Returns current performance metrics |
| `reset_metrics()` | Clears metrics (e.g., on session start) |

## Hot-Swap Commands

Switch cores at runtime without restarting:

| Command | Action |
|:--|:--|
| `/cores` | List all 6 cores with descriptions and capabilities |
| `/core freeform` | Switch to FreeformCore |
| `/core structured` | Switch to StructuredCore (Code→Test→Fix) |
| `/core orchestrator` | Switch to OrchestratorCore (multi-agent) |
| `/core swarm` | Switch to SwarmCore (parallel) |
| `/core workflow` | Switch to WorkflowCore (templates) |
| `/core adversarial` | Switch to AdversarialCore (review) |

Aliases are supported: `struct`, `orch`, `wf`, `adv`, `coach`, `parallel`, `ctf`, etc.

## CoreSelector (Auto Selection)

The `CoreSelector` automatically picks the best core for a given task by:

1. **Categorizing** the task via keyword matching (code, refactor, research, docs, security, deploy)
2. **Querying** the `ExperienceStore` for historical performance data
3. **Scoring** each core's suitability for the task category
4. **Falling back** to suitability scoring if insufficient experience data exists

```mermaid
sequenceDiagram
    participant U as User Task
    participant CS as CoreSelector
    participant ES as ExperienceStore
    participant REG as Registry
    participant C as Chosen Core

    U->>CS: select_core(task)
    CS->>CS: categorize_task()
    CS->>ES: best_core_for_category()
    alt Has experience data
        ES-->>CS: CoreType + confidence
    else No data
        CS->>REG: score all cores
        REG-->>CS: highest suitability
    end
    CS->>REG: get_core(selected)
    REG-->>C: execute(ctx, task)
```

## Persistent Learning Engine

The learning engine enables cross-session improvement:

```mermaid
graph LR
    subgraph Learning["Learning Pipeline"]
        T[Task Execution] --> ES[ExperienceStore]
        ES --> IE[InsightExtractor]
        IE --> SL[SkillLibrary]
        R[Reflexion] --> RS[ReflectionStore]
        RS --> ES
    end

    ES --> CS[CoreSelector]
    SL --> AG[Agent Context]
```

| Component | Purpose |
|:--|:--|
| **ExperienceStore** | SQLite cross-session learning — stores task, core used, outcome, cost, time, insights |
| **InsightExtractor** | ExpeL-style pattern analysis — extracts insights about core selection, failures, and optimizations |
| **SkillLibrary** | Voyager-style reusable strategies — stores verified skills ranked by keyword relevance |
| **ReflectionStore** | Persistent Reflexion data — verbal reinforcement learning across sessions |

### Learning Commands

| Command | Action |
|:--|:--|
| `/experience` | Show recent task experiences |
| `/experience stats` | Show core performance statistics |
| `/skills` | List verified reusable skills |
| `/insights` | Extract and display pattern insights |

## Per-Core Metrics

Every core tracks performance metrics:

| Metric | Description |
|:--|:--|
| `total_executions` | Number of times this core has been used |
| `successful_executions` | Tasks completed successfully |
| `failed_executions` | Tasks that failed |
| `avg_turns` | Average number of turns per task |
| `avg_time_ms` | Average execution time in milliseconds |
| `avg_cost` | Average cost per execution |

## Test Coverage

| Module | Tests | Status |
|:--|:--:|:--:|
| Core (6 cores + registry + selector) | 87 | ALL PASS |
| ExperienceStore | 11 | ALL PASS |
| InsightExtractor | 7 | ALL PASS |
| SkillLibrary | 7 | ALL PASS |
| ReflectionStore | 7 | ALL PASS |
| Reflexion | 7 | ALL PASS |
| Planner | 13 | ALL PASS |
| **Backend Total** | **139** | **ALL PASS** |

## Runtime Wiring (commit b12a665ed6)

The agentic core system is fully wired into the Agent's runtime execution path. Here is how the components connect at runtime:

### Core Dispatch Flow in `Agent::reply()`

When a user message arrives, the `reply()` method follows this flow:

```mermaid
sequenceDiagram
    participant U as User Message
    participant A as Agent::reply()
    participant CS as CoreSelector
    participant REG as AgentCoreRegistry
    participant FC as FreeformCore
    participant NC as Non-Freeform Core

    U->>A: incoming message
    A->>CS: select_core(task_description)
    CS-->>A: SelectionResult (core_type, confidence)
    alt confidence > 0.7
        A->>REG: set_active(selected_core_type)
    end
    A->>REG: get active core
    alt Active core is Freeform
        REG-->>FC: execute via reply_internal()
    else Active core is non-Freeform
        REG-->>NC: core.execute(ctx, task)
        alt execution succeeds
            NC-->>A: CoreOutput
        else execution fails
            A->>FC: fallback to reply_internal()
        end
    end
    A->>A: record_experience(task, core, outcome)
```

**Key behaviors:**

1. **CoreSelector auto-invocation**: Before dispatching, the CoreSelector analyzes the incoming task and recommends a core. If confidence exceeds 0.7, the active core is switched automatically.

2. **Non-Freeform dispatch**: When a non-Freeform core is active, the task is dispatched through `core.execute()` instead of the default `reply_internal()` path.

3. **Automatic fallback**: If a non-Freeform core's `execute()` fails, the system automatically falls back to `FreeformCore` (which wraps `reply_internal()`), ensuring the user always gets a response.

4. **Experience recording**: After every task (success or failure), the outcome is recorded in the `ExperienceStore`, closing the learning loop so the CoreSelector can make better decisions over time.

### Lazy Initialization of Learning Stores

The `ExperienceStore` and `SkillLibrary` use interior mutability via `Mutex<Option<Arc<...>>>`:

```mermaid
sequenceDiagram
    participant A as Agent::reply()
    participant M as Mutex<Option<Arc<ExperienceStore>>>
    participant I as init_learning_stores()
    participant DB as SQLite

    A->>M: lock()
    alt store is None (first call)
        A->>I: init_learning_stores()
        I->>DB: create experience.db
        I->>DB: create skills.db
        I-->>M: Some(Arc<ExperienceStore>)
    else store is Some (subsequent calls)
        M-->>A: Arc<ExperienceStore>
    end
```

The `init_learning_stores()` method takes `&self` (not `&mut self`) thanks to the Mutex wrapper, allowing lazy initialization on the first call to `reply()` without requiring mutable access to the Agent struct.

### Experience Recording Loop

Every task execution records an experience entry, creating a feedback loop:

```mermaid
graph LR
    T[Task Arrives] --> CS[CoreSelector picks core]
    CS --> EX[Core executes task]
    EX --> R{Success?}
    R -->|Yes| SE[Record success experience]
    R -->|No| FE[Record failure experience]
    SE --> ES[ExperienceStore]
    FE --> ES
    ES --> IE[InsightExtractor analyzes patterns]
    IE --> SL[SkillLibrary stores verified strategies]
    ES --> CS
```

The `ExperienceStore` stores: task description, core type used, outcome (success/failure), execution time, token cost, and extracted insights. The `CoreSelector` queries this data when deciding which core to use for future tasks.

## File Structure

```
crates/goose/src/agents/core/
├── mod.rs                  # AgentCore trait, CoreType enum, CoreCapabilities
├── context.rs              # AgentContext, TaskHint, TaskCategory
├── freeform.rs             # FreeformCore implementation
├── structured.rs           # StructuredCore (Code→Test→Fix FSM)
├── orchestrator_core.rs    # OrchestratorCore (multi-agent)
├── swarm_core.rs           # SwarmCore (parallel agents)
├── workflow_core.rs        # WorkflowCore (template pipelines)
├── adversarial_core.rs     # AdversarialCore (Coach/Player)
├── registry.rs             # AgentCoreRegistry (hot-swap)
├── metrics.rs              # CoreMetrics, CoreMetricsSnapshot
└── selector.rs             # CoreSelector, SelectionResult

crates/goose/src/agents/
├── experience_store.rs     # SQLite cross-session learning
├── insight_extractor.rs    # ExpeL-style pattern analysis
├── skill_library.rs        # Voyager-style reusable strategies
└── persistence/
    └── reflection_store.rs # SQLite-backed Reflexion data
```
