# Super-Goose Testing Guide

Comprehensive test coverage documentation for the Super-Goose project.

**Last verified**: 2026-02-12, commit `5c1fa46ae1`

---

## Test Suite Summary

| Suite | Scope | Passed | Skipped | Failed | Total |
|-------|-------|-------:|--------:|-------:|------:|
| **Rust** (`cargo test`) | Backend (goose crate) | 1,754 | 0 | 9 pre-existing | 1,763 |
| **Vitest** (frontend) | React components + utils | 2,152 | 3 | 0 | 2,155 |
| **Playwright E2E** | Electron app integration | 291 | 68 | 0 | 359 |
| **TypeScript** (`tsc --noEmit`) | Type checking | -- | -- | 0 errors | -- |

Rust breakdown: 87 core + 52 learning + 90 OTA + 86 autonomous + 1,439 existing = 1,754 passing.

---

## Running Tests

### Rust Tests

```bash
# Set Windows LIB path first (required for linking on Windows)
export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.43.34808\\lib\\x64"

# All tests in the goose crate
cargo test --lib -p goose

# Core tests only (87 tests)
cargo test --lib -p goose -- core::

# Learning engine tests (52 tests)
cargo test --lib -p goose -- experience_store
cargo test --lib -p goose -- insight_extractor
cargo test --lib -p goose -- skill_library
cargo test --lib -p goose -- reflexion
cargo test --lib -p goose -- planner

# OTA self-build tests (90 tests)
cargo test --lib -p goose -- ota::

# Autonomous daemon tests (86 tests)
cargo test --lib -p goose -- autonomous::
```

### Frontend Tests (Vitest)

```bash
cd ui/desktop

# All tests
npx vitest run

# Verbose output
npx vitest run --reporter verbose

# Pipeline visualization tests only
npx vitest run src/components/pipeline

# Layout and panel tests only
npx vitest run src/components/Layout

# Super-Goose panel tests only
npx vitest run src/components/super

# Watch mode (re-runs on file changes)
npx vitest
```

### E2E Tests (Playwright)

```bash
# IMPORTANT: Kill zombie goosed.exe processes first.
# Leftover processes can cause ALL tests to timeout.
taskkill //F //IM goosed.exe 2>/dev/null

cd ui/desktop

# All E2E tests
npx playwright test

# With browser visible
npx playwright test --headed

# Single spec file
npx playwright test tests/e2e/navigation.spec.ts

# Show HTML report after run
npx playwright show-report
```

### TypeScript Type Check

```bash
cd ui/desktop
npx tsc --noEmit
```

---

## Test Categories

### Rust Core (87 tests)

| File | Tests | Description |
|------|------:|-------------|
| `core/mod.rs` | 4 | AgentCore trait basics |
| `core/freeform.rs` | 3 | FreeformCore (default execution mode) |
| `core/structured.rs` | 6 | StructuredCore FSM (Code, Test, Fix phases) |
| `core/orchestrator_core.rs` | 8 | OrchestratorCore (DAG task decomposition) |
| `core/swarm_core.rs` | 8 | SwarmCore (parallel agent coordination) |
| `core/workflow_core.rs` | 7 | WorkflowCore (template-based pipelines) |
| `core/adversarial_core.rs` | 8 | AdversarialCore (Coach/Player adversarial loop) |
| `core/registry.rs` | 7 | AgentCoreRegistry (hot-swap, `/core` and `/cores`) |
| `core/selector.rs` | 11 | CoreSelector (auto-select best core per task) |
| `core/metrics.rs` | 4 | CoreMetrics tracking |
| `core/context.rs` | 5 | AgentContext shared state |

All 87 tests located in `crates/goose/src/agents/core/`.

### Learning Engine (52 tests)

| File | Tests | Description |
|------|------:|-------------|
| `experience_store.rs` | 11 | SQLite cross-session learning (task, core, outcome, insights) |
| `insight_extractor.rs` | 7 | ExpeL-style pattern analysis (core selection, failure, optimization) |
| `skill_library.rs` | 7 | Voyager-style reusable strategies with verified-only retrieval |
| `reflection_store.rs` | 7 | Persistent reflection data in SQLite |
| `reflexion.rs` | 7 | Learn-from-mistakes loop |
| `planner.rs` | 13 | LlmPlanner with SharedProvider + SimplePatternPlanner fallback |

### OTA Self-Build (90 tests)

| Module | Description |
|--------|-------------|
| `StateSaver` | Snapshot current state before update |
| `SelfBuilder` | Compile new binary from source |
| `BinarySwapper` | Atomic binary replacement |
| `HealthChecker` | Post-update health verification |
| `RollbackManager` | Automatic rollback on failure |
| `UpdateScheduler` | Scheduled update checks |
| `OtaManager` | Orchestrates the full OTA pipeline |

All 90 tests located in `crates/goose/src/ota/`.

### Autonomous Daemon (86 tests)

| Module | Description |
|--------|-------------|
| `TaskScheduler` | Cron-style task scheduling |
| `BranchManager` | Git branch lifecycle management |
| `ReleaseManager` | Automated release preparation |
| `DocsGenerator` | Documentation auto-generation |
| `CiWatcher` | CI pipeline monitoring |
| `Failsafe` | Circuit breaker and safety limits |
| `AuditLog` | Action audit trail |
| `AutonomousDaemon` | Top-level daemon orchestrator |

All 86 tests located in `crates/goose/src/autonomous/`.

### Frontend Vitest (2,152 tests across 202 files)

Key test areas:

| Area | Approx. Tests | Location |
|------|------:|---------|
| Pipeline visualization | 69 | `src/components/pipeline/` (4 files) |
| Panel system (PanelSystemProvider, PanelRegistry, zones) | 50+ | `src/components/Layout/` |
| Super-Goose 8-panel sidebar | 11 | `src/components/super/` |
| Enterprise settings | 20+ | `src/components/settings/enterprise/` (6 files) |
| Routing and navigation | 15+ | Multiple spec files |
| Sidebar and agent panel | 10+ | `src/components/GooseSidebar/` |
| Conscious system | 10+ | `src/components/conscious/` |
| TimeWarp components | 10+ | `src/components/timewarp/` |
| CLI integration | 5+ | `src/components/cli/` |

### Playwright E2E (291 passing, 68 skipped)

**Passing** (291): All route navigation, settings panels, sidebar interactions, workflow tests.

**Skipped** (68 total):

- 47 backend-dependent tests -- require a running `goosed` server (skip via `test.describe.skip` with `GOOSE_BACKEND=1` note)
- 17 AxeBuilder accessibility tests -- use `browserContext.newPage()` which is unsupported in Electron CDP mode
- 4 provider configuration tests

---

## Known Test Issues

1. **9 pre-existing Rust failures** in JWT crypto and evolution modules. These are upstream issues unrelated to Super-Goose additions.

2. **3 Vitest tests skipped** (pre-existing, not regressions).

3. **Zombie `goosed.exe` processes** can cause every Playwright test to timeout. Always run `taskkill //F //IM goosed.exe` before E2E runs on Windows.

4. **`orchestrator_core.rs:560`** emits an unused comparison warning (`avg_time_ms >= 0` is always true for `u64`). Harmless.

5. **StructuredCore tests** use `use_done_gate: false` because DoneGate executes shell commands, which causes hangs in the test environment.

6. **Playwright requires a built app binary** (`goosed` in `ui/desktop/src/bin/`). Without it, Electron tests cannot launch.

---

## CI/CD Integration

The `ci-comprehensive.yml` workflow (371 lines) provides automated test execution.

### Trigger Conditions

- Push to `main` or `feat/*` branches
- Pull requests targeting `main`
- Manual dispatch (`workflow_dispatch`)

### Jobs

| Job | What it runs |
|-----|-------------|
| **detect-changes** | Path-based change detection to skip unnecessary jobs |
| **rust-tests** | `cargo test --lib -p goose` with LIB path setup |
| **vitest** | `npx vitest run` in `ui/desktop/` |
| **typecheck** | `npx tsc --noEmit` in `ui/desktop/` |

### Features

- Concurrency groups (cancels in-progress runs on same branch)
- Artifact upload for test results
- Test result summaries in PR checks
- Change detection skips jobs when only docs or unrelated files change

---

## Adding New Tests

### Rust

Place test modules inside the source file using `#[cfg(test)]`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_feature_behavior() {
        // Arrange, Act, Assert
    }
}
```

Run with: `cargo test --lib -p goose -- module_name::tests`

### Vitest (Frontend)

Create `*.test.tsx` or `*.test.ts` files alongside components:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

Note: React JSX Transform (modern) is configured -- `import React` is not needed.

### Playwright E2E

Create `*.spec.ts` files in `ui/desktop/tests/e2e/`:

```typescript
import { test, expect } from '@playwright/test';

test('navigates to settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/settings/);
});
```

For tests requiring a running backend, wrap in a skip block:

```typescript
test.describe.skip('Backend-dependent tests (set GOOSE_BACKEND=1)', () => {
  test('creates a session', async ({ page }) => {
    // ...
  });
});
```

---

## Pre-Release Verification

Before any release, run the full suite:

```bash
# 1. Rust backend
export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.43.34808\\lib\\x64"
cargo test --lib -p goose

# 2. Frontend unit tests
cd ui/desktop
npx vitest run

# 3. Type safety
npx tsc --noEmit

# 4. E2E (kill zombies first)
taskkill //F //IM goosed.exe 2>/dev/null
npx playwright test

# 5. Build verification
npx electron-forge make
```

See `docs/RELEASE_CHECKLIST.md` for the full pre-release checklist.
