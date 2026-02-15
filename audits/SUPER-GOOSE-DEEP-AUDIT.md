# Super-Goose Comprehensive Deep Audit

**Date:** 2026-02-15
**Branch:** `feat/resizable-layout`
**Auditor:** Cascade AI (Sessions 7-10)
**Scope:** Full codebase - Rust backend, TypeScript frontend, CI/CD, extensions

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Rust Core Agents](#2-rust-core-agents)
3. [Agent Bus Subsystem](#3-agent-bus-subsystem)
4. [OTA Self-Build Subsystem](#4-ota-self-build-subsystem)
5. [Autonomous Daemon](#5-autonomous-daemon)
6. [Guardrails and Compaction](#6-guardrails-and-compaction)
7. [Goose-Server Routes](#7-goose-server-routes)
8. [Goose-Conductor](#8-goose-conductor)
9. [AG-UI Protocol and Frontend](#9-ag-ui-protocol-and-frontend)
10. [Super-Goose UI Panels](#10-super-goose-ui-panels)
11. [Project Soul Extension](#11-project-soul-extension)
12. [CI/CD Workflows](#12-cicd-workflows)
13. [Critical Bugs and Findings](#13-critical-bugs-and-findings)
14. [Fixes Applied](#14-fixes-applied)
15. [Recommendations](#15-recommendations)
16. [GitHub Issues Status](#16-github-issues-status)

---

## 1. Project Overview

| Field | Value |
|-------|-------|
| **Name** | Super-Goose (fork of Block Goose) |
| **Location** | G:\goose |
| **Version** | 1.24.7 (README) / 1.25.0 (Cargo.toml) |
| **License** | Apache 2.0 |
| **Backend** | Rust 2021 edition, 8 workspace crates |
| **Frontend** | React 19, TypeScript 5.9, Electron 40, Tailwind CSS v4 |
| **Streaming** | AG-UI protocol (SSE + broadcast channel) |
| **Database** | SQLite (WAL mode) for learning, experience, skills, audit |

### Crate Map

| Crate | Purpose |
|-------|---------|
| goose | Core agent logic, 6 cores, learning, OTA, autonomous, guardrails |
| goose-server | Backend API (goosed binary), 37 route modules |
| goose-conductor | Process supervisor daemon |
| goose-cli | CLI entry point |
| goose-mcp | MCP extensions |
| goose-acp | Agent-to-agent protocol stub |

---

## 2. Rust Core Agents

### 2.1 Agent Core Trait (core/mod.rs)

The AgentCore trait is the central abstraction for execution strategies:
- `core_type()` - returns CoreType enum
- `capabilities()` - returns CoreCapabilities
- `execute()` - async task execution
- `metrics()` - BUG: always returns zeros
- `reset_metrics()` - resets counters

CoreType enum: Freeform, Structured, Orchestrator, Swarm, Workflow, Adversarial

### 2.2 Six Agent Cores

| Core | File | Strategy | Status |
|------|------|----------|--------|
| FreeformCore | core/mod.rs | General-purpose pass-through | WARNING: No-op (returns empty CoreOutput) |
| StructuredCore | core/structured.rs | Code-Test-Fix FSM | Functional |
| OrchestratorCore | core/orchestrator_core.rs | DAG-based task decomposition | Functional |
| SwarmCore | core/swarm_core.rs | Parallel multi-agent execution | Functional |
| WorkflowCore | core/workflow_core.rs | Template-driven pipelines | Functional |
| AdversarialCore | core/adversarial_core.rs | Coach/Player review cycles | Functional |

### 2.3 Core Infrastructure

- **CoreMetrics** (core/metrics.rs): Atomic counters for execution stats
- **AgentCoreRegistry** (core/registry.rs): Manages core instances, active core switching
- **CoreSelector** (core/selector.rs): Auto-selects best core using ExperienceStore history

### 2.4 Finding: Core Metrics Always Zero (B4)

All 6 core implementations return CoreMetrics::new() from fn metrics() - a fresh empty struct, not stored metrics.

---

## 3. Agent Bus Subsystem

Location: crates/goose/src/agent_bus/

| Component | File | Purpose |
|-----------|------|---------|
| Messages | messages.rs | AgentId, TeamId, AgentRole, AgentStatus, AgentMessage types |
| Registry | registry.rs | SQLite-backed AgentRegistry for agent metadata |
| Router | router.rs | MessageRouter with mailbox queues and topic pub/sub |
| Shared Memory | shared_memory.rs | SQLite key-value store with namespace scoping |
| Wake Policy | wake_policy.rs | Configurable auto-wake for offline agents |

**Fix applied (Session 9):** 7 lock().unwrap() calls changed to .unwrap_or_else for mutex poison recovery.

**Finding (G7):** Agent bus state is in-memory only per routes() call, not shared with AppState.

---

## 4. OTA Self-Build Subsystem

Location: crates/goose/src/ota/ (15 files)

### Architecture

AutoImproveScheduler orchestrates:
- ImprovementPlanner (plan from insights)
- CodeApplier (apply with backup/rollback)
- SandboxRunner (isolated build+test)
- TestRunner (Rust + Vitest + tsc)
- SelfBuilder (cargo build)
- BinarySwapper (atomic binary replacement)
- HealthChecker (post-update validation)
- RollbackManager (multi-level rollback)
- StateSaver (snapshot agent state)
- PolicyEngine (enforce modification rules)
- SafetyEnvelope (invariant checks)

### Safety Features

- File allowlists and blocked patterns
- Risk ceiling enforcement
- Mandatory test passage before applying changes
- Backup before every file modification
- Dry-run mode in CodeApplier

---

## 5. Autonomous Daemon

Location: crates/goose/src/autonomous/ (8 files)

| Component | File | Purpose |
|-----------|------|---------|
| TaskScheduler | scheduler.rs | Priority queue with Once/Recurring/Cron schedules |
| BranchManager | branch_manager.rs | Git operations via mockable GitExecutor trait |
| CiWatcher | ci_watcher.rs | Poll GitHub Actions via mockable CiStatusFetcher |
| Failsafe | failsafe.rs | Circuit breaker (Closed-Open-HalfOpen) |
| AuditLog | audit_log.rs | SQLite-backed persistent audit trail |
| AutonomousDaemon | mod.rs | Coordinates all components |

### Design Strengths

- All external operations go through traits for testability
- Circuit breaker pattern prevents runaway failures
- SQLite audit log provides full operation history

---

## 6. Guardrails and Compaction

### 6.1 Guardrails

GuardrailsEngine orchestrates 6 detectors:

| Detector | Purpose | Default Threshold |
|----------|---------|-------------------|
| PromptInjectionDetector | Detects prompt manipulation | 0.7 |
| PiiDetector | Detects PII with optional redaction | 0.8 |
| JailbreakDetector | Detects jailbreak exploitation | 0.7 |
| TopicDetector | Banned/allowed topic enforcement | 0.7 |
| KeywordDetector | Custom keyword blocklists | 0.9 |
| SecretDetector | API keys, tokens, credentials | 0.9 |

### 6.2 Compaction

Context management for long-running agents:
- Strategies: Summarize, Truncate, Selective, Hybrid
- Auto-compact at 85% token threshold
- Preserves recent messages (default 10), system prompts, tool results

---

## 7. Goose-Server Routes

Location: crates/goose-server/src/routes/ (37 modules)

| Module | Purpose | Status |
|--------|---------|--------|
| reply.rs | Core message streaming, AG-UI events | Functional (B5: double terminal events) |
| ag_ui_stream.rs | AG-UI SSE streaming endpoint | Functional |
| agents_api.rs | Agent registration, messaging | WARNING: In-memory state only |
| settings.rs | Settings CRUD | Functional |
| conscious.rs | Voice system routes (77KB) | DISCONNECTED from Moshi |
| gpu_jobs.rs | GPU job management, Ollama | Fixed: env-var Ollama URL |
| enterprise.rs | Enterprise features | Partial stubs |
| timewarp.rs | Time-travel debugging | 7 TODOs, stub endpoints |
| bookmarks.rs | Bookmark management | TODO: migrate to SQLite |

### Finding: reply.rs Double Terminal Events (B5)

_run_terminated flag is declared but never set to true, so RUN_FINISHED always emits even after RUN_ERROR.

---

## 8. Goose-Conductor

Location: crates/goose-conductor/src/ (8 modules)

The conductor manages lifecycle of goosed and Electron:
- config.rs - ConductorConfig
- child_manager.rs - start/stop/restart processes
- health_checker.rs - circuit-breaker restart policy
- ipc_server.rs - IPC commands
- message_bus.rs - inter-process messaging
- state_store.rs - SQLite state persistence
- log_manager.rs - log rotation

**Finding (G1):** Conductor exists and compiles but is NOT wired to goosed. No IPC communication established.

---

## 9. AG-UI Protocol and Frontend

### 9.1 Event Types (28 total)

| Category | Events |
|----------|--------|
| Lifecycle | RUN_STARTED, RUN_FINISHED, RUN_ERROR, RUN_CANCELLED, STEP_STARTED, STEP_FINISHED |
| Text | TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, TEXT_MESSAGE_CHUNK |
| Tool Calls | TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT, TOOL_CALL_ERROR |
| State | STATE_SNAPSHOT, STATE_DELTA, MESSAGES_SNAPSHOT |
| Activity | ACTIVITY, ACTIVITY_SNAPSHOT, ACTIVITY_DELTA |
| Reasoning | REASONING_START, REASONING_CONTENT, REASONING_END, REASONING_MESSAGE_CHUNK |

### 9.2 Critical Bugs

- **B1:** TEXT_MESSAGE_CONTENT reads evt.content but protocol defines delta
- **B2:** TOOL_CALL_ARGS reads evt.args but protocol defines delta
- **B3:** Reasoning event type mismatch between useAgUi.ts and types.ts

---

## 10. Super-Goose UI Panels

Location: ui/desktop/src/components/super/

### Panel Inventory (18 components)

| Panel | Status |
|-------|--------|
| SuperGoosePanel | Main container with 13-item sidebar nav |
| DashboardPanel | Stats grid + approval gate + activity feed |
| AgentsPanel | Core switching, config persistence |
| MonitorPanel | Cost tracking, reasoning display |
| StudiosPanel | WARNING: 4/6 tabs are Coming Soon stubs |
| GPUPanel | nvidia-smi parsing, job management |
| ConnectionsPanel | Extension connection management |
| SGSettingsPanel | 7 settings sections |
| MarketplacePanel | Static content |
| AuditDashboard | WARNING: Hardcoded localhost:3284 |

### Finding: No Error Boundaries (M6)

No super/ panel component has error boundaries. A crash in any panel takes down the entire SuperGoosePanel.

---

## 11. Project Soul Extension

Location: extensions/project-soul/soul/ (7 Python files)

| File | Class | Purpose |
|------|-------|---------|
| server.py | SoulServer | Main loop: listen-detect-process-execute-speak-remember |
| config.py | SoulConfig | Dataclass configs for Moshi, Memory, SuperGoose, Orb, Emotion |
| moshi_client.py | MoshiClient | Kyutai Moshi S2S voice client |
| memory.py | SoulMemory | Mem0/Qdrant-backed memory system |
| liaison.py | SuperGooseLiaison | Intent parsing and task execution bridge |
| emotion.py | EmotionEngine | Voice emotion detection |

**Status: NOT FUNCTIONAL** - Dependencies not installed (Moshi model, Qdrant, mem0).

---

## 12. CI/CD Workflows

Location: .github/workflows/ (44 files)

### CI Main Pipeline (ci-main.yml)

Stage 1: Detect Changes (docs-only? rust? typescript?)
Stage 2: Lint (cargo fmt + clippy, ESLint) - parallel
Stage 2b: Cargo Quality Tools (machete, hack) - non-blocking
Stage 3: Build (cargo build --release, tsc --noEmit) - parallel
Stage 4: Test (cargo test unit + integration, vitest) - parallel
Stage 4b: Semgrep Policy - non-blocking
Stage 5: CI Status Gate - always runs

### Session 9 Infrastructure Fixes (26 of 30 issues fixed)

- Security (4): Pinned unpinned actions to SHA, added missing permissions
- Performance (2): Docker dependency caching, removed hardcoded version
- Correctness (2): Removed duplicate permissions, fixed Node.js version
- Timeouts (16): Added timeout-minutes to 16 jobs
- Concurrency (4): Added concurrency groups

---

## 13. Critical Bugs and Findings

### CRITICAL (Runtime Failures)

| ID | Location | Issue |
|----|----------|-------|
| B1 | useAgUi.ts | TEXT_MESSAGE_CONTENT reads evt.content not delta |
| B2 | useAgUi.ts | TOOL_CALL_ARGS reads evt.args not delta |
| B3 | useAgUi.ts + types.ts | REASONING event type mismatch |
| B4 | All 6 cores | metrics() returns fresh CoreMetrics::new() |
| B5 | reply.rs | _run_terminated never set true |
| B6 | FreeformCore | execute() returns empty CoreOutput |

### HIGH (Functional Gaps)

| ID | Location | Issue |
|----|----------|-------|
| G1 | goose-conductor | Exists but not wired to goosed |
| G2 | agents_api.rs | Agent bus state in-memory only |
| G3 | conscious.rs | 77KB of routes but voice system disconnected |
| G4 | goose-mcp | 13 bundled extensions declared but not implemented |
| G5 | StudiosPanel | 4/6 tabs are Coming Soon stubs |

### MEDIUM

| ID | Location | Issue |
|----|----------|-------|
| M1 | AuditDashboard.tsx | Hardcoded localhost:3284 |
| M2 | DashboardPanel.tsx | Quick action buttons have no onClick handlers |
| M3 | useAgUi.ts + types.ts | Duplicate type definitions |
| M4 | MonitorPanel.tsx | NaN display risk from undefined cost fields |
| M5 | Multiple files | truncate() duplicated 4 times, NOT UTF-8 safe |
| M6 | All super/ panels | No error boundaries |

---

## 14. Fixes Applied (Sessions 7-9)

### Session 9 - Rust Backend (9 files)

1. notification_events.rs - .expect() to match + fallback
2. signup_tetrate/server.rs - 6 unwraps to render_embedded_template()
3. signup_openrouter/server.rs - 6 unwraps to render_embedded_template()
4. subagent_handler.rs - .expect() to .unwrap_or(DEFAULT)
5. reflexion.rs - bare .unwrap() to documented .expect()
6. agent_bus/router.rs - 7 lock().unwrap() to poison recovery
7. config/base.rs - 7 lock().unwrap() to poison recovery
8. config/declarative_providers.rs - lock().unwrap() to poison recovery
9. gpu_jobs.rs - Hardcoded Ollama URL to env-var-backed

### Session 9 - Infrastructure (17 files)

- 4 security fixes (SHA pinning, permissions)
- 16 timeout additions
- 4 concurrency group additions
- Docker dependency caching layer
- .dockerignore and .gitignore updates

### Session 8 - Frontend (12 fixes)

- useNavigationSafe() for toast components outside Router
- Mock data cleanup in ReflexionPanel, GuardrailsPanel
- useMemo for expensive derived state
- AbortController cleanup in SGSettingsPanel

---

## 15. Recommendations

### Immediate (Before Next Push)

1. Fix B1/B2: Update useAgUi.ts to read evt.delta for TEXT_MESSAGE_CONTENT and TOOL_CALL_ARGS
2. Fix B3: Align reasoning event type names between useAgUi.ts and types.ts
3. Fix B5: Set _run_terminated = true after emitting RUN_ERROR in reply.rs
4. Add error boundaries to SuperGoosePanel

### Short-Term

5. Fix B4: Store CoreMetrics in each core and return stored snapshot
6. Wire conductor: Establish IPC between goosed and goose-conductor
7. Persist agent bus state: Share AgentBusState with main AppState
8. Fix AuditDashboard.tsx: Use getApiUrl() instead of hardcoded localhost
9. Deduplicate truncate(): Create single UTF-8-safe utility function

### Medium-Term

10. Complete Studio tabs: Implement remaining 4 Coming Soon tabs
11. Install Project Soul deps: Moshi model, Qdrant, mem0
12. Implement bundled extensions: Wire the 13 declared goose-mcp extensions
13. Add integration tests for AG-UI event flow

### GitHub Actions

14. Pin remaining unpinned actions (pr-agent.yml)
15. Standardize checkout action version across all workflows
16. Enable disabled workflows or remove them

---

## 16. GitHub Issues Status

### Open Issues (as of 2026-02-15)

| # | Title | Type | Action |
|---|-------|------|--------|
| 32 | PREA spam bot issue | Spam | Close as not_planned |
| 31 | Dependabot: bump qs 6.14.1 to 6.14.2 | PR/Security | Merge (safe fix) |
| 30 | RUSTSEC-2025-0134: rustls-pemfile unmaintained | Advisory | Upstream blocked |
| 29 | RUSTSEC-2024-0370: proc-macro-error unmaintained | Advisory | Upstream blocked |
| 28 | RUSTSEC-2024-0436: paste unmaintained | Advisory | Upstream blocked |
| 27 | RUSTSEC-2025-0119: number_prefix unmaintained | Advisory | Upstream blocked |
| 26 | RUSTSEC-2025-0057: fxhash unmaintained | Advisory | Upstream blocked |
| 6 | RUSTSEC-2019-0040: boxfnonce obsolete | Advisory | Upstream blocked |
| 5 | RUSTSEC-2025-0141: bincode unmaintained | Advisory | Upstream blocked |

### RUSTSEC Advisory Triage

All 7 RUSTSEC advisories are for **transitive dependencies** inherited from upstream Block/Goose. These cannot be fixed directly - they require upstream crate maintainers to update. Issues #5 and #6 already have the `upstream-blocked` label.

Recommended actions:
- Label all RUSTSEC issues as `upstream-blocked`
- Add comment noting these are transitive deps from upstream fork
- Monitor upstream Block/Goose for dependency updates
- Run `cargo update` periodically to pick up any indirect fixes

---

*End of audit. Generated by Cascade AI, 2026-02-15.*
