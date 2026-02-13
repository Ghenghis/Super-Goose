# Super-Goose Feature Catalog

> Comprehensive feature reference for Super-Goose v1.24.05
> Last updated: 2026-02-12

---

## Feature Dashboard

| # | Feature | Status | Tests | Section |
|---|---------|--------|------:|---------|
| 1 | 6 AgentCores + CoreSelector | **COMPLETE** | 87 | [Core Features](#1-agent-cores) |
| 2 | Learning Engine (ExpeL + Voyager) | **COMPLETE** | 52 | [Core Features](#2-learning-engine) |
| 3 | OTA Self-Build Pipeline | **COMPLETE** | 90 | [Backend](#1-ota-self-build-pipeline) |
| 4 | Autonomous Daemon | **COMPLETE** | 86 | [Backend](#2-autonomous-daemon) |
| 5 | Pipeline Visualization | **COMPLETE** | 69 | [Core Features](#3-pipeline-visualization) |
| 6 | Resizable Panel System | **COMPLETE** | 67 | [Core Features](#4-resizable-panel-system) |
| 7 | 8-Panel Super-Goose Sidebar | **COMPLETE** | 11 | [UI Features](#2-8-panel-super-goose-sidebar) |
| 8 | sg-* Design Tokens | **COMPLETE** | -- | [UI Features](#3-sg--design-tokens) |
| 9 | Security Guardrails (6 detectors) | **COMPLETE** | 74 | [Enterprise](#phase-1-security-guardrails) |
| 10 | MCP Gateway | **COMPLETE** | 47 | [Enterprise](#phase-2-mcp-gateway) |
| 11 | Observability + Cost Tracking | **COMPLETE** | 79 | [Enterprise](#phase-3-observability) |
| 12 | Policy Rule Engine | **COMPLETE** | 81 | [Enterprise](#phase-4-policy-rule-engine) |
| 13 | Prompt Patterns Library | **COMPLETE** | 35 | [Enterprise](#phase-5-prompt-patterns-library) |
| 14 | CostTracker / Budget | **WORKING** | -- | [Backend](#3-cost-tracking--budget) |
| 15 | Reflexion | **WORKING** | -- | [Backend](#4-reflexion) |
| 16 | Cross-Session Search | **WORKING** | -- | [Backend](#5-cross-session-search) |
| 17 | Bookmarks | **WORKING** | -- | [Backend](#6-bookmarks) |
| 18 | /model Hot-Switch | **WORKING** | -- | [Backend](#7-model-hot-switch) |
| 19 | Rate Limiting | **WORKING** | -- | [Backend](#8-rate-limiting) |
| 20 | Project Auto-Detection | **WORKING** | -- | [Backend](#9-project-auto-detection) |

**Total test coverage: 778+ dedicated feature tests**

---

## Core Features

### 1. Agent Cores

**Location:** `crates/goose/src/agents/core/` (11 files)
**Tests:** 87/87 passing

Super-Goose implements a polymorphic agent core system with six specialized execution strategies and an automatic selector. Each core implements the `AgentCore` trait and can be hot-swapped at runtime via the `AgentCoreRegistry`.

#### Six Core Types

| Core | File | Purpose |
|------|------|---------|
| **FreeformCore** | `freeform.rs` | Default conversational agent. Open-ended tool use with natural language planning. Best for exploratory tasks and general Q&A. |
| **StructuredCore** | `structured.rs` | Plan-then-execute agent. Creates explicit step-by-step plans before execution. Best for multi-step tasks with clear deliverables. |
| **OrchestratorCore** | `orchestrator_core.rs` | Meta-agent that decomposes tasks into subtasks and delegates to other cores. Best for complex projects requiring multiple strategies. |
| **SwarmCore** | `swarm_core.rs` | Parallel execution agent. Spawns concurrent work streams for independent subtasks. Best for batch operations and parallel file processing. |
| **WorkflowCore** | `workflow_core.rs` | DAG-based execution agent. Runs tasks as directed acyclic graphs with dependency tracking. Best for CI/CD-like pipelines and ordered workflows. |
| **AdversarialCore** | `adversarial_core.rs` | Debate-style agent. Generates competing solutions and selects the strongest through adversarial evaluation. Best for security audits and design reviews. |

#### CoreSelector (Auto-Selection)

**File:** `selector.rs`

The CoreSelector automatically picks the best core for each task using a two-tier strategy:

1. **Experience-based selection** -- Queries the ExperienceStore for historical task-to-core-to-outcome mappings. If a similar task previously succeeded with a specific core, that core is preferred.
2. **Suitability scoring** -- Falls back to keyword and pattern analysis to score each core's fitness for the task description.

Selection results include a confidence score (0.0--1.0). When confidence exceeds 0.7, the system auto-switches cores before dispatch. Results include a rationale string and source indicator (`experience`, `suitability`, or `default`).

#### Registry and Hot-Swap

**File:** `registry.rs`

The `AgentCoreRegistry` maintains all registered cores and supports:

- Runtime registration/deregistration of cores
- Hot-swap via `/core <name>` command
- Listing available cores via `/cores` command
- Fallback to FreeformCore if the active core fails

#### Metrics

**File:** `metrics.rs`

Per-core execution metrics: invocation count, success/failure rates, average latency, and token usage.

---

### 2. Learning Engine

**Location:** `crates/goose/src/agents/` (4 files)
**Tests:** 52/52 passing (11 experience + 7 insight + 7 skill + 7 reflection + 7 reflexion + 13 planner)

The Learning Engine gives Super-Goose cross-session memory, enabling it to learn from past tasks and improve over time. It combines two research-backed approaches:

#### ExperienceStore (ExpeL-inspired)

**File:** `experience_store.rs`

SQLite-backed persistent store that records every task execution:

- **Task description** -- What was asked
- **Core type used** -- Which AgentCore handled it
- **Outcome** -- Success/failure with details
- **Insights** -- Extracted patterns and lessons

Records are queryable by similarity, core type, and outcome. The CoreSelector consults this store to make experience-based core selection decisions.

**Commands:** `/experience` (list recent), `/experience stats` (aggregated statistics)

#### InsightExtractor (ExpeL-style)

**File:** `insight_extractor.rs`

Analyzes accumulated experiences to extract three types of insights:

1. **Core selection insights** -- Which cores work best for which task patterns
2. **Failure insights** -- Common failure modes and how to avoid them
3. **Optimization insights** -- Strategies that improve success rates

**Command:** `/insights`

#### SkillLibrary (Voyager-inspired)

**File:** `skill_library.rs`

Stores reusable task-solving strategies as named skills:

- Skills are indexed by task-type tags for fast retrieval
- Only **verified** skills (those that led to successful outcomes) are returned during retrieval
- Skills include a description, the strategy used, and verification status

**Command:** `/skills`

#### Reflexion Store

**File:** `reflexion.rs`

SQLite-backed persistent store for the Reflexion self-improvement loop:

- Stores reflection data (what went wrong, what to try differently)
- Feeds reflection history back into future planning
- Integrated with the CriticManager for automatic post-plan critique

#### Integration

- `Agent.experience_store` and `Agent.skill_library` use `Mutex<Option<Arc<...>>>` for interior mutability
- `init_learning_stores()` takes `&self` and performs lazy initialization on first `reply()` call
- Experience data is recorded for both success and failure paths (closed learning loop)

---

### 3. Pipeline Visualization

**Location:** `ui/desktop/src/components/pipeline/` (4 source files + 4 test files)
**Tests:** 69/69 passing

Real-time animated visualization of the agent's execution pipeline.

#### Components

| File | Purpose |
|------|---------|
| `PipelineContext.tsx` | React context providing pipeline state (stages, active step, progress) |
| `AnimatedPipeline.tsx` | Rendered visualization with quantum particle animations |
| `PipelineToggle` (in settings) | Toggle switch with localStorage persistence |
| `usePipelineBridge` (hook) | Bridges ChatState into pipeline stage data |

#### Behavior

- Reads live `ChatState` to determine current pipeline stage
- Wired into `App.tsx` and `BaseChat.tsx` for global visibility
- Quantum particle animation renders flowing dots along the pipeline path
- Toggle persists to localStorage so the user's preference survives restarts
- Stages: Idle, Planning, Executing, Reflecting, Complete, Error

---

### 4. Resizable Panel System

**Tests:** 67 passing

Built on `react-resizable-panels`, the panel system provides a flexible multi-pane layout:

#### 5 Layout Presets

| Preset | Description |
|--------|-------------|
| **Focus** | Chat-only, no sidebars. Maximum screen real estate for conversation. |
| **Standard** | Chat + right sidebar. Default layout for most users. |
| **Full** | Chat + left sidebar + right sidebar. Full information density. |
| **Agent** | Chat + agent panel + pipeline view. For monitoring agent internals. |
| **Custom** | User-defined panel arrangement with drag-to-resize handles. |

#### Lock / Unlock Mode

- **Locked:** Panel sizes are fixed. Drag handles are hidden. Prevents accidental resizing.
- **Unlocked:** Drag handles visible. Panels can be resized freely.

#### StatusBar

Persistent bottom bar displaying:

- Active model name and provider
- Session cost accumulator
- Current agent core mode
- Number of active extensions
- Connection status indicator

---

## Enterprise Features

Enterprise features are organized into five phases, each with dedicated UI panels under Settings > Enterprise.

**Location:** `ui/desktop/src/components/settings/enterprise/` (8 panel files + 6 test files)

### Phase 1: Security Guardrails

**Panel:** `GuardrailsPanel.tsx`
**Tests:** 74 passing

Six content and behavior detectors that run in warn-only mode by default:

| Detector | Scope |
|----------|-------|
| **Secret Detector** | Scans for API keys, tokens, passwords, and credentials before they leave the agent |
| **PII Detector** | Identifies personally identifiable information (emails, SSNs, phone numbers) |
| **Injection Detector** | Detects prompt injection attempts in tool outputs and user messages |
| **Code Safety Detector** | Flags dangerous code patterns (rm -rf, DROP TABLE, eval of untrusted input) |
| **Rate Anomaly Detector** | Monitors for unusual request patterns that may indicate misuse |
| **Output Validator** | Validates agent outputs against configurable content policies |

Guardrails can be configured per-detector: enabled/disabled, warn/block mode, sensitivity threshold, and custom pattern lists.

### Phase 2: MCP Gateway

**Panel:** `GatewayPanel.tsx`
**Tests:** 47 passing

Centralized gateway for Model Context Protocol connections:

- **Connection management** -- Add, remove, and configure MCP server connections
- **Health monitoring** -- Real-time status of each connected MCP server
- **Request routing** -- Route tool calls to the appropriate MCP server based on capability matching
- **Authentication** -- Per-server auth configuration (API key, OAuth, mTLS)
- **Logging** -- Full request/response logging for audit and debugging

### Phase 3: Observability

**Panel:** `ObservabilityPanel.tsx`
**Tests:** 79 passing

Comprehensive monitoring and cost tracking:

- **Token usage** -- Per-request and cumulative token counts (input, output, cache)
- **Cost tracking** -- Real-time cost accumulation with per-model pricing
- **Latency metrics** -- Request duration histograms and P50/P95/P99 percentiles
- **Error rates** -- Failure tracking by error type and provider
- **Budget alerts** -- Configurable thresholds that warn or block when cost limits approach
- **Export** -- CSV and JSON export of all telemetry data

### Phase 4: Policy Rule Engine

**Panel:** `PoliciesPanel.tsx`
**Tests:** 81 passing

Declarative rule engine for governing agent behavior:

- **Rule types** -- Allow, deny, require-approval, transform
- **Conditions** -- Match on tool name, argument patterns, output content, user role, time window
- **Actions** -- Block execution, require human approval, redact output, log and alert
- **Rule priority** -- Numeric priority with first-match-wins evaluation
- **Rule sets** -- Group rules into named sets for different environments (dev, staging, prod)

### Phase 5: Prompt Patterns Library

**Panel:** `HooksPanel.tsx`
**Tests:** 35 passing

Reusable prompt templates and hooks:

- **Pre-built patterns** -- Common prompt structures for code review, documentation, testing, refactoring
- **Custom hooks** -- User-defined prompt fragments injected at specific pipeline stages
- **Variable interpolation** -- Template variables resolved at runtime (project name, file path, language)
- **Sharing** -- Export/import patterns as JSON for team distribution
- **Versioning** -- Track pattern revisions with diff comparison

---

## UI Features

### 1. Layout and Navigation

**Route structure:**

| Route | Component | Purpose |
|-------|-----------|---------|
| `/chat/:id` | Chat view | Primary conversation interface |
| `/settings` | Settings | Application and provider settings |
| `/settings/enterprise` | Enterprise panels | Guardrails, gateway, observability, policies |
| `/super` | SuperGoosePanel | 8-panel management sidebar |

### 2. 8-Panel Super-Goose Sidebar

**Location:** `ui/desktop/src/components/super/` (10 files)
**Tests:** 11/11 passing

| Panel | File | Purpose |
|-------|------|---------|
| **Dashboard** | `DashboardPanel.tsx` | System overview, health metrics, quick actions |
| **Studios** | `StudiosPanel.tsx` | Project workspaces and environment management |
| **Agents** | `AgentsPanel.tsx` | Active agent cores, swap controls, execution history |
| **Marketplace** | `MarketplacePanel.tsx` | Extension browser, install/uninstall, ratings |
| **GPU** | `GPUPanel.tsx` | GPU utilization, local model management, VRAM monitoring |
| **Connections** | `ConnectionsPanel.tsx` | MCP servers, API providers, connection health |
| **Monitor** | `MonitorPanel.tsx` | Live token stream, cost ticker, error log |
| **Settings** | `SGSettingsPanel.tsx` | Super-Goose-specific configuration |

All panels use `data-super="true"` attribute and `sg-*` CSS tokens for visual scoping, ensuring they render in the Super-Goose dark theme without affecting stock Goose styles.

### 3. sg-* Design Tokens

**Location:** `ui/desktop/src/styles/main.css` (255 lines, lines 158--1111)

A complete design token system scoped to `.super-goose-panel` and `[data-super="true"]` selectors:

| Category | Tokens |
|----------|--------|
| **Backgrounds** | `--sg-bg` (#080818), `--sg-surface`, `--sg-card`, `--sg-input`, `--sg-border` |
| **Brand** | `--sg-gold` (#fbbf24), `--sg-indigo`, `--sg-emerald`, `--sg-amber`, `--sg-red`, `--sg-violet`, `--sg-sky` |
| **Text** | `--sg-text-1` through `--sg-text-5` (5-level text hierarchy) |
| **Utility classes** | `sg-card`, `sg-badge-*`, `sg-btn-*`, `sg-status-*`, `sg-sidebar`, `sg-tabs`, `sg-progress` |

The dual color system ensures stock Goose colors remain untouched while Super-Goose panels render in their own dark theme.

### 4. Additional UI Components

| Component Group | Location | Count | Purpose |
|-----------------|----------|------:|---------|
| Agent Panel | `components/GooseSidebar/` | 8 | Agent state, history, controls |
| TimeWarp Bar | `components/timewarp/` | 8 | Session timeline (planned) |
| Search Panel | `components/search/` | -- | Cross-session search UI |
| Bookmarks Panel | `components/bookmarks/` | -- | Saved conversation snippets |
| Feature Panels | `components/features/` | 4 | Feature toggles and info |
| Tools Panel | `components/tools/` | 3 | 30-extension 3-tier display |
| Conscious System | `components/conscious/` | 11 | Agent self-awareness UI |
| CLI Integration | `components/cli/` | 7 | CLI download, terminal, auto-update |

---

## Backend Features

### 1. OTA Self-Build Pipeline

**Location:** `crates/goose/src/ota/` (7 modules)
**Tests:** 90/90 passing

Allows Super-Goose to update itself by building new binaries from source, swapping them in, and rolling back if health checks fail.

| Module | File | Responsibility |
|--------|------|---------------|
| **StateSaver** | `state_saver.rs` | Snapshots current state before updates for safe rollback |
| **SelfBuilder** | `self_builder.rs` | Invokes `cargo build` to compile a new binary from updated source |
| **BinarySwapper** | `binary_swapper.rs` | Atomically replaces the running binary with the newly built one |
| **HealthChecker** | `health_checker.rs` | Validates the new binary starts correctly and passes smoke tests |
| **RollbackManager** | `rollback.rs` | Restores previous binary and state if health checks fail |
| **UpdateScheduler** | `update_scheduler.rs` | Schedules update checks and manages update windows |
| **OtaManager** | `mod.rs` | Orchestrates the full update lifecycle across all modules |

**Update flow:** Check for update -> Save state -> Build new binary -> Swap binary -> Health check -> (Rollback on failure)

### 2. Autonomous Daemon

**Location:** `crates/goose/src/autonomous/` (8 modules)
**Tests:** 86/86 passing

Background daemon that performs autonomous maintenance and operations without user interaction.

| Module | File | Responsibility |
|--------|------|---------------|
| **TaskScheduler** | `scheduler.rs` | Cron-like scheduler for recurring autonomous tasks |
| **BranchManager** | `branch_manager.rs` | Creates, manages, and cleans up Git branches for autonomous work |
| **ReleaseManager** | `release_manager.rs` | Automates version bumps, changelogs, and release workflows |
| **DocsGenerator** | `docs_generator.rs` | Auto-generates and updates documentation from code changes |
| **CiWatcher** | `ci_watcher.rs` | Monitors CI/CD pipelines and reacts to failures |
| **Failsafe** | `failsafe.rs` | Circuit breaker that halts autonomous operations on repeated failures |
| **AuditLog** | `audit_log.rs` | Immutable log of all autonomous actions for accountability |
| **AutonomousDaemon** | `mod.rs` | Top-level daemon managing all autonomous subsystems |

### 3. Cost Tracking / Budget

**Status:** WORKING

Real-time token and cost tracking across all providers:

- Per-request cost calculation using provider-specific pricing
- Session cost accumulator displayed in the StatusBar
- Budget limits with configurable warn and hard-stop thresholds
- Historical cost data queryable by session, date range, and provider

### 4. Reflexion

**Status:** WORKING

Self-improvement loop based on the Reflexion research framework:

- After task completion, the CriticManager evaluates the result
- Reflection data (what went wrong, what to try differently) is persisted to SQLite
- Future planning incorporates reflection history to avoid repeating mistakes
- Auto-invoked after plan creation in `Agent::create_plan()`

### 5. Cross-Session Search

**Status:** WORKING

Full-text search across all past conversation sessions:

- SQLite FTS5-backed search index
- Searches message content, tool calls, and tool outputs
- Results ranked by relevance with highlighted matches

### 6. Bookmarks

**Status:** WORKING

Save and recall important conversation snippets:

- Bookmark individual messages or message ranges
- Tag bookmarks for organization
- Quick-recall from the bookmarks panel

### 7. /model Hot-Switch

**Status:** WORKING

Switch the active LLM provider and model mid-conversation:

- `/model <provider>/<model>` command
- Preserves conversation history across switches
- Supports all 10 configured providers

### 8. Rate Limiting

**Status:** WORKING

Provider-aware rate limiting to prevent API throttling:

- Per-provider request rate limits
- Token-per-minute limits
- Automatic backoff and retry with exponential delay
- Queue management for burst traffic

### 9. Project Auto-Detection

**Status:** WORKING

Automatically detects project type and configures extensions:

- Scans for language-specific config files (package.json, Cargo.toml, pyproject.toml, etc.)
- Activates relevant extensions based on detected project type
- Sets appropriate working directory and environment variables

### 10. Provider Support

Super-Goose supports 10 LLM providers:

| Provider | Models |
|----------|--------|
| Anthropic | Claude 4 Opus, Claude 4 Sonnet, Claude 3.5 Haiku |
| OpenAI | GPT-4o, GPT-4-turbo, o1, o3-mini |
| Google | Gemini 2.0 Flash, Gemini 1.5 Pro |
| Databricks | DBRX, Llama-based models |
| Groq | Llama 3, Mixtral (fast inference) |
| Ollama | Any locally hosted model |
| OpenRouter | Aggregated provider access |
| Azure OpenAI | Enterprise-managed OpenAI models |
| AWS Bedrock | Claude, Llama, Titan via AWS |
| GCP Vertex AI | Gemini, Claude via GCP |

### 11. Extension System (3-Tier)

| Tier | Type | Count | Description |
|------|------|------:|-------------|
| **Tier 1** | Builtin (Rust) | 5 | developer, computercontroller, autovisualiser, memory, tutorial |
| **Tier 2** | Bundled (JSON) | 30 | Pre-configured MCP extensions shipped with Super-Goose |
| **Tier 3** | Custom (YAML) | -- | User-defined extensions via config.yaml (stdio/streamable_http) |

---

## Test Summary

| Suite | Files | Tests | Pass | Skip | Fail |
|-------|------:|------:|-----:|-----:|-----:|
| **Rust (cargo test)** | -- | 1,763 | 1,754 | -- | 9* |
| **Vitest (frontend)** | 199 | 2,097 | 2,097 | 3 | 0 |
| **Playwright E2E** | 17 | 359 | 291 | 68 | 0 |
| **tsc --noEmit** | -- | -- | CLEAN | -- | 0 |

*9 pre-existing failures in JWT crypto and evolution modules (not introduced by Super-Goose).

**Feature-specific test breakdown:**

| Feature | Tests |
|---------|------:|
| Agent Cores | 87 |
| OTA Self-Build | 90 |
| Autonomous Daemon | 86 |
| Policy Rule Engine | 81 |
| Observability | 79 |
| Security Guardrails | 74 |
| Pipeline Visualization | 69 |
| Resizable Panels | 67 |
| Learning Engine | 52 |
| MCP Gateway | 47 |
| Prompt Patterns | 35 |
| Super-Goose Sidebar | 11 |
| **Feature test total** | **778** |

---

## Planned Features (Not Yet Implemented)

### Phase 6: TimeWarp

**Status:** Design complete, UI components built, backend not wired
**Design docs:** `docs/timewarp/` (18 documents)
**UI components:** `ui/desktop/src/components/timewarp/` (8 files)

Fusion 360-style time-travel for AI sessions:

1. **Foundation** -- Event sourcing backend with immutable session event log
2. **Branching** -- Create alternative timelines from any point in a session
3. **Replay** -- Step forward and backward through session history
4. **Conflict detection** -- Identify and resolve conflicts when merging branches
5. **Timeline UI** -- Visual timeline with branch visualization and comparison tools

### Phase 7: Advanced Memory System

**Status:** Planned

Three-tier memory architecture:

- **Semantic memory** -- Facts, knowledge, and learned relationships
- **Episodic memory** -- Contextual memories of specific sessions and events
- **Procedural memory** -- Learned workflows and multi-step procedures

### Phase 8: Enterprise Dashboard

**Status:** Planned

Organization-wide management interface:

- Team usage analytics and cost allocation
- Centralized policy management across agents
- Role-based access control (RBAC)
- Audit trail and compliance reporting
- SSO/SAML integration

### Phase 9: Agentic Swarms

**Status:** Planned

Multi-agent collaboration framework:

- Spawn multiple agent instances with different specializations
- Inter-agent communication protocol
- Task decomposition and delegation
- Consensus mechanisms for conflicting outputs
- Shared memory and knowledge base across swarm members

---

## Integration Gaps (Known)

The following wiring tasks remain for future sessions:

| Gap | Description |
|-----|-------------|
| localStorage -> Rust API | Wire frontend settings persistence to backend API endpoints |
| Enterprise panel backends | Backend API endpoints for `/enterprise/*` routes |
| Agent panel live data | Replace mock data with real SSE/WebSocket backend feeds |
| TimeWarp event store | Wire TimeWarp UI to SQLite event store backend |
| Feature panel APIs | Wire feature toggle panels to Rust API endpoints |
| Tool toggle persistence | Wire tool on/off state to config.yaml via extension API |
| CompactionManager | Wire `CompactionManager.compact()` to conversation history |
| CLI backends | Wire CLI download, terminal, and auto-update to real backends |
| 8-panel backends | Wire all 8 Super-Goose sidebar panels to Rust API endpoints |

---

## Build and Run

```bash
# Rust backend
export LIB="C:\\...10.0.22621.0\\um\\x64;...ucrt\\x64;...MSVC\\14.43.34808\\lib\\x64"
cargo build -p goose-cli -p goose-server

# Frontend
cd ui/desktop
NODE_ENV=development npm install --include=dev
npx electron-forge make

# Run tests
cargo test --lib -p goose -- core::          # 87 core tests
cargo test --lib -p goose                     # All 1763 backend tests
cd ui/desktop && npx vitest run              # 2097 frontend tests
cd ui/desktop && npx playwright test         # 359 E2E tests
```

---

*This document is auto-maintained. For architecture diagrams, see `docs/ARCHITECTURE_AGENTIC_CORES.md`. For the Docusaurus site, visit https://ghenghis.github.io/Super-Goose/.*
