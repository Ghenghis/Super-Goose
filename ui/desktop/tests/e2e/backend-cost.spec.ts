/**
 * Backend Cost API endpoint tests.
 *
 * Tests the cost tracking subsystem: summary, breakdown, and budget
 * management (GET, PUT, round-trip).
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-cost.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-cost.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// Cost Summary
// =============================================================================

test.describe('Backend Cost Summary', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend cost summary test: ${testInfo.title}`);
  });

  test('backend cost summary returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/summary`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Cost summary:', JSON.stringify(data, null, 2));

    // Validate all required top-level fields
    expect(typeof data.total_spend).toBe('number');
    expect(typeof data.session_spend).toBe('number');
    expect(typeof data.budget_warning_threshold).toBe('number');
    expect(typeof data.is_over_budget).toBe('boolean');

    // Numeric fields should be non-negative
    expect(data.total_spend).toBeGreaterThanOrEqual(0);
    expect(data.session_spend).toBeGreaterThanOrEqual(0);
    expect(data.budget_warning_threshold).toBeGreaterThanOrEqual(0);
    expect(data.budget_warning_threshold).toBeLessThanOrEqual(1.0);

    // budget_limit and budget_remaining are nullable
    if (data.budget_limit !== null) {
      expect(typeof data.budget_limit).toBe('number');
      expect(data.budget_limit).toBeGreaterThanOrEqual(0);
    }
    if (data.budget_remaining !== null) {
      expect(typeof data.budget_remaining).toBe('number');
      expect(data.budget_remaining).toBeGreaterThanOrEqual(0);
    }

    // model_breakdown should be an array
    expect(Array.isArray(data.model_breakdown)).toBe(true);
  });

  test('backend cost summary model breakdown entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/summary`);
    const data = await response.json();

    // If there are model breakdown entries, validate their shape
    if (data.model_breakdown.length > 0) {
      const entry = data.model_breakdown[0];
      expect(typeof entry.model).toBe('string');
      expect(typeof entry.provider).toBe('string');
      expect(typeof entry.input_tokens).toBe('number');
      expect(typeof entry.output_tokens).toBe('number');
      expect(typeof entry.cost).toBe('number');

      expect(entry.input_tokens).toBeGreaterThanOrEqual(0);
      expect(entry.output_tokens).toBeGreaterThanOrEqual(0);
      expect(entry.cost).toBeGreaterThanOrEqual(0);
    } else {
      // Empty breakdown is acceptable (no usage yet)
      console.log('No model breakdown entries (expected for fresh backend)');
      expect(data.model_breakdown).toEqual([]);
    }
  });

  test('backend cost summary fresh backend reports zero spend', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/summary`);
    const data = await response.json();

    // Fresh backend should report zero or near-zero spend
    expect(data.total_spend).toBe(0);
    expect(data.session_spend).toBe(0);
    expect(data.is_over_budget).toBe(false);
  });
});

// =============================================================================
// Cost Breakdown
// =============================================================================

test.describe('Backend Cost Breakdown', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend cost breakdown test: ${testInfo.title}`);
  });

  test('backend cost breakdown returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/breakdown`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Cost breakdown:', JSON.stringify(data, null, 2));

    // Validate the three breakdown arrays exist
    expect(Array.isArray(data.by_model)).toBe(true);
    expect(Array.isArray(data.by_session)).toBe(true);
    expect(Array.isArray(data.daily_trend)).toBe(true);
  });

  test('backend cost breakdown by_model entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/breakdown`);
    const data = await response.json();

    if (data.by_model.length > 0) {
      const entry = data.by_model[0];
      expect(typeof entry.model).toBe('string');
      expect(typeof entry.provider).toBe('string');
      expect(typeof entry.input_tokens).toBe('number');
      expect(typeof entry.output_tokens).toBe('number');
      expect(typeof entry.cost).toBe('number');
    } else {
      console.log('No by_model entries (expected for fresh backend)');
    }
  });

  test('backend cost breakdown by_session entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/breakdown`);
    const data = await response.json();

    if (data.by_session.length > 0) {
      const entry = data.by_session[0];
      expect(typeof entry.session_id).toBe('string');
      expect(typeof entry.total_cost).toBe('number');
      expect(typeof entry.message_count).toBe('number');

      // session_name is nullable
      if (entry.session_name !== null) {
        expect(typeof entry.session_name).toBe('string');
      }

      expect(entry.total_cost).toBeGreaterThanOrEqual(0);
      expect(entry.message_count).toBeGreaterThanOrEqual(0);
    } else {
      console.log('No by_session entries (expected for fresh backend)');
    }
  });

  test('backend cost breakdown daily_trend entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/breakdown`);
    const data = await response.json();

    if (data.daily_trend.length > 0) {
      const entry = data.daily_trend[0];
      expect(typeof entry.date).toBe('string');
      expect(typeof entry.cost).toBe('number');
      expect(typeof entry.message_count).toBe('number');

      expect(entry.cost).toBeGreaterThanOrEqual(0);
      expect(entry.message_count).toBeGreaterThanOrEqual(0);
    } else {
      console.log('No daily_trend entries (expected for fresh backend)');
    }
  });
});

// =============================================================================
// Budget GET/PUT
// =============================================================================

test.describe('Backend Cost Budget', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend cost budget test: ${testInfo.title}`);
  });

  test('backend cost budget GET returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/budget`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Budget GET:', JSON.stringify(data, null, 2));

    // Validate the response structure
    expect(typeof data.warning_threshold).toBe('number');
    expect(typeof data.updated).toBe('boolean');

    // limit is nullable
    if (data.limit !== null) {
      expect(typeof data.limit).toBe('number');
    }

    // warning_threshold should be in [0, 1]
    expect(data.warning_threshold).toBeGreaterThanOrEqual(0);
    expect(data.warning_threshold).toBeLessThanOrEqual(1.0);

    // GET should not report as "updated"
    expect(data.updated).toBe(false);
  });

  test('backend cost budget PUT sets limit and threshold', async ({ backendUrl }) => {
    // Set a budget limit
    const setResponse = await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50.0, warning_threshold: 0.75 }),
    });
    expect(setResponse.ok).toBe(true);

    const setData = await setResponse.json();
    expect(setData.limit).toBe(50.0);
    expect(setData.warning_threshold).toBe(0.75);
    expect(setData.updated).toBe(true);

    // Verify it persisted by doing a GET
    const getResponse = await fetch(`${backendUrl}/api/cost/budget`);
    expect(getResponse.ok).toBe(true);

    const getData = await getResponse.json();
    expect(getData.limit).toBe(50.0);
    expect(getData.warning_threshold).toBe(0.75);

    // Cleanup: remove budget limit by setting it to null
    await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: null, warning_threshold: 0.8 }),
    });
  });

  test('backend cost budget PUT partial update (limit only)', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100.0 }),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.limit).toBe(100.0);
    expect(data.updated).toBe(true);

    // Cleanup
    await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: null }),
    });
  });

  test('backend cost budget PUT partial update (threshold only)', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_threshold: 0.5 }),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.warning_threshold).toBe(0.5);
    expect(data.updated).toBe(true);

    // Cleanup: restore default threshold
    await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_threshold: 0.8 }),
    });
  });

  test('backend cost budget PUT clamps threshold to [0, 1]', async ({ backendUrl }) => {
    // Set threshold above 1.0 — server should clamp to 1.0
    const highResponse = await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_threshold: 1.5 }),
    });
    expect(highResponse.ok).toBe(true);

    const highData = await highResponse.json();
    expect(highData.warning_threshold).toBeLessThanOrEqual(1.0);

    // Set threshold below 0.0 — server should clamp to 0.0
    const lowResponse = await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_threshold: -0.5 }),
    });
    expect(lowResponse.ok).toBe(true);

    const lowData = await lowResponse.json();
    expect(lowData.warning_threshold).toBeGreaterThanOrEqual(0);

    // Cleanup
    await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_threshold: 0.8 }),
    });
  });

  test('backend cost budget empty PUT body is accepted', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.updated).toBe(true);
  });
});

// =============================================================================
// Budget reflects in summary
// =============================================================================

test.describe('Backend Cost Budget-Summary Integration', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend cost budget-summary integration test: ${testInfo.title}`);
  });

  test('backend cost summary reflects budget set via PUT', async ({ backendUrl }) => {
    // Set a budget
    await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 25.0, warning_threshold: 0.9 }),
    });

    // Verify the summary now shows the budget
    const summaryResponse = await fetch(`${backendUrl}/api/cost/summary`);
    expect(summaryResponse.ok).toBe(true);

    const summary = await summaryResponse.json();
    expect(summary.budget_limit).toBe(25.0);
    expect(summary.budget_warning_threshold).toBe(0.9);
    expect(summary.budget_remaining).toBe(25.0); // total_spend is 0

    // Cleanup
    await fetch(`${backendUrl}/api/cost/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: null, warning_threshold: 0.8 }),
    });
  });
});

// =============================================================================
// Cross-endpoint parallel requests
// =============================================================================

test.describe('Backend Cost Cross-Endpoint Validation', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend cost cross-endpoint test: ${testInfo.title}`);
  });

  test('backend cost endpoints all respond in parallel', async ({ backendUrl }) => {
    const [summaryRes, breakdownRes, budgetRes] = await Promise.all([
      fetch(`${backendUrl}/api/cost/summary`),
      fetch(`${backendUrl}/api/cost/breakdown`),
      fetch(`${backendUrl}/api/cost/budget`),
    ]);

    expect(summaryRes.ok).toBe(true);
    expect(breakdownRes.ok).toBe(true);
    expect(budgetRes.ok).toBe(true);

    const summary = await summaryRes.json();
    const breakdown = await breakdownRes.json();
    const budget = await budgetRes.json();

    // Basic structural checks on all three
    expect(typeof summary.total_spend).toBe('number');
    expect(Array.isArray(breakdown.by_model)).toBe(true);
    expect(typeof budget.warning_threshold).toBe('number');

    console.log(
      `Cost: spend=${summary.total_spend}, models=${breakdown.by_model.length}, threshold=${budget.warning_threshold}`
    );
  });
});
