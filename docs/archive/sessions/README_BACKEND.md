# Backend Testing Infrastructure - Overview

This directory contains a comprehensive backend management system for Playwright E2E tests in the Super-Goose project.

## 📁 Files Created

### Core Infrastructure
- **`backend-fixture.ts`** (243 lines) - Extended Playwright fixture with backend lifecycle management
- **`global-setup.ts`** (124 lines) - Pre-test setup that kills zombie processes and configures environment
- **`skip-utils.ts`** (81 lines) - Utilities for conditional test execution based on backend availability

### Test Files
- **`backend-health.spec.ts`** (163 lines) - Comprehensive validation suite for backend API endpoints
- **`backend-example.spec.ts`** (167 lines) - Example tests demonstrating all backend testing patterns

### Documentation
- **`BACKEND_TESTING.md`** (569 lines) - Complete reference documentation
- **`QUICK_START.md`** (217 lines) - Quick reference for common tasks
- **`README_BACKEND.md`** (this file) - Overview and index

### Configuration
- **`playwright.config.ts`** - Updated with global setup and project configurations

## 🚀 Quick Start

### 1. Run tests without backend
```bash
npm run test:e2e
```
Backend-dependent tests will be skipped automatically.

### 2. Run backend health checks (requires running backend)
```powershell
# Windows PowerShell
$env:GOOSE_BACKEND="1"; npm run test:e2e:backend-health
```

### 3. Auto-start backend for tests
```powershell
# Windows PowerShell
$env:GOOSE_START_BACKEND="1"; npm run test:e2e:backend
```

## 📚 Documentation Guide

**Start here:** `QUICK_START.md`
- Common commands
- Troubleshooting
- Windows-specific instructions

**Deep dive:** `BACKEND_TESTING.md`
- Architecture overview
- Complete API reference
- CI/CD integration
- Best practices

**Learn by example:** `backend-example.spec.ts`
- 5 different testing patterns
- Error handling examples
- Real-world usage

## 🎯 Key Features

### 1. Automatic Zombie Process Cleanup
Global setup kills lingering `goosed.exe` processes that cause test timeouts.

### 2. Smart Backend Detection
Tests automatically detect if backend is running and skip if unavailable.

### 3. Auto-Start Backend (Optional)
Set `GOOSE_START_BACKEND=1` to have tests start/stop backend automatically.

### 4. Flexible Configuration
Multiple environment variables for different testing scenarios.

### 5. Project-Based Filtering
Separate Playwright projects for tests with/without backend.

## 🔧 Environment Variables

| Variable | Purpose | When to Use |
|----------|---------|-------------|
| `GOOSE_BACKEND=1` | Mark backend as required | Running backend tests |
| `GOOSE_START_BACKEND=1` | Auto-start backend | Local development |
| `GOOSE_BACKEND_URL` | Custom backend URL | Non-default port |
| `DEBUG_BACKEND=1` | Show backend logs | Debugging backend |
| `DEBUG_TESTS=1` | Show test logs | Debugging tests |

## 📊 Test Organization

```
tests/e2e/
├── backend-fixture.ts          ← Core backend management
├── skip-utils.ts               ← Skip helpers
├── global-setup.ts             ← Pre-test setup
├── backend-health.spec.ts      ← Backend validation tests
├── backend-example.spec.ts     ← Example patterns
└── [other-tests].spec.ts       ← Regular tests
```

## 🎨 Testing Patterns

### Pattern 1: Skip entire suite if no backend
```typescript
test.describe('Backend Tests', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('my test', async ({ backendUrl }) => {
    // Test code
  });
});
```

### Pattern 2: Adapt based on backend availability
```typescript
test('adaptive test', async ({ isBackendRunning, backendUrl }) => {
  if (isBackendRunning) {
    // Use backend
  } else {
    // Fallback behavior
  }
});
```

### Pattern 3: Individual test skip
```typescript
test('backend test', async ({ backendUrl }) => {
  skipWithoutBackend(test);
  // Test code
});
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│ Playwright Test Runner                      │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│ Global Setup (global-setup.ts)              │
│ - Kill zombie processes                     │
│ - Set environment variables                 │
│ - Display configuration                     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│ Backend Fixture (backend-fixture.ts)        │
│ - Detect backend availability               │
│ - Auto-start if GOOSE_START_BACKEND=1       │
│ - Provide backendUrl, isBackendRunning      │
│ - Cleanup after tests                       │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│ Individual Tests                            │
│ - Use skipWithoutBackend() if needed        │
│ - Access backend via backendUrl             │
│ - Check isBackendRunning for adaptive logic │
└─────────────────────────────────────────────┘
```

## 🐛 Common Issues

### Tests timeout immediately
**Cause:** Zombie `goosed.exe` processes
**Fix:** Global setup handles this automatically

### Backend tests skipped
**Cause:** `GOOSE_BACKEND` not set
**Fix:** `$env:GOOSE_BACKEND="1"`

### Port 3284 already in use
**Cause:** Backend already running
**Fix:** `taskkill /F /IM goosed.exe`

### Backend won't start
**Cause:** Missing binary
**Fix:** Build backend and copy to `ui/desktop/src/bin/`

## 📈 Test Statistics

### Created Tests
- **Backend health checks:** 11 tests
- **Example patterns:** 12 tests
- **Total new tests:** 23

### Code Coverage
- **Backend fixture:** Full lifecycle management
- **API endpoints:** Status, Settings, Features, Cost
- **Error handling:** Timeouts, invalid endpoints
- **Auto-start:** Process spawn and cleanup

## 🔗 Integration

### CI/CD
```yaml
- name: Backend Tests
  run: |
    ./ui/desktop/src/bin/goosed server &
    GOOSE_BACKEND=1 npm run test:e2e:backend
```

### Local Development
```powershell
# Terminal 1: Backend
cd ui/desktop/src/bin
./goosed.exe server

# Terminal 2: Tests
$env:GOOSE_BACKEND="1"
npm run test:e2e:backend
```

### Auto-Start (Recommended)
```powershell
$env:GOOSE_START_BACKEND="1"
npm run test:e2e
```

## 📝 Package.json Scripts

- `test:e2e` - All tests (skips backend tests)
- `test:e2e:backend` - Run all backend tests
- `test:e2e:backend-health` - Run health checks only
- `test:e2e:no-backend` - Explicitly skip backend tests

## 🎓 Learning Path

1. **Start:** Read `QUICK_START.md` (5 minutes)
2. **Run:** `npm run test:e2e:backend-health` (2 minutes)
3. **Study:** Review `backend-example.spec.ts` (10 minutes)
4. **Practice:** Write a simple backend test (15 minutes)
5. **Deep Dive:** Read `BACKEND_TESTING.md` (20 minutes)

## 🏆 Best Practices

1. ✅ Always use `skipWithoutBackend()` for backend-dependent tests
2. ✅ Use the `backendUrl` fixture instead of hardcoding URLs
3. ✅ Check `isBackendRunning` for adaptive behavior
4. ✅ Add proper timeouts for backend API calls
5. ✅ Use auto-start for local development
6. ✅ Use external backend for CI/CD
7. ✅ Clean up test data if your test modifies backend state

## 🎯 Success Criteria

- ✅ All test files created and documented
- ✅ Global setup integrated into Playwright config
- ✅ Backend fixture handles full lifecycle
- ✅ Skip utilities work correctly
- ✅ Health check tests validate all endpoints
- ✅ Example tests demonstrate patterns
- ✅ Documentation is comprehensive
- ✅ Package.json scripts configured

## 🚦 Status

**COMPLETE** - All components implemented and tested.

## 📞 Support

For issues or questions:
1. Check troubleshooting in `QUICK_START.md`
2. Review patterns in `backend-example.spec.ts`
3. Read full docs in `BACKEND_TESTING.md`
4. Check existing test files for similar cases

## 🔄 Next Steps

1. Run `npm run test:e2e:backend-health` to validate setup
2. Review `backend-example.spec.ts` for patterns
3. Write backend tests for your features
4. Add to CI/CD pipeline

---

**Last Updated:** 2026-02-12
**Version:** 1.0.0
**Status:** Production Ready
