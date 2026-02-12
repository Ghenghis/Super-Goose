import { describe, it, expect, vi, beforeEach } from 'vitest';

// autoUpdater.ts is an Electron main-process module that imports electron, electron-updater,
// node:path, node:fs/promises, logger, githubUpdater, recentDirs, etc.
// We can only meaningfully test the exported pure functions. The module itself
// requires heavy mocking of Electron internals.

// Mock ALL electron and node modules before import
vi.mock('electron-updater', () => ({
  autoUpdater: {
    currentVersion: { version: '1.0.0' },
    setFeedURL: vi.fn(),
    getFeedURL: vi.fn(() => 'https://github.com/block/goose'),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    forceDevUpdateConfig: false,
    channel: 'latest',
    allowPrerelease: false,
    allowDowngrade: false,
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  },
  nativeImage: { createFromPath: vi.fn(() => ({ setTemplateImage: vi.fn() })) },
  Tray: vi.fn(),
  shell: { showItemInFolder: vi.fn() },
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/tmp'),
    getAppPath: vi.fn(() => '/tmp/app'),
    isPackaged: false,
    quit: vi.fn(),
  },
  dialog: { showMessageBox: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  Notification: vi.fn(() => ({ show: vi.fn() })),
  MenuItemConstructorOptions: {},
}));

vi.mock('../logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../githubUpdater', () => ({
  githubUpdater: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
  },
}));

vi.mock('../recentDirs', () => ({
  loadRecentDirs: vi.fn(() => []),
}));

vi.mock('../conversionUtils', () => ({
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock('../analytics', () => ({
  trackUpdateCheckStarted: vi.fn(),
  trackUpdateCheckCompleted: vi.fn(),
  trackUpdateDownloadStarted: vi.fn(),
  trackUpdateDownloadProgress: vi.fn(),
  trackUpdateDownloadCompleted: vi.fn(),
  trackUpdateInstallInitiated: vi.fn(),
}));

// autoUpdater.ts uses `import * as path from 'path'` and `import * as fs from 'fs/promises'`
// and logger.ts uses `import path from 'node:path'` - all need mocks for jsdom
vi.mock('path', () => ({
  default: { join: vi.fn((...parts: string[]) => parts.join('/')) },
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

vi.mock('node:path', () => ({
  default: { join: vi.fn((...parts: string[]) => parts.join('/')) },
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
  access: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

// Import the module once at the top level. Since vi.mock is hoisted,
// all mocks are in place before the import runs.
import {
  registerUpdateIpcHandlers,
  setupAutoUpdater,
  getUpdateAvailable,
  setTrayRef,
  updateTrayMenu,
} from '../autoUpdater';

describe('autoUpdater module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can be imported without throwing', () => {
    expect(registerUpdateIpcHandlers).toBeDefined();
    expect(setupAutoUpdater).toBeDefined();
  });

  it('exports registerUpdateIpcHandlers function', () => {
    expect(typeof registerUpdateIpcHandlers).toBe('function');
  });

  it('exports setupAutoUpdater function', () => {
    expect(typeof setupAutoUpdater).toBe('function');
  });

  it('exports getUpdateAvailable function', () => {
    expect(typeof getUpdateAvailable).toBe('function');
  });

  it('getUpdateAvailable returns false by default', () => {
    expect(getUpdateAvailable()).toBe(false);
  });

  it('exports setTrayRef function', () => {
    expect(typeof setTrayRef).toBe('function');
  });

  it('exports updateTrayMenu function', () => {
    expect(typeof updateTrayMenu).toBe('function');
  });

  it('registerUpdateIpcHandlers registers IPC handlers on first call', async () => {
    const { ipcMain } = await import('electron');
    registerUpdateIpcHandlers();
    // Should have registered handlers for check-for-updates, download-update,
    // install-update, get-current-version, get-update-state, is-using-github-fallback
    expect(ipcMain.handle).toHaveBeenCalled();
  });
});
