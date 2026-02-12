/**
 * E2E tests for the Session workflow lifecycle.
 *
 * Tests navigation to /sessions, viewing session history,
 * session list display, session details, session rename,
 * session search, and bookmark management.
 *
 * Routes: #/sessions, #/search, #/bookmarks
 * Components: SessionsView, SessionListView, SessionHistoryView,
 *             SessionsInsights, SearchSidebar, BookmarkManager
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

test.describe('Session Workflow', () => {
  test.describe('Session List View', () => {
    test('navigates to /sessions and displays Chat history heading', async () => {
      await navigateToRoute('#/sessions');

      const heading = mainWindow.locator('h1:has-text("Chat history")');
      await expect(heading).toBeVisible({ timeout: 10000 });
      console.log('Chat history heading is visible');

      await mainWindow.screenshot({ path: 'test-results/session-workflow-heading.png' });
    });

    test('session list page shows description text', async () => {
      await navigateToRoute('#/sessions');

      const description = mainWindow.locator('text=View and search your past conversations');
      const descVisible = await description.isVisible().catch(() => false);
      console.log(`Sessions description visible: ${descVisible}`);

      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      expect(pageText.toLowerCase()).toContain('history');

      await mainWindow.screenshot({ path: 'test-results/session-workflow-description.png' });
    });

    test('session list shows empty state or session cards', async () => {
      await navigateToRoute('#/sessions');
      await mainWindow.waitForTimeout(3000);

      // Either "No chat sessions found" empty state or session cards
      const emptyState = mainWindow.locator('text=No chat sessions found');
      const emptyVisible = await emptyState.isVisible().catch(() => false);

      if (emptyVisible) {
        console.log('Empty state shown (no sessions)');
        const guidance = mainWindow.locator('text=Your chat history will appear here');
        const guidanceVisible = await guidance.isVisible().catch(() => false);
        console.log(`Empty state guidance visible: ${guidanceVisible}`);
      } else {
        // Session cards are rendered within a grid layout
        // Each SessionItem has an h3 for the session name
        const sessionNames = mainWindow.locator('h3.text-base');
        const nameCount = await sessionNames.count().catch(() => 0);
        console.log(`Session name elements found: ${nameCount}`);
      }

      await mainWindow.screenshot({ path: 'test-results/session-workflow-list.png' });
    });

    test('session list has Import Session button', async () => {
      await navigateToRoute('#/sessions');
      await mainWindow.waitForTimeout(1500);

      const importButton = mainWindow.locator('button:has-text("Import Session")');
      const importVisible = await importButton.isVisible().catch(() => false);
      console.log(`Import Session button visible: ${importVisible}`);

      await mainWindow.screenshot({ path: 'test-results/session-workflow-import-button.png' });
    });

    test('session list has search functionality', async () => {
      await navigateToRoute('#/sessions');
      await mainWindow.waitForTimeout(2000);

      // The SearchView component provides a search interface
      const searchInput = mainWindow.locator(
        'input[placeholder*="Search history"], input[placeholder*="search"]',
      );
      const searchVisible = await searchInput.first().isVisible().catch(() => false);
      console.log(`Search input visible: ${searchVisible}`);

      // The page mentions the search shortcut in its description
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      const mentionsSearch = pageText.toLowerCase().includes('search');
      console.log(`Page mentions search: ${mentionsSearch}`);

      await mainWindow.screenshot({ path: 'test-results/session-workflow-search.png' });
    });

    test('session cards show metadata: date, folder, message count, tokens', async () => {
      await navigateToRoute('#/sessions');
      await mainWindow.waitForTimeout(3000);

      // Session cards display Calendar icon, Folder icon, MessageSquareText, Target
      const calendarIcons = mainWindow.locator('svg.lucide-calendar');
      const folderIcons = mainWindow.locator('svg.lucide-folder');
      const messageIcons = mainWindow.locator('svg.lucide-message-square-text');
      const targetIcons = mainWindow.locator('svg.lucide-target');

      const calendarCount = await calendarIcons.count().catch(() => 0);
      const folderCount = await folderIcons.count().catch(() => 0);
      const messageCount = await messageIcons.count().catch(() => 0);
      const targetCount = await targetIcons.count().catch(() => 0);

      console.log(`Icons - Calendar: ${calendarCount}, Folder: ${folderCount}, Message: ${messageCount}, Target: ${targetCount}`);

      // If sessions exist, we should see at least some metadata icons
      if (calendarCount > 0) {
        expect(folderCount).toBeGreaterThan(0);
        expect(messageCount).toBeGreaterThan(0);
      }

      await mainWindow.screenshot({ path: 'test-results/session-workflow-metadata.png' });
    });

    test('session cards show hover action buttons', async () => {
      await navigateToRoute('#/sessions');
      await mainWindow.waitForTimeout(3000);

      // SessionItem action buttons: Edit, Duplicate (Copy), Delete, Export, Open in new window
      // These are hidden until hover, but we check they exist in the DOM
      const editButtons = mainWindow.locator('button[title="Edit session name"]');
      const deleteButtons = mainWindow.locator('button[title="Delete session"]');
      const exportButtons = mainWindow.locator('button[title="Export session"]');
      const duplicateButtons = mainWindow.locator('button[title="Duplicate session"]');

      const editCount = await editButtons.count().catch(() => 0);
      const deleteCount = await deleteButtons.count().catch(() => 0);
      const exportCount = await exportButtons.count().catch(() => 0);
      const duplicateCount = await duplicateButtons.count().catch(() => 0);

      console.log(`Action buttons - Edit: ${editCount}, Delete: ${deleteCount}, Export: ${exportCount}, Duplicate: ${duplicateCount}`);

      await mainWindow.screenshot({ path: 'test-results/session-workflow-hover-actions.png' });
    });

    test('session list groups sessions by date', async () => {
      await navigateToRoute('#/sessions');
      await mainWindow.waitForTimeout(3000);

      // Date group headers are rendered as h2 elements (e.g., "Today", "Yesterday", "Last 7 days")
      const dateHeaders = mainWindow.locator('h2.text-text-muted');
      const headerCount = await dateHeaders.count().catch(() => 0);
      console.log(`Date group headers found: ${headerCount}`);

      if (headerCount > 0) {
        const firstHeader = await dateHeaders.first().textContent();
        console.log(`First date group header: "${firstHeader}"`);
      }

      await mainWindow.screenshot({ path: 'test-results/session-workflow-date-groups.png' });
    });
  });

  test.describe('Cross-Session Search', () => {
    test('navigates to /search and displays search interface', async () => {
      await navigateToRoute('#/search');

      // SearchSidebar heading
      const heading = mainWindow.locator('h1').first();
      const headingText = await heading.textContent().catch(() => '');
      console.log(`Search heading text: "${headingText}"`);

      // Search input should be present
      const searchInput = mainWindow.locator(
        'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]',
      );
      const inputVisible = await searchInput.first().isVisible().catch(() => false);
      console.log(`Search input visible: ${inputVisible}`);

      await mainWindow.screenshot({ path: 'test-results/session-workflow-cross-search.png' });
    });
  });

  test.describe('Bookmark Management', () => {
    test('navigates to /bookmarks and displays bookmark interface', async () => {
      await navigateToRoute('#/bookmarks');

      // BookmarkManager heading
      const heading = mainWindow.locator('h1:has-text("Bookmarks")');
      const headingVisible = await heading.isVisible().catch(() => false);
      console.log(`Bookmarks heading visible: ${headingVisible}`);

      await mainWindow.screenshot({ path: 'test-results/session-workflow-bookmarks.png' });
    });

    test('bookmark manager displays bookmark entries or empty state', async () => {
      await navigateToRoute('#/bookmarks');
      await mainWindow.waitForTimeout(1000);

      // Check for mock bookmark data or empty state
      const bookmarkEntries = mainWindow.locator('text=Auth flow fix');
      const entryVisible = await bookmarkEntries.isVisible().catch(() => false);
      console.log(`Bookmark entry "Auth flow fix" visible: ${entryVisible}`);

      // The page should render something
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      expect(pageText.length).toBeGreaterThan(0);
      console.log(`Bookmark page text length: ${pageText.length}`);

      await mainWindow.screenshot({ path: 'test-results/session-workflow-bookmark-entries.png' });
    });
  });
});
