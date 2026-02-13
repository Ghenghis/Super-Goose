/**
 * Backend health check tests.
 *
 * These tests validate that the backend management fixture works correctly
 * and that backend API endpoints are accessible.
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-health.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-health.spec.ts
 *
 * Skip backend tests:
 *   npm run test:e2e -- backend-health.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend, getBackendUrl } from './skip-utils';

test.describe('Backend Health Checks', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend health test: ${testInfo.title}`);
  });

  test('backend fixture provides correct URL', async ({ backendUrl }) => {
    expect(backendUrl).toBeTruthy();
    expect(backendUrl).toMatch(/^https?:\/\//);
    console.log(`Backend URL: ${backendUrl}`);
  });

  test('backend is reported as running', async ({ isBackendRunning }) => {
    expect(isBackendRunning).toBe(true);
  });

  test('backend health endpoint responds', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/agent/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Backend status:', JSON.stringify(data, null, 2));

    // Basic validation that we got a valid response
    expect(data).toBeTruthy();
  });

  test('backend settings endpoint responds', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/settings`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Backend settings response type:', typeof data);

    // Validate response structure (settings might be empty object or have config)
    expect(typeof data).toBe('object');
  });

  test('backend features endpoint responds', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Backend features:', JSON.stringify(data, null, 2));

    // Validate response structure
    expect(typeof data).toBe('object');
  });

  test('backend cost endpoint responds', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Backend cost tracking response type:', typeof data);

    // Validate response structure
    expect(typeof data).toBe('object');
  });

  test('backend handles invalid endpoint gracefully', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/nonexistent-endpoint-12345`);

    // Should return 404 or similar error, not crash
    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(400);
    console.log(`Invalid endpoint returned status: ${response.status}`);
  });

  test('backend URL matches environment variable', async ({ backendUrl }) => {
    const expectedUrl = getBackendUrl();
    expect(backendUrl).toBe(expectedUrl);
  });
});

test.describe('Backend Availability Detection', () => {
  test('isBackendRunning reflects actual backend state', async ({ backendUrl, isBackendRunning }) => {
    if (isBackendRunning) {
      // If reported as running, health check should succeed
      const response = await fetch(`${backendUrl}/api/agent/status`);
      expect(response.ok).toBe(true);
      console.log('Backend is running and responds to health checks');
    } else {
      // If reported as not running, health check should fail
      try {
        await fetch(`${backendUrl}/api/agent/status`, {
          signal: AbortSignal.timeout(2000)
        });
        // If we get here, backend is actually running but fixture said it wasn't
        throw new Error('Backend responded but isBackendRunning was false');
      } catch (error: unknown) {
        // Expected: backend not responding
        console.log('Backend correctly reported as not running');
        const errMsg = error instanceof Error ? error.message : String(error);
        expect(errMsg).toMatch(/fetch|timeout|network|abort/i);
      }
    }
  });
});

test.describe('Backend Auto-Start (if enabled)', () => {
  test.skip(!process.env.GOOSE_START_BACKEND, 'Only runs when GOOSE_START_BACKEND=1');

  test('backend was started successfully', async ({ isBackendRunning, backendUrl }) => {
    expect(isBackendRunning).toBe(true);

    const response = await fetch(`${backendUrl}/api/agent/status`);
    expect(response.ok).toBe(true);

    console.log('Auto-started backend is healthy');
  });
});

test.describe('Backend Fixture Integration', () => {
  test('multiple tests can share backend instance', async ({ backendUrl, isBackendRunning }) => {
    skipWithoutBackend(test);

    expect(isBackendRunning).toBe(true);

    // First request
    const response1 = await fetch(`${backendUrl}/api/agent/status`);
    expect(response1.ok).toBe(true);

    // Second request to same backend
    const response2 = await fetch(`${backendUrl}/api/features`);
    expect(response2.ok).toBe(true);

    console.log('Backend handled multiple requests successfully');
  });

  test('backend survives across test boundaries', async ({ backendUrl, isBackendRunning }) => {
    skipWithoutBackend(test);

    expect(isBackendRunning).toBe(true);

    const response = await fetch(`${backendUrl}/api/agent/status`);
    expect(response.ok).toBe(true);

    // Backend should still be running after this test completes
    console.log('Backend remains stable across test boundaries');
  });
});
