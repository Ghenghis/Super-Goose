# Session 8 Audit 04 — Tests, CI/CD, and Config Files

**Auditor**: Agent 4 of 5
**Date**: 2026-02-14
**Branch**: `feat/resizable-layout`
**Scope**: Test quality, mock correctness, Vite/Vitest config, package.json, CI/CD workflows, Cargo.toml, tsconfig, gitignore

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 7     |
| MEDIUM   | 10    |
| LOW      | 6     |
| **Total** | **25** |

---

## CRITICAL Findings

### T-001: ci-main.yml `build-typescript` runs non-existent `npm run build` script (CRITICAL)
**File**: `.github/workflows/ci-main.yml` (line 228)
**Issue**: The `build-typescript` job runs `npm run build` but `package.json` has no `"build"` script defined. The scripts section includes `"start-gui"`, `"package"`, `"make"`, `"test"`, etc., but no `"build"`. This means the CI build step will fail with `Missing script: "build"` for any TypeScript change.
**Fix**: Either add a build script to package.json or change the CI step to use the correct command:
```yaml
# Option A: Change CI to use typecheck
- name: Build Desktop App
  run: npm run typecheck
  working-directory: ui/desktop

# Option B: Add build script to package.json
# "build": "tsc --noEmit && vite build",
```

### T-002: backendApi.test.ts uses hardcoded `localhost:3284` without mocking getApiUrl (CRITICAL)
**File**: `ui/desktop/src/utils/__tests__/backendApi.test.ts`
**Issue**: This test file hardcodes `http://localhost:3284` in 20+ URL assertions (lines 21, 43, 67, 86, 105, 122, 131, 159, 196, 225, 241, 261, 277, 305, 321, 349, 373, 389, 410, 434, 453, 479, 509, 538, 572, 596, 617, 627, 653). Unlike other test files that mock `getApiUrl`, this test directly assigns `globalThis.fetch = mockFetch` without intercepting `getApiUrl`. If the default API host changes (e.g., to a dynamic port), all 20+ assertions break.
**Fix**: Add getApiUrl mock at the top of the file, matching the pattern used in other test files:
```typescript
vi.mock('../config', () => ({
  getApiUrl: (path: string) => `http://localhost:3000${path}`,
}));
```
Then update all URL assertions from `http://localhost:3284` to `http://localhost:3000`.

---

## HIGH Findings

### T-003: ci-main.yml and ci-comprehensive.yml use different Node.js versions (HIGH)
**File**: `.github/workflows/ci-main.yml`, `.github/workflows/ci-comprehensive.yml`
**Issue**: ci-main.yml uses `node-version: '20'` (lines 116, 217, 309) while ci-comprehensive.yml uses `node-version: '22'` (lines 226, 268, 317). Meanwhile, `package.json` declares `"engines": { "node": "^24.10.0" }`. There is a 3-way mismatch: CI uses Node 20 and 22, but package.json requires Node 24+. This means CI is running tests on a Node version that does not match what developers use locally.
**Fix**: Align all CI workflows to the same Node version. Since the engines field requires `^24.10.0`, CI should use Node 24 (or at minimum a consistent version across both workflows):
```yaml
# In both workflows:
node-version: '24'
```

### T-004: Test-only deps (wiremock, serial_test, test-case) in workspace.dependencies root (HIGH)
**File**: `Cargo.toml` (root, lines 31-33)
**Issue**: `wiremock`, `serial_test`, and `test-case` are listed under `[workspace.dependencies]` at the workspace root. While this is technically valid for sharing versions across crates, these are test-only dependencies. Any crate that uses them in `[dependencies]` (instead of `[dev-dependencies]`) would ship test code in production. Currently all crate uses are correctly in `[dev-dependencies]`, but workspace-level declaration creates a risk of accidental misuse.
**Fix**: This is an informational concern. To be safe, add a comment:
```toml
# Test-only workspace dependencies (must only be used in [dev-dependencies])
wiremock = "0.6"
serial_test = "3.2.0"
test-case = "3.3.1"
```

### T-005: Vitest config has unreachable 80% coverage thresholds (HIGH)
**File**: `ui/desktop/vitest.config.ts` (lines 37-40)
**Issue**: The config sets `lines: 80, functions: 80, branches: 80, statements: 80` coverage thresholds. But no CI job runs `vitest run --coverage` to enforce them, so these thresholds are never checked. They exist as dead config, creating a false sense of security.
**Fix**: Either add a CI step that runs coverage with `--coverage` flag and checks thresholds, or remove the thresholds until a coverage job is added:
```yaml
# In ci-comprehensive.yml, add a coverage job:
- name: Run Vitest with coverage
  run: npx vitest run --coverage
  working-directory: ui/desktop
```

### T-006: `react-resizable-panels` still in production dependencies (HIGH)
**File**: `ui/desktop/package.json` (line 88)
**Issue**: `react-resizable-panels` is in `dependencies` (line 88) and is still imported in `ResizableLayout.tsx`. Per the MEMORY.md architectural notes: "NEVER replace upstream shadcn Sidebar+SidebarInset with react-resizable-panels." The ResizableLayout.tsx file appears to be an alternative layout component that may conflict with the existing sidebar pattern. If it is only used experimentally, the dependency could be moved to devDependencies or removed.
**Fix**: Evaluate whether `ResizableLayout.tsx` is actively used in the production app. If it is an experimental/alternate layout, move `react-resizable-panels` to devDependencies. If the component is dead code, remove both the file and the dependency.

### T-007: `cronstrue` may need `optimizeDeps.include` entry (HIGH)
**File**: `ui/desktop/vite.renderer.config.mts`
**Issue**: `cronstrue` is a CJS-only package (it publishes CommonJS only, no ESM). It is imported as a default import (`import cronstrue from 'cronstrue'`) in 4 files (RecipesView, ScheduleDetailView, CronPicker, SchedulesView). With `optimizeDeps.noDiscovery: true`, CJS packages must be explicitly listed in `optimizeDeps.include`. Only `shell-quote` and `lodash` are currently listed. `cronstrue` will fail at runtime in dev mode with a CJS interop error if not pre-bundled.
**Fix**: Add `cronstrue` to the include list:
```typescript
optimizeDeps: {
  noDiscovery: true,
  include: ['shell-quote', 'lodash', 'cronstrue'],
},
```

### T-008: console.log/warn/error suppressed globally in test setup (HIGH)
**File**: `ui/desktop/src/test/setup.ts` (lines 41-46)
**Issue**: All console methods (`log`, `warn`, `error`) are globally replaced with `vi.fn()` in the test setup file. This silently swallows real errors during tests. A test that logs `console.error("Critical: data corruption")` would pass silently. Debugging test failures becomes extremely difficult because no error output appears.
**Fix**: At minimum, keep `console.error` functional, or use `vi.spyOn` instead of full replacement:
```typescript
// Keep console.error visible for debugging but capture for assertions
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
// Don't suppress errors — they help debugging
// vi.spyOn(console, 'error').mockImplementation(() => {});
```

### T-009: ci-main.yml ci-status logic has dead-code path for mixed changes (HIGH)
**File**: `.github/workflows/ci-main.yml` (lines 379-406)
**Issue**: The status check logic at lines 381-388 has a bug: when BOTH Rust and TypeScript change, if only TypeScript tests succeed but Rust tests are still running (result = "skipped"), the first condition `docs-check == success` is checked first. Since docs-check is "skipped" (not "success"), it falls through to the OR condition. But the OR requires ALL test jobs to be "success" — if one is "skipped" because it was not needed, the whole check fails. The logic should check each test type independently based on whether changes were detected.
**Fix**: Restructure the status check to evaluate each language independently:
```bash
FAILED=0
if [[ "${{ needs.detect-changes.outputs.rust-changed }}" == "true" ]]; then
  if [[ "${{ needs.test-rust-unit.result }}" != "success" ]] || \
     [[ "${{ needs.test-rust-integration.result }}" != "success" ]]; then
    FAILED=1
  fi
fi
if [[ "${{ needs.detect-changes.outputs.typescript-changed }}" == "true" ]]; then
  if [[ "${{ needs.test-typescript.result }}" != "success" ]]; then
    FAILED=1
  fi
fi
```

---

## MEDIUM Findings

### T-010: `.gitignore` missing `coverage/` entry (MEDIUM)
**File**: `ui/desktop/.gitignore`
**Issue**: The vitest config generates coverage reports to `./coverage` directory. While the root `.gitignore` has `ui/desktop/coverage/`, the `ui/desktop/.gitignore` does not have its own `coverage/` entry. If someone runs `git add -A` from the `ui/desktop/` directory, the root ignore should catch it, but having it in the local gitignore is more robust.
**Fix**: Add to `ui/desktop/.gitignore`:
```
coverage/
```

### T-011: `.gitignore` missing `eslint-report.json` entry (MEDIUM)
**File**: `ui/desktop/.gitignore`
**Issue**: The `lint:report` script generates `eslint-report.json` (line 43 of package.json) in the working directory. This file is not gitignored and could be accidentally committed.
**Fix**: Add to `ui/desktop/.gitignore`:
```
eslint-report.json
```

### T-012: `cors` and `dotenv` in production dependencies but may only be used in Electron main process (MEDIUM)
**File**: `ui/desktop/package.json` (lines 70, 73)
**Issue**: `cors` (line 70) and `dotenv` (line 73) are listed under `dependencies`. These are typically server-side packages. In an Electron app, if these are only used in the main process (which bundles separately), they still inflate `node_modules` for the renderer bundle. Their usage should be verified — if they are only needed for the main process dev server, they could be moved to devDependencies.
**Fix**: Audit usage of `cors` and `dotenv` in the codebase. If only used in the main process or build scripts, move to `devDependencies`.

### T-013: `express` in production dependencies (MEDIUM)
**File**: `ui/desktop/package.json` (line 78)
**Issue**: `express` v5.2.1 is listed as a production dependency. Express is a large web framework (~50 transitive deps). In an Electron app, it may be used for a local API proxy in the main process. If it is only used during development, it should be a devDependency.
**Fix**: Verify if `express` is used in the packaged Electron app. If only for development, move to `devDependencies`.

### T-014: `split-type` may need `optimizeDeps.include` entry (MEDIUM)
**File**: `ui/desktop/vite.renderer.config.mts`
**Issue**: `split-type` is imported as a default import (`import SplitType from 'split-type'`) in `use-text-animator.tsx`. It is a CJS package. With `noDiscovery: true`, it may need explicit pre-bundling to work correctly in dev mode.
**Fix**: Test if `split-type` works in dev mode. If not, add to optimizeDeps:
```typescript
include: ['shell-quote', 'lodash', 'cronstrue', 'split-type'],
```

### T-015: Vitest config uses `satisfies Record<string, any>` type workaround (MEDIUM)
**File**: `ui/desktop/vitest.config.ts` (lines 43-45)
**Issue**: The config uses `satisfies Record<string, any>` and then casts to `any` when calling `defineConfig`. This defeats TypeScript's type checking for the vitest config. The proper approach is to use vitest's own `UserConfig` type.
**Fix**:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { ... },
  test: { ... },
})
```

### T-016: Vitest config lacks `@` alias for coverage mapping (MEDIUM)
**File**: `ui/desktop/vitest.config.ts`
**Issue**: The config defines `resolve.alias: { '@': resolve(__dirname, './src') }` for imports, which is good. However, the `coverage.include` uses `src/**/*.{ts,tsx}` while some imports in test files may use `@/` paths. The coverage path mapping should be consistent. Also, the `vite.renderer.config.mts` (the actual renderer config used by Electron Forge) does NOT define the `@` alias, so tests using `@` imports would work in vitest but fail in the actual app build.
**Fix**: Add the `@` alias to `vite.renderer.config.mts` if any source files use `@/` imports, or verify that no source files use `@/` paths (only test files).

### T-017: `tsconfig.node.json` includes `vite.config.mts` but file is named `vite.config.mts` (MEDIUM)
**File**: `ui/desktop/tsconfig.node.json`
**Issue**: The `include` array lists `"vite.config.mts"` but also `"forge.config.ts"`. The `forge.config.ts` uses CommonJS `require()` syntax but the tsconfig has `"module": "ESNext"`. The forge config should either be converted to ESM or excluded from this tsconfig and handled separately.
**Fix**: Since forge.config.ts is CommonJS (uses `require` and `module.exports`), it should have its own tsconfig or be excluded:
```json
"include": [
  "vite.config.mts",
  "vite.main.config.mts",
  "vite.renderer.config.mts",
  "vite.preload.config.mts"
]
```

### T-018: goose-conductor Cargo.toml has no `[dev-dependencies]` section (MEDIUM)
**File**: `crates/goose-conductor/Cargo.toml`
**Issue**: The `goose-conductor` crate has no `[dev-dependencies]` section at all. This means it likely has no unit tests. For a "process supervisor" component, tests are important for reliability.
**Fix**: Add at minimum a basic test dependency and write tests:
```toml
[dev-dependencies]
tokio = { workspace = true }
```

### T-019: `compare-versions` is CJS and may need `optimizeDeps.include` (MEDIUM)
**File**: `ui/desktop/vite.renderer.config.mts`
**Issue**: `compare-versions` is imported in `githubUpdater.ts`. While some versions of this package ship ESM, older versions are CJS-only. With `noDiscovery: true`, if the installed version is CJS, it will fail in dev mode without explicit pre-bundling.
**Fix**: Test in dev mode. If it fails, add to optimizeDeps.include.

---

## LOW Findings

### T-020: `toBeDefined()` used as weak assertion in 817+ locations across 50 test files (LOW)
**File**: Multiple test files (see count above)
**Issue**: `expect(...).toBeDefined()` is used 817 times across 50 test files. This assertion only checks that a value is not `undefined`. It does not verify the value is the correct element, contains the right text, or has the expected properties. For DOM queries, `screen.getByText(...)` already throws if the element is not found, making `expect(screen.getByText('...')).toBeDefined()` a redundant, weaker assertion than `toBeInTheDocument()`.
**Fix**: In a gradual cleanup, replace `toBeDefined()` with more specific assertions:
```typescript
// Before (weak)
expect(screen.getByText('Submit')).toBeDefined();
// After (strong)
expect(screen.getByText('Submit')).toBeInTheDocument();
```

### T-021: `useAgentChat.test.ts` duplicates EventSource mock pattern (LOW)
**File**: `ui/desktop/src/hooks/__tests__/useAgentChat.test.ts`
**Issue**: The EventSource mock implementation is duplicated almost identically between `useAgentChat.test.ts`, the `hooks.test.ts` in the super directory, and `useAgUi.test.tsx`. Each creates its own `MockEventSource` class with identical `onopen/onmessage/onerror/close` patterns. This leads to maintenance burden when the mock needs updating.
**Fix**: Create a shared test helper:
```typescript
// src/test/mocks/MockEventSource.ts
export function createMockEventSource() { ... }
```
Then import in all test files that need EventSource mocking.

### T-022: Root `.gitignore` uses `./ui/desktop/` prefix inconsistently (LOW)
**File**: `.gitignore` (lines 27-28)
**Issue**: Lines 27-28 use `./ui/desktop/node_modules` and `./ui/desktop/out` with a `./` prefix, while all other paths in the same file (lines 58-63, 98, 125-126) use `ui/desktop/` without the `./` prefix. Git treats both forms equivalently, but the inconsistency is confusing.
**Fix**: Remove the `./` prefix for consistency:
```
ui/desktop/node_modules
ui/desktop/out
```

### T-023: `engines` field specifies exact npm version `^11.6.1` (LOW)
**File**: `ui/desktop/package.json` (line 16)
**Issue**: The `engines` field specifies `"npm": "^11.6.1"`. This is overly restrictive. npm 10.x (which ships with Node 22) would fail the engines check. If CI uses Node 20 or 22, their bundled npm versions (10.x or 11.x) may not match.
**Fix**: Relax the npm constraint or remove it:
```json
"engines": {
  "node": "^24.10.0"
}
```

### T-024: `@tailwindcss/line-clamp` is deprecated (LOW)
**File**: `ui/desktop/package.json` (line 126)
**Issue**: `@tailwindcss/line-clamp` v0.4.4 is listed in devDependencies. This plugin has been deprecated since Tailwind CSS v3.3 — the `line-clamp` utility is now built into Tailwind core. With Tailwind v4.1.18 being used, this plugin is entirely unnecessary.
**Fix**: Remove the dependency:
```bash
npm uninstall @tailwindcss/line-clamp
```

### T-025: Only 1 test file is skipped (`OllamaSetup.test.tsx`) (LOW)
**File**: `ui/desktop/src/components/OllamaSetup.test.tsx` (line 147)
**Issue**: There is exactly one `describe.skip` in the entire test suite — in `OllamaSetup.test.tsx`. While only 1 skipped describe is very clean, the skip has persisted across multiple sessions. It should either be fixed or removed with a tracking issue.
**Fix**: Review the skipped test block and either fix the conditions causing it to be skipped or remove it with a TODO comment linking to a tracking issue.

---

## Statistics

| Metric | Value |
|--------|-------|
| Test files audited | 240+ |
| CI workflow files | 37 total, 2 primary (ci-main, ci-comprehensive) |
| Cargo.toml files | 8 crates + 1 workspace root |
| Config files | vite.config.mts, vite.renderer.config.mts, vite.main.config.mts, vite.preload.config.mts, vitest.config.ts, tsconfig.json, tsconfig.node.json, forge.config.ts |
| Hardcoded localhost:3284 in tests | 10 files (1 file with 20+ occurrences) |
| Hardcoded localhost:3000 in tests | 8 files (all using mock pattern) |
| `toBeDefined()` assertions | 817 across 50 files |
| Mock reset patterns | 185 calls across 151 files |
| afterEach/beforeEach usage | 369 calls across 171 files |
| Skipped tests | 1 describe.skip |

---

## What Looks Good

1. **Test setup file is comprehensive** — `setup.ts` correctly mocks Electron, localStorage, sessionStorage, clipboard, ResizeObserver, scrollIntoView, and appConfig.
2. **Mock patterns are consistent** — Most test files follow the same `vi.mock('../../../config')` pattern for getApiUrl.
3. **afterEach cleanup is thorough** — 151 files call `mockClear/mockReset/mockRestore/clearAllMocks/resetAllMocks/restoreAllMocks`.
4. **CI has smart change detection** — `dorny/paths-filter` skips irrelevant jobs.
5. **Pinned action SHAs** — All CI actions use commit SHA references (not floating tags), preventing supply-chain attacks.
6. **Rust Cargo.toml** — `insta` correctly in `[dev-dependencies]`, `@rollup/rollup-win32-x64-msvc` correctly in devDependencies.
7. **tsconfig strict mode** — All strict flags enabled including `noImplicitAny`, `strictNullChecks`, etc.
8. **Forge config** — Correct `bin: 'Super-Goose'` matching `productName`.
9. **optimizeDeps** — `noDiscovery: true` with explicit includes for `shell-quote` and `lodash`.
10. **Coverage config** — Well-structured excludes for test files, types, and index files.
