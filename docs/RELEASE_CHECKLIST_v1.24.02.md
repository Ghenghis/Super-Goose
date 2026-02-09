# Goose v1.24.02 — Release Checklist

**Version:** 1.24.02  
**Date Created:** February 9, 2026  
**Primary Repo:** `G:\goose`  
**Status:** ~90% Release Ready  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Current State Summary](#2-current-state-summary)
3. [Critical Blockers](#3-critical-blockers)
4. [TSC Error Fix List](#4-tsc-error-fix-list)
5. [Build & Packaging Steps](#5-build--packaging-steps)
6. [Testing Checklist](#6-testing-checklist)
7. [Pre-Release Validation](#7-pre-release-validation)
8. [Environment Quirks & Workarounds](#8-environment-quirks--workarounds)
9. [Directory Structure Reference](#9-directory-structure-reference)
10. [Do NOT Do (Anti-Patterns)](#10-do-not-do-anti-patterns)
11. [Rollback Instructions](#11-rollback-instructions)

---

## 1. Project Overview

Goose is a sophisticated enterprise AI agent framework with:
- **Rust backend** (`goosed`) — multi-agent orchestration, MCP protocol
- **Electron desktop app** — React 19, TypeScript 5.9, Vite 7, Electron 40
- **Chat Coding Integration** — swarm dashboard, compaction indicator, batch progress, agent communication panels

### What's New in v1.24.02

- 55+ chat_coding UI components integrated (SwarmOverview, SwarmProgress, CompactionIndicator, BatchProgressPanel, TaskCardGroup, SkillCard, AgentCommunication, BatchProgress)
- Enterprise settings panels (Guardrails, Hooks, Policies)
- Full useContextManagement hook wired to real token tracking
- BaseChat.tsx deep JSX integration with memoized data pipelines
- CI workflow cleanup (broken SonarQube/nightly removed)

---

## 2. Current State Summary

### What's Complete ✅

| Component | Status | Details |
|-----------|--------|---------|
| Chat Coding files (55+) | ✅ Merged | From worktrees into `G:\goose` |
| BaseChat.tsx integration | ✅ Done | Swarm dashboard + compaction indicator JSX |
| Enterprise panels | ✅ Type-fixed | GuardrailsPanel, HooksPanel, PoliciesPanel |
| Stub replacements | ✅ All replaced | useContextManagement, personalities, FeatureHighlights |
| Type shims | ✅ Created | mermaid.d.ts, @types/react-syntax-highlighter installed |
| CI workflows | ✅ Cleaned | sonarqube.yml deleted, nightly.yml disabled |
| Rust backend binary | ✅ Pre-built | `goosed.exe` (179MB) at `ui/desktop/src/bin/goosed.exe` |
| Version bump | ✅ Done | package.json set to `1.24.02` |

### What Needs Work ⚠️

| Item | Priority | Estimated Time |
|------|----------|---------------|
| Fix react-router-dom errors (27) | HIGH | 30 min |
| Fix implicit `any` types (~60) | MEDIUM | 1-2 hours |
| Install missing type packages | MEDIUM | 15 min |
| Rebuild Windows installer | HIGH | 15-30 min |
| Smoke test app launch | HIGH | 15 min |
| Run test suite | MEDIUM | 30 min |

---

## 3. Critical Blockers

### Blocker 1: react-router-dom Version Mismatch (27 errors)

**Problem:** The codebase uses `useNavigate`, `useSearchParams`, `Outlet` from react-router-dom v6, but the installed version or types may be v5.

**Files affected (27 errors):**
- `src/App.tsx` — 27 errors (Routes, Route, Navigate, useNavigate, BrowserRouter, Outlet, useSearchParams)
- `src/components/BaseChat.tsx` — useNavigate
- `src/components/GooseSidebar/AppSidebar.tsx` — useNavigate, useSearchParams
- `src/components/Layout/AppLayout.tsx` — Outlet, useNavigate
- `src/components/ProviderGuard.tsx` — useNavigate
- `src/components/sessions/SessionsInsights.tsx` — useNavigate
- `src/hooks/useNavigation.ts` — useNavigate

**Fix:**
```bash
cd G:\goose\ui\desktop

# Check current version
npm ls react-router-dom

# If v5, upgrade to v6:
npm install react-router-dom@6
npm install -D @types/react-router-dom@5   # Remove if exists
# OR ensure @types/react-router-dom matches installed version
```

If the package IS v6 but types are wrong, the fix is:
```bash
npm uninstall @types/react-router-dom
# v6 ships its own types, no @types package needed
```

### Blocker 2: Windows Installer Build Environment

**Problem:** `npm run make` calls `electron-forge make` which doesn't resolve because `electron-forge` isn't on system PATH.

**Fix:** Use the local binary directly:
```bash
cd G:\goose\ui\desktop

# Use local electron-forge directly:
node_modules\.bin\electron-forge.cmd make --platform=win32 --arch=x64

# OR fix npm script to use npx:
# Edit package.json "make" script to: "npx electron-forge make"
```

**WARNING:** Do NOT use `npx electron-forge make` — the global npx cache has a stale old version of electron-forge that requires `electron-prebuilt-compile` (deprecated).

---

## 4. TSC Error Fix List

### Overview: 260 Total Errors

| Category | Count | Blocks Build? | Action |
|----------|-------|--------------|--------|
| Electron/preload module types | 99 | ❌ No | Ignore — Forge injects at build time |
| Test files (vitest/testing-library) | 40 | ❌ No | Ignore — vitest config handles these |
| react-router-dom v5/v6 mismatch | 27 | ⚠️ Maybe | **FIX** — see Blocker 1 |
| Implicit `any` (TS7006/TS7031) | ~60 | ❌ No | Fix for code quality |
| Missing type declarations | ~15 | ❌ No | Install @types packages |
| Our integrated chat_coding files | 0 | ✅ Clean | Nothing to do |

### Priority 1: react-router-dom (27 errors)

See [Blocker 1](#blocker-1-react-router-dom-version-mismatch-27-errors) above.

### Priority 2: Missing Type Declarations (15 errors)

```bash
cd G:\goose\ui\desktop

# Install missing type packages:
npm install -D @types/lodash           # for lodash/kebabCase
# remark-math — create a shim:
```

Create `src/types/remark-math.d.ts`:
```typescript
declare module 'remark-math' {
  import { Plugin } from 'unified';
  const remarkMath: Plugin;
  export default remarkMath;
}
```

For SVG/PNG import errors, create `src/types/assets.d.ts`:
```typescript
declare module '*.svg' {
  const content: string;
  export default content;
}
declare module '*.png' {
  const content: string;
  export default content;
}
```

### Priority 3: Implicit `any` Types (~60 errors)

These are all `TS7006: Parameter 'x' implicitly has an 'any' type` or `TS7031: Binding element 'x' implicitly has an 'any' type`. They don't block the Vite/esbuild build but should be fixed for code quality.

**Files with implicit `any` errors (non-test, non-Electron):**

| File | Error Count | Parameters to Type |
|------|-------------|-------------------|
| `src/components/recipes/ImportRecipeForm.tsx` | 6 | `field`, `state`, `values`, `canSubmit`, `isSubmitting`, `value` |
| `src/utils/recipeHash.ts` | 4 | `_event`, `recipe` (×2 each) |
| `src/components/settings/providers/modal/subcomponents/ProviderLogo.tsx` | 10 | Multiple provider-related params |
| `src/utils/autoUpdater.ts` | 5 | Update-related params |
| `src/components/recipes/CreateEditRecipeModal.tsx` | 2 | `opt`, `param` |
| `src/components/recipes/CreateRecipeFromSessionModal.tsx` | 1 | `value` binding |
| `src/components/ui/RecipeWarningModal.tsx` | 2 | Modal-related params |

**Fix pattern for each:**
```typescript
// Before (error):
const handler = (event, data) => { ... }

// After (fixed):
const handler = (event: Event, data: SomeType) => { ... }
```

### Priority 4: Electron-Only Errors (99 errors — DO NOT FIX)

These are in `src/main.ts` (93), `src/preload.ts` (3), `src/goosed.ts` (3). They're all:
- `Cannot find module 'electron'`
- `Cannot find module 'electron-squirrel-startup'`
- `Cannot find module 'electron-devtools-installer'`

**These are NORMAL.** The `tsc --noEmit` command runs against the renderer tsconfig which doesn't include Electron types. Electron Forge handles this during the actual build process. **Do not attempt to fix these.**

### Priority 5: Test File Errors (40 errors — LOW PRIORITY)

All test files fail with:
- `Cannot find module 'vitest'`
- `Cannot find module '@testing-library/react'`

**These resolve when running through vitest** which has its own tsconfig. They're only errors in the main `tsc` check. To fix for strict TSC:
```bash
# Ensure vitest types are in tsconfig.json:
# "types": ["vitest/globals", "@testing-library/jest-dom"]
```

---

## 5. Build & Packaging Steps

### Step 1: Fix Critical TSC Errors

```bash
cd G:\goose\ui\desktop

# Fix react-router-dom (see Blocker 1)
npm ls react-router-dom
# Then either upgrade or fix types

# Verify fix worked:
npx tsc --noEmit 2>&1 | Select-String "react-router-dom" | Measure-Object
# Should be 0
```

### Step 2: Build the Renderer (Vite)

The Electron Forge build includes Vite compilation. To test just the Vite part:
```bash
cd G:\goose\ui\desktop

# Vite build (renderer only):
npx vite build
# This should succeed even with TSC errors because esbuild ignores types
```

### Step 3: Package the Electron App

```bash
cd G:\goose\ui\desktop

# Ensure goosed.exe is in the right place:
dir src\bin\goosed.exe
# Should show 179MB file

# Package (creates unpacked app):
node_modules\.bin\electron-forge.cmd package --platform=win32 --arch=x64

# Output: out\Goose-win32-x64\Goose.exe
```

### Step 4: Create Windows Installer

```bash
cd G:\goose\ui\desktop

# Build installer:
node_modules\.bin\electron-forge.cmd make --platform=win32 --arch=x64

# Output: out\make\zip\win32\x64\goose-app-1.24.02-win32-x64.zip
# OR: out\make\squirrel.windows\x64\GooseSetup.exe (if Squirrel maker configured)
```

### Step 5: Verify Build Output

```bash
# Check output exists:
dir out\Goose-win32-x64\Goose.exe
dir out\make\

# Verify version:
# Launch Goose.exe and check About/Settings for v1.24.02
```

---

## 6. Testing Checklist

### Unit Tests

```bash
cd G:\goose\ui\desktop

# Run all tests:
npx vitest run

# Run specific test suite:
npx vitest run src/components/chat_coding/__tests__/chat-coding.test.tsx

# Expected: 298 tests (some may fail due to new components needing test updates)
```

### Manual Smoke Tests

- [ ] App launches without crash
- [ ] Chat input accepts and sends messages
- [ ] Messages render with markdown formatting
- [ ] Tool call results display correctly
- [ ] Swarm dashboard appears when multi-agent tools are used
- [ ] Compaction indicator shows during context compaction
- [ ] Batch progress panel shows during batch operations
- [ ] Settings panels open (General, Enterprise, Extensions)
- [ ] Enterprise panels (Guardrails, Hooks, Policies) render without errors
- [ ] Context summary view shows token usage
- [ ] Error boundaries catch and display component errors gracefully

### Integration Tests

```bash
cd G:\goose\ui\desktop

# E2E tests (requires app running):
npx playwright test

# Specific E2E test:
npx playwright test --grep "chat"
```

---

## 7. Pre-Release Validation

### Final Checklist

- [ ] `package.json` version is `1.24.02`
- [ ] All critical TSC errors fixed (react-router-dom)
- [ ] `npx vite build` succeeds (renderer compiles)
- [ ] `electron-forge package` succeeds (app packages)
- [ ] `electron-forge make` succeeds (installer created)
- [ ] App launches and basic chat works
- [ ] No console errors on startup
- [ ] Swarm/compaction/batch panels render (even if empty)
- [ ] Error boundaries don't trigger on normal usage
- [ ] `goosed.exe` binary present in `src/bin/`
- [ ] Version shown in app matches `1.24.02`
- [ ] No broken CI workflows (sonarqube deleted, nightly disabled)
- [ ] Git status is clean (all changes committed)

### Release Artifacts

After successful build, the following should exist:

```
G:\goose\ui\desktop\out\
├── Goose-win32-x64\           # Unpacked app
│   ├── Goose.exe              # Main executable (~204MB)
│   └── resources\
│       └── bin\
│           └── goosed.exe     # Rust backend (~179MB)
└── make\
    └── zip\win32\x64\
        └── goose-app-1.24.02-win32-x64.zip   # Distributable
```

---

## 8. Environment Quirks & Workarounds

### No Rust Toolchain

Rust (`cargo`) is not installed on this machine. The `goosed.exe` binary was pre-built and exists at:
- `G:\goose\build-output\goose-portable-windows-x64\goosed.exe` (179MB)
- `G:\goose\ui\desktop\src\bin\goosed.exe` (179MB, copy used by Electron)

If you need to rebuild Rust:
```bash
# Install Rust:
# https://rustup.rs/

# Build goosed:
cd G:\goose
cargo build --release -p goose-server
# Output: target\release\goosed.exe
# Copy to: ui\desktop\src\bin\goosed.exe
```

### npx Global Cache Issue

The global npx cache has a stale `electron-forge` (old version that requires `electron-prebuilt-compile`). **Always use the local binary:**

```bash
# CORRECT:
node_modules\.bin\electron-forge.cmd make

# WRONG (uses stale global cache):
npx electron-forge make
```

To fix the global cache permanently:
```bash
npx --package=@electron-forge/cli electron-forge make
# OR clear npx cache:
# rm -rf %LOCALAPPDATA%\npm-cache\_npx
```

### tsc Not on PATH

`tsc` binary isn't directly available. Use:
```bash
# Works:
npx tsc --noEmit

# Also works:
& "C:\Program Files\nodejs\npx.cmd" tsc --noEmit
```

### Electron Type Errors in TSC

Running `npx tsc --noEmit` shows ~99 errors about missing `electron` module. These are **expected** — the renderer tsconfig doesn't include Electron types. Electron Forge's build pipeline handles this. **Do not add `electron` to renderer dependencies to "fix" this.**

---

## 9. Directory Structure Reference

### Primary Workspace (ALL work goes here)

```
G:\goose\                          # Main project root
├── ui\desktop\                    # Electron desktop app
│   ├── src\
│   │   ├── components\
│   │   │   ├── BaseChat.tsx       # Main chat component (integrated)
│   │   │   ├── GooseMessage.tsx   # Message rendering (integrated)
│   │   │   ├── MarkdownContent.tsx # Markdown renderer (integrated)
│   │   │   ├── chat_coding\       # NEW: 55+ integrated components
│   │   │   │   ├── index.ts       # Barrel export
│   │   │   │   ├── SwarmOverview.tsx
│   │   │   │   ├── SwarmProgress.tsx
│   │   │   │   ├── CompactionIndicator.tsx
│   │   │   │   ├── BatchProgressPanel.tsx
│   │   │   │   ├── TaskCardGroup.tsx
│   │   │   │   ├── SkillCard.tsx
│   │   │   │   ├── AgentCommunication.tsx
│   │   │   │   ├── BatchProgress.tsx
│   │   │   │   ├── ChatCodingErrorBoundary.tsx
│   │   │   │   └── ... (40+ more)
│   │   │   └── settings\enterprise\ # Type-fixed panels
│   │   ├── hooks\
│   │   │   ├── useContextManagement.ts  # Fully implemented
│   │   │   ├── useChatStream.ts
│   │   │   └── useTts.ts               # Type-fixed
│   │   ├── config\
│   │   │   └── personalities.ts         # Fully implemented
│   │   ├── types\
│   │   │   └── mermaid.d.ts             # Type shim
│   │   └── bin\
│   │       └── goosed.exe               # Rust backend binary (179MB)
│   ├── package.json                     # v1.24.02
│   ├── out\                             # Build output
│   └── node_modules\
├── crates\                        # Rust backend source
├── docs\
│   └── RELEASE_CHECKLIST_v1.24.02.md  # THIS FILE
├── build-output\                  # Pre-built binaries
└── .github\workflows\             # CI (cleaned up)
```

### Reference Only (DO NOT EDIT)

```
C:\Users\Admin\.claude-worktrees\goose\   # Claude Code's worktrees
├── friendly-shannon\                      # Worktree branch (already harvested)
└── ...                                    # Other branches

# Everything useful from these has already been merged into G:\goose.
# These can be safely deleted to reclaim disk space.
```

### Separate Project (NOT part of this release)

```
G:\goose\external\conscious\                      # Separate project, not mixed with Goose
```

---

## 10. Do NOT Do (Anti-Patterns)

| Anti-Pattern | Why |
|-------------|-----|
| ❌ Edit files in `C:\Users\Admin\.claude-worktrees\` | These are read-only references; all work goes in `G:\goose` |
| ❌ Use `npx electron-forge make` | Global cache has stale version; use local `node_modules\.bin\electron-forge.cmd` |
| ❌ Try to fix Electron module errors in `src/main.ts` | These are normal TSC artifacts; Forge handles them |
| ❌ Add `electron` to renderer dependencies | Would break the build; Electron is a devDependency only |
| ❌ Delete `src/bin/goosed.exe` | Required for the Electron app to function; no Rust toolchain to rebuild |
| ❌ Run `cargo build` without installing Rust first | Rust is not installed on this machine |
| ❌ Edit `openapi.json` manually | Always regenerate with `just generate-openapi` |
| ❌ Commit with `--no-verify` | Bypasses quality hooks |
| ❌ Mix `G:\goose\external\conscious` files into `G:\goose` | Separate projects |

---

## 11. Rollback Instructions

### If Build Fails

The previous working build from Feb 6 exists at:
```
G:\goose\ui\desktop\out\Goose-win32-x64\Goose.exe    (204MB, Feb 6 2026)
G:\goose\ui\desktop\out\Goose-win32-x64\resources\bin\goosed.exe  (179MB)
```

### If Code Changes Break Something

```bash
cd G:\goose

# See what changed:
git status
git diff --stat

# Revert specific file:
git checkout -- ui/desktop/src/components/BaseChat.tsx

# Revert all uncommitted changes:
git checkout -- .

# Revert to last commit:
git reset --hard HEAD
```

### If node_modules Are Corrupted

```bash
cd G:\goose\ui\desktop
rm -rf node_modules
rm package-lock.json
npm install
```

---

## Summary: Time to Release

| Task | Priority | Time | Status |
|------|----------|------|--------|
| Fix react-router-dom types | HIGH | 30 min | TODO |
| Create asset type shims (SVG/PNG) | MEDIUM | 10 min | TODO |
| Create remark-math type shim | MEDIUM | 5 min | TODO |
| Fix implicit `any` in 7 files | MEDIUM | 1-2 hr | TODO |
| Rebuild Windows installer | HIGH | 15-30 min | TODO |
| Smoke test app launch | HIGH | 15 min | TODO |
| Run test suite & fix failures | LOW | 1-2 hr | TODO |
| **Total estimated** | | **3-5 hours** | |

**Current State: ~90% release ready.** The codebase compiles (esbuild/Vite ignores type errors), the Rust backend exists, and a previous Windows build succeeded. The remaining work is type cleanup, rebuild, and validation.
