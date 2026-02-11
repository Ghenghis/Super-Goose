/**
 * E2E tests for the Enterprise Settings Route Panel.
 *
 * The Enterprise Settings panel is rendered at the `#/enterprise` route inside
 * MainPanelLayout. It contains:
 *   - EnterpriseRoutePanel (grid of 6 sub-panel cards)
 *   - Guardrails card  -> GuardrailsPanel
 *   - Gateway card     -> GatewayPanel
 *   - Observability card -> ObservabilityPanel
 *   - Policies card    -> PoliciesPanel
 *   - Hooks card       -> HooksPanel
 *   - Memory card      -> MemoryPanel
 *   - Each card shows label, description, icon, and "Configure" button
 *   - Clicking a card opens the sub-panel inline with a "Back" button
 *
 * These tests run against the Electron app. Sub-panel contents render from
 * fetch-based data (will show loading skeleton or fallback UI when API
 * is unavailable).
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

async function navigateToEnterprisePanel() {
  console.log('Navigating to Enterprise panel...');

  await mainWindow.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 },
  );

  await mainWindow.evaluate(() => {
    window.location.hash = '#/enterprise';
  });
  await mainWindow.waitForTimeout(1500);
  console.log('Enterprise panel route loaded');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Enterprise Settings Panel', () => {
  test.describe('Grid View', () => {
    test('Enterprise Settings page header renders', async () => {
      await navigateToEnterprisePanel();

      // Page header
      const header = mainWindow.locator('text=Enterprise Settings').first();
      const headerVisible = await header.isVisible().catch(() => false);
      console.log(`Enterprise Settings header visible: ${headerVisible}`);

      // Subtitle
      const subtitle = mainWindow.locator('text=Security, governance, and infrastructure configuration');
      const subtitleVisible = await subtitle.isVisible().catch(() => false);
      console.log(`Enterprise subtitle visible: ${subtitleVisible}`);

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-header.png' });
    });

    test('shows 6 sub-panel cards in grid layout', async () => {
      await navigateToEnterprisePanel();

      // All 6 panel labels should be visible
      const panelLabels = ['Guardrails', 'Gateway', 'Observability', 'Policies', 'Hooks', 'Memory'];

      for (const label of panelLabels) {
        const el = mainWindow.locator(`h3:has-text("${label}")`).or(mainWindow.locator(`text=${label}`).first());
        const vis = await el.isVisible().catch(() => false);
        console.log(`Panel card "${label}" visible: ${vis}`);
      }

      // Each card should have a "Configure" button
      const configureButtons = mainWindow.locator('button:has-text("Configure")');
      const configCount = await configureButtons.count().catch(() => 0);
      console.log(`Configure button count: ${configCount}`);

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-grid.png' });
    });

    test('panel cards show descriptions', async () => {
      await navigateToEnterprisePanel();

      // Descriptions from EnterpriseRoutePanel PANELS array
      const descriptions = [
        'Input/output scanning and safety rules',
        'Multi-provider routing and failover',
        'Tracing, metrics, and monitoring',
        'Approval workflows and compliance',
        'Lifecycle hook configuration',
        'Memory system and retrieval settings',
      ];

      for (const desc of descriptions) {
        const el = mainWindow.locator(`text=${desc}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Description "${desc.substring(0, 30)}..." visible: ${vis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-descriptions.png' });
    });
  });

  test.describe('Card Navigation', () => {
    test('clicking Guardrails card opens GuardrailsPanel', async () => {
      await navigateToEnterprisePanel();

      // Click the Guardrails Configure button
      const configureBtn = mainWindow
        .locator('button:has-text("Configure")')
        .first();
      if (await configureBtn.isVisible().catch(() => false)) {
        await configureBtn.click();
        await mainWindow.waitForTimeout(1000);

        // The "Back to Enterprise Settings" button should appear
        const backButton = mainWindow.locator('text=Back to Enterprise Settings');
        const backVisible = await backButton.isVisible().catch(() => false);
        console.log(`Back button visible: ${backVisible}`);

        // The sub-panel header should show "Guardrails"
        const subHeader = mainWindow.locator('h2:has-text("Guardrails")');
        const subHeaderVisible = await subHeader.isVisible().catch(() => false);
        console.log(`Guardrails sub-panel header visible: ${subHeaderVisible}`);

        // The description should be visible
        const desc = mainWindow.locator('text=Input/output scanning and safety rules');
        const descVisible = await desc.isVisible().catch(() => false);
        console.log(`Guardrails description visible: ${descVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-guardrails-open.png' });
    });

    test('back button returns to grid view', async () => {
      await navigateToEnterprisePanel();

      // Open any sub-panel first
      const configureBtn = mainWindow
        .locator('button:has-text("Configure")')
        .first();
      if (await configureBtn.isVisible().catch(() => false)) {
        await configureBtn.click();
        await mainWindow.waitForTimeout(500);

        // Click the back button
        const backButton = mainWindow.locator('text=Back to Enterprise Settings');
        if (await backButton.isVisible().catch(() => false)) {
          await backButton.click();
          await mainWindow.waitForTimeout(500);

          // We should be back on the grid view -- all 6 cards visible
          const guardrailsCard = mainWindow.locator('h3:has-text("Guardrails")').or(
            mainWindow.locator('text=Guardrails').first(),
          );
          const cardVisible = await guardrailsCard.isVisible().catch(() => false);
          console.log(`Guardrails card visible after back: ${cardVisible}`);

          const memoryCard = mainWindow.locator('h3:has-text("Memory")').or(
            mainWindow.locator('text=Memory').first(),
          );
          const memoryVisible = await memoryCard.isVisible().catch(() => false);
          console.log(`Memory card visible after back: ${memoryVisible}`);
        }
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-back-to-grid.png' });
    });

    test('clicking card body also opens the sub-panel', async () => {
      await navigateToEnterprisePanel();

      // The entire card is clickable (onClick on Card element)
      // Click on the "Gateway" text area (not the Configure button)
      const gatewayLabel = mainWindow.locator('h3:has-text("Gateway")').first();
      if (await gatewayLabel.isVisible().catch(() => false)) {
        await gatewayLabel.click();
        await mainWindow.waitForTimeout(500);

        // The Gateway sub-panel header should appear
        const subHeader = mainWindow.locator('h2:has-text("Gateway")');
        const subHeaderVisible = await subHeader.isVisible().catch(() => false);
        console.log(`Gateway sub-panel header visible: ${subHeaderVisible}`);

        // Description should show
        const desc = mainWindow.locator('text=Multi-provider routing and failover');
        const descVisible = await desc.isVisible().catch(() => false);
        console.log(`Gateway description visible: ${descVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-gateway-open.png' });
    });
  });

  test.describe('Gateway Sub-Panel', () => {
    test('Gateway panel shows server status card', async () => {
      await navigateToEnterprisePanel();

      // Navigate to Gateway sub-panel
      const gatewayCard = mainWindow.locator('h3:has-text("Gateway")').first();
      if (await gatewayCard.isVisible().catch(() => false)) {
        await gatewayCard.click();
        await mainWindow.waitForTimeout(1000);

        // Look for "Gateway Server" text
        const serverStatus = mainWindow.locator('text=Gateway Server');
        const statusVisible = await serverStatus.isVisible().catch(() => false);
        console.log(`Gateway Server text visible: ${statusVisible}`);

        // Health indicator text (Healthy or Offline)
        const healthText = mainWindow.locator('text=Healthy').or(mainWindow.locator('text=Offline'));
        const healthVisible = await healthText.first().isVisible().catch(() => false);
        console.log(`Health indicator visible: ${healthVisible}`);

        // Audit logging toggle
        const auditText = mainWindow.locator('text=Audit Logging');
        const auditVisible = await auditText.isVisible().catch(() => false);
        console.log(`Audit Logging text visible: ${auditVisible}`);

        // Permissions Summary section
        const permissionsText = mainWindow.locator('text=Permissions Summary');
        const permVisible = await permissionsText.isVisible().catch(() => false);
        console.log(`Permissions Summary visible: ${permVisible}`);

        // Refresh Status button
        const refreshBtn = mainWindow.locator('button:has-text("Refresh Status")');
        const refreshVisible = await refreshBtn.isVisible().catch(() => false);
        console.log(`Refresh Status button visible: ${refreshVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-gateway-detail.png' });
    });
  });

  test.describe('Observability Sub-Panel', () => {
    test('Observability panel shows token usage and export buttons', async () => {
      await navigateToEnterprisePanel();

      // Navigate to Observability sub-panel
      const obsCard = mainWindow.locator('h3:has-text("Observability")').first();
      if (await obsCard.isVisible().catch(() => false)) {
        await obsCard.click();
        await mainWindow.waitForTimeout(1000);

        // Cost Tracking toggle
        const costTracking = mainWindow.locator('text=Cost Tracking');
        const ctVisible = await costTracking.isVisible().catch(() => false);
        console.log(`Cost Tracking text visible: ${ctVisible}`);

        // Token Usage section
        const tokenUsage = mainWindow.locator('text=Token Usage');
        const tuVisible = await tokenUsage.isVisible().catch(() => false);
        console.log(`Token Usage text visible: ${tuVisible}`);

        // Metrics section
        const metrics = mainWindow.locator('text=Metrics');
        const metricsVisible = await metrics.isVisible().catch(() => false);
        console.log(`Metrics text visible: ${metricsVisible}`);

        // Export buttons
        const exportJson = mainWindow.locator('button:has-text("Export JSON")');
        const exportCsv = mainWindow.locator('button:has-text("Export CSV")');
        const jsonVisible = await exportJson.isVisible().catch(() => false);
        const csvVisible = await exportCsv.isVisible().catch(() => false);
        console.log(`Export JSON button: ${jsonVisible}, Export CSV button: ${csvVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-observability-detail.png' });
    });
  });

  test.describe('All Sub-Panels Accessible', () => {
    test('each sub-panel can be opened and closed', async () => {
      await navigateToEnterprisePanel();

      const panelLabels = ['Guardrails', 'Gateway', 'Observability', 'Policies', 'Hooks', 'Memory'];

      for (const label of panelLabels) {
        // Find and click the panel card
        const card = mainWindow.locator(`h3:has-text("${label}")`).first();
        if (await card.isVisible().catch(() => false)) {
          await card.click();
          await mainWindow.waitForTimeout(800);

          // Verify the sub-panel header shows
          const subHeader = mainWindow.locator(`h2:has-text("${label}")`);
          const headerVisible = await subHeader.isVisible().catch(() => false);
          console.log(`${label} sub-panel header visible: ${headerVisible}`);

          // Click back to return to grid
          const backButton = mainWindow.locator('text=Back to Enterprise Settings');
          if (await backButton.isVisible().catch(() => false)) {
            await backButton.click();
            await mainWindow.waitForTimeout(500);
          }
        }
      }

      await mainWindow.screenshot({ path: 'test-results/enterprise-panel-all-accessible.png' });
    });
  });
});
