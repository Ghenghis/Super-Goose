/**
 * Backend Enterprise API endpoint tests.
 *
 * Tests all 6 enterprise panels: Gateway, Guardrails, Hooks, Memory,
 * Observability, and Policies.
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-enterprise.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-enterprise.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// Gateway
// =============================================================================

test.describe('Backend Enterprise Gateway', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend enterprise gateway test: ${testInfo.title}`);
  });

  test('backend enterprise gateway status returns valid data', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/gateway/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Gateway status:', JSON.stringify(data, null, 2));

    // Validate top-level fields
    expect(typeof data.healthy).toBe('boolean');
    expect(typeof data.uptime).toBe('string');
    expect(typeof data.version).toBe('string');
    expect(typeof data.auditLogging).toBe('boolean');

    // Validate permissions sub-object
    expect(data.permissions).toBeTruthy();
    expect(typeof data.permissions.total).toBe('number');
    expect(typeof data.permissions.granted).toBe('number');
    expect(typeof data.permissions.denied).toBe('number');
    expect(data.permissions.total).toBeGreaterThanOrEqual(0);
  });

  test('backend enterprise gateway audit toggle works', async ({ backendUrl }) => {
    // Enable audit logging
    const enableResponse = await fetch(`${backendUrl}/api/enterprise/gateway/audit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(enableResponse.ok).toBe(true);

    const enableData = await enableResponse.json();
    expect(enableData.enabled).toBe(true);
    expect(enableData.updated).toBe(true);

    // Verify it persisted in the status
    const statusResponse = await fetch(`${backendUrl}/api/enterprise/gateway/status`);
    const statusData = await statusResponse.json();
    expect(statusData.auditLogging).toBe(true);

    // Disable audit logging (cleanup)
    const disableResponse = await fetch(`${backendUrl}/api/enterprise/gateway/audit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(disableResponse.ok).toBe(true);

    const disableData = await disableResponse.json();
    expect(disableData.enabled).toBe(false);
    expect(disableData.updated).toBe(true);
  });
});

// =============================================================================
// Guardrails
// =============================================================================

test.describe('Backend Enterprise Guardrails', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend enterprise guardrails test: ${testInfo.title}`);
  });

  test('backend enterprise guardrails config returns valid data', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/guardrails`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Guardrails config:', JSON.stringify(data, null, 2));

    expect(typeof data.enabled).toBe('boolean');
    expect(typeof data.mode).toBe('string');
    expect(['warn', 'block']).toContain(data.mode);
    expect(Array.isArray(data.rules)).toBe(true);
  });

  test('backend enterprise guardrails update works', async ({ backendUrl }) => {
    // Update guardrails to warn mode
    const updateResponse = await fetch(`${backendUrl}/api/enterprise/guardrails`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, mode: 'warn' }),
    });
    expect(updateResponse.ok).toBe(true);

    const updateData = await updateResponse.json();
    expect(updateData.enabled).toBe(true);
    expect(updateData.mode).toBe('warn');

    // Reset to defaults
    await fetch(`${backendUrl}/api/enterprise/guardrails`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, mode: 'block' }),
    });
  });

  test('backend enterprise guardrails rejects invalid mode', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/guardrails`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'invalid_mode' }),
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  test('backend enterprise guardrails scans returns array', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/guardrails/scans`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`Guardrails scans count: ${data.scans.length}`);

    expect(Array.isArray(data.scans)).toBe(true);
    expect(data.scans.length).toBeGreaterThan(0);

    // Validate first scan entry shape
    const scan = data.scans[0];
    expect(typeof scan.id).toBe('string');
    expect(typeof scan.timestamp).toBe('string');
    expect(typeof scan.direction).toBe('string');
    expect(['input', 'output']).toContain(scan.direction);
    expect(typeof scan.detector).toBe('string');
    expect(typeof scan.result).toBe('string');
    expect(['pass', 'warn', 'block']).toContain(scan.result);
    expect(typeof scan.message).toBe('string');
    expect(typeof scan.sessionName).toBe('string');
  });

  test('backend enterprise guardrails record scan works', async ({ backendUrl }) => {
    const newScan = {
      direction: 'input',
      detector: 'E2E Test Detector',
      result: 'pass',
      message: 'E2E test scan entry',
      sessionName: 'E2E Test Session',
    };

    const response = await fetch(`${backendUrl}/api/enterprise/guardrails/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newScan),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(typeof data.id).toBe('string');
    expect(data.recorded).toBe(true);

    // Verify it appears in the scan list
    const listResponse = await fetch(`${backendUrl}/api/enterprise/guardrails/scans`);
    const listData = await listResponse.json();
    const found = listData.scans.find(
      (s: { detector: string }) => s.detector === 'E2E Test Detector'
    );
    expect(found).toBeTruthy();
  });

  test('backend enterprise guardrails record scan validates direction', async ({ backendUrl }) => {
    const badScan = {
      direction: 'sideways',
      detector: 'test',
      result: 'pass',
      message: 'test',
      sessionName: 'test',
    };

    const response = await fetch(`${backendUrl}/api/enterprise/guardrails/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badScan),
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });
});

// =============================================================================
// Hooks
// =============================================================================

test.describe('Backend Enterprise Hooks', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend enterprise hooks test: ${testInfo.title}`);
  });

  test('backend enterprise hooks events returns valid list', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/hooks/events`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`Hooks events count: ${data.events.length}`);

    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);

    // Validate first event shape
    const event = data.events[0];
    expect(typeof event.id).toBe('string');
    expect(typeof event.name).toBe('string');
    expect(typeof event.category).toBe('string');
    expect(['session', 'tools', 'flow']).toContain(event.category);
    expect(typeof event.enabled).toBe('boolean');
    expect(typeof event.recentCount).toBe('number');
  });

  test('backend enterprise hooks has all three categories', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/hooks/events`);
    const data = await response.json();

    const categories = new Set(data.events.map((e: { category: string }) => e.category));
    expect(categories.has('session')).toBe(true);
    expect(categories.has('tools')).toBe(true);
    expect(categories.has('flow')).toBe(true);
  });

  test('backend enterprise hooks toggle event works', async ({ backendUrl }) => {
    // Enable a hook
    const toggleResponse = await fetch(
      `${backendUrl}/api/enterprise/hooks/events/session_start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(toggleResponse.ok).toBe(true);

    const toggleData = await toggleResponse.json();
    expect(toggleData.id).toBe('session_start');
    expect(toggleData.enabled).toBe(true);
    expect(toggleData.updated).toBe(true);

    // Verify it persisted
    const listResponse = await fetch(`${backendUrl}/api/enterprise/hooks/events`);
    const listData = await listResponse.json();
    const hook = listData.events.find(
      (e: { id: string }) => e.id === 'session_start'
    );
    expect(hook).toBeTruthy();
    expect(hook.enabled).toBe(true);

    // Disable (cleanup)
    await fetch(`${backendUrl}/api/enterprise/hooks/events/session_start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  });

  test('backend enterprise hooks toggle nonexistent returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/enterprise/hooks/events/nonexistent_hook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// Memory
// =============================================================================

test.describe('Backend Enterprise Memory', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend enterprise memory test: ${testInfo.title}`);
  });

  test('backend enterprise memory summary returns subsystems', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/memory/summary`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`Memory subsystems count: ${data.subsystems.length}`);

    expect(Array.isArray(data.subsystems)).toBe(true);
    expect(data.subsystems.length).toBeGreaterThan(0);

    // Validate first subsystem shape
    const sub = data.subsystems[0];
    expect(typeof sub.id).toBe('string');
    expect(typeof sub.name).toBe('string');
    expect(typeof sub.status).toBe('string');
    expect(['active', 'inactive', 'degraded']).toContain(sub.status);
    expect(typeof sub.itemCount).toBe('number');
    expect(typeof sub.decayRate).toBe('string');
  });

  test('backend enterprise memory has expected subsystem IDs', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/memory/summary`);
    const data = await response.json();

    const ids = data.subsystems.map((s: { id: string }) => s.id);
    expect(ids).toContain('working');
    expect(ids).toContain('episodic');
    expect(ids).toContain('semantic');
    expect(ids).toContain('procedural');
  });

  test('backend enterprise memory consolidate returns success', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/memory/consolidate`, {
      method: 'POST',
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(typeof data.message).toBe('string');
    expect(data.message.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Observability
// =============================================================================

test.describe('Backend Enterprise Observability', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend enterprise observability test: ${testInfo.title}`);
  });

  test('backend enterprise observability config returns valid data', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/observability`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Observability config:', JSON.stringify(data, null, 2));

    expect(typeof data.costTrackingEnabled).toBe('boolean');

    // Validate usage sub-object
    expect(data.usage).toBeTruthy();
    expect(typeof data.usage.totalTokens).toBe('number');
    expect(typeof data.usage.promptTokens).toBe('number');
    expect(typeof data.usage.completionTokens).toBe('number');
    expect(typeof data.usage.estimatedCost).toBe('string');
    expect(typeof data.usage.period).toBe('string');
  });

  test('backend enterprise observability update cost tracking works', async ({ backendUrl }) => {
    // Enable cost tracking
    const enableResponse = await fetch(`${backendUrl}/api/enterprise/observability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costTrackingEnabled: true }),
    });
    expect(enableResponse.ok).toBe(true);

    const enableData = await enableResponse.json();
    expect(enableData.costTrackingEnabled).toBe(true);

    // Disable cost tracking (cleanup)
    const disableResponse = await fetch(`${backendUrl}/api/enterprise/observability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costTrackingEnabled: false }),
    });
    expect(disableResponse.ok).toBe(true);

    const disableData = await disableResponse.json();
    expect(disableData.costTrackingEnabled).toBe(false);
  });
});

// =============================================================================
// Policies
// =============================================================================

test.describe('Backend Enterprise Policies', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend enterprise policies test: ${testInfo.title}`);
  });

  test('backend enterprise policies rules returns valid data', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/policies/rules`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log(`Policy rules count: ${data.rules.length}`);

    expect(Array.isArray(data.rules)).toBe(true);
    expect(data.rules.length).toBeGreaterThan(0);
    expect(typeof data.dryRunMode).toBe('boolean');

    // Validate first rule shape
    const rule = data.rules[0];
    expect(typeof rule.id).toBe('string');
    expect(typeof rule.name).toBe('string');
    expect(typeof rule.condition).toBe('string');
    expect(typeof rule.action).toBe('string');
    expect(typeof rule.enabled).toBe('boolean');
  });

  test('backend enterprise policies has expected rule IDs', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/enterprise/policies/rules`);
    const data = await response.json();

    const ids = data.rules.map((r: { id: string }) => r.id);
    expect(ids).toContain('no_secrets');
    expect(ids).toContain('rate_limit');
    expect(ids).toContain('content_filter');
    expect(ids).toContain('audit_all');
  });

  test('backend enterprise policies toggle rule works', async ({ backendUrl }) => {
    // Disable a rule
    const toggleResponse = await fetch(
      `${backendUrl}/api/enterprise/policies/rules/no_secrets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }
    );
    expect(toggleResponse.ok).toBe(true);

    const toggleData = await toggleResponse.json();
    expect(toggleData.id).toBe('no_secrets');
    expect(toggleData.enabled).toBe(false);
    expect(toggleData.updated).toBe(true);

    // Re-enable (cleanup)
    await fetch(`${backendUrl}/api/enterprise/policies/rules/no_secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
  });

  test('backend enterprise policies toggle nonexistent returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/enterprise/policies/rules/nonexistent_rule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  test('backend enterprise policies dry-run toggle works', async ({ backendUrl }) => {
    // Enable dry-run
    const enableResponse = await fetch(`${backendUrl}/api/enterprise/policies/dry-run`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(enableResponse.ok).toBe(true);

    const enableData = await enableResponse.json();
    expect(enableData.enabled).toBe(true);
    expect(enableData.updated).toBe(true);

    // Verify in policy rules response
    const rulesResponse = await fetch(`${backendUrl}/api/enterprise/policies/rules`);
    const rulesData = await rulesResponse.json();
    expect(rulesData.dryRunMode).toBe(true);

    // Disable dry-run (cleanup)
    await fetch(`${backendUrl}/api/enterprise/policies/dry-run`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  });
});
