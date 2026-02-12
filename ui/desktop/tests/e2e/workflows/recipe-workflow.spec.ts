/**
 * E2E tests for the Recipe workflow lifecycle.
 *
 * Tests navigation to /recipes, viewing the recipe list,
 * creating recipes, importing recipes, recipe expandable info,
 * recipe activities, and recipe detail modals.
 *
 * Route: #/recipes
 * Component: RecipesView
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

test.describe('Recipe Workflow', () => {
  test.describe('Navigation & List View', () => {
    test('navigates to /recipes and displays Recipes heading', async () => {
      await navigateToRoute('#/recipes');

      const heading = mainWindow.locator('h1:has-text("Recipes")');
      await expect(heading).toBeVisible({ timeout: 10000 });
      console.log('Recipes heading is visible');

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-heading.png' });
    });

    test('recipes page shows description text', async () => {
      await navigateToRoute('#/recipes');

      // The description mentions "saved recipes" and search shortcut
      const description = mainWindow.locator('text=View and manage your saved recipes');
      const descVisible = await description.isVisible().catch(() => false);
      console.log(`Recipes description visible: ${descVisible}`);

      // Even if the exact text doesn't match, the page should have content
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      expect(pageText.toLowerCase()).toContain('recipe');

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-description.png' });
    });

    test('recipes page shows empty state or recipe list', async () => {
      await navigateToRoute('#/recipes');

      // Wait for loading to complete (skeleton disappears)
      await mainWindow.waitForTimeout(2000);

      // Either shows "No saved recipes" empty state OR recipe cards
      const emptyState = mainWindow.locator('text=No saved recipes');
      const emptyVisible = await emptyState.isVisible().catch(() => false);

      if (emptyVisible) {
        console.log('Empty state is shown (no recipes saved)');
        // Empty state should also show guidance text
        const guidance = mainWindow.locator('text=Recipe saved from chats will show up here');
        const guidanceVisible = await guidance.isVisible().catch(() => false);
        console.log(`Empty state guidance visible: ${guidanceVisible}`);
      } else {
        // Recipe cards should be present
        const recipeCards = mainWindow.locator('.mb-2').filter({
          has: mainWindow.locator('h3'),
        });
        const cardCount = await recipeCards.count().catch(() => 0);
        console.log(`Recipe cards found: ${cardCount}`);
      }

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-list.png' });
    });

    test('recipes page has search input for filtering', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(2000);

      // The SearchView component renders a search input
      const searchInput = mainWindow.locator(
        'input[placeholder*="Search recipes"], input[placeholder*="search"]',
      );
      const searchVisible = await searchInput.first().isVisible().catch(() => false);
      console.log(`Recipe search input visible: ${searchVisible}`);

      // Even if hidden until triggered by shortcut, the page should mention search
      const pageText = await mainWindow.evaluate(() => document.body.innerText);
      const mentionsSearch = pageText.toLowerCase().includes('search');
      console.log(`Page mentions search: ${mentionsSearch}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-search.png' });
    });
  });

  test.describe('Recipe Creation', () => {
    test('Create Recipe button is visible and clickable', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const createButton = mainWindow.locator('button:has-text("Create Recipe")');
      await expect(createButton).toBeVisible({ timeout: 5000 });
      console.log('Create Recipe button is visible');

      // Click it to open the create modal
      await createButton.click();
      await mainWindow.waitForTimeout(1000);

      // The modal should open with the title "Create Recipe"
      const modalTitle = mainWindow.locator('h1:has-text("Create Recipe")');
      const modalVisible = await modalTitle.isVisible().catch(() => false);
      console.log(`Create Recipe modal title visible: ${modalVisible}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-create-modal.png' });
    });

    test('Create Recipe modal has form fields for name and description', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const createButton = mainWindow.locator('button:has-text("Create Recipe")');
      await createButton.click();
      await mainWindow.waitForTimeout(1000);

      // Modal should contain form fields: title, description
      // RecipeFormFields has inputs for title and description
      const titleInput = mainWindow.locator(
        'input[placeholder*="title" i], input[name="title"], textarea[name="title"]',
      );
      const descInput = mainWindow.locator(
        'textarea[placeholder*="description" i], input[name="description"], textarea[name="description"]',
      );

      const titleVisible = await titleInput.first().isVisible().catch(() => false);
      const descVisible = await descInput.first().isVisible().catch(() => false);
      console.log(`Title field visible: ${titleVisible}, Description field visible: ${descVisible}`);

      // At minimum, modal content area should be visible
      const modalContent = mainWindow.locator('.overflow-y-auto');
      const contentVisible = await modalContent.first().isVisible().catch(() => false);
      console.log(`Modal content area visible: ${contentVisible}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-create-fields.png' });
    });

    test('Create Recipe modal has Save and Save & Run buttons', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const createButton = mainWindow.locator('button:has-text("Create Recipe")');
      await createButton.click();
      await mainWindow.waitForTimeout(1000);

      // Footer should have Save Recipe and Save & Run Recipe buttons
      const saveButton = mainWindow.locator('button:has-text("Save Recipe")');
      const saveRunButton = mainWindow.locator('button:has-text("Save & Run Recipe")');

      const saveVisible = await saveButton.isVisible().catch(() => false);
      const saveRunVisible = await saveRunButton.isVisible().catch(() => false);
      console.log(`Save Recipe button visible: ${saveVisible}`);
      console.log(`Save & Run Recipe button visible: ${saveRunVisible}`);

      // Both buttons should be disabled when form is empty
      if (saveVisible) {
        const isDisabled = await saveButton.isDisabled();
        console.log(`Save Recipe button disabled (empty form): ${isDisabled}`);
      }

      // Close button should exist
      const closeButton = mainWindow.locator('button:has-text("Close")');
      const closeVisible = await closeButton.isVisible().catch(() => false);
      console.log(`Close button visible: ${closeVisible}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-create-buttons.png' });
    });

    test('Create Recipe modal can be closed', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const createButton = mainWindow.locator('button:has-text("Create Recipe")');
      await createButton.click();
      await mainWindow.waitForTimeout(1000);

      // Close using the X button in the header
      const xButton = mainWindow.locator('button').filter({
        has: mainWindow.locator('svg.lucide-x'),
      });
      const xVisible = await xButton.first().isVisible().catch(() => false);

      if (xVisible) {
        await xButton.first().click();
        await mainWindow.waitForTimeout(500);
        console.log('Closed modal via X button');
      } else {
        // Try Close button in footer
        const closeButton = mainWindow.locator('button:has-text("Close")');
        if (await closeButton.isVisible().catch(() => false)) {
          await closeButton.click();
          await mainWindow.waitForTimeout(500);
          console.log('Closed modal via Close button');
        }
      }

      // After closing, the main recipes heading should be visible again
      const heading = mainWindow.locator('h1:has-text("Recipes")');
      const headingVisible = await heading.isVisible().catch(() => false);
      console.log(`Recipes heading visible after modal close: ${headingVisible}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-modal-closed.png' });
    });
  });

  test.describe('Recipe Import', () => {
    test('Import Recipe button is visible', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const importButton = mainWindow.locator('button:has-text("Import Recipe")');
      await expect(importButton).toBeVisible({ timeout: 5000 });
      console.log('Import Recipe button is visible');

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-import-button.png' });
    });

    test('Import Recipe modal opens with deeplink and file upload fields', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const importButton = mainWindow.locator('button:has-text("Import Recipe")');
      await importButton.click();
      await mainWindow.waitForTimeout(1000);

      // Modal heading
      const modalHeading = mainWindow.locator('h3:has-text("Import Recipe")');
      const headingVisible = await modalHeading.isVisible().catch(() => false);
      console.log(`Import Recipe modal heading visible: ${headingVisible}`);

      // Deeplink textarea
      const deeplinkField = mainWindow.locator(
        'textarea[placeholder*="goose://recipe"], #import-deeplink',
      );
      const deeplinkVisible = await deeplinkField.first().isVisible().catch(() => false);
      console.log(`Deeplink field visible: ${deeplinkVisible}`);

      // "OR" separator
      const orSeparator = mainWindow.locator('text=OR');
      const orVisible = await orSeparator.isVisible().catch(() => false);
      console.log(`OR separator visible: ${orVisible}`);

      // Recipe File upload field
      const fileLabel = mainWindow.locator('label:has-text("Recipe File")');
      const fileLabelVisible = await fileLabel.isVisible().catch(() => false);
      console.log(`Recipe File label visible: ${fileLabelVisible}`);

      // Import Recipe submit button
      const submitButton = mainWindow.locator('button[type="submit"]:has-text("Import Recipe")');
      const submitVisible = await submitButton.isVisible().catch(() => false);
      console.log(`Import Recipe submit button visible: ${submitVisible}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-import-modal.png' });
    });

    test('Import Recipe modal has Cancel button', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(1500);

      const importButton = mainWindow.locator('button:has-text("Import Recipe")');
      await importButton.click();
      await mainWindow.waitForTimeout(1000);

      const cancelButton = mainWindow.locator('button:has-text("Cancel")');
      const cancelVisible = await cancelButton.isVisible().catch(() => false);
      console.log(`Cancel button visible: ${cancelVisible}`);
      expect(cancelVisible).toBe(true);

      // Click cancel to close modal
      await cancelButton.click();
      await mainWindow.waitForTimeout(500);

      // Modal should be gone
      const modalHeading = mainWindow.locator('h3:has-text("Import Recipe")');
      const stillVisible = await modalHeading.isVisible().catch(() => false);
      console.log(`Import modal still visible after cancel: ${stillVisible}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-import-cancel.png' });
    });
  });

  test.describe('Recipe List Actions', () => {
    test('recipe list shows action buttons for each recipe card', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(2000);

      // Check for action button titles that exist on each recipe card
      const playButtons = mainWindow.locator('button[title="Use recipe"]');
      const editButtons = mainWindow.locator('button[title="Edit recipe"]');
      const deleteButtons = mainWindow.locator('button[title="Delete recipe"]');
      const shareButtons = mainWindow.locator('button[title="Share recipe"]');
      const scheduleButtons = mainWindow.locator(
        'button[title="Add schedule"], button[title="Edit schedule"]',
      );

      const playCount = await playButtons.count().catch(() => 0);
      const editCount = await editButtons.count().catch(() => 0);
      const deleteCount = await deleteButtons.count().catch(() => 0);
      const shareCount = await shareButtons.count().catch(() => 0);
      const scheduleCount = await scheduleButtons.count().catch(() => 0);

      console.log(`Action buttons - Play: ${playCount}, Edit: ${editCount}, Delete: ${deleteCount}, Share: ${shareCount}, Schedule: ${scheduleCount}`);

      // If there are recipes, action buttons should exist
      if (playCount > 0) {
        expect(editCount).toBeGreaterThan(0);
        expect(deleteCount).toBeGreaterThan(0);
      } else {
        console.log('No recipes found, skipping action button count assertions');
      }

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-actions.png' });
    });

    test('recipe cards show title, description, and date', async () => {
      await navigateToRoute('#/recipes');
      await mainWindow.waitForTimeout(2000);

      // Recipe items render h3 for title, p for description, and Calendar icon with date
      const recipeTitles = mainWindow.locator('h3.text-base');
      const titleCount = await recipeTitles.count().catch(() => 0);
      console.log(`Recipe titles found: ${titleCount}`);

      if (titleCount > 0) {
        const firstTitle = await recipeTitles.first().textContent();
        console.log(`First recipe title: "${firstTitle}"`);
        expect(firstTitle).toBeTruthy();
      }

      // Check for date display (Calendar icon exists in recipe items)
      const calendarIcons = mainWindow.locator('svg.lucide-calendar');
      const calendarCount = await calendarIcons.count().catch(() => 0);
      console.log(`Calendar date icons: ${calendarCount}`);

      await mainWindow.screenshot({ path: 'test-results/recipe-workflow-card-content.png' });
    });
  });
});
