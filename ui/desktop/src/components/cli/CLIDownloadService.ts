/**
 * CLIDownloadService.ts
 *
 * Service module (not a React component) that handles CLI binary downloads,
 * platform detection, version checking, and installation verification.
 *
 * Currently uses mock / simulated implementations that mirror the real
 * download-and-extract flow. In a production build the actual Electron IPC
 * calls would replace the setTimeout-based simulations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Progress information emitted during download / install phases. */
export interface DownloadProgress {
  phase: 'checking' | 'downloading' | 'extracting' | 'installing' | 'verifying' | 'complete' | 'error';
  /** 0-100 percentage of the current phase. */
  percent: number;
  /** Number of bytes received so far (download phase). */
  bytesDownloaded: number;
  /** Total expected bytes (download phase). */
  totalBytes: number;
  /** Current transfer speed in bytes/sec (download phase). */
  speed: number;
  /** Human-readable error message when phase is 'error'. */
  error?: string;
}

/** Describes the host platform the app is running on. */
export interface PlatformInfo {
  os: 'windows' | 'macos' | 'linux';
  arch: 'x64' | 'arm64';
  /** Release asset filename for this platform, e.g. "goose-x86_64-pc-windows-msvc.zip". */
  assetName: string;
  /** Directory where the CLI binary will be installed. */
  installDir: string;
  /** Binary filename, e.g. "goose.exe" or "goose". */
  binaryName: string;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** GitHub API endpoint for the latest Super-Goose release. */
const RELEASES_API = 'https://api.github.com/repos/Ghenghis/Super-Goose/releases/latest';

/** Base download URL pattern for release assets. */
const ASSET_BASE = 'https://github.com/Ghenghis/Super-Goose/releases/download';

/**
 * Map of (os, arch) to the release-asset filename published by CI.
 * The keys combine `${os}-${arch}`.
 */
const ASSET_MAP: Record<string, string> = {
  'windows-x64': 'goose-x86_64-pc-windows-msvc.zip',
  'macos-x64': 'goose-x86_64-apple-darwin.tar.bz2',
  'macos-arm64': 'goose-aarch64-apple-darwin.tar.bz2',
  'linux-x64': 'goose-x86_64-unknown-linux-gnu.tar.bz2',
  'linux-arm64': 'goose-aarch64-unknown-linux-gnu.tar.bz2',
};

// ---------------------------------------------------------------------------
// Helper: home directory (works in Electron renderer)
// ---------------------------------------------------------------------------

function getHomeDir(): string {
  // In Electron renderer the env vars are available via process.env (nodeIntegration)
  // or via window.electron if exposed. Fall back to common defaults.
  if (typeof process !== 'undefined' && process.env) {
    return process.env.USERPROFILE || process.env.HOME || '';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the current operating system and CPU architecture.
 * Returns a `PlatformInfo` object with the correct asset name, install
 * directory, and binary name for the host platform.
 */
export function detectPlatform(): PlatformInfo {
  let os: PlatformInfo['os'] = 'linux';
  let arch: PlatformInfo['arch'] = 'x64';

  // Detect OS -------------------------------------------------------------------
  const platform = (typeof process !== 'undefined' && process.platform) || 'win32';
  if (platform === 'win32') os = 'windows';
  else if (platform === 'darwin') os = 'macos';
  else os = 'linux';

  // Detect arch -----------------------------------------------------------------
  const cpuArch = (typeof process !== 'undefined' && process.arch) || 'x64';
  arch = cpuArch === 'arm64' ? 'arm64' : 'x64';

  // Build derived values --------------------------------------------------------
  const assetKey = `${os}-${arch}`;
  const assetName = ASSET_MAP[assetKey] || ASSET_MAP['linux-x64'];

  const home = getHomeDir();
  const isWin = os === 'windows';
  const installDir = isWin ? `${home}\\.goose\\bin` : `${home}/.goose/bin`;
  const binaryName = isWin ? 'goose.exe' : 'goose';

  return { os, arch, assetName, installDir, binaryName };
}

/**
 * Fetch the latest release version tag from the GitHub releases API.
 *
 * @returns A version string such as `"v1.24.05"`.
 */
export async function getLatestVersion(): Promise<string> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }
    const data = await response.json();
    return (data.tag_name as string) || 'unknown';
  } catch (err) {
    console.error('[CLIDownloadService] Failed to fetch latest version:', err);
    return 'unknown';
  }
}

/**
 * Build the full download URL for a specific version and platform.
 *
 * @param version  Release tag, e.g. `"v1.24.05"`.
 * @param platform Platform info returned by `detectPlatform()`.
 * @returns Full HTTPS URL to the release asset.
 */
export function getDownloadUrl(version: string, platform: PlatformInfo): string {
  return `${ASSET_BASE}/${version}/${platform.assetName}`;
}

/**
 * Download the CLI binary archive for the given version and platform.
 *
 * **Mock implementation** -- simulates a 45 MB download with progress
 * callbacks. In production this would use Electron IPC to invoke
 * `net.request` or Node `https.get` in the main process.
 *
 * @param version    Release tag.
 * @param platform   Platform info.
 * @param onProgress Callback invoked with progress updates.
 * @returns Path to the downloaded archive file.
 */
export async function downloadCLI(
  version: string,
  platform: PlatformInfo,
  onProgress: (p: DownloadProgress) => void,
): Promise<string> {
  const totalBytes = 45_000_000; // ~45 MB simulated size
  const chunkSize = 2_250_000; // 2.25 MB per tick
  const intervalMs = 100; // tick every 100 ms
  let bytesDownloaded = 0;

  // Phase: checking -------------------------------------------------------------
  onProgress({
    phase: 'checking',
    percent: 0,
    bytesDownloaded: 0,
    totalBytes,
    speed: 0,
  });

  await delay(400);

  // Phase: downloading (simulated) ----------------------------------------------
  return new Promise<string>((resolve) => {
    const timer = setInterval(() => {
      bytesDownloaded = Math.min(bytesDownloaded + chunkSize, totalBytes);
      const percent = Math.round((bytesDownloaded / totalBytes) * 100);
      const speed = chunkSize * (1000 / intervalMs); // bytes/sec

      onProgress({
        phase: 'downloading',
        percent,
        bytesDownloaded,
        totalBytes,
        speed,
      });

      if (bytesDownloaded >= totalBytes) {
        clearInterval(timer);

        const extension = platform.assetName.endsWith('.zip') ? '.zip' : '.tar.bz2';
        const archivePath = `${platform.installDir}/../downloads/goose-${version}${extension}`;

        onProgress({
          phase: 'complete',
          percent: 100,
          bytesDownloaded: totalBytes,
          totalBytes,
          speed: 0,
        });

        resolve(archivePath);
      }
    }, intervalMs);
  });
}

/**
 * Extract and install the CLI from the downloaded archive.
 *
 * **Mock implementation** -- simulates extraction and installation in ~2 s.
 * In production this would shell out to `tar` / PowerShell `Expand-Archive`.
 *
 * @param archivePath Path to the downloaded archive.
 * @param platform    Platform info.
 * @param onProgress  Callback invoked with progress updates.
 * @returns `true` if the install succeeded (mock always succeeds).
 */
export async function installCLI(
  _archivePath: string,
  _platform: PlatformInfo,
  onProgress: (p: DownloadProgress) => void,
): Promise<boolean> {
  const totalBytes = 0; // Not relevant for install phase

  // Phase: extracting -----------------------------------------------------------
  onProgress({ phase: 'extracting', percent: 0, bytesDownloaded: 0, totalBytes, speed: 0 });
  await delay(800);
  onProgress({ phase: 'extracting', percent: 50, bytesDownloaded: 0, totalBytes, speed: 0 });
  await delay(600);

  // Phase: installing -----------------------------------------------------------
  onProgress({ phase: 'installing', percent: 70, bytesDownloaded: 0, totalBytes, speed: 0 });
  await delay(400);

  // Phase: verifying ------------------------------------------------------------
  onProgress({ phase: 'verifying', percent: 90, bytesDownloaded: 0, totalBytes, speed: 0 });
  await delay(300);

  // Phase: complete -------------------------------------------------------------
  onProgress({ phase: 'complete', percent: 100, bytesDownloaded: 0, totalBytes, speed: 0 });

  return true;
}

/**
 * Verify whether the CLI binary is installed and retrieve its version.
 *
 * **Mock implementation** -- checks `localStorage` for a previously-stored
 * version string. A real implementation would spawn `goose --version`.
 *
 * @param platform Platform info.
 * @returns Object with `installed` flag and `version` string (or null).
 */
export async function verifyCLI(
  _platform: PlatformInfo,
): Promise<{ installed: boolean; version: string | null }> {
  // In a real build we would use child_process to run `goose --version`.
  // For now, check localStorage as a stand-in.
  const storedVersion = localStorage.getItem('cli_installed_version');
  if (storedVersion) {
    return { installed: true, version: storedVersion };
  }

  // Simulate a brief verification delay.
  await delay(200);
  return { installed: false, version: null };
}

/**
 * Get the full path where the CLI binary will be (or is) installed.
 *
 * @param platform Platform info.
 * @returns Absolute path to the CLI binary.
 */
export function getInstallPath(platform: PlatformInfo): string {
  const sep = platform.os === 'windows' ? '\\' : '/';
  return `${platform.installDir}${sep}${platform.binaryName}`;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/** Simple promise-based delay. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
