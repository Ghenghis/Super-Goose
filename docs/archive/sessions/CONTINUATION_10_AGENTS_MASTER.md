# Super-Goose 10-Agent Continuation Plan

**Created**: 2026-02-11
**Branch**: `feat/comprehensive-testing` (merge to main when complete)
**Recovery**: Each agent saves progress to `C:\Users\Admin\.claude\projects\G--goose\memory\` after every milestone
**Crash Protocol**: Read this doc + memory files to resume from last checkpoint

---

## Architecture: 10 Parallel Agents

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    SUPER-GOOSE 10-AGENT WORKFORCE                        │
│                                                                          │
│  BACKEND AGENTS (Rust)           FRONTEND AGENTS (TSX)                   │
│  ┌────────────┐ ┌────────────┐  ┌────────────┐ ┌────────────┐          │
│  │ Agent 1    │ │ Agent 2    │  │ Agent 5    │ │ Agent 6    │          │
│  │ Core Wirer │ │ Learning   │  │ Pipeline   │ │ Panel      │          │
│  │ Engine     │ │ Builder    │  │ Viz+Bridge │ │ Builder    │          │
│  └────────────┘ └────────────┘  └────────────┘ └────────────┘          │
│  ┌────────────┐ ┌────────────┐  ┌────────────┐ ┌────────────┐          │
│  │ Agent 3    │ │ Agent 4    │  │ Agent 7    │ │ Agent 8    │          │
│  │ OTA + Self │ │ Autonomous │  │ Theme +    │ │ Test       │          │
│  │ Build      │ │ Daemon     │  │ Colors     │ │ Coverage   │          │
│  └────────────┘ └────────────┘  └────────────┘ └────────────┘          │
│                                                                          │
│  CROSS-CUTTING AGENTS                                                    │
│  ┌────────────┐ ┌────────────┐                                          │
│  │ Agent 9    │ │ Agent 10   │                                          │
│  │ Docs +     │ │ CI/CD +    │                                          │
│  │ Diagrams   │ │ Release    │                                          │
│  └────────────┘ └────────────┘                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Agent 1: Core Wirer (Phase 1 — Backend Rust)

**Memory File**: `agent-1-core-wirer.md`
**Branch**: `feat/agent-1-core-wiring`
**Dependencies**: Phase 0 complete (87/87 core tests passing)

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 1.1 | Wire OrchestratorCore → real Agent instances as specialists | `agents/core/orchestrator_core.rs`, `agents/orchestrator.rs` | **DONE** (13 tests) |
| 1.2 | Implement specialist agent roles (Code, Test, Review, Deploy, Security, Docs) | NEW: `agents/specialists/` (6 files) | TODO |
| 1.3 | Wire StructuredCore → StateGraph execution | `agents/core/structured.rs`, `agents/state_graph/` | **DONE** (8 tests) |
| 1.4 | Wire SwarmCore → parallel agent pool | `agents/core/swarm_core.rs`, `agents/swarm.rs`, `agents/team.rs` | **DONE** (8 tests) |
| 1.5 | Wire WorkflowCore → template task sequences | `agents/core/workflow_core.rs`, `agents/workflow_engine.rs` | **DONE** (9 tests) |
| 1.6 | Wire AdversarialCore → Coach/Player review cycle | `agents/core/adversarial_core.rs`, `agents/adversarial/mod.rs` | **DONE** (12 tests) |
| 1.7 | Remove 1-level subagent nesting limit | `agents/subagent_tool.rs`, `agent.rs`, `subagent_handler.rs` | **DONE** (configurable depth, default 10) |
| 1.8 | Integration tests for each core | NEW: `tests/core_integration_tests.rs` | TODO |

### Checkpoint Protocol
After each task: `cargo test --lib -p goose -- core::` must pass. Save task status to memory file.

### Recovery
```
Read: memory/agent-1-core-wirer.md
Check: Which tasks show "DONE"
Resume: First task showing "TODO"
Verify: cargo test --lib -p goose -- core::
```

---

## Agent 2: Learning Engine (Phases 2-3 — Backend Rust)

**Memory File**: `agent-2-learning-engine.md`
**Branch**: `feat/agent-2-learning`
**Dependencies**: None (independent module)

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 2.1 | Persist Reflexion HashMap → SQLite | `agents/reflexion.rs` | **DONE** (7/7 tests) |
| 2.2 | ExperienceStore (task→core→outcome→insights) | NEW: `agents/experience_store.rs` | **DONE** (11/11 tests) |
| 2.3 | ExpeL-style insight extraction | NEW: `agents/insight_extractor.rs` | **DONE** (7/7 tests) |
| 2.4 | Voyager-style skill library | NEW: `agents/skill_library.rs` | **DONE** (7/7 tests) |
| 2.5 | Wire LLM planner (replace regex fallback) | `agents/planner.rs` | **DONE** (13/13 tests) |
| 2.6 | Auto-invoke CriticManager after plans | `agents/agent.rs` | **DONE** |
| 2.7 | `/experience`, `/skills`, `/insights` commands | `agents/execute_commands.rs` | **DONE** |
| 3.1 | CoreSelector using ExperienceStore | NEW: `agents/core/selector.rs` | **DONE** (11 tests) |
| 3.2 | Per-core metrics with SQLite persistence | `agents/core/metrics.rs` | **DONE** (4 tests) |
| 3.3 | Auto-select core on task start | `agents/agent.rs` | **DONE** (wired in reply(), confidence > 0.7) |

### Checkpoint Protocol
After each task: `cargo test --lib -p goose` must pass. Save SQLite schema + test results.

---

## Agent 3: OTA Self-Build (Phase 4 — Backend Rust)

**Memory File**: `agent-3-ota-selfbuild.md`
**Branch**: `feat/agent-3-ota`
**Dependencies**: None (new module)

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 4.1 | OTA module structure | NEW: `crates/goose/src/ota/mod.rs` | TODO |
| 4.2 | StateSaver (serialize agent+session state) | NEW: `ota/state_saver.rs` | TODO |
| 4.3 | SelfBuilder (cargo build integration) | NEW: `ota/self_builder.rs` | TODO |
| 4.4 | BinarySwapper (atomic replacement) | NEW: `ota/binary_swapper.rs` | TODO |
| 4.5 | HealthChecker (post-update validation) | NEW: `ota/health_checker.rs` | TODO |
| 4.6 | Rollback (restore previous version) | NEW: `ota/rollback.rs` | TODO |
| 4.7 | UpdateScheduler (periodic self-improvement) | NEW: `ota/update_scheduler.rs` | TODO |
| 4.8 | `/self-update` command + HITL approval | `agents/execute_commands.rs` | TODO |

### Safety
- Every build must pass `cargo test`
- Atomic binary swap with rollback on failure
- State checkpoint before every update
- HITL gate for self-modification

---

## Agent 4: Autonomous Daemon (Phase 5 — Backend Rust)

**Memory File**: `agent-4-autonomous-daemon.md`
**Branch**: `feat/agent-4-autonomous`
**Dependencies**: Agent 1 (cores), Agent 3 (OTA)

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 5.1 | Task Scheduler with cron + priority queue | NEW: `autonomous/scheduler.rs` | TODO |
| 5.2 | Branch Manager (create, switch, PR, merge) | NEW: `autonomous/branch_manager.rs` | TODO |
| 5.3 | Release Manager (semver, tag, changelog) | NEW: `autonomous/release_manager.rs` | TODO |
| 5.4 | Docs Generator (README, Docusaurus, Mermaid) | NEW: `autonomous/docs_generator.rs` | TODO |
| 5.5 | CI Watcher (monitor GH Actions, wait for green) | NEW: `autonomous/ci_watcher.rs` | TODO |
| 5.6 | Daemon entry point + config | NEW: `autonomous/mod.rs`, `config.rs` | TODO |
| 5.7 | HITL gates for auto-merge and release | `hitl/` | TODO |
| 5.8 | `/auto start`, `/auto stop`, `/auto status` | `execute_commands.rs` | TODO |
| 5.9 | Failsafe cascade + circuit breaker | NEW: `autonomous/failsafe.rs` | TODO |
| 5.10 | Audit log for autonomous actions | NEW: `autonomous/audit_log.rs` | TODO |

---

## Agent 5: Pipeline Visualization (Frontend — React/TSX)

**Memory File**: `agent-5-pipeline-viz.md`
**Branch**: `feat/agent-5-pipeline`
**Dependencies**: None (reads existing ChatState)

### COMPLETED (this session)

| # | Task | Files | Status |
|---|------|-------|--------|
| 5.1 | PipelineContext — real-time state from ChatState | `components/pipeline/PipelineContext.tsx` | DONE |
| 5.2 | AnimatedPipeline — SVG visualization with particles | `components/pipeline/AnimatedPipeline.tsx` | DONE |
| 5.3 | usePipelineBridge — wires real ChatState to pipeline | `components/pipeline/usePipelineBridge.ts` | DONE |
| 5.4 | Index exports | `components/pipeline/index.ts` | DONE |

### REMAINING

| # | Task | Files | Status |
|---|------|-------|--------|
| 5.5 | Wire PipelineProvider into App.tsx provider chain | `App.tsx` or `BaseChat.tsx` | **DONE** |
| 5.6 | Add usePipelineBridge call in BaseChat.tsx | `BaseChat.tsx` | **DONE** |
| 5.7 | Add pipeline toggle in settings | `settings/` | TODO |
| 5.8 | Quantum particle effects — larger, more active particles | `AnimatedPipeline.tsx` | **DONE** |
| 5.9 | Pipeline vitest tests | `pipeline/__tests__/` | **DONE** (58/58 tests) |

### Key Design: REAL-TIME, NOT MOCKED
- Pipeline reads `ChatState` from `useChatStream` (the ACTUAL agent state)
- When `ChatState.Idle` or `WaitingForUserInput` → pipeline shows WAITING mode (slow ambient pulse)
- When `ChatState.Thinking` → PLAN stage activates
- When `ChatState.Streaming` → EXECUTE stage activates
- When `ChatState.Compacting` → EVOLVE stage activates
- Particle flow speed and count scales with actual token throughput
- Activity log shows real tool calls and message content

---

## Agent 6: Super-Goose Panels (Phase 6 — Frontend TSX)

**Memory File**: `agent-6-panels.md`
**Branch**: `feat/agent-6-panels`
**Dependencies**: Agent 7 (colors)

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 6.1 | SuperGoosePanel container + sidebar nav | NEW: `super/SuperGoosePanel.tsx` | **DONE** |
| 6.2 | DashboardPanel with stats + hardware status | NEW: `super/DashboardPanel.tsx` | **DONE** |
| 6.3 | StudiosPanel with 6 studio cards | NEW: `super/StudiosPanel.tsx` | **DONE** |
| 6.4 | AgentsPanel with active agents + core builder | NEW: `super/AgentsPanel.tsx` | **DONE** |
| 6.5 | MarketplacePanel with browse/sell/review | NEW: `super/MarketplacePanel.tsx` | **DONE** |
| 6.6 | GPUPanel with cluster/jobs/launch | NEW: `super/GPUPanel.tsx` | **DONE** |
| 6.7 | ConnectionsPanel with services/models/keys | NEW: `super/ConnectionsPanel.tsx` | **DONE** |
| 6.8 | MonitorPanel with live logs + cost | NEW: `super/MonitorPanel.tsx` | **DONE** |
| 6.9 | SettingsPanel with toggles | NEW: `super/SGSettingsPanel.tsx` | **DONE** |
| 6.10 | Shared components (Badge, Card, StatusDot, etc.) | NEW: `super/shared/` (8 files) | TODO |
| 6.11 | Studio Pipeline 6-tab UI | NEW: `super/studio/` (7 files) | TODO |
| 6.12 | Autonomous Dashboard | NEW: `super/AutonomousDashboard.tsx` | TODO |

---

## Agent 7: Theme + Dual Color System (Frontend CSS)

**Memory File**: `agent-7-theme-colors.md`
**Branch**: `feat/agent-7-theme`
**Dependencies**: None

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 7.1 | Add sg-* CSS custom properties to main.css | `styles/main.css` | **DONE** (60 --sg-* tokens) |
| 7.2 | Scope sg-* tokens to `.super-goose-panel` | `styles/main.css` | **DONE** (scoped to `.super-goose-panel` / `[data-super="true"]`) |
| 7.3 | Create dark theme variant for pipeline | `styles/pipeline.css` | TODO |
| 7.4 | Mode selector UI (Manual/Assisted/Autonomous/Full Auto/Swarm) | NEW: `settings/ModeSelector.tsx` | TODO |
| 7.5 | Profile selector UI | NEW: `settings/ProfileSelector.tsx` | TODO |
| 7.6 | Feature toggles grid | NEW: `settings/FeatureToggles.tsx` | TODO |
| 7.7 | Agent count slider (1-8) | NEW: `settings/AgentScaler.tsx` | TODO |
| 7.8 | `/mode`, `/profile`, `/toggles` commands | Backend: `execute_commands.rs` | TODO |

---

## Agent 8: Test Coverage (Frontend + Backend)

**Memory File**: `agent-8-test-coverage.md`
**Branch**: `feat/comprehensive-testing` (current)
**Dependencies**: All other agents (tests their output)

### Tasks

| # | Task | Status |
|---|------|--------|
| 8.1 | Fix pre-existing test compilation errors (policies_integration_test, etc.) | TODO |
| 8.2 | Run full `cargo test --workspace` to establish baseline | TODO |
| 8.3 | Add integration tests for each core (FreeformCore, StructuredCore, etc.) | TODO |
| 8.4 | Run `vitest run` to verify 197+ existing frontend tests | TODO |
| 8.5 | Add pipeline component tests (`pipeline/__tests__/`) | TODO |
| 8.6 | Add panel component tests (`super/__tests__/`) | TODO |
| 8.7 | Run Playwright E2E against built app | TODO |
| 8.8 | Visual regression baselines | TODO |
| 8.9 | `tsc --noEmit` must remain clean | TODO |
| 8.10 | Coverage report: target 80%+ for new code | TODO |

---

## Agent 9: Documentation + Diagrams

**Memory File**: `agent-9-docs.md`
**Branch**: `feat/agent-9-docs`
**Dependencies**: All other agents (documents their work)

### Tasks

| # | Task | Status |
|---|------|--------|
| 9.1 | Update ARCHITECTURE.md with core system | TODO |
| 9.2 | Generate Mermaid diagrams for core selection flow | TODO |
| 9.3 | Update GitHub Pages with new features | TODO |
| 9.4 | Create OTA pipeline documentation | TODO |
| 9.5 | Create autonomous daemon documentation | TODO |
| 9.6 | Update CHANGELOG for all new features | TODO |
| 9.7 | Create pipeline visualization demo GIF | TODO |
| 9.8 | SWE-bench baseline report (10 tasks per core) | TODO |

---

## Agent 10: CI/CD + Release

**Memory File**: `agent-10-cicd.md`
**Branch**: `feat/agent-10-cicd`
**Dependencies**: All other agents (release gate)

### Tasks

| # | Task | Status |
|---|------|--------|
| 10.1 | Add core module tests to CI pipeline | TODO |
| 10.2 | Add frontend vitest to CI | TODO |
| 10.3 | Add `tsc --noEmit` check to CI | TODO |
| 10.4 | Add Playwright E2E to CI | TODO |
| 10.5 | Create release checklist automation | TODO |
| 10.6 | Version bump to v1.25.00 | TODO |
| 10.7 | Create GitHub Release with changelog | TODO |
| 10.8 | Build + sign Windows installer | TODO |
| 10.9 | Docker image rebuild | TODO |
| 10.10 | GitHub Pages deployment | TODO |

---

## Crash Recovery Protocol

### On Session Crash / Context Overflow:

1. **Read this file** — `docs/CONTINUATION_10_AGENTS_MASTER.md`
2. **Read MEMORY.md** — `C:\Users\Admin\.claude\projects\G--goose\memory\MEMORY.md`
3. **Read agent-specific memory** — `memory/agent-{N}-{name}.md`
4. **Check git status** — `git status && git log --oneline -10`
5. **Find last checkpoint** — Look for `DONE` markers in this file and memory files
6. **Resume from first `TODO`** — Skip all completed tasks

### Memory Save Protocol (After Every Milestone):

```
1. Update agent memory file: memory/agent-{N}-{name}.md
2. Update MEMORY.md if major architectural change
3. Mark task as DONE in this continuation doc
4. Commit: "checkpoint: agent-{N} task {X} complete"
```

### Environment Setup (Windows):

```bash
# Rust build — MUST set LIB for Windows SDK
export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Tools\\MSVC\\14.50.35717\\lib\\x64"

# Run core tests (skip broken integration tests)
cargo test --lib -p goose -- core::

# Frontend
cd ui/desktop && npx vitest run && npx tsc --noEmit

# Do NOT use D:\ for anything — it's a slow SATA HDD
# All work on G:\ (NVME)
```

### Merge Order

```
1. Agent 1 (Core Wirer)      → main   [foundational]
2. Agent 2 (Learning)        → main   [independent]
3. Agent 3 (OTA)             → main   [independent]
4. Agent 7 (Theme)           → main   [CSS tokens needed by panels]
5. Agent 5 (Pipeline Viz)    → main   [partial done, needs wiring]
6. Agent 6 (Panels)          → main   [depends on theme tokens]
7. Agent 4 (Autonomous)      → main   [depends on cores + OTA]
8. Agent 8 (Tests)           → main   [tests all the above]
9. Agent 9 (Docs)            → main   [documents all the above]
10. Agent 10 (Release)       → main   [final gate]
```

---

## Current Progress Snapshot

### Phase 0: Agentic Core Transformer — COMPLETE
- 11 files created in `agents/core/` (10 original + selector.rs)
- AgentCore trait + 6 implementations
- AgentCoreRegistry with hot-swap
- CoreSelector with auto-invocation
- `/core` and `/cores` commands
- `cargo check` clean, `cargo test --lib -p goose -- core::` — **87/87 passed**

### Phase 1: Core Wiring — COMPLETE (2026-02-12)
- 1.1 OrchestratorCore → real specialists — **DONE** (13 tests)
- 1.3 StructuredCore → StateGraph FSM — **DONE** (8 tests)
- 1.4 SwarmCore → parallel agent pool — **DONE** (8 tests)
- 1.5 WorkflowCore → template pipelines — **DONE** (9 tests)
- 1.6 AdversarialCore → Coach/Player review — **DONE** (12 tests)
- 1.7 Subagent nesting limit — **DONE** (configurable depth, default 10)
- **Total: 87/87 core tests passing** (`cargo test --lib -p goose -- core::`)
- Remaining: 1.2 (specialist roles), 1.8 (integration tests)

### Phase 2: Persistent Learning Engine — COMPLETE (2026-02-12)
- ExperienceStore (SQLite cross-session learning) — **DONE** (11/11 tests)
- InsightExtractor (ExpeL-style pattern analysis) — **DONE** (7/7 tests)
- SkillLibrary (Voyager-style reusable strategies) — **DONE** (7/7 tests)
- SqliteReflectionStore (persistent Reflexion data) — **DONE** (7/7 tests)
- LlmPlanner (wired to SharedProvider) — **DONE** (13/13 tests)
- CriticManager auto-invoked after plan creation — **DONE**
- `/experience`, `/experience stats`, `/skills`, `/insights` commands — **DONE**
- **Total: 52/52 learning engine tests passing**

### Phase 3: Auto Core Selection — COMPLETE (2026-02-12)
- CoreSelector: task categorization, experience lookup, fallback scoring — **DONE** (11 tests)
- Auto-invocation in reply() flow — **DONE** (runs before dispatch, switches core when confidence > 0.7)
- Core dispatch: non-freeform cores dispatch through core.execute() — **DONE**
- Automatic fallback to FreeformCore on execution failure — **DONE**
- Experience data recorded for both success and failure paths — **DONE**

### Phase 5: Pipeline Visualization — 9/10 COMPLETE
- PipelineContext, AnimatedPipeline, usePipelineBridge, index — DONE
- Wired into App.tsx + BaseChat.tsx — DONE
- Quantum particle effects — DONE
- Vitest tests (58/58) — DONE
- Remaining: 5.7 Pipeline toggle in settings

### Phase 6: Super-Goose 8-Panel Sidebar — COMPLETE (2026-02-12)
- SuperGoosePanel container + 8 sub-panels — **DONE**
- All use `data-super="true"` + sg-* CSS tokens — **DONE**
- Routed at `/super` in App.tsx — **DONE**
- Vitest tests (11/11) — **DONE**

### Phase 7: Theme + Dual Color System — COMPLETE (2026-02-12)
- 60 `--sg-*` CSS custom properties added to main.css — **DONE**
- Scoped to `.super-goose-panel` / `[data-super="true"]` — **DONE**
- Stock Goose colors UNTOUCHED — **DONE**

### Critical Wiring Gaps — ALL FIXED (commit b12a665ed6)
1. `init_learning_stores()` — Mutex<Option<Arc<...>>> refactor, lazy init in reply(), &self signature
2. Core dispatch in reply() — Non-freeform cores dispatch through core.execute(), auto-fallback
3. CoreSelector auto-invocation — Runs before dispatch, switches core when confidence > 0.7
4. SuperGoosePanel route — `/super` route added to App.tsx

### Test Summary
- **139/139 backend tests passing** (87 core + 52 learning engine)
- **2086/2086 frontend tests passing** (vitest)
- Experience data recorded for both success and failure paths (learning loop closed)

---

## Disk Layout (IMPORTANT)

| Drive | Type | Use |
|-------|------|-----|
| G:\ | NVME | ALL code, builds, tests, temp files |
| C:\ | SSD | OS, cargo registry, Claude memory |
| D:\ | SATA HDD | **DO NOT USE** — too slow |

**Never** write build artifacts, temp files, or caches to D:\.
