/**
 * Utilities for conditionally skipping tests based on backend availability.
 *
 * Usage:
 *   import { skipWithoutBackend, skipWithBackend } from './skip-utils';
 *
 *   test('requires backend', async ({ isBackendRunning }) => {
 *     skipWithoutBackend(test);
 *     // test code that needs backend
 *   });
 *
 *   test('incompatible with backend', async () => {
 *     skipWithBackend(test);
 *     // test code that must run without backend
 *   });
 */

import { TestType } from '@playwright/test';

/**
 * Skip the test if backend is not available.
 * Use this for tests that require the goosed backend to be running.
 *
 * @param test - The Playwright test object
 */
export function skipWithoutBackend(test: TestType<any, any>) {
  test.skip(
    !process.env.GOOSE_BACKEND,
    'Requires running backend (set GOOSE_BACKEND=1 and ensure goosed is running)'
  );
}

/**
 * Skip the test if backend is available.
 * Use this for tests that are incompatible with a running backend.
 *
 * @param test - The Playwright test object
 */
export function skipWithBackend(test: TestType<any, any>) {
  test.skip(
    !!process.env.GOOSE_BACKEND,
    'Test incompatible with backend (unset GOOSE_BACKEND to run)'
  );
}

/**
 * Run test only if condition is true, otherwise skip.
 *
 * @param test - The Playwright test object
 * @param condition - Condition to evaluate
 * @param reason - Reason for skipping
 */
export function skipUnless(test: TestType<any, any>, condition: boolean, reason: string) {
  test.skip(!condition, reason);
}

/**
 * Run test only if condition is false, otherwise skip.
 *
 * @param test - The Playwright test object
 * @param condition - Condition to evaluate
 * @param reason - Reason for skipping
 */
export function skipIf(test: TestType<any, any>, condition: boolean, reason: string) {
  test.skip(condition, reason);
}

/**
 * Helper to get backend URL from environment or default.
 *
 * @returns Backend URL string
 */
export function getBackendUrl(): string {
  return process.env.GOOSE_BACKEND_URL || 'http://localhost:3284';
}

/**
 * Check if backend is configured to be available.
 * Note: This checks the environment variable, not actual runtime availability.
 *
 * @returns true if GOOSE_BACKEND=1
 */
export function isBackendConfigured(): boolean {
  return process.env.GOOSE_BACKEND === '1';
}

/**
 * Check if backend auto-start is enabled.
 *
 * @returns true if GOOSE_START_BACKEND=1
 */
export function isBackendAutoStartEnabled(): boolean {
  return process.env.GOOSE_START_BACKEND === '1';
}
