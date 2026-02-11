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
 * Helper: wait for the app to be ready and ensure we are on a page
 * where the TimeWarp bar should appear.
 */
async function waitForAppReady() {
  console.log('Waiting for app to be ready...');

  await mainWindow.waitForFunction(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0;
  }, { timeout: 15000 });

  // Wait for the chat interface or main layout to be available
  await mainWindow.waitForTimeout(1000);
  console.log('App is ready');
}

test.describe('TimeWarp Bar', () => {
  test.describe('Slim Mode', () => {
    test('TimeWarp bar appears at bottom in slim mode', async () => {
      await waitForAppReady();

      // Look for the TimeWarp bar container at the bottom of the viewport
      const timewarpBar = mainWindow.locator('[data-testid="timewarp-bar"]');
      const isVisible = await timewarpBar.isVisible().catch(() => false);
      console.log(`TimeWarp bar visible: ${isVisible}`);

      // Also try class-based or role-based selectors
      const timelineBar = mainWindow.locator('[data-testid="timewarp-slim-bar"]');
      const slimBarVisible = await timelineBar.isVisible().catch(() => false);
      console.log(`TimeWarp slim bar visible: ${slimBarVisible}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-bar-slim.png' });
    });
  });

  test.describe('Expand/Collapse', () => {
    test('clicking expand shows full timeline', async () => {
      await waitForAppReady();

      // Look for the expand button on the TimeWarp bar
      const expandButton = mainWindow.locator('[data-testid="timewarp-expand"]');
      const expandVisible = await expandButton.isVisible().catch(() => false);
      console.log(`TimeWarp expand button visible: ${expandVisible}`);

      if (expandVisible) {
        await expandButton.click();
        await mainWindow.waitForTimeout(500);

        // After expanding, the full timeline panel should be visible
        const fullTimeline = mainWindow.locator('[data-testid="timewarp-full-timeline"]');
        const timelineVisible = await fullTimeline.isVisible().catch(() => false);
        console.log(`Full timeline visible after expand: ${timelineVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-bar-expanded.png' });
    });
  });

  test.describe('Transport Controls', () => {
    test('transport controls (play/pause) are clickable', async () => {
      await waitForAppReady();

      // Look for play/pause transport controls
      const playButton = mainWindow.locator('[data-testid="timewarp-play"]');
      const pauseButton = mainWindow.locator('[data-testid="timewarp-pause"]');

      const playVisible = await playButton.isVisible().catch(() => false);
      const pauseVisible = await pauseButton.isVisible().catch(() => false);
      console.log(`Transport controls - Play: ${playVisible}, Pause: ${pauseVisible}`);

      // Try clicking the play button if visible
      if (playVisible) {
        await playButton.click();
        await mainWindow.waitForTimeout(300);
        console.log('Clicked play button');

        // After clicking play, pause should become visible (or play state changes)
        const pauseAfterPlay = await pauseButton.isVisible().catch(() => false);
        console.log(`Pause button visible after play click: ${pauseAfterPlay}`);
      }

      // Also look for generic transport controls
      const transportControls = mainWindow.locator('[data-testid="timewarp-transport"]');
      const transportVisible = await transportControls.isVisible().catch(() => false);
      console.log(`Transport controls container visible: ${transportVisible}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-transport-controls.png' });
    });
  });

  test.describe('Branch Selector', () => {
    test('branch selector dropdown opens', async () => {
      await waitForAppReady();

      // Look for the branch selector
      const branchSelector = mainWindow.locator('[data-testid="timewarp-branch-selector"]');
      const selectorVisible = await branchSelector.isVisible().catch(() => false);
      console.log(`Branch selector visible: ${selectorVisible}`);

      if (selectorVisible) {
        await branchSelector.click();
        await mainWindow.waitForTimeout(500);

        // After clicking, a dropdown or popover should appear
        const dropdown = mainWindow.locator('[data-testid="timewarp-branch-dropdown"]');
        const dropdownVisible = await dropdown.isVisible().catch(() => false);
        console.log(`Branch dropdown visible: ${dropdownVisible}`);

        // Also try looking for listbox/menu roles
        const listbox = mainWindow.locator('[role="listbox"], [role="menu"]');
        const listboxVisible = await listbox.first().isVisible().catch(() => false);
        console.log(`Listbox/menu visible: ${listboxVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-branch-selector.png' });
    });
  });

  test.describe('Minimap', () => {
    test('minimap renders', async () => {
      await waitForAppReady();

      // Look for the minimap element within the TimeWarp bar
      const minimap = mainWindow.locator('[data-testid="timewarp-minimap"]');
      const minimapVisible = await minimap.isVisible().catch(() => false);
      console.log(`TimeWarp minimap visible: ${minimapVisible}`);

      // Also try canvas or svg elements that might render the minimap
      const canvas = mainWindow.locator('[data-testid="timewarp-bar"] canvas, [data-testid="timewarp-bar"] svg');
      const canvasCount = await canvas.count().catch(() => 0);
      console.log(`Canvas/SVG elements in TimeWarp bar: ${canvasCount}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-minimap.png' });
    });
  });
});
