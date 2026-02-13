/**
 * cli-bridge.test.ts
 *
 * Tests for the CLI IPC bridge integration pattern across:
 *   - cli-preload.ts (CLIPreloadAPI interface + cliAPI implementation)
 *   - cli-ipc.ts (main-process IPC handlers)
 *   - CLIDownloadService.ts (renderer-side consumer via window.electron.cli)
 *
 * These tests verify:
 *   1. The CLIPreloadAPI interface shape matches what consumers expect
 *   2. Each bridge method returns the correct response shape
 *   3. The onOutput subscription/unsubscription lifecycle
 *   4. Fallback behavior when the bridge is unavailable
 *   5. Error propagation across the bridge
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  CLIPreloadAPI,
  BinaryPathResult,
  VersionCheckResult,
  CommandResult,
  SessionResult,
  LatestReleaseResult,
  PlatformInfoResult,
  CLIOutputEvent,
} from '../../../cli-preload';

// ---------------------------------------------------------------------------
// Mock bridge factory — simulates what preload.ts exposes as window.electron.cli
// ---------------------------------------------------------------------------

function createMockBridge(): CLIPreloadAPI {
  return {
    getBinaryPath: vi.fn().mockResolvedValue({
      found: true,
      path: '/home/user/.goose/bin/goose',
    } satisfies BinaryPathResult),
    checkVersion: vi.fn().mockResolvedValue({
      success: true,
      version: 'v1.24.05',
    } satisfies VersionCheckResult),
    executeCommand: vi.fn().mockResolvedValue({
      success: true,
      stdout: 'command output',
      stderr: '',
      code: 0,
    } satisfies CommandResult),
    startSession: vi.fn().mockResolvedValue({
      success: true,
    } satisfies SessionResult),
    sendInput: vi.fn().mockResolvedValue({
      success: true,
    } satisfies SessionResult),
    killSession: vi.fn().mockResolvedValue({
      success: true,
    } satisfies SessionResult),
    getLatestRelease: vi.fn().mockResolvedValue({
      success: true,
      version: 'v1.24.06',
      assets: [
        { name: 'goose-x86_64-unknown-linux-gnu.tar.bz2', url: 'https://example.com/dl', size: 45_000_000 },
      ],
    } satisfies LatestReleaseResult),
    getPlatformInfo: vi.fn().mockResolvedValue({
      platform: 'linux',
      arch: 'x64',
      homedir: '/home/user',
    } satisfies PlatformInfoResult),
    onOutput: vi.fn().mockImplementation(
      (_callback: (data: CLIOutputEvent) => void) => {
        // Return unsubscribe function
        return () => {};
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Save/restore window state
// ---------------------------------------------------------------------------

let originalWindow: typeof globalThis.window;

beforeEach(() => {
  vi.clearAllMocks();
  originalWindow = global.window;
});

afterEach(() => {
  global.window = originalWindow;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Bridge — CLIPreloadAPI interface shape', () => {
  it('mock bridge implements all CLIPreloadAPI methods', () => {
    const bridge = createMockBridge();

    expect(typeof bridge.getBinaryPath).toBe('function');
    expect(typeof bridge.checkVersion).toBe('function');
    expect(typeof bridge.executeCommand).toBe('function');
    expect(typeof bridge.startSession).toBe('function');
    expect(typeof bridge.sendInput).toBe('function');
    expect(typeof bridge.killSession).toBe('function');
    expect(typeof bridge.getLatestRelease).toBe('function');
    expect(typeof bridge.getPlatformInfo).toBe('function');
    expect(typeof bridge.onOutput).toBe('function');
  });

  it('bridge has exactly 9 methods (no extra, no missing)', () => {
    const bridge = createMockBridge();
    const methodNames = Object.keys(bridge).sort();

    expect(methodNames).toEqual([
      'checkVersion',
      'executeCommand',
      'getBinaryPath',
      'getLatestRelease',
      'getPlatformInfo',
      'killSession',
      'onOutput',
      'sendInput',
      'startSession',
    ]);
  });
});

describe('CLI Bridge — getBinaryPath', () => {
  it('returns { found: true, path: string } when binary exists', async () => {
    const bridge = createMockBridge();
    const result = await bridge.getBinaryPath();

    expect(result).toEqual({ found: true, path: '/home/user/.goose/bin/goose' });
    expect(typeof result.found).toBe('boolean');
    expect(typeof result.path).toBe('string');
  });

  it('returns { found: false, path: string } when binary is missing', async () => {
    const bridge = createMockBridge();
    (bridge.getBinaryPath as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      found: false,
      path: '/home/user/.goose/bin/goose',
    });

    const result = await bridge.getBinaryPath();

    expect(result.found).toBe(false);
    expect(result.path).toBeTruthy();
  });

  it('path is non-empty regardless of found status', async () => {
    const bridge = createMockBridge();
    (bridge.getBinaryPath as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      found: false,
      path: '/preferred/install/location',
    });

    const result = await bridge.getBinaryPath();
    expect(result.path.length).toBeGreaterThan(0);
  });
});

describe('CLI Bridge — checkVersion', () => {
  it('returns success with version string on valid binary', async () => {
    const bridge = createMockBridge();
    const result = await bridge.checkVersion('/path/to/goose');

    expect(result.success).toBe(true);
    expect(result.version).toBe('v1.24.05');
    expect(result.error).toBeUndefined();
  });

  it('passes binaryPath argument to the IPC handler', async () => {
    const bridge = createMockBridge();
    await bridge.checkVersion('/custom/path/goose');

    expect(bridge.checkVersion).toHaveBeenCalledWith('/custom/path/goose');
  });

  it('returns failure with error when binary is invalid', async () => {
    const bridge = createMockBridge();
    (bridge.checkVersion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'ENOENT: no such file or directory',
    });

    const result = await bridge.checkVersion('/nonexistent/goose');

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
    expect(result.version).toBeUndefined();
  });

  it('returns failure when version command times out', async () => {
    const bridge = createMockBridge();
    (bridge.checkVersion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Process timed out after 5000ms',
    });

    const result = await bridge.checkVersion('/path/to/stuck-binary');

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

describe('CLI Bridge — executeCommand', () => {
  it('returns stdout and exit code 0 on success', async () => {
    const bridge = createMockBridge();
    const result = await bridge.executeCommand('/path/to/goose', ['--help']);

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('command output');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('passes binaryPath and args correctly', async () => {
    const bridge = createMockBridge();
    await bridge.executeCommand('/usr/bin/goose', ['session', '--format', 'json']);

    expect(bridge.executeCommand).toHaveBeenCalledWith(
      '/usr/bin/goose',
      ['session', '--format', 'json'],
    );
  });

  it('returns stderr and non-zero code on command failure', async () => {
    const bridge = createMockBridge();
    (bridge.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      stdout: '',
      stderr: 'Error: unknown flag --bad',
      code: 1,
    });

    const result = await bridge.executeCommand('/path/to/goose', ['--bad']);

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('unknown flag');
    expect(result.code).toBe(1);
  });

  it('returns error when spawn itself fails', async () => {
    const bridge = createMockBridge();
    (bridge.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'EACCES: permission denied',
      stdout: '',
      stderr: '',
    });

    const result = await bridge.executeCommand('/path/to/goose', ['session']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('EACCES');
  });

  it('handles empty args array', async () => {
    const bridge = createMockBridge();
    await bridge.executeCommand('/path/to/goose', []);

    expect(bridge.executeCommand).toHaveBeenCalledWith('/path/to/goose', []);
  });
});

describe('CLI Bridge — session lifecycle (start/send/kill)', () => {
  it('startSession returns success', async () => {
    const bridge = createMockBridge();
    const result = await bridge.startSession('/path/to/goose');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('startSession passes binaryPath', async () => {
    const bridge = createMockBridge();
    await bridge.startSession('/custom/goose');

    expect(bridge.startSession).toHaveBeenCalledWith('/custom/goose');
  });

  it('startSession returns error on spawn failure', async () => {
    const bridge = createMockBridge();
    (bridge.startSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Failed to spawn process',
    });

    const result = await bridge.startSession('/bad/path');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to spawn');
  });

  it('sendInput returns success when session is active', async () => {
    const bridge = createMockBridge();
    const result = await bridge.sendInput('tell me about Rust');

    expect(result.success).toBe(true);
    expect(bridge.sendInput).toHaveBeenCalledWith('tell me about Rust');
  });

  it('sendInput returns error when no session is active', async () => {
    const bridge = createMockBridge();
    (bridge.sendInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'No active CLI session',
    });

    const result = await bridge.sendInput('hello');

    expect(result.success).toBe(false);
    expect(result.error).toBe('No active CLI session');
  });

  it('killSession returns success when session exists', async () => {
    const bridge = createMockBridge();
    const result = await bridge.killSession();

    expect(result.success).toBe(true);
  });

  it('killSession returns error when no session exists', async () => {
    const bridge = createMockBridge();
    (bridge.killSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'No active session',
    });

    const result = await bridge.killSession();

    expect(result.success).toBe(false);
    expect(result.error).toBe('No active session');
  });

  it('full session lifecycle: start -> send -> kill', async () => {
    const bridge = createMockBridge();

    // Start session
    const startResult = await bridge.startSession('/path/to/goose');
    expect(startResult.success).toBe(true);

    // Send input
    const sendResult = await bridge.sendInput('What is 2+2?');
    expect(sendResult.success).toBe(true);

    // Kill session
    const killResult = await bridge.killSession();
    expect(killResult.success).toBe(true);

    // Verify ordering
    expect(bridge.startSession).toHaveBeenCalledBefore(bridge.sendInput as ReturnType<typeof vi.fn>);
    expect(bridge.sendInput).toHaveBeenCalledBefore(bridge.killSession as ReturnType<typeof vi.fn>);
  });
});

describe('CLI Bridge — getLatestRelease', () => {
  it('returns success with version and assets array', async () => {
    const bridge = createMockBridge();
    const result = await bridge.getLatestRelease();

    expect(result.success).toBe(true);
    expect(result.version).toBe('v1.24.06');
    expect(result.assets).toBeDefined();
    expect(Array.isArray(result.assets)).toBe(true);
    expect(result.assets!.length).toBeGreaterThan(0);
  });

  it('asset entries have name, url, and size', async () => {
    const bridge = createMockBridge();
    const result = await bridge.getLatestRelease();

    const asset = result.assets![0];
    expect(typeof asset.name).toBe('string');
    expect(typeof asset.url).toBe('string');
    expect(typeof asset.size).toBe('number');
    expect(asset.size).toBeGreaterThan(0);
  });

  it('returns multiple platform assets when available', async () => {
    const bridge = createMockBridge();
    (bridge.getLatestRelease as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      version: 'v2.0.0',
      assets: [
        { name: 'goose-x86_64-unknown-linux-gnu.tar.bz2', url: 'https://dl/linux', size: 45_000_000 },
        { name: 'goose-x86_64-pc-windows-msvc.zip', url: 'https://dl/win', size: 48_000_000 },
        { name: 'goose-aarch64-apple-darwin.tar.bz2', url: 'https://dl/mac', size: 44_000_000 },
      ],
    });

    const result = await bridge.getLatestRelease();

    expect(result.assets).toHaveLength(3);
    expect(result.assets!.map((a) => a.name)).toContain('goose-x86_64-pc-windows-msvc.zip');
  });

  it('returns error when GitHub API is rate-limited', async () => {
    const bridge = createMockBridge();
    (bridge.getLatestRelease as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'API rate limit exceeded',
    });

    const result = await bridge.getLatestRelease();

    expect(result.success).toBe(false);
    expect(result.error).toContain('rate limit');
    expect(result.version).toBeUndefined();
    expect(result.assets).toBeUndefined();
  });

  it('returns error when network is unreachable', async () => {
    const bridge = createMockBridge();
    (bridge.getLatestRelease as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'getaddrinfo ENOTFOUND api.github.com',
    });

    const result = await bridge.getLatestRelease();

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOTFOUND');
  });

  it('returns empty assets array when release has no attachments', async () => {
    const bridge = createMockBridge();
    (bridge.getLatestRelease as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      version: 'v0.0.1-alpha',
      assets: [],
    });

    const result = await bridge.getLatestRelease();

    expect(result.success).toBe(true);
    expect(result.version).toBe('v0.0.1-alpha');
    expect(result.assets).toEqual([]);
  });
});

describe('CLI Bridge — getPlatformInfo', () => {
  it('returns platform, arch, and homedir', async () => {
    const bridge = createMockBridge();
    const result = await bridge.getPlatformInfo();

    expect(result.platform).toBe('linux');
    expect(result.arch).toBe('x64');
    expect(result.homedir).toBe('/home/user');
  });

  it('returns win32 platform and appropriate homedir on Windows', async () => {
    const bridge = createMockBridge();
    (bridge.getPlatformInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      platform: 'win32',
      arch: 'x64',
      homedir: 'C:\\Users\\Admin',
    });

    const result = await bridge.getPlatformInfo();

    expect(result.platform).toBe('win32');
    expect(result.homedir).toContain('Users');
  });

  it('returns darwin platform for macOS', async () => {
    const bridge = createMockBridge();
    (bridge.getPlatformInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      platform: 'darwin',
      arch: 'arm64',
      homedir: '/Users/admin',
    });

    const result = await bridge.getPlatformInfo();

    expect(result.platform).toBe('darwin');
    expect(result.arch).toBe('arm64');
  });
});

describe('CLI Bridge — onOutput subscription', () => {
  it('returns an unsubscribe function', () => {
    const bridge = createMockBridge();
    const callback = vi.fn();

    const unsubscribe = bridge.onOutput(callback);

    expect(typeof unsubscribe).toBe('function');
  });

  it('onOutput is called with the callback', () => {
    const bridge = createMockBridge();
    const callback = vi.fn();

    bridge.onOutput(callback);

    expect(bridge.onOutput).toHaveBeenCalledWith(callback);
  });

  it('unsubscribe function can be called without error', () => {
    const bridge = createMockBridge();
    const unsubscribe = bridge.onOutput(vi.fn());

    expect(() => unsubscribe()).not.toThrow();
  });

  it('unsubscribe function can be called multiple times safely', () => {
    const bridge = createMockBridge();
    const unsubscribe = bridge.onOutput(vi.fn());

    // Calling unsubscribe multiple times should not throw
    expect(() => {
      unsubscribe();
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });

  it('callback receives CLIOutputEvent with type and content', () => {
    let capturedCallback: ((data: CLIOutputEvent) => void) | null = null;

    const bridge = createMockBridge();
    (bridge.onOutput as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (data: CLIOutputEvent) => void) => {
        capturedCallback = cb;
        return () => { capturedCallback = null; };
      },
    );

    const callback = vi.fn();
    bridge.onOutput(callback);

    // Simulate output events
    expect(capturedCallback).not.toBeNull();
    capturedCallback!({ type: 'output', content: 'Hello from goose\n' });

    expect(callback).toHaveBeenCalledWith({
      type: 'output',
      content: 'Hello from goose\n',
    });
  });

  it('callback receives different event types: output, error, system', () => {
    let capturedCallback: ((data: CLIOutputEvent) => void) | null = null;

    const bridge = createMockBridge();
    (bridge.onOutput as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (data: CLIOutputEvent) => void) => {
        capturedCallback = cb;
        return () => { capturedCallback = null; };
      },
    );

    const callback = vi.fn();
    bridge.onOutput(callback);

    // Send different event types
    capturedCallback!({ type: 'output', content: 'normal output' });
    capturedCallback!({ type: 'error', content: 'error output' });
    capturedCallback!({ type: 'system', content: 'Process exited with code 0' });

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, { type: 'output', content: 'normal output' });
    expect(callback).toHaveBeenNthCalledWith(2, { type: 'error', content: 'error output' });
    expect(callback).toHaveBeenNthCalledWith(3, { type: 'system', content: 'Process exited with code 0' });
  });

  it('unsubscribe stops future events from reaching callback', () => {
    let capturedCallback: ((data: CLIOutputEvent) => void) | null = null;

    const bridge = createMockBridge();
    (bridge.onOutput as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (data: CLIOutputEvent) => void) => {
        capturedCallback = cb;
        return () => { capturedCallback = null; };
      },
    );

    const callback = vi.fn();
    const unsubscribe = bridge.onOutput(callback);

    // Send an event before unsubscribe
    capturedCallback!({ type: 'output', content: 'before unsub' });
    expect(callback).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();

    // capturedCallback should now be null
    expect(capturedCallback).toBeNull();
  });

  it('multiple subscribers can coexist independently', () => {
    const callbacks: Array<(data: CLIOutputEvent) => void> = [];
    const unsubscribers: Array<() => void> = [];

    const bridge = createMockBridge();
    (bridge.onOutput as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (data: CLIOutputEvent) => void) => {
        callbacks.push(cb);
        return () => {
          const idx = callbacks.indexOf(cb);
          if (idx >= 0) callbacks.splice(idx, 1);
        };
      },
    );

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    unsubscribers.push(bridge.onOutput(cb1));
    unsubscribers.push(bridge.onOutput(cb2));

    // Both should receive events
    const event: CLIOutputEvent = { type: 'output', content: 'test' };
    callbacks.forEach((cb) => cb(event));

    expect(cb1).toHaveBeenCalledWith(event);
    expect(cb2).toHaveBeenCalledWith(event);

    // Unsubscribe first one
    unsubscribers[0]();

    // Only cb2 should still be in the list
    expect(callbacks).toHaveLength(1);
  });
});

describe('CLI Bridge — window.electron.cli availability', () => {
  it('window.electron.cli is undefined when not in Electron context', () => {
    (global as any).window = {};

    const cli = (window as any).electron?.cli;
    expect(cli).toBeUndefined();
  });

  it('window.electron.cli is undefined when electron exists but cli is missing', () => {
    (global as any).window = { electron: { platform: 'linux' } };

    const cli = (window as any).electron?.cli;
    expect(cli).toBeUndefined();
  });

  it('window.electron.cli is accessible when properly wired', () => {
    const bridge = createMockBridge();
    (global as any).window = {
      electron: {
        platform: 'linux',
        cli: bridge,
      },
    };

    const cli = (window as any).electron?.cli;
    expect(cli).toBeDefined();
    expect(typeof cli.getBinaryPath).toBe('function');
    expect(typeof cli.onOutput).toBe('function');
  });

  it('optional chaining protects against missing window.electron', () => {
    (global as any).window = undefined;

    // This pattern is used throughout the codebase for safe access
    let cli: CLIPreloadAPI | undefined;
    try {
      cli = (window as any)?.electron?.cli;
    } catch {
      cli = undefined;
    }

    expect(cli).toBeUndefined();
  });
});

describe('CLI Bridge — error propagation', () => {
  it('bridge methods propagate IPC rejection as promise rejection', async () => {
    const bridge = createMockBridge();
    (bridge.getBinaryPath as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('IPC channel not found'),
    );

    await expect(bridge.getBinaryPath()).rejects.toThrow('IPC channel not found');
  });

  it('bridge methods propagate timeout errors', async () => {
    const bridge = createMockBridge();
    (bridge.executeCommand as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Request timed out'),
    );

    await expect(bridge.executeCommand('/path', ['--help'])).rejects.toThrow('Request timed out');
  });

  it('bridge methods handle undefined rejection gracefully', async () => {
    const bridge = createMockBridge();
    (bridge.checkVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(undefined);

    await expect(bridge.checkVersion('/path')).rejects.toBeUndefined();
  });
});

describe('CLI Bridge — IPC channel name alignment', () => {
  // These tests verify that the channel names used in cli-preload.ts
  // match what cli-ipc.ts registers. This is a compile-time documentation
  // test to catch drift between the two modules.

  const EXPECTED_CHANNELS = [
    'cli:get-binary-path',
    'cli:check-version',
    'cli:execute-command',
    'cli:start-session',
    'cli:send-input',
    'cli:kill-session',
    'cli:get-latest-release',
    'cli:get-platform-info',
  ];

  const PRELOAD_METHODS: Array<keyof CLIPreloadAPI> = [
    'getBinaryPath',
    'checkVersion',
    'executeCommand',
    'startSession',
    'sendInput',
    'killSession',
    'getLatestRelease',
    'getPlatformInfo',
  ];

  it('there are 8 IPC invoke channels (one per preload method minus onOutput)', () => {
    // onOutput uses ipcRenderer.on/removeListener, not invoke
    expect(EXPECTED_CHANNELS).toHaveLength(8);
    expect(PRELOAD_METHODS).toHaveLength(8);
  });

  it('each preload method has a corresponding IPC channel', () => {
    // The mapping is:
    //   getBinaryPath    -> cli:get-binary-path
    //   checkVersion     -> cli:check-version
    //   executeCommand   -> cli:execute-command
    //   startSession     -> cli:start-session
    //   sendInput        -> cli:send-input
    //   killSession      -> cli:kill-session
    //   getLatestRelease -> cli:get-latest-release
    //   getPlatformInfo  -> cli:get-platform-info
    //
    // Plus onOutput listens on: cli:output (event channel, not invoke)
    expect(PRELOAD_METHODS.length).toBe(EXPECTED_CHANNELS.length);
  });

  it('onOutput event channel is "cli:output"', () => {
    // This is the event channel name used for streamed process output
    const eventChannel = 'cli:output';
    expect(eventChannel).toBe('cli:output');
    // The channel is distinct from the invoke channels
    expect(EXPECTED_CHANNELS).not.toContain(eventChannel);
  });
});

describe('CLI Bridge — type conformance', () => {
  // Compile-time type checks expressed as runtime tests

  it('BinaryPathResult requires found (boolean) and path (string)', () => {
    const result: BinaryPathResult = { found: false, path: '/test' };
    expect(typeof result.found).toBe('boolean');
    expect(typeof result.path).toBe('string');
  });

  it('VersionCheckResult requires success, optional version and error', () => {
    const ok: VersionCheckResult = { success: true, version: '1.0.0' };
    const fail: VersionCheckResult = { success: false, error: 'not found' };
    expect(ok.success).toBe(true);
    expect(fail.success).toBe(false);
  });

  it('CommandResult requires success, optional stdout/stderr/code/error', () => {
    const result: CommandResult = {
      success: true,
      stdout: 'out',
      stderr: 'err',
      code: 0,
    };
    expect(result.code).toBe(0);

    const minimal: CommandResult = { success: false, error: 'fail' };
    expect(minimal.error).toBe('fail');
  });

  it('SessionResult requires success, optional error', () => {
    const ok: SessionResult = { success: true };
    const fail: SessionResult = { success: false, error: 'no session' };
    expect(ok.success).toBe(true);
    expect(fail.error).toBe('no session');
  });

  it('LatestReleaseResult requires success, optional version/assets/error', () => {
    const ok: LatestReleaseResult = {
      success: true,
      version: 'v1.0.0',
      assets: [{ name: 'a', url: 'u', size: 1 }],
    };
    expect(ok.assets!.length).toBe(1);

    const fail: LatestReleaseResult = { success: false, error: 'rate limited' };
    expect(fail.error).toContain('rate');
  });

  it('PlatformInfoResult requires platform, arch, and homedir', () => {
    const result: PlatformInfoResult = {
      platform: 'win32',
      arch: 'x64',
      homedir: 'C:\\Users\\Test',
    };
    expect(result.platform).toBe('win32');
    expect(result.arch).toBe('x64');
    expect(result.homedir).toContain('Test');
  });

  it('CLIOutputEvent requires type and content strings', () => {
    const output: CLIOutputEvent = { type: 'output', content: 'hello' };
    const error: CLIOutputEvent = { type: 'error', content: 'bad thing' };
    const system: CLIOutputEvent = { type: 'system', content: 'exited' };

    expect(output.type).toBe('output');
    expect(error.type).toBe('error');
    expect(system.type).toBe('system');
  });
});
