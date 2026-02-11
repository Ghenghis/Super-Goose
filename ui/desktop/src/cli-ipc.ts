/**
 * cli-ipc.ts
 *
 * Electron IPC handler module for CLI binary management.
 *
 * Registers main-process handlers for:
 *   - cli:get-binary-path   — Locate the goose CLI binary on disk
 *   - cli:check-version     — Run `goose --version` and return output
 *   - cli:execute-command   — Execute a one-shot CLI command with args
 *   - cli:start-session     — Spawn an interactive `goose session` process
 *   - cli:send-input        — Write stdin to the active session
 *   - cli:kill-session      — Terminate the active session
 *   - cli:get-latest-release — Query GitHub Releases API
 *   - cli:get-platform-info — Return platform / arch / homedir
 *
 * Import this module from main.ts and call `registerCLIHandlers(mainWindow)`.
 * Call `cleanupCLI()` on app quit to kill any lingering child process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';

// ---------------------------------------------------------------------------
// IPC response types — shared with the renderer via cli-preload.ts
// ---------------------------------------------------------------------------

/** Result of cli:get-binary-path */
export interface BinaryPathResult {
  found: boolean;
  path: string;
}

/** Result of cli:check-version */
export interface VersionCheckResult {
  success: boolean;
  version?: string;
  error?: string;
}

/** Result of cli:execute-command */
export interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  error?: string;
}

/** Result of cli:start-session, cli:send-input, cli:kill-session */
export interface SessionResult {
  success: boolean;
  error?: string;
}

/** A single asset entry from a GitHub release */
export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

/** Result of cli:get-latest-release */
export interface LatestReleaseResult {
  success: boolean;
  version?: string;
  assets?: ReleaseAsset[];
  error?: string;
}

/** Result of cli:get-platform-info */
export interface PlatformInfoResult {
  platform: NodeJS.Platform;
  arch: string;
  homedir: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** The active interactive CLI session (at most one). */
let cliProcess: ChildProcess | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register all CLI-related IPC handlers on the main process.
 *
 * @param mainWindow The primary BrowserWindow whose webContents receives
 *                   streamed `cli:output` events from the interactive session.
 */
export function registerCLIHandlers(mainWindow: BrowserWindow): void {
  // -----------------------------------------------------------------------
  // cli:get-binary-path
  // -----------------------------------------------------------------------
  ipcMain.handle('cli:get-binary-path', async (): Promise<BinaryPathResult> => {
    const binaryName = process.platform === 'win32' ? 'goose.exe' : 'goose';

    const home = process.env.HOME || process.env.USERPROFILE || '';

    // Check multiple known locations in priority order
    const locations: string[] = [
      path.join(home, '.goose', 'bin', binaryName),
      path.join(__dirname, '..', 'bin', binaryName),
      path.join(__dirname, 'bin', binaryName),
    ];

    for (const loc of locations) {
      try {
        if (fs.existsSync(loc)) {
          return { found: true, path: loc };
        }
      } catch {
        // Permission error or similar — skip this location
      }
    }

    // Not found — return the preferred install location
    return { found: false, path: locations[0] };
  });

  // -----------------------------------------------------------------------
  // cli:check-version
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'cli:check-version',
    async (_event, binaryPath: string): Promise<VersionCheckResult> => {
      return new Promise<VersionCheckResult>((resolve) => {
        try {
          const proc = spawn(binaryPath, ['--version'], { timeout: 5000 });
          let output = '';

          proc.stdout.on('data', (data: Buffer) => {
            output += data.toString();
          });

          proc.on('close', (code: number | null) => {
            resolve({
              success: code === 0,
              version: output.trim() || undefined,
            });
          });

          proc.on('error', (err: Error) => {
            resolve({ success: false, error: err.message });
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          resolve({ success: false, error: message });
        }
      });
    },
  );

  // -----------------------------------------------------------------------
  // cli:execute-command
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'cli:execute-command',
    async (_event, binaryPath: string, args: string[]): Promise<CommandResult> => {
      return new Promise<CommandResult>((resolve) => {
        try {
          const proc = spawn(binaryPath, args, { timeout: 30000 });
          let stdout = '';
          let stderr = '';

          proc.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          proc.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          proc.on('close', (code: number | null) => {
            resolve({ success: code === 0, stdout, stderr, code });
          });

          proc.on('error', (err: Error) => {
            resolve({ success: false, error: err.message, stdout, stderr });
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          resolve({ success: false, error: message });
        }
      });
    },
  );

  // -----------------------------------------------------------------------
  // cli:start-session — spawn an interactive `goose session`
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'cli:start-session',
    async (_event, binaryPath: string): Promise<SessionResult> => {
      // Kill any previous session
      if (cliProcess) {
        try {
          cliProcess.kill();
        } catch {
          // Already dead
        }
        cliProcess = null;
      }

      try {
        cliProcess = spawn(binaryPath, ['session'], {
          env: { ...process.env },
        });

        cliProcess.stdout?.on('data', (data: Buffer) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cli:output', {
              type: 'output',
              content: data.toString(),
            });
          }
        });

        cliProcess.stderr?.on('data', (data: Buffer) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cli:output', {
              type: 'error',
              content: data.toString(),
            });
          }
        });

        cliProcess.on('close', (code: number | null) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cli:output', {
              type: 'system',
              content: `Process exited with code ${code}`,
            });
          }
          cliProcess = null;
        });

        cliProcess.on('error', (err: Error) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cli:output', {
              type: 'error',
              content: `Failed to start session: ${err.message}`,
            });
          }
          cliProcess = null;
        });

        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    },
  );

  // -----------------------------------------------------------------------
  // cli:send-input — write to the active session's stdin
  // -----------------------------------------------------------------------
  ipcMain.handle('cli:send-input', async (_event, input: string): Promise<SessionResult> => {
    if (!cliProcess || !cliProcess.stdin) {
      return { success: false, error: 'No active CLI session' };
    }
    try {
      cliProcess.stdin.write(input + '\n');
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // -----------------------------------------------------------------------
  // cli:kill-session — terminate the active session
  // -----------------------------------------------------------------------
  ipcMain.handle('cli:kill-session', async (): Promise<SessionResult> => {
    if (cliProcess) {
      try {
        cliProcess.kill();
      } catch {
        // Already dead
      }
      cliProcess = null;
      return { success: true };
    }
    return { success: false, error: 'No active session' };
  });

  // -----------------------------------------------------------------------
  // cli:get-latest-release — query GitHub Releases API
  // -----------------------------------------------------------------------
  ipcMain.handle('cli:get-latest-release', async (): Promise<LatestReleaseResult> => {
    return new Promise<LatestReleaseResult>((resolve) => {
      const options: https.RequestOptions = {
        hostname: 'api.github.com',
        path: '/repos/Ghenghis/Super-Goose/releases/latest',
        headers: {
          'User-Agent': 'Super-Goose-Desktop',
          Accept: 'application/vnd.github.v3+json',
        },
      };

      https
        .get(options, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            try {
              const release = JSON.parse(data);

              if (!release.tag_name) {
                // GitHub may return an error object (e.g. rate-limited)
                resolve({
                  success: false,
                  error: release.message || 'No tag_name in response',
                });
                return;
              }

              const assets: ReleaseAsset[] = Array.isArray(release.assets)
                ? release.assets.map(
                    (a: { name: string; browser_download_url: string; size: number }) => ({
                      name: a.name,
                      url: a.browser_download_url,
                      size: a.size,
                    }),
                  )
                : [];

              resolve({
                success: true,
                version: release.tag_name,
                assets,
              });
            } catch {
              resolve({ success: false, error: 'Failed to parse release data' });
            }
          });
        })
        .on('error', (err: Error) => {
          resolve({ success: false, error: err.message });
        });
    });
  });

  // -----------------------------------------------------------------------
  // cli:get-platform-info
  // -----------------------------------------------------------------------
  ipcMain.handle('cli:get-platform-info', async (): Promise<PlatformInfoResult> => {
    return {
      platform: process.platform,
      arch: process.arch,
      homedir: process.env.HOME || process.env.USERPROFILE || '',
    };
  });
}

/**
 * Kill any lingering interactive CLI session. Call this on app quit.
 */
export function cleanupCLI(): void {
  if (cliProcess) {
    try {
      cliProcess.kill();
    } catch {
      // Already dead
    }
    cliProcess = null;
  }
}
