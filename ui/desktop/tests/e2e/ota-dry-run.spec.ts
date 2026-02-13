/**
 * OTA Dry-Run Pipeline E2E tests.
 *
 * Validates the OTA dry-run flow, version endpoint, cycle history,
 * and agent core API against a real backend.
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- ota-dry-run.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- ota-dry-run.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// Version Endpoint
// =============================================================================

test.describe('OTA Dry-Run — Version', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA dry-run test: ${testInfo.title}`);
  });

  test('GET /api/version returns build info', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/version`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Version info:', JSON.stringify(data, null, 2));

    // Must have a version field
    expect(data).toHaveProperty('version');
    expect(typeof data.version).toBe('string');
    expect(data.version.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// OTA Status
// =============================================================================

test.describe('OTA Dry-Run — Status', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA dry-run test: ${testInfo.title}`);
  });

  test('GET /api/ota/status returns pipeline state', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('OTA status:', JSON.stringify(data, null, 2));

    // Must have a state field with a known value
    expect(data).toHaveProperty('state');
    expect(typeof data.state).toBe('string');

    const validStates = [
      'idle', 'checking', 'saving_state', 'building', 'testing',
      'swapping', 'health_checking', 'deploying', 'completed',
      'rolling_back', 'rolled_back', 'failed', 'error',
    ];
    expect(validStates).toContain(data.state);
  });
});

// =============================================================================
// OTA Trigger (Dry-Run)
// =============================================================================

test.describe('OTA Dry-Run — Trigger', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA dry-run test: ${testInfo.title}`);
  });

  test('POST /api/ota/trigger with dry_run returns plan without building', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-dry-run', dry_run: true }),
    });

    // Should not crash — may return 200 or 400 depending on config
    expect(response.status).toBeLessThan(500);

    const data = await response.json();
    console.log('OTA trigger (dry-run):', JSON.stringify(data, null, 2));

    // Must have triggered boolean and message
    expect(typeof data.triggered).toBe('boolean');
    expect(typeof data.message).toBe('string');
    expect(data.message.length).toBeGreaterThan(0);

    // cycle_id may be null or a string
    if (data.cycle_id !== null && data.cycle_id !== undefined) {
      expect(typeof data.cycle_id).toBe('string');
    }
  });
});

// =============================================================================
// Cycle History
// =============================================================================

test.describe('OTA Dry-Run — Cycle History', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA dry-run test: ${testInfo.title}`);
  });

  test('GET /api/ota/cycle-history returns array', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/cycle-history`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`OTA cycle-history entries: ${data.length}`);

    expect(Array.isArray(data)).toBe(true);

    // If there are entries, validate their shape
    if (data.length > 0) {
      const entry = data[0];
      expect(typeof entry.cycle_id).toBe('string');
      expect(typeof entry.started_at).toBe('string');
      expect(typeof entry.status).toBe('string');
    } else {
      console.log('No cycle-history entries (expected for fresh backend)');
    }
  });
});

// =============================================================================
// Agent Core API
// =============================================================================

test.describe('OTA Dry-Run — Agent Cores', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA dry-run test: ${testInfo.title}`);
  });

  test('GET /api/agent/cores returns core list', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/agent/cores`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`Agent cores: ${JSON.stringify(data)}`);

    expect(Array.isArray(data)).toBe(true);
  });

  test('POST /api/agent/switch-core validates input', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/agent/switch-core`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ core_type: 'invalid_core_type' }),
    });

    // Should return a response without crashing (not 500)
    expect(response.status).toBeLessThan(500);

    const data = await response.json();
    console.log('Switch-core (invalid):', JSON.stringify(data, null, 2));

    // Invalid core type should yield success: false
    expect(data.success).toBe(false);
  });
});
