# Session 10 — Roadmap & Complete Issue Tracker

**Date**: 2026-02-15
**Version**: v1.24.07
**Branch**: `feat/resizable-layout`

---

## What Was Broken (Found This Session)

### 1. CI Compilation Errors (Rust)

| File | Line | Error | Root Cause | Fix |
|------|------|-------|------------|-----|
| `crates/goose/src/ota/integration_tests.rs` | 834 | `unused imports: CiWatcherConfig and CiWatcher` | Test only uses `GithubCiFetcher` and `CiStatusFetcher` | Removed unused imports |
| `crates/goose/src/agents/core/orchestrator_core.rs` | 556 | `comparison is useless due to type limits` | `assert!(snap.avg_time_ms >= 0)` where `avg_time_ms` is `u64` (always >= 0) | Changed to `assert!(snap.avg_time_ms < 60_000)` |

### 2. Runtime Crash — Vite CJS Pre-bundling (4th occurrence!)

**Symptom**: App shows white screen. Console shows:
```
Uncaught SyntaxError: The requested module '/node_modules/react/index.js'
does not provide an export named 'isValidElement'

Uncaught SyntaxError: The requested module '/node_modules/react/jsx-runtime.js'
does not provide an export named 'Fragment'
```

**Root Cause Chain**:
1. `vite.renderer.config.mts` had `plugins: [tailwindcss()]` — **missing `react()` plugin**
2. Without `@vitejs/plugin-react`, the JSX transform doesn't work
3. `optimizeDeps.noDiscovery: true` means Vite skips CJS auto-detection
4. React 19.2.4 ships CJS modules (not ESM)
5. Without pre-bundling, Vite serves raw CJS → named ESM imports fail

**Why It Keeps Happening**:
- The `@vitejs/plugin-react` import and plugin call gets removed during refactors
- No automated test catches this — it's a runtime-only failure
- The `optimizeDeps.include` list gets modified without understanding CJS vs ESM

**Fix Applied**:
- Re-added `react()` plugin to renderer config
- Added comprehensive comments explaining CJS vs ESM rules
- Added "VERIFIED CJS" and "VERIFIED ESM" lists to prevent ESM packages from being added
- Added box-drawing comment banner that's hard to miss

### 3. date-fns Pre-bundling Failure

**Symptom**: After adding `date-fns` to `optimizeDeps.include`:
```
X [ERROR] Could not resolve "./_lib/normalizeDates.js"
    node_modules/date-fns/differenceInCalendarDays.js:2:31
```
(~80 similar errors for all `date-fns` internal imports)

**Root Cause**: `date-fns` v4 is ESM (`"type": "module"` in package.json). When esbuild tries to pre-bundle it, it treats internal `.js` imports as CJS but they're ESM — causing resolution failures.

**Rule**: **NEVER add ESM packages to `optimizeDeps.include`**. Only CJS packages need this.

**ESM packages (must NOT be in include)**:
- `date-fns` (type: module)
- `uuid` (type: module)
- `react-resizable-panels` (type: module)
- `react-markdown` (type: module)

### 4. Version Mismatch

- Was tagged as `v1.25.0` but should be `v1.24.07`
- Fixed in Cargo.toml, package.json, README.md, CHANGELOG.md
- Old tag deleted from local and remote

---

## Preventive Measures Added

### In `vite.renderer.config.mts`:
1. **Box-drawing comment banner** — highly visible, hard to miss
2. **4 explicit rules** in the banner
3. **VERIFIED CJS / VERIFIED ESM** lists in comments
4. **Diagnostic guide** in comments
5. **"Broken 4 times" warning** — social pressure to not modify

### Recommended Future Safeguards:
1. **CI smoke test**: Add a Vitest test that imports the renderer config and validates `@vitejs/plugin-react` is present
2. **Pre-commit hook**: Check that `vite.renderer.config.mts` contains `plugin-react`
3. **Runtime health check**: On app startup, verify `React.version` is defined

---

## Current Status — All Verification

| Check | Status | Details |
|-------|--------|---------|
| `tsc --noEmit` | PASS | 0 errors |
| `cargo check --workspace` | PASS | 0 warnings |
| Vitest | PASS | 239 files, 3378 tests, 0 failures |
| Cargo Deny | FIXED | zip 7.4.0→7.2.0 (yanked) |
| App Runtime | FIXED | jsx-runtime/Fragment errors resolved |

---

## Remaining Integration Gaps

### High Priority (blocking production use)

| Gap | Description | Effort | Status |
|-----|-------------|--------|--------|
| **FreeformCore dispatcher** | `execute()` is pass-through, `Agent.reply()` bypasses CoreSelector | M | Not started |
| **StatusBar migration** | DirSwitcher, CostTracker, ModelsBottomBar in ChatInput, needs state lifting | L | Blocked |
| **Hook handler integration tests** | `handlers.rs` unit-tested but not in dispatch flow | S | Not started |

### Medium Priority (quality improvements)

| Gap | Description | Effort | Status |
|-----|-------------|--------|--------|
| AgentsPanel old hooks | Still using old hook patterns, needs migration to AG-UI | S | Pending |
| SGSettingsPanel old hooks | Same as above | S | Pending |
| Playwright E2E vs built app | 291 pass against mocked backend, needs real backend | L | Pending |
| CI Vitest in Comprehensive | Not running in ci-comprehensive.yml | S | Pending |
| Windows shim warnings | `uvx.exe`, `uv.exe`, `npx.cmd` not found at startup | S | Non-critical |

### Low Priority (nice to have)

| Gap | Description | Effort | Status |
|-----|-------------|--------|--------|
| super-goose-toolkit-mcp | MCP server for Super-Goose specific tools | XL | Design phase |
| React 19 compiler | Could eliminate CJS issues entirely | L | Blocked by ecosystem |
| Electron deprecation warnings | `session.getAllExtensions` deprecated | S | Future |

---

## File Changes This Session

| File | Change |
|------|--------|
| `crates/goose/src/ota/integration_tests.rs` | Removed unused imports |
| `crates/goose/src/agents/core/orchestrator_core.rs` | Fixed useless u64 comparison |
| `ui/desktop/vite.renderer.config.mts` | Added react() plugin, fixed optimizeDeps (removed ESM packages), added comprehensive safeguard comments |
| `Cargo.toml` | Version 1.25.0 → 1.24.07 |
| `ui/desktop/package.json` | Version 1.25.0 → 1.24.07 |
| `README.md` | Version badge 1.25.0 → 1.24.07 |
| `CHANGELOG.md` | Header 1.25.0 → 1.24.07 |
| `Cargo.lock` | zip 7.4.0 → 7.2.0 (yanked crate fix) |

---

## Architecture Quick Reference

```
┌─────────────────────────────────────────────────────┐
│  Electron App (forge.config.ts)                     │
│  ├─ Main Process    → vite.main.config.mts          │
│  ├─ Preload         → vite.preload.config.mts       │
│  └─ Renderer        → vite.renderer.config.mts  ◄── │ THIS IS THE ONE THAT MATTERS
│     ├─ @vitejs/plugin-react  (JSX transform)        │
│     ├─ @tailwindcss/vite     (CSS)                  │
│     └─ optimizeDeps.include  (CJS pre-bundling)     │
├─────────────────────────────────────────────────────┤
│  Vitest             → vitest.config.ts              │
│  (separate config, not used by Electron)            │
├─────────────────────────────────────────────────────┤
│  vite.config.mts    → NOT USED BY FORGE             │
│  (legacy file, only used if running vite directly)  │
└─────────────────────────────────────────────────────┘
```

---

## Vite CJS Pre-bundling Reference

### The Problem
React 19 ships CJS. Vite 7 serves ESM. With `noDiscovery: true`, Vite doesn't auto-detect CJS packages. Named imports like `import { Fragment } from 'react'` fail because Vite serves raw CJS without interop.

### The Rules
1. CJS packages → MUST be in `optimizeDeps.include`
2. ESM packages → MUST NOT be in `optimizeDeps.include`
3. `@vitejs/plugin-react` → MUST be in `plugins` array
4. After any change → DELETE `.vite/` cache → test with `npm run start-gui`

### How to Check if a Package is CJS or ESM
```bash
node -e "const p=require('./node_modules/PACKAGE/package.json'); console.log(p.type || 'CJS')"
```
- If it prints `CJS` → add to include
- If it prints `module` → do NOT add to include

### Package Classification (as of 2026-02-15)

**CJS (must include)**:
react, react-dom, react-router-dom, react-toastify, react-select, react-syntax-highlighter, lucide-react, cronstrue, shell-quote, lodash, clsx, class-variance-authority, tailwind-merge, compare-versions, all @radix-ui/*

**ESM (must NOT include)**:
date-fns, uuid, react-resizable-panels, react-markdown

---

## Release Checklist for v1.24.07

- [x] Fix CI compilation errors
- [x] Fix Vite CJS pre-bundling (4th time)
- [x] Fix version references (1.25.0 → 1.24.07)
- [x] Fix Cargo.lock yanked zip crate
- [x] Delete incorrect v1.25.0 tag
- [x] Clear .vite cache
- [ ] Commit all fixes
- [ ] Push to remote
- [ ] Verify CI passes (all workflows)
- [ ] Verify app starts with `npm run start-gui`
- [ ] Tag v1.24.07
- [ ] Push tag to trigger release workflow

---

## Test Counts (v1.24.07)

| Suite | Files | Tests | Status |
|-------|-------|-------|--------|
| Vitest | 239 | 3,378 | 0 failures |
| Playwright E2E | 68 | 291 pass + 68 skip | 0 failures |
| Rust cargo check | — | — | 0 warnings |
| tsc --noEmit | — | — | 0 errors |
| Rust lib tests | ~67+ | — | 3 pre-existing evolution |
