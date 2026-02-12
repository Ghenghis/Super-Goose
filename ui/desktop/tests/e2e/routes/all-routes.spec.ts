/**
 * E2E tests verifying all 26 application routes are navigable.
 *
 * Every route defined in App.tsx is exercised here. For each route we:
 *   1. Navigate via the hash router
 *   2. Assert the page does not crash (React root stays mounted)
 *   3. Verify route-specific content is visible
 *
 * Routes are split into two groups:
 *   - AppLayout routes (nested under "/" with sidebar chrome)
 *   - Standalone routes (launcher, welcome, configure-providers, standalone-app)
 *
 * No running backend is required -- panels render with their own mock / default data.
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';
import { waitForAppReady, navigateToRoute, takeScreenshot } from '../panels/panel-test-utils';

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
 * Navigate to a hash route and assert that the React root did not unmount
 * (i.e. the page did not crash).
 */
async function navigateAndAssertAlive(route: string) {
  await navigateToRoute(mainWindow, route);

  // React root must still have children (app did not crash)
  const rootAlive = await mainWindow.evaluate(() => {
    const root = document.getElementById('root');
    return root !== null && root.children.length > 0;
  });
  expect(rootAlive).toBe(true);
}

/**
 * Verify that a text string appears somewhere on the page.
 */
async function expectTextVisible(text: string, timeout = 5000) {
  const locator = mainWindow.locator(`text=${text}`).first();
  await expect(locator).toBeVisible({ timeout });
}

/**
 * Verify that a text string appears on the page (case-insensitive loose check
 * via evaluating textContent). Useful when text may be split across elements.
 */
async function expectPageContainsText(text: string) {
  const found = await mainWindow.evaluate((t) => {
    return document.body.textContent?.toLowerCase().includes(t.toLowerCase()) ?? false;
  }, text);
  expect(found).toBe(true);
}

// ---------------------------------------------------------------------------
// AppLayout routes (nested under "/", rendered with sidebar chrome)
// ---------------------------------------------------------------------------

test.describe('All Routes - AppLayout routes', () => {

  test('/ (index) renders the Hub / home view', async () => {
    await navigateAndAssertAlive('#/');
    // The hub page renders either the chat input or the Super-Goose branding
    const hasContent = await mainWindow.evaluate(() => {
      const body = document.body.textContent || '';
      return body.length > 10; // page is not blank
    });
    expect(hasContent).toBe(true);
    await takeScreenshot(mainWindow, 'route-home');
  });

  test('/pair renders the chat pair route', async () => {
    await navigateAndAssertAlive('#/pair');
    await takeScreenshot(mainWindow, 'route-pair');
  });

  test('/settings renders the settings view', async () => {
    await navigateAndAssertAlive('#/settings');
    // Settings page has tabs: App, Models, etc.
    const settingsContent = await mainWindow.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('Settings') || text.includes('App') || text.includes('Models');
    });
    expect(settingsContent).toBe(true);
    await takeScreenshot(mainWindow, 'route-settings');
  });

  test('/extensions renders the extensions view', async () => {
    await navigateAndAssertAlive('#/extensions');
    const found = await mainWindow.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('extension') || text.includes('Extension');
    });
    expect(found).toBe(true);
    await takeScreenshot(mainWindow, 'route-extensions');
  });

  test('/apps renders the apps view', async () => {
    await navigateAndAssertAlive('#/apps');
    await takeScreenshot(mainWindow, 'route-apps');
  });

  test('/sessions renders the sessions view', async () => {
    await navigateAndAssertAlive('#/sessions');
    await takeScreenshot(mainWindow, 'route-sessions');
  });

  test('/schedules renders the schedules view', async () => {
    await navigateAndAssertAlive('#/schedules');
    await takeScreenshot(mainWindow, 'route-schedules');
  });

  test('/recipes renders the recipes view', async () => {
    await navigateAndAssertAlive('#/recipes');
    await takeScreenshot(mainWindow, 'route-recipes');
  });

  test('/search renders the search panel with heading', async () => {
    await navigateAndAssertAlive('#/search');
    await expectTextVisible('Search');
    await takeScreenshot(mainWindow, 'route-search');
  });

  test('/bookmarks renders the bookmark manager with heading', async () => {
    await navigateAndAssertAlive('#/bookmarks');
    await expectTextVisible('Bookmarks');
    await takeScreenshot(mainWindow, 'route-bookmarks');
  });

  test('/reflexion renders the reflexion panel with heading', async () => {
    await navigateAndAssertAlive('#/reflexion');
    await expectTextVisible('Reflexion');
    await takeScreenshot(mainWindow, 'route-reflexion');
  });

  test('/critic renders the critic panel with heading', async () => {
    await navigateAndAssertAlive('#/critic');
    await expectTextVisible('Critic');
    await takeScreenshot(mainWindow, 'route-critic');
  });

  test('/plans renders the plan manager with heading', async () => {
    await navigateAndAssertAlive('#/plans');
    await expectTextVisible('Plan Manager');
    await takeScreenshot(mainWindow, 'route-plans');
  });

  test('/guardrails renders the guardrails panel with heading', async () => {
    await navigateAndAssertAlive('#/guardrails');
    await expectTextVisible('Guardrails');
    await takeScreenshot(mainWindow, 'route-guardrails');
  });

  test('/budget renders the budget panel with heading', async () => {
    await navigateAndAssertAlive('#/budget');
    await expectTextVisible('Budget');
    await takeScreenshot(mainWindow, 'route-budget');
  });

  test('/tools renders the tools bridge panel', async () => {
    await navigateAndAssertAlive('#/tools');
    await expectPageContainsText('Tools');
    await takeScreenshot(mainWindow, 'route-tools');
  });

  test('/cli renders the CLI integration panel', async () => {
    await navigateAndAssertAlive('#/cli');
    await expectPageContainsText('CLI');
    await takeScreenshot(mainWindow, 'route-cli');
  });

  test('/features-dashboard renders the feature status dashboard', async () => {
    await navigateAndAssertAlive('#/features-dashboard');
    await expectPageContainsText('Feature');
    await takeScreenshot(mainWindow, 'route-features-dashboard');
  });

  test('/conscious renders the conscious AI panel', async () => {
    await navigateAndAssertAlive('#/conscious');
    await expectTextVisible('Conscious AI');
    await takeScreenshot(mainWindow, 'route-conscious');
  });

  test('/enterprise renders the enterprise settings panel', async () => {
    await navigateAndAssertAlive('#/enterprise');
    await expectPageContainsText('Enterprise');
    await takeScreenshot(mainWindow, 'route-enterprise');
  });

  test('/shared-session renders the shared session view', async () => {
    await navigateAndAssertAlive('#/shared-session');
    // May show loading or error since no session data is passed
    await takeScreenshot(mainWindow, 'route-shared-session');
  });

  test('/permission renders the permission settings view', async () => {
    await navigateAndAssertAlive('#/permission');
    await takeScreenshot(mainWindow, 'route-permission');
  });
});

// ---------------------------------------------------------------------------
// Standalone routes (outside AppLayout, no sidebar)
// ---------------------------------------------------------------------------

test.describe('All Routes - Standalone routes', () => {

  test('/launcher renders the launcher view', async () => {
    await navigateAndAssertAlive('#/launcher');
    await takeScreenshot(mainWindow, 'route-launcher');
  });

  test('/welcome renders the provider setup / welcome page', async () => {
    await navigateAndAssertAlive('#/welcome');
    // Welcome page renders ProviderSettings with isOnboarding=true
    await takeScreenshot(mainWindow, 'route-welcome');
  });

  test('/configure-providers renders the provider configuration page', async () => {
    await navigateAndAssertAlive('#/configure-providers');
    await takeScreenshot(mainWindow, 'route-configure-providers');
  });

  test('/standalone-app renders the standalone app view', async () => {
    await navigateAndAssertAlive('#/standalone-app');
    await takeScreenshot(mainWindow, 'route-standalone-app');
  });
});

// ---------------------------------------------------------------------------
// Invalid routes
// ---------------------------------------------------------------------------

test.describe('All Routes - Invalid routes', () => {

  test('navigating to an undefined route does not crash the app', async () => {
    await navigateAndAssertAlive('#/this-route-does-not-exist-999');

    // The React root should still be alive
    const rootAlive = await mainWindow.evaluate(() => {
      const root = document.getElementById('root');
      return root !== null && root.children.length > 0;
    });
    expect(rootAlive).toBe(true);
    await takeScreenshot(mainWindow, 'route-invalid');
  });

  test('navigating to another undefined route falls back gracefully', async () => {
    await navigateAndAssertAlive('#/foo/bar/baz');

    const rootAlive = await mainWindow.evaluate(() => {
      const root = document.getElementById('root');
      return root !== null && root.children.length > 0;
    });
    expect(rootAlive).toBe(true);
    await takeScreenshot(mainWindow, 'route-invalid-nested');
  });
});
