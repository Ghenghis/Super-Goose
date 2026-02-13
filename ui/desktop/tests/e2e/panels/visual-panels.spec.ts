/**
 * Visual Regression E2E Tests for key Super-Goose panels.
 *
 * Uses inline HTML harness pattern (no Electron needed) with
 * Playwright's toHaveScreenshot() for automated baseline comparison.
 *
 * Run:
 *   npx playwright test panels/visual-panels --update-snapshots  # first time
 *   npx playwright test panels/visual-panels                     # regression
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const BACKEND_URL = 'http://localhost:3284';

/** Dark-themed harness matching the sg-* design tokens. */
const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Panel Visual Regression</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 24px;
    }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .text-lg { font-size: 1.125rem; }
    .text-text-default { color: #e0e0e0; }
    .text-text-muted { color: #888; }
    .text-green-500 { color: #22c55e; }
    .text-blue-500 { color: #3b82f6; }
    .text-red-500 { color: #ef4444; }
    .text-yellow-500 { color: #eab308; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-mono { font-family: 'SF Mono', 'Fira Code', monospace; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mt-2 { margin-top: 0.5rem; }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded { border-radius: 0.25rem; }
    .border { border: 1px solid; }
    .border-border-default { border-color: #2a2a35; }
    .bg-background-default { background: #12121a; }
    .bg-background-subtle { background: #1a1a25; }
    .w-2 { width: 0.5rem; }
    .h-2 { height: 0.5rem; }
    .w-3 { width: 0.75rem; }
    .h-3 { height: 0.75rem; }
    .rounded-full { border-radius: 9999px; }
    .bg-green-500 { background-color: #22c55e; }
    .bg-blue-500 { background-color: #3b82f6; }
    .bg-gray-400 { background-color: #9ca3af; }
    .bg-red-500 { background-color: #ef4444; }
    .bg-yellow-500 { background-color: #eab308; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opacity-60 { opacity: 0.6; }
    .cursor-pointer { cursor: pointer; }
    .inline-flex { display: inline-flex; }
    .tab-active { background: #2a2a35; color: #e0e0e0; border-bottom: 2px solid #3b82f6; }
    .tab-inactive { background: transparent; color: #888; }
    .tab { padding: 0.5rem 1rem; font-size: 0.875rem; border: none; cursor: pointer; }
    #root { max-width: 480px; margin: 0 auto; }
    select { background: #1a1a25; color: #e0e0e0; border: 1px solid #2a2a35; padding: 0.375rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; }
    input[type="range"] { width: 100%; accent-color: #3b82f6; }
    input[type="checkbox"] { accent-color: #3b82f6; }
    button.primary { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; }
    button.danger { background: rgba(239,68,68,0.2); color: #f87171; border: none; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; }
    button.success { background: rgba(34,197,94,0.2); color: #4ade80; border: none; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; }
    .progress-bar { background: #2a2a35; border-radius: 0.25rem; height: 0.5rem; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const agentStreamEvents = [
  { type: 'status', agent: 'Super-Goose', status: 'Acting', contextUsage: 42 },
  { type: 'status', agent: 'Code Analyst', status: 'Gathering', contextUsage: 18 },
  { type: 'status', agent: 'Test Runner', status: 'Idle', contextUsage: 5 },
  { type: 'tool_call', tool: 'Read', file: 'AppSidebar.tsx', status: 'success' },
  { type: 'tool_call', tool: 'Edit', file: 'main.ts', status: 'running' },
  { type: 'tool_call', tool: 'Bash', command: 'npm test', status: 'success' },
];

const coreList = [
  { name: 'FreeformCore', description: 'General-purpose freeform agent' },
  { name: 'StructuredCore', description: 'Task-oriented structured agent' },
  { name: 'OrchestratorCore', description: 'Multi-agent orchestrator' },
  { name: 'AdversarialCore', description: 'Red-team adversarial testing' },
  { name: 'ResearchCore', description: 'Deep research and analysis' },
  { name: 'CreativeCore', description: 'Creative writing and ideation' },
];

// ---------------------------------------------------------------------------
// Mock routes helper
// ---------------------------------------------------------------------------

async function mockPanelRoutes(page: Page) {
  await page.route(`${BACKEND_URL}/api/agent/**`, (route) =>
    route.fulfill({ json: { success: true } }),
  );
  await page.route(`${BACKEND_URL}/api/agent/core-config`, (route) =>
    route.fulfill({
      json: {
        auto_select: true,
        confidence_threshold: 0.7,
        preferred_core: 'freeform',
        priority_order: ['freeform', 'structured', 'orchestrator', 'adversarial', 'research', 'creative'],
      },
    }),
  );
  await page.route(`${BACKEND_URL}/api/settings/**`, (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route(`${BACKEND_URL}/api/features/**`, (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Panel Visual Regression', () => {

  // -------------------------------------------------------------------------
  // 1. AgentsPanel — Active Tab (with agent events)
  // -------------------------------------------------------------------------
  test('AgentsPanel Active tab with agent events', async ({ page }) => {
    await mockPanelRoutes(page);
    await page.setContent(HARNESS_HTML);

    await page.evaluate((events) => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <div class="space-y-4">
          <div class="flex gap-2 mb-3" style="border-bottom: 1px solid #2a2a35">
            <button class="tab tab-active">Active</button>
            <button class="tab tab-inactive">Cores</button>
            <button class="tab tab-inactive">Builder</button>
          </div>

          <div>
            <h3 class="text-sm font-semibold text-text-default mb-2">Agent Status</h3>
            ${events.filter(e => e.type === 'status').map(e => `
              <div class="flex items-center justify-between p-3 rounded-lg border border-border-default bg-background-default mb-2">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full ${e.status === 'Acting' ? 'bg-green-500' : e.status === 'Gathering' ? 'bg-blue-500' : 'bg-gray-400'}" aria-label="${e.status}"></div>
                  <span class="text-sm font-medium text-text-default">${e.agent}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-text-muted">${e.status}</span>
                  <span class="text-xs font-mono text-text-muted">${e.contextUsage}%</span>
                </div>
              </div>
            `).join('')}
          </div>

          <div>
            <h3 class="text-sm font-semibold text-text-default mb-2">Recent Tool Calls</h3>
            ${events.filter(e => e.type === 'tool_call').map(e => `
              <div class="flex items-center justify-between p-2 rounded border border-border-default bg-background-subtle mb-1">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full ${e.status === 'success' ? 'bg-green-500' : e.status === 'running' ? 'bg-blue-500' : 'bg-red-500'}" aria-label="${e.status}"></div>
                  <span class="text-xs font-mono">${e.tool}</span>
                </div>
                <span class="text-xs text-text-muted truncate" style="max-width:200px">${e.file || e.command || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }, agentStreamEvents);

    await expect(page.locator('text=Super-Goose')).toBeVisible();
    await expect(page.locator('text=Code Analyst')).toBeVisible();
    await expect(page.locator('text=Test Runner')).toBeVisible();

    await expect(page).toHaveScreenshot('agents-panel-active.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 2. AgentsPanel — Cores Tab
  // -------------------------------------------------------------------------
  test('AgentsPanel Cores tab with core list', async ({ page }) => {
    await mockPanelRoutes(page);
    await page.setContent(HARNESS_HTML);

    await page.evaluate((cores) => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <div class="space-y-4">
          <div class="flex gap-2 mb-3" style="border-bottom: 1px solid #2a2a35">
            <button class="tab tab-inactive">Active</button>
            <button class="tab tab-active">Cores</button>
            <button class="tab tab-inactive">Builder</button>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold text-text-default">Available Cores</h3>
              <span class="text-xs text-text-muted">${cores.length} cores</span>
            </div>
            ${cores.map((c, i) => `
              <div class="flex items-center justify-between p-3 rounded-lg border border-border-default ${i === 0 ? 'bg-background-subtle' : 'bg-background-default'} mb-2 cursor-pointer">
                <div class="flex flex-col gap-1">
                  <span class="text-sm font-medium text-text-default">${c.name}</span>
                  <span class="text-xs text-text-muted">${c.description}</span>
                </div>
                ${i === 0 ? '<span class="text-xs text-green-500 font-medium">Active</span>' : '<button class="text-xs text-blue-500">Switch</button>'}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }, coreList);

    await expect(page.locator('text=FreeformCore')).toBeVisible();
    await expect(page.locator('text=6 cores')).toBeVisible();

    await expect(page).toHaveScreenshot('agents-panel-cores.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 3. AgentsPanel — Builder Tab
  // -------------------------------------------------------------------------
  test('AgentsPanel Builder tab with configuration', async ({ page }) => {
    await mockPanelRoutes(page);
    await page.setContent(HARNESS_HTML);

    await page.evaluate((cores) => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <div class="space-y-4">
          <div class="flex gap-2 mb-3" style="border-bottom: 1px solid #2a2a35">
            <button class="tab tab-inactive">Active</button>
            <button class="tab tab-inactive">Cores</button>
            <button class="tab tab-active">Builder</button>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-sm text-text-default">Enable auto-selection</label>
              <input type="checkbox" checked />
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm text-text-default">Confidence threshold</label>
                <span class="text-xs font-mono text-text-muted">0.7</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value="0.7" />
            </div>

            <div>
              <label class="text-sm text-text-default mb-2" style="display:block">Preferred core</label>
              <select>
                ${cores.map(c => `<option value="${c.name.toLowerCase().replace('core','')}">${c.name}</option>`).join('')}
              </select>
            </div>

            <div>
              <h4 class="text-sm font-medium text-text-default mb-2">Core Priority Order</h4>
              ${cores.map((c, i) => `
                <div class="flex items-center justify-between p-2 rounded border border-border-default bg-background-default mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-text-muted">#${i + 1}</span>
                    <span class="text-sm text-text-default">${c.name}</span>
                  </div>
                  <div class="flex gap-1">
                    <button class="text-xs text-text-muted" ${i === 0 ? 'disabled style="opacity:0.3"' : ''}>&#9650;</button>
                    <button class="text-xs text-text-muted" ${i === cores.length - 1 ? 'disabled style="opacity:0.3"' : ''}>&#9660;</button>
                  </div>
                </div>
              `).join('')}
            </div>

            <button class="primary" style="width:100%">Save Configuration</button>
          </div>
        </div>
      `;
    }, coreList);

    await expect(page.locator('text=Enable auto-selection')).toBeVisible();
    await expect(page.locator('text=Save Configuration')).toBeVisible();

    await expect(page).toHaveScreenshot('agents-panel-builder.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 4. Budget Panel
  // -------------------------------------------------------------------------
  test('BudgetPanel with cost tracking data', async ({ page }) => {
    await page.route(`${BACKEND_URL}/api/cost/**`, (route) =>
      route.fulfill({
        json: {
          total_cost: 12.47,
          budget_limit: 50.0,
          session_cost: 2.15,
          model_breakdown: [
            { model: 'claude-opus-4-6', cost: 8.32, calls: 45 },
            { model: 'claude-sonnet-4-5', cost: 3.15, calls: 120 },
            { model: 'claude-haiku-4-5', cost: 1.0, calls: 300 },
          ],
        },
      }),
    );

    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-text-default">Cost Tracking</h3>

          <div class="p-4 rounded-lg border border-border-default bg-background-default space-y-4">
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Total Cost</span>
              <span class="text-text-default font-mono font-medium">$12.47</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Budget Limit</span>
              <span class="text-text-default font-mono">$50.00</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Session Cost</span>
              <span class="text-text-default font-mono">$2.15</span>
            </div>

            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-text-muted">Budget Used</span>
                <span class="text-text-default">25%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill bg-blue-500" style="width: 25%"></div>
              </div>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-medium text-text-default mb-2">Model Breakdown</h4>
            <div class="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span class="text-text-default">claude-opus-4-6</span>
                </div>
                <div class="flex gap-3">
                  <span class="text-text-muted text-xs">45 calls</span>
                  <span class="font-mono text-text-default">$8.32</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-green-500"></div>
                  <span class="text-text-default">claude-sonnet-4-5</span>
                </div>
                <div class="flex gap-3">
                  <span class="text-text-muted text-xs">120 calls</span>
                  <span class="font-mono text-text-default">$3.15</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <span class="text-text-default">claude-haiku-4-5</span>
                </div>
                <div class="flex gap-3">
                  <span class="text-text-muted text-xs">300 calls</span>
                  <span class="font-mono text-text-default">$1.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Cost Tracking')).toBeVisible();
    await expect(page.locator('text=$12.47')).toBeVisible();

    await expect(page).toHaveScreenshot('budget-panel.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 5. Guardrails Panel
  // -------------------------------------------------------------------------
  test('GuardrailsPanel with active rules', async ({ page }) => {
    await page.route(`${BACKEND_URL}/api/enterprise/guardrails/**`, (route) =>
      route.fulfill({
        json: {
          rules: [
            { id: 'no-secrets', name: 'Secret Detection', enabled: true, severity: 'critical', matches: 3 },
            { id: 'no-rm-rf', name: 'Destructive Command Block', enabled: true, severity: 'high', matches: 1 },
            { id: 'code-review', name: 'Code Review Required', enabled: true, severity: 'medium', matches: 12 },
            { id: 'test-coverage', name: 'Test Coverage Check', enabled: false, severity: 'low', matches: 0 },
          ],
        },
      }),
    );

    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      const root = document.getElementById('root')!;
      const severityColor: Record<string, string> = {
        critical: 'text-red-500',
        high: 'text-yellow-500',
        medium: 'text-blue-500',
        low: 'text-text-muted',
      };
      const rules = [
        { id: 'no-secrets', name: 'Secret Detection', enabled: true, severity: 'critical', matches: 3 },
        { id: 'no-rm-rf', name: 'Destructive Command Block', enabled: true, severity: 'high', matches: 1 },
        { id: 'code-review', name: 'Code Review Required', enabled: true, severity: 'medium', matches: 12 },
        { id: 'test-coverage', name: 'Test Coverage Check', enabled: false, severity: 'low', matches: 0 },
      ];

      root.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-text-default">Guardrails</h3>
            <span class="text-xs text-text-muted">${rules.filter(r => r.enabled).length}/${rules.length} active</span>
          </div>

          ${rules.map(r => `
            <div class="p-3 rounded-lg border border-border-default ${r.enabled ? 'bg-background-default' : 'bg-background-default opacity-60'} flex items-center justify-between">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-text-default">${r.name}</span>
                  <span class="text-xs ${severityColor[r.severity] || 'text-text-muted'}">${r.severity}</span>
                </div>
                <span class="text-xs text-text-muted">${r.matches} match${r.matches !== 1 ? 'es' : ''}</span>
              </div>
              <input type="checkbox" ${r.enabled ? 'checked' : ''} />
            </div>
          `).join('')}
        </div>
      `;
    });

    await expect(page.locator('text=Guardrails')).toBeVisible();
    await expect(page.locator('text=Secret Detection')).toBeVisible();

    await expect(page).toHaveScreenshot('guardrails-panel.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 6. Autonomous Dashboard — Running State
  // -------------------------------------------------------------------------
  test('AutonomousDashboard running state', async ({ page }) => {
    await page.route(`${BACKEND_URL}/api/autonomous/status`, (route) =>
      route.fulfill({
        json: {
          running: true,
          uptime_seconds: 7200,
          tasks_completed: 12,
          tasks_failed: 1,
          circuit_breaker: { state: 'closed', consecutive_failures: 0, max_failures: 5, last_failure: null },
          current_task: 'Analyzing test coverage gaps',
        },
      }),
    );

    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-text-default">Autonomous Daemon</h3>
            <button class="danger">Stop</button>
          </div>

          <div class="p-4 rounded-lg border border-border-default bg-background-default space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Status</span>
              <span class="flex items-center gap-2 text-green-500">
                <div class="w-2 h-2 rounded-full bg-green-500"></div>
                Running
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Uptime</span>
              <span class="text-text-default font-mono">2h 0m</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Tasks</span>
              <span class="text-text-default">13 (12 OK / 1 failed)</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Circuit Breaker</span>
              <span class="text-green-500 font-medium">closed (0/5)</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Current Task</span>
              <span class="text-xs text-text-default">Analyzing test coverage gaps</span>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.getByText('Running', { exact: true })).toBeVisible();
    await expect(page.locator('text=Analyzing test coverage gaps')).toBeVisible();

    await expect(page).toHaveScreenshot('autonomous-running.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 7. Autonomous Dashboard — Stopped State
  // -------------------------------------------------------------------------
  test('AutonomousDashboard stopped state', async ({ page }) => {
    await page.route(`${BACKEND_URL}/api/autonomous/status`, (route) =>
      route.fulfill({
        json: {
          running: false,
          uptime_seconds: 0,
          tasks_completed: 0,
          tasks_failed: 0,
          circuit_breaker: { state: 'closed', consecutive_failures: 0, max_failures: 5, last_failure: null },
          current_task: null,
        },
      }),
    );

    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      const root = document.getElementById('root')!;
      root.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-text-default">Autonomous Daemon</h3>
            <button class="success">Start</button>
          </div>

          <div class="p-4 rounded-lg border border-border-default bg-background-default space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Status</span>
              <span class="flex items-center gap-2 text-text-muted">
                <div class="w-2 h-2 rounded-full bg-gray-400"></div>
                Stopped
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Uptime</span>
              <span class="text-text-default font-mono">—</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Tasks</span>
              <span class="text-text-default">0</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Circuit Breaker</span>
              <span class="text-green-500 font-medium">closed (0/5)</span>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-background-subtle text-xs text-text-muted text-center">
            Daemon is not running. Click Start to begin autonomous task processing.
          </div>
        </div>
      `;
    });

    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.locator('text=Daemon is not running')).toBeVisible();

    await expect(page).toHaveScreenshot('autonomous-stopped.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});
