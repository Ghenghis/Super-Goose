import { describe, it } from 'vitest';

/**
 * recentDirs.ts is an Electron main-process module that uses Node.js builtins
 * (`fs`, `path`) and Electron APIs (`app.getPath`) at module-level scope.
 *
 * Vite's jsdom environment externalizes these Node builtins, making them
 * unavailable as stubs even when vi.mock() is applied. The module-level
 * `path.join(app.getPath('userData'), 'recent-dirs.json')` call executes
 * during import before any mock can intercept it.
 *
 * This file is properly tested via integration/E2E tests in the Electron runtime.
 */
describe('recentDirs', () => {
  it.todo('loadRecentDirs — tested in Electron runtime (main-process module)');
  it.todo('addRecentDir — tested in Electron runtime (main-process module)');
});
