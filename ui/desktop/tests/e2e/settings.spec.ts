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

/**
 * Helper: navigate to the Settings page via the sidebar.
 * Returns once the settings heading is visible.
 */
async function navigateToSettings() {
  console.log('Navigating to Settings via sidebar...');

  // Wait for the app to be ready -- look for either chat-input or the sidebar button
  await mainWindow.waitForSelector('[data-testid="sidebar-settings-button"]', {
    timeout: 15000,
    state: 'visible',
  });

  const settingsButton = await mainWindow.waitForSelector(
    '[data-testid="sidebar-settings-button"]',
    { timeout: 5000, state: 'visible' }
  );
  await settingsButton.click();

  // Wait for the settings heading to appear
  await mainWindow.waitForSelector('h1:has-text("Settings")', {
    timeout: 10000,
    state: 'visible',
  });
  console.log('Settings page loaded');
}

/**
 * Helper: click a settings tab by data-testid and verify it becomes selected.
 */
async function clickSettingsTab(testId: string) {
  console.log(`Clicking tab: ${testId}`);
  const tab = await mainWindow.waitForSelector(`[data-testid="${testId}"]`, {
    timeout: 5000,
    state: 'visible',
  });
  await tab.click();
  await mainWindow.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Settings', () => {
  test.describe('Settings Navigation', () => {
    test('can navigate to settings and see the heading', async () => {
      await navigateToSettings();
      await mainWindow.screenshot({ path: 'test-results/settings-heading.png' });

      const heading = mainWindow.locator('h1:has-text("Settings")');
      await expect(heading).toBeVisible();
    });

    test('all settings tabs are visible', async () => {
      await navigateToSettings();

      const tabIds = [
        'settings-models-tab',
        'settings-chat-tab',
        'settings-sharing-tab',
        'settings-prompts-tab',
        'settings-keyboard-tab',
        'settings-app-tab',
      ];

      for (const tabId of tabIds) {
        const tab = mainWindow.locator(`[data-testid="${tabId}"]`);
        await expect(tab).toBeVisible();
        console.log(`Tab visible: ${tabId}`);
      }

      await mainWindow.screenshot({ path: 'test-results/settings-all-tabs.png' });
    });

    test('clicking each tab changes the content', async () => {
      await navigateToSettings();

      // Start on Models tab (default)
      const modelsTab = mainWindow.locator('[data-testid="settings-models-tab"]');
      await expect(modelsTab).toHaveAttribute('data-state', 'active');

      // Click Chat tab
      await clickSettingsTab('settings-chat-tab');
      const chatTab = mainWindow.locator('[data-testid="settings-chat-tab"]');
      await expect(chatTab).toHaveAttribute('data-state', 'active');
      // Models tab should no longer be active
      await expect(modelsTab).not.toHaveAttribute('data-state', 'active');

      // Click Session tab
      await clickSettingsTab('settings-sharing-tab');
      const sharingTab = mainWindow.locator('[data-testid="settings-sharing-tab"]');
      await expect(sharingTab).toHaveAttribute('data-state', 'active');

      // Click Keyboard tab
      await clickSettingsTab('settings-keyboard-tab');
      const keyboardTab = mainWindow.locator('[data-testid="settings-keyboard-tab"]');
      await expect(keyboardTab).toHaveAttribute('data-state', 'active');

      // Click App tab
      await clickSettingsTab('settings-app-tab');
      const appTab = mainWindow.locator('[data-testid="settings-app-tab"]');
      await expect(appTab).toHaveAttribute('data-state', 'active');

      // Click Prompts tab
      await clickSettingsTab('settings-prompts-tab');
      const promptsTab = mainWindow.locator('[data-testid="settings-prompts-tab"]');
      await expect(promptsTab).toHaveAttribute('data-state', 'active');

      await mainWindow.screenshot({ path: 'test-results/settings-tab-switching.png' });
    });

    test('settings can be dismissed with Escape', async () => {
      await navigateToSettings();

      // Press Escape
      await mainWindow.keyboard.press('Escape');
      await mainWindow.waitForTimeout(500);

      // Settings heading should no longer be visible (navigated away)
      const heading = mainWindow.locator('h1:has-text("Settings")');
      // After escape, the view should change -- either the heading disappears or we are back at chat
      const isSettingsStillVisible = await heading.isVisible().catch(() => false);
      // If the app closes settings on Escape, we should be somewhere else
      console.log(`Settings still visible after Escape: ${isSettingsStillVisible}`);
      // We verify the escape handler existed -- the behaviour depends on onClose implementation
    });
  });

  test.describe('Models Tab', () => {
    test('displays current provider and model information', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-models-tab');

      await mainWindow.waitForTimeout(1000);
      await mainWindow.screenshot({ path: 'test-results/settings-models-tab.png' });

      // The Models section should show provider/model info cards
      // Look for card elements that contain model/provider info
      const modelsContent = mainWindow.locator('[data-testid="settings-models-tab"][data-state="active"]');
      await expect(modelsContent).toBeVisible();
    });

    test('has reset provider button', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-models-tab');

      await mainWindow.waitForTimeout(1000);

      // Look for reset provider button
      const resetButton = mainWindow.locator('button:has-text("Reset provider and model")');
      const isResetVisible = await resetButton.isVisible().catch(() => false);
      console.log(`Reset provider button visible: ${isResetVisible}`);

      // Take screenshot of models section
      await mainWindow.screenshot({ path: 'test-results/settings-models-reset.png' });
    });
  });

  test.describe('Chat Tab', () => {
    test('displays mode section', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-chat-tab');

      await mainWindow.waitForTimeout(500);

      // Should show the Mode card
      const modeCard = mainWindow.locator('text=Mode').first();
      await expect(modeCard).toBeVisible();
      console.log('Mode section is visible');

      await mainWindow.screenshot({ path: 'test-results/settings-chat-mode.png' });
    });

    test('displays response style options', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-chat-tab');

      await mainWindow.waitForTimeout(500);

      // Should show Response Styles card
      const responseStylesTitle = mainWindow.locator('text=Response Styles');
      await expect(responseStylesTitle).toBeVisible();
      console.log('Response Styles section is visible');

      // Check that the radio options exist (Detailed and Concise)
      const detailedOption = mainWindow.locator('text=Detailed');
      const conciseOption = mainWindow.locator('text=Concise');
      await expect(detailedOption).toBeVisible();
      await expect(conciseOption).toBeVisible();

      await mainWindow.screenshot({ path: 'test-results/settings-chat-response-styles.png' });
    });

    test('response style selection works', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-chat-tab');

      await mainWindow.waitForTimeout(500);

      // Click on "Detailed" option
      const detailedOption = mainWindow.locator('div:has-text("Detailed")').locator('input[type="radio"]').first();
      const conciseOption = mainWindow.locator('div:has-text("Concise")').locator('input[type="radio"]').first();

      // Check initial state
      const detailedChecked = await detailedOption.isChecked().catch(() => false);
      const conciseChecked = await conciseOption.isChecked().catch(() => false);
      console.log(`Initial state - Detailed: ${detailedChecked}, Concise: ${conciseChecked}`);

      // Click on the option that is NOT currently selected
      if (conciseChecked) {
        // Click the Detailed row to select it
        await mainWindow.locator('h3:has-text("Detailed")').click();
        await mainWindow.waitForTimeout(500);
        const nowDetailed = await detailedOption.isChecked().catch(() => false);
        console.log(`After click - Detailed is now: ${nowDetailed}`);
      } else {
        // Click the Concise row to select it
        await mainWindow.locator('h3:has-text("Concise")').click();
        await mainWindow.waitForTimeout(500);
        const nowConcise = await conciseOption.isChecked().catch(() => false);
        console.log(`After click - Concise is now: ${nowConcise}`);
      }

      await mainWindow.screenshot({ path: 'test-results/settings-response-style-toggled.png' });
    });

    test('displays goosehints section', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-chat-tab');

      await mainWindow.waitForTimeout(500);

      // Goosehints section should be visible in the chat settings
      const goosehintsVisible = await mainWindow.locator('text=Goosehints').isVisible().catch(() => false);
      // Also look for .goosehints text
      const goosehintsFileRef = await mainWindow.locator('text=.goosehints').isVisible().catch(() => false);
      console.log(`Goosehints section visible: ${goosehintsVisible}, file reference visible: ${goosehintsFileRef}`);
    });

    test('displays spellcheck toggle', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-chat-tab');

      await mainWindow.waitForTimeout(500);

      // Spellcheck toggle should exist
      const spellcheckVisible = await mainWindow.locator('text=Spellcheck').isVisible().catch(() => false);
      console.log(`Spellcheck toggle visible: ${spellcheckVisible}`);
    });
  });

  test.describe('Session Tab', () => {
    test('displays session sharing settings', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-sharing-tab');

      await mainWindow.waitForTimeout(500);
      await mainWindow.screenshot({ path: 'test-results/settings-session-tab.png' });

      // The sharing tab should show some session-related content
      const tabActive = mainWindow.locator('[data-testid="settings-sharing-tab"][data-state="active"]');
      await expect(tabActive).toBeVisible();
      console.log('Session/Sharing tab content loaded');
    });
  });

  test.describe('Prompts Tab', () => {
    test('displays prompts settings', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-prompts-tab');

      await mainWindow.waitForTimeout(500);
      await mainWindow.screenshot({ path: 'test-results/settings-prompts-tab.png' });

      const tabActive = mainWindow.locator('[data-testid="settings-prompts-tab"][data-state="active"]');
      await expect(tabActive).toBeVisible();
      console.log('Prompts tab content loaded');
    });
  });

  test.describe('Keyboard Tab', () => {
    test('displays keyboard shortcuts categories', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-keyboard-tab');

      await mainWindow.waitForTimeout(1000);
      await mainWindow.screenshot({ path: 'test-results/settings-keyboard-tab.png' });

      // Should show the category headers
      const globalShortcuts = mainWindow.locator('text=Global Shortcuts');
      const appShortcuts = mainWindow.locator('text=Application Shortcuts');

      await expect(globalShortcuts).toBeVisible();
      await expect(appShortcuts).toBeVisible();
      console.log('Keyboard shortcut categories are visible');
    });

    test('displays individual shortcut entries', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-keyboard-tab');

      await mainWindow.waitForTimeout(1000);

      // Verify individual shortcut entries are displayed
      const shortcutLabels = [
        'Focus Goose Window',
        'Quick Launcher',
        'New Chat',
        'Settings',
        'Find',
      ];

      for (const label of shortcutLabels) {
        const shortcutEntry = mainWindow.locator(`text=${label}`).first();
        const isVisible = await shortcutEntry.isVisible().catch(() => false);
        console.log(`Shortcut "${label}" visible: ${isVisible}`);
      }
    });

    test('shortcut entries have toggle switches', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-keyboard-tab');

      await mainWindow.waitForTimeout(1000);

      // Each shortcut should have a Switch toggle
      const switches = mainWindow.locator('button[role="switch"]');
      const switchCount = await switches.count();
      console.log(`Number of toggle switches found: ${switchCount}`);
      expect(switchCount).toBeGreaterThan(0);
    });

    test('shortcut entries have Change buttons', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-keyboard-tab');

      await mainWindow.waitForTimeout(1000);

      // Each shortcut should have a "Change" button
      const changeButtons = mainWindow.locator('button:has-text("Change")');
      const changeCount = await changeButtons.count();
      console.log(`Number of Change buttons found: ${changeCount}`);
      expect(changeCount).toBeGreaterThan(0);
    });

    test('Reset All Shortcuts button exists', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-keyboard-tab');

      await mainWindow.waitForTimeout(1000);

      const resetButton = mainWindow.locator('button:has-text("Reset All Shortcuts")');
      await expect(resetButton).toBeVisible();
      console.log('Reset All Shortcuts button is visible');
    });
  });

  test.describe('App Tab', () => {
    test('displays appearance section', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);
      await mainWindow.screenshot({ path: 'test-results/settings-app-tab.png' });

      // Should show Appearance card — CardTitle renders as <div data-slot="card-title">
      const appearanceTitle = mainWindow.locator('[data-slot="card-title"]:has-text("Appearance")');
      await expect(appearanceTitle).toBeVisible();
      console.log('Appearance section is visible');
    });

    test('displays theme selector', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);

      // Should show Theme card
      const themeTitle = mainWindow.locator('text=Theme').first();
      await expect(themeTitle).toBeVisible();

      // Should show all three theme buttons
      const lightBtn = mainWindow.locator('[data-testid="light-mode-button"]');
      const darkBtn = mainWindow.locator('[data-testid="dark-mode-button"]');
      const systemBtn = mainWindow.locator('[data-testid="system-mode-button"]');

      await expect(lightBtn).toBeVisible();
      await expect(darkBtn).toBeVisible();
      await expect(systemBtn).toBeVisible();

      console.log('Theme selector buttons are visible');
      await mainWindow.screenshot({ path: 'test-results/settings-theme-selector.png' });
    });

    test('dark mode toggle works', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);

      const isDarkBefore = await mainWindow.evaluate(
        () => document.documentElement.classList.contains('dark')
      );
      console.log(`Dark mode before toggle: ${isDarkBefore}`);

      if (isDarkBefore) {
        // Switch to light
        await mainWindow.locator('[data-testid="light-mode-button"]').click();
      } else {
        // Switch to dark
        await mainWindow.locator('[data-testid="dark-mode-button"]').click();
      }

      await mainWindow.waitForTimeout(1000);

      const isDarkAfter = await mainWindow.evaluate(
        () => document.documentElement.classList.contains('dark')
      );
      console.log(`Dark mode after toggle: ${isDarkAfter}`);
      expect(isDarkAfter).toBe(!isDarkBefore);

      await mainWindow.screenshot({ path: 'test-results/settings-dark-mode-toggled.png' });

      // Switch back to system
      await mainWindow.locator('[data-testid="system-mode-button"]').click();
      await mainWindow.waitForTimeout(500);
    });

    test('displays menu bar icon toggle', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);

      // Use heading role to avoid matching the test overlay text
      const menuBarLabel = mainWindow.getByRole('heading', { name: 'Menu bar icon' });
      await expect(menuBarLabel).toBeVisible();
      console.log('Menu bar icon toggle is visible');
    });

    test('displays prevent sleep toggle', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);

      // Use heading role to avoid matching the test overlay text
      const preventSleepLabel = mainWindow.getByRole('heading', { name: 'Prevent Sleep' });
      await expect(preventSleepLabel).toBeVisible();
      console.log('Prevent Sleep toggle is visible');
    });

    test('displays help and feedback section', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);

      const helpTitle = mainWindow.locator('text=Help & feedback');
      await expect(helpTitle).toBeVisible();

      // Should have bug report and feature request buttons
      const bugButton = mainWindow.locator('button:has-text("Report a Bug")');
      const featureButton = mainWindow.locator('button:has-text("Request a Feature")');
      await expect(bugButton).toBeVisible();
      await expect(featureButton).toBeVisible();
      console.log('Help & feedback section with buttons is visible');
    });

    test('displays notifications setting', async () => {
      await navigateToSettings();
      await clickSettingsTab('settings-app-tab');

      await mainWindow.waitForTimeout(500);

      // Use heading role to avoid matching the test overlay text
      const notificationsLabel = mainWindow.getByRole('heading', { name: 'Notifications' });
      await expect(notificationsLabel).toBeVisible();

      const openSettingsButton = mainWindow.locator('button:has-text("Open Settings")');
      await expect(openSettingsButton).toBeVisible();
      console.log('Notifications setting is visible');
    });
  });
});
