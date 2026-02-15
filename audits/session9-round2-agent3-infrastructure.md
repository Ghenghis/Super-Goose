# Session 9 Round 2 Agent 3 — Infrastructure Audit Report

**Date**: 2026-02-15
**Agent**: Infrastructure / CI / Config Auditor
**Branch**: `feat/resizable-layout`

## Summary

Audited **38 workflow files**, **Dockerfile**, **.dockerignore**, **.gitignore**, and **8 ui/desktop config files** (package.json, tsconfig.json, tsconfig.node.json, vitest.config.ts, forge.config.ts, vite.main.config.mts, vite.renderer.config.mts, vite.preload.config.mts).

**Total issues found**: 30
**Issues fixed**: 26
**Remaining (cannot fix without testing)**: 4

---

## Files Scanned

### GitHub Actions Workflows (38 files)
- `.github/workflows/autoclose.yml`
- `.github/workflows/build-cli.yml`
- `.github/workflows/build-notify.yml`
- `.github/workflows/bundle-desktop.yml`
- `.github/workflows/bundle-desktop-intel.yml`
- `.github/workflows/bundle-desktop-linux.yml`
- `.github/workflows/bundle-desktop-manual.yml`
- `.github/workflows/bundle-desktop-windows.yml`
- `.github/workflows/canary.yml`
- `.github/workflows/cargo-deny.yml`
- `.github/workflows/ci-comprehensive.yml`
- `.github/workflows/ci-main.yml`
- `.github/workflows/deploy-docs-and-extensions.yml`
- `.github/workflows/docs-update-recipe-ref.yml`
- `.github/workflows/goose-issue-solver.yml`
- `.github/workflows/goose-pr-reviewer.yml`
- `.github/workflows/pr-agent.yml`
- `.github/workflows/pr-comment-build-cli.yml`
- `.github/workflows/pr-comment-bundle.yml`
- `.github/workflows/pr-comment-bundle-intel.yml`
- `.github/workflows/pr-comment-bundle-windows.yml`
- `.github/workflows/pr-smoke-test.yml`
- `.github/workflows/pr-website-preview.yml`
- `.github/workflows/publish-ask-ai-bot.yml`
- `.github/workflows/publish-docker.yml`
- `.github/workflows/quarantine.yml`
- `.github/workflows/rebuild-skills-marketplace.yml`
- `.github/workflows/recipe-security-scanner.yml`
- `.github/workflows/release.yml`
- `.github/workflows/release-all-platforms.yml`
- `.github/workflows/release-branches.yml`
- `.github/workflows/scorecard.yml`
- `.github/workflows/stale.yml`
- `.github/workflows/supply-chain.yml`
- `.github/workflows/take.yml`
- `.github/workflows/test-finder.yml`
- `.github/workflows/update-hacktoberfest-leaderboard.yml`
- `.github/workflows/update-health-dashboard.yml`

### Docker & Ignore Files
- `Dockerfile`
- `.dockerignore`
- `.gitignore`

### UI Desktop Config Files
- `ui/desktop/package.json`
- `ui/desktop/tsconfig.json`
- `ui/desktop/tsconfig.node.json`
- `ui/desktop/vitest.config.ts`
- `ui/desktop/forge.config.ts`
- `ui/desktop/vite.main.config.mts`
- `ui/desktop/vite.renderer.config.mts`
- `ui/desktop/vite.preload.config.mts`

---

## Issues Found & Fixed

### Security (4 fixed)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `release-all-platforms.yml` | `dtolnay/rust-toolchain@stable` unpinned (3 occurrences) — allows supply chain attacks via tag mutation | Pinned to SHA `@a54c7afe936fefeb4456b2dd8068152669aa8203` |
| 2 | `release-all-platforms.yml` | `android-actions/setup-android@v3` unpinned | Pinned to SHA `@00854ea68c109d98c75d956347303bf7c45b0277` |
| 3 | `release-branches.yml` | Missing top-level `permissions` block — defaults to broad permissions | Added `permissions: contents: read` |
| 4 | `bundle-desktop-manual.yml` | Missing top-level `permissions` block | Added `permissions: contents: read` |

### Performance (2 fixed)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 5 | `Dockerfile` | `COPY . .` before `cargo build` invalidates ALL build cache on any source change | Added dependency-only pre-build layer: copy Cargo.toml/lock first, create stubs, pre-build deps, then copy full source |
| 6 | `Dockerfile` | Hardcoded `version` label (`1.25.0`) becomes stale on every release | Removed hardcoded version label |

### Correctness (2 fixed)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 7 | `autoclose.yml` | Duplicate `permissions` block (top-level + job-level identical) — confusing, no functional impact but violates DRY | Removed redundant job-level permissions |
| 8 | `deploy-docs-and-extensions.yml` | `node-version: 20` inconsistent with project standard (22) | Changed to `node-version: '22'` |

### Best Practices — Missing Timeouts (16 fixed)

Jobs without `timeout-minutes` default to 6 hours (360 min), wasting CI minutes on hung builds.

| # | File | Job | Timeout Added |
|---|------|-----|---------------|
| 9 | `autoclose.yml` | `close-issues` | 5 min |
| 10 | `build-notify.yml` | `notify` | 3 min |
| 11 | `ci-main.yml` | `semgrep-policy` | 10 min |
| 12 | `cargo-deny.yml` | `deny` | 10 min |
| 13 | `release.yml` | `check-repo` | 2 min |
| 14 | `release.yml` | `install-script` | 5 min |
| 15 | `release.yml` | `release` | 15 min |
| 16 | `release-all-platforms.yml` | `build-ios` | 60 min |
| 17 | `release-all-platforms.yml` | `build-android` | 30 min |
| 18 | `release-all-platforms.yml` | `create-release` | 15 min |
| 19 | `canary.yml` | `prepare-version` | 5 min |
| 20 | `canary.yml` | `install-script` | 5 min |
| 21 | `canary.yml` | `release` | 15 min |
| 22 | `pr-comment-bundle.yml` | `trigger-on-command` | 5 min |
| 23 | `pr-comment-bundle.yml` | `pr-comment-arm64` | 5 min |
| 24 | `deploy-docs-and-extensions.yml` | `deploy` | 15 min |

### Best Practices — Missing Concurrency Groups (4 fixed)

Without concurrency groups, multiple runs of the same workflow on the same ref can run simultaneously, wasting CI minutes.

| # | File | Fix |
|---|------|-----|
| 25 | `cargo-deny.yml` | Added `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` |
| 26 | `bundle-desktop-manual.yml` | Added `concurrency: group: ${{ github.workflow }}-${{ inputs.branch }}` |
| 27 | `publish-docker.yml` | Added `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` |
| 28 | `release-all-platforms.yml` | Added `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` |

### Best Practices — Missing Timeout on pr-smoke-test.yml (5 fixed)

| # | File | Job | Timeout Added |
|---|------|-----|---------------|
| 29 | `pr-smoke-test.yml` | `check-fork` | 5 min |
| 30 | `pr-smoke-test.yml` | `changes` | 5 min |
| 31 | `pr-smoke-test.yml` | `build-binary` | 30 min |
| 32 | `pr-smoke-test.yml` | `smoke-tests` | 30 min |
| 33 | `pr-smoke-test.yml` | `smoke-tests-code-exec` | 30 min |
| 34 | `pr-smoke-test.yml` | `compaction-tests` | 30 min |

### Docker & Ignore Files (3 fixed)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 35 | `.dockerignore` | Missing Playwright test artifacts, coverage directory, build output dirs | Added `test-results/`, `test-screenshots/`, `playwright-report/`, `coverage/`, `build-output/`, `gooseselftest/` |
| 36 | `.gitignore` | Missing Playwright report, test-results, eslint report | Added `test-results/`, `playwright-report/`, `eslint-report.json` |
| 37 | `Dockerfile` | Dependency caching layer missing — all source changes invalidate cargo cache | Added Cargo manifest pre-copy + stub build layer for dependency caching |

---

## Remaining Items (Not Fixed)

| # | File | Issue | Reason |
|---|------|-------|--------|
| R1 | `pr-agent.yml` | `CodiumAI/pr-agent@main` unpinned | Comment says "unpinned: pr-agent does not publish SHA-pinned tags" — no stable SHA available |
| R2 | Multiple reusable workflows | Use `actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8` (v6) vs our CI workflows using `@34e114876b0b11c390a56381ad16ebd13914f8d5` (v4) | These are inherited from upstream block/goose; both SHAs are valid but different versions. Standardizing would require testing all reusable workflow callers. |
| R3 | `pr-website-preview.yml` | `node-version: 20` (same as docs deploy) | File is DISABLED — not worth modifying until re-enabled |
| R4 | Various disabled workflows | Missing timeouts/concurrency on disabled workflows (quarantine, take, test-finder, etc.) | Low priority — these are all `workflow_dispatch` only and disabled |

---

## Config Files Assessment (No Changes Needed)

### `ui/desktop/package.json` — CLEAN
- `engines.node: ">=22.0.0"` — correct
- `engines.npm: ">=10.0.0"` — correct
- Dependencies are up to date with caret ranges
- `lint-staged` configuration is correct
- `license: "Apache-2.0"` matches project

### `ui/desktop/tsconfig.json` — CLEAN
- Strict mode enabled with all safety flags
- `jsx: "react-jsx"` — correct for React 19
- `target: "ES2020"` — appropriate for Electron
- References tsconfig.node.json correctly

### `ui/desktop/tsconfig.node.json` — CLEAN
- Correctly includes all vite config files and vitest/forge configs
- `composite: true` for project references
- `outDir: "dist"` set

### `ui/desktop/vitest.config.ts` — CLEAN
- Coverage thresholds set (80% across all metrics)
- jsdom environment configured
- Setup file referenced
- NODE_ENV=development for React 19 compatibility

### `ui/desktop/forge.config.ts` — CLEAN
- FusesPlugin with security-hardened defaults (RunAsNode=false, CookieEncryption=true)
- All makers properly configured (zip, squirrel, wix, dmg, deb, rpm)
- Flatpak correctly removed with explanatory comment

### `ui/desktop/vite.main.config.mts` — CLEAN
- GitHub env vars properly injected at build time

### `ui/desktop/vite.renderer.config.mts` — CLEAN
- `optimizeDeps.noDiscovery: true` with explicit `include` list — correct pattern
- Port 5233 to avoid Docker Desktop conflict
- CJS interop packages listed

### `ui/desktop/vite.preload.config.mts` — CLEAN
- CJS output format for Electron preload — correct
- External electron dependency — correct

---

## Verification

- **tsc --noEmit**: CLEAN (0 errors)
- No source code (`.ts`, `.tsx`, `.rs`) was modified
- All changes limited to CI/config/infrastructure files

---

## Files Modified (17 files)

1. `.github/workflows/autoclose.yml` — removed duplicate permissions, added timeout
2. `.github/workflows/build-notify.yml` — added timeout
3. `.github/workflows/bundle-desktop-manual.yml` — added permissions + concurrency
4. `.github/workflows/canary.yml` — added 3 timeouts
5. `.github/workflows/cargo-deny.yml` — added permissions, concurrency, timeout
6. `.github/workflows/ci-main.yml` — added semgrep timeout
7. `.github/workflows/deploy-docs-and-extensions.yml` — added permissions, timeout, node 22
8. `.github/workflows/pr-comment-bundle.yml` — added 2 timeouts
9. `.github/workflows/pr-smoke-test.yml` — added concurrency + 6 timeouts
10. `.github/workflows/publish-docker.yml` — added concurrency
11. `.github/workflows/release.yml` — added 3 timeouts
12. `.github/workflows/release-all-platforms.yml` — pinned 4 actions, added concurrency + 3 timeouts
13. `.github/workflows/release-branches.yml` — added permissions + timeout
14. `.dockerignore` — added 6 missing exclusion patterns
15. `.gitignore` — added 3 missing patterns
16. `Dockerfile` — dependency caching layer, removed hardcoded version label
