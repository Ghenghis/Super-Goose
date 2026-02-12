# Super-Goose Complete Project Status

**Date**: 2026-02-12
**Branch**: `feat/comprehensive-testing`
**Version**: v1.24.05
**Fork of**: block/goose (Block Inc's AI coding agent)
**GitHub**: Ghenghis/Super-Goose
**Local path**: `G:\goose` (NVME)

---

## COMPLETED (with verification)

### Phase 0: AgentCore Trait + 6 Cores

**Status**: COMPLETE
**Location**: `crates/goose/src/agents/core/`
**Files**: 11 Rust source files

| File | Purpose |
|------|---------|
| `mod.rs` | `AgentCore` trait, `CoreType` enum, `CoreCapabilities`, `CoreOutput` |
| `freeform.rs` | `FreeformCore` -- wraps default LLM loop (`reply_internal`) |
| `structured.rs` | `StructuredCore` -- wraps `state_graph/` (Code-Test-Fix FSM), `use_done_gate: false` |
| `orchestrator_core.rs` | `OrchestratorCore` -- wraps orchestrator + specialist DAG tasks |
| `swarm_core.rs` | `SwarmCore` -- wraps swarm + team parallel agents |
| `workflow_core.rs` | `WorkflowCore` -- wraps `workflow_engine` template pipelines |
| `adversarial_core.rs` | `AdversarialCore` -- wraps Coach/Player adversarial review |
| `registry.rs` | `AgentCoreRegistry` -- owns all 6 cores, hot-swap via `/core <name>` |
| `context.rs` | `AgentContext`, `TaskHint`, `TaskCategory` enum (8 categories) |
| `metrics.rs` | `CoreMetrics`, `CoreMetricsSnapshot` -- per-core performance tracking |
| `selector.rs` | `CoreSelector`, `SelectionResult` -- auto-selects best core from experience data |

**Test count**: 87 `#[test]` / `#[tokio::test]` markers across 11 files
- `freeform.rs`: 3 tests
- `context.rs`: 6 tests
- `registry.rs`: 8 tests
- `workflow_core.rs`: 10 tests
- `adversarial_core.rs`: 11 tests
- `orchestrator_core.rs`: 13 tests
- `swarm_core.rs`: 9 tests
- `mod.rs`: 4 tests
- `metrics.rs`: 4 tests
- `selector.rs`: 11 tests
- `structured.rs`: 8 tests

### Phase 1: Wire 7 Unwired Subsystems to Cores

**Status**: COMPLETE (structural wiring)
**What was done**: All 6 AgentCore implementations wrap their respective subsystems (state_graph, orchestrator, swarm, team, workflow_engine, adversarial). Each core's `execute()` method delegates to the real backend. The `AgentCoreRegistry` is instantiated in the `Agent` struct (`core_registry` field) and responds to `/core` and `/cores` slash commands.

**Important caveat**: The cores are NOT dispatched in the main `reply()` flow. The Agent struct still uses its direct `reply_internal()` path for actual message handling. The cores exist as an abstraction layer that can be invoked via commands but do not intercept the default execution path.

### Phase 2: Persistent Learning Engine

**Status**: COMPLETE
**Files**: 4 new files + modifications to `agent.rs`, `execute_commands.rs`, `mod.rs`

| File | Purpose | Tests |
|------|---------|-------|
| `experience_store.rs` | SQLite cross-session learning (task, core, outcome, insights) | 11 |
| `insight_extractor.rs` | ExpeL-style pattern analysis (core selection, failure, optimization) | 7 |
| `skill_library.rs` | Voyager-style reusable strategies, verified-only retrieval | 7 |
| `persistence/reflection_store.rs` | `SqliteReflectionStore` -- persistent Reflexion data | 7 |
| `reflexion.rs` | Reflexion agent (verbal reinforcement learning), wired to `SqliteReflectionStore` | 7 |
| `planner.rs` | `PlanManager`, `LlmPlanner`, `SimplePatternPlanner`, plan creation/execution | 13 |

**Total Phase 2 tests**: 52

**Agent struct fields** (in `agent.rs`):
- `experience_store: Mutex<Option<Arc<ExperienceStore>>>` -- interior mutability for lazy init
- `skill_library: Mutex<Option<Arc<SkillLibrary>>>` -- interior mutability for lazy init
- `core_registry: AgentCoreRegistry`

**Methods on Agent**:
- `init_learning_stores()` -- initializes SQLite at `{data_dir}/super-goose/experience.db` and `skills.db`
- `experience_store()` -- getter
- `skill_library()` -- getter
- `core_selector()` -- creates `CoreSelector::with_defaults(self.experience_store.clone())`

**Slash commands** (in `execute_commands.rs`):
- `/experience` -- show recent experiences
- `/experience stats` -- per-core aggregate stats
- `/skills` -- show verified skills in library
- `/insights` -- extract and display ExpeL-style insights
- `/core <name>` -- switch active core
- `/cores` -- list all cores with status

**Module exports** (in `mod.rs`):
- `experience_store`, `insight_extractor`, `skill_library` are `pub mod`
- All key types re-exported: `Experience`, `ExperienceStore`, `Insight`, `InsightExtractor`, `Skill`, `SkillLibrary`, `CoreSelector`, `SelectionResult`

### Phase 3: Auto Core Selection

**Status**: COMPLETE (wired and auto-invoked, commit b12a665ed6)
**File**: `crates/goose/src/agents/core/selector.rs`

`CoreSelector` implements:
1. Task categorization via keyword analysis (8 categories: general, code-test-fix, large-refactor, review, devops, documentation, pipeline, multi-file-complex)
2. Experience-based selection querying `ExperienceStore` for best-performing core per category
3. Fallback to registry suitability scoring when insufficient data
4. Confidence scoring and rationale tracking
5. User preference override via `TaskHint`
6. Minimum experience threshold (default: 3 data points before trusting historical stats)

**Tests**: 11 tests in `selector.rs`

**Wiring**: CoreSelector is automatically invoked before dispatch in `Agent::reply()`. When confidence exceeds 0.7, the active core is switched. Experience data is recorded after every task for both success and failure paths.

### Frontend: Pipeline Visualization

**Status**: 9/10 COMPLETE (missing: pipeline toggle in settings)
**Location**: `ui/desktop/src/components/pipeline/`

| File | Purpose |
|------|---------|
| `PipelineContext.tsx` | React context for pipeline state |
| `AnimatedPipeline.tsx` | Quantum particle animation + real-time stage display |
| `usePipelineBridge.ts` | Bridge hook reading ChatState |
| `index.ts` | Barrel exports |

**Tests**: 3 test files with ~79 test/it/describe calls
- `PipelineContext.test.tsx`: 34 assertions
- `usePipelineBridge.test.tsx`: 17 assertions
- `AnimatedPipeline.test.tsx`: 28 assertions

**Wired**: Reads ChatState, integrated in `App.tsx` + `BaseChat.tsx`
**Remaining**: Pipeline toggle in Settings panel

### Frontend: sg-* Design Tokens

**Status**: COMPLETE
**Location**: `ui/desktop/src/styles/main.css`
**Token count**: 60 `--sg-*` custom properties

Categories:
- **Backgrounds**: `--sg-bg`, `--sg-surface`, `--sg-card`, `--sg-input`, `--sg-border`
- **Accent colors**: `--sg-gold`, `--sg-indigo`, `--sg-emerald`, `--sg-amber`, `--sg-red`, `--sg-violet`, `--sg-sky`
- **Typography**: `--sg-text-1` through `--sg-text-5`
- **Docs**: `--sg-docs-green`
- **Gradients**: `--sg-gradient-gold`, `--sg-gradient-indigo`, `--sg-gradient-emerald`
- **Shadows**: `--sg-shadow-sm`, `--sg-shadow-md`, `--sg-shadow-lg`, `--sg-shadow-glow-gold`, `--sg-shadow-glow-indigo`

Used by SuperGoosePanel and child panels via `var(--sg-*)` references.

### Frontend: 8-Panel Sidebar (Super-Goose)

**Status**: COMPLETE (UI shells)
**Location**: `ui/desktop/src/components/super/`

| File | Purpose |
|------|---------|
| `SuperGoosePanel.tsx` | Root panel with 8-tab sidebar navigation |
| `DashboardPanel.tsx` | System overview dashboard |
| `StudiosPanel.tsx` | Development studios |
| `AgentsPanel.tsx` | Agent management |
| `MarketplacePanel.tsx` | Extension/skill marketplace |
| `GPUPanel.tsx` | GPU resource monitoring |
| `ConnectionsPanel.tsx` | External connections |
| `MonitorPanel.tsx` | System monitoring |
| `SGSettingsPanel.tsx` | Super-Goose specific settings |

**Tests**: 1 test file (`SuperGoosePanel.test.tsx`)

### Original v1.24.05 Features

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | CostTracker/Budget | WORKING | `observability.rs`, CostTracker struct tracks token/dollar costs |
| 2 | Reflexion | WORKING | `reflexion.rs` + `persistence/reflection_store.rs` (SQLite) |
| 3 | Guardrails | WORKING (warn-only) | `guardrails.rs`, DetectionContext, no hard-block |
| 4 | Code-Test-Fix | PARTIAL | `state_graph/` FSM exists; StructuredCore wraps it; `use_done_gate: false` |
| 5 | /model Hot-Switch | WORKING | Slash command in `execute_commands.rs` |
| 6 | Compaction Manager | PARTIAL | `CompactionManager` field on Agent, `compact_messages()` called in reply loop, but `compact()` method not fully wired |
| 7 | Cross-Session Search | WORKING | Via memory/sessions system |
| 8 | Project Auto-Detection | WORKING | `project_detector.rs` |
| 9 | Rate Limiting | WORKING | Provider-level rate limiting |
| 10 | Bookmarks | WORKING | Bookmarks extension + UI |

**Backend: 8/10 working, 2/10 partial.**

### Branding

**Status**: COMPLETE
All product-facing strings changed to "Super-Goose" (46+ edits across 12+ files). All `block.github.io` URLs changed to `ghenghis.github.io/Super-Goose`.

### UI/UX Component Suites

**All COMPLETE (UI shells built, tested)**:

| Suite | Location | Components | Test Files |
|-------|----------|------------|------------|
| GooseSidebar (Agent Panel) | `components/GooseSidebar/` | 11 components + AgentPanelContext | 11 test files |
| TimeWarp Bar | `components/timewarp/` | 8 components + TimeWarpContext | 7 test files |
| Enterprise Settings | `components/settings/enterprise/` | 7 panels + route panel | 6 test files |
| Feature Panels | `components/features/` | 5 panels (Reflexion, Critic, Plan, Guardrails, Budget) | 5 test files |
| Conscious System | `components/conscious/` | 12 components + ConsciousBridge | 11 test files |
| CLI Integration | `components/cli/` | 6 components + CLIContext | 6 test files |
| Tools Panel | `components/tools/` | 2 components + index | 2 test files |
| Search | `components/search/` | 1 component | 1 test file |
| Bookmarks | `components/bookmarks/` | 1 component | 1 test file |

### Extension System (3-tier)

**Status**: COMPLETE
- **Tier 1 (Builtin)**: 5 Rust extensions (developer, computercontroller, autovisualiser, memory, tutorial)
- **Tier 2 (Bundled)**: `bundled-extensions.json` (30 entries)
- **Tier 3 (Custom)**: User `config.yaml`, stdio/streamable_http types

### Feature Flags

**Status**: COMPLETE
```toml
[features]
default = ["memory"]
memory = []
swarm-experimental = []
docker_tests = []
cuda = ["candle-core/cuda", "candle-nn/cuda"]
```
Reflexion, guardrails, cost tracking: NOT feature-gated, always compiled.

---

## NOT COMPLETED (NOT STARTED)

### Phase 4: OTA Self-Build Pipeline
- **Location**: Would be at `crates/goose/src/ota/`
- **Status**: Directory does not exist. No files created.
- Planned: 7 modules for self-update capability (version checker, binary builder, rollback, signature verification, delta updates, health checks, auto-restart)

### Phase 5: Autonomous Development Pipeline
- **Status**: NOT STARTED
- Planned: Autonomous daemon with scheduler, branch/release/docs automation, CI watcher
- No files or code exist

### Phase 6: Custom YAML Cores
- **Status**: NOT STARTED
- Planned: User-defined cores via YAML configuration files
- No files or code exist

### Phase 10: Modes/Profiles/Toggles
- **Status**: NOT STARTED
- Planned: User-facing mode switching (e.g., "developer mode", "research mode") with profile persistence
- No dedicated implementation exists

### Phase 11: Failsafes/Circuit Breakers
- **Status**: NOT STARTED
- Planned: Automatic shutdown triggers, cost caps with hard enforcement, token limits with circuit-breaking
- Guardrails exist but are warn-only, no hard circuit breakers

---

## PARTIAL / UNFINISHED

### Code-Test-Fix (StructuredCore)
- `state_graph/` FSM exists with Code, Test, Fix states
- `StructuredCore` wraps it in the core abstraction
- `use_done_gate: false` -- DoneGate disabled because it runs shell commands and hangs in tests
- StructuredCore is selectable via `/core structured` but is NOT the default execution path

### Compaction Manager
- `CompactionManager` is a field on the `Agent` struct (line 272 of `agent.rs`)
- `compact_messages()` is called in the reply loop for conversation compaction
- The full `compact()` pipeline (multi-step summary, context window optimization) is not fully wired

### Learning Stores Initialization -- FIXED (commit b12a665ed6)
- `init_learning_stores()` method on Agent takes `&self` (not `&mut self`)
- Uses `Mutex<Option<Arc<ExperienceStore>>>` and `Mutex<Option<Arc<SkillLibrary>>>` for interior mutability
- Lazy initialization: called automatically on first `reply()` invocation
- Creates SQLite databases at `{data_dir}/super-goose/experience.db` and `skills.db`

### Core Dispatch in Reply Flow -- FIXED (commit b12a665ed6)
- `AgentCoreRegistry` is created in Agent constructor
- `/core` and `/cores` commands work correctly to list/switch cores
- Non-Freeform cores now dispatch through `core.execute()` in the reply flow
- Automatic fallback to FreeformCore if a non-Freeform core's execute() fails
- Experience data recorded for both success and failure paths

### CoreSelector Auto-Invocation -- FIXED (commit b12a665ed6)
- `CoreSelector` runs before dispatch in `reply()` flow
- Analyzes incoming task, recommends core, switches when confidence > 0.7
- Queries ExperienceStore for historical performance data
- Falls back to suitability scoring when insufficient experience data

### Pipeline Toggle in Settings
- Pipeline visualization is working and wired into App.tsx + BaseChat.tsx
- The toggle to enable/disable the pipeline from Settings UI is NOT implemented (1 remaining item)

---

## BUGS / KNOWN ISSUES

### StructuredCore DoneGate Hang
- `use_done_gate: false` in StructuredCore (line 239 of `structured.rs`)
- DoneGate runs shell commands which hang in test environments
- Workaround: Gate disabled, callbacks handle pass/fail instead

### Learning Stores -- FIXED (commit b12a665ed6)
- ~~`init_learning_stores()` is defined but never called~~
- Now lazily initialized on first `reply()` call via `Mutex<Option<Arc<...>>>` pattern
- `/experience`, `/skills`, `/insights` commands work after first reply

### Core Execution -- FIXED (commit b12a665ed6)
- ~~Reply flow ignores the active core and always uses `reply_internal()`~~
- Non-Freeform cores now dispatch through `core.execute()` in the reply flow
- Automatic fallback to FreeformCore on execution failure
- CoreSelector auto-invokes before dispatch (switches core when confidence > 0.7)

### `npm ci` Package Lock Mismatch
- `npm ci` fails if `package-lock.json` is mismatched with `package.json`
- Workaround: Run `npm install --package-lock-only` first

### Node.js v25+ Compatibility
- `cross-zip` needs patch (`fs.rmdir` changed to `fs.rm` in Node v25+)
- Workaround: Use Node <= 24

### `NODE_ENV` Must Not Be "production"
- Setting `NODE_ENV=production` causes `npm install` to skip devDependencies
- Must use `NODE_ENV=development npm install --include=dev`

### forge.config.ts / package.json Name Sync
- `bin:` in forge.config.ts must match `productName` in package.json (both must be "Super-Goose")
- Mismatch causes build failures

---

## NOT WIRED (Built but Not Connected)

### UI Components Without Backend APIs

| Component Suite | What Exists | What's Missing |
|----------------|-------------|----------------|
| SuperGoosePanel (8 panels) | Full React UI with sg-* styling | No backend API endpoints; all data is static/mock |
| GooseSidebar Agent Panels | 11 components with context | No SSE/WebSocket feed from Rust backend |
| Enterprise Settings (7 panels) | Gateway, Guardrails, Hooks, Memory, Observability, Policies | No `/enterprise/*` API endpoints |
| TimeWarp Bar (8 components) | Full timeline UI with branches, transport controls | No event store backend (SQLite); no state persistence |
| Conscious System (12 components) | Emotion visualizer, personality selector, voice toggle, etc. | No backend integration; purely presentational |
| CLI Integration (6 components) | Terminal emulator, download service, setup wizard | No real CLI download/terminal/auto-update backends |
| Feature Panels (5 panels) | Reflexion, Critic, Plan, Guardrails, Budget displays | Mock data; not wired to real Rust subsystem state |
| Tools Panel (2 components) | Tool detail modal, bridge panel | Tool toggle persistence not wired to config.yaml |

### Backend Code Without Frontend Wiring

| Backend Feature | What Exists | What's Missing |
|-----------------|-------------|----------------|
| ExperienceStore | Full SQLite CRUD, 11 tests, **lazily initialized** | No UI for experience data (CLI commands `/experience` work) |
| SkillLibrary | Full SQLite CRUD, 7 tests, **lazily initialized** | No UI for skill browsing (CLI command `/skills` works) |
| InsightExtractor | Pattern analysis, 7 tests | No UI for insights (CLI command `/insights` works) |
| CoreSelector | Task categorization + selection, 11 tests, **auto-invoked** | No UI for selection feedback (auto-invokes in reply flow) |
| AgentCoreRegistry | 6 cores registered, hot-swap, **dispatched in reply flow** | No UI for core metrics (CLI commands `/core` `/cores` work) |

### Settings Not Persisted
- localStorage settings in React are NOT synced to the Rust backend API
- Agent panel mock data is not connected to real SSE/WebSocket feeds
- Pipeline toggle missing from settings UI
- SuperGoosePanel data is static/mock (not wired to backend APIs)

---

## TEST STATUS

### Backend Rust Tests

**Total `#[test]` / `#[tokio::test]` markers in `crates/goose/src/agents/`**: 435+ across 50+ files

Key breakdown:
| Module | Test Count |
|--------|-----------|
| `core/` (all 11 files) | 87 |
| `experience_store.rs` | 11 |
| `insight_extractor.rs` | 7 |
| `skill_library.rs` | 7 |
| `persistence/reflection_store.rs` | 7 |
| `reflexion.rs` | 7 |
| `planner.rs` | 13 |
| `adversarial/` (review, player, coach, integration, mod) | 54 |
| `evolution/` (metrics, optimizer, disclosure, integration, memory) | 59 |
| `benchmark.rs` | 15 |
| `hitl.rs` | 27 |
| `observability.rs` | 9 |
| `retry.rs` | 13 |
| `skill_registry.rs` | 20 |
| `swarm.rs` | 16 |
| `graph.rs` | 18 |
| Other modules | ~65 |

**Last verified passing**: 139/139 for core + learning engine modules (`cargo test --lib -p goose -- core::` + learning modules)

### Frontend Vitest Tests

**Total test files**: 100+ `.test.{ts,tsx}` files in `ui/desktop/src/`

Key suites:
| Suite | Test Files |
|-------|-----------|
| GooseSidebar | 11 |
| TimeWarp | 7 |
| Conscious | 11 |
| CLI | 6 |
| Enterprise | 6 |
| Features | 5 |
| Pipeline | 3 |
| Tools | 2 |
| Search | 1 |
| Bookmarks | 1 |
| Status badges | 5 |
| Hooks | 8 |
| Utils | 12 |
| Settings | 6 |
| Recipes | 3 |
| Sessions | 3 |
| Components (misc) | ~10 |

**Pipeline tests**: ~79 test/it/describe calls across 3 files (58 actual test cases reported passing)

### Playwright E2E Tests

**Total spec files**: 27 in `ui/desktop/tests/e2e/`

| Category | Spec Files |
|----------|-----------|
| Core (app, chat, settings, performance) | 4 |
| Context management | 2 |
| Coding workflow | 1 |
| Tic-tac-toe | 1 |
| Panels (agent, CLI, conscious, enterprise, feature, timewarp, tools) | 7 |
| Accessibility | 1 |
| Settings (sections, modal, extensions) | 3 |
| Routes (all-routes, sidebar-nav, nav-flows) | 3 |
| Workflows (recipe, session, schedule, apps, chat-complete) | 5 |

**Status**: NOT RUN against built app (requires Electron binary build)

### Visual Regression Tests
- **Status**: NOT IMPLEMENTED
- No baseline screenshots captured
- Infrastructure planned but no files exist

### TypeScript Type Check
- **Last status**: `tsc --noEmit` CLEAN (as of 2026-02-11, commit f523367aec)
- 27 TS errors across 16 files were resolved
- `@axe-core/playwright` added as devDependency

---

## FILES CREATED/MODIFIED (This Branch: feat/comprehensive-testing)

### New Rust Files (crates/goose/src/agents/)
```
core/mod.rs               (modified)
core/freeform.rs           (new)
core/structured.rs         (new)
core/orchestrator_core.rs  (new)
core/swarm_core.rs         (new)
core/workflow_core.rs      (new)
core/adversarial_core.rs   (new)
core/registry.rs           (new)
core/context.rs            (new)
core/metrics.rs            (new)
core/selector.rs           (new)
experience_store.rs        (new)
insight_extractor.rs       (new)
skill_library.rs           (new)
persistence/reflection_store.rs (new)
```

### Modified Rust Files
```
agents/agent.rs            (experience_store, skill_library, core_registry fields + init_learning_stores)
agents/mod.rs              (pub mod + re-exports for new modules)
agents/execute_commands.rs (/experience, /skills, /insights, /core, /cores commands)
agents/reflexion.rs        (wired to SqliteReflectionStore)
agents/planner.rs          (LlmPlanner + SimplePatternPlanner)
agents/persistence/mod.rs  (pub mod reflection_store + re-export)
agents/subagent_handler.rs (modifications)
agents/subagent_task_config.rs (modifications)
```

### New/Modified Frontend Files
```
ui/desktop/src/styles/main.css              (60 sg-* tokens added)
ui/desktop/src/components/super/            (9 files: panel + 8 sub-panels + 1 test)
ui/desktop/src/components/pipeline/         (4 files + 3 test files)
ui/desktop/src/components/GooseSidebar/     (11 components + 11 test files)
ui/desktop/src/components/timewarp/         (9 files + 7 test files)
ui/desktop/src/components/conscious/        (13 files + 12 test files)
ui/desktop/src/components/cli/              (7 files + 6 test files)
ui/desktop/src/components/features/         (5 panels + 5 test files)
ui/desktop/src/components/tools/            (3 files + 2 test files)
ui/desktop/src/components/search/           (1 file + 1 test)
ui/desktop/src/components/bookmarks/        (1 file + 1 test)
ui/desktop/src/components/settings/enterprise/ (8 files + 6 test files)
ui/desktop/src/test/setup.ts                (modified)
ui/desktop/tsconfig.json                    (modified)
```

### Documentation
```
docs/CONTINUATION_10_AGENTS_MASTER.md       (modified)
docs/CONTINUATION_LEARNING_ENGINE_2026-02-12.md (new)
docs/STATUS_COMPREHENSIVE_2026-02-12.md     (new)
docs/STATUS_COMPLETE_2026-02-12.md          (this file)
```

---

## CRASH RECOVERY PROTOCOL

### For Next Session to Continue

1. **Read this document first** -- it is the single source of truth for project status.

2. **Read memory file** -- `C:\Users\Admin\.claude\projects\G--goose\memory\MEMORY.md` has build patterns, environment setup, and remaining work items.

3. **Set Windows LIB environment variable** (for Rust builds):
   ```
   export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.43.34808\\lib\\x64"
   ```

4. **Verify current state**:
   ```bash
   git status                           # Check branch and changes
   cargo test --lib -p goose -- core::  # Verify 87 core tests pass
   cd ui/desktop && npx vitest run      # Verify frontend tests
   ```

5. **Priority items for next session** (in order):
   - ~~Wire `init_learning_stores()` to be called at Agent startup~~ -- DONE (commit b12a665ed6)
   - ~~Wire core dispatch~~ -- DONE (commit b12a665ed6)
   - ~~Wire CoreSelector auto-invocation at task start~~ -- DONE (commit b12a665ed6)
   - Add pipeline toggle to Settings UI (1 remaining pipeline item)
   - Wire localStorage settings to Rust backend API
   - Run Playwright E2E tests against built app
   - Capture visual regression baselines
   - Wire 8 Super-Goose panels to real Rust backend API endpoints

6. **Build commands**:
   ```bash
   # Rust
   cargo build -p goose-cli -p goose-server

   # Frontend
   cd ui/desktop
   NODE_ENV=development npm install --include=dev
   npx electron-forge make
   ```

7. **Key file locations for wiring work**:
   - Agent startup: `crates/goose/src/agents/agent.rs` (line ~380 `with_config`, line ~421 `init_learning_stores`)
   - Reply flow: `crates/goose/src/agents/agent.rs` (search for `reply_internal`)
   - Core registry: `crates/goose/src/agents/core/registry.rs`
   - Slash commands: `crates/goose/src/agents/execute_commands.rs`

8. **Continuation docs**:
   - `docs/CONTINUATION_10_AGENTS_MASTER.md` -- 10-agent master plan
   - `docs/CONTINUATION_LEARNING_ENGINE_2026-02-12.md` -- Phase 2 details

---

## ARCHITECTURE SUMMARY

```
Agent struct (agent.rs)
├── core_registry: AgentCoreRegistry
│   ├── FreeformCore       ← wraps reply_internal() [DEFAULT]
│   ├── StructuredCore     ← wraps state_graph/ (Code→Test→Fix)
│   ├── OrchestratorCore   ← wraps orchestrator + specialists
│   ├── SwarmCore          ← wraps swarm + team
│   ├── WorkflowCore       ← wraps workflow_engine
│   └── AdversarialCore    ← wraps adversarial/ (Coach/Player)
│
├── experience_store: Mutex<Option<Arc<ExperienceStore>>>  [LAZILY INITIALIZED]
├── skill_library: Mutex<Option<Arc<SkillLibrary>>>        [LAZILY INITIALIZED]
├── compaction_manager: Mutex<CompactionManager>     [PARTIALLY WIRED]
├── CriticManager, ReflexionAgent, GuardrailsEngine  [WORKING]
├── CostTracker, PlanManager, PromptManager          [WORKING]
└── ExtensionManager (3-tier)                        [WORKING]

Frontend (Electron + React)
├── Pipeline Visualization     [WORKING, real-time]
├── SuperGoosePanel (8 panels) [UI ONLY, no backend]
├── GooseSidebar (11 panels)   [UI ONLY, no backend]
├── TimeWarp Bar (8 components)[UI ONLY, no backend]
├── Enterprise (7 panels)      [UI ONLY, no backend]
├── Conscious (12 components)  [UI ONLY, no backend]
├── CLI (6 components)         [UI ONLY, no backend]
├── Feature Panels (5)         [UI ONLY, no backend]
├── Tools Panel (2)            [UI ONLY, no backend]
├── sg-* Design Tokens (60)    [WORKING]
└── 100+ Vitest test files     [PASSING]
```

---

## HONEST ASSESSMENT

**What genuinely works end-to-end**:
- The original Goose agent loop (reply_internal) with all v1.24.05 features
- CostTracker, Reflexion (in-memory + SQLite persistent), Guardrails (warn-only), /model switch, cross-session search, project detection, rate limiting, bookmarks
- Pipeline visualization (real-time, wired to ChatState)
- All Vitest tests pass for UI components (2086/2086)
- All 87 core module tests pass
- All 52 learning engine tests pass
- ExperienceStore / SkillLibrary (lazily initialized on first reply)
- CoreSelector (auto-invoked before dispatch, switches core when confidence > 0.7)
- Core dispatch (non-Freeform cores dispatch through core.execute(), auto-fallback on failure)
- Experience data recorded for both success and failure paths (learning loop closed)

**What exists as code but does not execute at runtime**:
- All UI panels beyond pipeline (no backend endpoints)
- TimeWarp (no event store)
- Enterprise settings (no API)

**What was fixed (commit b12a665ed6)**:
- init_learning_stores() -- Mutex<Option<Arc<...>>> refactor, lazy init in reply(), &self signature
- Core dispatch in reply() -- non-Freeform cores dispatch through core.execute(), auto-fallback
- CoreSelector auto-invocation -- runs before dispatch, switches core when confidence > 0.7
- SuperGoosePanel route -- `/super` route added to App.tsx

**Total test count summary**:
- Rust: 139/139 verified passing for core + learning modules (435+ total markers in agents/)
- Vitest: 2086/2086 frontend tests passing across 100+ test files
- Playwright: 27 spec files (not yet run against built app)
- TypeScript: `tsc --noEmit` clean
