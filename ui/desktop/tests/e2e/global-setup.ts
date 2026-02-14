import { promisify } from 'util';
import { exec, spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import http from 'http';

const execAsync = promisify(exec);

// Store the goosed process globally so global-teardown can kill it
// We write the PID to an env var that the teardown can read
let goosedProcess: ChildProcess | null = null;

/**
 * Global setup for Playwright E2E tests.
 *
 * Responsibilities:
 * 1. Kill zombie goosed.exe processes (prevents test timeouts)
 * 2. Set environment variables for backend configuration
 * 3. Start goosed backend server (always, for real GUI testing)
 * 4. Wait for backend to be healthy before proceeding
 *
 * This runs once before ALL tests, not per-test.
 */
async function globalSetup() {
  console.log('\n=== Playwright Global Setup ===\n');

  // 1. Kill zombie backend processes
  await killZombieProcesses();

  // 2. Free the CDP debug port range used by Electron fixtures
  await freeDebugPorts();

  // 3. Set environment variables (these will be available to all tests)
  setEnvironmentVariables();

  // 4. Start the goosed backend server
  await startBackendServer();

  // 5. Display configuration
  displayConfiguration();

  console.log('\n=== Global Setup Complete ===\n');
}

/**
 * Kill any lingering goosed.exe or goosed processes from previous test runs.
 * These zombie processes can cause ALL tests to timeout.
 */
async function killZombieProcesses() {
  console.log('Checking for zombie backend processes...');

  try {
    if (process.platform === 'win32') {
      // Windows: taskkill goosed.exe
      try {
        const { stdout } = await execAsync('taskkill /F /IM goosed.exe');
        console.log('✓ Killed zombie goosed.exe processes');
        if (stdout) {
          console.log(stdout);
        }
      } catch (error: unknown) {
        // taskkill returns error if no process found - this is fine
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('not found') || errMsg.includes('ERROR: The process')) {
          console.log('✓ No zombie goosed.exe processes found (clean state)');
        } else {
          console.warn('Warning killing goosed.exe:', errMsg);
        }
      }
      // Windows: also kill any lingering Super-Goose.exe (Electron app)
      try {
        await execAsync('taskkill /F /IM "Super-Goose.exe"');
        console.log('✓ Killed lingering Super-Goose.exe processes');
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('not found') || errMsg.includes('ERROR: The process')) {
          console.log('✓ No lingering Super-Goose.exe processes found');
        } else {
          console.warn('Warning killing Super-Goose.exe:', errMsg);
        }
      }
    } else {
      // Unix: pkill goosed
      try {
        await execAsync('pkill -9 goosed');
        console.log('✓ Killed zombie goosed processes');
      } catch (error: unknown) {
        // pkill returns error if no process found - this is fine
        const errObj = error as { code?: number; message?: string };
        if (errObj.code === 1) {
          console.log('✓ No zombie goosed processes found (clean state)');
        } else {
          console.warn('Warning killing goosed:', errObj.message ?? String(error));
        }
      }
    }
  } catch (error: unknown) {
    console.error('Error in killZombieProcesses:', error);
    // Don't fail setup, just warn
  }
}

/**
 * Check and free the CDP debug port range (19222+) used by the Electron fixture.
 * Port 9222 is the default Chrome DevTools port and is often already taken
 * by Chrome instances, browser extensions, or other tools — so we use 19222+.
 * If even those ports are taken, log a warning.
 */
async function freeDebugPorts() {
  const basePort = 19222;
  const portsToCheck = [basePort, basePort + 10, basePort + 20]; // first 3 workers

  for (const port of portsToCheck) {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`);
        if (stdout.trim()) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid)) {
              console.log(`  Port ${port} is in use by PID ${pid}, attempting to free...`);
              try {
                await execAsync(`taskkill /F /PID ${pid}`);
                console.log(`  ✓ Killed PID ${pid} to free port ${port}`);
              } catch {
                console.warn(`  ⚠ Could not kill PID ${pid} on port ${port}`);
              }
            }
          }
        }
      } else {
        const { stdout } = await execAsync(`lsof -ti :${port} 2>/dev/null || true`);
        if (stdout.trim()) {
          const pids = stdout.trim().split('\n');
          for (const pid of pids) {
            if (pid && /^\d+$/.test(pid.trim())) {
              console.log(`  Port ${port} is in use by PID ${pid.trim()}, attempting to free...`);
              try {
                process.kill(parseInt(pid.trim()), 'SIGKILL');
                console.log(`  ✓ Killed PID ${pid.trim()} to free port ${port}`);
              } catch {
                console.warn(`  ⚠ Could not kill PID ${pid.trim()} on port ${port}`);
              }
            }
          }
        }
      }
    } catch {
      // Port check commands may fail, that's OK — it means the port is likely free
    }
  }
  // After killing processes, wait for ports to actually be released.
  // Windows TCP stack can hold sockets in TIME_WAIT for a few seconds.
  await new Promise(r => setTimeout(r, 3000));
  console.log('✓ Debug port range (19222+) checked and waited for release');
}

/**
 * Find the goosed binary in known locations.
 * Returns the resolved absolute path to goosed(.exe).
 */
function findGoosedBinary(): string {
  const executableName = process.platform === 'win32' ? 'goosed.exe' : 'goosed';
  const projectRoot = resolve(join(__dirname, '..', '..', '..', '..'));
  const desktopRoot = resolve(join(__dirname, '..', '..'));

  const possiblePaths = [
    // Preferred: src/bin in the desktop project (same as Electron dev mode)
    join(desktopRoot, 'src', 'bin', executableName),
    // Target debug build
    join(projectRoot, 'target', 'debug', executableName),
    // Target release build
    join(projectRoot, 'target', 'release', executableName),
    // Fallback: bin directory
    join(desktopRoot, 'bin', executableName),
  ];

  for (const binPath of possiblePaths) {
    const resolvedPath = resolve(binPath);
    if (existsSync(resolvedPath)) {
      console.log(`Found goosed binary at: ${resolvedPath}`);
      return resolvedPath;
    }
  }

  throw new Error(
    `Could not find ${executableName} binary in any of:\n  ${possiblePaths.join('\n  ')}\n` +
    'Build it with: cargo build --manifest-path crates/goose-server/Cargo.toml'
  );
}

/**
 * Check if goosed is already running on the given port by hitting /status.
 */
function checkHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/status`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for goosed to become healthy on the given port.
 * Polls /status every 500ms for up to maxWaitMs.
 */
async function waitForBackendHealth(port: number, maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const healthy = await checkHealth(port);
    if (healthy) {
      console.log(`✓ Backend healthy on port ${port} after ${attempt} attempts (${Date.now() - startTime}ms)`);
      return true;
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  console.error(`✗ Backend failed to become healthy on port ${port} after ${maxWaitMs}ms (${attempt} attempts)`);
  return false;
}

/**
 * Start the goosed backend server on port 3284.
 *
 * This spawns goosed.exe as a detached process so it runs independently
 * of the Playwright test runner. The PID is stored in GOOSED_PID env var
 * for the global-teardown to clean up.
 */
async function startBackendServer() {
  const port = parseInt(process.env.GOOSE_PORT || '3284', 10);

  // First check if a backend is already running on this port
  const alreadyRunning = await checkHealth(port);
  if (alreadyRunning) {
    console.log(`✓ Backend already running on port ${port}, skipping start`);
    process.env.GOOSED_PID = '';  // Empty = don't kill in teardown
    return;
  }

  console.log(`Starting goosed backend server on port ${port}...`);

  const goosedPath = findGoosedBinary();
  const isWindows = process.platform === 'win32';

  // Spawn goosed with the 'agent' subcommand
  goosedProcess = spawn(goosedPath, ['agent'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,  // Unix: create process group. Windows: already detached via windowsHide
    windowsHide: true,
    env: {
      ...process.env,
      GOOSE_PORT: String(port),
      RUST_LOG: process.env.RUST_LOG || 'info',
      // Don't set GOOSE_SERVER__SECRET_KEY — tests don't need auth
    },
  });

  const pid = goosedProcess.pid;
  console.log(`  goosed started with PID ${pid}`);

  // Store PID so teardown can kill it
  process.env.GOOSED_PID = String(pid || '');

  // Log stdout/stderr for debugging
  goosedProcess.stdout?.on('data', (data: Buffer) => {
    if (process.env.DEBUG_BACKEND) {
      console.log(`[goosed stdout] ${data.toString().trim()}`);
    }
  });

  goosedProcess.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trim();
    if (lines) {
      // Always log stderr — it contains important startup info
      console.log(`[goosed stderr] ${lines}`);
    }
  });

  goosedProcess.on('error', (err: Error) => {
    console.error(`goosed failed to start: ${err.message}`);
  });

  goosedProcess.on('close', (code: number | null) => {
    console.log(`goosed exited with code ${code}`);
    goosedProcess = null;
  });

  // Wait for the backend to become healthy
  const healthy = await waitForBackendHealth(port, 30000);
  if (!healthy) {
    console.error('⚠ Backend did not become healthy, but continuing with tests...');
    console.error('  Tests that require the backend may fail or show empty UI.');
    console.error('  Make sure goosed.exe is built: cargo build -p goose-server');
  } else {
    // Set GOOSE_BACKEND=1 so tests know the backend is available
    process.env.GOOSE_BACKEND = '1';
    console.log('✓ GOOSE_BACKEND=1 set — backend is available for tests');

    // Give goosed extra warm-up time to load extensions, agents, and configs.
    // The /status endpoint becomes healthy quickly, but the full initialization
    // (loading extensions, MCP connections, etc.) takes longer.
    const warmupMs = 10000;
    console.log(`  Warming up goosed for ${warmupMs / 1000}s (loading extensions + agents)...`);
    await new Promise(r => setTimeout(r, warmupMs));
    console.log('  ✓ Warm-up complete');
  }
}

/**
 * Set environment variables for test execution.
 * These override any existing values.
 */
function setEnvironmentVariables() {
  console.log('Setting environment variables...');

  // Set default backend port
  if (!process.env.GOOSE_PORT) {
    process.env.GOOSE_PORT = '3284';
  }

  // Set default backend URL if not already set
  const port = process.env.GOOSE_PORT || '3284';
  if (!process.env.GOOSE_BACKEND_URL) {
    process.env.GOOSE_BACKEND_URL = `http://localhost:${port}`;
    console.log(`  GOOSE_BACKEND_URL = http://localhost:${port} (default)`);
  } else {
    console.log(`  GOOSE_BACKEND_URL = ${process.env.GOOSE_BACKEND_URL} (user-provided)`);
  }

  // Preserve GOOSE_BACKEND flag if set (indicates tests require backend)
  if (process.env.GOOSE_BACKEND) {
    console.log(`  GOOSE_BACKEND = ${process.env.GOOSE_BACKEND}`);
  }
}

/**
 * Display test configuration for debugging.
 */
function displayConfiguration() {
  console.log('\nTest Configuration:');
  console.log('  Platform:', process.platform);
  console.log('  Node.js:', process.version);
  console.log('  Working Directory:', process.cwd());
  console.log('  Backend Port:', process.env.GOOSE_PORT || '3284');
  console.log('  Backend URL:', process.env.GOOSE_BACKEND_URL);
  console.log('  Backend PID:', process.env.GOOSED_PID || '(not started by setup)');
  console.log('  Backend Available:', process.env.GOOSE_BACKEND === '1' ? 'YES' : 'NO');

  if (process.env.DEBUG_BACKEND) {
    console.log('  Debug Backend: ENABLED');
  }

  if (process.env.DEBUG_TESTS) {
    console.log('  Debug Tests: ENABLED');
  }
}

export default globalSetup;
