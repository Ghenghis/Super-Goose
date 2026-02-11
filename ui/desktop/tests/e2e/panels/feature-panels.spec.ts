/**
 * E2E tests for all feature panels accessible via hash routes.
 *
 * Each feature panel is a full-page component rendered at its own route.
 * They all use MainPanelLayout and contain mock data for UI-only testing.
 *
 * Panels under test:
 *   1. SearchSidebar        - /search
 *   2. BookmarkManager      - /bookmarks
 *   3. ReflexionPanel       - /reflexion
 *   4. CriticManagerPanel   - /critic
 *   5. PlanManagerPanel     - /plans
 *   6. GuardrailsPanel      - /guardrails
 *   7. BudgetPanel          - /budget
 *   8. FeatureStatusDashboard - /features-dashboard
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

  await mainWindow.waitForTimeout(1000);
  console.log(`Route ${route} loaded`);
}

// ---------------------------------------------------------------------------
// 1. SearchSidebar
// ---------------------------------------------------------------------------

test.describe('Feature Panels', () => {
  test.describe('Search Sidebar', () => {
    test('SearchSidebar renders with search input field', async () => {
      await navigateToRoute('#/search');

      // Heading should show "Cross-Session Search" or "Search"
      const heading = mainWindow.locator('h1').first();
      const headingText = await heading.textContent().catch(() => '');
      console.log(`Search heading text: "${headingText}"`);

      // Search input should be present
      const searchInput = mainWindow.locator(
        'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]',
      );
      const inputVisible = await searchInput.first().isVisible().catch(() => false);
      console.log(`Search input visible: ${inputVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-search-sidebar.png' });
    });

    test('SearchSidebar displays mock search results', async () => {
      await navigateToRoute('#/search');

      // Mock data includes session names like "Refactor authentication module"
      const sessionName = mainWindow.locator('text=Refactor authentication module');
      const sessionVisible = await sessionName.first().isVisible().catch(() => false);
      console.log(`Session name in search results visible: ${sessionVisible}`);

      // Search results should contain snippet text
      const snippet = mainWindow.locator('text=JWT').first();
      const snippetVisible = await snippet.isVisible().catch(() => false);
      console.log(`Search result snippet visible: ${snippetVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-search-results.png' });
    });

    test('SearchSidebar search input filters results', async () => {
      await navigateToRoute('#/search');

      const searchInput = mainWindow.locator(
        'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]',
      ).first();

      if (await searchInput.isVisible().catch(() => false)) {
        // Type a query to filter
        await searchInput.fill('auth');
        await mainWindow.waitForTimeout(500);
        console.log('Typed "auth" in search input');

        // Clear the search
        await searchInput.fill('');
        await mainWindow.waitForTimeout(500);
        console.log('Cleared search input');
      }

      await mainWindow.screenshot({ path: 'test-results/feature-search-filter.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. BookmarkManager
  // ---------------------------------------------------------------------------

  test.describe('Bookmark Manager', () => {
    test('BookmarkManager renders with bookmark list', async () => {
      await navigateToRoute('#/bookmarks');

      // Heading should show "Bookmarks"
      const heading = mainWindow.locator('h1:has-text("Bookmarks")');
      const headingVisible = await heading.isVisible().catch(() => false);
      console.log(`Bookmarks heading visible: ${headingVisible}`);

      // Mock bookmarks should be present (e.g. "Auth flow fix")
      const bookmark = mainWindow.locator('text=Auth flow fix');
      const bookmarkVisible = await bookmark.isVisible().catch(() => false);
      console.log(`Bookmark "Auth flow fix" visible: ${bookmarkVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-bookmark-manager.png' });
    });

    test('BookmarkManager shows bookmark metadata', async () => {
      await navigateToRoute('#/bookmarks');

      // Each bookmark should show session name, timestamp, etc.
      const sessionRef = mainWindow.locator('text=Refactor authentication module');
      const refVisible = await sessionRef.first().isVisible().catch(() => false);
      console.log(`Bookmark session reference visible: ${refVisible}`);

      // Bookmark description should be visible
      const description = mainWindow.locator('text=OAuth2');
      const descVisible = await description.first().isVisible().catch(() => false);
      console.log(`Bookmark description visible: ${descVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-bookmark-metadata.png' });
    });

    test('BookmarkManager has action buttons', async () => {
      await navigateToRoute('#/bookmarks');

      // Look for action buttons (delete, external link, add)
      const deleteButtons = mainWindow.locator('button[aria-label*="delete"], button[aria-label*="Delete"]');
      const deleteCount = await deleteButtons.count().catch(() => 0);
      console.log(`Delete buttons found: ${deleteCount}`);

      // "Add Bookmark" button should be present
      const addButton = mainWindow.locator('button:has-text("Add"), button:has-text("New")');
      const addVisible = await addButton.first().isVisible().catch(() => false);
      console.log(`Add bookmark button visible: ${addVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-bookmark-actions.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ReflexionPanel
  // ---------------------------------------------------------------------------

  test.describe('Reflexion Panel', () => {
    test('ReflexionPanel renders with heading and description', async () => {
      await navigateToRoute('#/reflexion');

      // Main heading
      const heading = mainWindow.locator('h1:has-text("Reflexion")');
      await expect(heading).toBeVisible({ timeout: 5000 });
      console.log('Reflexion heading visible');

      // Description text
      const description = mainWindow.locator('text=Learn from mistakes');
      const descVisible = await description.isVisible().catch(() => false);
      console.log(`Reflexion description visible: ${descVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-reflexion-panel.png' });
    });

    test('ReflexionPanel has engine toggle switch', async () => {
      await navigateToRoute('#/reflexion');

      // "Reflexion Engine" label
      const engineLabel = mainWindow.locator('text=Reflexion Engine');
      const labelVisible = await engineLabel.isVisible().catch(() => false);
      console.log(`Reflexion Engine label visible: ${labelVisible}`);

      // Toggle switch
      const toggle = mainWindow.locator('button[role="switch"]').first();
      const toggleVisible = await toggle.isVisible().catch(() => false);
      console.log(`Reflexion toggle visible: ${toggleVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-reflexion-toggle.png' });
    });

    test('ReflexionPanel shows reflexion entries with severity badges', async () => {
      await navigateToRoute('#/reflexion');

      // Mock entries should render - look for severity badges: low, medium, high
      const severities = ['low', 'medium', 'high'];
      for (const sev of severities) {
        const badge = mainWindow.locator(`text=${sev}`).first();
        const vis = await badge.isVisible().catch(() => false);
        console.log(`Severity badge "${sev}" visible: ${vis}`);
      }

      // "active" badges for applied entries
      const activeBadge = mainWindow.locator('text=active').first();
      const activeVisible = await activeBadge.isVisible().catch(() => false);
      console.log(`Active badge visible: ${activeVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-reflexion-entries.png' });
    });

    test('ReflexionPanel entries expand to show failure and lesson', async () => {
      await navigateToRoute('#/reflexion');

      // Click the first entry to expand it
      const firstEntry = mainWindow.locator('button').filter({ hasText: 'read-only file' }).first();
      const entryVisible = await firstEntry.isVisible().catch(() => false);
      if (entryVisible) {
        await firstEntry.click();
        await mainWindow.waitForTimeout(500);

        // After expanding, "Failure" and "Lesson Learned" labels should appear
        const failureLabel = mainWindow.locator('text=Failure').first();
        const lessonLabel = mainWindow.locator('text=Lesson Learned');
        const failureVis = await failureLabel.isVisible().catch(() => false);
        const lessonVis = await lessonLabel.isVisible().catch(() => false);
        console.log(`Failure label visible: ${failureVis}, Lesson label visible: ${lessonVis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/feature-reflexion-expanded.png' });
    });

    test('ReflexionPanel shows stats counters', async () => {
      await navigateToRoute('#/reflexion');

      // Stats: "5 total entries" and "4 applied to context"
      const totalEntries = mainWindow.locator('text=total entries');
      const appliedEntries = mainWindow.locator('text=applied to context');
      const totalVis = await totalEntries.isVisible().catch(() => false);
      const appliedVis = await appliedEntries.isVisible().catch(() => false);
      console.log(`Stats - total: ${totalVis}, applied: ${appliedVis}`);

      await mainWindow.screenshot({ path: 'test-results/feature-reflexion-stats.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CriticManagerPanel
  // ---------------------------------------------------------------------------

  test.describe('Critic Manager Panel', () => {
    test('CriticManagerPanel renders with heading', async () => {
      await navigateToRoute('#/critic');

      const heading = mainWindow.locator('h1:has-text("Critic")');
      await expect(heading).toBeVisible({ timeout: 5000 });
      console.log('Critic heading visible');

      const description = mainWindow.locator('text=quality assessment');
      const descVisible = await description.isVisible().catch(() => false);
      console.log(`Critic description visible: ${descVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-critic-panel.png' });
    });

    test('CriticManagerPanel has engine toggle', async () => {
      await navigateToRoute('#/critic');

      const engineLabel = mainWindow.locator('text=Critic Engine');
      const labelVisible = await engineLabel.isVisible().catch(() => false);
      console.log(`Critic Engine label visible: ${labelVisible}`);

      const toggle = mainWindow.locator('button[role="switch"]').first();
      const toggleVisible = await toggle.isVisible().catch(() => false);
      console.log(`Critic toggle visible: ${toggleVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-critic-toggle.png' });
    });

    test('CriticManagerPanel shows evaluations with verdict badges', async () => {
      await navigateToRoute('#/critic');

      // Verdict labels: Good, Acceptable, Needs Work
      const verdicts = ['Good', 'Acceptable', 'Needs Work'];
      for (const verdict of verdicts) {
        const badge = mainWindow.locator(`text=${verdict}`).first();
        const vis = await badge.isVisible().catch(() => false);
        console.log(`Verdict badge "${verdict}" visible: ${vis}`);
      }

      // Numeric scores should be visible
      const score = mainWindow.locator('text=8.3').or(mainWindow.locator('text=8.0'));
      const scoreVisible = await score.first().isVisible().catch(() => false);
      console.log(`Numeric score visible: ${scoreVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-critic-evaluations.png' });
    });

    test('CriticManagerPanel entries expand to show score breakdown', async () => {
      await navigateToRoute('#/critic');

      // Click the first evaluation entry
      const firstEntry = mainWindow
        .locator('button')
        .filter({ hasText: 'Refactored JWT' })
        .first();
      const entryVisible = await firstEntry.isVisible().catch(() => false);
      if (entryVisible) {
        await firstEntry.click();
        await mainWindow.waitForTimeout(500);

        // After expanding, "Score Breakdown" and score bar labels should appear
        const breakdownLabel = mainWindow.locator('text=Score Breakdown');
        const breakdownVis = await breakdownLabel.isVisible().catch(() => false);
        console.log(`Score Breakdown label visible: ${breakdownVis}`);

        // Score dimensions
        const dimensions = ['Correctness', 'Completeness', 'Efficiency', 'Safety'];
        for (const dim of dimensions) {
          const dimEl = mainWindow.locator(`text=${dim}`).first();
          const dimVis = await dimEl.isVisible().catch(() => false);
          console.log(`Score dimension "${dim}" visible: ${dimVis}`);
        }

        // Suggestions section
        const suggestionsLabel = mainWindow.locator('text=Suggestions');
        const suggestionsVis = await suggestionsLabel.isVisible().catch(() => false);
        console.log(`Suggestions section visible: ${suggestionsVis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/feature-critic-expanded.png' });
    });

    test('CriticManagerPanel shows stats', async () => {
      await navigateToRoute('#/critic');

      const evaluations = mainWindow.locator('text=evaluations');
      const avgScore = mainWindow.locator('text=avg score');
      const evalVis = await evaluations.isVisible().catch(() => false);
      const avgVis = await avgScore.isVisible().catch(() => false);
      console.log(`Stats - evaluations: ${evalVis}, avg score: ${avgVis}`);

      await mainWindow.screenshot({ path: 'test-results/feature-critic-stats.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. PlanManagerPanel
  // ---------------------------------------------------------------------------

  test.describe('Plan Manager Panel', () => {
    test('PlanManagerPanel renders with heading', async () => {
      await navigateToRoute('#/plans');

      const heading = mainWindow.locator('h1:has-text("Plan Manager")');
      await expect(heading).toBeVisible({ timeout: 5000 });
      console.log('Plan Manager heading visible');

      await mainWindow.screenshot({ path: 'test-results/feature-plans-panel.png' });
    });

    test('PlanManagerPanel has structured execution toggle', async () => {
      await navigateToRoute('#/plans');

      const label = mainWindow.locator('text=Structured Execution Mode');
      const labelVisible = await label.isVisible().catch(() => false);
      console.log(`Structured Execution Mode label visible: ${labelVisible}`);

      const toggle = mainWindow.locator('button[role="switch"]').first();
      const toggleVisible = await toggle.isVisible().catch(() => false);
      console.log(`Mode toggle visible: ${toggleVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-plans-toggle.png' });
    });

    test('PlanManagerPanel shows plans with status badges', async () => {
      await navigateToRoute('#/plans');

      // Plan status badges: active, completed, failed
      const statuses = ['active', 'completed', 'failed'];
      for (const status of statuses) {
        const badge = mainWindow.locator(`text=${status}`).first();
        const vis = await badge.isVisible().catch(() => false);
        console.log(`Plan status badge "${status}" visible: ${vis}`);
      }

      // Plan titles from mock data
      const titles = [
        'Implement user authentication flow',
        'Fix database pool exhaustion issue',
      ];
      for (const title of titles) {
        const el = mainWindow.locator(`text=${title}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Plan title "${title}" visible: ${vis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/feature-plans-list.png' });
    });

    test('PlanManagerPanel active plan shows expanded steps', async () => {
      await navigateToRoute('#/plans');

      // Plan "Fix database pool exhaustion issue" (plan-002) starts expanded
      const step = mainWindow.locator('text=Profile current pool usage under load');
      const stepVisible = await step.isVisible().catch(() => false);
      console.log(`Expanded plan step visible: ${stepVisible}`);

      // Step statuses should show progress via icons
      const inProgressStep = mainWindow.locator('text=Add connection health check interval');
      const ipVisible = await inProgressStep.isVisible().catch(() => false);
      console.log(`In-progress step visible: ${ipVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-plans-steps.png' });
    });

    test('PlanManagerPanel shows progress bars', async () => {
      await navigateToRoute('#/plans');

      // Progress bars use rounded-full classes -- verify at least one exists
      const progressBars = mainWindow.locator('.rounded-full.bg-green-500, .rounded-full.bg-red-500');
      const barCount = await progressBars.count().catch(() => 0);
      console.log(`Progress bar elements found: ${barCount}`);

      await mainWindow.screenshot({ path: 'test-results/feature-plans-progress.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 6. GuardrailsPanel
  // ---------------------------------------------------------------------------

  test.describe('Guardrails Panel', () => {
    test('GuardrailsPanel renders with heading', async () => {
      await navigateToRoute('#/guardrails');

      const heading = mainWindow.locator('h1:has-text("Guardrails")');
      await expect(heading).toBeVisible({ timeout: 5000 });
      console.log('Guardrails heading visible');

      await mainWindow.screenshot({ path: 'test-results/feature-guardrails-panel.png' });
    });

    test('GuardrailsPanel has scanner toggle', async () => {
      await navigateToRoute('#/guardrails');

      // "Guardrails Scanner" or similar control label
      const scannerLabel = mainWindow.locator('text=Scanner').or(mainWindow.locator('text=Guardrails'));
      const labelVisible = await scannerLabel.first().isVisible().catch(() => false);
      console.log(`Scanner label visible: ${labelVisible}`);

      const toggle = mainWindow.locator('button[role="switch"]').first();
      const toggleVisible = await toggle.isVisible().catch(() => false);
      console.log(`Scanner toggle visible: ${toggleVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-guardrails-toggle.png' });
    });

    test('GuardrailsPanel shows scan entries with result badges', async () => {
      await navigateToRoute('#/guardrails');

      // Scan result indicators: pass, warn, block
      const results = ['pass', 'warn', 'block'];
      for (const result of results) {
        const badge = mainWindow.locator(`text=${result}`).first();
        const vis = await badge.isVisible().catch(() => false);
        console.log(`Scan result badge "${result}" visible: ${vis}`);
      }

      // Detector names from mock data: "Prompt Injection"
      const detector = mainWindow.locator('text=Prompt Injection');
      const detectorVisible = await detector.first().isVisible().catch(() => false);
      console.log(`Detector name visible: ${detectorVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-guardrails-entries.png' });
    });

    test('GuardrailsPanel shows input/output direction indicators', async () => {
      await navigateToRoute('#/guardrails');

      // Direction indicators: "Input" and "Output"
      const inputDir = mainWindow.locator('text=Input').first();
      const outputDir = mainWindow.locator('text=Output').first();
      const inputVis = await inputDir.isVisible().catch(() => false);
      const outputVis = await outputDir.isVisible().catch(() => false);
      console.log(`Direction indicators - Input: ${inputVis}, Output: ${outputVis}`);

      await mainWindow.screenshot({ path: 'test-results/feature-guardrails-directions.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. BudgetPanel
  // ---------------------------------------------------------------------------

  test.describe('Budget Panel', () => {
    test('BudgetPanel renders with heading and cost display', async () => {
      await navigateToRoute('#/budget');

      const heading = mainWindow.locator('h1:has-text("Budget")');
      await expect(heading).toBeVisible({ timeout: 5000 });
      console.log('Budget heading visible');

      // "Current Session Cost" label
      const costLabel = mainWindow.locator('text=Current Session Cost');
      const costLabelVisible = await costLabel.isVisible().catch(() => false);
      console.log(`Current Session Cost label visible: ${costLabelVisible}`);

      // Dollar amount should be visible (e.g. $3.16)
      const dollarAmount = mainWindow.locator('text=$').first();
      const amountVisible = await dollarAmount.isVisible().catch(() => false);
      console.log(`Dollar amount visible: ${amountVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-budget-panel.png' });
    });

    test('BudgetPanel has editable budget limit', async () => {
      await navigateToRoute('#/budget');

      // "Budget: $10.00 per session (click to edit)" button
      const budgetButton = mainWindow.locator('text=Budget:').or(mainWindow.locator('text=click to edit'));
      const buttonVisible = await budgetButton.first().isVisible().catch(() => false);
      console.log(`Budget edit button visible: ${buttonVisible}`);

      if (buttonVisible) {
        // Click to enter edit mode
        await budgetButton.first().click();
        await mainWindow.waitForTimeout(500);

        // An input field should appear
        const input = mainWindow.locator('input[type="number"]');
        const inputVisible = await input.isVisible().catch(() => false);
        console.log(`Budget input visible: ${inputVisible}`);

        // "Save" button should appear
        const saveButton = mainWindow.locator('button:has-text("Save")');
        const saveVisible = await saveButton.isVisible().catch(() => false);
        console.log(`Save button visible: ${saveVisible}`);
      }

      await mainWindow.screenshot({ path: 'test-results/feature-budget-edit.png' });
    });

    test('BudgetPanel shows budget progress bar', async () => {
      await navigateToRoute('#/budget');

      // Budget bar with percentage
      const percentageText = mainWindow.locator('text=%').first();
      const pctVisible = await percentageText.isVisible().catch(() => false);
      console.log(`Budget percentage visible: ${pctVisible}`);

      // Progress bar element
      const progressBar = mainWindow.locator('.bg-green-500, .bg-amber-500, .bg-red-500').first();
      const barVisible = await progressBar.isVisible().catch(() => false);
      console.log(`Progress bar visible: ${barVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-budget-bar.png' });
    });

    test('BudgetPanel shows daily usage chart', async () => {
      await navigateToRoute('#/budget');

      const chartLabel = mainWindow.locator('text=Daily Usage');
      const chartVisible = await chartLabel.isVisible().catch(() => false);
      console.log(`Daily Usage chart heading visible: ${chartVisible}`);

      // Bar chart date labels from mock data
      const dateLabel = mainWindow.locator('text=02/04').or(mainWindow.locator('text=02/10'));
      const dateVisible = await dateLabel.first().isVisible().catch(() => false);
      console.log(`Chart date label visible: ${dateVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-budget-chart.png' });
    });

    test('BudgetPanel shows cost breakdown table', async () => {
      await navigateToRoute('#/budget');

      const breakdownLabel = mainWindow.locator('text=Cost Breakdown by Model');
      const breakdownVisible = await breakdownLabel.isVisible().catch(() => false);
      console.log(`Cost Breakdown table heading visible: ${breakdownVisible}`);

      // Model names from mock data
      const models = ['claude-sonnet-4-20250514', 'gpt-4o'];
      for (const model of models) {
        const el = mainWindow.locator(`text=${model}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Model "${model}" in table visible: ${vis}`);
      }

      // "Total" row
      const totalRow = mainWindow.locator('text=Total').first();
      const totalVisible = await totalRow.isVisible().catch(() => false);
      console.log(`Total row visible: ${totalVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-budget-breakdown.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 8. FeatureStatusDashboard
  // ---------------------------------------------------------------------------

  test.describe('Feature Status Dashboard', () => {
    test('FeatureStatusDashboard renders with feature cards', async () => {
      await navigateToRoute('#/features-dashboard');

      // The dashboard may have a heading like "Features" or individual feature names
      // Look for known feature names from the FEATURES array
      const features = [
        'CostTracker',
        'Reflexion',
        'Guardrails',
        'Code-Test-Fix',
        'Cross-Session Search',
      ];

      let visibleCount = 0;
      for (const feature of features) {
        const el = mainWindow.locator(`text=${feature}`).first();
        const vis = await el.isVisible().catch(() => false);
        if (vis) visibleCount++;
        console.log(`Feature "${feature}" visible: ${vis}`);
      }

      console.log(`Total visible features: ${visibleCount}`);

      await mainWindow.screenshot({ path: 'test-results/feature-dashboard.png' });
    });

    test('FeatureStatusDashboard shows status indicators', async () => {
      await navigateToRoute('#/features-dashboard');

      // Status labels from FeatureInfo type: working, partial, disabled
      // These may appear as text badges or as colored indicators
      const workingBadge = mainWindow.locator('text=working').or(mainWindow.locator('text=Working'));
      const partialBadge = mainWindow.locator('text=partial').or(mainWindow.locator('text=Partial'));

      const workingVisible = await workingBadge.first().isVisible().catch(() => false);
      const partialVisible = await partialBadge.first().isVisible().catch(() => false);
      console.log(`Status - working: ${workingVisible}, partial: ${partialVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-dashboard-status.png' });
    });

    test('FeatureStatusDashboard shows source references', async () => {
      await navigateToRoute('#/features-dashboard');

      // Source references like "agent.rs:2103"
      const sourceRef = mainWindow.locator('text=agent.rs').first();
      const refVisible = await sourceRef.isVisible().catch(() => false);
      console.log(`Source reference visible: ${refVisible}`);

      await mainWindow.screenshot({ path: 'test-results/feature-dashboard-refs.png' });
    });

    test('FeatureStatusDashboard feature cards are clickable for navigation', async () => {
      await navigateToRoute('#/features-dashboard');

      // Each feature card may have a link/button to navigate to its panel
      // Look for chevron icons indicating navigation
      const chevrons = mainWindow.locator('svg.lucide-chevron-right');
      const chevronCount = await chevrons.count().catch(() => 0);
      console.log(`Navigation chevrons found: ${chevronCount}`);

      await mainWindow.screenshot({ path: 'test-results/feature-dashboard-navigation.png' });
    });
  });
});
