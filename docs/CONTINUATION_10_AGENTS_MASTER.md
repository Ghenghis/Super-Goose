# Super-Goose Continuation Guide

**Version**: v1.24.7
**Branch**: `feat/resizable-layout`
**Last Updated**: 2026-02-15

## Quick Start for New Sessions

1. Read this document for project overview
2. Check `docs/SESSION10-ISSUE-TRACKER.md` for current issues
3. Check `docs/ARCHITECTURE.md` for system architecture
4. Run verification: `tsc --noEmit`, `cargo check --workspace`, `npx vitest run`

## Critical Rules

### STRICT RULE: Always Fix Issues When Seen
- **NEVER skip** issues, problems, errors, bugs, warnings, or anything that could use correcting
- **Fix immediately** when encountered — do not defer, do not "come back to it later"
- Applies to ALL issues: unrelated code problems, lint warnings, dead code, incorrect logic, stale comments, broken tests
- Goal: **clean, stable, smoothly running codebase** — no AI slop, no dirty code, no deferred problems
- If you see something wrong, fix it right then and there before moving on

### Repository Path
- **Local path**: `G:\goose` (NVME)
- **CRITICAL: Do NOT use D:\ — slow SATA HDD. All work on G:\ (NVME)**

## Project Structure

```
Super-Goose (G:\goose)
├── crates/                    # Rust backend (7 crates)
│   ├── goose/                 # Core library: agents, cores, learning, OTA, autonomous
│   │   └── src/agents/core/   # 6 execution cores + selector + registry
│   ├── goose-server/          # Axum HTTP server + SSE streaming
│   ├── goose-cli/             # Terminal interface
│   ├── goose-mcp/             # MCP client
│   ├── goose-acp/             # ACP client
│   ├── goose-test/            # Integration tests
│   └── goose-test-support/    # Test utilities
├── ui/desktop/                # Electron + React frontend
│   └── src/
│       ├── components/super/  # 16 Super-Goose panels
│       ├── components/features/ # Feature panels (budget, guardrails, etc.)
│       ├── ag-ui/             # AG-UI protocol (SSE streaming)
│       └── hooks/             # React hooks
├── docs/                      # Documentation
├── .github/workflows/         # CI/CD
└── documentation/             # Docusaurus site
```

## Architecture Summary

### Backend (Rust)

#### Agentic Cores
- **6 Agent Cores**: FreeformCore (default), StructuredCore, OrchestratorCore, SwarmCore, WorkflowCore, AdversarialCore
- All implement `AgentCore` trait in `crates/goose/src/agents/core/`
- **CoreSelector**: Auto-picks best core per task using ExperienceStore history
- **CoreRegistry**: Manages core lifecycle and configuration

#### Learning Engine
- **ExperienceStore**: SQLite-backed experience tracking with quality metrics
- **InsightExtractor**: Pattern recognition from conversation history
- **SkillLibrary**: Reusable skill storage and retrieval
- **Reflexion**: Self-evaluation and improvement loop

#### OTA Self-Build
- **14 components** in `crates/goose/src/ota/`:
  - StateSaver: Serializes running state before update
  - SelfBuilder: Compiles new binary from source
  - BinarySwapper: Atomic binary replacement
  - HealthChecker: Post-update health verification
  - RollbackManager: Automatic rollback on failure
  - UpdateScheduler: OTA cycle scheduling
  - OtaManager: Orchestrates full OTA pipeline
  - TestRunner: Runs test suite pre-deployment
  - ImprovementPlanner: Analyzes audit results
  - CodeApplier: Applies code changes
  - AutoImproveScheduler: Schedules improvement cycles
  - PolicyEngine: Enforces update policies
  - SafetyEnvelope: Guards against unsafe updates
  - SandboxRunner: Isolated test execution
- **198 passing tests**

#### Autonomous Daemon
- **8 components** in `crates/goose/src/autonomous/`:
  - TaskScheduler: Autonomous task execution
  - BranchManager: Git branch management
  - ReleaseManager: Release automation
  - DocsGenerator: Documentation generation
  - CiWatcher: CI/CD monitoring
  - Failsafe: Safety mechanisms
  - AuditLog: Audit trail
- **86 passing tests**

#### API Routes
- **28 route modules** in `crates/goose-server/src/routes/`:
  - `settings.rs`: User settings CRUD
  - `learning.rs`: Experience/skills/insights endpoints
  - `ota_api.rs`: OTA pipeline control
  - `cost.rs`: Cost tracking and reporting
  - `features.rs`: Feature flag management
  - `agent_stream.rs`: AG-UI SSE streaming
  - `enterprise.rs`: 14 enterprise endpoints (gateway, guardrails, hooks, memory, observability, policies)
  - `extensions.rs`: Tool toggle persistence
  - `system.rs`: GPU detection via nvidia-smi
  - Plus 19 additional route modules

#### AG-UI Event Bus
- **Broadcast channel** in `state.rs`: `broadcast::Sender<String>` (capacity=4096)
- **24 event types** streamed via SSE
- **tokio::select! multiplexing** in SSE handler
- **Helper functions**: `emit_ag_ui_event_typed()`, `emit_ag_ui_event()`, `emit_bridged_event()`

#### TimeWarp Store
- SQLite event store in `crates/goose/src/timewarp/event_store.rs`
- Timeline tracking and playback

### Frontend (React/TypeScript)

#### Layout
- **Upstream shadcn Sidebar + SidebarInset pattern** (NOT react-resizable-panels)
- Left sidebar: `<Sidebar variant="inset" collapsible="offcanvas">`
- Right panel: CSS `transition-[width,min-width]` with 20rem fixed width
- Agent/Super Goose tabs

#### Super-Goose Panels
- **16 panels** in `ui/desktop/src/components/super/`:
  - DashboardPanel: Main overview
  - StudiosPanel: Studio management
  - AgentsPanel: Agent configuration
  - MarketplacePanel: Extension marketplace
  - GPUPanel: GPU monitoring
  - ConnectionsPanel: Connection management
  - MonitorPanel: System monitoring
  - SGSettingsPanel: Settings
  - Plus 8 feature panels (Budget, CriticManager, Guardrails, Reflexion, etc.)
- **6 shared components**: SGApprovalGate, SGCostGate, etc.
- **3 hooks**: useAgUi (AG-UI SSE), useAgentStream (legacy), useSuperGooseData (polling)

#### AG-UI Protocol
- **4 files** in `ui/desktop/src/ag-ui/`:
  - `types.ts` (601 lines): Event type definitions
  - `useAgUi.ts` (1001 lines): SSE streaming hook
  - `verifyEvents.ts`: Event validation
  - `index.ts`: Public API

#### Settings Bridge
- **settingsBridge.ts**: 25 SettingsKeys
- **useSettingsBridge hook**: Backend + localStorage fallback
- **useFeatureSettings**: Feature-specific settings
- **useSettingsStream**: SSE-based settings updates

#### Design Tokens
- **255 lines** of sg-* CSS in `ui/desktop/src/main.css`
- Scoped to `.super-goose-panel`
- Consistent theming across all Super-Goose components

## Current State (v1.24.7)

### What's Working

#### Backend
- All 6 agent cores compile and run
- CoreSelector auto-selection with experience-based learning
- ExperienceStore, SkillLibrary, InsightExtractor, Reflexion — all SQLite-backed
- OTA self-build pipeline (state save, build, swap, health check, rollback)
- Autonomous daemon (scheduler, branch manager, CI watcher, docs generator)
- AG-UI broadcast event bus with 24 event types
- Enterprise API: 14 endpoints across 6 panels
- Extension system (3-tier: builtin, bundled, custom)
- GPU detection via nvidia-smi parsing
- Settings SSE streaming
- Mutex poison recovery at 12 locations

#### Frontend
- 16 Super-Goose panels render with AG-UI SSE streaming
- Settings bridge with backend + localStorage fallback
- Pipeline visualization with quantum particle animations
- TimeWarp event viewer
- AG-UI protocol adoption (5 panels fully wired)
- Right panel CSS transitions (stable, no react-resizable-panels bugs)

#### Testing
- **Vitest**: 239 files, 3,378 passed, 2 todo, 0 failed
- **Playwright E2E**: 291 passed, 68 skipped, 0 failed
- **Rust**: 67+ lib tests pass, 3 pre-existing evolution failures
  - goose-server: 37/37 + 3 core config + 5 broadcast channel + 8 GPU parser
  - core: 87/87 + 29 integration
  - OTA: 198/198
  - autonomous: 86/86
  - learning: 52/52
  - timewarp: 8/8
- **tsc --noEmit**: 0 errors
- **cargo check**: 0 warnings (full clean rebuild)

### Known Issues

See `docs/SESSION10-ISSUE-TRACKER.md` for the full list. Key items:

#### Critical
- FreeformCore dispatcher bypass — Agent.reply() bypasses CoreSelector for FreeformCore
- FreeformCore.execute() returns stub CoreOutput (turns_used: 0, metrics: default())

#### High
- PlanManagerPanel, BookmarkManager use MOCK data, never fetch API
- OTA API returns Json(vec![]) when not initialized (frontend can't distinguish)
- StatusBar controls in wrong location (inside ChatInput)
- 2 hardcoded addresses (conductor_client.rs, conscious.rs)

#### Medium
- AG-UI bridge event function exists but never called
- AgentStreamEvent variants defined but never emitted
- 11 dead code locations
- Cost tracking by model not implemented
- Missing pagination on large responses

## Build & Test Commands

### Prerequisites
```bash
# Windows MSVC LIB path (required for cargo)
export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.50.35717\\lib\\x64"
```

### Verification
```bash
tsc --noEmit                    # TypeScript check (0 errors)
cargo check --workspace          # Rust check (0 warnings)
npx vitest run                   # Frontend tests (3,378 pass)
npx playwright test              # E2E tests (291 pass)
```

### Development
```bash
npm run start-gui                # Start Electron app (dev mode)
cargo build -p goose-server      # Build backend
cargo test --lib -p goose        # Run core tests
cargo test -p goose-server       # Run server tests
```

### Windows-Specific
```bash
# Kill zombie processes before E2E
taskkill /F /IM goosed.exe

# cargo PATH in git-bash
export PATH="$PATH:/c/Users/Admin/.cargo/bin"
```

### Troubleshooting
```bash
# LLVM OOM during cargo test
cargo test --lib               # Test individual crates

# npm ci fails on lock mismatch
npm install --package-lock-only

# Node.js v25+ cross-zip issue
# Use Node v24 or patch fs.rmdir → fs.rm
```

## Key Patterns and Gotchas

### Frontend

1. **Vite CJS pre-bundling**: With `noDiscovery: true`, every CJS package AND sub-paths must be in `optimizeDeps.include`. ESM packages must NOT be listed.
   ```typescript
   // vite.config.ts
   optimizeDeps: {
     include: [
       'shell-quote',           // CJS package
       'lodash',                // CJS package
       'lodash/debounce'        // CJS sub-path
     ]
   }
   ```

2. **Sidebar layout**: NEVER replace upstream shadcn Sidebar+SidebarInset with react-resizable-panels. The CSS transition pattern is proven and stable; react-resizable-panels causes sizePercent=0 bugs, localStorage corruption, and collapse state issues.

3. **SidebarProvider wrapper**: Must have `className="group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex h-svh min-h-0 w-full overflow-hidden"`. Changing to `"contents"` breaks all layout.

4. **Right panel**: Use simple CSS `transition-[width,min-width]` with fixed width (20rem) instead of react-resizable-panels.

5. **EventSource in tests**: jsdom has no EventSource — must `vi.mock('./ag-ui/useAgUi')` in any test rendering components that use `useAgUi()`:
   ```typescript
   vi.mock('./ag-ui/useAgUi', () => ({
     useAgUi: () => ({
       agentState: { core_type: 'default', status: 'idle' },
       connected: false,
       isRunning: false,
       activeToolCalls: [],
       activities: [],
       customEvents: [],
       messages: []
     })
   }))
   ```

6. **Vitest vi.fn generics**: `vi.fn<[ArgType], ReturnType>()` removed in Vitest 2.x — use `vi.fn().mockResolvedValue({} satisfies Type)` instead.

7. **React JSX Transform**: Modern — `import React` NOT needed in components.

8. **NODE_ENV**: Must NOT be "production" for `npm install` (devDependencies skipped).

### Backend

9. **Conversation.messages()**: It's a **method**, not a field — always `.messages()` not `.messages`.

10. **Agent lazy init**: `Mutex<Option<Arc<T>>>` pattern for experience_store, skill_library, insight_extractor.

11. **compaction_manager field**: `pub(crate)` for cross-module access from `execute_commands.rs`.

12. **StructuredCore**: `use_done_gate: false` (DoneGate hangs in tests).

13. **Mutex poison recovery**: 12 locations use `.unwrap_or_else(|e| e.into_inner())` for poison recovery.

14. **Template render safety**: OpenRouter and Tetrate templates use safe defaults.

15. **Ollama configurable host**: Uses `OLLAMA_HOST` env var, falls back to `http://localhost:11434`.

### Git & CI

16. **issue_comment triggers**: Fire on ALL comments including bots — add bot filter.

17. **GitHub parses .DISABLED files**: Must delete, not rename.

18. **external/ is gitignored**: Local development files go here.

### Versioning

19. **Semver**: No leading zeros in version segments. `1.24.07` is invalid; `1.24.7` is valid.

20. **Cargo.toml versions**: Must match across all 7 crates.

## Test Counts (v1.24.7)

| Suite | Files/Tests | Status |
|-------|-------------|--------|
| **Vitest** | 239 files / 3,378 tests | 0 failures, 2 todo |
| **Playwright E2E** | 291 pass, 68 skip | 0 failures |
| **Rust goose** | 87 + 29 integration | All passing |
| **Rust goose-server** | 37 + 3 core config + 5 broadcast + 8 GPU | All passing |
| **Rust OTA** | 198 | All passing |
| **Rust autonomous** | 86 | All passing |
| **Rust learning** | 52 | All passing |
| **Rust timewarp** | 8 | All passing |
| **tsc --noEmit** | — | 0 errors |
| **cargo check** | — | 0 warnings |

## Completed Phases

| Phase | Description | Tests |
|-------|-------------|-------|
| 0-1 | Core Wiring (6 AgentCores) | 87/87 |
| 2 | Learning Engine | 52/52 |
| 3 | CoreSelector + Panels + Theme | 22/22 |
| 4 | OTA Self-Build | 198/198 |
| 5 | Autonomous Daemon | 86/86 |
| 6 | Pipeline Viz | 69/69 |
| 7 | 8-Panel Sidebar | 11/11 |
| 8 | sg-* Theme Tokens | — |
| 9 | Docs/CHANGELOG | — |
| 10 | CI/CD | — |
| A | L13 Production Wiring | 263/263 |
| B-E | L13 Self-Improvement Pipeline | 109/109 |
| API | Backend Routes + Frontend Wiring | 42+126 |
| FW | Full Wiring (enterprise, extensions, CLI, studio) | 29+ integration |
| IP | Integration Polish (terminal, guardrails, a11y, tests) | +152 tests |
| SB | Settings Bridge (8 new keys: pricing, CLI×5, sharing×2) | +24 tests |
| AF | 5-Agent Audit + Interface Fix + OTA Visual E2E | +5 E2E, 9 files |
| CR | Crash Recovery + Test Fixes | +188 tests |
| RW | OTA Real Wiring (CiWatcher→gh, uptime, cycle_history) | +4 Rust, +3 E2E |
| FC | OTA Full-Cycle E2E | +4 Vitest, +7 E2E |
| CW | Core Wiring + CI | +7 Vitest, CI job |
| PL | 10-Agent Polish | +11 Vitest, +6 E2E |
| SV | OTA Process Supervisor | +35 Vitest, +4 E2E |
| CC | Core Config Persistence | +7 Vitest, +3 Rust |
| AU | AG-UI Protocol Adoption | +255 Vitest |
| SR | Sidebar Revert | 15 Vitest |
| AW | 10-Agent Wiring | +141 Vitest, +13 Rust |
| S4 | Freeze fix, bundled-extensions, hardcoded URLs | +4 Vitest |
| S6 | 5-audit sweep + fixes | 25 files |
| S7 | 4-agent audit + 20 fixes | 20 files |
| S8 | 5-agent audit + 25 fixes | 33 files, +1 test |
| S9 | 8-agent sweep + deep hardening | 107 files |

## Slash Commands (wired)

```bash
/core <name>                # Switch active core
/cores                      # List available cores
/experience [stats]         # View experience data
/skills                     # List learned skills
/insights                   # View extracted insights
/self-improve [--dry-run|status]  # OTA pipeline control
/autonomous [start|stop|status]    # Daemon control
```

## Documentation Map

| Document | Description |
|----------|-------------|
| **README.md** | Project overview, features, quick start |
| **CHANGELOG.md** | Version history |
| **docs/ARCHITECTURE.md** | Full system architecture with Mermaid diagrams |
| **docs/ARCHITECTURE_AGENTIC_CORES.md** | Deep dive into 6 execution cores |
| **docs/RELEASE_CHECKLIST.md** | Pre-release verification steps |
| **docs/SESSION10-ISSUE-TRACKER.md** | Current issues by severity |
| **docs/SESSION10-ROADMAP.md** | Session 10 roadmap and CJS reference |
| **docs/CONTINUATION_10_AGENTS_MASTER.md** | This document |
| **docs/archive/sessions/** | Historical session notes |

## L13 Self-Improvement

### Current Level: L6.5

**Unique Moat**: Rust self-compilation + OTA binary swap

### L13 Roadmap
See `docs/archive/sessions/l13-action-plan.md` for full details.

1. **L7**: Multi-round task decomposition
2. **L8**: Cross-session memory
3. **L9**: Self-testing and validation
4. **L10**: Multi-agent collaboration
5. **L11**: Meta-learning
6. **L12**: Autonomous goal-setting
7. **L13**: Full self-improvement

### OTA Pipeline Status
- State serialization: Working
- Self-compilation: Working
- Binary swap: Working
- Health checks: Working
- Rollback: Working
- CI integration: Working
- Test execution: Working
- Auto-improve scheduler: Working

## Extension System (3-tier)

### Tier 1: Builtin
5 Rust extensions compiled into binary

### Tier 2: Bundled
30 entries in `bundled-extensions.json`

### Tier 3: Custom
User config.yaml, stdio/streamable_http types

## CI/CD Status

| Workflow | Status |
|----------|--------|
| **ci-main.yml** | GREEN |
| **ci-comprehensive.yml** | GREEN |
| **release.yml** | 12/12 GREEN |
| **docker.yml** | GREEN |
| **docs.yml** | GREEN |

## Branding

- **Name**: Super-Goose (everywhere)
- **GitHub**: Ghenghis/Super-Goose
- **Website**: ghenghis.github.io/Super-Goose
- **Docs**: Docusaurus site

## Next Steps

1. **Fix critical issues** from `docs/SESSION10-ISSUE-TRACKER.md`
2. **FreeformCore dispatcher refactor** — make execute() do real work
3. **StatusBar control migration** — lift state out of ChatInput
4. **Hook handler integration tests** — end-to-end in dispatch flow
5. **OTA cycle real data** — wire frontend to backend API
6. **Plan/Bookmark API fetch** — remove MOCK data

## Session Handoff Checklist

When starting a new session:

- [ ] Read this document
- [ ] Check `docs/SESSION10-ISSUE-TRACKER.md`
- [ ] Run `tsc --noEmit` (should be 0 errors)
- [ ] Run `cargo check --workspace` (should be 0 warnings)
- [ ] Run `npx vitest run` (should be 3,378 pass, 0 fail)
- [ ] Review recent commits with `git log -5 --oneline`
- [ ] Check current branch: `git status`
- [ ] Set LIB environment variable (Windows)
- [ ] Kill zombie processes: `taskkill /F /IM goosed.exe`

## Contact & Resources

- **Repository**: https://github.com/Ghenghis/Super-Goose
- **Documentation**: https://ghenghis.github.io/Super-Goose
- **License**: MIT
- **Original**: https://github.com/block/goose (Block Inc)

---

**Version**: v1.24.7
**Generated**: 2026-02-15
**Maintainer**: Ghenghis Khan
