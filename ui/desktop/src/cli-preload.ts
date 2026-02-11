/**
 * cli-preload.ts
 *
 * Preload bridge that exposes safe CLI IPC methods to the renderer process.
 *
 * Usage in the main preload.ts:
 *   1. Import `cliAPI` from this module.
 *   2. Add it under `window.electron.cli` via contextBridge.
 *
 * In the renderer, access via: `window.electron.cli.getBinaryPath()` etc.
 *
 * This file must NOT be imported directly by renderer code (it uses
 * `ipcRenderer` which is only available in the preload context).
 */

import { ipcRenderer } from 'electron';

// ---------------------------------------------------------------------------
// Response types — mirrors the types exported by cli-ipc.ts
// ---------------------------------------------------------------------------

export interface BinaryPathResult {
  found: boolean;
  path: string;
}

export interface VersionCheckResult {
  success: boolean;
  version?: string;
  error?: string;
}

export interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  error?: string;
}

export interface SessionResult {
  success: boolean;
  error?: string;
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface LatestReleaseResult {
  success: boolean;
  version?: string;
  assets?: ReleaseAsset[];
  error?: string;
}

export interface PlatformInfoResult {
  platform: string;
  arch: string;
  homedir: string;
}

/** Payload shape for streamed cli:output events */
export interface CLIOutputEvent {
  type: 'output' | 'error' | 'system';
  content: string;
}

// ---------------------------------------------------------------------------
// CLI Preload API type (used for Window type augmentation)
// ---------------------------------------------------------------------------

export interface CLIPreloadAPI {
  getBinaryPath: () => Promise<BinaryPathResult>;
  checkVersion: (binaryPath: string) => Promise<VersionCheckResult>;
  executeCommand: (binaryPath: string, args: string[]) => Promise<CommandResult>;
  startSession: (binaryPath: string) => Promise<SessionResult>;
  sendInput: (input: string) => Promise<SessionResult>;
  killSession: () => Promise<SessionResult>;
  getLatestRelease: () => Promise<LatestReleaseResult>;
  getPlatformInfo: () => Promise<PlatformInfoResult>;
  onOutput: (callback: (data: CLIOutputEvent) => void) => () => void;
}

// ---------------------------------------------------------------------------
// Exported API object — safe to pass through contextBridge
// ---------------------------------------------------------------------------

/**
 * The CLI preload API. Each method invokes a corresponding IPC channel
 * registered by `registerCLIHandlers()` in cli-ipc.ts.
 *
 * `onOutput` subscribes to streamed process output and returns an
 * unsubscribe function for cleanup.
 */
export const cliAPI: CLIPreloadAPI = {
  getBinaryPath: (): Promise<BinaryPathResult> => {
    return ipcRenderer.invoke('cli:get-binary-path');
  },

  checkVersion: (binaryPath: string): Promise<VersionCheckResult> => {
    return ipcRenderer.invoke('cli:check-version', binaryPath);
  },

  executeCommand: (binaryPath: string, args: string[]): Promise<CommandResult> => {
    return ipcRenderer.invoke('cli:execute-command', binaryPath, args);
  },

  startSession: (binaryPath: string): Promise<SessionResult> => {
    return ipcRenderer.invoke('cli:start-session', binaryPath);
  },

  sendInput: (input: string): Promise<SessionResult> => {
    return ipcRenderer.invoke('cli:send-input', input);
  },

  killSession: (): Promise<SessionResult> => {
    return ipcRenderer.invoke('cli:kill-session');
  },

  getLatestRelease: (): Promise<LatestReleaseResult> => {
    return ipcRenderer.invoke('cli:get-latest-release');
  },

  getPlatformInfo: (): Promise<PlatformInfoResult> => {
    return ipcRenderer.invoke('cli:get-platform-info');
  },

  onOutput: (callback: (data: CLIOutputEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: CLIOutputEvent): void => {
      callback(data);
    };
    ipcRenderer.on('cli:output', handler);

    // Return an unsubscribe function
    return () => {
      ipcRenderer.removeListener('cli:output', handler);
    };
  },
};
