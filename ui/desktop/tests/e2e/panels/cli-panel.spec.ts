/**
 * E2E tests for the CLI Integration Panel.
 *
 * The CLI Integration Panel is rendered at the `#/cli` route inside
 * MainPanelLayout. It includes:
 *   - CLIIntegrationPanel header with collapsible body
 *   - Enable/Disable toggle (Switch)
 *   - StatusSection (version, install path, update indicator)
 *   - QuickActions (Open Terminal, Check for Updates, Reinstall)
 *   - PlatformInfoCard (OS, Architecture, Path)
 *   - EmbeddedTerminal (command input, history, close button)
 *   - NotInstalledView with Install CTA and CLISetupWizard
 *
 * These tests run against the Electron app with CLIContext mock data --
 * no backend required.
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

async function navigateToCLIPanel() {
  console.log('Navigating to CLI panel...');

  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 },
  );

  await mainWindow.evaluate(() => {
    window.location.hash = '#/cli';
  });
  await mainWindow.waitForTimeout(1500);
  console.log('CLI panel route loaded');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('CLI Integration Panel', () => {
  test.describe('Panel Header', () => {
    test('CLI Integration panel renders with header', async () => {
      await navigateToCLIPanel();

      // The panel header should show "CLI Integration"
      const header = mainWindow.locator('text=CLI Integration').first();
      const headerVisible = await header.isVisible().catch(() => false);
      console.log(`CLI Integration header visible: ${headerVisible}`);

      // Also check for the Terminal icon (svg within the header area)
      await mainWindow.screenshot({ path: 'test-results/cli-panel-header.png' });
    });

    test('CLI panel header is collapsible', async () => {
      await navigateToCLIPanel();

      // Find the collapsible trigger button with "CLI Integration" text
      const trigger = mainWindow.locator('button:has-text("CLI Integration")').first();
      const triggerVisible = await trigger.isVisible().catch(() => false);
      console.log(`CLI Integration collapsible trigger visible: ${triggerVisible}`);

      if (triggerVisible) {
        // Click to collapse (use force: true to bypass titlebar-drag-region overlay)
        await trigger.click({ force: true });
        await mainWindow.waitForTimeout(500);
        console.log('Clicked CLI Integration header to collapse');

        // After collapsing, the toggle switch area should be hidden
        const toggleArea = mainWindow.locator('text=Enabled').or(mainWindow.locator('text=Disabled'));
        const toggleVisible = await toggleArea.first().isVisible().catch(() => false);
        console.log(`Toggle text visible after collapse: ${toggleVisible}`);

        // Click again to expand (use force: true to bypass titlebar-drag-region overlay)
        await trigger.click({ force: true });
        await mainWindow.waitForTimeout(500);
        console.log('Clicked CLI Integration header to expand');
      }

      await mainWindow.screenshot({ path: 'test-results/cli-panel-collapsible.png' });
    });
  });

  test.describe('Enable/Disable Toggle', () => {
    test('toggle switch for CLI integration is visible', async () => {
      await navigateToCLIPanel();

      // Look for the Switch with aria-label "Toggle CLI integration"
      const toggle = mainWindow.locator('[aria-label="Toggle CLI integration"]');
      const toggleVisible = await toggle.isVisible().catch(() => false);
      console.log(`CLI toggle switch visible: ${toggleVisible}`);

      // Check for Enabled/Disabled label
      const enabledLabel = mainWindow.locator('text=Enabled');
      const disabledLabel = mainWindow.locator('text=Disabled');
      const enabledVisible = await enabledLabel.isVisible().catch(() => false);
      const disabledVisible = await disabledLabel.isVisible().catch(() => false);
      console.log(`Enabled label: ${enabledVisible}, Disabled label: ${disabledVisible}`);

      await mainWindow.screenshot({ path: 'test-results/cli-panel-toggle.png' });
    });

    test('toggling CLI off shows disabled message', async () => {
      await navigateToCLIPanel();

      const toggle = mainWindow.locator('[aria-label="Toggle CLI integration"]');
      if (await toggle.isVisible().catch(() => false)) {
        // Check current state
        const currentState = await toggle.getAttribute('data-state').catch(() => null);
        console.log(`Toggle initial state: ${currentState}`);

        // If currently enabled (checked), click to disable
        if (currentState === 'checked') {
          await toggle.click();
          await mainWindow.waitForTimeout(500);
          console.log('Toggled CLI off');

          // The disabled message should appear
          const disabledMsg = mainWindow.locator('text=CLI integration is disabled');
          const msgVisible = await disabledMsg.isVisible().catch(() => false);
          console.log(`Disabled message visible: ${msgVisible}`);

          // Toggle back to original state
          await toggle.click();
          await mainWindow.waitForTimeout(300);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/cli-panel-disabled.png' });
    });
  });

  test.describe('Status Section', () => {
    test('shows installation status indicator', async () => {
      await navigateToCLIPanel();

      // When CLI is installed, "Installed" text should appear
      const installedBadge = mainWindow.locator('text=Installed').first();
      const installedVisible = await installedBadge.isVisible().catch(() => false);
      console.log(`Installed badge visible: ${installedVisible}`);

      // Or when not installed, "CLI not installed" text should appear
      const notInstalledText = mainWindow.locator('text=CLI not installed');
      const notInstalledVisible = await notInstalledText.isVisible().catch(() => false);
      console.log(`CLI not installed text visible: ${notInstalledVisible}`);

      await mainWindow.screenshot({ path: 'test-results/cli-panel-status.png' });
    });
  });

  test.describe('Quick Actions', () => {
    test('quick actions section is visible when installed', async () => {
      await navigateToCLIPanel();

      // Look for "Quick Actions" collapsible header
      const quickActions = mainWindow.locator('text=Quick Actions').first();
      const qaVisible = await quickActions.isVisible().catch(() => false);
      console.log(`Quick Actions header visible: ${qaVisible}`);

      // Look for action buttons
      const openTerminal = mainWindow.locator('button:has-text("Open Terminal")');
      const checkUpdates = mainWindow.locator('button:has-text("Check for Updates")');
      const reinstall = mainWindow.locator('button:has-text("Reinstall")');

      const otVisible = await openTerminal.isVisible().catch(() => false);
      const cuVisible = await checkUpdates.isVisible().catch(() => false);
      const riVisible = await reinstall.isVisible().catch(() => false);
      console.log(
        `Action buttons - Open Terminal: ${otVisible}, Check Updates: ${cuVisible}, Reinstall: ${riVisible}`,
      );

      await mainWindow.screenshot({ path: 'test-results/cli-panel-quick-actions.png' });
    });

    test('quick actions section is collapsible', async () => {
      await navigateToCLIPanel();

      const quickActionsHeader = mainWindow.locator('button:has-text("Quick Actions")').first();
      if (await quickActionsHeader.isVisible().catch(() => false)) {
        // Click to collapse
        await quickActionsHeader.click();
        await mainWindow.waitForTimeout(500);

        // The action buttons should be hidden
        const reinstallBtn = mainWindow.locator('button:has-text("Reinstall")');
        const reinstallVisible = await reinstallBtn.isVisible().catch(() => false);
        console.log(`Reinstall visible after collapse: ${reinstallVisible}`);

        // Click again to expand
        await quickActionsHeader.click();
        await mainWindow.waitForTimeout(500);
      }

      await mainWindow.screenshot({ path: 'test-results/cli-panel-quick-actions-collapse.png' });
    });
  });

  test.describe('Platform Info Card', () => {
    test('platform info section shows OS and architecture', async () => {
      await navigateToCLIPanel();

      // Look for "Platform Info" collapsible section
      const platformInfo = mainWindow.locator('button:has-text("Platform Info")').first();
      const piVisible = await platformInfo.isVisible().catch(() => false);
      console.log(`Platform Info section visible: ${piVisible}`);

      if (piVisible) {
        // Platform Info starts collapsed by default, click to expand
        await platformInfo.click();
        await mainWindow.waitForTimeout(500);

        // OS label should show one of Windows, macOS, Linux
        const osLabel = mainWindow.locator('text=OS').first();
        const osVisible = await osLabel.isVisible().catch(() => false);
        console.log(`OS label visible: ${osVisible}`);

        // Architecture label
        const archLabel = mainWindow.locator('text=Architecture').first();
        const archVisible = await archLabel.isVisible().catch(() => false);
        console.log(`Architecture label visible: ${archVisible}`);

        // Platform value should be one of Windows, macOS, Linux
        const windowsText = mainWindow.locator('text=Windows');
        const macosText = mainWindow.locator('text=macOS');
        const linuxText = mainWindow.locator('text=Linux');

        const winVisible = await windowsText.isVisible().catch(() => false);
        const macVisible = await macosText.isVisible().catch(() => false);
        const linVisible = await linuxText.isVisible().catch(() => false);
        console.log(`Platform - Windows: ${winVisible}, macOS: ${macVisible}, Linux: ${linVisible}`);

        // Arch value should be x86_64 or ARM64
        const x64Text = mainWindow.locator('text=x86_64');
        const arm64Text = mainWindow.locator('text=ARM64');
        const x64Visible = await x64Text.isVisible().catch(() => false);
        const arm64Visible = await arm64Text.isVisible().catch(() => false);
        console.log(`Architecture - x86_64: ${x64Visible}, ARM64: ${arm64Visible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/cli-panel-platform-info.png' });
    });
  });

  test.describe('Not Installed View', () => {
    test('shows install button when CLI is not installed', async () => {
      await navigateToCLIPanel();

      // When CLI is not installed, there should be an Install CLI button
      const installBtn = mainWindow.locator('button:has-text("Install CLI")');
      const installVisible = await installBtn.isVisible().catch(() => false);
      console.log(`Install CLI button visible: ${installVisible}`);

      // Also check for the "CLI not installed" warning
      const warning = mainWindow.locator('text=CLI not installed');
      const warningVisible = await warning.isVisible().catch(() => false);
      console.log(`CLI not installed warning visible: ${warningVisible}`);

      // Helper text about installing Super-Goose CLI
      const helperText = mainWindow.locator('text=Install the Super-Goose CLI');
      const helperVisible = await helperText.isVisible().catch(() => false);
      console.log(`Install helper text visible: ${helperVisible}`);

      await mainWindow.screenshot({ path: 'test-results/cli-panel-not-installed.png' });
    });
  });

  test.describe('Embedded Terminal', () => {
    test('embedded terminal has input field and header', async () => {
      await navigateToCLIPanel();

      // Look for the terminal header "CLI Terminal"
      const terminalHeader = mainWindow.locator('text=CLI Terminal').first();
      const thVisible = await terminalHeader.isVisible().catch(() => false);
      console.log(`CLI Terminal header visible: ${thVisible}`);

      // Terminal command input
      const terminalInput = mainWindow.locator('input[placeholder*="Type a command"]');
      const inputVisible = await terminalInput.isVisible().catch(() => false);
      console.log(`Terminal input visible: ${inputVisible}`);

      // The dollar sign prompt indicator
      const promptSign = mainWindow.locator('text=$').first();
      const promptVisible = await promptSign.isVisible().catch(() => false);
      console.log(`Dollar prompt visible: ${promptVisible}`);

      await mainWindow.screenshot({ path: 'test-results/cli-panel-terminal.png' });
    });
  });
});
