/**
 * Backend Learning Engine API endpoint tests.
 *
 * Tests the learning subsystem: experiences, insights, skills, and stats.
 *
 * Run with backend:
 *   GOOSE_BACKEND=1 npm run test:e2e -- backend-learning.spec.ts
 *
 * Auto-start backend:
 *   GOOSE_START_BACKEND=1 npm run test:e2e -- backend-learning.spec.ts
 */

import { test, expect } from './backend-fixture';
import { skipWithoutBackend } from './skip-utils';

// =============================================================================
// Learning Stats
// =============================================================================

test.describe('Backend Learning Stats', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend learning stats test: ${testInfo.title}`);
  });

  test('backend learning stats returns valid structure', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/stats`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Learning stats:', JSON.stringify(data, null, 2));

    // Validate all expected fields exist with correct types
    expect(typeof data.total_experiences).toBe('number');
    expect(typeof data.success_rate).toBe('number');
    expect(typeof data.total_skills).toBe('number');
    expect(typeof data.verified_skills).toBe('number');
    expect(typeof data.total_insights).toBe('number');
    expect(typeof data.experiences_by_core).toBe('object');

    // Numeric fields should be non-negative
    expect(data.total_experiences).toBeGreaterThanOrEqual(0);
    expect(data.success_rate).toBeGreaterThanOrEqual(0);
    expect(data.success_rate).toBeLessThanOrEqual(1.0);
    expect(data.total_skills).toBeGreaterThanOrEqual(0);
    expect(data.verified_skills).toBeGreaterThanOrEqual(0);
    expect(data.total_insights).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Experiences
// =============================================================================

test.describe('Backend Learning Experiences', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend learning experiences test: ${testInfo.title}`);
  });

  test('backend learning experiences returns paginated list', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/experiences`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Experiences response:', JSON.stringify(data, null, 2));

    // Validate response wrapper structure
    expect(Array.isArray(data.experiences)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.limit).toBe('number');
    expect(typeof data.offset).toBe('number');

    // Default pagination values
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
    expect(data.total).toBeGreaterThanOrEqual(0);
  });

  test('backend learning experiences respects pagination params', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/learning/experiences?limit=10&offset=5`
    );
    expect(response.ok).toBe(true);

    const data = await response.json();

    // Verify pagination params are echoed back
    expect(data.limit).toBe(10);
    expect(data.offset).toBe(5);
  });

  test('backend learning experiences entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/experiences`);
    const data = await response.json();

    // If there are any experiences, validate their shape
    if (data.experiences.length > 0) {
      const exp = data.experiences[0];
      expect(typeof exp.id).toBe('string');
      expect(typeof exp.task_summary).toBe('string');
      expect(typeof exp.core_type).toBe('string');
      expect(typeof exp.outcome).toBe('string');
      expect(Array.isArray(exp.insights)).toBe(true);
      expect(typeof exp.timestamp).toBe('string');
    } else {
      // Empty list is acceptable (learning store may not be wired yet)
      console.log('No experiences returned (expected if store is not wired)');
      expect(data.experiences).toEqual([]);
    }
  });
});

// =============================================================================
// Insights
// =============================================================================

test.describe('Backend Learning Insights', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend learning insights test: ${testInfo.title}`);
  });

  test('backend learning insights returns valid list', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/insights`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Insights response:', JSON.stringify(data, null, 2));

    // Validate response wrapper
    expect(Array.isArray(data.insights)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(data.total).toBeGreaterThanOrEqual(0);
  });

  test('backend learning insights entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/insights`);
    const data = await response.json();

    // If there are any insights, validate their shape
    if (data.insights.length > 0) {
      const insight = data.insights[0];
      expect(typeof insight.id).toBe('string');
      expect(typeof insight.insight_type).toBe('string');
      expect(typeof insight.description).toBe('string');
      expect(typeof insight.confidence).toBe('number');
      expect(insight.confidence).toBeGreaterThanOrEqual(0);
      expect(insight.confidence).toBeLessThanOrEqual(1.0);
      expect(Array.isArray(insight.source_experiences)).toBe(true);
    } else {
      console.log('No insights returned (expected if store is not wired)');
      expect(data.insights).toEqual([]);
    }
  });
});

// =============================================================================
// Skills
// =============================================================================

test.describe('Backend Learning Skills', () => {
  test.beforeEach(async ({}, testInfo) => {
    skipWithoutBackend(test);
    console.log(`Running backend learning skills test: ${testInfo.title}`);
  });

  test('backend learning skills returns valid list', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/skills`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    console.log('Skills response:', JSON.stringify(data, null, 2));

    // Validate response wrapper
    expect(Array.isArray(data.skills)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(data.total).toBeGreaterThanOrEqual(0);
  });

  test('backend learning skills entries have correct shape', async ({ backendUrl }) => {
    const response = await fetch(`${backendUrl}/api/learning/skills`);
    const data = await response.json();

    // If there are any skills, validate their shape
    if (data.skills.length > 0) {
      const skill = data.skills[0];
      expect(typeof skill.id).toBe('string');
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
      expect(typeof skill.strategy).toBe('string');
      expect(typeof skill.verified).toBe('boolean');
      expect(typeof skill.use_count).toBe('number');
      expect(typeof skill.success_rate).toBe('number');
      expect(skill.use_count).toBeGreaterThanOrEqual(0);
      expect(skill.success_rate).toBeGreaterThanOrEqual(0);
      expect(skill.success_rate).toBeLessThanOrEqual(1.0);
    } else {
      console.log('No skills returned (expected if store is not wired)');
      expect(data.skills).toEqual([]);
    }
  });

  test('backend learning skills supports verified_only filter', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/learning/skills?verified_only=true`
    );
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data.skills)).toBe(true);
    expect(typeof data.total).toBe('number');

    // If filtered, all returned skills should be verified
    if (data.skills.length > 0) {
      for (const skill of data.skills) {
        expect(skill.verified).toBe(true);
      }
    }
  });

  test('backend learning skills verify nonexistent returns 404', async ({ backendUrl }) => {
    const response = await fetch(
      `${backendUrl}/api/learning/skills/nonexistent-skill-id/verify`,
      { method: 'POST' }
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});
