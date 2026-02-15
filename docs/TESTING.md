# Testing Guide

**Version**: v1.24.7
**Date**: 2026-02-15
**Total Tests**: 5,423+

---

## Quick Reference

```bash
# Run all frontend tests
cd ui/desktop && npx vitest run

# Run all frontend tests with coverage
cd ui/desktop && npx vitest run --coverage

# Run TypeScript type checking
cd ui/desktop && npx tsc --noEmit

# Run Rust compilation check (zero warnings required)
cargo check --workspace

# Run Rust unit tests (use --lib to avoid LLVM OOM on Windows)
cargo test --lib -p goose
cargo test --lib -p goose-server

# Run Playwright E2E
cd ui/desktop && npx playwright test

# Run a single test file
cd ui/desktop && npx vitest run src/components/MyComponent.test.tsx
```

---

## Test Suites

### 1. Vitest (Frontend Unit/Integration)

| Metric | Value |
|--------|-------|
| Files | 239 |
| Tests | 3,378 |
| Framework | Vitest + jsdom |
| Config | `ui/desktop/vitest.config.ts` |

**Setup**: `ui/desktop/src/test/setup.ts` configures jsdom environment and global mocks.

**Coverage thresholds** (enforced in CI):
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

**Key patterns**:

- **React 19 + act()**: `NODE_ENV=development` required in vitest config for `act()` to work
- **EventSource mocking**: jsdom has no `EventSource`. Any component using `useAgUi()` must mock it:
  ```typescript
  vi.mock('./ag-ui/useAgUi', () => ({
    useAgUi: () => ({
      agentState: { core_type: 'default', status: 'idle' },
      connected: false,
      isRunning: false,
      activeToolCalls: [],
      activities: [],
      customEvents: [],
      messages: [],
    }),
  }));
  ```
- **vi.fn() generics**: Vitest 2.x removed `vi.fn<[ArgType], ReturnType>()`. Use:
  ```typescript
  vi.fn().mockResolvedValue({} satisfies MyType)
  ```
- **Mock cleanup**: Always restore mocks in `afterEach` to prevent test leakage:
  ```typescript
  afterEach(() => { vi.restoreAllMocks(); });
  ```
- **Scoped queries**: Use `within(container).getByText()` instead of `screen.getByText()` when testing components that render duplicate text

### 2. Playwright E2E (Frontend End-to-End)

| Metric | Value |
|--------|-------|
| Test files | 68 |
| Tests passing | 291 |
| Tests skipped | 68 |
| Config | `ui/desktop/playwright.config.ts` |

**Prerequisites**:
```bash
# Kill zombie goosed.exe processes (Windows)
taskkill //F //IM goosed.exe

# Install browsers
npx playwright install
```

**Current limitation**: Tests run against a mocked backend. Real backend integration testing is planned but not yet implemented in CI.

### 3. Rust Tests

| Crate | Tests | Notes |
|-------|-------|-------|
| `goose` (core) | 87 unit + 29 integration | CoreSelector, AgentCores, Experience Store |
| `goose` (learning) | 52 | ExperienceStore, InsightExtractor, SkillLibrary |
| `goose` (OTA) | 198 | Full OTA pipeline tests |
| `goose` (autonomous) | 86 | TaskScheduler, CiWatcher, Failsafe |
| `goose` (timewarp) | 8 | Event store |
| `goose-server` | 37 + 5 broadcast + 8 GPU + 3 core-config | API routes, AG-UI channel, GPU parser |

**Windows-specific issues**:
- LLVM OOM during `cargo test` linking: use `--lib` flag
- cargo not in git-bash PATH: `export PATH="$PATH:/c/Users/Admin/.cargo/bin"`
- Set `LIB` environment variable for MSVC:
  ```bash
  export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.50.35717\\lib\\x64"
  ```

**Pre-existing failures**: 3 evolution-related test failures in goose core (not regressions).

### 4. TypeScript Compilation (`tsc --noEmit`)

Ensures all TypeScript code type-checks without emitting output.

```bash
cd ui/desktop && npx tsc --noEmit
# Must produce: 0 errors
```

### 5. Cargo Check (`cargo check --workspace`)

Ensures all Rust code compiles without warnings.

```bash
cargo check --workspace 2>&1 | grep -c warning
# Must produce: 0
```

---

## Test Organization

```
ui/desktop/
  src/
    components/
      __tests__/              # Component tests co-located
      features/
        __tests__/            # Feature panel tests
      super/
        __tests__/            # Super-Goose panel tests
    ag-ui/
      __tests__/              # AG-UI protocol tests
    hooks/
      __tests__/              # Hook tests
    test/
      setup.ts                # Global test setup
    *.test.tsx                 # Some tests at module level

crates/
  goose/
    src/
      agents/
        core/
          *_test.rs            # Inline test modules
        experience_store.rs    # Contains #[cfg(test)]
      ota/
        integration_tests.rs   # OTA integration tests
      autonomous/
        tests.rs               # Autonomous daemon tests
      learning/
        tests.rs               # Learning engine tests
  goose-server/
    src/
      routes/
        *_test.rs              # Route-level tests
```

---

## CI Workflows

### `ci-main.yml` (Primary)

Runs on every push to `main` and PRs:
- Rust: `cargo check --workspace`
- TypeScript: `tsc --noEmit`
- Vitest: Full test suite
- Lint checks

### `ci-comprehensive.yml`

Extended checks:
- Rust: `cargo check --workspace` (0 warnings)
- TypeScript: `tsc --noEmit` (0 errors)
- Cargo deny: License/advisory checks

### Adding Tests

When adding new code:

1. **React components**: Create `__tests__/ComponentName.test.tsx` next to the component
2. **React hooks**: Create `__tests__/useHookName.test.ts` next to the hook
3. **Rust modules**: Add `#[cfg(test)] mod tests { ... }` at the bottom of the file
4. **Integration tests**: Add to `crates/*/src/**/integration_tests.rs`
5. **E2E tests**: Add to `ui/desktop/e2e/`

---

## Common Issues

### "does not provide an export named 'Fragment'"

**Cause**: CJS package missing from `optimizeDeps.include` in `vite.renderer.config.mts`.
**Fix**: Add the CJS package to the include list. Never add ESM packages.
See `vite.renderer.config.mts` header comments for the full CJS/ESM package list.

### `act()` warnings in React tests

**Cause**: `NODE_ENV` not set to `development`.
**Fix**: Already configured in `vitest.config.ts` — do not override.

### Rust test OOM on Windows

**Cause**: LLVM linker runs out of memory when linking all test binaries.
**Fix**: Use `cargo test --lib -p <crate>` to test individual crates.

### Playwright test flakiness

**Cause**: Zombie `goosed.exe` processes from previous runs.
**Fix**: `taskkill //F //IM goosed.exe` before running tests.

---

## Coverage Reports

Generated at `ui/desktop/coverage/` with:
```bash
cd ui/desktop && npx vitest run --coverage
```

Reports include:
- `text` — Terminal summary
- `lcov` — For CI integration
- `html` — Browser-viewable detailed report
- `json-summary` — Machine-readable summary
