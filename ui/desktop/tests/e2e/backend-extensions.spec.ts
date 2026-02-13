/**
 * Backend Extensions API endpoint tests.
 *
 * Tests the extension management system: listing all extensions, getting
 * single extension details, toggling enabled state, and reloading from config.
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-extensions.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-extensions.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// Extensions Listing
// =============================================================================

test.describe('Backend Extensions List', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend extensions list test: ${testInfo.title}`);
  });

  test('backend extensions GET returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/extensions`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Extensions response:', JSON.stringify(data, null, 2));

    // Validate response wrapper
    expect(data.extensions).toBeTruthy();
    expect(Array.isArray(data.extensions)).toBe(true);
  });

  test('backend extensions returns at least one extension', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/extensions`);
    const data = await response.json();

    // There should be at least some builtin extensions
    expect(data.extensions.length).toBeGreaterThan(0);
    console.log(`Total extensions: ${data.extensions.length}`);
  });

  test('backend extensions entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/extensions`);
    const data = await response.json();

    for (const ext of data.extensions) {
      expect(typeof ext.key).toBe('string');
      expect(typeof ext.name).toBe('string');
      expect(typeof ext.type).toBe('string');
      expect(typeof ext.enabled).toBe('boolean');
      expect(typeof ext.description).toBe('string');

      // Key and name should be non-empty
      expect(ext.key.length).toBeGreaterThan(0);
      expect(ext.name.length).toBeGreaterThan(0);

      // Type should be a known extension type
      const validTypes = [
        'builtin',
        'stdio',
        'streamable_http',
        'platform',
        'frontend',
        'inline_python',
        'sse',
      ];
      expect(validTypes).toContain(ext.type);
    }
  });

  test('backend extensions contains builtin extensions', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/extensions`);
    const data = await response.json();

    const builtinExtensions = data.extensions.filter(
      (ext: { type: string }) => ext.type === 'builtin'
    );

    // There should be at least some builtin extensions
    expect(builtinExtensions.length).toBeGreaterThan(0);
    console.log(`Builtin extensions: ${builtinExtensions.length}`);
  });

  test('backend extensions keys are unique', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/extensions`);
    const data = await response.json();

    const keys = data.extensions.map((ext: { key: string }) => ext.key);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(keys.length);
  });
});

// =============================================================================
// Single Extension Detail
// =============================================================================

test.describe('Backend Extensions Detail', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend extensions detail test: ${testInfo.title}`);
  });

  test('backend extensions GET single extension returns valid data', async ({ backendUrl }) => {
    // First, get the list to find a known extension key
    const listResponse = await fetch(`${backendUrl}/api/extensions`);
    const listData = await listResponse.json();

    if (listData.extensions.length === 0) {
      console.log('No extensions available, skipping detail test');
      return;
    }

    const firstKey = listData.extensions[0].key;

    // Get the detail for that extension
    const detailResponse = await fetch(`${backendUrl}/api/extensions/${firstKey}`);
    expect(detailResponse.ok).toBe(true);

    const detailData = await detailResponse.json();
    console.log('Extension detail:', JSON.stringify(detailData, null, 2));

    // Validate the extension field
    expect(detailData.extension).toBeTruthy();
    expect(detailData.extension.key).toBe(firstKey);
    expect(typeof detailData.extension.name).toBe('string');
    expect(typeof detailData.extension.type).toBe('string');
    expect(typeof detailData.extension.enabled).toBe('boolean');
    expect(typeof detailData.extension.description).toBe('string');
  });

  test('backend extensions GET nonexistent extension returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/extensions/nonexistent_extension_key_99999`
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// Extension Toggle
// =============================================================================

test.describe('Backend Extensions Toggle', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend extensions toggle test: ${testInfo.title}`);
  });

  test('backend extensions toggle disables an extension', async ({ backendUrl }) => {
    // Find an enabled extension to toggle
    const listResponse = await fetch(`${backendUrl}/api/extensions`);
    const listData = await listResponse.json();

    const enabledExt = listData.extensions.find(
      (ext: { enabled: boolean }) => ext.enabled
    );

    if (!enabledExt) {
      console.log('No enabled extensions found, skipping toggle test');
      return;
    }

    const targetKey = enabledExt.key;

    // Disable it
    const toggleResponse = await fetch(
      `${backendUrl}/api/extensions/${targetKey}/toggle`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }
    );
    expect(toggleResponse.ok).toBe(true);

    const toggleData = await toggleResponse.json();
    expect(toggleData.key).toBe(targetKey);
    expect(toggleData.enabled).toBe(false);
    expect(toggleData.updated).toBe(true);

    // Verify via the list endpoint
    const verifyResponse = await fetch(`${backendUrl}/api/extensions`);
    const verifyData = await verifyResponse.json();
    const toggled = verifyData.extensions.find(
      (ext: { key: string }) => ext.key === targetKey
    );
    expect(toggled).toBeTruthy();
    expect(toggled.enabled).toBe(false);

    // Cleanup: re-enable
    await fetch(`${backendUrl}/api/extensions/${targetKey}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
  });

  test('backend extensions toggle enables a disabled extension', async ({ backendUrl }) => {
    // Find a disabled extension to toggle
    const listResponse = await fetch(`${backendUrl}/api/extensions`);
    const listData = await listResponse.json();

    const disabledExt = listData.extensions.find(
      (ext: { enabled: boolean }) => !ext.enabled
    );

    if (!disabledExt) {
      console.log('No disabled extensions found, skipping toggle test');
      return;
    }

    const targetKey = disabledExt.key;

    // Enable it
    const toggleResponse = await fetch(
      `${backendUrl}/api/extensions/${targetKey}/toggle`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(toggleResponse.ok).toBe(true);

    const toggleData = await toggleResponse.json();
    expect(toggleData.key).toBe(targetKey);
    expect(toggleData.enabled).toBe(true);
    expect(toggleData.updated).toBe(true);

    // Cleanup: re-disable
    await fetch(`${backendUrl}/api/extensions/${targetKey}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  });

  test('backend extensions toggle nonexistent returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/extensions/nonexistent_key_99999/toggle`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  test('backend extensions toggle round-trip preserves state', async ({ backendUrl }) => {
    // Get a known extension
    const listResponse = await fetch(`${backendUrl}/api/extensions`);
    const listData = await listResponse.json();

    if (listData.extensions.length === 0) {
      console.log('No extensions available, skipping round-trip test');
      return;
    }

    const targetKey = listData.extensions[0].key;
    const originalEnabled = listData.extensions[0].enabled;

    // Toggle to opposite state
    await fetch(`${backendUrl}/api/extensions/${targetKey}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !originalEnabled }),
    });

    // Verify the opposite state
    let verifyResponse = await fetch(`${backendUrl}/api/extensions/${targetKey}`);
    let verifyData = await verifyResponse.json();
    expect(verifyData.extension.enabled).toBe(!originalEnabled);

    // Toggle back to original state
    await fetch(`${backendUrl}/api/extensions/${targetKey}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: originalEnabled }),
    });

    // Verify back to original
    verifyResponse = await fetch(`${backendUrl}/api/extensions/${targetKey}`);
    verifyData = await verifyResponse.json();
    expect(verifyData.extension.enabled).toBe(originalEnabled);
  });
});

// =============================================================================
// Extensions Reload
// =============================================================================

test.describe('Backend Extensions Reload', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend extensions reload test: ${testInfo.title}`);
  });

  test('backend extensions reload returns valid response', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/extensions/reload`, {
      method: 'POST',
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Extensions reload:', JSON.stringify(data, null, 2));

    expect(typeof data.count).toBe('number');
    expect(typeof data.reloaded).toBe('boolean');

    expect(data.count).toBeGreaterThanOrEqual(0);
    expect(data.reloaded).toBe(true);
  });

  test('backend extensions reload count matches list count', async ({ backendUrl }) => {
    // Reload
    const reloadResponse = await fetch(`${backendUrl}/api/extensions/reload`, {
      method: 'POST',
    });
    const reloadData = await reloadResponse.json();

    // List
    const listResponse = await fetch(`${backendUrl}/api/extensions`);
    const listData = await listResponse.json();

    // The reload count should match the list count
    expect(reloadData.count).toBe(listData.extensions.length);
  });
});

// =============================================================================
// Cross-endpoint parallel requests
// =============================================================================

test.describe('Backend Extensions Cross-Endpoint Validation', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend extensions cross-endpoint test: ${testInfo.title}`);
  });

  test('backend extensions list and reload both respond in parallel', async ({ backendUrl }) => {
    const [listRes, reloadRes] = await Promise.all([
      fetch(`${backendUrl}/api/extensions`),
      fetch(`${backendUrl}/api/extensions/reload`, { method: 'POST' }),
    ]);

    expect(listRes.ok).toBe(true);
    expect(reloadRes.ok).toBe(true);

    const list = await listRes.json();
    const reload = await reloadRes.json();

    expect(Array.isArray(list.extensions)).toBe(true);
    expect(typeof reload.count).toBe('number');

    console.log(
      `Extensions: list=${list.extensions.length}, reload.count=${reload.count}`
    );
  });
});
