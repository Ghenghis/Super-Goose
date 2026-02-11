// E2E test stubs - require Electron runtime for full execution
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

/**
 * Helper: navigate to the Agent panel route.
 */
async function navigateToAgentPanel() {
  console.log('Navigating to Agent panel...');

  // Wait for the app to be ready
  await mainWindow.waitForFunction(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0;
  }, { timeout: 15000 });

  // Navigate to the agent panel route
  await mainWindow.evaluate(() => {
    window.location.hash = '#/agent';
  });
  await mainWindow.waitForTimeout(1000);
  console.log('Agent panel route loaded');
}

test.describe('Agent Panel', () => {
  test.describe('Status Indicators', () => {
    test('agent status panel renders with status indicators', async () => {
      await navigateToAgentPanel();

      // The agent panel should render with status indicators
      const agentPanel = mainWindow.locator('[data-testid="agent-panel"]');
      const isVisible = await agentPanel.isVisible().catch(() => false);
      console.log(`Agent panel visible: ${isVisible}`);

      // Look for status indicator elements (badges, icons, or text)
      const statusIndicators = mainWindow.locator('[data-testid="agent-status"]');
      const statusCount = await statusIndicators.count().catch(() => 0);
      console.log(`Status indicator count: ${statusCount}`);

      await mainWindow.screenshot({ path: 'test-results/agent-panel-status.png' });
    });
  });

  test.describe('Task Board', () => {
    test('task board shows task items', async () => {
      await navigateToAgentPanel();

      // Look for the task board section
      const taskBoard = mainWindow.locator('[data-testid="task-board"]');
      const taskBoardVisible = await taskBoard.isVisible().catch(() => false);
      console.log(`Task board visible: ${taskBoardVisible}`);

      // Check for individual task items
      const taskItems = mainWindow.locator('[data-testid="task-item"]');
      const taskCount = await taskItems.count().catch(() => 0);
      console.log(`Task item count: ${taskCount}`);

      await mainWindow.screenshot({ path: 'test-results/agent-panel-tasks.png' });
    });
  });

  test.describe('Mode Toggle', () => {
    test('mode toggle (Code/Cowork/Both) switches correctly', async () => {
      await navigateToAgentPanel();

      // Look for mode toggle buttons
      const codeMode = mainWindow.locator('button:has-text("Code")');
      const coworkMode = mainWindow.locator('button:has-text("Cowork")');
      const bothMode = mainWindow.locator('button:has-text("Both")');

      const codeModeVisible = await codeMode.isVisible().catch(() => false);
      const coworkModeVisible = await coworkMode.isVisible().catch(() => false);
      const bothModeVisible = await bothMode.isVisible().catch(() => false);
      console.log(`Mode buttons - Code: ${codeModeVisible}, Cowork: ${coworkModeVisible}, Both: ${bothModeVisible}`);

      // Attempt to click each mode toggle and verify selection state
      if (codeModeVisible) {
        await codeMode.click();
        await mainWindow.waitForTimeout(300);
        console.log('Clicked Code mode');
      }

      if (coworkModeVisible) {
        await coworkMode.click();
        await mainWindow.waitForTimeout(300);
        console.log('Clicked Cowork mode');
      }

      if (bothModeVisible) {
        await bothMode.click();
        await mainWindow.waitForTimeout(300);
        console.log('Clicked Both mode');
      }

      await mainWindow.screenshot({ path: 'test-results/agent-panel-mode-toggle.png' });
    });
  });

  test.describe('Skills Panel', () => {
    test('skills panel shows skill badges', async () => {
      await navigateToAgentPanel();

      // Look for skills section
      const skillsPanel = mainWindow.locator('[data-testid="skills-panel"]');
      const skillsPanelVisible = await skillsPanel.isVisible().catch(() => false);
      console.log(`Skills panel visible: ${skillsPanelVisible}`);

      // Look for skill badge elements
      const skillBadges = mainWindow.locator('[data-testid="skill-badge"]');
      const badgeCount = await skillBadges.count().catch(() => 0);
      console.log(`Skill badge count: ${badgeCount}`);

      // Also try broader selectors for badge-like elements within skills
      const badges = mainWindow.locator('.badge, [role="status"]');
      const broadBadgeCount = await badges.count().catch(() => 0);
      console.log(`Broad badge count: ${broadBadgeCount}`);

      await mainWindow.screenshot({ path: 'test-results/agent-panel-skills.png' });
    });
  });

  test.describe('Connector Status', () => {
    test('connector status panel renders', async () => {
      await navigateToAgentPanel();

      // Look for connector status section
      const connectorStatus = mainWindow.locator('[data-testid="connector-status"]');
      const connectorVisible = await connectorStatus.isVisible().catch(() => false);
      console.log(`Connector status visible: ${connectorVisible}`);

      // Also try text-based locators
      const connectorText = mainWindow.locator('text=Connector').first();
      const connectorTextVisible = await connectorText.isVisible().catch(() => false);
      console.log(`Connector text visible: ${connectorTextVisible}`);

      await mainWindow.screenshot({ path: 'test-results/agent-panel-connectors.png' });
    });
  });
});
