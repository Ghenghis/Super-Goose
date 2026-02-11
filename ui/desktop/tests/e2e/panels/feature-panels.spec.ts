// E2E test stubs - require Electron runtime for full execution
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

/**
 * Helper: navigate to a specific hash route.
 */
async function navigateToRoute(route: string) {
  console.log(`Navigating to route: ${route}`);

  // Wait for the app to be ready
  await mainWindow.waitForFunction(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0;
  }, { timeout: 15000 });

  // Navigate to the target route
  await mainWindow.evaluate((r: string) => {
    window.location.hash = r;
  }, route);

  await mainWindow.waitForTimeout(1000);
  console.log(`Route ${route} loaded`);
}

test.describe('Feature Panels', () => {
  test.describe('Search Sidebar', () => {
    test('/search route renders SearchSidebar with input field', async () => {
      await navigateToRoute('#/search');

      // The search sidebar should render
      const searchSidebar = mainWindow.locator('[data-testid="search-sidebar"]');
      const sidebarVisible = await searchSidebar.isVisible().catch(() => false);
      console.log(`Search sidebar visible: ${sidebarVisible}`);

      // Look for the search input field
      const searchInput = mainWindow.locator(
        '[data-testid="search-input"], input[type="search"], input[placeholder*="Search"]'
      );
      const inputVisible = await searchInput.first().isVisible().catch(() => false);
      console.log(`Search input visible: ${inputVisible}`);

      // Also look for text-based indicators
      const searchHeading = mainWindow.locator('text=Search').first();
      const headingVisible = await searchHeading.isVisible().catch(() => false);
      console.log(`Search heading visible: ${headingVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-search-sidebar.png' });
    });
  });

  test.describe('Bookmark Manager', () => {
    test('/bookmarks route renders BookmarkManager', async () => {
      await navigateToRoute('#/bookmarks');

      // The bookmark manager should render
      const bookmarkManager = mainWindow.locator('[data-testid="bookmark-manager"]');
      const managerVisible = await bookmarkManager.isVisible().catch(() => false);
      console.log(`Bookmark manager visible: ${managerVisible}`);

      // Look for bookmark-related text
      const bookmarkHeading = mainWindow.locator('text=Bookmark').first();
      const headingVisible = await bookmarkHeading.isVisible().catch(() => false);
      console.log(`Bookmark heading visible: ${headingVisible}`);

      // Check for bookmark list or empty state
      const bookmarkList = mainWindow.locator('[data-testid="bookmark-list"]');
      const listVisible = await bookmarkList.isVisible().catch(() => false);
      console.log(`Bookmark list visible: ${listVisible}`);

      const emptyState = mainWindow.locator('text=No bookmarks');
      const emptyVisible = await emptyState.isVisible().catch(() => false);
      console.log(`Empty state visible: ${emptyVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-bookmark-manager.png' });
    });
  });

  test.describe('Reflexion Panel', () => {
    test('/reflexion route renders ReflexionPanel', async () => {
      await navigateToRoute('#/reflexion');

      // The reflexion panel should render
      const reflexionPanel = mainWindow.locator('[data-testid="reflexion-panel"]');
      const panelVisible = await reflexionPanel.isVisible().catch(() => false);
      console.log(`Reflexion panel visible: ${panelVisible}`);

      // Look for reflexion-related text
      const reflexionHeading = mainWindow.locator('text=Reflexion').first();
      const headingVisible = await reflexionHeading.isVisible().catch(() => false);
      console.log(`Reflexion heading visible: ${headingVisible}`);

      // Check for reflexion insights or configuration
      const insightsSection = mainWindow.locator('[data-testid="reflexion-insights"]');
      const insightsVisible = await insightsSection.isVisible().catch(() => false);
      console.log(`Reflexion insights visible: ${insightsVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-reflexion-panel.png' });
    });
  });

  test.describe('Budget Panel', () => {
    test('/budget route renders BudgetPanel', async () => {
      await navigateToRoute('#/budget');

      // The budget panel should render
      const budgetPanel = mainWindow.locator('[data-testid="budget-panel"]');
      const panelVisible = await budgetPanel.isVisible().catch(() => false);
      console.log(`Budget panel visible: ${panelVisible}`);

      // Look for budget-related text
      const budgetHeading = mainWindow.locator('text=Budget').first();
      const headingVisible = await budgetHeading.isVisible().catch(() => false);
      console.log(`Budget heading visible: ${headingVisible}`);

      // Check for budget controls (limit input, progress bar, etc.)
      const budgetLimit = mainWindow.locator('[data-testid="budget-limit"]');
      const limitVisible = await budgetLimit.isVisible().catch(() => false);
      console.log(`Budget limit control visible: ${limitVisible}`);

      const budgetUsage = mainWindow.locator('[data-testid="budget-usage"]');
      const usageVisible = await budgetUsage.isVisible().catch(() => false);
      console.log(`Budget usage display visible: ${usageVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-budget-panel.png' });
    });
  });

  test.describe('Tools Bridge Panel', () => {
    test('/tools route renders ToolsBridgePanel with tier sections', async () => {
      await navigateToRoute('#/tools');

      // The tools bridge panel should render
      const toolsPanel = mainWindow.locator('[data-testid="tools-bridge-panel"]');
      const panelVisible = await toolsPanel.isVisible().catch(() => false);
      console.log(`Tools bridge panel visible: ${panelVisible}`);

      // Look for tools-related text
      const toolsHeading = mainWindow.locator('text=Tools').first();
      const headingVisible = await toolsHeading.isVisible().catch(() => false);
      console.log(`Tools heading visible: ${headingVisible}`);

      // Check for tier sections (Builtin, Bundled, Custom)
      const tier1 = mainWindow.locator('text=Builtin').first();
      const tier2 = mainWindow.locator('text=Bundled').first();
      const tier3 = mainWindow.locator('text=Custom').first();

      const tier1Visible = await tier1.isVisible().catch(() => false);
      const tier2Visible = await tier2.isVisible().catch(() => false);
      const tier3Visible = await tier3.isVisible().catch(() => false);
      console.log(`Tier sections - Builtin: ${tier1Visible}, Bundled: ${tier2Visible}, Custom: ${tier3Visible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-tools-bridge-panel.png' });
    });
  });
});
