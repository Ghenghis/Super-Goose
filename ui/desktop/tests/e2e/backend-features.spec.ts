/**
 * Backend Features and Guardrails API endpoint tests.
 *
 * Tests the feature flag system (13 well-known features, toggle) and the
 * guardrails configuration (GET, PUT, validation).
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-features.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-features.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// Feature Listing
// =============================================================================

test.describe('Backend Features List', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend features list test: ${testInfo.title}`);
  });

  test('backend features GET returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Features response:', JSON.stringify(data, null, 2));

    // Validate response wrapper
    expect(data.features).toBeTruthy();
    expect(Array.isArray(data.features)).toBe(true);
  });

  test('backend features returns exactly 13 well-known features', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    const data = await response.json();

    expect(data.features.length).toBe(13);
  });

  test('backend features entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    const data = await response.json();

    for (const feature of data.features) {
      expect(typeof feature.name).toBe('string');
      expect(typeof feature.enabled).toBe('boolean');
      expect(typeof feature.description).toBe('string');
      expect(typeof feature.category).toBe('string');

      // Category must be one of the known values
      expect(['safety', 'performance', 'learning', 'ui']).toContain(feature.category);

      // Name should be a non-empty identifier
      expect(feature.name.length).toBeGreaterThan(0);
      // Description should be a non-empty human-readable string
      expect(feature.description.length).toBeGreaterThan(0);
    }
  });

  test('backend features contains all expected feature names', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    const data = await response.json();

    const names = data.features.map((f: { name: string }) => f.name);

    const expectedNames = [
      'reflexion',
      'guardrails',
      'rate_limiting',
      'auto_checkpoint',
      'memory_system',
      'hitl',
      'pipeline_viz',
      'cost_tracking',
      'core_selector',
      'experience_recording',
      'skill_library',
      'ota_self_improve',
      'autonomous_daemon',
    ];

    for (const name of expectedNames) {
      expect(names).toContain(name);
    }
  });

  test('backend features has correct default enabled/disabled counts', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    const data = await response.json();

    const enabledCount = data.features.filter(
      (f: { enabled: boolean }) => f.enabled
    ).length;
    const disabledCount = data.features.filter(
      (f: { enabled: boolean }) => !f.enabled
    ).length;

    // By default: 11 enabled, 2 disabled (ota_self_improve, autonomous_daemon)
    expect(enabledCount).toBe(11);
    expect(disabledCount).toBe(2);
  });

  test('backend features experimental features are disabled by default', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    const data = await response.json();

    const ota = data.features.find(
      (f: { name: string }) => f.name === 'ota_self_improve'
    );
    const daemon = data.features.find(
      (f: { name: string }) => f.name === 'autonomous_daemon'
    );

    expect(ota).toBeTruthy();
    expect(ota.enabled).toBe(false);

    expect(daemon).toBeTruthy();
    expect(daemon.enabled).toBe(false);
  });

  test('backend features has correct category distribution', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features`);
    const data = await response.json();

    const byCategory: Record<string, number> = {};
    for (const feature of data.features) {
      const cat = feature.category as string;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    // Validate we have features in each category
    expect(byCategory['safety']).toBeGreaterThan(0);
    expect(byCategory['performance']).toBeGreaterThan(0);
    expect(byCategory['learning']).toBeGreaterThan(0);
    expect(byCategory['ui']).toBeGreaterThan(0);

    console.log('Feature category distribution:', byCategory);
  });
});

// =============================================================================
// Feature Toggle
// =============================================================================

test.describe('Backend Features Toggle', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend features toggle test: ${testInfo.title}`);
  });

  test('backend features toggle disables a feature', async ({ backendUrl }) => {
    // Disable reflexion (enabled by default)
    const toggleResponse = await fetch(`${backendUrl}/api/features/reflexion`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(toggleResponse.ok).toBe(true);

    const toggleData = await toggleResponse.json();
    expect(toggleData.name).toBe('reflexion');
    expect(toggleData.enabled).toBe(false);
    expect(toggleData.updated).toBe(true);

    // Verify it persisted in the features list
    const listResponse = await fetch(`${backendUrl}/api/features`);
    const listData = await listResponse.json();
    const reflexion = listData.features.find(
      (f: { name: string }) => f.name === 'reflexion'
    );
    expect(reflexion).toBeTruthy();
    expect(reflexion.enabled).toBe(false);

    // Cleanup: re-enable
    await fetch(`${backendUrl}/api/features/reflexion`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
  });

  test('backend features toggle enables an experimental feature', async ({ backendUrl }) => {
    // Enable ota_self_improve (disabled by default)
    const toggleResponse = await fetch(`${backendUrl}/api/features/ota_self_improve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(toggleResponse.ok).toBe(true);

    const toggleData = await toggleResponse.json();
    expect(toggleData.name).toBe('ota_self_improve');
    expect(toggleData.enabled).toBe(true);
    expect(toggleData.updated).toBe(true);

    // Cleanup: disable again
    await fetch(`${backendUrl}/api/features/ota_self_improve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  });

  test('backend features toggle unknown feature returns 404', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/features/nonexistent_feature_99`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  test('backend features toggle round-trip preserves state', async ({ backendUrl }) => {
    const featureName = 'cost_tracking';

    // Disable
    await fetch(`${backendUrl}/api/features/${featureName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    // Verify disabled
    let listResponse = await fetch(`${backendUrl}/api/features`);
    let listData = await listResponse.json();
    let feature = listData.features.find(
      (f: { name: string }) => f.name === featureName
    );
    expect(feature.enabled).toBe(false);

    // Re-enable
    await fetch(`${backendUrl}/api/features/${featureName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    // Verify re-enabled
    listResponse = await fetch(`${backendUrl}/api/features`);
    listData = await listResponse.json();
    feature = listData.features.find(
      (f: { name: string }) => f.name === featureName
    );
    expect(feature.enabled).toBe(true);
  });
});

// =============================================================================
// Guardrails Config GET
// =============================================================================

test.describe('Backend Guardrails Config', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend guardrails config test: ${testInfo.title}`);
  });

  test('backend guardrails config GET returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/guardrails/config`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Guardrails config:', JSON.stringify(data, null, 2));

    // Validate response wrapper
    expect(data.config).toBeTruthy();
    expect(typeof data.violations_today).toBe('number');

    // last_violation is nullable
    if (data.last_violation !== null) {
      expect(typeof data.last_violation).toBe('string');
    }

    // Validate config sub-object
    const config = data.config;
    expect(typeof config.enabled).toBe('boolean');
    expect(typeof config.mode).toBe('string');
    expect(['warn', 'block']).toContain(config.mode);
    expect(typeof config.content_filtering).toBe('boolean');
    expect(typeof config.pii_detection).toBe('boolean');
    expect(typeof config.code_injection_detection).toBe('boolean');
    expect(typeof config.max_tool_calls_per_turn).toBe('number');
    expect(Array.isArray(config.blocked_tools)).toBe(true);
    expect(Array.isArray(config.allowed_domains)).toBe(true);
  });

  test('backend guardrails config defaults are sensible', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/guardrails/config`);
    const data = await response.json();

    const config = data.config;

    // Default values based on the Rust implementation
    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('warn');
    expect(config.content_filtering).toBe(true);
    expect(config.pii_detection).toBe(true);
    expect(config.code_injection_detection).toBe(true);
    expect(config.max_tool_calls_per_turn).toBe(25);
    expect(config.blocked_tools).toEqual([]);
    expect(config.allowed_domains).toEqual([]);
  });

  test('backend guardrails violations_today is non-negative', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/guardrails/config`);
    const data = await response.json();

    expect(data.violations_today).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Guardrails Config PUT
// =============================================================================

test.describe('Backend Guardrails Config Update', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend guardrails config update test: ${testInfo.title}`);
  });

  test('backend guardrails config PUT updates all fields', async ({ backendUrl }) => {
    const newConfig = {
      enabled: false,
      mode: 'block',
      content_filtering: false,
      pii_detection: false,
      code_injection_detection: false,
      max_tool_calls_per_turn: 10,
      blocked_tools: ['dangerous_tool'],
      allowed_domains: ['example.com'],
    };

    const updateResponse = await fetch(`${backendUrl}/api/guardrails/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    expect(updateResponse.ok).toBe(true);

    const updateData = await updateResponse.json();
    expect(updateData.config.enabled).toBe(false);
    expect(updateData.config.mode).toBe('block');
    expect(updateData.config.content_filtering).toBe(false);
    expect(updateData.config.pii_detection).toBe(false);
    expect(updateData.config.code_injection_detection).toBe(false);
    expect(updateData.config.max_tool_calls_per_turn).toBe(10);
    expect(updateData.config.blocked_tools).toEqual(['dangerous_tool']);
    expect(updateData.config.allowed_domains).toEqual(['example.com']);

    // Verify it persisted
    const getResponse = await fetch(`${backendUrl}/api/guardrails/config`);
    const getData = await getResponse.json();
    expect(getData.config.mode).toBe('block');
    expect(getData.config.enabled).toBe(false);

    // Cleanup: restore defaults
    await fetch(`${backendUrl}/api/guardrails/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        mode: 'warn',
        content_filtering: true,
        pii_detection: true,
        code_injection_detection: true,
        max_tool_calls_per_turn: 25,
        blocked_tools: [],
        allowed_domains: [],
      }),
    });
  });

  test('backend guardrails config PUT rejects invalid mode', async ({ backendUrl }) => {
    const badConfig = {
      enabled: true,
      mode: 'invalid_mode',
      content_filtering: true,
      pii_detection: true,
      code_injection_detection: true,
      max_tool_calls_per_turn: 25,
      blocked_tools: [],
      allowed_domains: [],
    };

    const response = await fetch(`${backendUrl}/api/guardrails/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badConfig),
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  test('backend guardrails config PUT accepts warn mode', async ({ backendUrl }) => {
    const config = {
      enabled: true,
      mode: 'warn',
      content_filtering: true,
      pii_detection: true,
      code_injection_detection: true,
      max_tool_calls_per_turn: 25,
      blocked_tools: [],
      allowed_domains: [],
    };

    const response = await fetch(`${backendUrl}/api/guardrails/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.config.mode).toBe('warn');
  });

  test('backend guardrails config PUT accepts block mode', async ({ backendUrl }) => {
    const config = {
      enabled: true,
      mode: 'block',
      content_filtering: true,
      pii_detection: true,
      code_injection_detection: true,
      max_tool_calls_per_turn: 25,
      blocked_tools: [],
      allowed_domains: [],
    };

    const response = await fetch(`${backendUrl}/api/guardrails/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.config.mode).toBe('block');

    // Cleanup
    await fetch(`${backendUrl}/api/guardrails/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        mode: 'warn',
        content_filtering: true,
        pii_detection: true,
        code_injection_detection: true,
        max_tool_calls_per_turn: 25,
        blocked_tools: [],
        allowed_domains: [],
      }),
    });
  });
});

// =============================================================================
// Features + Guardrails Cross-Endpoint
// =============================================================================

test.describe('Backend Features and Guardrails Cross-Validation', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend features/guardrails cross-validation test: ${testInfo.title}`);
  });

  test('backend features and guardrails both respond in parallel', async ({ backendUrl }) => {
    const [featuresRes, guardrailsRes] = await Promise.all([
      fetch(`${backendUrl}/api/features`),
      fetch(`${backendUrl}/api/guardrails/config`),
    ]);

    expect(featuresRes.ok).toBe(true);
    expect(guardrailsRes.ok).toBe(true);

    const features = await featuresRes.json();
    const guardrails = await guardrailsRes.json();

    expect(features.features.length).toBe(13);
    expect(guardrails.config).toBeTruthy();

    console.log(
      `Features: ${features.features.length}, Guardrails mode: ${guardrails.config.mode}`
    );
  });
});
