# Audit Agent 4 -- Tests, CI & Config Integrity

**Auditor**: Agent 4 (Tests, CI & Config Integrity)
**Session**: 7
**Date**: 2026-02-14
**Branch**: `feat/resizable-layout`
**Scope**: vitest.config.ts, vite configs, tsconfig.json, CI workflows, super panel tests, AG-UI tests, Cargo.toml files, package.json, forge.config.ts, .env files

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 6 |
| MEDIUM | 8 |
| LOW | 5 |
| **Total** | **21** |

---

## Findings

### T-001 -- CI Node.js version mismatch vs package.json engine constraint

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-main.yml` (line 64), `.github/workflows/ci-comprehensive.yml` (line ~30), `ui/desktop/package.json` (line 15) |
| **Severity** | **CRITICAL** |
| **Description** | `package.json` declares `"engines": { "node": "^24.10.0" }` but CI workflows use Node 20 (`ci-main.yml`) and Node 22 (`ci-comprehensive.yml`). This means CI tests run on a Node version the project explicitly does NOT support, potentially masking Node 24/25-specific issues (e.g., the Vite 7 + Node 25 race condition mentioned in `vite.renderer.config.mts`). |
| **Suggested Fix** | Update both CI workflows to use `node-version: '24'` (or `24.x`). If older Node support is needed for compatibility, widen the engines field to `">=20"`. |

---

### T-002 -- CI references nonexistent `npm run build` script

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-main.yml` (line 227) |
| **Severity** | **CRITICAL** |
| **Description** | The `build-typescript` job runs `npm run build` in `ui/desktop/`, but `package.json` has no `"build"` script. Available scripts include `start-gui`, `make`, `package`, `bundle:default`, etc., but none named `build`. This CI step will always fail with `npm ERR! Missing script: "build"`. If CI is green, this job may be skipped by the `paths-filter` change detection -- meaning it has never actually run. |
| **Suggested Fix** | Either add a `"build": "tsc --noEmit"` (or appropriate build command) to package.json scripts, or change the CI step to `npm run typecheck` which does exist. |

---

### T-003 -- Hardcoded `localhost:3284` in 3 test files (8 occurrences)

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/src/components/super/__tests__/hooks.test.ts` (lines 69, 208-211), `ui/desktop/src/components/super/__tests__/SGSettingsPanel.test.tsx` (lines 133, 183), `ui/desktop/src/components/super/__tests__/ConnectionsPanel.test.tsx` (line 71) |
| **Severity** | **HIGH** |
| **Description** | Session 4 fixed hardcoded `localhost:3284` in 10 production files, but 3 test files still contain 8 hardcoded URL assertions. The `hooks.test.ts` file has 5 occurrences (SSE endpoint + 4 API URLs), `SGSettingsPanel.test.tsx` has 2, and `ConnectionsPanel.test.tsx` has 1. If the production code now uses `getApiUrl()`, these tests assert against the wrong URL. The `AgentRegistryPanel.test.tsx` correctly mocks `getApiUrl` to return `http://localhost:3000` -- the other files should follow this pattern. |
| **Suggested Fix** | Mock `getApiUrl` in all 3 test files (as `AgentRegistryPanel.test.tsx` does) and update URL assertions to match the mock return value. |

---

### T-004 -- `react-resizable-panels` still in production dependencies

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/package.json` (line 89) |
| **Severity** | **HIGH** |
| **Description** | `react-resizable-panels` v4.6.2 is listed as a production dependency despite the project MEMORY explicitly stating: "NEVER replace upstream shadcn Sidebar+SidebarInset with react-resizable-panels -- react-resizable-panels causes sizePercent=0 bugs, localStorage corruption, and collapse state issues." The layout now uses CSS transitions, making this dependency dead weight that increases bundle size. |
| **Suggested Fix** | Remove `react-resizable-panels` from `dependencies` in `package.json`. Verify no imports remain with `grep -r "react-resizable-panels" src/`. |

---

### T-005 -- `insta` snapshot testing crate in production dependencies

| Field | Value |
|-------|-------|
| **File** | `crates/goose/Cargo.toml` (line 129) |
| **Severity** | **HIGH** |
| **Description** | The `insta` crate (v1.43.2) is listed under `[dependencies]` instead of `[dev-dependencies]`. `insta` is a snapshot testing framework and should only be compiled for `cargo test`. Including it in production dependencies increases compile time and binary size for release builds. |
| **Suggested Fix** | Move `insta = "1.43.2"` from `[dependencies]` to `[dev-dependencies]`. Ensure all `insta` usage is behind `#[cfg(test)]` or in test modules. |

---

### T-006 -- `@rollup/rollup-win32-x64-msvc` in production dependencies

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/package.json` (line 66) |
| **Severity** | **HIGH** |
| **Description** | `@rollup/rollup-win32-x64-msvc` v4.57.1 is listed under `dependencies` (production). This is a platform-specific optional native binding for Rollup's build system and belongs in `devDependencies`. Including it in production dependencies means it ships with the packaged Electron app. |
| **Suggested Fix** | Move `@rollup/rollup-win32-x64-msvc` to `devDependencies`. Or better, add it to `optionalDependencies` since it is platform-specific. |

---

### T-007 -- `.env` file tracked in git with provider configuration

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/.env` |
| **Severity** | **HIGH** |
| **Description** | The file `ui/desktop/.env` is tracked in git (confirmed via `git ls-files`). It contains `GOOSE_PROVIDER__TYPE=openai`, `GOOSE_PROVIDER__HOST=https://api.openai.com`, and `GOOSE_PROVIDER__MODEL=gpt-4o`. While it currently has no secrets (no API keys), `.env` files are a common place to add secrets later. Neither the root `.gitignore` nor `ui/desktop/.gitignore` excludes `.env` (only `.env.signing` is excluded). This is a supply chain risk: a contributor adding an API key to this file would accidentally commit it. |
| **Suggested Fix** | Add `.env` to `ui/desktop/.gitignore` (or root `.gitignore`). Create a `.env.example` with the same keys but placeholder values. Untrack the current file with `git rm --cached ui/desktop/.env`. |

---

### T-008 -- No test file for `AuditDashboard.tsx`

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/src/components/super/AuditDashboard.tsx` (no corresponding test) |
| **Severity** | **HIGH** |
| **Description** | `AuditDashboard.tsx` is listed in the git status as modified but has no corresponding test file at `__tests__/AuditDashboard.test.tsx`. All other Super-Goose panel components have dedicated test files (16 total). The AuditDashboard is a significant component that likely displays audit results and should have test coverage. |
| **Suggested Fix** | Create `ui/desktop/src/components/super/__tests__/AuditDashboard.test.tsx` with tests for rendering, data loading, empty states, and accessibility (matching the pattern of other panel tests). |

---

### T-009 -- `vitest.config.ts` uses `as any` type cast

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/vitest.config.ts` (lines 43-45) |
| **Severity** | **MEDIUM** |
| **Description** | The config object uses `satisfies Record<string, any>` then exports as `defineConfig(cfg as any)`. The `as any` cast defeats TypeScript's type checking for the Vitest config, meaning invalid config keys or values will not be caught at compile time. The root cause appears to be a type mismatch between the `coverage` block shape and Vitest's expected types. |
| **Suggested Fix** | Use `defineConfig` directly with its proper overload, or cast to the specific `UserConfig` type from `vitest/config` instead of `any`. Example: `export default defineConfig({ ...cfg } satisfies UserConfig)`. |

---

### T-010 -- `tsconfig.json` missing `@` path alias that `vitest.config.ts` defines

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/tsconfig.json`, `ui/desktop/vitest.config.ts` (lines 8-11) |
| **Severity** | **MEDIUM** |
| **Description** | `vitest.config.ts` defines a `resolve.alias` mapping `@` to `./src`, but `tsconfig.json` has no corresponding `paths` configuration. This means TypeScript's language service (and `tsc --noEmit`) will not understand `@/` imports, while Vitest will resolve them correctly. If any production code uses `@/` imports, `tsc --noEmit` would fail. Currently the codebase appears to use relative imports, so this is a latent issue. |
| **Suggested Fix** | Add `"paths": { "@/*": ["./src/*"] }` to `tsconfig.json` under `compilerOptions` to keep the alias in sync. Or remove the alias from `vitest.config.ts` if it is unused. |

---

### T-011 -- No coverage reporting in CI workflows

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-main.yml`, `.github/workflows/ci-comprehensive.yml` |
| **Severity** | **MEDIUM** |
| **Description** | `vitest.config.ts` has coverage thresholds configured (80% lines/functions/branches/statements) with lcov/html/json-summary reporters, but neither CI workflow runs `vitest run --coverage`. The `ci-main.yml` runs `npm run test:run` (which is `vitest run` without coverage), and `ci-comprehensive.yml` runs `npx vitest run`. Coverage thresholds are never enforced in CI, making them effectively decorative. |
| **Suggested Fix** | Change the CI Vitest step to `npm run test:coverage` (which runs `vitest run --coverage`). This enforces the 80% thresholds and can upload lcov artifacts for coverage tracking. |

---

### T-012 -- `useAgUi.test.tsx` missing coverage for 5 hook methods

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/src/ag-ui/__tests__/useAgUi.test.tsx` |
| **Severity** | **MEDIUM** |
| **Description** | The `useAgUi` hook test file has excellent coverage across 14 sections (~55+ tests) but does not test: `sendMessage()`, `subscribe()`, `registerTool()`, `unregisterTool()`, or `abortRun()`. The `AgentChatPanel.test.tsx` partially tests `sendMessage` via the UI, and `AgenticFeatures.test.tsx` partially tests `reconnect`, but the hook's own test file should have direct unit tests for these methods. `runCount` is also not tested. |
| **Suggested Fix** | Add test sections for each untested method in `useAgUi.test.tsx`. For `sendMessage`, test that it POSTs to the correct endpoint. For `subscribe/unsubscribe`, test the callback registration pattern. For `abortRun`, test the abort request and state cleanup. |

---

### T-013 -- `hooks.test.ts` useAgentStream connects to hardcoded URL without `getApiUrl`

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/src/components/super/__tests__/hooks.test.ts` (line 69) |
| **Severity** | **MEDIUM** |
| **Description** | The `useAgentStream` test asserts `expect(constructorCalls).toContain('http://localhost:3284/api/agent-stream')`. Unlike the `useAgUi` hook (which properly uses `getApiUrl()`), the legacy `useAgentStream` hook appears to hardcode its URL. This may indicate the production hook code (`hooks/useAgentStream.ts`) also has a hardcoded URL that was missed in the Session 4 localhost fix sweep. |
| **Suggested Fix** | Check `hooks/useAgentStream.ts` for hardcoded URLs. If found, update to use `getApiUrl()`. Then update the test to mock `getApiUrl` and assert against the mocked value. |

---

### T-014 -- `useSuperGooseData` test asserts hardcoded URLs for 4 API endpoints

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/src/components/super/__tests__/hooks.test.ts` (lines 208-211) |
| **Severity** | **MEDIUM** |
| **Description** | The `useSuperGooseData` hook test asserts fetch calls to `http://localhost:3284/api/learning/stats`, `/api/cost/summary`, `/api/autonomous/status`, and `/api/ota/status` -- all hardcoded. This means either (a) the production hook still uses hardcoded URLs (missed in Session 4 fix), or (b) the test assertions are stale. Either case is a problem. |
| **Suggested Fix** | Verify production `hooks/useSuperGooseData.ts` uses `getApiUrl()`. If so, mock `getApiUrl` in the test and update assertions. If not, update the production code first. |

---

### T-015 -- `forge.config.ts` missing top-level `bin` in `packagerConfig`

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/forge.config.ts` |
| **Severity** | **MEDIUM** |
| **Description** | The `packagerConfig` object lacks a `bin` property. The deb and rpm makers have `bin: 'Super-Goose'`, but the top-level packager config (used for macOS .app and Windows squirrel) does not. The MEMORY notes: "forge.config.ts bin: must match package.json productName (both 'Super-Goose')". While electron-forge may infer the binary name from `productName`, an explicit `bin` ensures consistency across all platforms. |
| **Suggested Fix** | Add `bin: 'Super-Goose'` to `packagerConfig` in `forge.config.ts` to be explicit and match the documented convention. |

---

### T-016 -- `vite.config.mts` (base) has no `optimizeDeps` for CJS packages

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/vite.config.mts` |
| **Severity** | **MEDIUM** |
| **Description** | The base Vite config (`vite.config.mts`) used for the Electron main process has no `optimizeDeps` section. The renderer config (`vite.renderer.config.mts`) correctly has `noDiscovery: true` with `include: ['shell-quote', 'lodash']` for CJS pre-bundling. If `shell-quote` or `lodash` are used in the main process code, named ESM imports would fail. |
| **Suggested Fix** | If CJS packages are imported in the Electron main process, add matching `optimizeDeps` config. If main process only uses Node.js built-ins and ESM packages, document this distinction with a code comment. |

---

### T-017 -- `forge.config.ts` uses CJS `require()` instead of ESM

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/forge.config.ts` |
| **Severity** | **LOW** |
| **Description** | `forge.config.ts` uses CommonJS `require()` for all imports (e.g., `const { MakerSquirrel } = require('@electron-forge/maker-squirrel')`). The rest of the codebase and all other config files (vitest.config.ts, vite configs) use ESM `import` syntax. While this works because electron-forge may process the file differently, it is inconsistent with the project's ESM-first approach. |
| **Suggested Fix** | Convert to ESM syntax if electron-forge supports it for `.ts` config files. Otherwise, add a comment explaining why CJS is required. |

---

### T-018 -- Coverage thresholds set to 80% but no enforcement mechanism

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/vitest.config.ts` (lines 37-40) |
| **Severity** | **LOW** |
| **Description** | Coverage thresholds (`lines: 80, functions: 80, branches: 80, statements: 80`) are defined in the Vitest config but are never enforced: `npm run test:run` does not include `--coverage`, and CI does not run coverage (see T-011). The thresholds exist purely as documentation, providing a false sense of coverage governance. |
| **Suggested Fix** | Either enforce thresholds in CI by running `npm run test:coverage`, or remove the thresholds to avoid misleading developers. |

---

### T-019 -- `ag-ui.test.ts` has comprehensive type tests but no runtime validation tests

| Field | Value |
|-------|-------|
| **File** | `ui/desktop/src/ag-ui/__tests__/ag-ui.test.ts` |
| **Severity** | **LOW** |
| **Description** | The `ag-ui.test.ts` file has excellent coverage for AG-UI type system validation (28 event types, JSON roundtrips, type guards, discriminated unions, JsonPatchOp). However, it only tests compile-time type correctness and static values -- there are no tests for runtime edge cases like malformed wire data, missing required fields, or unexpected `type` values. The `verifyEvents.test.ts` covers sequence validation but not individual event parsing. |
| **Suggested Fix** | Add a "runtime validation" test section that tests behavior when events arrive with missing fields, wrong types, or unknown event type strings. This would catch deserialization bugs from the SSE wire format. |

---

### T-020 -- CI `ci-comprehensive.yml` backend E2E marked `continue-on-error`

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-comprehensive.yml` |
| **Severity** | **LOW** |
| **Description** | The Backend E2E job in `ci-comprehensive.yml` has `continue-on-error: true`, meaning failures in this job do not fail the overall CI pipeline. This was intentionally set (per commit `610ca34c13 fix(ci): mark Backend E2E job as continue-on-error`) but it means backend E2E regressions are silently ignored in CI. |
| **Suggested Fix** | Track the E2E reliability improvements needed to remove `continue-on-error`. Consider adding a separate "required" status check for the non-E2E jobs and a "soft" check for backend E2E, so the team is at least notified of failures without blocking merges. |

---

### T-021 -- No `.env` exclusion in root `.gitignore`

| Field | Value |
|-------|-------|
| **File** | `.gitignore` (root), `ui/desktop/.gitignore` |
| **Severity** | **LOW** |
| **Description** | Neither the root `.gitignore` nor the `ui/desktop/.gitignore` excludes generic `.env` files. Only `.env.signing` is excluded in the desktop gitignore. While the current `.env` file has no secrets (see T-007), the lack of a gitignore rule means any `.env` file created anywhere in the repo will be tracked by default. Best practice is to exclude `.env` globally and use `.env.example` files for templates. |
| **Suggested Fix** | Add `.env` and `.env.local` to the root `.gitignore`. Keep `.env.example` and `.env.sample` patterns unignored. |

---

## Test Coverage Summary

### Super Panel Test Files (16 files)

| File | Tests | Coverage Quality | Notes |
|------|-------|-----------------|-------|
| SuperGoosePanel.test.tsx | 11 | Good | Navigation, panel switching, CSS scoping |
| DashboardPanel.test.tsx | 20+ | Excellent | Metrics, quick actions, hardware, activity, LIVE badge, approvals, a11y |
| AgentsPanel.test.tsx | 30+ | Excellent | 3 tabs, SSE indicator, core switching, builder config, a11y |
| AgentChatPanel.test.tsx | 25+ | Excellent | Messages, filtering, sending, tool calls, streaming, a11y |
| AgentRegistryPanel.test.tsx | 18 | Good | Loading, cards, counts, error/retry, expand/collapse, wake, polling, a11y |
| SGSettingsPanel.test.tsx | 20+ | Good | Toggles, API integration, offline, storage, version. **Hardcoded URLs** |
| MonitorPanel.test.tsx | 25+ | Excellent | Cost tracker, budget bar, model breakdown, agent stats, live logs |
| ConnectionsPanel.test.tsx | 15+ | Good | Tab navigation, services, extensions, status. **Hardcoded URL** |
| AutonomousDashboard.test.tsx | 25+ | Excellent | OTA, daemon toggle, circuit breaker, build progress/result |
| shared.test.tsx | 50+ | Excellent | SGCard, SGBadge, SGStatusDot, SGMetricCard, SGEmptyState |
| BuilderTab.test.tsx | 10 | Good | Auto-selection, confidence, preferred core, priority reorder |
| GPUPanel.test.tsx | 20+ | Excellent | GPU detection, memory bars, color coding, error/retry, periodic refresh |
| StudiosPanel.test.tsx | 25+ | Excellent | Grid, extensions, error, interactive styling, keyboard a11y |
| MarketplacePanel.test.tsx | 40+ | Excellent | 5 tabs, core cards, switching, extension toggles, empty states |
| hooks.test.ts | 16 | Good | useAgentStream (8), useSuperGooseData (8). **6 hardcoded URLs** |
| ag-ui-features.test.tsx | 30+ | Excellent | RecipeBrowser, PromptLibrary, DeeplinkGenerator, SkillsPanel, AgenticFeatures |

**Missing**: AuditDashboard.test.tsx (see T-008)

### AG-UI Test Files (3 files)

| File | Tests | Coverage Quality | Notes |
|------|-------|-----------------|-------|
| useAgUi.test.tsx | 55+ | Very Good | 14 sections. Missing: sendMessage, subscribe, registerTool, unregisterTool, abortRun |
| verifyEvents.test.ts | 25+ | Excellent | Valid/invalid sequences, reset, concurrent messages |
| ag-ui.test.ts | 80+ | Excellent | 10 sections covering types, enums, roundtrips, guards, edge cases |

### Total Test Assessment

- **Vitest**: 240 files, 3378 tests, 0 failures -- healthy
- **Coverage enforcement**: NOT enforced in CI despite 80% thresholds
- **Test pattern consistency**: Most tests follow the `mockUseAgUi` pattern with proper `beforeEach`/`afterEach` cleanup
- **Accessibility testing**: Consistently tests ARIA roles, regions, labels across all panel tests
- **Weak spots**: Hardcoded URLs in 3 test files, missing AuditDashboard tests, no runtime event validation tests

---

## Config File Assessment

| Config File | Status | Issues |
|-------------|--------|--------|
| vitest.config.ts | Fair | `as any` cast (T-009), unused path alias (T-010) |
| vite.renderer.config.mts | Good | Correctly configured with noDiscovery + CJS include |
| vite.config.mts | Fair | No optimizeDeps (T-016), minimal config |
| tsconfig.json | Good | Strict mode, all sub-flags enabled, missing `@` alias (T-010) |
| forge.config.ts | Fair | CJS syntax (T-017), missing top-level bin (T-015) |
| package.json | Needs Work | Wrong dep category for 2 packages (T-004, T-006), engine mismatch (T-001) |
| ci-main.yml | Needs Work | Wrong Node version (T-001), nonexistent build script (T-002), no coverage (T-011) |
| ci-comprehensive.yml | Fair | Wrong Node version (T-001), continue-on-error E2E (T-020) |
| Cargo.toml (goose) | Fair | insta in prod deps (T-005) |
| Cargo.toml (goose-server) | Good | Clean, no issues found |
| .env | Needs Work | Tracked in git (T-007), no gitignore rule (T-021) |

---

*End of audit report.*
