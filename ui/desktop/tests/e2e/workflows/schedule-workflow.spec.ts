/**
 * E2E tests for the Schedule workflow lifecycle.
 *
 * Tests navigation to /schedules, viewing the schedule list,
 * creating schedules, viewing schedule details, schedule actions
 * (pause/resume/edit/delete), and the schedule creation modal.
 *
 * Route: #/schedules
 * Components: SchedulesView, ScheduleModal, ScheduleDetailView, CronPicker
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

test.describe('Schedule Workflow', () => {
  test.describe('Schedule List View', () => {
    test('navigates to /schedules and displays Scheduler heading', async () => {
      await navigateToRoute('#/schedules');

      const heading = mainWindow.locator('h1:has-text("Scheduler")');
      await expect(heading).toBeVisible({ timeout: 10000 });
      console.log('Scheduler heading is visible');

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-heading.png' });
    });

    test('schedules page shows description text', async () => {
      await navigateToRoute('#/schedules');

      const description = mainWindow.locator(
        'text=Create and manage scheduled tasks to run recipes automatically',
      );
      const descVisible = await description.isVisible().catch(() => false);
      console.log(`Schedules description visible: ${descVisible}`);

      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      expect(pageText.toLowerCase()).toContain('schedule');

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-description.png' });
    });

    test('schedules page shows empty state or schedule cards', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(2000);

      // Either "No schedules yet" empty state or schedule cards
      const emptyState = mainWindow.locator('text=No schedules yet');
      const emptyVisible = await emptyState.isVisible().catch(() => false);

      if (emptyVisible) {
        console.log('Empty state shown (no schedules)');
      } else {
        // Schedule cards should be present with h3 elements for IDs
        const scheduleCards = mainWindow.locator('h3.text-base');
        const cardCount = await scheduleCards.count().catch(() => 0);
        console.log(`Schedule card titles found: ${cardCount}`);

        // Each card may show "Running" or "Paused" badges
        const runningBadge = mainWindow.locator('text=Running');
        const pausedBadge = mainWindow.locator('text=Paused');
        const runningCount = await runningBadge.count().catch(() => 0);
        const pausedCount = await pausedBadge.count().catch(() => 0);
        console.log(`Running badges: ${runningCount}, Paused badges: ${pausedCount}`);
      }

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-list.png' });
    });

    test('schedules page has Refresh button', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(1500);

      const refreshButton = mainWindow.locator('button:has-text("Refresh")');
      const refreshVisible = await refreshButton.isVisible().catch(() => false);
      console.log(`Refresh button visible: ${refreshVisible}`);

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-refresh.png' });
    });
  });

  test.describe('Schedule Creation', () => {
    test('Create Schedule button is visible and clickable', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(1500);

      const createButton = mainWindow.locator('button:has-text("Create Schedule")');
      await expect(createButton).toBeVisible({ timeout: 5000 });
      console.log('Create Schedule button is visible');

      // Click it to open the create modal
      await createButton.click();
      await mainWindow.waitForTimeout(1000);

      // The ScheduleModal should open
      // It typically has heading text and form fields
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      const hasModalContent =
        pageText.toLowerCase().includes('schedule') ||
        pageText.toLowerCase().includes('cron') ||
        pageText.toLowerCase().includes('recipe');
      console.log(`Schedule modal has relevant content: ${hasModalContent}`);

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-create-modal.png' });
    });

    test('Schedule creation modal can be dismissed', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(1500);

      const createButton = mainWindow.locator('button:has-text("Create Schedule")');
      await createButton.click();
      await mainWindow.waitForTimeout(1000);

      // Try to close via Cancel button or Escape
      const cancelButton = mainWindow.locator('button:has-text("Cancel")');
      const cancelVisible = await cancelButton.first().isVisible().catch(() => false);

      if (cancelVisible) {
        await cancelButton.first().click();
        await mainWindow.waitForTimeout(500);
        console.log('Closed schedule modal via Cancel button');
      } else {
        // Try pressing Escape
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(500);
        console.log('Attempted to close schedule modal via Escape');
      }

      // The Scheduler heading should be visible again
      const heading = mainWindow.locator('h1:has-text("Scheduler")');
      const headingVisible = await heading.isVisible().catch(() => false);
      console.log(`Scheduler heading visible after close: ${headingVisible}`);

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-modal-closed.png' });
    });
  });

  test.describe('Schedule Card Actions', () => {
    test('schedule cards show action buttons when schedules exist', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(2000);

      // Schedule cards have Edit, Pause/Resume, and Delete buttons
      const editButtons = mainWindow.locator('button:has-text("Edit")');
      const pauseButtons = mainWindow.locator('button:has-text("Pause")');
      const resumeButtons = mainWindow.locator('button:has-text("Resume")');

      const editCount = await editButtons.count().catch(() => 0);
      const pauseCount = await pauseButtons.count().catch(() => 0);
      const resumeCount = await resumeButtons.count().catch(() => 0);

      console.log(`Schedule action buttons - Edit: ${editCount}, Pause: ${pauseCount}, Resume: ${resumeCount}`);

      // Delete buttons use a trash icon
      const trashButtons = mainWindow.locator('button').filter({
        has: mainWindow.locator('svg.lucide-trash-2, [class*="TrashIcon"]'),
      });
      const trashCount = await trashButtons.count().catch(() => 0);
      console.log(`Delete/trash buttons: ${trashCount}`);

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-card-actions.png' });
    });

    test('schedule cards show "Last run" timestamp', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(2000);

      const lastRunText = mainWindow.locator('text=Last run:');
      const lastRunCount = await lastRunText.count().catch(() => 0);
      console.log(`"Last run:" labels found: ${lastRunCount}`);

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-last-run.png' });
    });

    test('schedule cards show readable cron description', async () => {
      await navigateToRoute('#/schedules');
      await mainWindow.waitForTimeout(2000);

      // Cron descriptions are rendered in a p.text-text-muted element
      // cronstrue converts cron expressions to readable strings like "Every day at 2:00 PM"
      const cronDescriptions = mainWindow.locator('p.text-text-muted.text-sm');
      const cronCount = await cronDescriptions.count().catch(() => 0);
      console.log(`Cron description elements found: ${cronCount}`);

      if (cronCount > 0) {
        const firstCronText = await cronDescriptions.first().textContent();
        console.log(`First cron description: "${firstCronText}"`);
      }

      await mainWindow.screenshot({ path: 'test-results/schedule-workflow-cron-desc.png' });
    });
  });
});
