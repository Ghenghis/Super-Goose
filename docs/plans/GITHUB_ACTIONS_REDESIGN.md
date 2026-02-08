# GitHub Actions Complete Redesign - Super-Goose

**Date**: February 7, 2026
**Status**: 🔴 **CRITICAL** - Current CI/CD system is completely broken
**Priority**: P0 - Blocking all development

---

## 🚨 Current State (BROKEN)

### Problems Identified

1. **47 separate workflow files** - Unmaintainable chaos
2. **Every commit triggers everything** - README changes run full test suites, Docker builds, SonarQube
3. **No intelligent triggers** - Workflows don't check what changed
4. **Extremely slow** - 45+ minute timeouts, no fast feedback
5. **Workflows fail for wrong reasons** - Documentation commits fail due to unrelated test bugs
6. **No caching strategy** - Rebuilding everything from scratch
7. **No parallelization** - Jobs run sequentially when they could run in parallel
8. **No fast-fail** - Wait for all jobs even if critical ones fail
9. **Duplicate work** - Same dependencies installed in multiple jobs
10. **Poor organization** - Workflows for builds, releases, tests, docs all mixed together

### Impact on Development

- ❌ **README commit fails** because of Rust test failures (completely unrelated)
- ❌ **Can't iterate quickly** - have to wait 45 minutes for feedback
- ❌ **False negative feedback** - Green commits fail, red commits might pass
- ❌ **Waste CI resources** - Running unnecessary jobs
- ❌ **Developer frustration** - "Why does everything fail for a simple README?"

---

## ✅ Proposed Solution: Smart,Fast, Reliable CI/CD

### Design Principles

1. **Smart Triggers** - Only run what's relevant to the changes
2. **Fast Feedback** - Critical checks in < 2 minutes
3. **Fail Fast** - Stop early if foundation is broken
4. **Parallel Execution** - Run independent jobs concurrently
5. **Aggressive Caching** - Never rebuild what hasn't changed
6. **Clear Separation** - Different workflows for different purposes
7. **Idempotent** - Same commit = same result, every time

---

## 📋 New Workflow Structure

### Core Workflows (4 total)

```
.github/workflows/
├── ci-main.yml              # Main CI - lint, build, test
├── ci-release.yml           # Release builds - signed installers
├── ci-nightly.yml           # Nightly jobs - benchmarks, canary
└── ci-docs.yml              # Documentation only
```

All other workflows → **DELETE** or consolidate into these 4.

---

## 🎯 Workflow #1: Main CI (ci-main.yml)

**Purpose**: Fast, reliable feedback on all code changes
**Trigger**: Push to main, PRs
**Time Target**: 5-10 minutes total

### Architecture

```
┌─────────────────────┐
│  1. Path Detection  │  (< 10s)
│  What changed?      │
└──────────┬──────────┘
           │
    ┌──────┴───────────────────────────┐
    │                                  │
┌───▼────┐                    ┌────────▼──────┐
│ Docs   │                    │ Code Changed  │
│ Only?  │                    │               │
└───┬────┘                    └────────┬──────┘
    │                                  │
    │                        ┌─────────┴───────────┐
    │                        │                     │
    │                   ┌────▼──────┐       ┌──────▼─────┐
    │                   │  2. Lint  │       │ 3. Build   │
    │                   │  (2 min)  │       │  (3 min)   │
    │                   └────┬──────┘       └──────┬─────┘
    │                        │                     │
    │                   ┌────▼──────────────────────▼─────┐
    │                   │   4. Test (Parallel)            │
    │                   │   - Unit tests (2 min)          │
    │                   │   - Integration tests (3 min)   │
    │                   └─────────────┬───────────────────┘
    │                                 │
    └─────────────────────────────────▼
                              ┌───────────────┐
                              │  5. Report    │
                              │  Status: ✅/❌ │
                              └───────────────┘
```

### Implementation

```yaml
name: Main CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

# Cancel in-progress runs for same PR/branch
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  #─────────────────────────────────────────────────────────────
  # STAGE 1: Detect what changed
  #─────────────────────────────────────────────────────────────
  detect-changes:
    name: 🔍 Detect Changes
    runs-on: ubuntu-latest
    timeout-minutes: 2
    outputs:
      docs-only: ${{ steps.filter.outputs.docs-only }}
      rust-changed: ${{ steps.filter.outputs.rust }}
      typescript-changed: ${{ steps.filter.outputs.typescript }}
      workflows-changed: ${{ steps.filter.outputs.workflows }}
    steps:
      - uses: actions/checkout@v4

      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            docs-only:
              - '**.md'
              - 'docs/**'
              - '!crates/**'
              - '!ui/**'
              - '!.github/**'

            rust:
              - 'crates/**/*.rs'
              - 'Cargo.toml'
              - 'Cargo.lock'

            typescript:
              - 'ui/**/*.ts'
              - 'ui/**/*.tsx'
              - 'ui/**/package.json'
              - 'ui/**/package-lock.json'

            workflows:
              - '.github/workflows/**'

  #─────────────────────────────────────────────────────────────
  # DOCS ONLY PATH (fastest)
  #─────────────────────────────────────────────────────────────
  docs-check:
    name: 📝 Docs Check (Markdown Lint)
    runs-on: ubuntu-latest
    timeout-minutes: 2
    needs: detect-changes
    if: needs.detect-changes.outputs.docs-only == 'true'
    steps:
      - uses: actions/checkout@v4

      - name: Lint Markdown
        uses: DavidAnson/markdownlint-cli2-action@v20
        with:
          globs: '**/*.md'

      - name: ✅ Docs OK
        run: echo "Documentation changes only - no code tests needed"

  #─────────────────────────────────────────────────────────────
  # STAGE 2: LINT (Fast fail if code quality issues)
  #─────────────────────────────────────────────────────────────
  lint-rust:
    name: 🦀 Lint Rust
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: detect-changes
    if: needs.detect-changes.outputs.rust-changed == 'true'
    steps:
      - uses: actions/checkout@v4

      - uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          components: rustfmt, clippy

      - uses: Swatinem/rust-cache@v2
        with:
          cache-on-failure: true

      - name: Check Format
        run: cargo fmt --check

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings

  lint-typescript:
    name: 📦 Lint TypeScript
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: detect-changes
    if: needs.detect-changes.outputs.typescript-changed == 'true'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ui/desktop/package-lock.json

      - name: Install Dependencies
        run: npm ci
        working-directory: ui/desktop

      - name: ESLint
        run: npm run lint:check
        working-directory: ui/desktop

      - name: TypeCheck
        run: npm run typecheck
        working-directory: ui/desktop

  #─────────────────────────────────────────────────────────────
  # STAGE 3: BUILD (Parallel after lint passes)
  #─────────────────────────────────────────────────────────────
  build-rust:
    name: 🔨 Build Rust
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: lint-rust
    steps:
      - uses: actions/checkout@v4

      - uses: actions-rust-lang/setup-rust-toolchain@v1

      - uses: Swatinem/rust-cache@v2
        with:
          cache-on-failure: true

      - name: Install System Dependencies
        run: |
          sudo apt update -y
          sudo apt install -y libdbus-1-dev gnome-keyring libxcb1-dev

      - name: Build All Crates
        run: cargo build --all --release

      - name: Upload Rust Binaries
        uses: actions/upload-artifact@v4
        with:
          name: rust-binaries
          path: |
            target/release/goose
            target/release/goosed
          retention-days: 1

  build-typescript:
    name: 🔨 Build TypeScript
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: lint-typescript
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ui/desktop/package-lock.json

      - name: Install Dependencies
        run: npm ci
        working-directory: ui/desktop

      - name: Build Desktop App
        run: npm run build
        working-directory: ui/desktop

      - name: Upload Desktop Build
        uses: actions/upload-artifact@v4
        with:
          name: desktop-build
          path: ui/desktop/dist
          retention-days: 1

  #─────────────────────────────────────────────────────────────
  # STAGE 4: TEST (Parallel, with smart skipping)
  #─────────────────────────────────────────────────────────────
  test-rust-unit:
    name: 🧪 Test Rust (Unit)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: build-rust
    steps:
      - uses: actions/checkout@v4

      - uses: actions-rust-lang/setup-rust-toolchain@v1

      - uses: Swatinem/rust-cache@v2
        with:
          cache-on-failure: true

      - name: Install System Dependencies
        run: |
          sudo apt update -y
          sudo apt install -y libdbus-1-dev gnome-keyring libxcb1-dev

      - name: Run Unit Tests
        run: |
          gnome-keyring-daemon --components=secrets --daemonize --unlock <<< 'test'
          cargo test --lib --all
        env:
          RUST_BACKTRACE: 1
          RUST_MIN_STACK: 8388608

  test-rust-integration:
    name: 🧪 Test Rust (Integration)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: build-rust
    steps:
      - uses: actions/checkout@v4

      - uses: actions-rust-lang/setup-rust-toolchain@v1

      - uses: Swatinem/rust-cache@v2
        with:
          cache-on-failure: true

      - name: Install System Dependencies
        run: |
          sudo apt update -y
          sudo apt install -y libdbus-1-dev gnome-keyring libxcb1-dev

      - name: Run Integration Tests
        run: |
          gnome-keyring-daemon --components=secrets --daemonize --unlock <<< 'test'
          cargo test --test '*' --all
        env:
          RUST_BACKTRACE: 1
          RUST_MIN_STACK: 8388608

  test-typescript:
    name: 🧪 Test TypeScript
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: build-typescript
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ui/desktop/package-lock.json

      - name: Install Dependencies
        run: npm ci
        working-directory: ui/desktop

      - name: Run Tests
        run: npm run test:run
        working-directory: ui/desktop

  #─────────────────────────────────────────────────────────────
  # STAGE 5: REPORT (Final status)
  #─────────────────────────────────────────────────────────────
  ci-success:
    name: ✅ CI Success
    runs-on: ubuntu-latest
    needs:
      - detect-changes
      - docs-check
      - test-rust-unit
      - test-rust-integration
      - test-typescript
    if: always()
    steps:
      - name: Check All Jobs Passed
        run: |
          if [[ "${{ needs.docs-check.result }}" == "success" ]] || \
             [[ "${{ needs.test-rust-unit.result }}" == "success" && \
                "${{ needs.test-rust-integration.result }}" == "success" && \
                "${{ needs.test-typescript.result }}" == "success" ]]; then
            echo "✅ CI PASSED"
            exit 0
          else
            echo "❌ CI FAILED"
            exit 1
          fi
```

---

## 🎯 Workflow #2: Release CI (ci-release.yml)

**Purpose**: Build production-ready signed installers
**Trigger**: Manual dispatch, tags
**Time Target**: 20-30 minutes

```yaml
name: Release CI

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g., 1.23.0)'
        required: true
      create_release:
        description: 'Create GitHub release?'
        type: boolean
        default: true
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    name: 🪟 Build Windows (Signed)
    runs-on: windows-latest
    steps:
      # ... Windows build with code signing

  build-macos:
    name: 🍎 Build macOS (Signed)
    runs-on: macos-latest
    steps:
      # ... macOS build with code signing

  build-linux:
    name: 🐧 Build Linux (AppImage)
    runs-on: ubuntu-latest
    steps:
      # ... Linux build

  create-release:
    name: 📦 Create GitHub Release
    needs: [build-windows, build-macos, build-linux]
    runs-on: ubuntu-latest
    if: inputs.create_release == 'true'
    steps:
      # ... Create release with all artifacts
```

---

## 🎯 Workflow #3: Nightly CI (ci-nightly.yml)

**Purpose**: Expensive checks that don't need to run on every commit
**Trigger**: Scheduled (daily at 2 AM), manual
**Time Target**: 1-2 hours (don't care, runs overnight)

```yaml
name: Nightly CI

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:

jobs:
  scenario-tests:
    name: 🎭 Scenario Tests (Full Suite)
    # ... Long-running scenario tests

  security-scan:
    name: 🔐 Security Scan (SonarQube)
    # ... Security analysis

  performance-benchmarks:
    name: ⚡ Performance Benchmarks
    # ... Criterion benchmarks

  dependency-audit:
    name: 📦 Dependency Audit
    # ... cargo audit, npm audit
```

---

## 🎯 Workflow #4: Docs CI (ci-docs.yml)

**Purpose**: Documentation-specific checks
**Trigger**: Changes to docs/, *.md files
**Time Target**: 2-3 minutes

```yaml
name: Docs CI

on:
  push:
    paths:
      - 'docs/**'
      - '**.md'
  pull_request:
    paths:
      - 'docs/**'
      - '**.md'

jobs:
  lint-markdown:
    name: 📝 Lint Markdown
    # ... Markdown linting

  build-docs-site:
    name: 🌐 Build Docs Site
    # ... Build documentation website

  check-links:
    name: 🔗 Check Links
    # ... Verify all links work
```

---

## 📊 Comparison: Before vs After

| Metric | Before (Broken) | After (Redesigned) |
|--------|----------------|-------------------|
| **Workflow files** | 47 | 4 |
| **README commit triggers** | 5-10 workflows | 1 workflow (docs-only) |
| **Feedback time (docs)** | 45+ minutes | <2 minutes |
| **Feedback time (code)** | 45+ minutes | 5-10 minutes |
| **False failures** | Constant | Rare |
| **Parallelization** | Minimal | Aggressive |
| **Caching** | Inconsistent | Comprehensive |
| **Maintainability** | Nightmare | Simple |

---

## 🚀 Migration Plan

### Phase 1: Create New Workflows (Week 1)
1. Create `ci-main.yml` with smart path detection
2. Test on a feature branch first
3. Verify all checks work correctly

### Phase 2: Delete Old Workflows (Week 2)
1. Disable all 47 old workflows
2. Monitor main CI for 1 week
3. If stable, delete old workflow files

### Phase 3: Add Release & Nightly (Week 3)
1. Create `ci-release.yml` for production builds
2. Create `ci-nightly.yml` for expensive checks
3. Migrate existing release logic

### Phase 4: Documentation (Week 4)
1. Create `ci-docs.yml` for docs-specific checks
2. Update contribution guide with new CI info
3. Document how to trigger manual workflows

---

## ✅ Success Criteria

**After migration, these should be true:**

1. ✅ README commits complete in < 2 minutes with ✅ green status
2. ✅ Code commits get feedback in < 10 minutes
3. ✅ Tests only run when code changes
4. ✅ Lint failures caught in < 2 minutes (before expensive tests)
5. ✅ CI never runs unnecessary jobs
6. ✅ Developers can understand what failed and why
7. ✅ GitHub Actions usage reduced by 70%+

---

## 📝 Next Actions

1. **Create `ci-main.yml`** with smart path detection
2. **Test on feature branch** before merging to main
3. **Document new workflow** in CONTRIBUTING.md
4. **Disable old workflows** once new one is proven
5. **Delete old workflow files** after 1 week of stability

---

**Priority**: 🔴 P0 - Do this BEFORE fixing remaining test failures
**Effort**: 2-3 days to implement and test
**Impact**: Unblocks all future development, saves hours of CI time daily

---

**Created by**: Claude Sonnet 4.5
**Last Updated**: February 7, 2026
**Status**: Ready for implementation
