/**
 * Accessibility (a11y) tests for all major panels using @axe-core/playwright.
 *
 * PREREQUISITE:
 *   npm install --save-dev @axe-core/playwright
 *
 * These tests navigate to each panel route and run axe-core accessibility
 * audits (WCAG 2.0 AA compliance) against the rendered DOM. Each test:
 *   1. Navigates to the panel route
 *   2. Waits for the panel to finish rendering
 *   3. Runs AxeBuilder with WCAG 2.0 AA ruleset
 *   4. Asserts zero accessibility violations
 *
 * Routes tested:
 *   - #/chat/new (sidebar panels: Agent, Tasks, Skills, Connectors, Files, etc.)
 *   - #/search (SearchSidebar)
 *   - #/bookmarks (BookmarkManager)
 *   - #/reflexion (ReflexionPanel)
 *   - #/critic (CriticManagerPanel)
 *   - #/plans (PlanManagerPanel)
 *   - #/guardrails (GuardrailsPanel)
 *   - #/budget (BudgetPanel)
 *   - #/tools (ToolsBridgePanel)
 *   - #/cli (CLIIntegrationPanel)
 *   - #/features-dashboard (FeatureStatusDashboard)
 *   - #/conscious (ConsciousPanel)
 *   - #/enterprise (EnterpriseRoutePanel)
 *
 * If @axe-core/playwright is not installed, these tests will fail at import
 * time with a clear error. Run: npm install --save-dev @axe-core/playwright
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import AxeBuilder from '@axe-core/playwright';

const test = base;

let mainWindow: Page;

test.beforeEach(async ({ goosePage }, testInfo) => {
  mainWindow = goosePage;
  const testName = testInfo.titlePath[testInfo.titlePath.length - 1];
  console.log(`Setting overlay for test: "${testName}"`);
  await showTestName(mainWindow, testName);
});

test.afterEach(async () => {
  if (mainWindow) {
    await clearTestName(mainWindow);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the React root to mount and navigate to the given hash route.
 */
async function navigateAndWait(route: string) {
  console.log(`[a11y] Navigating to ${route}...`);

  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 },
  );

  await mainWindow.evaluate((r: string) => {
    window.location.hash = r;
  }, route);
  await mainWindow.waitForTimeout(1500);
  console.log(`[a11y] Route ${route} loaded`);
}

/**
 * Run axe-core scan against the current page and return the results.
 *
 * By default, tests with WCAG 2.0 Level AA tags.  Excludes the test-overlay
 * div injected by the E2E test harness.
 */
async function runAxeScan() {
  const results = await new AxeBuilder({ page: mainWindow })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#test-overlay')   // Exclude E2E test harness overlay
    .analyze();

  return results;
}

/**
 * Log a summary of violations for debugging.
 */
function logViolations(violations: any[]) {
  if (violations.length === 0) {
    console.log('[a11y] No violations found');
    return;
  }

  console.log(`[a11y] ${violations.length} violation(s) found:`);
  for (const v of violations) {
    console.log(
      `  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`,
    );
    for (const node of v.nodes.slice(0, 3)) {
      console.log(`    Target: ${node.target.join(', ')}`);
      console.log(`    HTML: ${node.html.substring(0, 120)}...`);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// SKIP ALL: AxeBuilder uses browserContext.newPage() internally which is NOT
// supported in Electron CDP connections. The error is:
//   "Protocol error (Target.createTarget): Not supported"
// These tests require a full browser context, not Electron via CDP.
// TODO: Re-enable when running against a web build (e.g., Playwright + localhost server).
test.describe.skip('Accessibility - Panel Routes', () => {
  test.describe('Sidebar Panels (chat view)', () => {
    test('chat view with sidebar passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/chat/new');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({
        path: 'test-results/a11y-chat-sidebar.png',
      });

      // Assert zero violations
      expect(
        results.violations,
        `Expected zero a11y violations on chat view, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Search Sidebar', () => {
    test('search sidebar passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/search');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({
        path: 'test-results/a11y-search.png',
      });

      expect(
        results.violations,
        `Expected zero a11y violations on search, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Bookmark Manager', () => {
    test('bookmark manager passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/bookmarks');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({
        path: 'test-results/a11y-bookmarks.png',
      });

      expect(
        results.violations,
        `Expected zero a11y violations on bookmarks, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Feature Panels', () => {
    test('Reflexion panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/reflexion');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-reflexion.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on reflexion, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('Critic panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/critic');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-critic.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on critic, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('Plan Manager panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/plans');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-plans.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on plans, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('Guardrails panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/guardrails');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-guardrails.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on guardrails, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('Budget panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/budget');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-budget.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on budget, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Tools Bridge Panel', () => {
    test('tools panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/tools');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-tools.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on tools, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('CLI Integration Panel', () => {
    test('CLI panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/cli');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-cli.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on CLI, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Feature Status Dashboard', () => {
    test('features dashboard passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/features-dashboard');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({
        path: 'test-results/a11y-features-dashboard.png',
      });

      expect(
        results.violations,
        `Expected zero a11y violations on features dashboard, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Conscious AI Panel', () => {
    test('conscious panel passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/conscious');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-conscious.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on conscious, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('conscious panel Voice tab passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/conscious');

      // Switch to Voice tab
      const voiceTab = mainWindow.locator('button:has-text("Voice")').first();
      if (await voiceTab.isVisible().catch(() => false)) {
        await voiceTab.click();
        await mainWindow.waitForTimeout(500);
      }

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-conscious-voice.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on conscious voice tab, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('conscious panel Emotions tab passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/conscious');

      // Switch to Emotions tab
      const emotionsTab = mainWindow.locator('button:has-text("Emotions")').first();
      if (await emotionsTab.isVisible().catch(() => false)) {
        await emotionsTab.click();
        await mainWindow.waitForTimeout(500);
      }

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-conscious-emotions.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on conscious emotions tab, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });

  test.describe('Enterprise Settings Panel', () => {
    test('enterprise grid view passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/enterprise');

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({ path: 'test-results/a11y-enterprise.png' });

      expect(
        results.violations,
        `Expected zero a11y violations on enterprise grid, found ${results.violations.length}`,
      ).toHaveLength(0);
    });

    test('enterprise sub-panel view passes WCAG 2.0 AA', async () => {
      await navigateAndWait('#/enterprise');

      // Open the first sub-panel (Guardrails)
      const configureBtn = mainWindow.locator('button:has-text("Configure")').first();
      if (await configureBtn.isVisible().catch(() => false)) {
        await configureBtn.click();
        await mainWindow.waitForTimeout(1000);
      }

      const results = await runAxeScan();
      logViolations(results.violations);

      await mainWindow.screenshot({
        path: 'test-results/a11y-enterprise-subpanel.png',
      });

      expect(
        results.violations,
        `Expected zero a11y violations on enterprise sub-panel, found ${results.violations.length}`,
      ).toHaveLength(0);
    });
  });
});
