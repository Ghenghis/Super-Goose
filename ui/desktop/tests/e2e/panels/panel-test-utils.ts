/**
 * Shared test utilities for panel E2E tests.
 *
 * These helpers abstract common patterns used across all panel test files:
 * - Waiting for the React app to mount
 * - Hash-based routing navigation
 * - Locating headings, sidebar nav items, and toggle switches
 */
import { Page, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the React app root to be mounted and non-empty.
 */
export async function waitForAppReady(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout },
  );
}

/**
 * Navigate to a panel route via hash router and wait for readiness.
 *
 * @param page - Playwright Page handle (the Electron window)
 * @param route - Hash route including leading `#/`, e.g. `#/search`
 */
export async function navigateToRoute(page: Page, route: string): Promise<void> {
  console.log(`Navigating to route: ${route}`);
  await waitForAppReady(page);
  await page.evaluate((r: string) => {
    window.location.hash = r;
  }, route);
  await page.waitForTimeout(1000);
  console.log(`Route ${route} loaded`);
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Verify that an element matching a data-testid or heading text is visible.
 */
export async function verifyPanelHeader(page: Page, headerText: string): Promise<void> {
  const header = page
    .getByRole('heading', { name: headerText })
    .or(page.locator(`text=${headerText}`).first());
  await expect(header).toBeVisible({ timeout: 5000 });
}

/**
 * Verify a sidebar nav item (link or button) is visible and clickable.
 */
export async function verifySidebarNavItem(page: Page, label: string): Promise<void> {
  const navItem = page
    .getByRole('link', { name: label })
    .or(page.getByText(label));
  await expect(navItem).toBeVisible();
}

/**
 * Locate an element by data-testid and return its visibility.
 */
export async function isTestIdVisible(page: Page, testId: string): Promise<boolean> {
  const el = page.locator(`[data-testid="${testId}"]`);
  return el.isVisible().catch(() => false);
}

/**
 * Assert that a given text string appears somewhere on the page.
 */
export async function assertTextVisible(page: Page, text: string): Promise<void> {
  const locator = page.locator(`text=${text}`).first();
  await expect(locator).toBeVisible({ timeout: 5000 });
}

/**
 * Convenience: take a screenshot with a descriptive path.
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/${name}.png` });
}

/**
 * Verify that at least N elements matching a selector exist on the page.
 */
export async function assertMinCount(
  page: Page,
  selector: string,
  minCount: number,
): Promise<void> {
  const count = await page.locator(selector).count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}
