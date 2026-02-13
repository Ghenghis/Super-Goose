# Backend Testing Quick Start

## Installation

No additional dependencies needed! The backend testing infrastructure uses only existing Playwright dependencies.

## Running Tests

### Option 1: Run ALL tests (backend tests will skip)
```bash
npm run test:e2e
```

### Option 2: Run backend health checks (requires backend)
```bash
# Windows PowerShell
$env:GOOSE_BACKEND="1"; npm run test:e2e:backend-health

# Windows CMD
set GOOSE_BACKEND=1 && npm run test:e2e:backend-health

# Linux/Mac
GOOSE_BACKEND=1 npm run test:e2e:backend-health
```

### Option 3: Auto-start backend for tests
```bash
# Windows PowerShell
$env:GOOSE_START_BACKEND="1"; npm run test:e2e:backend

# Windows CMD
set GOOSE_START_BACKEND=1 && npm run test:e2e:backend

# Linux/Mac
GOOSE_START_BACKEND=1 npm run test:e2e:backend
```

## Starting Backend Manually

### Windows
```powershell
cd ui/desktop/src/bin
./goosed.exe server
```

### Linux/Mac
```bash
cd ui/desktop/src/bin
./goosed server
```

## Verifying Backend is Running

Open browser to: http://localhost:3284/api/agent/status

Or use curl:
```bash
curl http://localhost:3284/api/agent/status
```

## Troubleshooting

### "Tests timeout immediately"
Zombie processes. Kill them:
```powershell
# Windows
taskkill /F /IM goosed.exe

# Linux/Mac
pkill -9 goosed
```

### "Backend already running on port 3284"
Find and kill the process:
```powershell
# Windows
netstat -ano | findstr :3284
taskkill /F /PID <PID_FROM_ABOVE>

# Linux/Mac
lsof -i :3284
kill -9 <PID>
```

### "Backend tests skipped"
Set the environment variable:
```powershell
# Windows PowerShell
$env:GOOSE_BACKEND="1"
npm run test:e2e:backend-health

# Windows CMD
set GOOSE_BACKEND=1
npm run test:e2e:backend-health
```

### "goosed.exe not found"
Build the backend:
```bash
# From repository root
cargo build -p goose-server --release

# Copy to test location
copy target\release\goosed.exe ui\desktop\src\bin\
```

## Test Files

- `backend-fixture.ts` - Core backend management
- `backend-health.spec.ts` - Validation tests
- `backend-example.spec.ts` - Usage examples
- `skip-utils.ts` - Helper utilities
- `global-setup.ts` - Pre-test setup

## Writing Your Own Backend Tests

```typescript
import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

test.describe('My Backend Tests', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('my test', async ({ backendUrl, isBackendRunning }) => {
    expect(isBackendRunning).toBe(true);

    const response = await fetch(`${backendUrl}/api/agent/status`);
    expect(response.ok).toBe(true);
  });
});
```

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `GOOSE_BACKEND=1` | Indicates backend must be running | Required for backend tests |
| `GOOSE_START_BACKEND=1` | Auto-start backend | For local development |
| `GOOSE_BACKEND_URL` | Custom backend URL | Default: http://localhost:3284 |
| `DEBUG_BACKEND=1` | Show backend logs | For debugging |
| `DEBUG_TESTS=1` | Show test debug output | For debugging |

## CI/CD

GitHub Actions example:
```yaml
- name: Run E2E tests (with backend)
  run: |
    cd ui/desktop/src/bin
    ./goosed server &
    BACKEND_PID=$!
    cd -
    GOOSE_BACKEND=1 npm run test:e2e:backend
    kill $BACKEND_PID
```

Or use auto-start:
```yaml
- name: Run E2E tests (auto-start backend)
  run: GOOSE_START_BACKEND=1 npm run test:e2e:backend
```

## Next Steps

1. Read `BACKEND_TESTING.md` for comprehensive documentation
2. Look at `backend-example.spec.ts` for usage patterns
3. Run `backend-health.spec.ts` to validate your setup
4. Write your own backend tests following the examples

## Support

- Check `BACKEND_TESTING.md` for detailed troubleshooting
- Review existing test files for patterns
- Ensure `goosed.exe` is built and in `ui/desktop/src/bin/`
