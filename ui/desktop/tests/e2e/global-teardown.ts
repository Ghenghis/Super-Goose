import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Global teardown for Playwright E2E tests.
 *
 * Kills the goosed backend server that was started by global-setup.
 * This runs once after ALL tests complete.
 */
async function globalTeardown() {
  console.log('\n=== Playwright Global Teardown ===\n');

  await killBackendServer();

  console.log('\n=== Global Teardown Complete ===\n');
}

/**
 * Kill the goosed backend server and any lingering processes.
 * Uses fire-and-forget spawns on Windows to avoid taskkill hanging.
 */
async function killBackendServer() {
  if (process.platform === 'win32') {
    // Windows: use fire-and-forget spawn to avoid taskkill timeout hangs
    const pid = process.env.GOOSED_PID;
    if (pid && pid.length > 0) {
      console.log(`Killing goosed backend (PID ${pid})...`);
      spawn('taskkill', ['/F', '/T', '/PID', pid], {
        shell: false,
        stdio: 'ignore',
        detached: true,
      }).unref();
    }

    // Also sweep all goosed.exe processes
    spawn('taskkill', ['/F', '/IM', 'goosed.exe'], {
      shell: false,
      stdio: 'ignore',
      detached: true,
    }).unref();

    // Brief wait for kills to take effect
    await new Promise(r => setTimeout(r, 2000));
    console.log('✓ Backend cleanup commands sent');

  } else {
    // Unix: direct kill is fast
    const pid = process.env.GOOSED_PID;
    if (pid && pid.length > 0) {
      try {
        process.kill(parseInt(pid, 10), 'SIGKILL');
        console.log(`✓ Killed goosed backend (PID ${pid})`);
      } catch {
        console.log(`✓ goosed backend (PID ${pid}) already exited`);
      }
    }

    // Sweep remaining
    try {
      await execAsync('pkill -9 goosed');
      console.log('✓ Cleaned up remaining goosed processes');
    } catch {
      console.log('✓ No remaining goosed processes');
    }
  }
}

export default globalTeardown;
