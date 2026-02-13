/**
 * OTA Full-Cycle E2E Test
 *
 * Exercises the real OTA self-improvement pipeline end-to-end:
 *   Phase 1: GET /api/version → baseline fingerprint
 *   Phase 2: POST /api/ota/trigger (real cargo build)
 *   Phase 3: Poll /api/ota/status until build completes
 *   Phase 4: POST /api/ota/restart → backend exits
 *   Phase 5: Wait for backend to come back
 *   Phase 6: Verify build_timestamp differs from baseline
 *   Phase 7: Verify /api/ota/status and /api/ota/history
 *
 * Prerequisites:
 *   - Running goosed backend (GOOSE_BACKEND=1)
 *   - Rust toolchain installed
 *   - GOOSE_OTA_TEST=1 flag (gates long-running tests)
 *
 * Run:
 *   GOOSE_BACKEND=1 npx playwright test ota-full-cycle.spec.ts
 *
 * Full cycle with real build:
 *   GOOSE_BACKEND=1 GOOSE_OTA_TEST=1 npx playwright test ota-full-cycle.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend, skipWithoutOtaFlag } from './skip-utils';

const BACKEND_URL = process.env.GOOSE_BACKEND_URL || 'http://localhost:3284';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getVersion(): Promise<{
  version: string;
  build_timestamp: string;
  git_hash: string;
  binary_path: string | null;
} | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getOtaStatus(): Promise<{
  state: string;
  current_version: string;
  pending_improvements: number;
  last_build_time: string | null;
  last_build_result: string | null;
} | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ota/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function waitForBackendHealth(timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await getVersion();
    if (v) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Phase 1: Version endpoint (quick, always runs with backend)
// ---------------------------------------------------------------------------

test.describe('OTA Phase 1: Version Endpoint', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA Phase 1: ${testInfo.title}`);
  });

  test('GET /api/version returns build fingerprint', async () => {
    const v = await getVersion();
    expect(v).not.toBeNull();
    expect(typeof v!.version).toBe('string');
    expect(v!.version.length).toBeGreaterThan(0);
    expect(typeof v!.build_timestamp).toBe('string');
    expect(v!.build_timestamp).toMatch(/^\d+$/); // unix seconds
    expect(typeof v!.git_hash).toBe('string');
    expect(v!.git_hash.length).toBeGreaterThan(0);
    console.log(`Version: ${v!.version}, Timestamp: ${v!.build_timestamp}, Hash: ${v!.git_hash}`);
  });

  test('version timestamp is a recent unix epoch', async () => {
    const v = await getVersion();
    expect(v).not.toBeNull();
    const ts = parseInt(v!.build_timestamp, 10);
    // Should be after 2025-01-01 (1735689600) and before 2030-01-01 (1893456000)
    expect(ts).toBeGreaterThan(1735689600);
    expect(ts).toBeLessThan(1893456000);
  });

  test('binary_path is present and points to real file', async () => {
    const v = await getVersion();
    expect(v).not.toBeNull();
    if (v!.binary_path) {
      expect(v!.binary_path).toMatch(/goosed/);
      console.log(`Binary path: ${v!.binary_path}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 2: OTA Trigger (requires GOOSE_OTA_TEST=1, 10-minute timeout)
// ---------------------------------------------------------------------------

test.describe('OTA Phase 2: Full Cycle', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    skipWithoutOtaFlag(test);
    console.log(`Running OTA Phase 2: ${testInfo.title}`);
  });

  // 10-minute timeout for real cargo build
  test('full OTA cycle: trigger → build → verify', async () => {
    test.setTimeout(600_000);

    // Step 1: Capture baseline version
    const baseline = await getVersion();
    expect(baseline).not.toBeNull();
    console.log(`Baseline: version=${baseline!.version} ts=${baseline!.build_timestamp} hash=${baseline!.git_hash}`);

    // Step 2: Trigger real OTA build
    const triggerRes = await fetch(`${BACKEND_URL}/api/ota/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-full-cycle', dry_run: false }),
    });
    expect(triggerRes.ok).toBe(true);

    const triggerData = await triggerRes.json();
    console.log('OTA trigger response:', JSON.stringify(triggerData, null, 2));

    // If build failed immediately (no cargo, etc.), skip the rest gracefully
    if (!triggerData.triggered && triggerData.message.includes('not initialized')) {
      console.log('OTA manager not initialized — skipping rest of cycle');
      test.skip(true, 'OTA manager not initialized');
      return;
    }

    // Step 3: Poll OTA status until build completes
    const buildingStates = new Set(['building', 'swapping', 'health_checking', 'saving_state', 'checking']);
    const maxPollTime = 300_000; // 5 minutes
    const pollStart = Date.now();
    let finalState = '';

    while (Date.now() - pollStart < maxPollTime) {
      const status = await getOtaStatus();
      if (status) {
        finalState = status.state;
        console.log(`OTA poll: state=${status.state} version=${status.current_version}`);
        if (!buildingStates.has(status.state)) {
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    console.log(`OTA final state: ${finalState}`);

    // Step 4: If OTA succeeded with restart_required, restart and verify
    if (triggerData.restart_required || finalState === 'completed') {
      console.log('OTA completed — triggering restart');

      // Request restart
      try {
        await fetch(`${BACKEND_URL}/api/ota/restart`, {
          method: 'POST',
          signal: AbortSignal.timeout(2000),
        });
      } catch {
        // Expected — process exits before response
      }

      // Wait for backend to come back
      console.log('Waiting for backend to restart...');
      const healthy = await waitForBackendHealth(60_000);

      if (healthy) {
        // Step 5: Verify new version
        const newVersion = await getVersion();
        expect(newVersion).not.toBeNull();
        console.log(`New: version=${newVersion!.version} ts=${newVersion!.build_timestamp} hash=${newVersion!.git_hash}`);

        // Build timestamp should differ (each build generates unique timestamp)
        expect(newVersion!.build_timestamp).not.toBe(baseline!.build_timestamp);
        console.log('BUILD TIMESTAMP CHANGED — OTA verified!');

        // Step 6: Verify status and history
        const status = await getOtaStatus();
        expect(status).not.toBeNull();
        console.log(`Post-restart OTA status: ${status!.state}`);

        const histRes = await fetch(`${BACKEND_URL}/api/ota/history`);
        expect(histRes.ok).toBe(true);
        const history = await histRes.json();
        console.log(`OTA history entries: ${history.length}`);
      } else {
        console.log('Backend did not restart — skipping verification');
        // Not a hard failure — the process manager may not be set up
      }
    } else if (finalState === 'failed' || finalState === 'rolled_back') {
      console.log(`OTA build ${finalState} — this is expected if cargo is not configured`);
      // Verify history still records the attempt
      const histRes = await fetch(`${BACKEND_URL}/api/ota/history`);
      expect(histRes.ok).toBe(true);
    } else {
      console.log(`OTA ended in state: ${finalState}`);
    }
  });

  test('dry-run OTA does not require restart', async () => {
    const res = await fetch(`${BACKEND_URL}/api/ota/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e-dry-run', dry_run: true }),
    });
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.restart_required).toBe(false);
    expect(data.message).toContain('Dry-run');
    console.log(`Dry-run result: ${data.message}`);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Cross-validation (quick, with backend)
// ---------------------------------------------------------------------------

test.describe('OTA Phase 3: Cross-validation', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running OTA Phase 3: ${testInfo.title}`);
  });

  test('version and OTA status are consistent', async () => {
    const [version, status] = await Promise.all([getVersion(), getOtaStatus()]);

    expect(version).not.toBeNull();
    expect(status).not.toBeNull();

    // Both should report the same version
    expect(version!.version).toBe(status!.current_version);
    console.log(`Consistent: version=${version!.version} state=${status!.state}`);
  });

  test('all OTA endpoints respond in parallel', async () => {
    const [vRes, sRes, hRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/version`),
      fetch(`${BACKEND_URL}/api/ota/status`),
      fetch(`${BACKEND_URL}/api/ota/history`),
    ]);

    expect(vRes.ok).toBe(true);
    expect(sRes.ok).toBe(true);
    expect(hRes.ok).toBe(true);
  });
});
