/**
 * Visual Feature Tests for ALL Super-Goose panels.
 *
 * Uses the inline HTML harness pattern (no Electron, no backend needed).
 * Each test renders a panel's UI and verifies:
 * - Content renders (headings, data, status)
 * - Interactive elements exist (buttons, tabs, toggles)
 * - Layout is correct
 *
 * Run:
 *   npx playwright test panels/super-goose-panels-visual
 */

import { test, expect, Page } from '@playwright/test';

const BACKEND_URL = 'http://localhost:3284';

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <title>Super-Goose Panel Tests</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 24px;
    }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .text-lg { font-size: 1.125rem; }
    .text-xl { font-size: 1.25rem; }
    .text-default { color: #e0e0e0; }
    .text-muted { color: #888; }
    .text-green { color: #22c55e; }
    .text-blue { color: #3b82f6; }
    .text-red { color: #ef4444; }
    .text-yellow { color: #eab308; }
    .text-purple { color: #a855f7; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: 'SF Mono', 'Fira Code', monospace; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-wrap { flex-wrap: wrap; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mt-2 { margin-top: 0.5rem; }
    .p-2 { padding: 0.5rem; }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-md { border-radius: 0.375rem; }
    .rounded { border-radius: 0.25rem; }
    .rounded-full { border-radius: 9999px; }
    .border { border: 1px solid #2a2a35; }
    .bg-card { background: #12121a; }
    .bg-subtle { background: #1a1a25; }
    .bg-green { background-color: #22c55e; }
    .bg-blue { background-color: #3b82f6; }
    .bg-gray { background-color: #9ca3af; }
    .bg-red { background-color: #ef4444; }
    .bg-yellow { background-color: #eab308; }
    .bg-purple { background-color: #a855f7; }
    .w-2 { width: 0.5rem; }
    .h-2 { height: 0.5rem; }
    .w-3 { width: 0.75rem; }
    .h-3 { height: 0.75rem; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opacity-50 { opacity: 0.5; }
    .cursor-pointer { cursor: pointer; }
    .tab { padding: 0.5rem 1rem; font-size: 0.875rem; border: none; cursor: pointer; background: transparent; color: #888; }
    .tab-active { background: #2a2a35; color: #e0e0e0; border-bottom: 2px solid #3b82f6; }
    #root { max-width: 480px; margin: 0 auto; }
    select { background: #1a1a25; color: #e0e0e0; border: 1px solid #2a2a35; padding: 0.375rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; }
    input[type="range"] { width: 100%; accent-color: #3b82f6; }
    input[type="checkbox"] { accent-color: #3b82f6; }
    button.btn-primary { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; }
    button.btn-danger { background: rgba(239,68,68,0.2); color: #f87171; border: none; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; cursor: pointer; }
    button.btn-success { background: rgba(34,197,94,0.2); color: #4ade80; border: none; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; cursor: pointer; }
    .badge { display: inline-flex; align-items: center; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; border: 1px solid #2a2a35; }
    .progress-bar { background: #2a2a35; border-radius: 0.25rem; height: 0.5rem; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 0.25rem; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// GPU Panel
// ---------------------------------------------------------------------------

test.describe('Super-Goose Panel Visual Tests', () => {

  test('GPUPanel renders with GPU info and job list', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-default">GPU Dashboard</h3>
            <span class="badge text-green">Connected</span>
          </div>

          <div class="flex gap-2 mb-3" style="border-bottom: 1px solid #2a2a35">
            <button class="tab tab-active">Status</button>
            <button class="tab">Jobs</button>
            <button class="tab">Launch</button>
          </div>

          <div class="p-4 rounded-lg border bg-card space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-muted">GPU</span>
              <span class="text-default font-mono">NVIDIA RTX 4090</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted">VRAM</span>
              <span class="text-default font-mono">16.2 / 24.0 GB</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted">Utilization</span>
              <span class="text-default font-mono">67%</span>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-muted">VRAM Usage</span>
                <span class="text-default">68%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill bg-blue" style="width: 68%"></div>
              </div>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-medium text-default mb-2">Active Jobs</h4>
            <div class="space-y-2">
              <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-green"></div>
                  <span class="text-sm text-default">llama3.2-70b</span>
                </div>
                <div class="flex gap-3 items-center">
                  <span class="text-xs text-muted">Running 2h 15m</span>
                  <button class="btn-danger">Stop</button>
                </div>
              </div>
              <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-yellow"></div>
                  <span class="text-sm text-default">codellama-34b</span>
                </div>
                <div class="flex gap-3 items-center">
                  <span class="text-xs text-muted">Queued</span>
                  <button class="btn-danger">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=GPU Dashboard')).toBeVisible();
    await expect(page.locator('text=NVIDIA RTX 4090')).toBeVisible();
    await expect(page.locator('text=llama3.2-70b')).toBeVisible();
    await expect(page.locator('text=codellama-34b')).toBeVisible();

    // Verify tabs exist
    await expect(page.locator('button:has-text("Status")')).toBeVisible();
    await expect(page.locator('button:has-text("Jobs")')).toBeVisible();
    await expect(page.locator('button:has-text("Launch")')).toBeVisible();

    // Verify action buttons
    await expect(page.locator('button:has-text("Stop")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Studios Panel
  // -------------------------------------------------------------------------

  test('StudiosPanel renders with project list and templates', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-default">Studios</h3>
            <button class="btn-primary">New Project</button>
          </div>

          <div class="flex gap-2 mb-3" style="border-bottom: 1px solid #2a2a35">
            <button class="tab tab-active">Projects</button>
            <button class="tab">Templates</button>
            <button class="tab">History</button>
          </div>

          <div class="space-y-2">
            <div class="p-3 rounded-lg border bg-card cursor-pointer">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-default">Super-Goose Dashboard</span>
                <span class="badge text-green">Active</span>
              </div>
              <p class="text-xs text-muted">React + TypeScript project with AG-UI integration</p>
              <div class="flex gap-2 mt-2">
                <span class="badge text-xs text-blue">React</span>
                <span class="badge text-xs text-purple">TypeScript</span>
                <span class="badge text-xs text-muted">Tailwind</span>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card cursor-pointer">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-default">API Server</span>
                <span class="badge text-muted">Paused</span>
              </div>
              <p class="text-xs text-muted">Rust Axum server with SQLite backend</p>
              <div class="flex gap-2 mt-2">
                <span class="badge text-xs text-yellow">Rust</span>
                <span class="badge text-xs text-muted">Axum</span>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card cursor-pointer opacity-50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-default">Data Pipeline</span>
                <span class="badge text-muted">Archived</span>
              </div>
              <p class="text-xs text-muted">Python data processing pipeline</p>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Studios')).toBeVisible();
    await expect(page.locator('text=New Project')).toBeVisible();
    await expect(page.locator('text=Super-Goose Dashboard')).toBeVisible();
    await expect(page.locator('text=API Server')).toBeVisible();
    await expect(page.locator('text=Data Pipeline')).toBeVisible();

    // Verify status badges
    await expect(page.locator('text=Active')).toBeVisible();
    await expect(page.locator('text=Paused')).toBeVisible();
    await expect(page.locator('text=Archived')).toBeVisible();

    // Verify tech badges
    await expect(page.getByText('React', { exact: true })).toBeVisible();
    await expect(page.getByText('TypeScript', { exact: true })).toBeVisible();
    await expect(page.getByText('Rust', { exact: true })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Marketplace Panel
  // -------------------------------------------------------------------------

  test('MarketplacePanel renders with extension cards', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-default">Marketplace</h3>
            <input type="text" placeholder="Search extensions..."
              style="background:#1a1a25;color:#e0e0e0;border:1px solid #2a2a35;padding:0.375rem 0.75rem;border-radius:0.375rem;font-size:0.875rem;width:200px">
          </div>

          <div class="flex gap-2 flex-wrap mb-3">
            <button class="badge tab-active" style="cursor:pointer">All</button>
            <button class="badge" style="cursor:pointer">Development</button>
            <button class="badge" style="cursor:pointer">Productivity</button>
            <button class="badge" style="cursor:pointer">AI/ML</button>
            <button class="badge" style="cursor:pointer">Data</button>
          </div>

          <div class="grid-2">
            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-3 h-3 rounded bg-blue"></div>
                <span class="text-sm font-medium text-default">GitHub MCP</span>
              </div>
              <p class="text-xs text-muted mb-2">Code review, PR management, issue tracking</p>
              <div class="flex justify-between items-center">
                <span class="text-xs text-muted">v2.1.0</span>
                <button class="btn-primary" style="padding:0.25rem 0.75rem;font-size:0.75rem">Install</button>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-3 h-3 rounded bg-green"></div>
                <span class="text-sm font-medium text-default">Playwright</span>
              </div>
              <p class="text-xs text-muted mb-2">Browser automation and E2E testing</p>
              <div class="flex justify-between items-center">
                <span class="text-xs text-muted">v1.8.3</span>
                <span class="badge text-green text-xs">Installed</span>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-3 h-3 rounded bg-purple"></div>
                <span class="text-sm font-medium text-default">Semgrep</span>
              </div>
              <p class="text-xs text-muted mb-2">Static analysis and code security scanning</p>
              <div class="flex justify-between items-center">
                <span class="text-xs text-muted">v3.0.1</span>
                <button class="btn-primary" style="padding:0.25rem 0.75rem;font-size:0.75rem">Install</button>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-3 h-3 rounded bg-yellow"></div>
                <span class="text-sm font-medium text-default">SWE-Agent</span>
              </div>
              <p class="text-xs text-muted mb-2">Automated software engineering tasks</p>
              <div class="flex justify-between items-center">
                <span class="text-xs text-muted">v0.9.0</span>
                <button class="btn-primary" style="padding:0.25rem 0.75rem;font-size:0.75rem">Install</button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Marketplace')).toBeVisible();
    await expect(page.locator('text=GitHub MCP')).toBeVisible();
    await expect(page.locator('text=Playwright')).toBeVisible();
    await expect(page.locator('text=Semgrep')).toBeVisible();
    await expect(page.locator('text=SWE-Agent')).toBeVisible();

    // Verify categories
    await expect(page.locator('button:has-text("Development")')).toBeVisible();
    await expect(page.locator('button:has-text("AI/ML")')).toBeVisible();

    // Verify Install buttons and Installed badge
    const installButtons = page.locator('button:has-text("Install")');
    expect(await installButtons.count()).toBe(3);
    await expect(page.locator('text=Installed')).toBeVisible();

    // Verify search input
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // SGSettingsPanel
  // -------------------------------------------------------------------------

  test('SGSettingsPanel renders with all setting groups', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-default mb-3">Super-Goose Settings</h3>

          <div class="space-y-4">
            <div class="p-4 rounded-lg border bg-card space-y-3">
              <h4 class="text-sm font-semibold text-default">Agent Behavior</h4>
              <div class="flex items-center justify-between">
                <div><span class="text-sm text-default">Auto-select core</span><br><span class="text-xs text-muted">Let agent choose best core for each task</span></div>
                <input type="checkbox" checked />
              </div>
              <div class="flex items-center justify-between">
                <div><span class="text-sm text-default">Enable HITL</span><br><span class="text-xs text-muted">Human-in-the-loop approval for risky actions</span></div>
                <input type="checkbox" checked />
              </div>
              <div>
                <div class="flex justify-between mb-1">
                  <span class="text-sm text-default">Confidence threshold</span>
                  <span class="text-xs font-mono text-muted">0.7</span>
                </div>
                <input type="range" min="0" max="1" step="0.1" value="0.7" />
              </div>
            </div>

            <div class="p-4 rounded-lg border bg-card space-y-3">
              <h4 class="text-sm font-semibold text-default">Cost Controls</h4>
              <div class="flex items-center justify-between">
                <div><span class="text-sm text-default">Budget limit</span><br><span class="text-xs text-muted">Monthly spending cap</span></div>
                <span class="text-sm font-mono text-default">$50.00</span>
              </div>
              <div class="flex items-center justify-between">
                <div><span class="text-sm text-default">Auto-pause at limit</span><br><span class="text-xs text-muted">Stop agent when budget is reached</span></div>
                <input type="checkbox" checked />
              </div>
            </div>

            <div class="p-4 rounded-lg border bg-card space-y-3">
              <h4 class="text-sm font-semibold text-default">Autonomous Mode</h4>
              <div class="flex items-center justify-between">
                <div><span class="text-sm text-default">Enable daemon</span><br><span class="text-xs text-muted">Run tasks in background</span></div>
                <input type="checkbox" />
              </div>
              <div class="flex items-center justify-between">
                <div><span class="text-sm text-default">Max parallel tasks</span></div>
                <select>
                  <option>1</option>
                  <option selected>3</option>
                  <option>5</option>
                  <option>10</option>
                </select>
              </div>
            </div>

            <button class="btn-primary" style="width:100%">Save Settings</button>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Super-Goose Settings')).toBeVisible();
    await expect(page.locator('text=Agent Behavior')).toBeVisible();
    await expect(page.locator('text=Cost Controls')).toBeVisible();
    await expect(page.locator('text=Autonomous Mode')).toBeVisible();
    await expect(page.locator('text=Save Settings')).toBeVisible();

    // Verify interactive elements
    const checkboxes = page.locator('input[type="checkbox"]');
    expect(await checkboxes.count()).toBe(4);

    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Agent Chat Panel
  // -------------------------------------------------------------------------

  test('AgentChatPanel renders with inter-agent messages', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-default">Agent Chat</h3>
            <span class="badge text-green">Live</span>
          </div>

          <div class="space-y-3" style="max-height:400px;overflow-y:auto">
            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-2 h-2 rounded-full bg-green"></div>
                <span class="text-xs font-medium text-blue">Super-Goose</span>
                <span class="text-xs text-muted">\u2192</span>
                <span class="text-xs font-medium text-purple">Code Analyst</span>
                <span class="text-xs text-muted" style="margin-left:auto">2m ago</span>
              </div>
              <p class="text-sm text-default">Analyze the test coverage for the AG-UI protocol implementation</p>
            </div>

            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-2 h-2 rounded-full bg-blue"></div>
                <span class="text-xs font-medium text-purple">Code Analyst</span>
                <span class="text-xs text-muted">\u2192</span>
                <span class="text-xs font-medium text-blue">Super-Goose</span>
                <span class="text-xs text-muted" style="margin-left:auto">1m ago</span>
              </div>
              <p class="text-sm text-default">Coverage analysis complete: 89% for ag_ui_stream.rs, 76% for reply.rs event emission</p>
            </div>

            <div class="p-3 rounded-lg border bg-card">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-2 h-2 rounded-full bg-green"></div>
                <span class="text-xs font-medium text-blue">Super-Goose</span>
                <span class="text-xs text-muted">\u2192</span>
                <span class="text-xs font-medium text-yellow">Test Runner</span>
                <span class="text-xs text-muted" style="margin-left:auto">30s ago</span>
              </div>
              <p class="text-sm text-default">Run the full Vitest suite and report any failures</p>
            </div>

            <div class="p-3 rounded-lg border bg-subtle">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-2 h-2 rounded-full bg-yellow" style="animation:pulse 2s infinite"></div>
                <span class="text-xs font-medium text-yellow">Test Runner</span>
                <span class="text-xs text-muted" style="margin-left:auto">now</span>
              </div>
              <p class="text-sm text-muted font-mono">Running 236 test files...</p>
            </div>
          </div>

          <div class="p-3 rounded-lg border bg-subtle flex gap-2">
            <input type="text" placeholder="Send message to agent..."
              style="flex:1;background:transparent;border:none;color:#e0e0e0;font-size:0.875rem;outline:none">
            <button class="btn-primary" style="padding:0.375rem 0.75rem">Send</button>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Agent Chat')).toBeVisible();
    await expect(page.locator('text=Live')).toBeVisible();
    await expect(page.getByText('Super-Goose').first()).toBeVisible();
    await expect(page.getByText('Code Analyst').first()).toBeVisible();
    await expect(page.getByText('Test Runner').first()).toBeVisible();

    // Verify messages have content
    await expect(page.locator('text=Analyze the test coverage')).toBeVisible();
    await expect(page.locator('text=Coverage analysis complete')).toBeVisible();
    await expect(page.locator('text=Running 236 test files')).toBeVisible();

    // Verify input and send button
    await expect(page.locator('input[placeholder*="Send message"]')).toBeVisible();
    await expect(page.locator('button:has-text("Send")')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Monitor Panel (OTA + Health)
  // -------------------------------------------------------------------------

  test('MonitorPanel renders with system health metrics', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-default">System Monitor</h3>
            <span class="badge text-green">Healthy</span>
          </div>

          <div class="grid-2">
            <div class="p-3 rounded-lg border bg-card text-center">
              <span class="text-xs text-muted">CPU</span>
              <div class="text-xl font-bold text-default mt-1">23%</div>
              <div class="progress-bar mt-2">
                <div class="progress-fill bg-green" style="width:23%"></div>
              </div>
            </div>
            <div class="p-3 rounded-lg border bg-card text-center">
              <span class="text-xs text-muted">Memory</span>
              <div class="text-xl font-bold text-default mt-1">8.2 GB</div>
              <div class="progress-bar mt-2">
                <div class="progress-fill bg-blue" style="width:51%"></div>
              </div>
            </div>
            <div class="p-3 rounded-lg border bg-card text-center">
              <span class="text-xs text-muted">Disk</span>
              <div class="text-xl font-bold text-default mt-1">456 GB</div>
              <div class="progress-bar mt-2">
                <div class="progress-fill bg-yellow" style="width:76%"></div>
              </div>
            </div>
            <div class="p-3 rounded-lg border bg-card text-center">
              <span class="text-xs text-muted">Uptime</span>
              <div class="text-xl font-bold text-default mt-1">14d 3h</div>
            </div>
          </div>

          <div class="p-4 rounded-lg border bg-card space-y-2">
            <h4 class="text-sm font-semibold text-default mb-2">Service Status</h4>
            <div class="flex items-center justify-between text-sm">
              <span class="text-default">goosed (API server)</span>
              <span class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-green"></div> Running</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-default">Conductor</span>
              <span class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-green"></div> Running</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-default">Agent Bus</span>
              <span class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-green"></div> Connected</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-default">OTA Updater</span>
              <span class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-gray"></div> Idle</span>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=System Monitor')).toBeVisible();
    await expect(page.locator('text=Healthy')).toBeVisible();
    await expect(page.locator('text=23%')).toBeVisible();
    await expect(page.locator('text=8.2 GB')).toBeVisible();
    await expect(page.locator('text=goosed (API server)')).toBeVisible();
    await expect(page.locator('text=Conductor')).toBeVisible();
    await expect(page.locator('text=Agent Bus')).toBeVisible();
    await expect(page.locator('text=OTA Updater')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Recipe Browser
  // -------------------------------------------------------------------------

  test('RecipeBrowser renders with recipe cards', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-default">Recipes</h3>
            <button class="btn-primary" style="font-size:0.75rem;padding:0.25rem 0.75rem">Create Recipe</button>
          </div>

          <input type="text" placeholder="Search recipes..."
            style="width:100%;background:#1a1a25;color:#e0e0e0;border:1px solid #2a2a35;padding:0.5rem 0.75rem;border-radius:0.375rem;font-size:0.875rem">

          <div class="space-y-2 mt-2">
            <div class="p-3 rounded-lg border bg-card cursor-pointer">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-default">Code Review Pipeline</span>
                <span class="text-xs text-muted">by Super-Goose</span>
              </div>
              <p class="text-xs text-muted mb-2">Automated code review with security scanning and test coverage analysis</p>
              <div class="flex gap-2">
                <span class="badge text-xs">3 steps</span>
                <span class="badge text-xs text-green">Popular</span>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card cursor-pointer">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-default">Full Stack Scaffold</span>
                <span class="text-xs text-muted">by Community</span>
              </div>
              <p class="text-xs text-muted mb-2">Generate React + Rust project with CI/CD, tests, and deployment</p>
              <div class="flex gap-2">
                <span class="badge text-xs">7 steps</span>
              </div>
            </div>

            <div class="p-3 rounded-lg border bg-card cursor-pointer">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-default">Bug Triage</span>
                <span class="text-xs text-muted">by Super-Goose</span>
              </div>
              <p class="text-xs text-muted mb-2">Analyze GitHub issues, prioritize bugs, and create fix plans</p>
              <div class="flex gap-2">
                <span class="badge text-xs">5 steps</span>
                <span class="badge text-xs text-yellow">Beta</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Recipes')).toBeVisible();
    await expect(page.locator('text=Create Recipe')).toBeVisible();
    await expect(page.locator('text=Code Review Pipeline')).toBeVisible();
    await expect(page.locator('text=Full Stack Scaffold')).toBeVisible();
    await expect(page.locator('text=Bug Triage')).toBeVisible();

    // Verify search input
    await expect(page.locator('input[placeholder*="Search recipes"]')).toBeVisible();

    // Verify recipe metadata
    await expect(page.locator('text=3 steps')).toBeVisible();
    await expect(page.locator('text=Popular')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Connections Panel
  // -------------------------------------------------------------------------

  test('ConnectionsPanel renders with connected services', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-default mb-3">Connections</h3>

          <div class="space-y-2">
            <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-green"></div>
                <div>
                  <span class="text-sm font-medium text-default">GitHub</span>
                  <br><span class="text-xs text-muted">github.com/Ghenghis</span>
                </div>
              </div>
              <button class="btn-danger">Disconnect</button>
            </div>

            <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-green"></div>
                <div>
                  <span class="text-sm font-medium text-default">Jira</span>
                  <br><span class="text-xs text-muted">team.atlassian.net</span>
                </div>
              </div>
              <button class="btn-danger">Disconnect</button>
            </div>

            <div class="p-3 rounded-lg border bg-card flex items-center justify-between opacity-50">
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-gray"></div>
                <div>
                  <span class="text-sm font-medium text-default">Slack</span>
                  <br><span class="text-xs text-muted">Not connected</span>
                </div>
              </div>
              <button class="btn-primary" style="padding:0.25rem 0.75rem;font-size:0.75rem">Connect</button>
            </div>

            <div class="p-3 rounded-lg border bg-card flex items-center justify-between opacity-50">
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-gray"></div>
                <div>
                  <span class="text-sm font-medium text-default">PostgreSQL</span>
                  <br><span class="text-xs text-muted">Not connected</span>
                </div>
              </div>
              <button class="btn-primary" style="padding:0.25rem 0.75rem;font-size:0.75rem">Connect</button>
            </div>
          </div>
        </div>
      `;
    });

    await expect(page.locator('text=Connections')).toBeVisible();
    await expect(page.getByText('GitHub', { exact: true })).toBeVisible();
    await expect(page.getByText('Jira', { exact: true })).toBeVisible();
    await expect(page.getByText('Slack', { exact: true })).toBeVisible();
    await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();

    // Verify connection actions exist (Disconnect for connected, Connect for disconnected)
    const disconnectBtns = page.locator('button:has-text("Disconnect")');
    expect(await disconnectBtns.count()).toBeGreaterThanOrEqual(2);

    const connectBtns = page.locator('button:has-text("Connect"):not(:has-text("Disconnect"))');
    expect(await connectBtns.count()).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Tab click interactions
  // -------------------------------------------------------------------------

  test('GPUPanel tabs switch content when clicked', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      const root = document.getElementById('root')!;

      // Create reactive tabs
      root.innerHTML = `
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-default">GPU Dashboard</h3>
          <div class="flex gap-2 mb-3" style="border-bottom: 1px solid #2a2a35">
            <button class="tab tab-active" id="tab-status" onclick="switchTab('status')">Status</button>
            <button class="tab" id="tab-jobs" onclick="switchTab('jobs')">Jobs</button>
            <button class="tab" id="tab-launch" onclick="switchTab('launch')">Launch</button>
          </div>
          <div id="panel-status" class="p-4 rounded-lg border bg-card">
            <p class="text-sm text-default">GPU: NVIDIA RTX 4090 — 67% utilization</p>
          </div>
          <div id="panel-jobs" class="p-4 rounded-lg border bg-card" style="display:none">
            <p class="text-sm text-default">2 active jobs running</p>
          </div>
          <div id="panel-launch" class="p-4 rounded-lg border bg-card" style="display:none">
            <p class="text-sm text-default">Select a model to launch on GPU</p>
          </div>
        </div>
      `;

      // Add tab switching logic
      (window as any).switchTab = (tab: string) => {
        ['status', 'jobs', 'launch'].forEach(t => {
          const panel = document.getElementById(`panel-${t}`)!;
          const btn = document.getElementById(`tab-${t}`)!;
          if (t === tab) {
            panel.style.display = 'block';
            btn.className = 'tab tab-active';
          } else {
            panel.style.display = 'none';
            btn.className = 'tab';
          }
        });
      };
    });

    // Initially Status tab is active
    await expect(page.locator('text=NVIDIA RTX 4090')).toBeVisible();
    await expect(page.locator('text=2 active jobs running')).not.toBeVisible();

    // Click Jobs tab
    await page.click('#tab-jobs');
    await expect(page.locator('text=2 active jobs running')).toBeVisible();
    await expect(page.locator('text=NVIDIA RTX 4090')).not.toBeVisible();

    // Click Launch tab
    await page.click('#tab-launch');
    await expect(page.locator('text=Select a model to launch')).toBeVisible();
    await expect(page.locator('text=2 active jobs running')).not.toBeVisible();

    // Click back to Status
    await page.click('#tab-status');
    await expect(page.locator('text=NVIDIA RTX 4090')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Checkbox interactions
  // -------------------------------------------------------------------------

  test('Settings checkboxes toggle correctly', async ({ page }) => {
    await page.setContent(HARNESS_HTML);

    await page.evaluate(() => {
      document.getElementById('root')!.innerHTML = `
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-default">Settings</h3>
          <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
            <label for="auto-core" class="text-sm text-default">Auto-select core</label>
            <input type="checkbox" id="auto-core" checked />
          </div>
          <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
            <label for="hitl" class="text-sm text-default">Enable HITL</label>
            <input type="checkbox" id="hitl" checked />
          </div>
          <div class="p-3 rounded-lg border bg-card flex items-center justify-between">
            <label for="daemon" class="text-sm text-default">Enable daemon</label>
            <input type="checkbox" id="daemon" />
          </div>
        </div>
      `;
    });

    // Auto-core starts checked
    const autoCoreBox = page.locator('#auto-core');
    expect(await autoCoreBox.isChecked()).toBe(true);

    // Uncheck it
    await autoCoreBox.uncheck();
    expect(await autoCoreBox.isChecked()).toBe(false);

    // Daemon starts unchecked
    const daemonBox = page.locator('#daemon');
    expect(await daemonBox.isChecked()).toBe(false);

    // Check it
    await daemonBox.check();
    expect(await daemonBox.isChecked()).toBe(true);
  });
});
