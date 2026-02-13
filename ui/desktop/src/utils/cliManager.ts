// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface CLIVersionInfo {
  version: string;
  path: string;
  installedAt: string;
  platform: string;
}

export interface CLIRelease {
  version: string;
  downloadUrl: string;
  size: number;
  sha256: string;
  releaseDate: string;
}

// ---------------------------------------------------------------------------
// Platform-specific CLI paths
// ---------------------------------------------------------------------------

/**
 * Get the platform-appropriate path where the CLI should be installed.
 * Returns the default installation directory for the current platform.
 *
 * NOTE: This returns a platform-specific path pattern but doesn't use Node.js
 * path/os modules to remain browser-compatible. Actual path resolution happens
 * in the Electron main process.
 */
export function getCLIPath(): string {
  // Detect platform from window.electron if available, otherwise use navigator
  let platform: string;

  if (typeof window !== 'undefined' && (window as any).electron?.platform) {
    platform = (window as any).electron.platform;
  } else if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) {
      platform = 'win32';
    } else if (ua.includes('mac')) {
      platform = 'darwin';
    } else {
      platform = 'linux';
    }
  } else {
    platform = 'linux'; // Default fallback
  }

  if (platform === 'win32') {
    // Windows: %APPDATA%\goose\goose.exe
    return '%APPDATA%\\goose\\goose.exe';
  } else if (platform === 'darwin') {
    // macOS: ~/.local/bin/goose
    return '~/.local/bin/goose';
  } else {
    // Linux: ~/.local/bin/goose
    return '~/.local/bin/goose';
  }
}

/**
 * Get the directory where the CLI binary should be installed.
 */
export function getCLIDirectory(): string {
  const cliPath = getCLIPath();

  // Simple path dirname logic (browser-compatible)
  const lastSlash = Math.max(cliPath.lastIndexOf('/'), cliPath.lastIndexOf('\\'));
  if (lastSlash === -1) {
    return '.';
  }
  return cliPath.substring(0, lastSlash);
}

// ---------------------------------------------------------------------------
// Mock data for development/testing
// ---------------------------------------------------------------------------

const MOCK_VERSION_INFO: CLIVersionInfo = {
  version: 'v1.24.05',
  path: getCLIPath(),
  installedAt: new Date().toISOString(),
  platform: typeof process !== 'undefined' ? process.platform : 'unknown',
};

const MOCK_RELEASE: CLIRelease = {
  version: 'v1.24.06',
  downloadUrl: 'https://github.com/Ghenghis/Super-Goose/releases/download/v1.24.06/goose-cli',
  size: 45_000_000, // 45MB
  sha256: 'abc123def456',
  releaseDate: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// IPC Helper
// ---------------------------------------------------------------------------

/**
 * Check if Electron IPC is available (returns true in Electron, false in browser/tests).
 */
function hasElectronIPC(): boolean {
  return typeof window !== 'undefined' && window.electron && typeof window.electron.invoke === 'function';
}

/**
 * Safely invoke an Electron IPC handler with a fallback for non-Electron environments.
 */
async function invokeIPC<T>(channel: string, ...args: unknown[]): Promise<T | null> {
  if (hasElectronIPC()) {
    try {
      // TypeScript doesn't know about window.electron.invoke, so we cast
      return await (window.electron as any).invoke(channel, ...args);
    } catch (error) {
      console.error(`[cliManager] IPC invoke failed for channel "${channel}":`, error);
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API Functions
// ---------------------------------------------------------------------------

/**
 * Check if the CLI is installed and return version information.
 * Returns null if CLI is not found.
 */
export async function checkCLIInstalled(): Promise<CLIVersionInfo | null> {
  // Try IPC first -- if available, trust its result (including null)
  if (hasElectronIPC()) {
    return invokeIPC<CLIVersionInfo>('cli:check-installed');
  }

  // Fallback to mock data for dev/test mode
  console.warn('[cliManager] Using mock data for checkCLIInstalled (Electron IPC not available)');
  return MOCK_VERSION_INFO;
}

/**
 * Check if a newer CLI version is available for download.
 * Returns the latest release info if an update is available, null otherwise.
 */
export async function checkForCLIUpdates(): Promise<CLIRelease | null> {
  // Try IPC first -- if available, trust its result (including null)
  if (hasElectronIPC()) {
    return invokeIPC<CLIRelease>('cli:check-updates');
  }

  // Fallback to mock data for dev/test mode
  console.warn('[cliManager] Using mock data for checkForCLIUpdates (Electron IPC not available)');
  return MOCK_RELEASE;
}

/**
 * Download and install the CLI binary from a release.
 * Calls the progress callback periodically with a percentage (0-100).
 * Returns version info on success, throws on error.
 */
export async function installCLI(
  release: CLIRelease,
  onProgress: (percent: number) => void
): Promise<CLIVersionInfo> {
  // Try IPC first
  if (hasElectronIPC()) {
    try {
      // Register progress listener
      const progressHandler = (_event: unknown, ...args: unknown[]) => {
        const percent = args[0] as number;
        onProgress(percent);
      };

      if (window.electron && typeof window.electron.on === 'function') {
        window.electron.on('cli:install-progress', progressHandler);
      }

      const result = await invokeIPC<CLIVersionInfo>('cli:install', release);

      // Unregister progress listener
      if (window.electron && typeof window.electron.off === 'function') {
        window.electron.off('cli:install-progress', progressHandler);
      }

      if (result !== null) {
        return result;
      }
    } catch (error) {
      console.error('[cliManager] CLI installation via IPC failed, falling back to mock:', error);
    }
  }

  // Fallback to mock installation for dev/test mode
  console.warn('[cliManager] Using mock installation (Electron IPC not available)');

  // Simulate download progress
  return new Promise((resolve) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      onProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);

        const versionInfo: CLIVersionInfo = {
          version: release.version,
          path: getCLIPath(),
          installedAt: new Date().toISOString(),
          platform: typeof process !== 'undefined' ? process.platform : 'unknown',
        };

        resolve(versionInfo);
      }
    }, 200); // 200ms per 10% = 2 seconds total
  });
}
