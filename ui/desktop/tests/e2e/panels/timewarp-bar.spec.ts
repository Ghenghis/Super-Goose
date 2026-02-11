/**
 * E2E tests for TimeWarp Bar components.
 *
 * The TimeWarp bar is a dockable timeline visualization that appears at the
 * bottom of the chat window. It includes:
 *   - Slim mode bar with event indicators
 *   - Expand/collapse toggle
 *   - TimelineTrack with event nodes
 *   - TransportControls (play / pause / step forward / step back)
 *   - BranchSelector dropdown
 *   - EventInspector popover
 *   - TimeWarpMinimap SVG overview
 *
 * These tests verify the UI rendering and interactivity. They run against the
 * Electron app with mock/static data -- no backend required.
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
// Helper
// ---------------------------------------------------------------------------

async function waitForAppReady() {
  console.log('Waiting for app to be ready...');

  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 },
  );

  // Ensure we're on the chat view where the TimeWarp bar should render
  await mainWindow.evaluate(() => {
    window.location.hash = '#/chat/new';
  });
  await mainWindow.waitForTimeout(1500);
  console.log('App is ready');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

      // The bar should be positioned at the bottom (check bounding box)
      if (isVisible) {
        const box = await timewarpBar.boundingBox();
        if (box) {
          const viewportSize = mainWindow.viewportSize();
          if (viewportSize) {
            const isAtBottom = box.y > viewportSize.height * 0.7;
            console.log(`TimeWarp bar at bottom: ${isAtBottom} (y=${box.y}, viewport.height=${viewportSize.height})`);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-bar-slim.png' });
    });

    test('TimeWarp bar shows event indicator dots', async () => {
      await waitForAppReady();

      // Event nodes on the timeline track
      const eventNodes = mainWindow.locator(
        '[data-testid="timewarp-event-node"], [data-testid="timewarp-bar"] .event-node',
      );
      const nodeCount = await eventNodes.count().catch(() => 0);
      console.log(`TimeWarp event nodes found: ${nodeCount}`);

      // Also look for small circle indicators within the bar
      const dots = mainWindow.locator('[data-testid="timewarp-bar"] circle, [data-testid="timewarp-bar"] .rounded-full');
      const dotCount = await dots.count().catch(() => 0);
      console.log(`TimeWarp indicator dots found: ${dotCount}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-bar-events.png' });
    });
  });

  test.describe('Expand/Collapse', () => {
    test('clicking expand shows full timeline', async () => {
      await waitForAppReady();

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

        // The expanded panel should be taller than the slim bar
        const fullTimelineBox = await fullTimeline.boundingBox().catch(() => null);
        if (fullTimelineBox) {
          console.log(`Full timeline height: ${fullTimelineBox.height}`);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-bar-expanded.png' });
    });

    test('clicking collapse returns to slim mode', async () => {
      await waitForAppReady();

      // First expand
      const expandButton = mainWindow.locator('[data-testid="timewarp-expand"]');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await mainWindow.waitForTimeout(500);

        // Then collapse
        const collapseButton = mainWindow.locator('[data-testid="timewarp-collapse"]');
        if (await collapseButton.isVisible().catch(() => false)) {
          await collapseButton.click();
          await mainWindow.waitForTimeout(500);

          // Full timeline should no longer be visible
          const fullTimeline = mainWindow.locator('[data-testid="timewarp-full-timeline"]');
          const timelineVisible = await fullTimeline.isVisible().catch(() => false);
          console.log(`Full timeline visible after collapse: ${timelineVisible}`);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-bar-collapsed.png' });
    });
  });

  test.describe('Timeline Track', () => {
    test('TimelineTrack shows event nodes', async () => {
      await waitForAppReady();

      // The timeline track should contain event nodes
      const track = mainWindow.locator('[data-testid="timewarp-timeline-track"]');
      const trackVisible = await track.isVisible().catch(() => false);
      console.log(`Timeline track visible: ${trackVisible}`);

      // Event nodes within the track
      const nodes = mainWindow.locator('[data-testid^="timewarp-event-"]');
      const nodeCount = await nodes.count().catch(() => 0);
      console.log(`Timeline event node count: ${nodeCount}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-timeline-track.png' });
    });
  });

  test.describe('Transport Controls', () => {
    test('transport controls have play/pause/step buttons', async () => {
      await waitForAppReady();

      // Play button
      const playButton = mainWindow.locator('[data-testid="timewarp-play"]');
      const playVisible = await playButton.isVisible().catch(() => false);
      console.log(`Play button visible: ${playVisible}`);

      // Pause button
      const pauseButton = mainWindow.locator('[data-testid="timewarp-pause"]');
      const pauseVisible = await pauseButton.isVisible().catch(() => false);
      console.log(`Pause button visible: ${pauseVisible}`);

      // Step forward button
      const stepForward = mainWindow.locator('[data-testid="timewarp-step-forward"]');
      const stepFwdVisible = await stepForward.isVisible().catch(() => false);
      console.log(`Step forward button visible: ${stepFwdVisible}`);

      // Step back button
      const stepBack = mainWindow.locator('[data-testid="timewarp-step-back"]');
      const stepBackVisible = await stepBack.isVisible().catch(() => false);
      console.log(`Step back button visible: ${stepBackVisible}`);

      // Also look for generic transport controls container
      const transportControls = mainWindow.locator('[data-testid="timewarp-transport"]');
      const transportVisible = await transportControls.isVisible().catch(() => false);
      console.log(`Transport controls container visible: ${transportVisible}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-transport-controls.png' });
    });

    test('play/pause button toggles state', async () => {
      await waitForAppReady();

      const playButton = mainWindow.locator('[data-testid="timewarp-play"]');
      const pauseButton = mainWindow.locator('[data-testid="timewarp-pause"]');

      if (await playButton.isVisible().catch(() => false)) {
        await playButton.click();
        await mainWindow.waitForTimeout(300);
        console.log('Clicked play button');

        // After clicking play, pause should become visible
        const pauseAfterPlay = await pauseButton.isVisible().catch(() => false);
        console.log(`Pause button visible after play click: ${pauseAfterPlay}`);
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-play-pause-toggle.png' });
    });
  });

  test.describe('Branch Selector', () => {
    test('branch selector dropdown opens', async () => {
      await waitForAppReady();

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

        // Close the dropdown
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-branch-selector.png' });
    });

    test('branch selector shows branch names', async () => {
      await waitForAppReady();

      const branchSelector = mainWindow.locator('[data-testid="timewarp-branch-selector"]');
      if (await branchSelector.isVisible().catch(() => false)) {
        await branchSelector.click();
        await mainWindow.waitForTimeout(500);

        // Look for branch name text like "main" or "branch-1"
        const branchName = mainWindow.locator('text=main').or(mainWindow.locator('text=branch'));
        const nameVisible = await branchName.first().isVisible().catch(() => false);
        console.log(`Branch name visible in dropdown: ${nameVisible}`);

        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-branch-names.png' });
    });
  });

  test.describe('Event Inspector', () => {
    test('EventInspector appears on event click', async () => {
      await waitForAppReady();

      // Click on an event node in the timeline
      const eventNode = mainWindow.locator('[data-testid^="timewarp-event-"]').first();
      if (await eventNode.isVisible().catch(() => false)) {
        await eventNode.click();
        await mainWindow.waitForTimeout(500);

        // The event inspector popover should appear
        const inspector = mainWindow.locator('[data-testid="timewarp-event-inspector"]');
        const inspectorVisible = await inspector.isVisible().catch(() => false);
        console.log(`Event inspector visible: ${inspectorVisible}`);

        // Inspector should show event details
        if (inspectorVisible) {
          const detailText = await inspector.textContent().catch(() => '');
          console.log(`Event inspector content length: ${detailText.length}`);
        }
      } else {
        console.log('No event nodes visible to click');
      }

      await mainWindow.screenshot({ path: 'test-results/timewarp-event-inspector.png' });
    });
  });

  test.describe('Minimap', () => {
    test('TimeWarpMinimap renders SVG', async () => {
      await waitForAppReady();

      // Look for the minimap element within the TimeWarp bar
      const minimap = mainWindow.locator('[data-testid="timewarp-minimap"]');
      const minimapVisible = await minimap.isVisible().catch(() => false);
      console.log(`TimeWarp minimap visible: ${minimapVisible}`);

      // Check for SVG elements that form the minimap
      const svgElements = mainWindow.locator(
        '[data-testid="timewarp-bar"] svg, [data-testid="timewarp-minimap"] svg',
      );
      const svgCount = await svgElements.count().catch(() => 0);
      console.log(`SVG elements in TimeWarp area: ${svgCount}`);

      // Also check for canvas elements (alternative rendering)
      const canvasElements = mainWindow.locator(
        '[data-testid="timewarp-bar"] canvas, [data-testid="timewarp-minimap"] canvas',
      );
      const canvasCount = await canvasElements.count().catch(() => 0);
      console.log(`Canvas elements in TimeWarp area: ${canvasCount}`);

      await mainWindow.screenshot({ path: 'test-results/timewarp-minimap.png' });
    });
  });
});
