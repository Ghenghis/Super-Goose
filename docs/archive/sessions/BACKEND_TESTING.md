# Backend Testing Infrastructure

This directory contains Playwright E2E tests with comprehensive backend management capabilities.

## Quick Start

### Run tests WITHOUT backend
```bash
npm run test:e2e
```
Tests that require backend will be skipped automatically.

### Run tests WITH backend (backend must be running)
```bash
# Terminal 1: Start backend
cd ui/desktop/src/bin
./goosed.exe server

# Terminal 2: Run tests
GOOSE_BACKEND=1 npm run test:e2e
```

### Run tests WITH auto-start backend
```bash
GOOSE_START_BACKEND=1 npm run test:e2e
```
The test framework will automatically start and stop the backend.

## Files

### Core Infrastructure

**`backend-fixture.ts`**
- Extended Playwright test fixture with backend management
- Provides `backendUrl` and `isBackendRunning` to all tests
- Optionally auto-starts backend if `GOOSE_START_BACKEND=1`
- Cleans up backend process after tests

**`global-setup.ts`**
- Runs once before all tests
- Kills zombie `goosed.exe` processes (prevents test timeouts)
- Sets environment variables
- Displays configuration

**`skip-utils.ts`**
- Utilities for conditional test execution
- `skipWithoutBackend(test)` - Skip if backend not available
- `skipWithBackend(test)` - Skip if backend IS available
- `skipIf()`, `skipUnless()` - Generic skip helpers

**`backend-health.spec.ts`**
- Validation tests for backend fixture
- Tests all major backend endpoints
- Demonstrates proper backend test patterns

### Configuration

**`playwright.config.ts`**
- Integrated global setup
- Two projects: `without-backend` and `with-backend`
- Project-level test filtering via grep

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOSE_BACKEND` | Indicates tests require backend | `GOOSE_BACKEND=1` |
| `GOOSE_BACKEND_URL` | Backend server URL | `GOOSE_BACKEND_URL=http://localhost:3284` |
| `GOOSE_START_BACKEND` | Auto-start backend for tests | `GOOSE_START_BACKEND=1` |
| `DEBUG_BACKEND` | Enable backend stdout/stderr logging | `DEBUG_BACKEND=1` |
| `DEBUG_TESTS` | Enable test debug output | `DEBUG_TESTS=1` |

## Usage Patterns

### Writing Backend-Dependent Tests

```typescript
import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

test.describe('My Backend Tests', () => {
  test.beforeEach(async () => {
    skipWithoutBackend(test);
  });

  test('calls backend API', async ({ backendUrl, isBackendRunning }) => {
    // isBackendRunning will be true if we got here
    expect(isBackendRunning).toBe(true);

    const response = await fetch(`${backendUrl}/api/agent/status`);
    expect(response.ok).toBe(true);
  });
});
```

### Writing Backend-Independent Tests

```typescript
import { test, expect } from './fixtures'; // Use normal fixture

test('UI-only test', async ({ goosePage }) => {
  // No backend needed
  await goosePage.waitForSelector('[data-testid="chat-input"]');
});
```

### Conditional Backend Tests

```typescript
import { test, expect } from './backend-fixture';
import { skipWithoutBackend, skipIf } from './skip-utils';

test('conditional test', async ({ backendUrl, isBackendRunning }) => {
  // Skip if backend not available
  skipWithoutBackend(test);

  // Or custom condition
  skipIf(test, !isBackendRunning, 'Backend must be running');

  // Test code
});
```

## Project-Based Filtering

Run specific project:

```bash
# Run only non-backend tests
npx playwright test --project=without-backend

# Run only backend tests (backend must be running)
GOOSE_BACKEND=1 npx playwright test --project=with-backend
```

## Zombie Process Cleanup

The global setup automatically kills zombie `goosed.exe` processes before tests run.

Manual cleanup (if needed):
```bash
# Windows
taskkill /F /IM goosed.exe

# Linux/Mac
pkill -9 goosed
```

## Debugging

### Enable Backend Logging
```bash
DEBUG_BACKEND=1 GOOSE_START_BACKEND=1 npm run test:e2e
```

### Enable Test Logging
```bash
DEBUG_TESTS=1 npm run test:e2e
```

### Run Specific Test
```bash
GOOSE_BACKEND=1 npm run test:e2e -- backend-health.spec.ts
```

### Headed Mode (See Browser)
```bash
GOOSE_BACKEND=1 npx playwright test --headed
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run E2E Tests (without backend)
  run: npm run test:e2e

- name: Run E2E Tests (with backend)
  run: |
    # Start backend in background
    cd ui/desktop/src/bin
    ./goosed server &
    BACKEND_PID=$!
    cd -

    # Run tests
    GOOSE_BACKEND=1 npm run test:e2e

    # Stop backend
    kill $BACKEND_PID
```

Or use auto-start:

```yaml
- name: Run E2E Tests (with auto-start backend)
  run: GOOSE_START_BACKEND=1 npm run test:e2e
```

## Troubleshooting

### Tests timeout immediately
**Cause:** Zombie `goosed.exe` processes from previous runs
**Fix:** Global setup should handle this automatically. If not:
```bash
taskkill /F /IM goosed.exe
npm run test:e2e
```

### Backend not starting
**Cause:** Missing binary or wrong path
**Fix:** Ensure `ui/desktop/src/bin/goosed.exe` exists:
```bash
# Build backend
cargo build -p goose-server --release

# Copy to bin directory
copy target\release\goosed.exe ui\desktop\src\bin\
```

### Backend tests skipped
**Cause:** `GOOSE_BACKEND` not set
**Fix:**
```bash
GOOSE_BACKEND=1 npm run test:e2e
```

### Backend already running error
**Cause:** Port 3284 in use
**Fix:**
```bash
# Windows
netstat -ano | findstr :3284
taskkill /F /PID <PID>

# Linux/Mac
lsof -i :3284
kill -9 <PID>
```

## Best Practices

1. **Use `skipWithoutBackend()`** for all backend-dependent tests
2. **Don't assume backend is running** - always check `isBackendRunning`
3. **Use `backendUrl` fixture** instead of hardcoding URLs
4. **Add proper timeouts** for backend API calls
5. **Clean up test data** if your test creates backend state
6. **Use auto-start for local dev** (`GOOSE_START_BACKEND=1`)
7. **Use external backend for CI** (faster, more stable)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Playwright Test Runner                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────┐                                     │
│  │ Global Setup   │ Kill zombies, set env vars          │
│  └────────────────┘                                     │
│         │                                                │
│         ▼                                                │
│  ┌────────────────────────────────────────────┐        │
│  │ Project: without-backend                   │        │
│  │ - Runs tests without backend requirement   │        │
│  │ - Skips backend-dependent tests            │        │
│  └────────────────────────────────────────────┘        │
│         │                                                │
│         ▼                                                │
│  ┌────────────────────────────────────────────┐        │
│  │ Project: with-backend                      │        │
│  │ - Requires GOOSE_BACKEND=1                 │        │
│  │ - Runs backend-dependent tests             │        │
│  └────────────────────────────────────────────┘        │
│         │                                                │
│         ▼                                                │
│  ┌────────────────────────────────────────────┐        │
│  │ Backend Fixture                            │        │
│  │ - Detects backend availability             │        │
│  │ - Auto-starts if GOOSE_START_BACKEND=1     │        │
│  │ - Provides backendUrl, isBackendRunning    │        │
│  │ - Cleans up after tests                    │        │
│  └────────────────────────────────────────────┘        │
│         │                                                │
│         ▼                                                │
│  ┌────────────────────────────────────────────┐        │
│  │ Individual Tests                           │        │
│  │ - Use skipWithoutBackend() if needed       │        │
│  │ - Access backend via backendUrl            │        │
│  │ - Check isBackendRunning                   │        │
│  └────────────────────────────────────────────┘        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Example Test Output

```
=== Playwright Global Setup ===

Checking for zombie backend processes...
✓ Killed zombie goosed.exe processes
Setting environment variables...
  GOOSE_BACKEND_URL = http://localhost:3284 (default)
  GOOSE_START_BACKEND = 1

Test Configuration:
  Platform: win32
  Node.js: v20.10.0
  Working Directory: G:\goose\ui\desktop
  Backend Mode: AUTO-START

=== Global Setup Complete ===

Running 12 tests using 1 worker

  ✓ backend-health.spec.ts:23:3 › Backend Health Checks › backend is reported as running (1.2s)
  ✓ backend-health.spec.ts:27:3 › Backend Health Checks › backend health endpoint responds (1.5s)
  ✓ backend-health.spec.ts:39:3 › Backend Health Checks › backend settings endpoint responds (1.1s)
  ...

  12 passed (25.3s)
```

## See Also

- `fixtures.ts` - Main Electron app fixture
- `test-overlay.ts` - Visual test name overlay
- `basic-mcp.ts` - MCP test utilities
