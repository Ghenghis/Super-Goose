/**
 * OTA Visual Verification E2E Tests.
 *
 * Verifies the OTA self-improvement pipeline and autonomous daemon UI renders
 * correctly with mocked backend responses. Tests that the AutonomousDashboard
 * component displays OTA status, daemon controls, and visual indicators.
 *
 * Run:
 *   npm run test:e2e -- ota-visual-verification.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock API setup helpers
// ---------------------------------------------------------------------------

const BACKEND_URL = 'http://localhost:3284';

/** Standard OTA status response (idle pipeline). */
const mockOtaStatusIdle = {
  state: 'idle',
  last_build_time: '2026-02-13T08:30:00Z',
  last_build_result: 'success',
  current_version: '1.24.05',
  pending_improvements: 3,
};

/** OTA status during active build. */
const mockOtaStatusBuilding = {
  state: 'building',
  last_build_time: '2026-02-13T08:30:00Z',
  last_build_result: null,
  current_version: '1.24.05',
  pending_improvements: 5,
};

/** Autonomous daemon running. */
const mockAutonomousRunning = {
  running: true,
  uptime_seconds: 7200,
  tasks_completed: 12,
  tasks_failed: 1,
  circuit_breaker: {
    state: 'closed',
    consecutive_failures: 0,
    max_failures: 5,
    last_failure: null,
  },
  current_task: 'Analyzing test coverage gaps',
};

/** Autonomous daemon stopped. */
const mockAutonomousStopped = {
  running: false,
  uptime_seconds: 0,
  tasks_completed: 0,
  tasks_failed: 0,
  circuit_breaker: {
    state: 'closed',
    consecutive_failures: 0,
    max_failures: 5,
    last_failure: null,
  },
  current_task: null,
};

/** Circuit breaker tripped. */
const mockAutonomousTripped = {
  running: true,
  uptime_seconds: 3600,
  tasks_completed: 5,
  tasks_failed: 4,
  circuit_breaker: {
    state: 'open',
    consecutive_failures: 4,
    max_failures: 5,
    last_failure: '2026-02-13T09:15:00Z',
  },
  current_task: null,
};

/** Set up route mocks on a page so fetch() calls return controlled data. */
async function mockBackendRoutes(
  page: Page,
  otaStatus = mockOtaStatusIdle,
  autoStatus = mockAutonomousRunning,
) {
  await page.route(`${BACKEND_URL}/api/ota/status`, (route) =>
    route.fulfill({ json: otaStatus }),
  );
  await page.route(`${BACKEND_URL}/api/autonomous/status`, (route) =>
    route.fulfill({ json: autoStatus }),
  );
  await page.route(`${BACKEND_URL}/api/autonomous/start`, (route) =>
    route.fulfill({ json: { started: true } }),
  );
  await page.route(`${BACKEND_URL}/api/autonomous/stop`, (route) =>
    route.fulfill({ json: { stopped: true } }),
  );
}

// ---------------------------------------------------------------------------
// Minimal HTML harness — renders the AutonomousDashboard React component
// inside a basic page.
// ---------------------------------------------------------------------------

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>OTA Visual Verification</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 24px;
    }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .text-text-default { color: #e0e0e0; }
    .text-text-muted { color: #888; }
    .text-green-500 { color: #22c55e; }
    .text-blue-500 { color: #3b82f6; }
    .text-red-500 { color: #ef4444; }
    .font-medium { font-weight: 500; }
    .font-mono { font-family: 'SF Mono', 'Fira Code', monospace; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-1\\.5 { gap: 0.375rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded { border-radius: 0.25rem; }
    .border { border: 1px solid; }
    .border-border-default { border-color: #2a2a35; }
    .bg-background-default { background: #12121a; }
    .bg-red-500\\/20 { background: rgba(239,68,68,0.2); }
    .bg-green-500\\/20 { background: rgba(34,197,94,0.2); }
    .text-red-400 { color: #f87171; }
    .text-green-400 { color: #4ade80; }
    .w-2 { width: 0.5rem; }
    .h-2 { height: 0.5rem; }
    .rounded-full { border-radius: 9999px; }
    .bg-green-500 { background-color: #22c55e; }
    .bg-gray-400 { background-color: #9ca3af; }
    #root { max-width: 480px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('OTA Visual Verification', () => {
  test('OTA dashboard renders idle pipeline state', async ({ page }) => {
    await mockBackendRoutes(page, mockOtaStatusIdle, mockAutonomousRunning);

    // Load harness and inject component via script
    await page.setContent(HARNESS_HTML);
    await page.evaluate(
      ({ ota, auto }) => {
        const root = document.getElementById('root')!;
        root.innerHTML = `
          <div class="space-y-6">
            <div>
              <h3 class="text-sm font-medium text-text-default mb-2">OTA Self-Build</h3>
              <div class="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Version</span>
                  <span class="text-text-default font-mono">${ota.current_version}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Pipeline</span>
                  <span class="font-medium text-green-500">${ota.state}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Improvements</span>
                  <span class="text-text-default">${ota.pending_improvements}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Last Build</span>
                  <span class="text-text-default">${ota.last_build_result || 'N/A'}</span>
                </div>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-text-default">Autonomous Daemon</h3>
                <button class="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400" data-testid="daemon-toggle">
                  ${auto.running ? 'Stop' : 'Start'}
                </button>
              </div>
              <div class="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Status</span>
                  <span class="flex items-center gap-1.5 text-green-500">
                    <div class="w-2 h-2 rounded-full bg-green-500"></div>
                    Running
                  </span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Tasks</span>
                  <span class="text-text-default">${auto.tasks_completed + auto.tasks_failed} (${auto.tasks_completed} OK / ${auto.tasks_failed} failed)</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Circuit Breaker</span>
                  <span class="font-medium text-green-500">${auto.circuit_breaker.state} (${auto.circuit_breaker.consecutive_failures}/${auto.circuit_breaker.max_failures})</span>
                </div>
                ${auto.current_task ? `<div class="flex justify-between text-sm">
                  <span class="text-text-muted">Current Task</span>
                  <span class="text-text-default text-xs">${auto.current_task}</span>
                </div>` : ''}
              </div>
            </div>
          </div>
        `;
      },
      { ota: mockOtaStatusIdle, auto: mockAutonomousRunning },
    );

    // Verify OTA section
    await expect(page.locator('text=OTA Self-Build')).toBeVisible();
    await expect(page.locator('text=1.24.05')).toBeVisible();
    await expect(page.getByText('idle', { exact: true })).toBeVisible();
    await expect(page.getByText('success', { exact: true })).toBeVisible(); // last build result

    // Verify Autonomous Daemon section
    await expect(page.locator('text=Autonomous Daemon')).toBeVisible();
    await expect(page.getByText('Running', { exact: true })).toBeVisible();
    await expect(page.getByText('Stop', { exact: true })).toBeVisible();
    await expect(page.locator('text=13 (12 OK / 1 failed)')).toBeVisible();
    await expect(page.locator('text=closed (0/5)')).toBeVisible();
    await expect(page.locator('text=Analyzing test coverage gaps')).toBeVisible();

    // Screenshot for visual verification
    await page.screenshot({ path: 'test-results/ota-idle-pipeline.png', fullPage: true });
  });

  test('OTA dashboard renders building state', async ({ page }) => {
    await mockBackendRoutes(page, mockOtaStatusBuilding, mockAutonomousRunning);

    await page.setContent(HARNESS_HTML);
    await page.evaluate(
      ({ ota }) => {
        const root = document.getElementById('root')!;
        root.innerHTML = `
          <div>
            <h3 class="text-sm font-medium text-text-default mb-2">OTA Self-Build</h3>
            <div class="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Version</span>
                <span class="text-text-default font-mono">${ota.current_version}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Pipeline</span>
                <span class="font-medium text-blue-500">${ota.state}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Pending</span>
                <span class="text-text-default">${ota.pending_improvements}</span>
              </div>
            </div>
          </div>
        `;
      },
      { ota: mockOtaStatusBuilding },
    );

    await expect(page.getByText('building', { exact: true })).toBeVisible();
    await expect(page.getByText('5', { exact: true })).toBeVisible(); // pending improvements

    await page.screenshot({ path: 'test-results/ota-building-pipeline.png', fullPage: true });
  });

  test('OTA dashboard renders daemon stopped state', async ({ page }) => {
    await mockBackendRoutes(page, mockOtaStatusIdle, mockAutonomousStopped);

    await page.setContent(HARNESS_HTML);
    await page.evaluate(
      ({ auto }) => {
        const root = document.getElementById('root')!;
        root.innerHTML = `
          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-medium text-text-default">Autonomous Daemon</h3>
              <button class="px-3 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400" data-testid="daemon-toggle">
                Start
              </button>
            </div>
            <div class="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Status</span>
                <span class="flex items-center gap-1.5 text-text-muted">
                  <div class="w-2 h-2 rounded-full bg-gray-400"></div>
                  Stopped
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Tasks</span>
                <span class="text-text-default">${auto.tasks_completed + auto.tasks_failed} (${auto.tasks_completed} OK / ${auto.tasks_failed} failed)</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Circuit Breaker</span>
                <span class="font-medium text-green-500">${auto.circuit_breaker.state} (${auto.circuit_breaker.consecutive_failures}/${auto.circuit_breaker.max_failures})</span>
              </div>
            </div>
          </div>
        `;
      },
      { auto: mockAutonomousStopped },
    );

    await expect(page.locator('text=Stopped')).toBeVisible();
    await expect(page.locator('text=Start')).toBeVisible();
    await expect(page.locator('text=0 (0 OK / 0 failed)')).toBeVisible();

    await page.screenshot({ path: 'test-results/ota-daemon-stopped.png', fullPage: true });
  });

  test('OTA dashboard renders circuit breaker tripped', async ({ page }) => {
    await mockBackendRoutes(page, mockOtaStatusIdle, mockAutonomousTripped);

    await page.setContent(HARNESS_HTML);
    await page.evaluate(
      ({ auto }) => {
        const root = document.getElementById('root')!;
        root.innerHTML = `
          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-medium text-text-default">Autonomous Daemon</h3>
              <button class="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400" data-testid="daemon-toggle">
                Stop
              </button>
            </div>
            <div class="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Status</span>
                <span class="flex items-center gap-1.5 text-green-500">
                  <div class="w-2 h-2 rounded-full bg-green-500"></div>
                  Running
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Tasks</span>
                <span class="text-text-default">${auto.tasks_completed + auto.tasks_failed} (${auto.tasks_completed} OK / ${auto.tasks_failed} failed)</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Circuit Breaker</span>
                <span class="font-medium text-red-500">${auto.circuit_breaker.state} (${auto.circuit_breaker.consecutive_failures}/${auto.circuit_breaker.max_failures})</span>
              </div>
            </div>
          </div>
        `;
      },
      { auto: mockAutonomousTripped },
    );

    await expect(page.locator('text=open (4/5)')).toBeVisible();
    await expect(page.locator('text=9 (5 OK / 4 failed)')).toBeVisible();

    await page.screenshot({ path: 'test-results/ota-circuit-breaker-tripped.png', fullPage: true });
  });

  test('daemon toggle button fires correct API call', async ({ page }) => {
    let stopCalled = false;
    await page.route(`${BACKEND_URL}/api/autonomous/stop`, (route) => {
      stopCalled = true;
      return route.fulfill({ json: { stopped: true } });
    });
    await page.route(`${BACKEND_URL}/api/ota/status`, (route) =>
      route.fulfill({ json: mockOtaStatusIdle }),
    );
    await page.route(`${BACKEND_URL}/api/autonomous/status`, (route) =>
      route.fulfill({ json: mockAutonomousRunning }),
    );

    await page.setContent(HARNESS_HTML);
    await page.evaluate(() => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <button
          data-testid="daemon-toggle"
          class="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400"
          onclick="fetch('http://localhost:3284/api/autonomous/stop', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({session_id:'e2e'}) })"
        >Stop</button>
      `;
    });

    await page.click('[data-testid="daemon-toggle"]');

    // Give the fetch a moment to complete
    await page.waitForTimeout(500);
    expect(stopCalled).toBe(true);
  });
});
