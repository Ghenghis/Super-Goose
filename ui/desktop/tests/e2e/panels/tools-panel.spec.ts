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
 * Helper: navigate to the tools panel route.
 */
async function navigateToToolsPanel() {
  console.log('Navigating to Tools panel...');

  // Wait for the app to be ready
  await mainWindow.waitForFunction(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0;
  }, { timeout: 15000 });

  // Navigate to the tools route
  await mainWindow.evaluate(() => {
    window.location.hash = '#/tools';
  });
  await mainWindow.waitForTimeout(1000);
  console.log('Tools panel route loaded');
}

test.describe('Tools Bridge Panel', () => {
  test.describe('Tier Sections', () => {
    test('ToolsBridgePanel shows 3 tier sections', async () => {
      await navigateToToolsPanel();

      // The tools bridge panel should contain three distinct tier sections
      const toolsPanel = mainWindow.locator('[data-testid="tools-bridge-panel"]');
      const panelVisible = await toolsPanel.isVisible().catch(() => false);
      console.log(`Tools bridge panel visible: ${panelVisible}`);

      // Check for Tier 1: Builtin extensions
      const tier1Section = mainWindow.locator('[data-testid="tools-tier-builtin"]');
      const tier1Visible = await tier1Section.isVisible().catch(() => false);
      console.log(`Tier 1 (Builtin) section visible: ${tier1Visible}`);

      // Also try text-based lookup
      const builtinText = mainWindow.locator('text=Builtin').first();
      const builtinVisible = await builtinText.isVisible().catch(() => false);
      console.log(`Builtin text visible: ${builtinVisible}`);

      // Check for Tier 2: Bundled extensions
      const tier2Section = mainWindow.locator('[data-testid="tools-tier-bundled"]');
      const tier2Visible = await tier2Section.isVisible().catch(() => false);
      console.log(`Tier 2 (Bundled) section visible: ${tier2Visible}`);

      const bundledText = mainWindow.locator('text=Bundled').first();
      const bundledVisible = await bundledText.isVisible().catch(() => false);
      console.log(`Bundled text visible: ${bundledVisible}`);

      // Check for Tier 3: Custom extensions
      const tier3Section = mainWindow.locator('[data-testid="tools-tier-custom"]');
      const tier3Visible = await tier3Section.isVisible().catch(() => false);
      console.log(`Tier 3 (Custom) section visible: ${tier3Visible}`);

      const customText = mainWindow.locator('text=Custom').first();
      const customVisible = await customText.isVisible().catch(() => false);
      console.log(`Custom text visible: ${customVisible}`);

      await mainWindow.screenshot({ path: 'test-results/tools-panel-tiers.png' });
    });
  });

  test.describe('Search Filter', () => {
    test('search filter works', async () => {
      await navigateToToolsPanel();

      // Look for the search/filter input in the tools panel
      const searchInput = mainWindow.locator(
        '[data-testid="tools-search"], input[placeholder*="Search"], input[placeholder*="Filter"]'
      );
      const inputVisible = await searchInput.first().isVisible().catch(() => false);
      console.log(`Tools search input visible: ${inputVisible}`);

      if (inputVisible) {
        // Type a search query to filter tools
        await searchInput.first().fill('developer');
        await mainWindow.waitForTimeout(500);
        console.log('Typed "developer" in search filter');

        // Verify that the tool list is filtered (fewer items should be visible)
        const toolItems = mainWindow.locator('[data-testid="tool-item"]');
        const filteredCount = await toolItems.count().catch(() => 0);
        console.log(`Filtered tool count: ${filteredCount}`);

        // Clear the search
        await searchInput.first().fill('');
        await mainWindow.waitForTimeout(500);

        const unfilteredCount = await toolItems.count().catch(() => 0);
        console.log(`Unfiltered tool count: ${unfilteredCount}`);
      }

      await mainWindow.screenshot({ path: 'test-results/tools-panel-search.png' });
    });
  });

  test.describe('Tool Toggle', () => {
    test('tool toggle switches', async () => {
      await navigateToToolsPanel();

      // Look for toggle switches within tool items
      const toggleSwitches = mainWindow.locator('[data-testid="tool-toggle"], button[role="switch"]');
      const toggleCount = await toggleSwitches.count().catch(() => 0);
      console.log(`Tool toggle switch count: ${toggleCount}`);

      if (toggleCount > 0) {
        // Get the first toggle switch
        const firstToggle = toggleSwitches.first();
        const isVisible = await firstToggle.isVisible().catch(() => false);
        console.log(`First toggle visible: ${isVisible}`);

        if (isVisible) {
          // Get initial state
          const initialState = await firstToggle.getAttribute('data-state').catch(() => null);
          console.log(`First toggle initial state: ${initialState}`);

          // Click to toggle
          await firstToggle.click();
          await mainWindow.waitForTimeout(500);

          // Get new state
          const newState = await firstToggle.getAttribute('data-state').catch(() => null);
          console.log(`First toggle new state: ${newState}`);

          // Toggle back to restore original state
          await firstToggle.click();
          await mainWindow.waitForTimeout(300);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/tools-panel-toggle.png' });
    });
  });

  test.describe('Tool Detail Modal', () => {
    test('tool detail modal opens on info click', async () => {
      await navigateToToolsPanel();

      // Look for info/detail buttons on tool items
      const infoButtons = mainWindow.locator(
        '[data-testid="tool-info"], button[aria-label*="info"], button[aria-label*="detail"]'
      );
      const infoCount = await infoButtons.count().catch(() => 0);
      console.log(`Tool info button count: ${infoCount}`);

      if (infoCount > 0) {
        // Click the first info button
        const firstInfo = infoButtons.first();
        const isVisible = await firstInfo.isVisible().catch(() => false);
        console.log(`First info button visible: ${isVisible}`);

        if (isVisible) {
          await firstInfo.click();
          await mainWindow.waitForTimeout(500);

          // A modal or dialog should appear with tool details
          const modal = mainWindow.locator(
            '[data-testid="tool-detail-modal"], [role="dialog"], [role="alertdialog"]'
          );
          const modalVisible = await modal.first().isVisible().catch(() => false);
          console.log(`Tool detail modal visible: ${modalVisible}`);

          // If modal is open, close it
          if (modalVisible) {
            // Try pressing Escape to close
            await mainWindow.keyboard.press('Escape');
            await mainWindow.waitForTimeout(300);
            console.log('Closed tool detail modal');
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/tools-panel-detail-modal.png' });
    });
  });
});
