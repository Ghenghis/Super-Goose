# E2E Conditional Skip Changes

## Summary

Updated 7 test files to use conditional skipping for backend-dependent tests instead of unconditional `test.describe.skip`. Tests now skip by default (when `GOOSE_BACKEND` is not set) but can be enabled by setting `GOOSE_BACKEND=1`.

## Total Tests Changed

**52 tests** changed from unconditional skip to conditional skip:

| File | Tests Changed | Description |
|------|---------------|-------------|
| `performance.spec.ts` | 3 | Performance measurement tests (TTFT, streaming, etc.) |
| `context-management.spec.ts` | 8 | Context window and compaction tests |
| `enhanced-context-management.spec.ts` | 14 | Extended context management tests |
| `coding-workflow.spec.ts` | 5 | Code generation and refactoring tests |
| `chat-features.spec.ts` | 17 | Chat interaction and response tests |
| `tic-tac-toe.spec.ts` | 1 | Full game creation integration test |
| `app.spec.ts` | 4 | Provider-specific tests (Databricks) |

## Changes Made

### 1. All Updated Files

Each file now:
1. Imports `skipWithoutBackend` from `./skip-utils`
2. Uses `test.describe()` instead of `test.describe.skip()`
3. Adds `test.beforeEach()` with `skipWithoutBackend(test)` call
4. Removes "SKIP:" prefix from comments

### 2. Example Pattern

**Before:**
```typescript
import { test, expect } from './fixtures';

// SKIP: These tests require a running goose-server backend with LLM provider.
// Run with: GOOSE_BACKEND=1 npx playwright test
test.describe.skip('Performance Tests', () => {
  test('some test', async ({ goosePage }) => {
    // test code
  });
});
```

**After:**
```typescript
import { test, expect } from './fixtures';
import { skipWithoutBackend } from './skip-utils';

// These tests require a running goose-server backend with LLM provider.
// Run with: GOOSE_BACKEND=1 npx playwright test
test.describe('Performance Tests', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('some test', async ({ goosePage }) => {
    // test code
  });
});
```

## Files NOT Changed

These files were intentionally **not changed** because they have different skip reasons:

- `accessibility/a11y-panels.spec.ts` - Skipped due to AxeBuilder CDP incompatibility (17 tests)
  - Requires browser context, not Electron CDP
  - Will remain unconditionally skipped until web build support is added

## Verification

✅ TypeScript compilation: `npx tsc --noEmit` - **CLEAN**

## Usage

### Default Behavior (Skip backend tests)
```bash
npx playwright test
```
All 52 backend-dependent tests will be skipped (same as before).

### Enable Backend Tests
```bash
GOOSE_BACKEND=1 npx playwright test
```
All 52 backend-dependent tests will run (requires running goosed backend).

### Run Specific Backend Test
```bash
GOOSE_BACKEND=1 npx playwright test performance.spec.ts
```

## Supporting Infrastructure

The `skip-utils.ts` file (already existed) provides the `skipWithoutBackend()` helper:

```typescript
export function skipWithoutBackend(test: TestType<any, any>): void {
  test.skip(!process.env.GOOSE_BACKEND, 'Requires running backend (set GOOSE_BACKEND=1)');
}
```

This centralizes the skip logic and makes it easy to maintain.

## Test Breakdown by Category

### Performance Tests (3 tests)
- End-to-end performance measurement
- Cold start vs warm cache comparison
- Full performance profile with navigation timing

### Context Management (22 tests)
- Token counting and display
- Compaction triggers and manual compaction
- Progress bar updates
- Multi-turn conversations

### Chat Features (17 tests)
- Input visibility and focus
- Message sending and responses
- Code block rendering
- Markdown rendering
- Tool usage verification

### Coding Workflow (5 tests)
- Code explanation
- Bug fixing
- Refactoring
- Tool integration

### Integration Tests (5 tests)
- Tic-tac-toe game creation (1 test)
- Provider tests: chat interaction, history, MCP integration (4 tests)

## Notes

- All backend tests still default to skipped behavior (no breaking changes)
- Tests can now be selectively enabled with environment variable
- Skip reason is clearly displayed in test output
- Pattern is consistent across all files
- TypeScript compilation remains clean
