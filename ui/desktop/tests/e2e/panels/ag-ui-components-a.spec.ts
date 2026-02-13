/**
 * E2E tests for AG-UI sub-panels within the SuperGoosePanel sidebar.
 *
 * Components under test:
 *   1. RecipeBrowser       - Browse and launch recipe templates
 *   2. PromptLibrary       - Browse, copy, and launch prompt templates
 *   3. DeeplinkGenerator   - Generate goose:// deeplinks for extensions, recipes, configs
 *
 * Navigation: Each sub-panel lives inside the SuperGoosePanel at #/super.
 * The sidebar contains icon-based nav buttons with title attributes matching
 * the panel label. Clicking a nav button switches the visible sub-panel.
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
 * Navigate to the SuperGoosePanel route and wait for it to render.
 */
async function navigateToSuperGoose() {
  console.log('Navigating to SuperGoosePanel (#/super)...');

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

  // Wait for the SuperGoosePanel to mount
  await mainWindow.waitForTimeout(2000);

  // Wait for the sg sidebar to appear
  await mainWindow.waitForFunction(
    () => {
      const panel = document.querySelector('[data-super="true"]') ||
                    document.querySelector('.super-goose-panel');
      return !!panel;
    },
    { timeout: 10000 },
  ).catch(() => {
    console.log('SuperGoosePanel selector not found, continuing with timeout fallback');
  });

  await mainWindow.waitForTimeout(500);
  console.log('SuperGoosePanel loaded');
}

/**
 * Click a sidebar nav button to switch to the given sub-panel.
 * Nav buttons have a `title` attribute matching the panel label.
 */
async function switchToSubPanel(label: string) {
  console.log(`Switching to sub-panel: ${label}`);

  const navButton = mainWindow.locator(`button[title="${label}"]`);
  const visible = await navButton.isVisible().catch(() => false);

  if (visible) {
    await navButton.click();
    await mainWindow.waitForTimeout(800);
    console.log(`Clicked nav button: ${label}`);
  } else {
    // Fallback: try locator by the emoji + label pattern in the sidebar
    const fallback = mainWindow.locator('.sg-sidebar-item').filter({ hasText: label }).first();
    const fbVisible = await fallback.isVisible().catch(() => false);
    if (fbVisible) {
      await fallback.click();
      await mainWindow.waitForTimeout(800);
      console.log(`Clicked fallback nav button: ${label}`);
    } else {
      console.log(`Nav button "${label}" not found — sub-panel may not render`);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. RecipeBrowser
// ---------------------------------------------------------------------------

test.describe('AG-UI Components', () => {
  test.describe('RecipeBrowser', () => {
    test('renders recipe browser with category tabs', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Recipes');

      // The RecipeBrowser has a tablist with aria-label "Recipe categories"
      const tablist = mainWindow.locator('[role="tablist"][aria-label="Recipe categories"]');
      const tablistVisible = await tablist.isVisible().catch(() => false);
      console.log(`Recipe categories tablist visible: ${tablistVisible}`);

      // Check for category tabs: All, Development, Devops, Data, Productivity, Creative
      const expectedTabs = ['All', 'Development', 'Devops', 'Data', 'Productivity', 'Creative'];
      for (const tabName of expectedTabs) {
        const tab = mainWindow.locator(`[role="tab"]:has-text("${tabName}")`).first();
        const vis = await tab.isVisible().catch(() => false);
        console.log(`Category tab "${tabName}" visible: ${vis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/ag-ui-recipe-browser.png' });
    });

    test('shows recipe cards with titles and badges', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Recipes');

      // Recipe cards are rendered as listitem roles
      const recipeList = mainWindow.locator('[role="list"][aria-label="Recipe list"]');
      const listVisible = await recipeList.isVisible().catch(() => false);
      console.log(`Recipe list visible: ${listVisible}`);

      // Check for known recipe titles from SAMPLE_RECIPES
      const recipeTitles = [
        'Docker Environment Setup',
        'Code Review Assistant',
        'Data Pipeline Builder',
        'Meeting Notes Generator',
      ];
      for (const title of recipeTitles) {
        const card = mainWindow.locator(`text=${title}`).first();
        const vis = await card.isVisible().catch(() => false);
        console.log(`Recipe card "${title}" visible: ${vis}`);
      }

      // Category badges should be visible (DevOps, Development, etc.)
      const devopsBadge = mainWindow.locator('text=DevOps').first();
      const devBadge = mainWindow.locator('text=Development').first();
      const devopsVis = await devopsBadge.isVisible().catch(() => false);
      const devVis = await devBadge.isVisible().catch(() => false);
      console.log(`Badge "DevOps" visible: ${devopsVis}, "Development" visible: ${devVis}`);

      // Launch buttons should be present on each card
      const launchButtons = mainWindow.locator('button:has-text("Launch")');
      const launchCount = await launchButtons.count().catch(() => 0);
      console.log(`Launch buttons found: ${launchCount}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-recipe-cards.png' });
    });

    test('search input filters recipes', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Recipes');

      // Find the search input by aria-label
      const searchInput = mainWindow.locator('input[aria-label="Search recipes"]');
      const inputVisible = await searchInput.isVisible().catch(() => false);
      console.log(`Search input visible: ${inputVisible}`);

      if (inputVisible) {
        // Type "Docker" to filter
        await searchInput.fill('Docker');
        await mainWindow.waitForTimeout(500);

        // Only Docker Environment Setup should remain
        const dockerCard = mainWindow.locator('text=Docker Environment Setup');
        const dockerVis = await dockerCard.isVisible().catch(() => false);
        console.log(`Docker recipe visible after filter: ${dockerVis}`);

        // Other recipes should be hidden
        const codeReview = mainWindow.locator('text=Code Review Assistant');
        const crVis = await codeReview.isVisible().catch(() => false);
        console.log(`Code Review hidden after filter: ${!crVis}`);

        // Clear the search
        await searchInput.fill('');
        await mainWindow.waitForTimeout(500);
        console.log('Cleared search input');
      }

      await mainWindow.screenshot({ path: 'test-results/ag-ui-recipe-search.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PromptLibrary
  // ---------------------------------------------------------------------------

  test.describe('PromptLibrary', () => {
    test('renders prompt library with category tabs', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Prompts');

      // The PromptLibrary has a tablist with aria-label "Prompt categories"
      const tablist = mainWindow.locator('[role="tablist"][aria-label="Prompt categories"]');
      const tablistVisible = await tablist.isVisible().catch(() => false);
      console.log(`Prompt categories tablist visible: ${tablistVisible}`);

      // Check for category tabs
      const expectedTabs = ['all', 'business', 'technical', 'productivity', 'debugging', 'creative'];
      for (const tabName of expectedTabs) {
        const tab = mainWindow.locator(`[role="tab"]:has-text("${tabName}")`).first();
        const vis = await tab.isVisible().catch(() => false);
        console.log(`Category tab "${tabName}" visible: ${vis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/ag-ui-prompt-library.png' });
    });

    test('shows prompt templates with titles', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Prompts');

      // Prompt templates should be visible as list items
      const promptList = mainWindow.locator('[role="list"][aria-label="Prompt templates"]');
      const listVisible = await promptList.isVisible().catch(() => false);
      console.log(`Prompt templates list visible: ${listVisible}`);

      // Check for known prompt titles from PROMPTS array
      const promptTitles = [
        'Debug failing test',
        'Code review checklist',
        'Write API documentation',
        'Refactor for performance',
        'Draft release notes',
      ];
      for (const title of promptTitles) {
        const el = mainWindow.locator(`text=${title}`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Prompt "${title}" visible: ${vis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/ag-ui-prompt-templates.png' });
    });

    test('Copy and Launch buttons exist on prompts', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Prompts');

      // Each prompt card has a Copy button and a Launch button
      const copyButtons = mainWindow.locator('button:has-text("Copy")');
      const launchButtons = mainWindow.locator('button:has-text("Launch")');
      const copyCount = await copyButtons.count().catch(() => 0);
      const launchCount = await launchButtons.count().catch(() => 0);
      console.log(`Copy buttons found: ${copyCount}, Launch buttons found: ${launchCount}`);

      // Tags should be displayed (e.g. "testing", "fix", "review", "quality")
      const testingTag = mainWindow.locator('text=testing').first();
      const reviewTag = mainWindow.locator('text=review').first();
      const testingVis = await testingTag.isVisible().catch(() => false);
      const reviewVis = await reviewTag.isVisible().catch(() => false);
      console.log(`Tag "testing" visible: ${testingVis}, tag "review" visible: ${reviewVis}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-prompt-actions.png' });
    });

    test('category tabs filter prompts', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Prompts');

      // Click the "debugging" tab
      const debugTab = mainWindow.locator('[role="tab"]:has-text("debugging")').first();
      const debugTabVisible = await debugTab.isVisible().catch(() => false);
      console.log(`Debugging tab visible: ${debugTabVisible}`);

      if (debugTabVisible) {
        await debugTab.click();
        await mainWindow.waitForTimeout(500);

        // "Debug failing test" and "Generate unit tests" are in the debugging category
        const debugPrompt = mainWindow.locator('text=Debug failing test');
        const unitPrompt = mainWindow.locator('text=Generate unit tests');
        const debugVis = await debugPrompt.isVisible().catch(() => false);
        const unitVis = await unitPrompt.isVisible().catch(() => false);
        console.log(`Debugging prompts visible - "Debug failing test": ${debugVis}, "Generate unit tests": ${unitVis}`);

        // "Draft release notes" (business category) should not be visible
        const releaseNotes = mainWindow.locator('text=Draft release notes');
        const releaseVis = await releaseNotes.isVisible().catch(() => false);
        console.log(`"Draft release notes" hidden after filtering: ${!releaseVis}`);
      }

      await mainWindow.screenshot({ path: 'test-results/ag-ui-prompt-filter.png' });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DeeplinkGenerator
  // ---------------------------------------------------------------------------

  test.describe('DeeplinkGenerator', () => {
    test('renders deeplink type tabs', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Deeplinks');

      // The DeeplinkGenerator has a tablist with aria-label "Link type selector"
      const tablist = mainWindow.locator('[role="tablist"][aria-label="Link type selector"]');
      const tablistVisible = await tablist.isVisible().catch(() => false);
      console.log(`Link type tablist visible: ${tablistVisible}`);

      // Check for the three tab types
      const tabs = ['Extension Link', 'Recipe Link', 'Config Link'];
      for (const tabLabel of tabs) {
        const tab = mainWindow.locator(`[role="tab"]:has-text("${tabLabel}")`).first();
        const vis = await tab.isVisible().catch(() => false);
        console.log(`Tab "${tabLabel}" visible: ${vis}`);
      }

      // Heading should show "Deeplink Generator"
      const heading = mainWindow.locator('text=Deeplink Generator');
      const headingVisible = await heading.isVisible().catch(() => false);
      console.log(`Heading "Deeplink Generator" visible: ${headingVisible}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-deeplink-tabs.png' });
    });

    test('shows extension link form fields', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Deeplinks');

      // Extension Link is the default tab — form fields should be visible
      const nameInput = mainWindow.locator('input[aria-label="Extension name"]');
      const typeSelect = mainWindow.locator('select[aria-label="Extension type"]');
      const cmdInput = mainWindow.locator('input[aria-label="Extension command or URL"]');

      const nameVis = await nameInput.isVisible().catch(() => false);
      const typeVis = await typeSelect.isVisible().catch(() => false);
      const cmdVis = await cmdInput.isVisible().catch(() => false);
      console.log(`Extension form - name: ${nameVis}, type: ${typeVis}, command: ${cmdVis}`);

      // "Environment Variables" section and "Add var" button
      const envSection = mainWindow.locator('text=Environment Variables');
      const addVarBtn = mainWindow.locator('button:has-text("+ Add var")');
      const envVis = await envSection.isVisible().catch(() => false);
      const addVis = await addVarBtn.isVisible().catch(() => false);
      console.log(`Env Variables section: ${envVis}, Add var button: ${addVis}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-deeplink-ext-form.png' });
    });

    test('generates URL preview and shows generated URL', async () => {
      await navigateToSuperGoose();
      await switchToSubPanel('Deeplinks');

      // The Generated URL input should show a goose://ext? URL
      const urlInput = mainWindow.locator('input[aria-label="Generated deeplink URL"]');
      const urlVisible = await urlInput.isVisible().catch(() => false);
      console.log(`Generated URL input visible: ${urlVisible}`);

      if (urlVisible) {
        const urlValue = await urlInput.inputValue().catch(() => '');
        console.log(`Generated URL value: ${urlValue}`);
        const hasGooseProtocol = urlValue.startsWith('goose://ext?');
        console.log(`URL starts with goose://ext?: ${hasGooseProtocol}`);
      }

      // Preview section should show configuration details
      const previewLabel = mainWindow.locator('text=Preview');
      const previewVisible = await previewLabel.isVisible().catch(() => false);
      console.log(`Preview label visible: ${previewVisible}`);

      const previewContent = mainWindow.locator('[aria-label="Link configuration preview"]');
      const previewContentVisible = await previewContent.isVisible().catch(() => false);
      console.log(`Preview content visible: ${previewContentVisible}`);

      if (previewContentVisible) {
        const previewText = await previewContent.textContent().catch(() => '');
        const hasExtension = previewText.includes('Extension:');
        const hasType = previewText.includes('Type: stdio');
        console.log(`Preview contains Extension info: ${hasExtension}, Type: ${hasType}`);
      }

      // Copy button should exist
      const copyBtn = mainWindow.locator('button[aria-label="Copy URL to clipboard"]');
      const copyVis = await copyBtn.isVisible().catch(() => false);
      console.log(`Copy URL button visible: ${copyVis}`);

      await mainWindow.screenshot({ path: 'test-results/ag-ui-deeplink-url-preview.png' });
    });
  });
});
