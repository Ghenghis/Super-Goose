/**
 * OTA Process Manager
 *
 * Manages the goosed backend process for OTA E2E tests.
 * Auto-restarts the process when it exits cleanly (exit code 0),
 * which happens after POST /api/ota/restart.
 *
 * Usage:
 *   const mgr = new OtaProcessManager();
 *   await mgr.start();
 *   // ... trigger OTA, POST /api/ota/restart ...
 *   await mgr.waitForRestart(30_000);
 *   await mgr.stop();
 */

import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class OtaProcessManager {
  private proc: ChildProcess | null = null;
  private port: number;
  private binaryPath: string | null = null;
  private restartCount = 0;
  private autoRestart = true;

  constructor(port = 3284) {
    this.port = port;
  }

  /** Locate the goosed binary (debug or release). */
  private findBinary(): string {
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    const candidates = [
      path.join(root, 'target', 'release', process.platform === 'win32' ? 'goosed.exe' : 'goosed'),
      path.join(root, 'target', 'debug', process.platform === 'win32' ? 'goosed.exe' : 'goosed'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`goosed binary not found. Checked: ${candidates.join(', ')}`);
  }

  /** Start the goosed process. */
  async start(): Promise<void> {
    this.binaryPath = this.findBinary();
    this.autoRestart = true;
    await this.spawnProcess();
    await this.waitForHealth(30_000);
  }

  private async spawnProcess(): Promise<void> {
    if (!this.binaryPath) throw new Error('No binary path');

    console.log(`[OtaProcessManager] Spawning ${this.binaryPath} on port ${this.port}`);
    this.proc = spawn(this.binaryPath, [], {
      env: {
        ...process.env,
        GOOSE_PORT: String(this.port),
        GOOSE_SERVER__HOST: '127.0.0.1',
        GOOSE_SERVER__PORT: String(this.port),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[goosed] ${line}`);
    });

    this.proc.stderr?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[goosed:err] ${line}`);
    });

    this.proc.on('exit', (code) => {
      console.log(`[OtaProcessManager] Process exited with code ${code}`);
      if (code === 0 && this.autoRestart) {
        console.log(`[OtaProcessManager] Clean exit — auto-restarting (#${this.restartCount + 1})`);
        this.restartCount++;
        // Re-discover binary (may have been swapped by OTA)
        try {
          this.binaryPath = this.findBinary();
        } catch { /* keep old path */ }
        this.spawnProcess().catch((err) => {
          console.error('[OtaProcessManager] Auto-restart failed:', err);
        });
      }
    });
  }

  /** Wait until the health endpoint responds. */
  async waitForHealth(timeoutMs = 30_000): Promise<void> {
    const url = `http://127.0.0.1:${this.port}/api/version`;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          console.log('[OtaProcessManager] Backend is healthy');
          return;
        }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Backend did not become healthy within ${timeoutMs}ms`);
  }

  /** Wait for a restart to complete (process dies then comes back). */
  async waitForRestart(timeoutMs = 60_000): Promise<void> {
    const startCount = this.restartCount;
    const start = Date.now();

    // Wait for restart count to increment
    while (this.restartCount === startCount && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (this.restartCount === startCount) {
      throw new Error(`No restart detected within ${timeoutMs}ms`);
    }

    // Wait for the new process to be healthy
    await this.waitForHealth(timeoutMs - (Date.now() - start));
  }

  /** Get the current restart count. */
  getRestartCount(): number {
    return this.restartCount;
  }

  /** Stop the managed process. */
  async stop(): Promise<void> {
    this.autoRestart = false;
    if (this.proc && !this.proc.killed) {
      console.log('[OtaProcessManager] Stopping backend process');
      this.proc.kill('SIGTERM');
      // Give it a moment to exit
      await new Promise((r) => setTimeout(r, 1000));
      if (this.proc && !this.proc.killed) {
        this.proc.kill('SIGKILL');
      }
    }
    this.proc = null;
  }
}
