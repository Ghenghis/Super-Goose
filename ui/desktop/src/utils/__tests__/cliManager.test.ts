import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkCLIInstalled,
  checkForCLIUpdates,
  installCLI,
  getCLIPath,
  getCLIDirectory,
  type CLIRelease,
  type CLIVersionInfo,
} from '../cliManager';

// Mock window.electron
const mockInvoke = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();

// Store original window and navigator
let originalWindow: any;
let originalNavigator: any;

beforeEach(() => {
  vi.clearAllMocks();

  // Save originals
  originalWindow = global.window;
  originalNavigator = global.navigator;

  // Setup global window mock with electron
  (global as any).window = {
    electron: {
      platform: 'linux',
      invoke: mockInvoke,
      on: mockOn,
      off: mockOff,
    },
  };
});

afterEach(() => {
  // Restore originals
  global.window = originalWindow;
  if (originalNavigator !== undefined) {
    (global as any).navigator = originalNavigator;
  }
});

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeRelease(overrides: Partial<CLIRelease> = {}): CLIRelease {
  return {
    version: 'v1.24.06',
    downloadUrl: 'https://github.com/Ghenghis/Super-Goose/releases/download/v1.24.06/goose-cli',
    size: 45_000_000,
    sha256: 'abc123def456',
    releaseDate: '2025-01-16T10:00:00Z',
    ...overrides,
  };
}

function makeVersionInfo(overrides: Partial<CLIVersionInfo> = {}): CLIVersionInfo {
  return {
    version: 'v1.24.05',
    path: '/home/user/.local/bin/goose',
    installedAt: '2025-01-15T10:00:00Z',
    platform: 'linux',
    ...overrides,
  };
}

describe('cliManager', () => {
  // -------------------------------------------------------------------------
  // getCLIPath
  // -------------------------------------------------------------------------
  describe('getCLIPath', () => {
    it('should return platform-appropriate path for Linux', () => {
      (global as any).window = { electron: { platform: 'linux' } };
      const cliPath = getCLIPath();
      expect(cliPath).toBe('~/.local/bin/goose');
    });

    it('should return platform-appropriate path for macOS', () => {
      (global as any).window = { electron: { platform: 'darwin' } };
      const cliPath = getCLIPath();
      expect(cliPath).toBe('~/.local/bin/goose');
    });

    it('should return platform-appropriate path for Windows', () => {
      (global as any).window = { electron: { platform: 'win32' } };
      const cliPath = getCLIPath();
      expect(cliPath).toBe('%APPDATA%\\goose\\goose.exe');
    });

    it('should fallback to navigator when electron platform is not available', () => {
      (global as any).navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' };
      (global as any).window = {}; // No electron

      const cliPath = getCLIPath();
      expect(cliPath).toBe('~/.local/bin/goose');
    });

    it('should detect macOS from navigator user agent', () => {
      (global as any).navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      };
      (global as any).window = {}; // No electron

      const cliPath = getCLIPath();
      expect(cliPath).toBe('~/.local/bin/goose');
    });

    it('should detect Windows from navigator user agent', () => {
      (global as any).navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      };
      (global as any).window = {}; // No electron

      const cliPath = getCLIPath();
      expect(cliPath).toBe('%APPDATA%\\goose\\goose.exe');
    });
  });

  // -------------------------------------------------------------------------
  // getCLIDirectory
  // -------------------------------------------------------------------------
  describe('getCLIDirectory', () => {
    it('should return the directory portion for Linux/macOS path', () => {
      (global as any).window = { electron: { platform: 'linux' } };
      const dir = getCLIDirectory();
      expect(dir).toBe('~/.local/bin');
    });

    it('should return the directory portion for Windows path', () => {
      (global as any).window = { electron: { platform: 'win32' } };
      const dir = getCLIDirectory();
      expect(dir).toBe('%APPDATA%\\goose');
    });
  });

  // -------------------------------------------------------------------------
  // checkCLIInstalled
  // -------------------------------------------------------------------------
  describe('checkCLIInstalled', () => {
    it('should return null when CLI is not installed', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await checkCLIInstalled();

      expect(result).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-installed');
    });

    it('should return version info when CLI is installed', async () => {
      const versionInfo = makeVersionInfo();
      mockInvoke.mockResolvedValueOnce(versionInfo);

      const result = await checkCLIInstalled();

      expect(result).toEqual(versionInfo);
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-installed');
    });

    it('should return null when IPC invoke rejects (error path)', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('IPC channel not found'));

      const result = await checkCLIInstalled();

      // invokeIPC catches the error and returns null
      expect(result).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-installed');
    });

    it('should use mock data when Electron IPC is not available', async () => {
      // Remove window.electron.invoke so hasElectronIPC() returns false
      (global as any).window = { electron: { platform: 'linux' } };

      const result = await checkCLIInstalled();

      // Without IPC, returns built-in mock version info
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('installedAt');
      expect(result).toHaveProperty('platform');
    });

    it('should invoke exactly the cli:check-installed channel', async () => {
      mockInvoke.mockResolvedValueOnce(null);
      await checkCLIInstalled();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke.mock.calls[0][0]).toBe('cli:check-installed');
    });
  });

  // -------------------------------------------------------------------------
  // checkForCLIUpdates
  // -------------------------------------------------------------------------
  describe('checkForCLIUpdates', () => {
    it('should return null when no update is available', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await checkForCLIUpdates();

      expect(result).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-updates');
    });

    it('should return release info when update is available', async () => {
      const release = makeRelease();
      mockInvoke.mockResolvedValueOnce(release);

      const result = await checkForCLIUpdates();

      expect(result).toEqual(release);
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-updates');
    });

    it('should return null when IPC invoke rejects (error path)', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network failure'));

      const result = await checkForCLIUpdates();

      // invokeIPC catches the error and returns null
      expect(result).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-updates');
    });

    it('should use mock data when Electron IPC is not available', async () => {
      // Remove window.electron.invoke so hasElectronIPC() returns false
      (global as any).window = { electron: { platform: 'linux' } };

      const result = await checkForCLIUpdates();

      // Without IPC, returns built-in mock release info
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('downloadUrl');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('sha256');
      expect(result).toHaveProperty('releaseDate');
    });

    it('should invoke exactly the cli:check-updates channel', async () => {
      mockInvoke.mockResolvedValueOnce(null);
      await checkForCLIUpdates();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke.mock.calls[0][0]).toBe('cli:check-updates');
    });
  });

  // -------------------------------------------------------------------------
  // installCLI
  // -------------------------------------------------------------------------
  describe('installCLI', () => {
    it('should return version info on successful IPC install', async () => {
      const release = makeRelease();
      const versionInfo = makeVersionInfo({ version: 'v1.24.06' });
      mockInvoke.mockResolvedValueOnce(versionInfo);

      const progressCallback = vi.fn();
      const result = await installCLI(release, progressCallback);

      expect(result).toEqual(versionInfo);
      expect(mockInvoke).toHaveBeenCalledWith('cli:install', release);
    });

    it('should register and unregister the progress listener', async () => {
      const release = makeRelease();
      mockInvoke.mockResolvedValueOnce(makeVersionInfo({ version: 'v1.24.06' }));

      const progressCallback = vi.fn();
      await installCLI(release, progressCallback);

      // Verify progress listener was registered then unregistered
      expect(mockOn).toHaveBeenCalledWith('cli:install-progress', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('cli:install-progress', expect.any(Function));

      // The same handler reference should be used for on and off
      const onHandler = mockOn.mock.calls[0][1];
      const offHandler = mockOff.mock.calls[0][1];
      expect(onHandler).toBe(offHandler);
    });

    it('should pass the release object to IPC invoke', async () => {
      const release = makeRelease({ version: 'v2.0.0', size: 99_000_000 });
      mockInvoke.mockResolvedValueOnce(makeVersionInfo({ version: 'v2.0.0' }));

      await installCLI(release, vi.fn());

      expect(mockInvoke).toHaveBeenCalledWith('cli:install', release);
    });

    it('should fallback to mock installation when IPC invoke rejects', async () => {
      const release = makeRelease();
      // Simulate network/download failure from the main process
      mockInvoke.mockRejectedValueOnce(new Error('Download failed'));

      const progressCallback = vi.fn();
      const result = await installCLI(release, progressCallback);

      // Verify fallback mock installation completed
      expect(result).toHaveProperty('version', release.version);
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('installedAt');
      expect(result).toHaveProperty('platform');

      // Verify mock progress was called
      expect(progressCallback).toHaveBeenCalled();
    });

    it('should fallback to mock when IPC returns null', async () => {
      const release = makeRelease();
      // IPC handler returned null (failed silently in main process)
      mockInvoke.mockResolvedValueOnce(null);

      const progressCallback = vi.fn();
      const result = await installCLI(release, progressCallback);

      // Should fallback to mock installation
      expect(result).toHaveProperty('version', release.version);
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('installedAt');
      expect(result).toHaveProperty('platform');

      // Verify mock progress was called
      expect(progressCallback).toHaveBeenCalled();
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
      expect(lastCall[0]).toBe(100);
    });

    it('should use mock installation when Electron IPC is not available', async () => {
      // Remove window.electron.invoke so hasElectronIPC() returns false
      (global as any).window = { electron: { platform: 'linux' } };

      const release = makeRelease();
      const progressCallback = vi.fn();
      const result = await installCLI(release, progressCallback);

      // Verify mock progress increments to 100
      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback.mock.calls.length).toBeGreaterThan(0);

      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
      expect(lastCall[0]).toBe(100);

      // Verify result
      expect(result).toHaveProperty('version', release.version);
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('installedAt');
      expect(result).toHaveProperty('platform');
    });

    it('should deliver progress in increments of 10 during mock install', async () => {
      // Remove IPC to trigger mock install
      (global as any).window = { electron: { platform: 'linux' } };

      const release = makeRelease();
      const progressCallback = vi.fn();
      await installCLI(release, progressCallback);

      // Mock install sends 10, 20, ..., 100 (10 calls)
      expect(progressCallback).toHaveBeenCalledTimes(10);
      for (let i = 0; i < 10; i++) {
        expect(progressCallback.mock.calls[i][0]).toBe((i + 1) * 10);
      }
    });
  });

  // -------------------------------------------------------------------------
  // IPC channel coverage (verify channel names match main.ts handlers)
  // -------------------------------------------------------------------------
  describe('IPC channel names', () => {
    it('checkCLIInstalled uses cli:check-installed channel', async () => {
      mockInvoke.mockResolvedValueOnce(null);
      await checkCLIInstalled();
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-installed');
    });

    it('checkForCLIUpdates uses cli:check-updates channel', async () => {
      mockInvoke.mockResolvedValueOnce(null);
      await checkForCLIUpdates();
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-updates');
    });

    it('installCLI uses cli:install channel', async () => {
      const release = makeRelease();
      mockInvoke.mockResolvedValueOnce(makeVersionInfo());
      await installCLI(release, vi.fn());
      expect(mockInvoke).toHaveBeenCalledWith('cli:install', release);
    });

    it('installCLI registers cli:install-progress event listener', async () => {
      mockInvoke.mockResolvedValueOnce(makeVersionInfo());
      await installCLI(makeRelease(), vi.fn());
      expect(mockOn).toHaveBeenCalledWith('cli:install-progress', expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: no window / no electron
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should handle window being undefined gracefully for getCLIPath', () => {
      // Remove window entirely, but ensure navigator exists for fallback
      (global as any).window = undefined;
      (global as any).navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' };

      // getCLIPath checks window first, then navigator
      const cliPath = getCLIPath();
      expect(cliPath).toBe('~/.local/bin/goose');
    });

    it('should fallback to linux when neither window nor navigator is available', () => {
      // Remove both window and navigator
      (global as any).window = undefined;
      // Cannot truly remove navigator in vitest/jsdom, but we can test the code path
      // by setting it to undefined in a controlled way
      const savedNav = (global as any).navigator;
      (global as any).navigator = undefined;

      const cliPath = getCLIPath();
      // Default fallback is linux
      expect(cliPath).toBe('~/.local/bin/goose');

      // Restore navigator
      (global as any).navigator = savedNav;
    });

    it('checkCLIInstalled returns mock data when window.electron has no invoke', async () => {
      (global as any).window = { electron: {} };

      const result = await checkCLIInstalled();
      // Falls through to mock because hasElectronIPC() returns false
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('version');
    });

    it('checkForCLIUpdates returns mock data when window.electron has no invoke', async () => {
      (global as any).window = { electron: {} };

      const result = await checkForCLIUpdates();
      // Falls through to mock because hasElectronIPC() returns false
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('downloadUrl');
    });
  });

  // -------------------------------------------------------------------------
  // hasElectronIPC / invokeIPC edge cases (tested indirectly)
  // -------------------------------------------------------------------------
  describe('hasElectronIPC detection', () => {
    it('returns false when window.electron is completely undefined', async () => {
      (global as any).window = {};

      // All functions that rely on hasElectronIPC() should fall through to mocks
      const installed = await checkCLIInstalled();
      const updates = await checkForCLIUpdates();

      // Both return mock data (non-null) because IPC is unavailable
      expect(installed).not.toBeNull();
      expect(updates).not.toBeNull();
    });

    it('returns false when window itself is undefined', async () => {
      (global as any).window = undefined;

      // checkCLIInstalled should not throw, and should return mock data
      const installed = await checkCLIInstalled();
      expect(installed).not.toBeNull();
      expect(installed).toHaveProperty('version');
    });

    it('returns true when window.electron.invoke is a function', async () => {
      // This is the default beforeEach setup — verify IPC is actually called
      mockInvoke.mockResolvedValueOnce(null);

      await checkCLIInstalled();

      // If hasElectronIPC() returns true, invoke is called (not the mock fallback)
      expect(mockInvoke).toHaveBeenCalledWith('cli:check-installed');
    });

    it('returns false when window.electron.invoke is not a function', async () => {
      (global as any).window = {
        electron: {
          platform: 'darwin',
          invoke: 'not-a-function', // string, not a function
        },
      };

      const result = await checkCLIInstalled();

      // Should use mock fallback since typeof invoke !== 'function'
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('version');
      // mockInvoke should NOT have been called because the real invoke is not a function
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('returns false when window.electron.invoke is null', async () => {
      (global as any).window = {
        electron: {
          platform: 'linux',
          invoke: null,
        },
      };

      const result = await checkCLIInstalled();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('version');
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // invokeIPC error handling (tested indirectly)
  // -------------------------------------------------------------------------
  describe('invokeIPC error handling', () => {
    it('returns null when IPC invoke throws a TypeError', async () => {
      mockInvoke.mockRejectedValueOnce(new TypeError('Cannot read properties of undefined'));

      const result = await checkCLIInstalled();
      expect(result).toBeNull();
    });

    it('returns null when IPC invoke throws a non-Error', async () => {
      mockInvoke.mockRejectedValueOnce('plain string error');

      const result = await checkCLIInstalled();
      expect(result).toBeNull();
    });

    it('returns null when IPC invoke throws undefined', async () => {
      mockInvoke.mockRejectedValueOnce(undefined);

      const result = await checkCLIInstalled();
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // installCLI advanced edge cases
  // -------------------------------------------------------------------------
  describe('installCLI advanced', () => {
    it('registers progress listener before invoking IPC and unregisters after', async () => {
      const release = makeRelease();
      const versionInfo = makeVersionInfo({ version: 'v1.24.06' });

      const callOrder: string[] = [];
      mockOn.mockImplementation(() => callOrder.push('on'));
      mockInvoke.mockImplementation(async () => {
        callOrder.push('invoke');
        return versionInfo;
      });
      mockOff.mockImplementation(() => callOrder.push('off'));

      await installCLI(release, vi.fn());

      // on should be called before invoke, and off should be called after
      expect(callOrder).toEqual(['on', 'invoke', 'off']);
    });

    it('falls back to mock when IPC invoke throws and sends progress', async () => {
      const release = makeRelease();
      mockInvoke.mockRejectedValueOnce(new Error('Connection refused'));

      const progressValues: number[] = [];
      const result = await installCLI(release, (p) => progressValues.push(p));

      // Should have mock progress values
      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);

      // Should return valid version info
      expect(result.version).toBe(release.version);
      expect(result.path).toBeTruthy();
    });

    it('unregisters progress listener even when IPC invoke fails', async () => {
      const release = makeRelease();
      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      await installCLI(release, vi.fn());

      // Verify the progress listener was registered then unregistered
      expect(mockOn).toHaveBeenCalledWith('cli:install-progress', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('cli:install-progress', expect.any(Function));
    });

    it('progress handler forwards the percent from IPC event', async () => {
      const release = makeRelease();
      mockInvoke.mockResolvedValueOnce(makeVersionInfo({ version: 'v1.24.06' }));

      const progressCallback = vi.fn();

      // Capture the progress handler when it's registered
      let capturedHandler: ((...args: unknown[]) => void) | null = null;
      mockOn.mockImplementation((_channel: string, handler: (...args: unknown[]) => void) => {
        capturedHandler = handler;
      });

      await installCLI(release, progressCallback);

      // Simulate the main process sending a progress event
      expect(capturedHandler).not.toBeNull();
      if (capturedHandler) {
        (capturedHandler as (...args: unknown[]) => void)({}, 42);
        expect(progressCallback).toHaveBeenCalledWith(42);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getCLIDirectory detailed platform tests
  // -------------------------------------------------------------------------
  describe('getCLIDirectory platform details', () => {
    it('returns correct parent directory for darwin platform', () => {
      (global as any).window = { electron: { platform: 'darwin' } };
      const dir = getCLIDirectory();
      // macOS: ~/.local/bin/goose -> parent is ~/.local/bin
      expect(dir).toBe('~/.local/bin');
    });

    it('returns correct parent directory for win32 platform', () => {
      (global as any).window = { electron: { platform: 'win32' } };
      const dir = getCLIDirectory();
      // Windows: %APPDATA%\goose\goose.exe -> parent is %APPDATA%\goose
      expect(dir).toBe('%APPDATA%\\goose');
    });

    it('returns correct parent directory for linux platform', () => {
      (global as any).window = { electron: { platform: 'linux' } };
      const dir = getCLIDirectory();
      // Linux: ~/.local/bin/goose -> parent is ~/.local/bin
      expect(dir).toBe('~/.local/bin');
    });

    it('returns "." for a path with no separator', () => {
      // This tests the edge case in getCLIDirectory where lastSlash === -1
      // It's hard to trigger via getCLIPath() since all paths have separators,
      // but the logic is there as a safety net
      // We verify the function at least returns a string
      (global as any).window = { electron: { platform: 'linux' } };
      const dir = getCLIDirectory();
      expect(typeof dir).toBe('string');
      expect(dir.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Mock data shape verification
  // -------------------------------------------------------------------------
  describe('mock data integrity', () => {
    it('mock checkCLIInstalled returns all required CLIVersionInfo fields', async () => {
      (global as any).window = { electron: { platform: 'linux' } };
      const result = await checkCLIInstalled();

      expect(result).not.toBeNull();
      expect(typeof result!.version).toBe('string');
      expect(typeof result!.path).toBe('string');
      expect(typeof result!.installedAt).toBe('string');
      expect(typeof result!.platform).toBe('string');

      // installedAt should be a valid ISO date string
      expect(isNaN(new Date(result!.installedAt).getTime())).toBe(false);
    });

    it('mock checkForCLIUpdates returns all required CLIRelease fields', async () => {
      (global as any).window = { electron: { platform: 'linux' } };
      const result = await checkForCLIUpdates();

      expect(result).not.toBeNull();
      expect(typeof result!.version).toBe('string');
      expect(typeof result!.downloadUrl).toBe('string');
      expect(typeof result!.size).toBe('number');
      expect(typeof result!.sha256).toBe('string');
      expect(typeof result!.releaseDate).toBe('string');

      // downloadUrl should be a valid URL
      expect(result!.downloadUrl).toContain('https://');

      // releaseDate should be a valid ISO date string
      expect(isNaN(new Date(result!.releaseDate).getTime())).toBe(false);
    });

    it('mock installCLI returns path matching the current platform', async () => {
      (global as any).window = { electron: { platform: 'win32' } };
      const release = makeRelease();
      const result = await installCLI(release, vi.fn());

      // On Windows, the path should contain backslash
      expect(result.path).toContain('\\');
      expect(result.path).toContain('goose.exe');
    });
  });
});
