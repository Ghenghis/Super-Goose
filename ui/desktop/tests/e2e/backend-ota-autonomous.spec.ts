/**
 * Backend OTA and Autonomous Daemon API endpoint tests.
 *
 * Tests the OTA self-improvement pipeline (status, trigger, history) and
 * the autonomous daemon (status, start, stop, audit-log).
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-ota-autonomous.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-ota-autonomous.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// OTA Self-Improvement Pipeline
// =============================================================================

test.describe('Backend OTA Status', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend OTA test: ${testInfo.title}`);
  });

  test('backend OTA status returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('OTA status:', JSON.stringify(data, null, 2));

    // Validate required fields
    expect(typeof data.state).toBe('string');
    expect(typeof data.current_version).toBe('string');
    expect(typeof data.pending_improvements).toBe('number');

    // State should be a known value
    expect(['idle', 'building', 'testing', 'deploying', 'error']).toContain(data.state);

    // Version should be a non-empty string
    expect(data.current_version.length).toBeGreaterThan(0);

    // Pending improvements non-negative
    expect(data.pending_improvements).toBeGreaterThanOrEqual(0);

    // Optional fields should be null or strings
    if (data.last_build_time !== null) {
      expect(typeof data.last_build_time).toBe('string');
    }
    if (data.last_build_result !== null) {
      expect(typeof data.last_build_result).toBe('string');
    }
  });

  test('backend OTA status state is idle by default', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/status`);
    const data = await response.json();

    // Fresh backend should report idle
    expect(data.state).toBe('idle');
  });
});

test.describe('Backend OTA Trigger', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend OTA trigger test: ${testInfo.title}`);
  });

  test('backend OTA trigger dry-run returns response', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-test-session', dry_run: true }),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('OTA trigger (dry-run):', JSON.stringify(data, null, 2));

    expect(typeof data.triggered).toBe('boolean');
    expect(typeof data.message).toBe('string');
    expect(data.message.length).toBeGreaterThan(0);

    // cycle_id may be null or a string
    if (data.cycle_id !== null) {
      expect(typeof data.cycle_id).toBe('string');
    }
  });
});

test.describe('Backend OTA History', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend OTA history test: ${testInfo.title}`);
  });

  test('backend OTA history returns array', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/ota/history`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`OTA history entries: ${data.length}`);

    expect(Array.isArray(data)).toBe(true);

    // If there are any entries, validate their shape
    if (data.length > 0) {
      const entry = data[0];
      expect(typeof entry.cycle_id).toBe('string');
      expect(typeof entry.started_at).toBe('string');
      expect(typeof entry.status).toBe('string');
      expect(typeof entry.improvements_applied).toBe('number');

      // Optional fields
      if (entry.completed_at !== null) {
        expect(typeof entry.completed_at).toBe('string');
      }
      if (entry.test_results !== null) {
        expect(typeof entry.test_results).toBe('string');
      }
    } else {
      console.log('No OTA history entries (expected for fresh backend)');
    }
  });
});

// =============================================================================
// Autonomous Daemon
// =============================================================================

test.describe('Backend Autonomous Status', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend autonomous test: ${testInfo.title}`);
  });

  test('backend autonomous status returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/autonomous/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Autonomous status:', JSON.stringify(data, null, 2));

    // Validate required fields
    expect(typeof data.running).toBe('boolean');
    expect(typeof data.uptime_seconds).toBe('number');
    expect(typeof data.tasks_completed).toBe('number');
    expect(typeof data.tasks_failed).toBe('number');

    // Numeric fields non-negative
    expect(data.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(data.tasks_completed).toBeGreaterThanOrEqual(0);
    expect(data.tasks_failed).toBeGreaterThanOrEqual(0);

    // Circuit breaker sub-object
    expect(data.circuit_breaker).toBeTruthy();
    expect(typeof data.circuit_breaker.state).toBe('string');
    expect(['closed', 'open', 'half_open']).toContain(data.circuit_breaker.state);
    expect(typeof data.circuit_breaker.consecutive_failures).toBe('number');
    expect(typeof data.circuit_breaker.max_failures).toBe('number');

    // Optional fields
    if (data.current_task !== null) {
      expect(typeof data.current_task).toBe('string');
    }
    if (data.circuit_breaker.last_failure !== null) {
      expect(typeof data.circuit_breaker.last_failure).toBe('string');
    }
  });

  test('backend autonomous daemon is not running by default', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/autonomous/status`);
    const data = await response.json();

    // Fresh backend should not be running autonomous daemon
    expect(data.running).toBe(false);
    expect(data.uptime_seconds).toBe(0);
    expect(data.current_task).toBeNull();
  });

  test('backend autonomous circuit breaker is closed by default', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/autonomous/status`);
    const data = await response.json();

    expect(data.circuit_breaker.state).toBe('closed');
    expect(data.circuit_breaker.consecutive_failures).toBe(0);
    expect(data.circuit_breaker.max_failures).toBeGreaterThan(0);
  });
});

test.describe('Backend Autonomous Audit Log', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend autonomous audit log test: ${testInfo.title}`);
  });

  test('backend autonomous audit-log returns array', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/autonomous/audit-log`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`Autonomous audit log entries: ${data.length}`);

    expect(Array.isArray(data)).toBe(true);

    // If there are any entries, validate their shape
    if (data.length > 0) {
      const entry = data[0];
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.timestamp).toBe('string');
      expect(typeof entry.action).toBe('string');
      expect(typeof entry.details).toBe('string');
      expect(typeof entry.outcome).toBe('string');
    } else {
      console.log('No audit log entries (expected for fresh backend)');
    }
  });

  test('backend autonomous audit-log supports limit param', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/autonomous/audit-log?limit=5`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // Result count should not exceed the limit
    expect(data.length).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// OTA Trigger + Verify (real end-to-end)
// =============================================================================

test.describe('Backend OTA Real Trigger + Verify', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend OTA trigger+verify test: ${testInfo.title}`);
  });

  test('backend OTA trigger produces real build attempt', async ({ backendUrl }) => {
    // This test triggers a REAL OTA cycle (not dry-run) and verifies
    // the response indicates an actual build was attempted.
    // The build may fail (if workspace is not set up), but the key is
    // that the message indicates a real attempt, not a mock/stub.

    const response = await fetch(`${backendUrl}/api/ota/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-real-trigger', dry_run: false }),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('OTA REAL trigger:', JSON.stringify(data, null, 2));

    // The response should NOT say "not initialized" (which means it's mocked)
    expect(data.message).not.toContain('not initialized');

    // It should either:
    // a) Have triggered=true with a cycle_id (real build attempted)
    // b) Have triggered=false with a real error message (cargo failed, etc.)
    if (data.triggered) {
      expect(data.cycle_id).toBeTruthy();
      expect(typeof data.cycle_id).toBe('string');
      console.log(`REAL BUILD TRIGGERED: cycle_id=${data.cycle_id}`);
    } else {
      // Build failed — but the message should indicate a real failure
      expect(data.message.length).toBeGreaterThan(10);
      console.log(`BUILD FAILED (expected): ${data.message}`);
      // Verify it's a real error, not a stub
      const isRealError =
        data.message.includes('Build') ||
        data.message.includes('cargo') ||
        data.message.includes('failed') ||
        data.message.includes('error') ||
        data.message.includes('OTA');
      expect(isRealError).toBe(true);
    }
  });

  test('backend OTA status reflects after trigger', async ({ backendUrl }) => {
    // After triggering OTA, the status endpoint should reflect real state.
    // First trigger a dry-run to set some state:
    await fetch(`${backendUrl}/api/ota/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-status-check', dry_run: true }),
    });

    // Now check status
    const statusResp = await fetch(`${backendUrl}/api/ota/status`);
    const statusData = await statusResp.json();
    console.log('OTA status after trigger:', JSON.stringify(statusData, null, 2));

    // The state should be a known OTA status value
    const validStates = ['idle', 'checking', 'saving_state', 'building', 'swapping',
                         'health_checking', 'completed', 'rolling_back', 'rolled_back', 'failed'];
    expect(validStates).toContain(statusData.state);

    // Version should be a real semver
    expect(statusData.current_version).toMatch(/\d+\.\d+/);
  });

  test('backend autonomous start/stop cycle works', async ({ backendUrl }) => {
    // Start the autonomous daemon
    const startResp = await fetch(`${backendUrl}/api/autonomous/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-daemon-cycle' }),
    });
    expect(startResp.ok).toBe(true);
    const startData = await startResp.json();
    console.log('Autonomous after start:', JSON.stringify(startData, null, 2));

    // Should now be running
    expect(startData.running).toBe(true);

    // Wait a moment for uptime to accumulate
    await new Promise(r => setTimeout(r, 1100));

    // Check status — uptime should be > 0
    const statusResp = await fetch(`${backendUrl}/api/autonomous/status`);
    const statusData = await statusResp.json();
    console.log('Autonomous status after 1s:', JSON.stringify(statusData, null, 2));
    expect(statusData.running).toBe(true);
    expect(statusData.uptime_seconds).toBeGreaterThanOrEqual(1);

    // Stop it
    const stopResp = await fetch(`${backendUrl}/api/autonomous/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-daemon-cycle' }),
    });
    expect(stopResp.ok).toBe(true);
    const stopData = await stopResp.json();
    console.log('Autonomous after stop:', JSON.stringify(stopData, null, 2));

    // Should now be stopped
    expect(stopData.running).toBe(false);
    expect(stopData.uptime_seconds).toBe(0);
  });
});

// =============================================================================
// Cross-system validation
// =============================================================================

test.describe('Backend OTA and Autonomous Cross-Validation', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend cross-validation test: ${testInfo.title}`);
  });

  test('backend OTA and autonomous both respond in parallel', async ({ backendUrl }) => {
    // Fire both requests in parallel to verify backend handles concurrent API calls
    const [otaResponse, autoResponse] = await Promise.all([
      fetch(`${backendUrl}/api/ota/status`),
      fetch(`${backendUrl}/api/autonomous/status`),
    ]);

    expect(otaResponse.ok).toBe(true);
    expect(autoResponse.ok).toBe(true);

    const otaData = await otaResponse.json();
    const autoData = await autoResponse.json();

    // Both should have their expected key fields
    expect(otaData.state).toBeTruthy();
    expect(otaData.current_version).toBeTruthy();
    expect(typeof autoData.running).toBe('boolean');
    expect(autoData.circuit_breaker).toBeTruthy();

    console.log(`OTA state: ${otaData.state}, Autonomous running: ${autoData.running}`);
  });
});
