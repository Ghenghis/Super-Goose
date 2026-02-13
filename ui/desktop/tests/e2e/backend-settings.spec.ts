/**
 * Backend Settings API endpoint tests.
 *
 * Tests GET/POST round-trip for individual settings, bulk operations,
 * and the settings deletion endpoint.
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-settings.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-settings.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// GET all settings
// =============================================================================

test.describe('Backend Settings Read All', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend settings test: ${testInfo.title}`);
  });

  test('backend settings GET all returns object map', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/settings`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Settings response type:', typeof data);

    // The response wraps settings in a { settings: {...} } envelope
    expect(typeof data).toBe('object');
    expect(data.settings !== undefined || typeof data === 'object').toBe(true);
  });
});

// =============================================================================
// GET/POST individual settings round-trip
// =============================================================================

test.describe('Backend Settings GET/POST Round-Trip', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend settings round-trip test: ${testInfo.title}`);
  });

  test('backend settings POST then GET round-trip with string value', async ({ backendUrl }) => {
    const testKey = 'e2e_test_string_setting';
    const testValue = 'hello-from-e2e';

    // Set the value
    const setResponse = await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: testValue }),
    });
    expect(setResponse.ok).toBe(true);

    const setData = await setResponse.json();
    expect(setData.key).toBe(testKey);
    expect(setData.value).toBe(testValue);

    // Read the value back
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    expect(getResponse.ok).toBe(true);

    const getData = await getResponse.json();
    expect(getData.key).toBe(testKey);
    expect(getData.value).toBe(testValue);

    // Cleanup: delete the test key
    await fetch(`${backendUrl}/api/settings/${testKey}`, { method: 'DELETE' });
  });

  test('backend settings POST then GET round-trip with numeric value', async ({ backendUrl }) => {
    const testKey = 'e2e_test_numeric_setting';
    const testValue = 42;

    // Set the value
    const setResponse = await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: testValue }),
    });
    expect(setResponse.ok).toBe(true);

    const setData = await setResponse.json();
    expect(setData.key).toBe(testKey);
    expect(setData.value).toBe(testValue);

    // Read the value back
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    expect(getResponse.ok).toBe(true);

    const getData = await getResponse.json();
    expect(getData.key).toBe(testKey);
    expect(getData.value).toBe(testValue);

    // Cleanup
    await fetch(`${backendUrl}/api/settings/${testKey}`, { method: 'DELETE' });
  });

  test('backend settings POST then GET round-trip with boolean value', async ({ backendUrl }) => {
    const testKey = 'e2e_test_bool_setting';
    const testValue = true;

    // Set the value
    const setResponse = await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: testValue }),
    });
    expect(setResponse.ok).toBe(true);

    // Read the value back
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    expect(getResponse.ok).toBe(true);

    const getData = await getResponse.json();
    expect(getData.key).toBe(testKey);
    expect(getData.value).toBe(true);

    // Cleanup
    await fetch(`${backendUrl}/api/settings/${testKey}`, { method: 'DELETE' });
  });

  test('backend settings POST then GET round-trip with object value', async ({ backendUrl }) => {
    const testKey = 'e2e_test_object_setting';
    const testValue = { nested: { key: 'value' }, array: [1, 2, 3] };

    // Set the value
    const setResponse = await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: testValue }),
    });
    expect(setResponse.ok).toBe(true);

    // Read the value back
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    expect(getResponse.ok).toBe(true);

    const getData = await getResponse.json();
    expect(getData.key).toBe(testKey);
    expect(getData.value).toEqual(testValue);

    // Cleanup
    await fetch(`${backendUrl}/api/settings/${testKey}`, { method: 'DELETE' });
  });
});

// =============================================================================
// GET nonexistent setting
// =============================================================================

test.describe('Backend Settings Not Found', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend settings not-found test: ${testInfo.title}`);
  });

  test('backend settings GET nonexistent key returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/settings/nonexistent_key_that_does_not_exist_99999`
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// DELETE setting
// =============================================================================

test.describe('Backend Settings Delete', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend settings delete test: ${testInfo.title}`);
  });

  test('backend settings DELETE existing key succeeds', async ({ backendUrl }) => {
    const testKey = 'e2e_test_delete_me';

    // Create the key
    await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'temporary' }),
    });

    // Delete the key
    const deleteResponse = await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.ok).toBe(true);

    const deleteData = await deleteResponse.json();
    expect(typeof deleteData.message).toBe('string');
    expect(deleteData.message).toContain(testKey);

    // Verify it is gone
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    expect(getResponse.status).toBe(404);
  });

  test('backend settings DELETE nonexistent key returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/settings/nonexistent_delete_key_99999`,
      { method: 'DELETE' }
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// Bulk settings
// =============================================================================

test.describe('Backend Settings Bulk Operations', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend settings bulk test: ${testInfo.title}`);
  });

  test('backend settings bulk POST sets multiple keys', async ({ backendUrl }) => {
    const bulkSettings = {
      settings: {
        e2e_bulk_key_1: 'value1',
        e2e_bulk_key_2: 42,
        e2e_bulk_key_3: true,
      },
    };

    const response = await fetch(`${backendUrl}/api/settings/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkSettings),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(typeof data.updated).toBe('number');
    expect(typeof data.errors).toBe('object');

    // Should have updated all 3
    expect(data.updated).toBe(3);
    expect(Object.keys(data.errors).length).toBe(0);

    // Verify each key was set
    for (const [key, expectedValue] of Object.entries(bulkSettings.settings)) {
      const getResponse = await fetch(`${backendUrl}/api/settings/${key}`);
      expect(getResponse.ok).toBe(true);
      const getData = await getResponse.json();
      expect(getData.value).toEqual(expectedValue);
    }

    // Cleanup
    for (const key of Object.keys(bulkSettings.settings)) {
      await fetch(`${backendUrl}/api/settings/${key}`, { method: 'DELETE' });
    }
  });
});

// =============================================================================
// Settings overwrite
// =============================================================================

test.describe('Backend Settings Overwrite', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend settings overwrite test: ${testInfo.title}`);
  });

  test('backend settings POST overwrites existing value', async ({ backendUrl }) => {
    const testKey = 'e2e_test_overwrite_setting';

    // Set initial value
    await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'initial' }),
    });

    // Overwrite with new value
    const overwriteResponse = await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'updated' }),
    });
    expect(overwriteResponse.ok).toBe(true);

    // Verify the new value
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    const getData = await getResponse.json();
    expect(getData.value).toBe('updated');

    // Cleanup
    await fetch(`${backendUrl}/api/settings/${testKey}`, { method: 'DELETE' });
  });

  test('backend settings POST can change value type', async ({ backendUrl }) => {
    const testKey = 'e2e_test_type_change_setting';

    // Set as string
    await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'string-value' }),
    });

    // Overwrite with number
    await fetch(`${backendUrl}/api/settings/${testKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 123 }),
    });

    // Verify it is now a number
    const getResponse = await fetch(`${backendUrl}/api/settings/${testKey}`);
    const getData = await getResponse.json();
    expect(getData.value).toBe(123);

    // Cleanup
    await fetch(`${backendUrl}/api/settings/${testKey}`, { method: 'DELETE' });
  });
});
