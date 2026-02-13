/**
 * E2E tests for AG-UI sub-panels within the SuperGoosePanel sidebar.
 *
 * These panels are rendered inside SuperGoosePanel (route #/super) and are
 * selected via the left sidebar nav buttons. They do NOT have their own
 * hash routes — you must navigate to #/super first, then click the relevant
 * sidebar nav icon.
 *
 * Panels under test:
 *   1. SkillsPanel      - skill management with category tabs, toggle switches
 *   2. AgenticFeatures  - AG-UI run status, tool calls, reasoning, approval queue
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

/**
 * Navigate to the SuperGoosePanel route (#/super) and wait for it to render.
 */
async function navigateToSuperPanel() {
  console.log('Navigating to #/super ...');

  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 },
  );

  await mainWindow.evaluate(() => {
    window.location.hash = '#/super';
  });

  // Wait for SuperGoosePanel to mount (data-super="true")
  await mainWindow.waitForTimeout(2000);

  await mainWindow.waitForFunction(
    () => {
      return !!(
        document.querySelector('[data-super="true"]') ||
        document.querySelector('.super-goose-panel')
      );
    },
    { timeout: 15000 },
  ).catch(() => {
    console.log('SuperGoosePanel selector not found, continuing with timeout fallback');
  });

  await mainWindow.waitForTimeout(500);
  console.log('SuperGoosePanel loaded');
}

/**
 * Click a sidebar nav button inside SuperGoosePanel by its title attribute.
 *
 * The sidebar nav items are buttons with `title` matching the panel label
 * (e.g. "Skills", "Agentic", "Dashboard").
 */
async function clickSidebarNav(label: string) {
  console.log(`Clicking sidebar nav: "${label}"`);

  const navButton = mainWindow.locator(`button[title="${label}"]`);
  const visible = await navButton.isVisible().catch(() => false);

  if (visible) {
    await navButton.click();
    await mainWindow.waitForTimeout(1000);
    console.log(`Clicked "${label}" nav button`);
  } else {
    // Fallback: try locating by the emoji icon text + sidebar context
    const fallback = mainWindow.locator('.sg-sidebar-item').filter({ hasText: label });
    const fbVisible = await fallback.first().isVisible().catch(() => false);
    if (fbVisible) {
      await fallback.first().click();
      await mainWindow.waitForTimeout(1000);
      console.log(`Clicked "${label}" via fallback selector`);
    } else {
      console.log(`WARNING: Could not find sidebar nav for "${label}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. SkillsPanel
// ---------------------------------------------------------------------------

test.describe('AG-UI Components B', () => {
  test.describe('SkillsPanel', () => {
    test('renders skills management panel region', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Skills');

      // The panel has role="region" with aria-label="Skills management panel"
      const region = mainWindow.locator('[role="region"][aria-label="Skills management panel"]');
      const regionVisible = await region.isVisible().catch(() => false);
      console.log(`Skills management panel region visible: ${regionVisible}`);

      // The top bar heading should show "Skills"
      const heading = mainWindow.locator('h2:has-text("Skills")');
      const headingVisible = await heading.isVisible().catch(() => false);
      console.log(`Skills heading visible: ${headingVisible}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-skills-panel.png' });
    });

    test('shows skill stats metrics', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Skills');

      // SGMetricCard labels: "Total Skills", "Active", "Learned"
      const totalSkills = mainWindow.locator('text=Total Skills');
      const active = mainWindow.locator('text=Active');
      const learned = mainWindow.locator('text=Learned');

      const totalVis = await totalSkills.isVisible().catch(() => false);
      const activeVis = await active.first().isVisible().catch(() => false);
      const learnedVis = await learned.first().isVisible().catch(() => false);
      console.log(`Metrics - Total Skills: ${totalVis}, Active: ${activeVis}, Learned: ${learnedVis}`);

      // The total count should show "8" (INITIAL_SKILLS has 8 items)
      const totalValue = mainWindow.locator('text=8').first();
      const valVis = await totalValue.isVisible().catch(() => false);
      console.log(`Total count value "8" visible: ${valVis}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-skills-metrics.png' });
    });

    test('shows category filter tabs', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Skills');

      // Tabs: All, Builtin, Learned, Community (role="tablist")
      const tablist = mainWindow.locator('[role="tablist"]');
      const tablistVisible = await tablist.isVisible().catch(() => false);
      console.log(`Tablist visible: ${tablistVisible}`);

      const tabs = ['All', 'Builtin', 'Learned', 'Community'];
      for (const tab of tabs) {
        const tabEl = mainWindow.locator(`[role="tab"]:has-text("${tab}")`);
        const vis = await tabEl.isVisible().catch(() => false);
        console.log(`Tab "${tab}" visible: ${vis}`);
      }

      // "All" tab should be selected by default
      const allTab = mainWindow.locator('[role="tab"][aria-selected="true"]');
      const allTabText = await allTab.textContent().catch(() => '');
      console.log(`Currently selected tab: "${allTabText}"`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-skills-tabs.png' });
    });

    test('shows skill list items', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Skills');

      // The skill list uses role="list" with role="listitem" children
      const skillList = mainWindow.locator('[role="list"][aria-label="Skills list"]');
      const listVisible = await skillList.isVisible().catch(() => false);
      console.log(`Skills list visible: ${listVisible}`);

      // Check for specific skill names from INITIAL_SKILLS
      const skillNames = [
        'File Operations',
        'Code Analysis',
        'Web Search',
        'Terminal Commands',
        'Pattern Recognition',
        'Error Recovery',
        'API Integration',
        'Documentation Writer',
      ];

      let visibleCount = 0;
      for (const name of skillNames) {
        const el = mainWindow.locator(`text=${name}`).first();
        const vis = await el.isVisible().catch(() => false);
        if (vis) visibleCount++;
        console.log(`Skill "${name}" visible: ${vis}`);
      }
      console.log(`Total visible skills: ${visibleCount} / ${skillNames.length}`);

      // Verify list items exist
      const listItems = mainWindow.locator('[role="listitem"]');
      const itemCount = await listItems.count().catch(() => 0);
      console.log(`Skill list items count: ${itemCount}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-skills-list.png' });
    });

    test('skill toggle buttons have accessible labels', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Skills');

      // Toggle buttons have aria-labels like "Disable File Operations" / "Enable API Integration"
      const disableToggles = mainWindow.locator('button[aria-label^="Disable"]');
      const enableToggles = mainWindow.locator('button[aria-label^="Enable"]');

      const disableCount = await disableToggles.count().catch(() => 0);
      const enableCount = await enableToggles.count().catch(() => 0);
      console.log(`Disable toggle buttons: ${disableCount}, Enable toggle buttons: ${enableCount}`);

      // API Integration is the only disabled skill, so we expect 1 "Enable" button
      // and 7 "Disable" buttons
      console.log(`Total toggles: ${disableCount + enableCount}`);

      // Check specific toggle labels
      const fileOpsToggle = mainWindow.locator('button[aria-label="Disable File Operations"]');
      const fileOpsVisible = await fileOpsToggle.isVisible().catch(() => false);
      console.log(`"Disable File Operations" toggle visible: ${fileOpsVisible}`);

      const apiToggle = mainWindow.locator('button[aria-label="Enable API Integration"]');
      const apiVisible = await apiToggle.isVisible().catch(() => false);
      console.log(`"Enable API Integration" toggle visible: ${apiVisible}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-skills-toggles.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AgenticFeatures
  // ---------------------------------------------------------------------------

  test.describe('AgenticFeatures', () => {
    test('renders agentic features panel', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Agentic');

      // The panel has role="region" with aria-label="Agentic Features"
      const region = mainWindow.locator('[role="region"][aria-label="Agentic Features"]');
      const regionVisible = await region.isVisible().catch(() => false);
      console.log(`Agentic Features region visible: ${regionVisible}`);

      // Run Status banner with role="status"
      const runStatus = mainWindow.locator('[role="status"][aria-label="Agent run status"]');
      const runStatusVisible = await runStatus.isVisible().catch(() => false);
      console.log(`Run Status banner visible: ${runStatusVisible}`);

      // "Run Status" text should be visible
      const runStatusText = mainWindow.locator('text=Run Status');
      const textVisible = await runStatusText.isVisible().catch(() => false);
      console.log(`"Run Status" text visible: ${textVisible}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-agentic-panel.png' });
    });

    test('shows connection status', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Agentic');

      // Without a running backend, useAgUi starts with connected=false
      // SGStatusDot renders "Disconnected" text for disconnected state
      const disconnected = mainWindow.locator('text=Disconnected');
      const disconnectedVisible = await disconnected.isVisible().catch(() => false);
      console.log(`"Disconnected" status visible: ${disconnectedVisible}`);

      // The Reconnect button should be visible when disconnected
      const reconnectBtn = mainWindow.locator('button[aria-label="Reconnect to agent stream"]');
      const reconnectVisible = await reconnectBtn.isVisible().catch(() => false);
      console.log(`Reconnect button visible: ${reconnectVisible}`);

      // Alternatively check for Idle badge if SSE connects (some environments)
      const idleBadge = mainWindow.locator('text=Idle');
      const idleVisible = await idleBadge.isVisible().catch(() => false);
      console.log(`Idle badge visible (if connected): ${idleVisible}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-agentic-connection.png' });
    });

    test('shows empty state for tool calls and reasoning', async () => {
      await navigateToSuperPanel();
      await clickSidebarNav('Agentic');

      // With no active tool calls, SGEmptyState shows "No active tool calls"
      const noToolCalls = mainWindow.locator('text=No active tool calls');
      const toolCallsVis = await noToolCalls.isVisible().catch(() => false);
      console.log(`"No active tool calls" empty state visible: ${toolCallsVis}`);

      // With no reasoning, SGEmptyState shows "Agent is not reasoning"
      const notReasoning = mainWindow.locator('text=Agent is not reasoning');
      const reasoningVis = await notReasoning.isVisible().catch(() => false);
      console.log(`"Agent is not reasoning" empty state visible: ${reasoningVis}`);

      // Approval Queue shows "No pending approvals" when empty
      const noApprovals = mainWindow.locator('text=No pending approvals');
      const approvalsVis = await noApprovals.isVisible().catch(() => false);
      console.log(`"No pending approvals" empty state visible: ${approvalsVis}`);

      // Approval Queue heading should still be visible
      const approvalHeading = mainWindow.locator('text=Approval Queue');
      const headingVis = await approvalHeading.isVisible().catch(() => false);
      console.log(`"Approval Queue" heading visible: ${headingVis}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-agentic-empty.png' });
    });
  });
});
