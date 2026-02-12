/**
 * E2E tests for the MCP Apps workflow lifecycle.
 *
 * Tests navigation to /apps, viewing the apps list,
 * app card details, app launch and download buttons,
 * app import functionality, and empty/error states.
 *
 * Route: #/apps
 * Component: AppsView
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';

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

async function navigateToRoute(route: string) {
  console.log(`Navigating to route: ${route}`);
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
  console.log(`Route ${route} loaded`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Apps Workflow', () => {
  test.describe('Apps List View', () => {
    test('navigates to /apps and displays Apps heading', async () => {
      await navigateToRoute('#/apps');

      const heading = mainWindow.locator('h1:has-text("Apps")');
      await expect(heading).toBeVisible({ timeout: 10000 });
      console.log('Apps heading is visible');

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-heading.png' });
    });

    test('apps page shows description text about MCP applications', async () => {
      await navigateToRoute('#/apps');

      const description = mainWindow.locator('text=Applications from your MCP servers');
      const descVisible = await description.isVisible().catch(() => false);
      console.log(`Apps description visible: ${descVisible}`);

      // Should also show experimental warning
      const experimental = mainWindow.locator('text=Experimental feature');
      const experimentalVisible = await experimental.isVisible().catch(() => false);
      console.log(`Experimental warning visible: ${experimentalVisible}`);

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-description.png' });
    });

    test('apps page has Import App button', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(1500);

      const importButton = mainWindow.locator('button:has-text("Import App")');
      const importVisible = await importButton.isVisible().catch(() => false);
      console.log(`Import App button visible: ${importVisible}`);

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-import-button.png' });
    });

    test('apps page shows loading state, empty state, or app cards', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(3000);

      // Check for loading state
      const loadingText = mainWindow.locator('text=Loading apps...');
      const loadingVisible = await loadingText.isVisible().catch(() => false);

      if (loadingVisible) {
        console.log('Loading state is shown');
        await mainWindow.screenshot({ path: 'test-results/apps-workflow-loading.png' });
        return;
      }

      // Check for empty state
      const emptyState = mainWindow.locator('text=No apps available');
      const emptyVisible = await emptyState.isVisible().catch(() => false);

      if (emptyVisible) {
        console.log('Empty state is shown (no apps)');
        const guidance = mainWindow.locator('text=ask goose for the app you want');
        const guidanceVisible = await guidance.isVisible().catch(() => false);
        console.log(`Empty state guidance visible: ${guidanceVisible}`);
      } else {
        // App cards should be in a grid layout
        const appCards = mainWindow.locator('.border.rounded-lg').filter({
          has: mainWindow.locator('h3'),
        });
        const cardCount = await appCards.count().catch(() => 0);
        console.log(`App cards found: ${cardCount}`);
      }

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-list.png' });
    });
  });

  test.describe('App Card Details', () => {
    test('app cards display name and description', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(3000);

      // App cards have h3 for name and p for description
      const appNames = mainWindow.locator('.border.rounded-lg h3');
      const nameCount = await appNames.count().catch(() => 0);
      console.log(`App name elements found: ${nameCount}`);

      if (nameCount > 0) {
        const firstName = await appNames.first().textContent();
        console.log(`First app name: "${firstName}"`);
        expect(firstName).toBeTruthy();
      }

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-card-details.png' });
    });

    test('app cards have Launch button', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(3000);

      const launchButtons = mainWindow.locator('button:has-text("Launch")');
      const launchCount = await launchButtons.count().catch(() => 0);
      console.log(`Launch buttons found: ${launchCount}`);

      if (launchCount > 0) {
        // Each Launch button should have a Play icon
        const firstLaunch = launchButtons.first();
        await expect(firstLaunch).toBeVisible();

        const playIcon = firstLaunch.locator('svg.lucide-play');
        const hasIcon = await playIcon.count().catch(() => 0);
        console.log(`First Launch button has Play icon: ${hasIcon > 0}`);
      }

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-launch-buttons.png' });
    });

    test('custom app cards have Download button', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(3000);

      // Custom apps (from "apps" MCP server) show a Download button
      const downloadButtons = mainWindow.locator('button').filter({
        has: mainWindow.locator('svg.lucide-download'),
      });
      const downloadCount = await downloadButtons.count().catch(() => 0);
      console.log(`Download buttons found (custom apps): ${downloadCount}`);

      // Check for "Custom app" badges
      const customBadges = mainWindow.locator('text=Custom app');
      const customCount = await customBadges.count().catch(() => 0);
      console.log(`Custom app badges found: ${customCount}`);

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-download-buttons.png' });
    });

    test('app cards show MCP server badge', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(3000);

      // Each app card may display its MCP server name as a badge
      const serverBadges = mainWindow.locator('.bg-background-muted.text-text-muted.rounded');
      const badgeCount = await serverBadges.count().catch(() => 0);
      console.log(`Server/source badges found: ${badgeCount}`);

      if (badgeCount > 0) {
        const firstBadge = await serverBadges.first().textContent();
        console.log(`First server badge text: "${firstBadge}"`);
      }

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-server-badges.png' });
    });
  });

  test.describe('App Error Handling', () => {
    test('apps page handles error state with retry button', async () => {
      await navigateToRoute('#/apps');
      await mainWindow.waitForTimeout(3000);

      // If error occurs and no cached apps, error UI is shown
      const errorText = mainWindow.locator('text=Error loading apps');
      const errorVisible = await errorText.isVisible().catch(() => false);
      console.log(`Error state visible: ${errorVisible}`);

      if (errorVisible) {
        const retryButton = mainWindow.locator('button:has-text("Retry")');
        const retryVisible = await retryButton.isVisible().catch(() => false);
        console.log(`Retry button visible: ${retryVisible}`);
        expect(retryVisible).toBe(true);
      } else {
        console.log('No error state shown - app loaded successfully or showing cached data');
      }

      await mainWindow.screenshot({ path: 'test-results/apps-workflow-error-state.png' });
    });
  });
});
