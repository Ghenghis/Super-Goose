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
      // Assign a unique debug port for this test to enable parallel execution
      // Base port 9222, offset by worker index * 100 + parallel slot
      const debugPort = 9222 + (testInfo.parallelIndex * 10);
      console.log(`Using debug port ${debugPort} for parallel test execution`);

      // Start the electron-forge process with Playwright remote debugging enabled
      // Use detached mode on Unix to create a process group we can kill together
      // On Windows, shell: true is required so spawn resolves npm.cmd via PATHEXT
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
          PLAYWRIGHT_DEBUG_PORT: debugPort.toString(), // Unique port per test for parallel execution
          RUST_LOG: 'info', // Enable info-level logging for goosed backend
        }
      });

      // Log process output for debugging
      if (process.env.DEBUG_TESTS) {
        appProcess.stdout?.on('data', (data) => {
          console.log('App stdout:', data.toString());
        });

        appProcess.stderr?.on('data', (data) => {
          console.log('App stderr:', data.toString());
        });
      }

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

      // Wait for the app to fully hydrate — components, sidebar, and panels need time
      // to render after React mount. Electron + Vite dev server can be slow on first load.
      await page.waitForTimeout(5000);

      // Wait for actual interactive content to appear (chat input, sidebar, or settings)
      try {
        await page.waitForFunction(() => {
          // Look for signs the app is fully interactive
          const chatInput = document.querySelector('[data-testid="chat-input"], textarea, [contenteditable]');
          const sidebar = document.querySelector('[data-testid*="sidebar"], [data-super="true"], .super-goose-panel');
          const mainContent = document.querySelector('main, [role="main"], .app-content');
          return !!(chatInput || sidebar || mainContent);
        }, { timeout: 15000 });
        console.log('App interactive elements detected');
      } catch (_error: unknown) {
        console.log('Interactive elements not detected within timeout, continuing...');
      }

      console.log('App ready, starting test...');

      // Provide the page to the test
      await use(page);

    } finally {
      console.log('Cleaning up Electron app for this test...');

      // Close the CDP connection
      if (browser) {
        await browser.close().catch(console.error);
      }

      // Kill the npm process tree
      if (appProcess && appProcess.pid) {
        try {
          if (process.platform === 'win32') {
            // On Windows, kill the entire process tree
            await execAsync(`taskkill /F /T /PID ${appProcess.pid}`);
          } else {
            // On Unix, kill the entire process group
            try {
              // First try SIGTERM for graceful shutdown
              process.kill(-appProcess.pid, 'SIGTERM');
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
              // Process might already be dead
            }
            // Then SIGKILL if still running
            try {
              process.kill(-appProcess.pid, 'SIGKILL');
            } catch (e) {
              // Process already exited
            }
          }
          console.log('Cleaned up app process');
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
