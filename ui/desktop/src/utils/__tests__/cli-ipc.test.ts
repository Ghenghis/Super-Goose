/**
 * cli-ipc.test.ts
 *
 * Tests for the CLI IPC handler module.
 *
 * Since cli-ipc.ts is an Electron main-process module that uses ipcMain,
 * child_process.spawn, fs, and https, we mock these Node/Electron APIs
 * and verify the module's exported functions and types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Use vi.hoisted so mocks are available when vi.mock factory runs (hoisted above imports).
const { mockHandlers, mockIpcMainHandle } = vi.hoisted(() => {
  const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const mockIpcMainHandle = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    mockHandlers.set(channel, handler);
  });
  return { mockHandlers, mockIpcMainHandle };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcMainHandle,
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
  },
}));

vi.mock('node:https', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('node:path', () => ({
  default: {
    join: (...args: string[]) => args.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    basename: (p: string) => p.split('/').pop() || '',
  },
}));

// Import after mocks
import { registerCLIHandlers, cleanupCLI } from '../../cli-ipc';
import type {
  BinaryPathResult,
  VersionCheckResult,
  CommandResult,
  SessionResult,
  LatestReleaseResult,
  PlatformInfoResult,
  ReleaseAsset,
} from '../../cli-ipc';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cli-ipc module exports', () => {
  it('exports registerCLIHandlers as a function', () => {
    expect(typeof registerCLIHandlers).toBe('function');
  });

  it('exports cleanupCLI as a function', () => {
    expect(typeof cleanupCLI).toBe('function');
  });
});

describe('registerCLIHandlers', () => {
  const mockMainWindow = {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as import('electron').BrowserWindow;

  beforeEach(() => {
    mockHandlers.clear();
    mockIpcMainHandle.mockClear();
    registerCLIHandlers(mockMainWindow);
  });

  it('registers all 8 IPC channels', () => {
    const registeredChannels = mockIpcMainHandle.mock.calls.map(
      (call: unknown[]) => call[0],
    );

    expect(registeredChannels).toContain('cli:get-binary-path');
    expect(registeredChannels).toContain('cli:check-version');
    expect(registeredChannels).toContain('cli:execute-command');
    expect(registeredChannels).toContain('cli:start-session');
    expect(registeredChannels).toContain('cli:send-input');
    expect(registeredChannels).toContain('cli:kill-session');
    expect(registeredChannels).toContain('cli:get-latest-release');
    expect(registeredChannels).toContain('cli:get-platform-info');
  });

  it('registers exactly 8 handlers', () => {
    expect(mockIpcMainHandle).toHaveBeenCalledTimes(8);
  });

  it('cli:get-binary-path handler returns a BinaryPathResult shape', async () => {
    const handler = mockHandlers.get('cli:get-binary-path');
    expect(handler).toBeDefined();

    const result = (await handler!()) as BinaryPathResult;

    // Since fs.existsSync is mocked to return false, found should be false
    expect(result).toHaveProperty('found');
    expect(result).toHaveProperty('path');
    expect(typeof result.found).toBe('boolean');
    expect(typeof result.path).toBe('string');
  });

  it('cli:get-platform-info handler returns platform info', async () => {
    const handler = mockHandlers.get('cli:get-platform-info');
    expect(handler).toBeDefined();

    const result = (await handler!()) as PlatformInfoResult;

    expect(result).toHaveProperty('platform');
    expect(result).toHaveProperty('arch');
    expect(result).toHaveProperty('homedir');
    expect(typeof result.platform).toBe('string');
    expect(typeof result.arch).toBe('string');
  });

  it('cli:send-input handler returns error when no session is active', async () => {
    const handler = mockHandlers.get('cli:send-input');
    expect(handler).toBeDefined();

    const result = (await handler!({}, 'test input')) as SessionResult;

    expect(result.success).toBe(false);
    expect(result.error).toBe('No active CLI session');
  });

  it('cli:kill-session handler returns error when no session is active', async () => {
    const handler = mockHandlers.get('cli:kill-session');
    expect(handler).toBeDefined();

    const result = (await handler!()) as SessionResult;

    expect(result.success).toBe(false);
    expect(result.error).toBe('No active session');
  });
});

describe('cleanupCLI', () => {
  it('can be called safely when no session exists', () => {
    // Should not throw
    expect(() => cleanupCLI()).not.toThrow();
  });
});

describe('exported type shapes (compile-time check)', () => {
  // These tests verify that the types exist and have the expected properties
  // by constructing conforming objects. If the types change, these will fail.

  it('BinaryPathResult has found and path fields', () => {
    const result: BinaryPathResult = { found: true, path: '/usr/bin/goose' };
    expect(result.found).toBe(true);
    expect(result.path).toBe('/usr/bin/goose');
  });

  it('VersionCheckResult has success and optional version/error', () => {
    const success: VersionCheckResult = { success: true, version: '1.0.0' };
    const failure: VersionCheckResult = { success: false, error: 'not found' };
    expect(success.version).toBe('1.0.0');
    expect(failure.error).toBe('not found');
  });

  it('CommandResult has success and optional stdout/stderr/code/error', () => {
    const result: CommandResult = {
      success: true,
      stdout: 'output',
      stderr: '',
      code: 0,
    };
    expect(result.success).toBe(true);
    expect(result.code).toBe(0);
  });

  it('SessionResult has success and optional error', () => {
    const result: SessionResult = { success: true };
    expect(result.success).toBe(true);
  });

  it('ReleaseAsset has name, url, and size', () => {
    const asset: ReleaseAsset = { name: 'goose.exe', url: 'https://example.com', size: 1024 };
    expect(asset.name).toBe('goose.exe');
    expect(asset.size).toBe(1024);
  });

  it('LatestReleaseResult has success and optional version/assets/error', () => {
    const result: LatestReleaseResult = {
      success: true,
      version: 'v1.24.05',
      assets: [{ name: 'goose.exe', url: 'https://example.com', size: 1024 }],
    };
    expect(result.version).toBe('v1.24.05');
    expect(result.assets).toHaveLength(1);
  });

  it('PlatformInfoResult has platform, arch, and homedir', () => {
    const result: PlatformInfoResult = {
      platform: 'win32',
      arch: 'x64',
      homedir: 'C:\\Users\\test',
    };
    expect(result.platform).toBe('win32');
  });
});
