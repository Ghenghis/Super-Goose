import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Global setup for Playwright E2E tests.
 *
 * Responsibilities:
 * 1. Kill zombie goosed.exe processes (prevents test timeouts)
 * 2. Set environment variables for backend configuration
 * 3. Optionally start backend server if GOOSE_START_BACKEND=1
 *
 * This runs once before ALL tests, not per-test.
 */
async function globalSetup() {
  console.log('\n=== Playwright Global Setup ===\n');

  // 1. Kill zombie backend processes
  await killZombieProcesses();

  // 2. Set environment variables (these will be available to all tests)
  setEnvironmentVariables();

  // 3. Display configuration
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
 * Set environment variables for test execution.
 * These override any existing values.
 */
function setEnvironmentVariables() {
  console.log('Setting environment variables...');

  // Set default backend URL if not already set
  if (!process.env.GOOSE_BACKEND_URL) {
    process.env.GOOSE_BACKEND_URL = 'http://localhost:3284';
    console.log('  GOOSE_BACKEND_URL = http://localhost:3284 (default)');
  } else {
    console.log(`  GOOSE_BACKEND_URL = ${process.env.GOOSE_BACKEND_URL} (user-provided)`);
  }

  // Preserve GOOSE_BACKEND flag if set (indicates tests require backend)
  if (process.env.GOOSE_BACKEND) {
    console.log(`  GOOSE_BACKEND = ${process.env.GOOSE_BACKEND}`);
  }

  // Preserve GOOSE_START_BACKEND flag if set (auto-start backend)
  if (process.env.GOOSE_START_BACKEND) {
    console.log(`  GOOSE_START_BACKEND = ${process.env.GOOSE_START_BACKEND}`);
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

  const backendMode = process.env.GOOSE_START_BACKEND === '1'
    ? 'AUTO-START'
    : process.env.GOOSE_BACKEND === '1'
    ? 'REQUIRED (must be running)'
    : 'OPTIONAL';

  console.log('  Backend Mode:', backendMode);

  if (process.env.DEBUG_BACKEND) {
    console.log('  Debug Backend: ENABLED');
  }

  if (process.env.DEBUG_TESTS) {
    console.log('  Debug Tests: ENABLED');
  }
}

export default globalSetup;
