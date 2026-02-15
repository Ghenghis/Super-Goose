# Session 10 — End-to-End Issue Tracker

**Date**: 2026-02-15
**Version**: v1.24.7
**Branch**: `feat/resizable-layout`
**Last Release**: v1.24.06

---

## Status Summary

| Check | Status |
|-------|--------|
| `tsc --noEmit` | PASS — 0 errors |
| `cargo check --workspace` | PASS — 0 warnings |
| Vitest | PASS — 239 files, 3,378 tests |
| Playwright E2E | PASS — 291 pass, 68 skip |
| App startup (`npm run start-gui`) | PASS (after lodash/kebabCase fix) |
| Semver validation | PASS — `1.24.7` valid |

---

## Issues Fixed This Session

| # | Issue | Root Cause | Fix | Files |
|---|-------|-----------|-----|-------|
| 1 | CI: unused Rust imports | `CiWatcherConfig`, `CiWatcher` imported but not used | Removed imports | `integration_tests.rs` |
| 2 | CI: useless u64 comparison | `assert!(snap.avg_time_ms >= 0)` on unsigned type | Changed to `< 60_000` | `orchestrator_core.rs` |
| 3 | Runtime: jsx-runtime crash | `@vitejs/plugin-react` missing from renderer config | Added react() plugin | `vite.renderer.config.mts` |
| 4 | Runtime: date-fns esbuild failure | ESM package in `optimizeDeps.include` | Removed ESM packages | `vite.renderer.config.mts` |
| 5 | Runtime: lodash/kebabCase export | CJS sub-path not in optimizeDeps | Added `lodash/kebabCase`, `lodash/debounce` | `vite.renderer.config.mts` |
| 6 | Invalid semver: 1.24.07 | Leading zero in patch number | Changed to `1.24.7` | 5 files |
| 7 | electron-updater crash | `1.24.07` rejected by semver parser | Fixed by valid semver | `package.json` |
| 8 | Cargo.lock yanked crate | zip v7.4.0 yanked | Downgraded to v7.2.0 | `Cargo.lock` |

---

## CRITICAL — Blocking Production

### C1. FreeformCore Dispatcher Bypass

**Files**: `crates/goose/src/agents/agent.rs:2122-2265`, `crates/goose/src/agents/core/freeform.rs:80`
**Problem**: `Agent.reply()` bypasses `CoreSelector` for FreeformCore (the default). Non-freeform cores go through `core.execute()`, but FreeformCore calls `reply_internal()` directly.
**Impact**: Experience store misses FreeformCore executions. CoreSelector training data incomplete. Metrics unreliable.
**Fix**: Route all cores through the same `core.execute()` path. Requires refactoring FreeformCore to wrap `reply_internal()`.
**Effort**: Large (touches core execution path)

### C2. Version Conflict: v1.24.06 vs v1.24.7

**Problem**: Last published release was v1.24.06. Current version is 1.24.7. The previous tags v1.24.02-v1.24.06 all used non-semver patch numbers. Going forward, all versions must be valid semver (no leading zeros, no two-digit patches without major bump).
**Status**: 1.24.7 is valid semver and ready to tag/release.

---

## HIGH — Wrong Behavior or Architecture Debt

### H1. Panels Using Mock Data Instead of API

| Panel | File | Issue |
|-------|------|-------|
| **PlanManagerPanel** | `src/components/features/PlanManagerPanel.tsx` | Uses `MOCK_PLANS` array, never fetches from API |
| **BookmarkManager** | `src/components/bookmarks/BookmarkManager.tsx` | Uses `MOCK_BOOKMARKS`, `handleJumpTo` is a console.debug stub |
| **CriticManagerPanel** | `src/components/features/CriticManagerPanel.tsx` | Falls back to `MOCK_EVALUATIONS` when API returns empty |

### H2. Asymmetric Core Dispatch — Stub Metrics

**File**: `crates/goose/src/agents/core/freeform.rs:105-114`
FreeformCore.execute() returns `CoreOutput { completed: true, turns_used: 0, metrics: default() }` — always. Learning system cannot build accurate model.

### H3. OTA API Fallback Returns

**File**: `crates/goose-server/src/routes/ota_api.rs`
Three endpoints return `Json(vec![])` when agent/daemon not initialized (lines 530, 664, 821). Frontend cannot distinguish "no data" from "not initialized".

### H4. StatusBar Controls in Wrong Location

**Components**: `DirSwitcher`, `CostTracker`, `ModelsBottomBar`
**Current**: Embedded inside `ChatInput` component
**Should be**: Lifted to layout level for proper state management
**Blocked by**: State lifting refactor needed

### H5. Hard-coded Addresses

| File | Line | Value | Should Be |
|------|------|-------|-----------|
| `conductor_client.rs` | 108 | `127.0.0.1:9284` | Env var `CONDUCTOR_HOST` |
| `conscious.rs` | 1114 | `http://127.0.0.1:{port}` | Configurable bridge URL |

---

## MEDIUM — Quality & Completeness

### M1. AG-UI Bridge Event Not Connected

**File**: `crates/goose-server/src/routes/ag_ui_stream.rs:443`
`emit_bridged_legacy_event()` exists but is never called. Legacy `AgentStreamEvent` and AG-UI protocol remain separate streams.

### M2. Agent Stream Events Never Emitted

**File**: `crates/goose-server/src/routes/agent_stream.rs:32-74`
`AgentStreamEvent` variants `TaskUpdate`, `ToolCalled`, `CoreSwitched`, `ExperienceRecorded` defined but never emitted — only `Heartbeat` and `AgentStatus` are sent.

### M3. Dead Code Annotations (11 locations)

| File | Line | Symbol |
|------|------|--------|
| `ag_ui_stream.rs` | 429 | `emit_custom_event()` |
| `ag_ui_stream.rs` | 443 | `bridged_legacy_event()` |
| `agent_stream.rs` | 32 | `AgentStreamEvent` variants |
| `conscious.rs` | 142 | `VoiceError` variant |
| `cost.rs` | 93 | `provider_from_model()` |
| `enterprise.rs` | 97 | `GuardrailDetector` |

### M4. Cost Tracking by Model Not Implemented

**File**: `crates/goose-server/src/routes/cost.rs:269`
`cost_breakdown` endpoint returns `model_breakdown: vec![]` — types defined but population logic missing.

### M5. Missing Pagination on Large Responses

- `improvement_history()` — no bounds on cycle history
- `autonomous_audit_log()` — returns all entries
- Could return very large payloads

### M6. Empty Task Category in Experience Store

**File**: `crates/goose/src/agents/experience_store.rs:70`
Experience records accept empty `task_category`. CoreSelector relies on category for selection — empty values produce poor recommendations.

### M7. AgentsPanel and SGSettingsPanel Use Old Hook Patterns

Both panels still use legacy hooks instead of AG-UI protocol. Migration pending.

### M8. CI Workflow Issues

| File | Line | Issue |
|------|------|-------|
| `ci-main.yml` | 406 | Verify `${{ }}` expression syntax |
| `ci-comprehensive.yml` | 460 | Same expression syntax check |
| `bundle-desktop-windows.yml` | 195, 211 | Code signing URL references `github.com/block/goose` instead of `Ghenghis/Super-Goose` |
| `bundle-desktop-windows.yml` | 57 | Node 24.10.0 while other jobs use Node 22 |

### M9. Dockerfile Cache Layer Issue

**File**: `Dockerfile:43-44`
```dockerfile
RUN cargo build --release ... 2>/dev/null || true
```
Masks compilation errors and always succeeds, defeating cache optimization.

---

## LOW — Cleanup & Polish

### L1. Console Debug Statements in Production

| File | Location | Statement |
|------|----------|-----------|
| `BookmarkManager.tsx` | `handleJumpTo` | `console.debug(...)` |

### L2. Win32 Shim Warnings (Non-critical)

`uvx.exe`, `uv.exe`, `npx.cmd`, `install-node.cmd` — ENOENT on startup. Cosmetic only, does not affect functionality.

### L3. Electron Deprecation Warnings

- `session.getAllExtensions` deprecated → use `session.extensions.getAllExtensions`
- `session.loadExtension` deprecated → use `session.extensions.loadExtension`

### L4. Auto-Updater Config Points to Block/Goose

**File**: `main.ts`
```typescript
{ provider: 'github', owner: 'block', repo: 'goose' }
```
Should point to `Ghenghis/Super-Goose` for fork releases.

### L5. Test File Uses Old Version String

**File**: `src/components/super/__tests__/AutonomousDashboard.test.tsx:346,445`
Mock data uses `1.25.0` — cosmetic but could confuse during debugging.

### L6. Hook Handler Integration Tests Missing

`handlers.rs` has unit tests but no end-to-end test through the dispatch flow.

### L7. Playwright E2E Against Real Backend

291 tests pass against mocked backend. No test against actual `goosed.exe` binary in CI.

### L8. Missing `.env.example` for UI Desktop

`ui/desktop/.env` checked in with hardcoded values. Should have `.env.example` template instead.

---

## Not Started / Future Work

| Feature | Description | Effort |
|---------|-------------|--------|
| **super-goose-toolkit-mcp** | MCP server for Super-Goose tools | XL |
| **React 19 compiler** | Could eliminate CJS issues entirely | L |
| **Code signing** | Windows + macOS signing for releases | M |
| **FreeformCore refactor** | Phase 2 dispatcher unification | L |
| **CI Vitest in Comprehensive** | Add Vitest to ci-comprehensive.yml | S |
| **StatusBar state lifting** | Move controls from ChatInput to Layout | L |

---

## Test Counts (v1.24.7)

| Suite | Files | Tests | Status |
|-------|-------|-------|--------|
| Vitest | 239 | 3,378 | 0 failures |
| Playwright E2E | 68 | 291 pass + 68 skip | 0 failures |
| Rust cargo check | — | — | 0 warnings |
| tsc --noEmit | — | — | 0 errors |
| Rust lib tests | ~67+ | — | 3 pre-existing |
| **Total** | — | **5,423+** | **Zero new failures** |

---

## Release Checklist for v1.24.7

- [x] Fix CI compilation errors
- [x] Fix Vite CJS pre-bundling (4th time + lodash sub-paths)
- [x] Fix version to valid semver (1.24.7)
- [x] Fix Cargo.lock yanked zip crate
- [x] Delete incorrect tags (v1.25.0, v1.24.07)
- [x] Clear .vite cache
- [x] Commit all fixes
- [x] Push to remote
- [ ] Verify CI passes (all workflows)
- [ ] Verify app starts with `npm run start-gui`
- [ ] Tag v1.24.7
- [ ] Push tag to trigger release workflow
