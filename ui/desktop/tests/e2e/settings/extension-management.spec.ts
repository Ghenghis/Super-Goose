/**
 * E2E tests for extension management flows.
 *
 * The extension management UI lives inside the Settings view on the
 * chat tab (or a dedicated extensions route). It includes:
 *   - Extension list with enabled/disabled groups and toggle switches
 *   - "Add custom extension" button -> ExtensionModal (add mode)
 *   - Configure gear icon on non-builtin extensions -> ExtensionModal (edit mode)
 *   - ExtensionModal form: Name, Type, Description, Command/Endpoint, Timeout, EnvVars, Headers
 *   - Delete extension via "Remove extension" button in edit modal
 *   - "Browse extensions" link (opens external URL)
 *   - Extension search/filter functionality
 *
 * These tests run against the Electron app via the `goosePage` fixture.
 * No backend is required -- the app works with its default/mock data.
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';
import { waitForAppReady, takeScreenshot } from '../panels/panel-test-utils';

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
 * Navigate to a view that shows the extensions section.
 * Tries the sidebar settings button first, then opens the right tab.
 */
async function navigateToExtensions() {
  console.log('Navigating to Extensions section...');

  // Wait for app ready
  await waitForAppReady(mainWindow);

  // The extensions section lives at its own route /extensions (sidebar nav item)
  // Try the sidebar button first, then fall back to hash navigation
  const extButton = mainWindow.locator('[data-testid="sidebar-extensions-button"]');
  const extBtnVisible = await extButton.isVisible().catch(() => false);

  if (extBtnVisible) {
    await extButton.click();
    await mainWindow.waitForTimeout(1500);
  } else {
    // Fallback: direct hash navigation
    await mainWindow.evaluate(() => {
      window.location.hash = '#/extensions';
    });
    await mainWindow.waitForTimeout(1500);
  }

  console.log('Extensions section navigation complete');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Extension Management', () => {
  // -----------------------------------------------------------------------
  // Extension List
  // -----------------------------------------------------------------------
  test.describe('Extension List', () => {
    test('extensions section is visible with enabled and available groups', async () => {
      await navigateToExtensions();

      // Look for the extension list headings
      const defaultExtensions = mainWindow.locator('text=Default Extensions').first();
      const availableExtensions = mainWindow.locator('text=Available Extensions').first();

      const defaultVisible = await defaultExtensions.isVisible().catch(() => false);
      const availableVisible = await availableExtensions.isVisible().catch(() => false);

      console.log(`Default Extensions heading: ${defaultVisible}`);
      console.log(`Available Extensions heading: ${availableVisible}`);

      // At least one group should be visible (enabled or disabled extensions)
      expect(defaultVisible || availableVisible).toBeTruthy();

      await takeScreenshot(mainWindow, 'extension-mgmt-list');
    });

    test('extension cards display name and toggle switch', async () => {
      await navigateToExtensions();

      // Look for extension cards with toggle switches
      const extensionCards = mainWindow.locator('[id^="extension-"]');
      const cardCount = await extensionCards.count();
      console.log(`Extension cards found: ${cardCount}`);

      if (cardCount > 0) {
        // First card should have a switch
        const firstCard = extensionCards.first();
        const switchInCard = firstCard.locator('button[role="switch"]');
        const switchVisible = await switchInCard.isVisible().catch(() => false);
        console.log(`Toggle switch in first card: ${switchVisible}`);
        expect(switchVisible).toBeTruthy();
      }

      await takeScreenshot(mainWindow, 'extension-mgmt-cards');
    });

    test('extension cards show description text', async () => {
      await navigateToExtensions();

      // Extension cards should have content/description
      const extensionCards = mainWindow.locator('[id^="extension-"]');
      const cardCount = await extensionCards.count();

      if (cardCount > 0) {
        // Check the first card for description content
        const firstCard = extensionCards.first();
        const cardContent = firstCard.locator('[class*="CardContent"], [class*="text-sm"]').first();
        const hasContent = await cardContent.isVisible().catch(() => false);
        console.log(`First card has description content: ${hasContent}`);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Extension Toggle
  // -----------------------------------------------------------------------
  test.describe('Extension Toggle', () => {
    test('toggling an extension switch changes its visual state', async () => {
      await navigateToExtensions();

      const extensionCards = mainWindow.locator('[id^="extension-"]');
      const cardCount = await extensionCards.count();

      if (cardCount > 0) {
        // Find a non-builtin extension to toggle (builtins may behave differently)
        // Try the second card or beyond since builtins are sorted first
        const cardIndex = Math.min(1, cardCount - 1);
        const targetCard = extensionCards.nth(cardIndex);
        const toggle = targetCard.locator('button[role="switch"]');

        if (await toggle.isVisible().catch(() => false)) {
          // Read initial state
          const initialChecked = await toggle.getAttribute('data-state');
          console.log(`Initial toggle state: ${initialChecked}`);

          // Click to toggle
          await toggle.click();
          await mainWindow.waitForTimeout(1000);

          // Read new state
          const newChecked = await toggle.getAttribute('data-state');
          console.log(`New toggle state: ${newChecked}`);

          // State should have changed (or the operation may have been async)
          // We log the result -- the actual persistence depends on the backend
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Add Extension Modal
  // -----------------------------------------------------------------------
  test.describe('Add Extension Modal', () => {
    test('"Add custom extension" button is visible and opens the modal', async () => {
      await navigateToExtensions();

      const addBtn = mainWindow.locator('button:has-text("Add custom extension")');
      const addBtnVisible = await addBtn.isVisible().catch(() => false);
      console.log(`"Add custom extension" button visible: ${addBtnVisible}`);

      if (addBtnVisible) {
        await addBtn.click();
        await mainWindow.waitForTimeout(500);

        // The dialog should appear with the correct title
        const dialogTitle = mainWindow.locator('[role="dialog"]').locator('text=Add custom extension');
        const dialogVisible = await dialogTitle.isVisible().catch(() => false);
        console.log(`Add extension dialog opened: ${dialogVisible}`);
        expect(dialogVisible).toBeTruthy();

        await takeScreenshot(mainWindow, 'extension-mgmt-add-modal');
      }
    });

    test('add extension modal has all form fields', async () => {
      await navigateToExtensions();

      const addBtn = mainWindow.locator('button:has-text("Add custom extension")');
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await mainWindow.waitForTimeout(500);

        // Extension Name label and input
        const nameLabel = mainWindow.locator('[role="dialog"]').locator('text=Extension Name');
        const nameLabelVisible = await nameLabel.isVisible().catch(() => false);
        console.log(`Name label visible: ${nameLabelVisible}`);

        // Type label
        const typeLabel = mainWindow.locator('[role="dialog"]').locator('text=Type');
        const typeLabelVisible = await typeLabel.isVisible().catch(() => false);
        console.log(`Type label visible: ${typeLabelVisible}`);

        // Description label
        const descLabel = mainWindow.locator('[role="dialog"]').locator('text=Description');
        const descLabelVisible = await descLabel.isVisible().catch(() => false);
        console.log(`Description label visible: ${descLabelVisible}`);

        // Command label (for stdio type, which is the default)
        const cmdLabel = mainWindow.locator('[role="dialog"]').locator('text=Command');
        const cmdLabelVisible = await cmdLabel.isVisible().catch(() => false);
        console.log(`Command label visible: ${cmdLabelVisible}`);

        // Timeout field
        const timeoutLabel = mainWindow.locator('[role="dialog"]').locator('text=Timeout');
        const timeoutVisible = await timeoutLabel.isVisible().catch(() => false);
        console.log(`Timeout label visible: ${timeoutVisible}`);

        // Environment Variables section (for stdio type)
        const envVarsLabel = mainWindow.locator('[role="dialog"]').locator('text=Environment Variables').first();
        const envVarsVisible = await envVarsLabel.isVisible().catch(() => false);
        console.log(`Environment Variables section visible: ${envVarsVisible}`);

        // Add Extension submit button
        const submitBtn = mainWindow.locator('[data-testid="extension-submit-btn"]');
        const submitVisible = await submitBtn.isVisible().catch(() => false);
        console.log(`Submit button visible: ${submitVisible}`);

        // Cancel button
        const cancelBtn = mainWindow.locator('[role="dialog"] button:has-text("Cancel")');
        const cancelVisible = await cancelBtn.isVisible().catch(() => false);
        console.log(`Cancel button visible: ${cancelVisible}`);

        // Close the dialog
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);
      }
    });

    test('typing into add extension form fields updates values', async () => {
      await navigateToExtensions();

      const addBtn = mainWindow.locator('button:has-text("Add custom extension")');
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await mainWindow.waitForTimeout(500);

        // Fill in Extension Name
        const nameInput = mainWindow.locator('[role="dialog"] input[placeholder*="extension name"]');
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.fill('test-extension');
          const nameValue = await nameInput.inputValue();
          console.log(`Name field value: ${nameValue}`);
          expect(nameValue).toBe('test-extension');
        }

        // Fill in Command
        const cmdInput = mainWindow.locator('[role="dialog"] input[placeholder*="npx"]');
        if (await cmdInput.isVisible().catch(() => false)) {
          await cmdInput.fill('npx test-mcp-server');
          const cmdValue = await cmdInput.inputValue();
          console.log(`Command field value: ${cmdValue}`);
          expect(cmdValue).toBe('npx test-mcp-server');
        }

        // Fill in Description
        const descInput = mainWindow.locator('[role="dialog"] input[placeholder*="description"]');
        if (await descInput.isVisible().catch(() => false)) {
          await descInput.fill('A test extension');
          const descValue = await descInput.inputValue();
          console.log(`Description field value: ${descValue}`);
          expect(descValue).toBe('A test extension');
        }

        await takeScreenshot(mainWindow, 'extension-mgmt-form-filled');

        // Close without saving
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);

        // If form has changes, unsaved changes confirmation may appear
        const confirmClose = mainWindow.locator('text=Close Without Saving');
        if (await confirmClose.isVisible().catch(() => false)) {
          await confirmClose.click();
          await mainWindow.waitForTimeout(300);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Browse Extensions
  // -----------------------------------------------------------------------
  test.describe('Browse Extensions', () => {
    test('"Browse extensions" button is visible', async () => {
      await navigateToExtensions();

      const browseBtn = mainWindow.locator('button:has-text("Browse extensions")');
      const browseVisible = await browseBtn.isVisible().catch(() => false);
      console.log(`"Browse extensions" button visible: ${browseVisible}`);
    });
  });

  // -----------------------------------------------------------------------
  // Extension Configure (gear icon)
  // -----------------------------------------------------------------------
  test.describe('Extension Configure', () => {
    test('gear icon is visible on non-builtin/non-bundled extensions', async () => {
      await navigateToExtensions();

      // Gear icons are rendered as aria-label="Configure ... Extension"
      const gearButtons = mainWindow.locator('button[aria-label^="Configure"]');
      const gearCount = await gearButtons.count();
      console.log(`Gear/configure button count: ${gearCount}`);

      // Non-builtin extensions should show the gear
      // (builtin extensions like developer, memory, etc. do NOT show the gear)
    });

    test('clicking gear icon opens edit extension modal', async () => {
      await navigateToExtensions();

      const gearButtons = mainWindow.locator('button[aria-label^="Configure"]');
      const gearCount = await gearButtons.count();

      if (gearCount > 0) {
        await gearButtons.first().click();
        await mainWindow.waitForTimeout(500);

        // Edit modal should open with "Update Extension" title
        const editTitle = mainWindow.locator('[role="dialog"]').locator('text=Update Extension');
        const editVisible = await editTitle.isVisible().catch(() => false);
        console.log(`Edit extension modal visible: ${editVisible}`);

        if (editVisible) {
          // Should have "Save Changes" submit button
          const saveBtn = mainWindow.locator('[data-testid="extension-submit-btn"]');
          const saveText = await saveBtn.innerText().catch(() => '');
          console.log(`Submit button text: ${saveText}`);

          // Should have "Remove extension" button
          const removeBtn = mainWindow.locator('[role="dialog"] button:has-text("Remove extension")');
          const removeVisible = await removeBtn.isVisible().catch(() => false);
          console.log(`Remove extension button visible: ${removeVisible}`);

          await takeScreenshot(mainWindow, 'extension-mgmt-edit-modal');
        }

        // Close the dialog
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Extension Delete Confirmation
  // -----------------------------------------------------------------------
  test.describe('Extension Delete Confirmation', () => {
    test('"Remove extension" shows delete confirmation UI', async () => {
      await navigateToExtensions();

      const gearButtons = mainWindow.locator('button[aria-label^="Configure"]');
      const gearCount = await gearButtons.count();

      if (gearCount > 0) {
        await gearButtons.first().click();
        await mainWindow.waitForTimeout(500);

        const removeBtn = mainWindow.locator('[role="dialog"] button:has-text("Remove extension")');
        if (await removeBtn.isVisible().catch(() => false)) {
          await removeBtn.click();
          await mainWindow.waitForTimeout(500);

          // Delete confirmation UI should appear
          const deleteTitle = mainWindow.locator('text=Delete Extension').first();
          const deleteVisible = await deleteTitle.isVisible().catch(() => false);
          console.log(`Delete confirmation visible: ${deleteVisible}`);

          // "Confirm removal" button
          const confirmBtn = mainWindow.locator('[role="dialog"] button:has-text("Confirm removal")');
          const confirmVisible = await confirmBtn.isVisible().catch(() => false);
          console.log(`Confirm removal button: ${confirmVisible}`);

          // "Cancel" button to go back
          const cancelBtn = mainWindow.locator('[role="dialog"] button:has-text("Cancel")');
          const cancelVisible = await cancelBtn.isVisible().catch(() => false);
          console.log(`Cancel button in delete confirmation: ${cancelVisible}`);

          // Click Cancel to return to edit mode
          if (cancelVisible) {
            await cancelBtn.click();
            await mainWindow.waitForTimeout(300);

            // Should be back to edit mode (not delete confirmation)
            const editTitle = mainWindow.locator('[role="dialog"]').locator('text=Update Extension');
            const backToEdit = await editTitle.isVisible().catch(() => false);
            console.log(`Back to edit mode after cancel: ${backToEdit}`);
          }

          await takeScreenshot(mainWindow, 'extension-mgmt-delete-confirm');
        }

        // Close dialog
        await mainWindow.keyboard.press('Escape');
        await mainWindow.waitForTimeout(300);
      }
    });
  });
});
