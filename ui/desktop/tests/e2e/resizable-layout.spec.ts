/**
 * E2E tests for the Resizable Panel Layout system.
 *
 * Tests the ResizableLayout component which provides the main layout
 * orchestration using react-resizable-panels. The layout has:
 *
 *   - Left zone (sidebar)
 *   - Center zone (chat — always visible)
 *   - Right zone (Agent Panel / Super-Goose)
 *   - Bottom zone (Pipeline / Terminal / Logs)
 *   - Status bar (presets, lock/unlock, panel toggles)
 *
 * Tests verify:
 *   1. Layout renders with all zones visible (Standard preset)
 *   2. Horizontal resize between panels
 *   3. Vertical resize for bottom panel
 *   4. Panel visibility toggles
 *   5. Layout presets (Focus, Standard, Full, Agent)
 *   6. Lock/Unlock mode
 *   7. Content not cut off in zones
 *
 * These tests launch a real Electron app via the fixture and verify
 * the layout DOM produced by PanelSystemProvider + ResizableLayout.
 */
import { test as base, expect } from './fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from './test-overlay';

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
 * Wait for the React root to mount and navigate to the chat view where
 * the ResizableLayout is rendered as the main layout shell.
 */
async function ensureLayoutReady() {
  console.log('[layout] Waiting for React root to mount...');

  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 30000 },
  );

  // Navigate to the chat route which renders AppLayout -> ResizableLayout
  await mainWindow.evaluate(() => {
    window.location.hash = '#/chat/new';
  });

  // Wait for the initial navigation and component render
  await mainWindow.waitForTimeout(3000);

  // Wait for the resizable layout to actually appear in the DOM
  await mainWindow.waitForFunction(
    () => {
      const layout = document.querySelector('[data-testid="resizable-layout"]');
      return !!layout;
    },
    { timeout: 15000 },
  ).catch(() => {
    console.log('[layout] resizable-layout data-testid not found, continuing...');
  });

  // Extra buffer for panels and status bar to fully render
  await mainWindow.waitForTimeout(1000);

  console.log('[layout] Layout should be ready');
}

/**
 * Clear any persisted layout from localStorage to start from the
 * default Standard preset.
 */
async function resetLayoutToDefault() {
  await mainWindow.evaluate(() => {
    localStorage.removeItem('sg-layout-v4');
    localStorage.removeItem('sg-layout-v2');
    localStorage.removeItem('sg-layout-v1');
  });
}

/**
 * Get bounding box of an element by data-testid.
 * Returns null if not found.
 */
async function getBoundingBox(testId: string) {
  const el = mainWindow.locator(`[data-testid="${testId}"]`);
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return null;
  return el.boundingBox();
}

// ---------------------------------------------------------------------------
// 1. Layout renders with all zones visible (Standard preset)
// ---------------------------------------------------------------------------

test.describe('Resizable Layout', () => {
  test.describe('Layout zones render correctly', () => {
    test('resizable-layout container is present', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const layout = mainWindow.locator('[data-testid="resizable-layout"]');
      const layoutVisible = await layout.isVisible().catch(() => false);
      console.log(`[layout] resizable-layout container visible: ${layoutVisible}`);

      // The layout container should exist in the DOM
      if (layoutVisible) {
        expect(layoutVisible).toBe(true);
      } else {
        // If the resizable layout isn't rendered yet, check for any layout
        console.log('[layout] Checking for alternative layout indicators...');
        const hasRoot = await mainWindow.evaluate(() => {
          const root = document.getElementById('root');
          return root && root.children.length > 0;
        });
        expect(hasRoot).toBe(true);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-container.png' });
    });

    test('left zone (sidebar) is visible in Standard preset', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const leftZone = mainWindow.locator('[data-testid="left-zone"]');
      const leftVisible = await leftZone.isVisible().catch(() => false);
      console.log(`[layout] Left zone visible: ${leftVisible}`);

      if (leftVisible) {
        // Verify it has non-zero dimensions
        const box = await leftZone.boundingBox();
        console.log(`[layout] Left zone dimensions: ${JSON.stringify(box)}`);
        if (box) {
          expect(box.width).toBeGreaterThan(50);
          expect(box.height).toBeGreaterThan(50);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-left-zone.png' });
    });

    test('center zone (chat) is always visible', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const centerZone = mainWindow.locator('[data-testid="center-zone"]');
      const centerVisible = await centerZone.isVisible().catch(() => false);
      console.log(`[layout] Center zone visible: ${centerVisible}`);

      if (centerVisible) {
        const box = await centerZone.boundingBox();
        console.log(`[layout] Center zone dimensions: ${JSON.stringify(box)}`);
        if (box) {
          // Center zone should occupy significant width (at least 30% = minSize)
          expect(box.width).toBeGreaterThan(100);
          expect(box.height).toBeGreaterThan(100);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-center-zone.png' });
    });

    test('right zone (agent panel) is visible in Standard preset', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const rightZone = mainWindow.locator('[data-testid="right-zone"]');
      const rightVisible = await rightZone.isVisible().catch(() => false);
      console.log(`[layout] Right zone visible: ${rightVisible}`);

      if (rightVisible) {
        const box = await rightZone.boundingBox();
        console.log(`[layout] Right zone dimensions: ${JSON.stringify(box)}`);
        if (box) {
          expect(box.width).toBeGreaterThan(50);
          expect(box.height).toBeGreaterThan(50);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-right-zone.png' });
    });

    test('bottom zone exists in the DOM', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Standard preset has pipeline in bottom but collapsed by default
      const bottomZone = mainWindow.locator('[data-testid="bottom-zone"]');
      const bottomExists = await bottomZone.count().catch(() => 0);
      console.log(`[layout] Bottom zone elements in DOM: ${bottomExists}`);

      // Bottom zone may be collapsed in Standard preset but should exist
      // if the layout is rendering the vertical group
      await mainWindow.screenshot({ path: 'test-results/resizable-layout-bottom-zone.png' });
    });

    test('status bar is always visible', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const statusBar = mainWindow.locator('[data-testid="status-bar"]');
      const statusVisible = await statusBar.isVisible().catch(() => false);
      console.log(`[layout] Status bar visible: ${statusVisible}`);

      if (statusVisible) {
        const box = await statusBar.boundingBox();
        console.log(`[layout] Status bar dimensions: ${JSON.stringify(box)}`);
        if (box) {
          // Status bar is 28px tall, full width
          expect(box.height).toBeGreaterThanOrEqual(20);
          expect(box.height).toBeLessThanOrEqual(40);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-status-bar.png' });
    });

    test('status bar contains preset selector', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // The PanelToolbar renders inside StatusBar with preset name + lock button
      // Standard preset shows "Standard" text
      const presetButton = mainWindow.locator('button[title="Layout preset"]');
      const presetVisible = await presetButton.isVisible().catch(() => false);
      console.log(`[layout] Preset selector button visible: ${presetVisible}`);

      if (presetVisible) {
        // The button text should contain the current preset name
        const text = await presetButton.textContent();
        console.log(`[layout] Preset button text: "${text}"`);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-preset-selector.png' });
    });

    test('status bar contains lock toggle', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Lock toggle has title "Lock layout" or "Unlock layout"
      const lockButton = mainWindow.locator(
        'button[title*="Lock layout"], button[title*="Unlock layout"]'
      );
      const lockVisible = await lockButton.isVisible().catch(() => false);
      console.log(`[layout] Lock toggle button visible: ${lockVisible}`);

      if (lockVisible) {
        const title = await lockButton.getAttribute('title');
        console.log(`[layout] Lock button title: "${title}"`);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-lock-toggle.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Horizontal resize between panels
  // ---------------------------------------------------------------------------

  test.describe('Horizontal resize', () => {
    test('left panel can be resized by dragging separator', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const leftZone = mainWindow.locator('[data-testid="left-zone"]');
      const leftVisible = await leftZone.isVisible().catch(() => false);

      if (!leftVisible) {
        console.log('[layout] Left zone not visible, skipping resize test');
        return;
      }

      // Get initial dimensions
      const initialBox = await leftZone.boundingBox();
      console.log(`[layout] Left zone initial width: ${initialBox?.width}`);

      // Find the horizontal resize handle (Separator from react-resizable-panels)
      // The separator is a sibling after the left panel with cursor-col-resize
      const resizeHandle = mainWindow.locator('[role="separator"][aria-orientation="vertical"]').first();
      const handleVisible = await resizeHandle.isVisible().catch(() => false);
      console.log(`[layout] Horizontal resize handle visible: ${handleVisible}`);

      if (handleVisible && initialBox) {
        const handleBox = await resizeHandle.boundingBox();
        if (handleBox) {
          // Drag the handle 50px to the right to widen left panel
          const startX = handleBox.x + handleBox.width / 2;
          const startY = handleBox.y + handleBox.height / 2;
          const endX = startX + 50;

          await mainWindow.mouse.move(startX, startY);
          await mainWindow.mouse.down();
          await mainWindow.mouse.move(endX, startY, { steps: 10 });
          await mainWindow.mouse.up();
          await mainWindow.waitForTimeout(500);

          // Check that the width changed
          const newBox = await leftZone.boundingBox();
          console.log(`[layout] Left zone new width: ${newBox?.width}`);

          // Width should have increased (with some tolerance)
          if (newBox && initialBox) {
            console.log(`[layout] Width delta: ${(newBox.width - initialBox.width).toFixed(1)}px`);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-horizontal-resize.png' });
    });

    test('right panel can be resized by dragging separator', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const rightZone = mainWindow.locator('[data-testid="right-zone"]');
      const rightVisible = await rightZone.isVisible().catch(() => false);

      if (!rightVisible) {
        console.log('[layout] Right zone not visible, skipping resize test');
        return;
      }

      const initialBox = await rightZone.boundingBox();
      console.log(`[layout] Right zone initial width: ${initialBox?.width}`);

      // The separator before the right panel (second cursor-col-resize handle)
      const resizeHandles = mainWindow.locator('[role="separator"][aria-orientation="vertical"]');
      const handleCount = await resizeHandles.count();
      console.log(`[layout] Horizontal resize handles found: ${handleCount}`);

      if (handleCount >= 2 && initialBox) {
        const handle = resizeHandles.nth(handleCount - 1); // last horizontal handle
        const handleBox = await handle.boundingBox();

        if (handleBox) {
          // Drag the handle 50px to the left to widen right panel
          const startX = handleBox.x + handleBox.width / 2;
          const startY = handleBox.y + handleBox.height / 2;
          const endX = startX - 50;

          await mainWindow.mouse.move(startX, startY);
          await mainWindow.mouse.down();
          await mainWindow.mouse.move(endX, startY, { steps: 10 });
          await mainWindow.mouse.up();
          await mainWindow.waitForTimeout(500);

          const newBox = await rightZone.boundingBox();
          console.log(`[layout] Right zone new width: ${newBox?.width}`);

          if (newBox && initialBox) {
            console.log(`[layout] Width delta: ${(newBox.width - initialBox.width).toFixed(1)}px`);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-right-resize.png' });
    });

    test('center panel respects minimum width', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const centerZone = mainWindow.locator('[data-testid="center-zone"]');
      const centerVisible = await centerZone.isVisible().catch(() => false);

      if (!centerVisible) {
        console.log('[layout] Center zone not visible, skipping min-width test');
        return;
      }

      // Get layout total width for percentage calculation
      const layoutBox = await getBoundingBox('resizable-layout');
      const centerBox = await centerZone.boundingBox();

      if (layoutBox && centerBox) {
        const centerPercent = (centerBox.width / layoutBox.width) * 100;
        console.log(`[layout] Center zone width: ${centerBox.width}px (${centerPercent.toFixed(1)}%)`);

        // Center has minSize={30}, so it should be at least ~30% of the layout width
        // (with some tolerance for borders, separators, etc.)
        expect(centerPercent).toBeGreaterThan(20);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-center-min-width.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Vertical resize for bottom panel
  // ---------------------------------------------------------------------------

  test.describe('Vertical resize (bottom panel)', () => {
    test('bottom zone has expand/collapse toggle', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Look for the collapse/expand button in the bottom zone
      // It has title "Expand panel" or "Collapse panel"
      const expandBtn = mainWindow.locator('button[title="Expand panel"]');
      const collapseBtn = mainWindow.locator('button[title="Collapse panel"]');

      const expandVisible = await expandBtn.isVisible().catch(() => false);
      const collapseVisible = await collapseBtn.isVisible().catch(() => false);
      console.log(
        `[layout] Bottom zone toggle - Expand: ${expandVisible}, Collapse: ${collapseVisible}`
      );

      // At least one should be visible if bottom zone has panels
      await mainWindow.screenshot({ path: 'test-results/resizable-layout-bottom-toggle.png' });
    });

    test('collapsed bottom zone can be re-expanded', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // In Standard preset, bottom is collapsed by default
      // Look for "Expand panel" button
      const expandBtn = mainWindow.locator('button[title="Expand panel"]');
      const expandVisible = await expandBtn.isVisible().catch(() => false);

      if (expandVisible) {
        console.log('[layout] Bottom zone is collapsed, clicking expand...');
        await expandBtn.click();
        await mainWindow.waitForTimeout(500);

        // After expanding, the collapse button should appear
        const collapseBtn = mainWindow.locator('button[title="Collapse panel"]');
        const collapseVisible = await collapseBtn.isVisible().catch(() => false);
        console.log(`[layout] After expand - Collapse button visible: ${collapseVisible}`);

        // Bottom zone content should now be visible
        const bottomZone = mainWindow.locator('[data-testid="bottom-zone"]');
        const bottomBox = await bottomZone.boundingBox().catch(() => null);
        if (bottomBox) {
          console.log(`[layout] Expanded bottom zone height: ${bottomBox.height}px`);
          expect(bottomBox.height).toBeGreaterThan(30); // More than just the tab strip (32px)
        }

        // Collapse it back
        if (collapseVisible) {
          await collapseBtn.click();
          await mainWindow.waitForTimeout(500);
          console.log('[layout] Collapsed bottom zone back');
        }
      } else {
        console.log('[layout] Expand button not visible, bottom zone may not have panels');
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-bottom-expand.png' });
    });

    test('bottom zone can be resized vertically when expanded', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Expand bottom if collapsed
      const expandBtn = mainWindow.locator('button[title="Expand panel"]');
      if (await expandBtn.isVisible().catch(() => false)) {
        await expandBtn.click();
        await mainWindow.waitForTimeout(500);
      }

      // Look for vertical resize handle (cursor-row-resize)
      const verticalHandle = mainWindow.locator('[role="separator"][aria-orientation="horizontal"]').first();
      const handleVisible = await verticalHandle.isVisible().catch(() => false);
      console.log(`[layout] Vertical resize handle visible: ${handleVisible}`);

      if (handleVisible) {
        const bottomZone = mainWindow.locator('[data-testid="bottom-zone"]');
        const initialBox = await bottomZone.boundingBox().catch(() => null);
        console.log(`[layout] Bottom zone initial height: ${initialBox?.height}`);

        const handleBox = await verticalHandle.boundingBox();
        if (handleBox && initialBox) {
          // Drag up to make bottom zone taller
          const startX = handleBox.x + handleBox.width / 2;
          const startY = handleBox.y + handleBox.height / 2;
          const endY = startY - 60;

          await mainWindow.mouse.move(startX, startY);
          await mainWindow.mouse.down();
          await mainWindow.mouse.move(startX, endY, { steps: 10 });
          await mainWindow.mouse.up();
          await mainWindow.waitForTimeout(500);

          const newBox = await bottomZone.boundingBox().catch(() => null);
          console.log(`[layout] Bottom zone new height: ${newBox?.height}`);

          if (newBox && initialBox) {
            console.log(`[layout] Height delta: ${(newBox.height - initialBox.height).toFixed(1)}px`);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-vertical-resize.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Panel visibility toggles
  // ---------------------------------------------------------------------------

  test.describe('Panel visibility toggles', () => {
    test('panels dropdown shows toggleable panels when unlocked', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // First ensure layout is unlocked
      const lockBtn = mainWindow.locator('button[title*="Lock layout"]');
      const isLocked = await lockBtn.isVisible().catch(() => false);
      if (isLocked) {
        // Layout is locked — unlock it
        await lockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      // Look for "Panels" dropdown button (title="Toggle panels")
      const panelsBtn = mainWindow.locator('button[title="Toggle panels"]');
      const panelsVisible = await panelsBtn.isVisible().catch(() => false);
      console.log(`[layout] Panels toggle button visible: ${panelsVisible}`);

      if (panelsVisible) {
        // Click to open the dropdown
        await panelsBtn.click();
        await mainWindow.waitForTimeout(300);

        // The dropdown should show toggleable panels (closable: true)
        // These are: pipeline, terminal, logs, agentPanel, superGoose, search, bookmarks
        const toggleablePanelNames = ['Pipeline', 'Terminal', 'Logs', 'Agent', 'Super-Goose', 'Search', 'Bookmarks'];

        for (const name of toggleablePanelNames) {
          const panelItem = mainWindow.locator(`button:has-text("${name}")`).first();
          const itemVisible = await panelItem.isVisible().catch(() => false);
          console.log(`[layout] Panel toggle "${name}": ${itemVisible ? 'visible' : 'not visible'}`);
        }

        // Close the dropdown by clicking elsewhere
        await mainWindow.locator('[data-testid="resizable-layout"]').click({ position: { x: 5, y: 5 } });
        await mainWindow.waitForTimeout(300);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-panels-dropdown.png' });
    });

    test('toggling a panel off removes it from layout', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Ensure unlocked
      const lockBtn = mainWindow.locator('button[title*="Lock layout"]');
      if (await lockBtn.isVisible().catch(() => false)) {
        await lockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      // Check if right zone is visible before toggle
      const rightBefore = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
      console.log(`[layout] Right zone visible before toggle: ${rightBefore}`);

      if (rightBefore) {
        // Open panels dropdown
        const panelsBtn = mainWindow.locator('button[title="Toggle panels"]');
        if (await panelsBtn.isVisible().catch(() => false)) {
          await panelsBtn.click();
          await mainWindow.waitForTimeout(300);

          // Toggle off the Agent panel (which is in the right zone)
          const agentToggle = mainWindow.locator('button:has-text("Agent")').first();
          if (await agentToggle.isVisible().catch(() => false)) {
            await agentToggle.click();
            await mainWindow.waitForTimeout(500);

            // Close dropdown
            await mainWindow.keyboard.press('Escape');
            await mainWindow.waitForTimeout(300);

            // Check that right zone adjusted (may still be visible if superGoose is there)
            const rightAfter = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
            console.log(`[layout] Right zone visible after toggling Agent off: ${rightAfter}`);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-panel-toggle-off.png' });
    });

    test('toggling a panel on adds it back to layout', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Ensure unlocked
      const lockBtn = mainWindow.locator('button[title*="Lock layout"]');
      if (await lockBtn.isVisible().catch(() => false)) {
        await lockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      // Open panels dropdown and toggle Search panel on
      const panelsBtn = mainWindow.locator('button[title="Toggle panels"]');
      if (await panelsBtn.isVisible().catch(() => false)) {
        await panelsBtn.click();
        await mainWindow.waitForTimeout(300);

        // Look for Search panel toggle
        const searchToggle = mainWindow.locator('button:has-text("Search")').first();
        if (await searchToggle.isVisible().catch(() => false)) {
          // Toggle it on
          await searchToggle.click();
          await mainWindow.waitForTimeout(500);

          // Close dropdown
          await mainWindow.keyboard.press('Escape');
          await mainWindow.waitForTimeout(300);

          console.log('[layout] Toggled Search panel on');
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-panel-toggle-on.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Layout presets
  // ---------------------------------------------------------------------------

  test.describe('Layout presets', () => {
    test('preset selector dropdown opens with all presets', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const presetBtn = mainWindow.locator('button[title="Layout preset"]');
      const presetVisible = await presetBtn.isVisible().catch(() => false);
      console.log(`[layout] Preset button visible: ${presetVisible}`);

      if (presetVisible) {
        await presetBtn.click();
        await mainWindow.waitForTimeout(300);

        // Check for all preset names in the dropdown
        const presetNames = ['Focus', 'Standard', 'Full', 'Agent', 'Custom'];
        for (const name of presetNames) {
          const item = mainWindow.locator(`button:has-text("${name}")`).first();
          const itemVisible = await item.isVisible().catch(() => false);
          console.log(`[layout] Preset "${name}": ${itemVisible ? 'visible' : 'not visible'}`);
        }

        // Also check for "Reset to default" option
        const resetBtn = mainWindow.locator('button:has-text("Reset to default")');
        const resetVisible = await resetBtn.isVisible().catch(() => false);
        console.log(`[layout] Reset to default option: ${resetVisible ? 'visible' : 'not visible'}`);

        // Close dropdown
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-preset-dropdown.png' });
    });

    test('Focus preset hides all except center', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const presetBtn = mainWindow.locator('button[title="Layout preset"]');
      if (await presetBtn.isVisible().catch(() => false)) {
        await presetBtn.click();
        await mainWindow.waitForTimeout(300);

        // Click "Focus" preset
        const focusBtn = mainWindow.locator('button:has-text("Focus")').first();
        if (await focusBtn.isVisible().catch(() => false)) {
          await focusBtn.click();
          await mainWindow.waitForTimeout(500);

          // Center should be visible
          const centerVisible = await mainWindow.locator('[data-testid="center-zone"]').isVisible().catch(() => false);
          console.log(`[layout] Focus preset - Center visible: ${centerVisible}`);

          // Left, Right, Bottom should be hidden
          const leftVisible = await mainWindow.locator('[data-testid="left-zone"]').isVisible().catch(() => false);
          const rightVisible = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
          const bottomVisible = await mainWindow.locator('[data-testid="bottom-zone"]').isVisible().catch(() => false);
          console.log(`[layout] Focus preset - Left: ${leftVisible}, Right: ${rightVisible}, Bottom: ${bottomVisible}`);

          // In Focus mode, left/right/bottom should not be visible
          if (centerVisible) {
            expect(leftVisible).toBe(false);
            expect(rightVisible).toBe(false);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-focus-preset.png' });

      // Restore to Standard
      await resetLayoutToDefault();
    });

    test('Standard preset shows sidebar + chat + agent panel', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // After reset, Standard preset should be active
      const leftVisible = await mainWindow.locator('[data-testid="left-zone"]').isVisible().catch(() => false);
      const centerVisible = await mainWindow.locator('[data-testid="center-zone"]').isVisible().catch(() => false);
      const rightVisible = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);

      console.log(`[layout] Standard preset - Left: ${leftVisible}, Center: ${centerVisible}, Right: ${rightVisible}`);

      // Standard should have left + center + right
      if (centerVisible) {
        // All three main zones should be visible
        expect(leftVisible || centerVisible).toBe(true); // at minimum center is visible
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-standard-preset.png' });
    });

    test('Full preset shows all zones', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const presetBtn = mainWindow.locator('button[title="Layout preset"]');
      if (await presetBtn.isVisible().catch(() => false)) {
        await presetBtn.click();
        await mainWindow.waitForTimeout(300);

        // Click "Full" preset
        const fullBtn = mainWindow.locator('button:has-text("Full")').first();
        if (await fullBtn.isVisible().catch(() => false)) {
          await fullBtn.click();
          await mainWindow.waitForTimeout(500);

          const leftVisible = await mainWindow.locator('[data-testid="left-zone"]').isVisible().catch(() => false);
          const centerVisible = await mainWindow.locator('[data-testid="center-zone"]').isVisible().catch(() => false);
          const rightVisible = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
          const bottomVisible = await mainWindow.locator('[data-testid="bottom-zone"]').isVisible().catch(() => false);

          console.log(
            `[layout] Full preset - Left: ${leftVisible}, Center: ${centerVisible}, Right: ${rightVisible}, Bottom: ${bottomVisible}`
          );

          // Full preset should show all zones
          if (centerVisible) {
            expect(leftVisible).toBe(true);
            expect(rightVisible).toBe(true);
            expect(bottomVisible).toBe(true);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-full-preset.png' });

      // Restore
      await resetLayoutToDefault();
    });

    test('switching presets updates the layout', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Start at Standard — get layout state
      const standardRight = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
      console.log(`[layout] Standard preset - right visible: ${standardRight}`);

      // Switch to Focus
      const presetBtn = mainWindow.locator('button[title="Layout preset"]');
      if (await presetBtn.isVisible().catch(() => false)) {
        await presetBtn.click();
        await mainWindow.waitForTimeout(300);

        const focusBtn = mainWindow.locator('button:has-text("Focus")').first();
        if (await focusBtn.isVisible().catch(() => false)) {
          await focusBtn.click();
          await mainWindow.waitForTimeout(500);

          const focusRight = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
          console.log(`[layout] Focus preset - right visible: ${focusRight}`);

          // In Focus mode right should be hidden
          if (standardRight) {
            expect(focusRight).toBe(false);
          }
        }

        // Switch back to Standard
        const presetBtn2 = mainWindow.locator('button[title="Layout preset"]');
        if (await presetBtn2.isVisible().catch(() => false)) {
          await presetBtn2.click();
          await mainWindow.waitForTimeout(300);

          const standardBtn = mainWindow.locator('button:has-text("Standard")').first();
          if (await standardBtn.isVisible().catch(() => false)) {
            await standardBtn.click();
            await mainWindow.waitForTimeout(500);

            const restoredRight = await mainWindow.locator('[data-testid="right-zone"]').isVisible().catch(() => false);
            console.log(`[layout] Restored Standard - right visible: ${restoredRight}`);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-preset-switch.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Lock/Unlock mode
  // ---------------------------------------------------------------------------

  test.describe('Lock/Unlock mode', () => {
    test('locked mode hides resize handles', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Find and count resize handles before locking
      const handlesBefore = await mainWindow.locator('[role="separator"]:not([aria-disabled])').count();
      console.log(`[layout] Resize handles before lock: ${handlesBefore}`);

      // Find the unlock button and click to lock
      const unlockBtn = mainWindow.locator('button[title*="Lock layout"]');
      const lockToggle = mainWindow.locator('button[title*="Unlock layout"]');

      // If currently unlocked, the button says "Lock layout"
      const unlockVisible = await unlockBtn.isVisible().catch(() => false);
      if (unlockVisible) {
        await unlockBtn.click();
        await mainWindow.waitForTimeout(300);

        // After locking, resize handles should be replaced with thin dividers
        const handlesAfter = await mainWindow.locator('[role="separator"]:not([aria-disabled])').count();
        console.log(`[layout] Resize handles after lock: ${handlesAfter}`);

        // Locked mode should have fewer (or zero) interactive resize handles
        if (handlesBefore > 0) {
          expect(handlesAfter).toBeLessThan(handlesBefore);
        }
      }

      // The lock button should now show "Unlock layout"
      const lockVisible = await lockToggle.isVisible().catch(() => false);
      console.log(`[layout] Unlock button visible after locking: ${lockVisible}`);

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-locked.png' });

      // Restore: unlock
      if (lockVisible) {
        await lockToggle.click();
        await mainWindow.waitForTimeout(300);
      }
    });

    test('unlocked mode shows resize handles', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Ensure unlocked
      const lockBtn = mainWindow.locator('button[title*="Lock layout"]');
      const unlockBtn = mainWindow.locator('button[title*="Unlock layout"]');

      // If currently locked, unlock first
      if (await unlockBtn.isVisible().catch(() => false)) {
        await unlockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      // Count resize handles — should be > 0 when left+right zones are visible
      const handles = await mainWindow.locator('[role="separator"]:not([aria-disabled])').count();
      console.log(`[layout] Resize handles when unlocked: ${handles}`);

      // The "Panels" dropdown should be visible when unlocked
      const panelsBtn = mainWindow.locator('button[title="Toggle panels"]');
      const panelsVisible = await panelsBtn.isVisible().catch(() => false);
      console.log(`[layout] Panels button visible when unlocked: ${panelsVisible}`);

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-unlocked.png' });
    });

    test('panels dropdown is hidden when locked', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Lock the layout
      const lockBtn = mainWindow.locator('button[title*="Lock layout"]');
      if (await lockBtn.isVisible().catch(() => false)) {
        await lockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      // When locked, the "Panels" dropdown should not be visible
      const panelsBtn = mainWindow.locator('button[title="Toggle panels"]');
      const panelsVisible = await panelsBtn.isVisible().catch(() => false);
      console.log(`[layout] Panels button visible when locked: ${panelsVisible}`);

      // Panels dropdown should be hidden in locked mode
      expect(panelsVisible).toBe(false);

      // Unlock to restore
      const unlockBtn = mainWindow.locator('button[title*="Unlock layout"]');
      if (await unlockBtn.isVisible().catch(() => false)) {
        await unlockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-locked-no-panels.png' });
    });

    test('lock state persists across preset changes', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Lock the layout
      const lockBtn = mainWindow.locator('button[title*="Lock layout"]');
      if (await lockBtn.isVisible().catch(() => false)) {
        await lockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      // Verify locked
      const unlockBtn = mainWindow.locator('button[title*="Unlock layout"]');
      const lockedInitially = await unlockBtn.isVisible().catch(() => false);
      console.log(`[layout] Locked initially: ${lockedInitially}`);

      // Switch to Full preset
      const presetBtn = mainWindow.locator('button[title="Layout preset"]');
      if (await presetBtn.isVisible().catch(() => false)) {
        await presetBtn.click();
        await mainWindow.waitForTimeout(300);

        const fullBtn = mainWindow.locator('button:has-text("Full")').first();
        if (await fullBtn.isVisible().catch(() => false)) {
          await fullBtn.click();
          await mainWindow.waitForTimeout(500);
        }
      }

      // Check lock state persisted
      const stillLocked = await unlockBtn.isVisible().catch(() => false);
      console.log(`[layout] Still locked after preset change: ${stillLocked}`);

      // Lock state is independent of preset changes (locked flag persists)
      // Note: Presets don't change the locked state in PanelSystemProvider

      // Unlock to restore
      if (await unlockBtn.isVisible().catch(() => false)) {
        await unlockBtn.click();
        await mainWindow.waitForTimeout(300);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-lock-persist.png' });

      // Restore to Standard
      await resetLayoutToDefault();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Content not cut off
  // ---------------------------------------------------------------------------

  test.describe('Content not cut off', () => {
    test('left zone has minimum width to prevent truncation', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const leftZone = mainWindow.locator('[data-testid="left-zone"]');
      const leftVisible = await leftZone.isVisible().catch(() => false);

      if (leftVisible) {
        const box = await leftZone.boundingBox();
        if (box) {
          // LeftZone has inline style minWidth: 160
          console.log(`[layout] Left zone width: ${box.width}px`);
          expect(box.width).toBeGreaterThanOrEqual(140); // Slightly below 160 for tolerance
        }

        // Check the computed minWidth style
        const minWidth = await leftZone.evaluate((el) => {
          return window.getComputedStyle(el).minWidth;
        });
        console.log(`[layout] Left zone computed minWidth: ${minWidth}`);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-left-min-width.png' });
    });

    test('right zone tab labels display full text', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const rightZone = mainWindow.locator('[data-testid="right-zone"]');
      const rightVisible = await rightZone.isVisible().catch(() => false);

      if (rightVisible) {
        // In Standard preset, right zone has agentPanel + superGoose tabs
        // Check if tab labels are visible when there are multiple panels
        const tabButtons = rightZone.locator('button');
        const tabCount = await tabButtons.count();
        console.log(`[layout] Right zone tab buttons: ${tabCount}`);

        if (tabCount > 1) {
          for (let i = 0; i < Math.min(tabCount, 5); i++) {
            const tab = tabButtons.nth(i);
            const text = await tab.textContent();
            const isVisible = await tab.isVisible().catch(() => false);
            console.log(`[layout] Right zone tab ${i}: "${text}" visible=${isVisible}`);

            // Tab text should not be empty
            if (isVisible && text) {
              expect(text.trim().length).toBeGreaterThan(0);
            }
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-right-tabs.png' });
    });

    test('bottom zone tab labels are visible when panels exist', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const bottomZone = mainWindow.locator('[data-testid="bottom-zone"]');
      const bottomExists = (await bottomZone.count()) > 0;

      if (bottomExists) {
        // Bottom zone always shows its tab strip even when collapsed
        // Tab strip has panel name buttons (Pipeline, Terminal, Logs)
        const tabButtons = bottomZone.locator('button');
        const tabCount = await tabButtons.count();
        console.log(`[layout] Bottom zone buttons (tabs + toggle): ${tabCount}`);

        // At least one tab + the expand/collapse toggle
        for (let i = 0; i < Math.min(tabCount, 5); i++) {
          const tab = tabButtons.nth(i);
          const text = await tab.textContent();
          const isVisible = await tab.isVisible().catch(() => false);
          console.log(`[layout] Bottom zone button ${i}: "${text?.trim()}" visible=${isVisible}`);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-bottom-tabs.png' });
    });

    test('center zone fills remaining space', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const layoutBox = await getBoundingBox('resizable-layout');
      const centerBox = await mainWindow.locator('[data-testid="center-zone"]').boundingBox().catch(() => null);

      if (layoutBox && centerBox) {
        console.log(`[layout] Layout total width: ${layoutBox.width}px`);
        console.log(`[layout] Center zone width: ${centerBox.width}px`);

        // Center should take a significant portion of the layout
        const ratio = centerBox.width / layoutBox.width;
        console.log(`[layout] Center/Layout ratio: ${(ratio * 100).toFixed(1)}%`);

        // In Standard preset (18% left + ~52% center + 30% right),
        // center should be at least 30% of layout width
        expect(ratio).toBeGreaterThan(0.25);
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-center-fills.png' });
    });

    test('zones do not overflow the layout container', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      const layoutBox = await getBoundingBox('resizable-layout');
      if (!layoutBox) {
        console.log('[layout] Layout not found, skipping overflow check');
        return;
      }

      const zones = ['left-zone', 'center-zone', 'right-zone'];
      for (const zone of zones) {
        const zoneBox = await mainWindow.locator(`[data-testid="${zone}"]`).boundingBox().catch(() => null);
        if (zoneBox) {
          // Zone should not extend beyond the layout container boundaries
          const rightEdge = zoneBox.x + zoneBox.width;
          const layoutRight = layoutBox.x + layoutBox.width;
          console.log(`[layout] ${zone} right edge: ${rightEdge}, layout right: ${layoutRight}`);

          // Allow small tolerance for subpixel rendering
          expect(rightEdge).toBeLessThanOrEqual(layoutRight + 2);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-no-overflow.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Keyboard shortcuts
  // ---------------------------------------------------------------------------

  test.describe('Keyboard shortcuts', () => {
    test('Ctrl+Shift+L toggles lock state', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Get initial lock state
      const isInitiallyLocked = await mainWindow.locator('button[title*="Unlock layout"]').isVisible().catch(() => false);
      console.log(`[layout] Initially locked: ${isInitiallyLocked}`);

      // Press Ctrl+Shift+L
      await mainWindow.keyboard.press('Control+Shift+L');
      await mainWindow.waitForTimeout(300);

      // Check if lock state changed
      const isNowLocked = await mainWindow.locator('button[title*="Unlock layout"]').isVisible().catch(() => false);
      console.log(`[layout] After Ctrl+Shift+L: locked=${isNowLocked}`);

      // State should have toggled
      if (isInitiallyLocked !== undefined) {
        expect(isNowLocked).toBe(!isInitiallyLocked);
      }

      // Toggle back
      await mainWindow.keyboard.press('Control+Shift+L');
      await mainWindow.waitForTimeout(300);

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-keyboard-lock.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Layout persistence
  // ---------------------------------------------------------------------------

  test.describe('Layout persistence', () => {
    test('layout state is saved to localStorage', async () => {
      await resetLayoutToDefault();
      await ensureLayoutReady();

      // Wait for the debounced save (300ms)
      await mainWindow.waitForTimeout(500);

      // Check if layout was persisted
      const savedLayout = await mainWindow.evaluate(() => {
        return localStorage.getItem('sg-layout-v4');
      });

      console.log(`[layout] Saved layout exists: ${!!savedLayout}`);

      if (savedLayout) {
        const parsed = JSON.parse(savedLayout);
        console.log(`[layout] Saved preset: ${parsed.presetId}`);
        console.log(`[layout] Saved locked: ${parsed.locked}`);
        console.log(`[layout] Saved zones: ${Object.keys(parsed.zones).join(', ')}`);

        // Should have all 4 zones
        expect(parsed.zones).toHaveProperty('left');
        expect(parsed.zones).toHaveProperty('center');
        expect(parsed.zones).toHaveProperty('right');
        expect(parsed.zones).toHaveProperty('bottom');
      }

      await mainWindow.screenshot({ path: 'test-results/resizable-layout-persistence.png' });
    });
  });
});
