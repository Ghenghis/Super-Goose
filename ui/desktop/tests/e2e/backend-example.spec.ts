/**
 * Example test demonstrating backend fixture usage.
 *
 * This file shows the recommended patterns for writing backend-dependent tests.
 *
 * Run without backend (will skip):
 *   npm run test:e2e -- backend-example.spec.ts
 *
 * Run with backend:
 *   npm run test:e2e:backend -- backend-example.spec.ts
 *
 * Run with auto-start backend:
 *   npm run test:e2e:backend-auto -- backend-example.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// Example 1: Skip entire test suite if backend not available
test.describe('Backend-Dependent Features', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('can fetch agent status', async ({ backendUrl, isBackendRunning }) => {
    expect(isBackendRunning).toBe(true);

    const response = await fetch(`${backendUrl}/api/agent/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Agent status:', data);
  });

  test('can fetch feature flags', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    expect(response.ok).toBe(true);

    const features = await response.json();
    console.log('Features:', features);

    // Example validation
    expect(typeof features).toBe('object');
  });

  test('can fetch cost tracking data', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost`);
    expect(response.ok).toBe(true);

    const costData = await response.json();
    console.log('Cost data:', costData);
  });
});

// Example 2: Individual test with skip
test.describe('Optional Backend Features', () => {
  test('works without backend', async () => {
    // This test doesn't need backend
    expect(true).toBe(true);
    console.log('Test runs regardless of backend state');
  });

  test('enhanced with backend', async ({ backendUrl, isBackendRunning }) => {
    if (isBackendRunning) {
      // Use backend if available
      const response = await fetch(`${backendUrl}/api/agent/status`);
      expect(response.ok).toBe(true);
      console.log('Using backend features');
    } else {
      // Fallback behavior
      console.log('Backend not available, using fallback');
      expect(true).toBe(true);
    }
  });
});

// Example 3: Conditional logic based on backend
test.describe('Adaptive Tests', () => {
  test('adapts to backend availability', async ({ isBackendRunning, backendUrl }) => {
    if (isBackendRunning) {
      console.log('Backend is running, testing full functionality');

      const statusResponse = await fetch(`${backendUrl}/api/agent/status`);
      expect(statusResponse.ok).toBe(true);

      const featuresResponse = await fetch(`${backendUrl}/api/features`);
      expect(featuresResponse.ok).toBe(true);

      console.log('Full backend integration verified');
    } else {
      console.log('Backend not running, testing UI-only features');
      // Test UI components that don't require backend
      expect(true).toBe(true);
    }
  });
});

// Example 4: Error handling
test.describe('Backend Error Handling', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('handles network timeout gracefully', async ({ backendUrl }) => {
    try {
      // Short timeout to test error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100);

      await fetch(`${backendUrl}/api/agent/status`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // If we get here, request completed quickly
      expect(true).toBe(true);
    } catch (error: unknown) {
      // Request timed out or failed
      const errMsg = error instanceof Error ? error.message : String(error);
      expect(errMsg).toMatch(/abort|timeout/i);
      console.log('Timeout handled correctly:', errMsg);
    }
  });

  test('handles invalid endpoint', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/invalid-endpoint-xyz`);

    // Should return error status
    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(400);

    console.log(`Invalid endpoint returned: ${response.status}`);
  });
});

// Example 5: Multiple API calls
test.describe('Backend Integration Workflows', () => {
  test.beforeEach(() => {
    skipWithoutBackend(test);
  });

  test('can chain multiple API calls', async ({ backendUrl }) => {
    // Step 1: Get status
    const statusResponse = await fetch(`${backendUrl}/api/agent/status`);
    expect(statusResponse.ok).toBe(true);
    const status = await statusResponse.json();
    console.log('Step 1: Got status', status);

    // Step 2: Get features
    const featuresResponse = await fetch(`${backendUrl}/api/features`);
    expect(featuresResponse.ok).toBe(true);
    const features = await featuresResponse.json();
    console.log('Step 2: Got features', features);

    // Step 3: Get cost data
    const costResponse = await fetch(`${backendUrl}/api/cost`);
    expect(costResponse.ok).toBe(true);
    const cost = await costResponse.json();
    console.log('Step 3: Got cost', cost);

    // All three calls succeeded
    expect(statusResponse.ok && featuresResponse.ok && costResponse.ok).toBe(true);
  });
});
