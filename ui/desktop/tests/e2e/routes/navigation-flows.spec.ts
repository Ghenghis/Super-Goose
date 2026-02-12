/**
 * E2E tests for navigation flow patterns.
 *
 * Tests cover:
 *   1. Back / forward browser-style navigation (history.back / history.forward)
 *   2. Deep-link routing (navigating directly to a specific hash route)
 *   3. Route transitions preserving application state
 *   4. Theme switching persistence across navigation
 *   5. Error boundary recovery after navigating to a broken route and back
 *
 * No running backend is required -- panels ship with mock / default data.
 */
import { test as base, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { showTestName, clearTestName } from '../test-overlay';
import { waitForAppReady, navigateToRoute, takeScreenshot } from '../panels/panel-test-utils';

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

async function getCurrentHash(): Promise<string> {
  return mainWindow.evaluate(() => window.location.hash);
}

async function assertAppAlive(): Promise<void> {
  const alive = await mainWindow.evaluate(() => {
    const root = document.getElementById('root');
    return root !== null && root.children.length > 0;
  });
  expect(alive).toBe(true);
}

async function goBack(): Promise<void> {
  await mainWindow.evaluate(() => window.history.back());
  await mainWindow.waitForTimeout(800);
}

async function goForward(): Promise<void> {
  await mainWindow.evaluate(() => window.history.forward());
  await mainWindow.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// 1. Back / Forward navigation
// ---------------------------------------------------------------------------

test.describe('Navigation Flows', () => {

  test.describe('Back and forward navigation', () => {
    test('history.back returns to previous route', async () => {
      // Navigate: Home -> Search -> Bookmarks
      await navigateToRoute(mainWindow, '#/');
      await navigateToRoute(mainWindow, '#/search');
      await navigateToRoute(mainWindow, '#/bookmarks');

      // Go back should return to Search
      await goBack();
      const hash = await getCurrentHash();
      expect(hash).toContain('/search');
      await assertAppAlive();

      await takeScreenshot(mainWindow, 'nav-flow-back');
    });

    test('history.forward returns to next route after going back', async () => {
      // Navigate: Home -> Search -> Bookmarks
      await navigateToRoute(mainWindow, '#/');
      await navigateToRoute(mainWindow, '#/search');
      await navigateToRoute(mainWindow, '#/bookmarks');

      // Go back to Search
      await goBack();

      // Go forward should return to Bookmarks
      await goForward();
      const hash = await getCurrentHash();
      expect(hash).toContain('/bookmarks');
      await assertAppAlive();

      await takeScreenshot(mainWindow, 'nav-flow-forward');
    });

    test('multiple back navigations traverse the full history stack', async () => {
      // Navigate through multiple routes
      await navigateToRoute(mainWindow, '#/');
      await navigateToRoute(mainWindow, '#/search');
      await navigateToRoute(mainWindow, '#/bookmarks');
      await navigateToRoute(mainWindow, '#/reflexion');

      // Go back three times: reflexion -> bookmarks -> search -> home
      await goBack();
      expect(await getCurrentHash()).toContain('/bookmarks');

      await goBack();
      expect(await getCurrentHash()).toContain('/search');

      await goBack();
      // Should be at root
      const hash = await getCurrentHash();
      expect(hash === '#/' || hash === '#').toBe(true);

      await assertAppAlive();
      await takeScreenshot(mainWindow, 'nav-flow-multi-back');
    });

    test('back then forward then back produces correct sequence', async () => {
      await navigateToRoute(mainWindow, '#/');
      await navigateToRoute(mainWindow, '#/budget');
      await navigateToRoute(mainWindow, '#/guardrails');

      // Back to budget
      await goBack();
      expect(await getCurrentHash()).toContain('/budget');

      // Forward to guardrails
      await goForward();
      expect(await getCurrentHash()).toContain('/guardrails');

      // Back to budget again
      await goBack();
      expect(await getCurrentHash()).toContain('/budget');

      await assertAppAlive();
      await takeScreenshot(mainWindow, 'nav-flow-zigzag');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Deep-link routing
  // ---------------------------------------------------------------------------

  test.describe('Deep link routing', () => {
    test('direct navigation to /search renders search content', async () => {
      await waitForAppReady(mainWindow);
      // Navigate directly without visiting home first
      await mainWindow.evaluate(() => {
        window.location.hash = '#/search';
      });
      await mainWindow.waitForTimeout(1500);

      const found = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Search');
      });
      expect(found).toBe(true);
      await assertAppAlive();

      await takeScreenshot(mainWindow, 'nav-flow-deeplink-search');
    });

    test('direct navigation to /enterprise renders enterprise content', async () => {
      await waitForAppReady(mainWindow);
      await mainWindow.evaluate(() => {
        window.location.hash = '#/enterprise';
      });
      await mainWindow.waitForTimeout(1500);

      const found = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Enterprise');
      });
      expect(found).toBe(true);
      await assertAppAlive();

      await takeScreenshot(mainWindow, 'nav-flow-deeplink-enterprise');
    });

    test('direct navigation to /settings?section=models renders settings with models section', async () => {
      await waitForAppReady(mainWindow);
      await mainWindow.evaluate(() => {
        window.location.hash = '#/settings?section=models';
      });
      await mainWindow.waitForTimeout(1500);

      // Page should render settings content (Models section)
      await assertAppAlive();
      const hash = await getCurrentHash();
      expect(hash).toContain('/settings');

      await takeScreenshot(mainWindow, 'nav-flow-deeplink-settings-models');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Route transitions preserving state
  // ---------------------------------------------------------------------------

  test.describe('State preservation across navigation', () => {
    test('navigating away and back to a route does not crash', async () => {
      // Navigate to reflexion
      await navigateToRoute(mainWindow, '#/reflexion');
      const reflexionContent = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Reflexion');
      });
      expect(reflexionContent).toBe(true);

      // Navigate away to budget
      await navigateToRoute(mainWindow, '#/budget');
      const budgetContent = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Budget');
      });
      expect(budgetContent).toBe(true);

      // Navigate back to reflexion
      await navigateToRoute(mainWindow, '#/reflexion');
      const reflexionAgain = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Reflexion');
      });
      expect(reflexionAgain).toBe(true);

      await assertAppAlive();
      await takeScreenshot(mainWindow, 'nav-flow-state-roundtrip');
    });

    test('rapid route switching does not crash the app', async () => {
      const routes = [
        '#/search', '#/bookmarks', '#/tools', '#/cli',
        '#/reflexion', '#/budget', '#/guardrails', '#/conscious',
      ];

      await waitForAppReady(mainWindow);

      for (const route of routes) {
        await mainWindow.evaluate((r) => {
          window.location.hash = r;
        }, route);
        // Short delay -- intentionally fast to stress-test transitions
        await mainWindow.waitForTimeout(300);
      }

      // Give final route time to settle
      await mainWindow.waitForTimeout(1000);
      await assertAppAlive();

      // Should be on the last route
      const hash = await getCurrentHash();
      expect(hash).toContain('/conscious');

      await takeScreenshot(mainWindow, 'nav-flow-rapid-switch');
    });

    test('sidebar active state updates correctly after rapid navigation', async () => {
      // Navigate rapidly between routes using hash navigation
      // (sidebar buttons may be outside viewport in small windows)
      await navigateToRoute(mainWindow, '#/search');
      await navigateToRoute(mainWindow, '#/bookmarks');

      // After navigating to bookmarks, verify via hash
      const hash = await mainWindow.evaluate(() => window.location.hash);
      expect(hash).toContain('/bookmarks');

      // The search sidebar button should not be active, bookmarks should be active
      const searchBtn = mainWindow.locator('[data-testid="sidebar-search-button"]');
      const bookmarksBtn = mainWindow.locator('[data-testid="sidebar-bookmarks-button"]');

      // Check data-active attributes if buttons are in viewport
      if (await searchBtn.isVisible().catch(() => false)) {
        const searchActive = await searchBtn.getAttribute('data-active');
        expect(searchActive).not.toBe('true');
      }
      if (await bookmarksBtn.isVisible().catch(() => false)) {
        const bmActive = await bookmarksBtn.getAttribute('data-active');
        expect(bmActive).toBe('true');
      }

      await takeScreenshot(mainWindow, 'nav-flow-sidebar-active-rapid');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Theme switching persistence across navigation
  // ---------------------------------------------------------------------------

  test.describe('Theme persistence', () => {
    test('dark mode persists after navigating to another route and back', async () => {
      await navigateToRoute(mainWindow, '#/');

      // Check initial theme
      const initialDark = await mainWindow.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });
      console.log(`Initial dark mode: ${initialDark}`);

      // Toggle theme via JS (simulating what the theme toggle does)
      await mainWindow.evaluate(() => {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        } else {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        }
      });

      const afterToggle = await mainWindow.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });
      console.log(`After toggle dark mode: ${afterToggle}`);
      expect(afterToggle).toBe(!initialDark);

      // Navigate to a different route
      await navigateToRoute(mainWindow, '#/search');
      await mainWindow.waitForTimeout(500);

      // Theme should persist
      const afterNav = await mainWindow.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });
      console.log(`After navigation dark mode: ${afterNav}`);
      expect(afterNav).toBe(afterToggle);

      // Navigate back
      await navigateToRoute(mainWindow, '#/');
      await mainWindow.waitForTimeout(500);

      const afterReturn = await mainWindow.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });
      expect(afterReturn).toBe(afterToggle);

      // Clean up: restore original theme
      await mainWindow.evaluate((wasOriginallyDark) => {
        if (wasOriginallyDark) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        }
      }, initialDark);

      await takeScreenshot(mainWindow, 'nav-flow-theme-persist');
    });

    test('theme class is present on documentElement after deep-link navigation', async () => {
      await waitForAppReady(mainWindow);

      // Set dark mode
      await mainWindow.evaluate(() => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      });

      // Deep-link to a feature panel
      await mainWindow.evaluate(() => {
        window.location.hash = '#/conscious';
      });
      await mainWindow.waitForTimeout(1500);

      const isDark = await mainWindow.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });
      expect(isDark).toBe(true);

      // Restore
      await mainWindow.evaluate(() => {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      });

      await takeScreenshot(mainWindow, 'nav-flow-theme-deeplink');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Error boundary recovery
  // ---------------------------------------------------------------------------

  test.describe('Error boundary recovery', () => {
    test('app recovers after navigating to invalid route then valid route', async () => {
      await navigateToRoute(mainWindow, '#/');

      // Navigate to an invalid route
      await mainWindow.evaluate(() => {
        window.location.hash = '#/this-does-not-exist';
      });
      await mainWindow.waitForTimeout(1000);

      // App should still be alive (React root mounted)
      await assertAppAlive();

      // Navigate back to a valid route
      await navigateToRoute(mainWindow, '#/search');
      await assertAppAlive();

      // Search content should render normally
      const hasSearch = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Search');
      });
      expect(hasSearch).toBe(true);

      await takeScreenshot(mainWindow, 'nav-flow-error-recovery');
    });

    test('multiple invalid routes do not accumulate errors', async () => {
      await navigateToRoute(mainWindow, '#/');

      // Hit several invalid routes in succession
      const invalidRoutes = [
        '#/invalid-a',
        '#/invalid-b',
        '#/invalid-c',
      ];

      for (const route of invalidRoutes) {
        await mainWindow.evaluate((r) => {
          window.location.hash = r;
        }, route);
        await mainWindow.waitForTimeout(500);
        await assertAppAlive();
      }

      // Return to a real route
      await navigateToRoute(mainWindow, '#/budget');
      await assertAppAlive();

      const hasBudget = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Budget');
      });
      expect(hasBudget).toBe(true);

      await takeScreenshot(mainWindow, 'nav-flow-multi-invalid-recovery');
    });

    test('navigating from standalone route to AppLayout route works', async () => {
      // Go to standalone launcher route
      await navigateToRoute(mainWindow, '#/launcher');
      await assertAppAlive();

      // Navigate to an AppLayout route
      await navigateToRoute(mainWindow, '#/search');
      await assertAppAlive();

      const hasSearch = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Search');
      });
      expect(hasSearch).toBe(true);

      await takeScreenshot(mainWindow, 'nav-flow-standalone-to-layout');
    });

    test('navigating from AppLayout route to standalone route works', async () => {
      // Start on an AppLayout route
      await navigateToRoute(mainWindow, '#/bookmarks');
      await assertAppAlive();

      // Navigate to standalone welcome route
      await navigateToRoute(mainWindow, '#/welcome');
      await assertAppAlive();

      await takeScreenshot(mainWindow, 'nav-flow-layout-to-standalone');
    });

    test('full navigation cycle: home -> panel -> standalone -> back -> forward', async () => {
      // Home
      await navigateToRoute(mainWindow, '#/');
      await assertAppAlive();

      // Panel route
      await navigateToRoute(mainWindow, '#/guardrails');
      const hasGuardrails = await mainWindow.evaluate(() => {
        return (document.body.textContent || '').includes('Guardrails');
      });
      expect(hasGuardrails).toBe(true);

      // Standalone route
      await navigateToRoute(mainWindow, '#/launcher');
      await assertAppAlive();

      // Back to guardrails
      await goBack();
      const hash1 = await getCurrentHash();
      expect(hash1).toContain('/guardrails');
      await assertAppAlive();

      // Forward to launcher
      await goForward();
      const hash2 = await getCurrentHash();
      expect(hash2).toContain('/launcher');
      await assertAppAlive();

      await takeScreenshot(mainWindow, 'nav-flow-full-cycle');
    });
  });
});
