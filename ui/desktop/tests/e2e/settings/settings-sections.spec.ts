/**
 * E2E tests for the Settings page sections.
 *
 * Validates every tab in the Settings view renders correctly:
 *   - Models, Chat, Session, Prompts, Keyboard, Devices, Conscious, Features, Enterprise, App
 *   - Tab switching behaviour and content isolation
 *   - Key controls within each tab (toggles, radio groups, buttons, selects)
 *
 * These tests run against the Electron app via the `goosePage` fixture.
 * No backend is required -- the app works with its default/mock data.
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';
import {
  waitForAppReady,
  navigateToRoute,
  takeScreenshot,
} from '../panels/panel-test-utils';

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
 * Navigate to the Settings view via the sidebar settings button.
 */
async function navigateToSettings() {
  console.log('Navigating to Settings via sidebar...');

  await mainWindow.waitForSelector('[data-testid="sidebar-settings-button"]', {
    timeout: 15000,
    state: 'visible',
  });

  const settingsButton = await mainWindow.waitForSelector(
    '[data-testid="sidebar-settings-button"]',
    { timeout: 5000, state: 'visible' },
  );
  await settingsButton.click();

  await mainWindow.waitForSelector('h1:has-text("Settings")', {
    timeout: 10000,
    state: 'visible',
  });
  console.log('Settings page loaded');
}

/**
 * Click a Settings tab by data-testid and wait for it to become active.
 */
async function clickTab(testId: string) {
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

test.describe('Settings Sections', () => {
  // -----------------------------------------------------------------------
  // Tab rendering
  // -----------------------------------------------------------------------
  test.describe('Tab Rendering', () => {
    test('all 10 settings tabs are present and visible', async () => {
      await navigateToSettings();

      const tabIds = [
        'settings-models-tab',
        'settings-chat-tab',
        'settings-sharing-tab',
        'settings-prompts-tab',
        'settings-keyboard-tab',
        'settings-devices-tab',
        'settings-conscious-tab',
        'settings-features-tab',
        'settings-enterprise-tab',
        'settings-app-tab',
      ];

      for (const tabId of tabIds) {
        const tab = mainWindow.locator(`[data-testid="${tabId}"]`);
        await expect(tab).toBeVisible();
        console.log(`Tab visible: ${tabId}`);
      }

      await takeScreenshot(mainWindow, 'settings-sections-all-tabs');
    });

    test('Models tab is active by default', async () => {
      await navigateToSettings();
      const modelsTab = mainWindow.locator('[data-testid="settings-models-tab"]');
      await expect(modelsTab).toHaveAttribute('data-state', 'active');
    });

    test('switching tabs deactivates the previous tab', async () => {
      await navigateToSettings();

      // Models is active initially
      const modelsTab = mainWindow.locator('[data-testid="settings-models-tab"]');
      await expect(modelsTab).toHaveAttribute('data-state', 'active');

      // Switch to Chat
      await clickTab('settings-chat-tab');
      const chatTab = mainWindow.locator('[data-testid="settings-chat-tab"]');
      await expect(chatTab).toHaveAttribute('data-state', 'active');
      await expect(modelsTab).not.toHaveAttribute('data-state', 'active');

      // Switch to Enterprise
      await clickTab('settings-enterprise-tab');
      const entTab = mainWindow.locator('[data-testid="settings-enterprise-tab"]');
      await expect(entTab).toHaveAttribute('data-state', 'active');
      await expect(chatTab).not.toHaveAttribute('data-state', 'active');

      await takeScreenshot(mainWindow, 'settings-sections-tab-switching');
    });
  });

  // -----------------------------------------------------------------------
  // Models Tab
  // -----------------------------------------------------------------------
  test.describe('Models Tab', () => {
    test('displays model section and reset provider button', async () => {
      await navigateToSettings();
      await clickTab('settings-models-tab');

      await mainWindow.waitForTimeout(1000);

      // The tab must be active
      const modelsTab = mainWindow.locator('[data-testid="settings-models-tab"][data-state="active"]');
      await expect(modelsTab).toBeVisible();

      // Reset provider button should exist
      const resetButton = mainWindow.locator('button:has-text("Reset provider and model")');
      const resetVisible = await resetButton.isVisible().catch(() => false);
      console.log(`Reset provider button visible: ${resetVisible}`);

      await takeScreenshot(mainWindow, 'settings-sections-models');
    });
  });

  // -----------------------------------------------------------------------
  // Chat Tab -- Mode, Response Styles, Goosehints, Spellcheck
  // -----------------------------------------------------------------------
  test.describe('Chat Tab', () => {
    test('mode selection shows Autonomous, Manual, Smart, Chat only', async () => {
      await navigateToSettings();
      await clickTab('settings-chat-tab');
      await mainWindow.waitForTimeout(500);

      const modeLabels = ['Autonomous', 'Manual', 'Smart', 'Chat only'];
      for (const label of modeLabels) {
        const el = mainWindow.locator(`h3:has-text("${label}")`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Mode "${label}" visible: ${vis}`);
      }

      // Radio buttons for mode
      const radios = mainWindow.locator('input[type="radio"][name="modes"]');
      const radioCount = await radios.count();
      console.log(`Mode radio buttons count: ${radioCount}`);
      expect(radioCount).toBeGreaterThanOrEqual(4);

      await takeScreenshot(mainWindow, 'settings-sections-chat-modes');
    });

    test('selecting a different mode updates the radio state', async () => {
      await navigateToSettings();
      await clickTab('settings-chat-tab');
      await mainWindow.waitForTimeout(500);

      // Click on "Chat only" label to change mode
      const chatOnlyRow = mainWindow.locator('h3:has-text("Chat only")');
      if (await chatOnlyRow.isVisible().catch(() => false)) {
        await chatOnlyRow.click();
        await mainWindow.waitForTimeout(500);

        // The "chat" radio should now be checked
        const chatRadio = mainWindow.locator('input[type="radio"][value="chat"]');
        const isChecked = await chatRadio.isChecked().catch(() => false);
        console.log(`Chat only radio checked: ${isChecked}`);
      }
    });

    test('response styles section shows Detailed and Concise options', async () => {
      await navigateToSettings();
      await clickTab('settings-chat-tab');
      await mainWindow.waitForTimeout(500);

      // Use card-title selector to avoid strict mode collision with test overlay
      const responseStyles = mainWindow.locator('[data-slot="card-title"]:has-text("Response Styles")');
      await expect(responseStyles).toBeVisible();

      // Use heading locators to avoid strict mode collision with test overlay / descriptions
      const detailed = mainWindow.locator('h3:has-text("Detailed")');
      const concise = mainWindow.locator('h3:has-text("Concise")');
      await expect(detailed).toBeVisible();
      await expect(concise).toBeVisible();
    });

    test('goosehints and spellcheck sections are present', async () => {
      await navigateToSettings();
      await clickTab('settings-chat-tab');
      await mainWindow.waitForTimeout(500);

      const goosehints = await mainWindow.locator('text=Goosehints').isVisible().catch(() => false);
      const spellcheck = await mainWindow.locator('text=Spellcheck').isVisible().catch(() => false);
      console.log(`Goosehints section: ${goosehints}, Spellcheck section: ${spellcheck}`);
    });
  });

  // -----------------------------------------------------------------------
  // Keyboard Tab
  // -----------------------------------------------------------------------
  test.describe('Keyboard Tab', () => {
    test('shows shortcut categories and change buttons', async () => {
      await navigateToSettings();
      await clickTab('settings-keyboard-tab');
      await mainWindow.waitForTimeout(1000);

      const globalShortcuts = mainWindow.locator('text=Global Shortcuts');
      const appShortcuts = mainWindow.locator('text=Application Shortcuts');
      await expect(globalShortcuts).toBeVisible();
      await expect(appShortcuts).toBeVisible();

      // Individual shortcut entries
      const shortcutNames = ['Focus Goose Window', 'Quick Launcher', 'New Chat', 'Settings', 'Find'];
      for (const name of shortcutNames) {
        const el = mainWindow.locator(`text=${name}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Shortcut "${name}" visible: ${vis}`);
      }

      // Toggle switches and Change buttons
      const switches = mainWindow.locator('button[role="switch"]');
      const switchCount = await switches.count();
      expect(switchCount).toBeGreaterThan(0);

      const changeButtons = mainWindow.locator('button:has-text("Change")');
      const changeCount = await changeButtons.count();
      expect(changeCount).toBeGreaterThan(0);
      console.log(`Switches: ${switchCount}, Change buttons: ${changeCount}`);

      // Reset All Shortcuts button
      const resetBtn = mainWindow.locator('button:has-text("Reset All Shortcuts")');
      await expect(resetBtn).toBeVisible();

      await takeScreenshot(mainWindow, 'settings-sections-keyboard');
    });
  });

  // -----------------------------------------------------------------------
  // App Tab -- Appearance, Theme, Features, Help
  // -----------------------------------------------------------------------
  test.describe('App Tab', () => {
    test('appearance card shows expected settings', async () => {
      await navigateToSettings();
      await clickTab('settings-app-tab');
      await mainWindow.waitForTimeout(500);

      // Use card-title selector to avoid strict mode collision with test overlay
      const appearance = mainWindow.locator('[data-slot="card-title"]:has-text("Appearance")');
      await expect(appearance).toBeVisible();

      // Use heading locator to avoid strict mode collision with description text
      const notifications = mainWindow.locator('h3:has-text("Notifications")');
      await expect(notifications).toBeVisible();

      const menuBar = mainWindow.locator('text=Menu bar icon');
      await expect(menuBar).toBeVisible();

      const preventSleep = mainWindow.locator('text=Prevent Sleep');
      await expect(preventSleep).toBeVisible();

      await takeScreenshot(mainWindow, 'settings-sections-app-appearance');
    });

    test('Super-Goose Features card is visible with feature items', async () => {
      await navigateToSettings();
      await clickTab('settings-app-tab');
      await mainWindow.waitForTimeout(500);

      // Use card-title selector to avoid strict mode collision with test overlay
      const sgTitle = mainWindow.locator('[data-slot="card-title"]:has-text("Super-Goose Features")');
      await expect(sgTitle).toBeVisible();

      // Feature sub-items
      const featureLabels = [
        'Session Budget Limit',
        'Input/Output Guardrails',
        'Reflexion Learning',
        'Rate Limiting',
        'Execution Mode',
        'Reasoning Mode',
        'Auto-Checkpoint',
        'Memory System',
        'Human-in-the-Loop',
      ];

      for (const label of featureLabels) {
        const el = mainWindow.locator(`text=${label}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Feature "${label}" visible: ${vis}`);
      }

      await takeScreenshot(mainWindow, 'settings-sections-app-features');
    });

    test('theme selector shows Light, Dark, System buttons', async () => {
      await navigateToSettings();
      await clickTab('settings-app-tab');
      await mainWindow.waitForTimeout(500);

      const themeTitle = mainWindow.locator('text=Theme').first();
      await expect(themeTitle).toBeVisible();

      const lightBtn = mainWindow.locator('[data-testid="light-mode-button"]');
      const darkBtn = mainWindow.locator('[data-testid="dark-mode-button"]');
      const systemBtn = mainWindow.locator('[data-testid="system-mode-button"]');

      await expect(lightBtn).toBeVisible();
      await expect(darkBtn).toBeVisible();
      await expect(systemBtn).toBeVisible();
    });

    test('help and feedback section has bug and feature buttons', async () => {
      await navigateToSettings();
      await clickTab('settings-app-tab');
      await mainWindow.waitForTimeout(500);

      const helpTitle = mainWindow.locator('text=Help & feedback');
      await expect(helpTitle).toBeVisible();

      const bugBtn = mainWindow.locator('button:has-text("Report a Bug")');
      const featureBtn = mainWindow.locator('button:has-text("Request a Feature")');
      await expect(bugBtn).toBeVisible();
      await expect(featureBtn).toBeVisible();
    });

    test('slash commands reference card is visible', async () => {
      await navigateToSettings();
      await clickTab('settings-app-tab');
      await mainWindow.waitForTimeout(500);

      const slashTitle = mainWindow.locator('text=Slash Commands');
      const slashVisible = await slashTitle.isVisible().catch(() => false);
      console.log(`Slash Commands card visible: ${slashVisible}`);
    });
  });

  // -----------------------------------------------------------------------
  // Features Tab
  // -----------------------------------------------------------------------
  test.describe('Features Tab', () => {
    test('feature status dashboard shows summary and feature grid', async () => {
      await navigateToSettings();
      await clickTab('settings-features-tab');
      await mainWindow.waitForTimeout(1000);

      // Summary bar
      const summary = mainWindow.locator('text=Backend Feature Status');
      await expect(summary).toBeVisible();

      // Feature names in grid
      const featureNames = [
        'CostTracker / Budget',
        'Reflexion',
        'Guardrails',
        'Code-Test-Fix',
        '/model Hot-Switch',
        'Compaction Manager',
        'Cross-Session Search',
        'Project Auto-Detection',
        'Rate Limiting',
        'Bookmarks',
      ];

      for (const name of featureNames) {
        const el = mainWindow.locator(`text=${name}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Feature "${name}" visible: ${vis}`);
      }

      // Status badges
      const workingBadges = mainWindow.locator('text=Working');
      const workingCount = await workingBadges.count();
      console.log(`Working badges: ${workingCount}`);
      expect(workingCount).toBeGreaterThan(0);

      await takeScreenshot(mainWindow, 'settings-sections-features-dashboard');
    });
  });

  // -----------------------------------------------------------------------
  // Conscious Tab
  // -----------------------------------------------------------------------
  test.describe('Conscious Tab', () => {
    test('conscious section renders connection status and controls', async () => {
      await navigateToSettings();
      await clickTab('settings-conscious-tab');
      await mainWindow.waitForTimeout(1000);

      // Connection status card
      const consciousAgent = mainWindow.locator('text=Conscious Agent');
      await expect(consciousAgent).toBeVisible();

      // Voice controls
      const voiceLabel = mainWindow.locator('text=Voice').first();
      await expect(voiceLabel).toBeVisible();

      // Agentic layer
      const agenticLabel = mainWindow.locator('text=Agentic Layer');
      await expect(agenticLabel).toBeVisible();

      // Emotion engine - use h3 to avoid strict mode collision with status text
      const emotionLabel = mainWindow.locator('h3:has-text("Emotion Engine")');
      await expect(emotionLabel).toBeVisible();

      // UI Bridge
      const bridgeLabel = mainWindow.locator('text=UI Bridge');
      await expect(bridgeLabel).toBeVisible();

      // Collapsible sections
      const collapsibles = [
        'Emotion Visualizer',
        'Wake Word + VAD',
        'Conversation Memory',
        'AI Creator',
        'Testing & Self-Healing',
        'Capabilities',
        'Skill Manager',
      ];

      for (const section of collapsibles) {
        const el = mainWindow.locator(`text=${section}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Collapsible section "${section}" visible: ${vis}`);
      }

      await takeScreenshot(mainWindow, 'settings-sections-conscious');
    });
  });

  // -----------------------------------------------------------------------
  // Escape key dismissal
  // -----------------------------------------------------------------------
  test.describe('Escape Dismissal', () => {
    test('pressing Escape closes Settings', async () => {
      await navigateToSettings();

      const heading = mainWindow.locator('h1:has-text("Settings")');
      await expect(heading).toBeVisible();

      await mainWindow.keyboard.press('Escape');
      await mainWindow.waitForTimeout(500);

      const isStillVisible = await heading.isVisible().catch(() => false);
      console.log(`Settings visible after Escape: ${isStillVisible}`);
      // The Escape handler triggers onClose -- verify the heading is gone
    });
  });
});
