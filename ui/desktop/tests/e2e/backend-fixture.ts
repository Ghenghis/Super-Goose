import { test as base } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(require('child_process').exec);

/**
 * Backend management fixture for Super-Goose E2E tests.
 *
 * Provides backend URL and runtime status detection.
 * Use with skipWithoutBackend() from skip-utils.ts for conditional test execution.
 */
interface BackendFixture {
  backendUrl: string;
  isBackendRunning: boolean;
  backendProcess?: ChildProcess;
}

/**
 * Extended test fixture that optionally manages the backend server.
 *
 * Environment Variables:
 * - GOOSE_BACKEND_URL: Backend server URL (default: http://localhost:3284)
 * - GOOSE_BACKEND: Set to "1" to indicate tests require backend
 * - GOOSE_START_BACKEND: Set to "1" to auto-start backend for tests
 * - DEBUG_BACKEND: Set to "1" to enable backend stdout/stderr logging
 *
 * Usage:
 *   import { test, expect } from './backend-fixture';
 *   import { skipWithoutBackend } from './skip-utils';
 *
 *   test('backend-dependent test', async ({ backendUrl, isBackendRunning }) => {
 *     skipWithoutBackend(test);
 *     // ... test code using backendUrl
 *   });
 */
export const test = base.extend<BackendFixture>({
  backendUrl: async ({}, use) => {
    // Get backend URL from environment or use default
    const url = process.env.GOOSE_BACKEND_URL || 'http://localhost:3284';
    await use(url);
  },

  isBackendRunning: async ({ backendUrl }, use, testInfo) => {
    let backendProcess: ChildProcess | null = null;
    let wasStartedByTest = false;

    try {
      // First check if backend is already running
      let isRunning = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const resp = await fetch(`${backendUrl}/api/agent/status`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        isRunning = resp.ok;
        console.log(`Backend health check: ${isRunning ? 'RUNNING' : 'NOT RESPONDING'}`);
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(`Backend health check failed: ${errMsg}`);
        isRunning = false;
      }

      // Auto-start backend if requested and not already running
      if (!isRunning && process.env.GOOSE_START_BACKEND === '1') {
        console.log('GOOSE_START_BACKEND=1, attempting to start backend...');

        // Find the goosed binary
        const binDir = join(__dirname, '../../src/bin');
        const goosedBinary = process.platform === 'win32' ? 'goosed.exe' : 'goosed';
        const goosedPath = join(binDir, goosedBinary);

        console.log(`Starting backend: ${goosedPath}`);

        backendProcess = spawn(goosedPath, ['server'], {
          cwd: binDir,
          stdio: 'pipe',
          shell: process.platform === 'win32',
          detached: process.platform !== 'win32',
          env: {
            ...process.env,
            RUST_LOG: process.env.DEBUG_BACKEND ? 'debug' : 'info',
          }
        });

        wasStartedByTest = true;

        // Log backend output if debug enabled
        if (process.env.DEBUG_BACKEND) {
          backendProcess.stdout?.on('data', (data) => {
            console.log('[Backend stdout]:', data.toString());
          });

          backendProcess.stderr?.on('data', (data) => {
            console.log('[Backend stderr]:', data.toString());
          });
        }

        backendProcess.on('error', (error) => {
          console.error('Backend process error:', error);
        });

        backendProcess.on('exit', (code) => {
          console.log(`Backend process exited with code ${code}`);
        });

        // Wait for backend to become available
        console.log('Waiting for backend to start...');
        const maxRetries = 60; // 60 retries * 500ms = 30 seconds max
        const retryDelay = 500;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            const resp = await fetch(`${backendUrl}/api/agent/status`, {
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (resp.ok) {
              console.log(`Backend started successfully after ~${(attempt * retryDelay) / 1000}s`);
              isRunning = true;
              break;
            }
          } catch (_error: unknown) {
            // Backend not ready yet, continue retrying
          }

          if (attempt === maxRetries) {
            console.error(`Backend failed to start after ${maxRetries} attempts (~${(maxRetries * retryDelay) / 1000}s)`);
          } else {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }

      // Provide backend status to test
      await use(isRunning);

    } finally {
      // Cleanup: stop backend if we started it
      if (wasStartedByTest && backendProcess && backendProcess.pid) {
        console.log('Stopping backend process started by test...');
        try {
          if (process.platform === 'win32') {
            // On Windows, kill the entire process tree
            await execAsync(`taskkill /F /T /PID ${backendProcess.pid}`);
          } else {
            // On Unix, kill the entire process group
            try {
              process.kill(-backendProcess.pid, 'SIGTERM');
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
              // Process might already be dead
            }
            try {
              process.kill(-backendProcess.pid, 'SIGKILL');
            } catch (e) {
              // Process already exited
            }
          }
          console.log('Backend process cleaned up');
        } catch (error: unknown) {
          const errObj = error as { code?: string; message?: string };
          if (errObj.code !== 'ESRCH' && !errObj.message?.includes('No such process')) {
            console.error('Error killing backend process:', error);
          }
        }
      }
    }
  },
});

export { expect } from '@playwright/test';
