import { test as base, Page, Browser, chromium } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(require('child_process').exec);

type GooseTestFixtures = {
  goosePage: Page;
};

/**
 * Test-scoped fixture that launches a fresh Electron app for EACH test.
 *
 * Isolation: ⚠️ Partial - each test gets a fresh app instance, but uses ambient user config
 * Speed: ⚠️ Slow - ~3s startup overhead per test
 *
 * This ensures each test starts with a fresh app instance, but the app uses the
 * user's existing Goose configuration (providers, models, etc.).
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *
 *   test('my test', async ({ goosePage }) => {
 *     await goosePage.waitForSelector('[data-testid="chat-input"]');
 *     // ... test code
 *   });
 */
export const test = base.extend<GooseTestFixtures>({
  // Test-scoped fixture: launches a fresh Electron app for each test
  goosePage: async ({}, use, testInfo) => {
    console.log(`Launching fresh Electron app for test: ${testInfo.title}`);

    let appProcess: ChildProcess | null = null;
    let browser: Browser | null = null;

    try {
      // Assign a unique debug port for this test to enable parallel execution.
      // Base port 19222 (NOT 9222 which is often taken by Chrome DevTools / extensions).
      // Offset by worker index to avoid collisions in parallel execution.
      const debugPort = 19222 + (testInfo.parallelIndex * 10);
      console.log(`Using debug port ${debugPort} for parallel test execution`);

      // Start the electron-forge process with Playwright remote debugging enabled
      // Use detached mode on Unix to create a process group we can kill together
      // On Windows, shell: true is required so spawn resolves npm.cmd via PATHEXT
      // Tell the Electron app to connect to the goosed backend that
      // global-setup.ts already started, instead of spawning its own.
      // GOOSE_EXTERNAL_BACKEND=1 tells goosed.ts to connect to an external backend.
      // GOOSE_PORT tells it which port to connect on (matches global-setup).
      const backendPort = process.env.GOOSE_PORT || '3284';

      appProcess = spawn('npm', ['run', 'start-gui'], {
        cwd: join(__dirname, '../..'),
        stdio: 'pipe',
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          ELECTRON_IS_DEV: '1',
          NODE_ENV: 'development',
          GOOSE_ALLOWLIST_BYPASS: 'true',
          ENABLE_PLAYWRIGHT: 'true',
          PLAYWRIGHT_DEBUG_PORT: debugPort.toString(),
          RUST_LOG: 'info',
          // Connect to the global-setup goosed backend instead of starting a new one
          GOOSE_EXTERNAL_BACKEND: '1',
          GOOSE_PORT: backendPort,
        }
      });

      // Log process output — always log stderr (contains backend startup info),
      // only log stdout if DEBUG_TESTS is set (too noisy otherwise)
      appProcess.stdout?.on('data', (data) => {
        if (process.env.DEBUG_TESTS) {
          console.log('App stdout:', data.toString().trim());
        }
      });

      appProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          console.log('App stderr:', msg);
        }
      });

      // Wait for the app to start and remote debugging to be available.
      // electron-forge start runs: generate-api → build main/preload → launch Electron.
      // This can take 10-20 seconds, so we wait before trying CDP connection.
      console.log(`Waiting for Electron app to start on port ${debugPort}...`);

      // Give electron-forge time to compile and launch Electron (~15s on first run)
      const initialDelay = 15000;
      console.log(`Waiting ${initialDelay / 1000}s for electron-forge to build and launch...`);
      await new Promise(resolve => setTimeout(resolve, initialDelay));

      const maxRetries = 150; // 150 retries * 400ms = 60 seconds max after initial delay
      const retryDelay = 400; // 400ms between retries

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
          console.log(`Connected to Electron app on attempt ${attempt} (~${initialDelay / 1000 + (attempt * retryDelay) / 1000}s total)`);
          break;
        } catch (error: unknown) {
          if (attempt === maxRetries) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to connect to Electron app after ${maxRetries} attempts (~${initialDelay / 1000 + (maxRetries * retryDelay) / 1000}s total). Last error: ${errMsg}`);
          }
          // Wait before next retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      if (!browser) {
        throw new Error('Browser connection failed unexpectedly');
      }

      // Get the electron app context and first page
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser contexts found');
      }

      const pages = contexts[0].pages();
      if (pages.length === 0) {
        throw new Error('No windows/pages found');
      }

      const page = pages[0];

      // Wait for page to be ready
      await page.waitForLoadState('domcontentloaded');
      console.log('DOM content loaded');

      // Try to wait for networkidle
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        console.log('Network idle reached');
      } catch (_error: unknown) {
        console.log('NetworkIdle timeout (likely due to MCP activity), continuing...');
      }

      // Wait for React app to mount (root has children)
      await page.waitForFunction(() => {
        const root = document.getElementById('root');
        return root && root.children.length > 0;
      }, { timeout: 30000 });
      console.log('React root mounted');

      // Wait for the app to get past the "Loading..." splash screen.
      // The app shows "Loading..." while connecting to the goosed backend.
      // Once connected, it shows the main UI with buttons, sidebar, etc.
      try {
        await page.waitForFunction(() => {
          const body = document.body.innerText || '';
          // Loading screen just shows "Loading..." — wait for more substantial content
          const pastLoading = body.length > 100;
          // Also check for interactive elements
          const hasButtons = document.querySelectorAll('button').length > 3;
          const hasSidebar = !!document.querySelector('[data-sidebar], aside, nav');
          const hasInput = !!document.querySelector('textarea, [contenteditable], input');
          return pastLoading || hasButtons || hasSidebar || hasInput;
        }, { timeout: 45000 });
        console.log('App fully loaded (past Loading... screen)');
      } catch (_error: unknown) {
        console.log('App may still be on Loading... screen, continuing...');
      }

      // Brief extra hydration buffer
      try {
        await page.waitForTimeout(2000);
      } catch {
        // Page may have closed
      }

      console.log('App ready, starting test...');

      // Provide the page to the test
      await use(page);

    } finally {
      console.log('Cleaning up Electron app for this test...');

      // Close the CDP connection first (fast)
      if (browser) {
        await browser.close().catch(() => {});
      }

      // Kill the npm process tree with a tight timeout.
      // On Windows, taskkill /F /T can be slow — use spawn (fire-and-forget)
      // instead of execAsync which can hang indefinitely.
      if (appProcess && appProcess.pid) {
        try {
          if (process.platform === 'win32') {
            // Fire-and-forget: spawn taskkill without waiting
            spawn('taskkill', ['/F', '/T', '/PID', String(appProcess.pid)], {
              shell: false,
              stdio: 'ignore',
              detached: true,
            }).unref();
            // Also kill any Super-Goose.exe (Electron) instances
            spawn('taskkill', ['/F', '/IM', 'Super-Goose.exe'], {
              shell: false,
              stdio: 'ignore',
              detached: true,
            }).unref();
          } else {
            try {
              process.kill(-appProcess.pid, 'SIGKILL');
            } catch {
              // Process already exited
            }
          }
          // Wait for the process to actually die and release the debug port.
          // On Windows, taskkill /F /T is async — the port may stay bound for a few seconds.
          const cleanupPort = 19222 + (testInfo.parallelIndex * 10);
          const maxPortWait = 8000; // 8 seconds max
          const portStart = Date.now();
          let portFree = false;
          while (Date.now() - portStart < maxPortWait) {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
              // Try to connect to the port — if it fails, port is free
              const { stdout } = await execAsync(
                process.platform === 'win32'
                  ? `netstat -ano | findstr ":${cleanupPort}" | findstr "LISTENING"`
                  : `lsof -ti :${cleanupPort} 2>/dev/null || true`
              );
              if (!stdout.trim()) {
                portFree = true;
                break;
              }
            } catch {
              // Command failed = port is free
              portFree = true;
              break;
            }
          }
          console.log(`Cleaned up app process (port ${cleanupPort} ${portFree ? 'free' : 'may still be in use'}, ${Date.now() - portStart}ms)`);
        } catch (error: unknown) {
          const errObj = error as { code?: string; message?: string };
          if (errObj.code !== 'ESRCH' && !errObj.message?.includes('No such process')) {
            console.error('Error killing app process:', error);
          }
        }
      }
    }
  },
});

export { expect } from '@playwright/test';
