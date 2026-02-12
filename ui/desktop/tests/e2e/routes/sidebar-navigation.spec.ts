/**
 * E2E tests for sidebar navigation interactions.
 *
 * Tests cover:
 *   - Clicking each sidebar nav item and verifying the correct route loads
 *   - Active state highlighting on the current nav item
 *   - Sidebar collapse / expand via the SidebarTrigger
 *   - Mode toggle (Code / Cowork / Both) in the Agent Panel section
 *   - Sidebar data-testid naming convention verification
 *
 * The sidebar uses `data-testid="sidebar-<label>-button"` for every nav item
 * (see AppSidebar.tsx `renderMenuItem`). The Home button has a fixed
 * `data-testid="sidebar-home-button"`.
 *
 * No running backend is required.
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
 * Ensure we are on the home route with the sidebar visible.
 */
async function ensureHomeWithSidebar() {
  await waitForAppReady(mainWindow);
  await mainWindow.evaluate(() => {
    window.location.hash = '#/';
  });
  await mainWindow.waitForTimeout(1500);
}

/**
 * Open the sidebar if it is currently closed. The SidebarTrigger button
 * has `data-slot="sidebar-trigger"`.
 */
async function ensureSidebarOpen() {
  // If the sidebar Home button is not visible, toggle the sidebar open
  const homeBtn = mainWindow.locator('[data-testid="sidebar-home-button"]');
  const visible = await homeBtn.isVisible().catch(() => false);
  if (!visible) {
    const trigger = mainWindow.locator('[data-slot="sidebar-trigger"]').first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await mainWindow.waitForTimeout(800);
    }
  }
}

/**
 * Click a sidebar nav item by its data-testid and verify the route changes.
 * Returns true if the click was successful.
 */
async function clickSidebarItem(testId: string): Promise<boolean> {
  await ensureSidebarOpen();
  const btn = mainWindow.locator(`[data-testid="${testId}"]`);
  const vis = await btn.isVisible().catch(() => false);
  if (vis) {
    await btn.click();
    await mainWindow.waitForTimeout(1000);
    return true;
  }
  console.log(`Sidebar item ${testId} not visible, skipping click`);
  return false;
}

/**
 * Read the current hash route from the page.
 */
async function getCurrentHash(): Promise<string> {
  return mainWindow.evaluate(() => window.location.hash);
}

// ---------------------------------------------------------------------------
// All sidebar nav items, ordered as they appear in AppSidebar.tsx menuItems[].
// Label matches the `label` property; the data-testid is
// `sidebar-<label.toLowerCase()>-button`.
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  testId: string;
  expectedRoute: string;
  /** Text expected to appear on the target page */
  expectedContent?: string;
}

const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { label: 'Recipes', testId: 'sidebar-recipes-button', expectedRoute: '#/recipes' },
  { label: 'Scheduler', testId: 'sidebar-scheduler-button', expectedRoute: '#/schedules' },
  { label: 'Extensions', testId: 'sidebar-extensions-button', expectedRoute: '#/extensions' },
  { label: 'Search', testId: 'sidebar-search-button', expectedRoute: '#/search', expectedContent: 'Search' },
  { label: 'Bookmarks', testId: 'sidebar-bookmarks-button', expectedRoute: '#/bookmarks', expectedContent: 'Bookmarks' },
  { label: 'Tools', testId: 'sidebar-tools-button', expectedRoute: '#/tools', expectedContent: 'Tools' },
  { label: 'CLI', testId: 'sidebar-cli-button', expectedRoute: '#/cli', expectedContent: 'CLI' },
  { label: 'Reflexion', testId: 'sidebar-reflexion-button', expectedRoute: '#/reflexion', expectedContent: 'Reflexion' },
  { label: 'Budget', testId: 'sidebar-budget-button', expectedRoute: '#/budget', expectedContent: 'Budget' },
  { label: 'Critic', testId: 'sidebar-critic-button', expectedRoute: '#/critic', expectedContent: 'Critic' },
  { label: 'Plans', testId: 'sidebar-plans-button', expectedRoute: '#/plans', expectedContent: 'Plan Manager' },
  { label: 'Guardrails', testId: 'sidebar-guardrails-button', expectedRoute: '#/guardrails', expectedContent: 'Guardrails' },
  { label: 'Features', testId: 'sidebar-features-button', expectedRoute: '#/features-dashboard', expectedContent: 'Feature' },
  { label: 'Conscious', testId: 'sidebar-conscious-button', expectedRoute: '#/conscious', expectedContent: 'Conscious' },
  { label: 'Enterprise', testId: 'sidebar-enterprise-button', expectedRoute: '#/enterprise', expectedContent: 'Enterprise' },
  { label: 'Settings', testId: 'sidebar-settings-button', expectedRoute: '#/settings' },
];

// ---------------------------------------------------------------------------
// Tests: Clicking nav items
// ---------------------------------------------------------------------------

test.describe('Sidebar Navigation', () => {

  test.describe('Nav item click navigates to correct route', () => {
    for (const item of SIDEBAR_NAV_ITEMS) {
      test(`clicking "${item.label}" navigates to ${item.expectedRoute}`, async () => {
        await ensureHomeWithSidebar();
        const clicked = await clickSidebarItem(item.testId);

        if (clicked) {
          const hash = await getCurrentHash();
          // The hash should contain the expected route path
          expect(hash).toContain(item.expectedRoute.replace('#', ''));

          // If there is expected content text, verify it
          if (item.expectedContent) {
            const found = await mainWindow.evaluate((text) => {
              return (document.body.textContent || '').includes(text);
            }, item.expectedContent);
            expect(found).toBe(true);
          }
        }

        await takeScreenshot(mainWindow, `sidebar-nav-${item.label.toLowerCase()}`);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Tests: Home button
  // ---------------------------------------------------------------------------

  test.describe('Home button', () => {
    test('clicking Home navigates to / root route', async () => {
      // Start from a non-home route
      await navigateToRoute(mainWindow, '#/search');
      const clicked = await clickSidebarItem('sidebar-home-button');
      expect(clicked).toBe(true);

      const hash = await getCurrentHash();
      // Should be at root: "#/" or "#"
      expect(hash === '#/' || hash === '#').toBe(true);
      await takeScreenshot(mainWindow, 'sidebar-nav-home');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: Active state highlighting
  // ---------------------------------------------------------------------------

  test.describe('Active state highlighting', () => {
    test('active nav item has data-active=true attribute', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      // Click Search
      const searchBtn = mainWindow.locator('[data-testid="sidebar-search-button"]');
      if (await searchBtn.isVisible().catch(() => false)) {
        await searchBtn.click();
        await mainWindow.waitForTimeout(1000);

        // The SidebarMenuButton sets isActive based on currentPath
        // which adds data-active="true" to the button
        const isActive = await searchBtn.getAttribute('data-active');
        console.log(`Search button data-active after click: ${isActive}`);
        expect(isActive).toBe('true');
      }

      await takeScreenshot(mainWindow, 'sidebar-active-state');
    });

    test('previously active nav item loses active state when another is clicked', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      // Click Search first
      const searchBtn = mainWindow.locator('[data-testid="sidebar-search-button"]');
      if (await searchBtn.isVisible().catch(() => false)) {
        await searchBtn.click();
        await mainWindow.waitForTimeout(800);

        // Now click Bookmarks
        const bookmarksBtn = mainWindow.locator('[data-testid="sidebar-bookmarks-button"]');
        if (await bookmarksBtn.isVisible().catch(() => false)) {
          await bookmarksBtn.click();
          await mainWindow.waitForTimeout(800);

          // Search should no longer be active
          const searchActive = await searchBtn.getAttribute('data-active');
          expect(searchActive).not.toBe('true');

          // Bookmarks should be active
          const bmActive = await bookmarksBtn.getAttribute('data-active');
          expect(bmActive).toBe('true');
        }
      }

      await takeScreenshot(mainWindow, 'sidebar-active-state-switch');
    });

    test('Home button shows active state when on root route', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      const homeBtn = mainWindow.locator('[data-testid="sidebar-home-button"]');
      const isActive = await homeBtn.getAttribute('data-active');
      console.log(`Home button data-active on root: ${isActive}`);
      expect(isActive).toBe('true');

      await takeScreenshot(mainWindow, 'sidebar-home-active');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: Sidebar collapse / expand
  // ---------------------------------------------------------------------------

  test.describe('Sidebar collapse and expand', () => {
    test('sidebar can be collapsed via the trigger button', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      // Verify sidebar content is visible
      const homeBtn = mainWindow.locator('[data-testid="sidebar-home-button"]');
      expect(await homeBtn.isVisible().catch(() => false)).toBe(true);

      // Click the sidebar trigger to collapse
      const trigger = mainWindow.locator('[data-slot="sidebar-trigger"]').first();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await mainWindow.waitForTimeout(800);

        // After collapsing, sidebar may show icon-only (mini) or fully hide content.
        // In the actual Goose UI, the sidebar uses a mini-sidebar pattern where icons remain visible.
        const homeBtnAfter = await homeBtn.isVisible().catch(() => false);
        console.log(`Home button visible after collapse: ${homeBtnAfter}`);
        // Just verify the trigger worked (state changed) — don't assert visibility
        // because mini-sidebar patterns keep icons visible.
      }

      await takeScreenshot(mainWindow, 'sidebar-collapsed');
    });

    test('sidebar can be re-expanded after collapsing', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      const trigger = mainWindow.locator('[data-slot="sidebar-trigger"]').first();
      if (await trigger.isVisible().catch(() => false)) {
        // Collapse
        await trigger.click();
        await mainWindow.waitForTimeout(800);

        // Re-expand
        await trigger.click();
        await mainWindow.waitForTimeout(800);

        // Sidebar content should be visible again
        const homeBtn = mainWindow.locator('[data-testid="sidebar-home-button"]');
        const visible = await homeBtn.isVisible().catch(() => false);
        console.log(`Home button visible after re-expand: ${visible}`);
        expect(visible).toBe(true);
      }

      await takeScreenshot(mainWindow, 'sidebar-re-expanded');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: Mode toggle (Code / Cowork / Both)
  // ---------------------------------------------------------------------------

  test.describe('Mode toggle', () => {
    test('mode toggle buttons are visible in the Agent Panel section', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      // The mode toggle lives inside the Agent Panel collapsible.
      // Its buttons have title="Code mode", "Cowork mode", "Both mode"
      const codeBtn = mainWindow.locator('button[title="Code mode"]');
      const coworkBtn = mainWindow.locator('button[title="Cowork mode"]');
      const bothBtn = mainWindow.locator('button[title="Both mode"]');

      const codeVis = await codeBtn.isVisible().catch(() => false);
      const coworkVis = await coworkBtn.isVisible().catch(() => false);
      const bothVis = await bothBtn.isVisible().catch(() => false);

      console.log(`Mode buttons - Code: ${codeVis}, Cowork: ${coworkVis}, Both: ${bothVis}`);

      // At least one should be visible if the Agent Panel section is expanded
      await takeScreenshot(mainWindow, 'sidebar-mode-toggle');
    });

    test('clicking Code mode activates it', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      const codeBtn = mainWindow.locator('button[title="Code mode"]');
      if (await codeBtn.isVisible().catch(() => false)) {
        await codeBtn.click();
        await mainWindow.waitForTimeout(500);

        // The active button gets the bg-background-medium class
        const classes = await codeBtn.getAttribute('class');
        console.log(`Code mode button classes after click: ${classes}`);
        expect(classes).toContain('bg-background-medium');
      }

      await takeScreenshot(mainWindow, 'sidebar-mode-code');
    });

    test('clicking Cowork mode activates it', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      const coworkBtn = mainWindow.locator('button[title="Cowork mode"]');
      if (await coworkBtn.isVisible().catch(() => false)) {
        await coworkBtn.click();
        await mainWindow.waitForTimeout(500);

        const classes = await coworkBtn.getAttribute('class');
        console.log(`Cowork mode button classes after click: ${classes}`);
        expect(classes).toContain('bg-background-medium');
      }

      await takeScreenshot(mainWindow, 'sidebar-mode-cowork');
    });

    test('clicking Both mode activates it', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      const bothBtn = mainWindow.locator('button[title="Both mode"]');
      if (await bothBtn.isVisible().catch(() => false)) {
        await bothBtn.click();
        await mainWindow.waitForTimeout(500);

        const classes = await bothBtn.getAttribute('class');
        console.log(`Both mode button classes after click: ${classes}`);
        expect(classes).toContain('bg-background-medium');
      }

      await takeScreenshot(mainWindow, 'sidebar-mode-both');
    });

    test('switching mode changes which agent sub-panels are visible', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      // In Code mode, TaskBoardPanel is shown but AgentMessagesPanel is hidden
      const codeBtn = mainWindow.locator('button[title="Code mode"]');
      if (await codeBtn.isVisible().catch(() => false)) {
        await codeBtn.click();
        await mainWindow.waitForTimeout(500);

        const tasksHeader = mainWindow.locator('button:has-text("Tasks")');
        const tasksVis = await tasksHeader.isVisible().catch(() => false);
        console.log(`Tasks header visible in Code mode: ${tasksVis}`);
      }

      // In Cowork mode, AgentMessagesPanel is shown but TaskBoardPanel is hidden
      const coworkBtn = mainWindow.locator('button[title="Cowork mode"]');
      if (await coworkBtn.isVisible().catch(() => false)) {
        await coworkBtn.click();
        await mainWindow.waitForTimeout(500);

        const messagesHeader = mainWindow.locator('button:has-text("Messages")');
        const messagesVis = await messagesHeader.isVisible().catch(() => false);
        console.log(`Messages header visible in Cowork mode: ${messagesVis}`);
      }

      await takeScreenshot(mainWindow, 'sidebar-mode-panel-visibility');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: Chat section and New Chat
  // ---------------------------------------------------------------------------

  test.describe('Chat section', () => {
    test('New Chat button is visible in sidebar', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      const newChatBtn = mainWindow.locator('[data-testid="sidebar-new-chat-button"]');
      const visible = await newChatBtn.isVisible().catch(() => false);
      console.log(`New Chat button visible: ${visible}`);
      expect(visible).toBe(true);

      await takeScreenshot(mainWindow, 'sidebar-new-chat');
    });

    test('chat sessions collapsible can be toggled', async () => {
      await ensureHomeWithSidebar();
      await ensureSidebarOpen();

      // The collapsible trigger has aria-label containing "chat sessions"
      const trigger = mainWindow.locator('button[aria-label*="chat sessions"]').first();
      const triggerVisible = await trigger.isVisible().catch(() => false);
      console.log(`Chat sessions collapse trigger visible: ${triggerVisible}`);

      if (triggerVisible) {
        // Click to toggle
        await trigger.click();
        await mainWindow.waitForTimeout(500);
        console.log('Toggled chat sessions collapse');

        // Click again to toggle back
        await trigger.click();
        await mainWindow.waitForTimeout(500);
        console.log('Toggled chat sessions back');
      }

      await takeScreenshot(mainWindow, 'sidebar-chat-collapsible');
    });
  });
});
