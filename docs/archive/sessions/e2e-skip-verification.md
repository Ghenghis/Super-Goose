# E2E Conditional Skip Verification Guide

## Quick Verification

To verify the changes work correctly, you can test the skip behavior:

### 1. Default Behavior (All Backend Tests Skipped)

```bash
cd G:\goose\ui\desktop
npx playwright test performance.spec.ts --reporter=list
```

**Expected Output:**
```
  Performance Tests
    ○ measure end-to-end performance for prompt submission → Requires running backend (set GOOSE_BACKEND=1)
    ○ measure cold start vs warm cache performance → Requires running backend (set GOOSE_BACKEND=1)
    ○ capture full performance profile with navigation timing → Requires running backend (set GOOSE_BACKEND=1)

  3 skipped
  Passed: 0, Skipped: 3, Failed: 0
```

### 2. With Backend Enabled (Tests Would Run)

```bash
cd G:\goose\ui\desktop
set GOOSE_BACKEND=1
npx playwright test performance.spec.ts --reporter=list
```

**Expected Output:**
```
  Performance Tests
    ✓ measure end-to-end performance for prompt submission (or fails if no backend running)
    ✓ measure cold start vs warm cache performance (or fails if no backend running)
    ✓ capture full performance profile with navigation timing (or fails if no backend running)

  3 passed (or 3 failed if backend not actually running)
```

## Test Files and Counts

| File | Test Count | Skip Condition |
|------|------------|----------------|
| performance.spec.ts | 3 | `!process.env.GOOSE_BACKEND` |
| context-management.spec.ts | 8 | `!process.env.GOOSE_BACKEND` |
| enhanced-context-management.spec.ts | 14 | `!process.env.GOOSE_BACKEND` |
| coding-workflow.spec.ts | 5 | `!process.env.GOOSE_BACKEND` |
| chat-features.spec.ts | 17 | `!process.env.GOOSE_BACKEND` |
| tic-tac-toe.spec.ts | 1 | `!process.env.GOOSE_BACKEND` |
| app.spec.ts (providers only) | 4 | `!process.env.GOOSE_BACKEND` |
| **TOTAL** | **52** | |

## Unchanged Test (Comparison)

`accessibility/a11y-panels.spec.ts` (17 tests) remains unconditionally skipped:

```typescript
// UNCHANGED - Different skip reason (AxeBuilder CDP incompatibility)
test.describe.skip('Accessibility - Panel Routes', () => {
  // These 17 tests remain permanently skipped
});
```

## Implementation Pattern

All 7 updated files follow this consistent pattern:

```typescript
import { test, expect } from './fixtures';
import { skipWithoutBackend } from './skip-utils';

test.describe('Test Suite Name', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('test case 1', async ({ goosePage }) => {
    // Test code - only runs if GOOSE_BACKEND=1
  });

  test('test case 2', async ({ goosePage }) => {
    // Test code - only runs if GOOSE_BACKEND=1
  });
});
```

## Skip Utility Implementation

Located in `ui/desktop/tests/e2e/skip-utils.ts`:

```typescript
export function skipWithoutBackend(test: TestType<any, any>): void {
  test.skip(
    !process.env.GOOSE_BACKEND,
    'Requires running backend (set GOOSE_BACKEND=1)'
  );
}
```

## Testing the Changes

### Without Backend (Default - Should Skip All)
```bash
cd G:\goose\ui\desktop
npx playwright test --grep "Performance|Context|Chat Features|Coding|Tic-Tac-Toe|Provider" --reporter=list
```

Expected: All 52 backend-dependent tests show as skipped with reason "Requires running backend"

### With Backend Variable (Should Attempt to Run)
```bash
cd G:\goose\ui\desktop
set GOOSE_BACKEND=1
npx playwright test performance.spec.ts::measure end-to-end --reporter=list
```

Expected: Test runs (will fail if backend not actually running, but proves skip was conditional)

## Breaking Down by Category

### Performance Tests (3)
```bash
npx playwright test performance.spec.ts --reporter=list
# Expect: 3 skipped
```

### Context Tests (22)
```bash
npx playwright test context-management.spec.ts enhanced-context-management.spec.ts --reporter=list
# Expect: 8 + 14 = 22 skipped
```

### Chat Tests (17)
```bash
npx playwright test chat-features.spec.ts --reporter=list
# Expect: 17 skipped
```

### Workflow Tests (6)
```bash
npx playwright test coding-workflow.spec.ts tic-tac-toe.spec.ts --reporter=list
# Expect: 5 + 1 = 6 skipped
```

### Provider Tests (4)
```bash
npx playwright test app.spec.ts --grep "Provider:" --reporter=list
# Expect: 4 skipped (dark mode test not skipped, runs normally)
```

## Success Criteria

✅ All 52 backend tests skip by default (GOOSE_BACKEND not set)
✅ All 52 backend tests respect GOOSE_BACKEND=1 flag
✅ Skip reason clearly states "Requires running backend"
✅ TypeScript compilation is clean (`npx tsc --noEmit`)
✅ Non-backend tests (like dark mode toggle) run normally
✅ AxeBuilder tests remain unconditionally skipped (different reason)

## Common Issues & Solutions

### Issue: Tests still unconditionally skipped
**Solution:** Check that `test.describe.skip` was changed to `test.describe` (no `.skip`)

### Issue: Tests run when they shouldn't
**Solution:** Verify `test.beforeEach()` with `skipWithoutBackend(test)` is present

### Issue: TypeScript errors
**Solution:** Ensure `import { skipWithoutBackend } from './skip-utils';` is added

### Issue: Wrong tests skipped
**Solution:** Verify only backend-dependent tests were changed, not AxeBuilder tests
