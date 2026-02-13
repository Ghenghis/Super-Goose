import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  checkCLIInstalled,
  checkForCLIUpdates,
  installCLI as installCLIBinary,
} from '../../utils/cliManager';
import { getTerminalManager, type TerminalSession } from '../../utils/terminalManager';

// ---------------------------------------------------------------------------
// Electron CLI bridge accessor (matches CLIDownloadService pattern)
// ---------------------------------------------------------------------------

/**
 * Shape of `window.electron.cli` when the preload bridge is wired up.
 * Used to try the Electron IPC path before falling back to mock behavior.
 */
interface ElectronCLIBridge {
  getBinaryPath: () => Promise<{ found: boolean; path: string }>;
  checkVersion: (binaryPath: string) => Promise<{ success: boolean; version?: string; error?: string }>;
  executeCommand: (binaryPath: string, args: string[]) => Promise<{ success: boolean; stdout?: string; stderr?: string; code?: number | null; error?: string }>;
  getLatestRelease: () => Promise<{ success: boolean; version?: string; assets?: Array<{ name: string; url: string; size: number }>; error?: string }>;
  getPlatformInfo: () => Promise<{ platform: string; arch: string; homedir: string }>;
}

/** Accessor for the optional CLI bridge on the window object. */
function getElectronCLI(): ElectronCLIBridge | undefined {
  try {
    return (window as any).electron?.cli as ElectronCLIBridge | undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** Supported platform identifiers */
export type Platform = 'windows' | 'macos' | 'linux';

/** Supported CPU architectures */
export type Arch = 'x64' | 'arm64';

/** Steps of the CLI setup wizard */
export type SetupStep = 'detect' | 'download' | 'install' | 'configure' | 'complete' | 'idle';

/** A single entry in the embedded terminal history */
export interface TerminalEntry {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: number;
}

/** Full CLI integration state */
export interface CLIState {
  // Installation state
  isInstalled: boolean;
  installPath: string | null; // e.g. "C:\Users\Admin\.goose\bin\goose.exe"
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;

  // Platform detection
  platform: Platform;
  arch: Arch;

  // Setup wizard state
  setupStep: SetupStep;
  setupProgress: number; // 0-100
  setupError: string | null;

  // Terminal state
  isTerminalOpen: boolean;
  terminalHistory: TerminalEntry[];

  // Feature toggle
  cliEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Platform detection helpers
// ---------------------------------------------------------------------------

/** Detect the current operating system from browser APIs */
function detectPlatform(): Platform {
  // Prefer Electron's process.platform when available
  if (typeof window !== 'undefined' && (window as any).electron?.platform) {
    const p = (window as any).electron.platform as string;
    if (p === 'win32') return 'windows';
    if (p === 'darwin') return 'macos';
    return 'linux';
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  return 'linux';
}

/** Detect the CPU architecture */
function detectArch(): Arch {
  if (typeof window !== 'undefined' && (window as any).electron?.arch) {
    const a = (window as any).electron.arch as string;
    if (a === 'arm64') return 'arm64';
    return 'x64';
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('arm64') || ua.includes('aarch64')) return 'arm64';
  return 'x64';
}

// ---------------------------------------------------------------------------
// LocalStorage persistence key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'super-goose-cli-state';

/** Load persisted state from localStorage (partial, safe merge) */
function loadPersistedState(): Partial<CLIState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<CLIState>;
  } catch {
    return {};
  }
}

/** Persist selected fields to localStorage */
function persistState(state: CLIState): void {
  try {
    const toSave: Partial<CLIState> = {
      isInstalled: state.isInstalled,
      installPath: state.installPath,
      installedVersion: state.installedVersion,
      latestVersion: state.latestVersion,
      updateAvailable: state.updateAvailable,
      cliEnabled: state.cliEnabled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Silently ignore quota errors
  }
}

// ---------------------------------------------------------------------------
// Default / initial state
// ---------------------------------------------------------------------------

function buildInitialState(): CLIState {
  const persisted = loadPersistedState();
  return {
    isInstalled: persisted.isInstalled ?? false,
    installPath: persisted.installPath ?? null,
    installedVersion: persisted.installedVersion ?? null,
    latestVersion: persisted.latestVersion ?? 'v1.24.05',
    updateAvailable: persisted.updateAvailable ?? false,
    platform: detectPlatform(),
    arch: detectArch(),
    setupStep: 'idle',
    setupProgress: 0,
    setupError: null,
    isTerminalOpen: false,
    terminalHistory: [],
    cliEnabled: persisted.cliEnabled ?? true,
  };
}

// ---------------------------------------------------------------------------
// Context value interface
// ---------------------------------------------------------------------------

interface CLIContextValue {
  state: CLIState;

  /** Begin the setup wizard from step 1 (platform detection) */
  startSetup: () => void;

  /** Cancel an in-progress setup, returning to idle */
  cancelSetup: () => void;

  /** Check whether a newer CLI version is available */
  checkForUpdates: () => void;

  /** Open the embedded terminal panel */
  openTerminal: () => void;

  /** Close the embedded terminal panel */
  closeTerminal: () => void;

  /** Send a command string to the embedded terminal */
  sendCommand: (cmd: string) => void;

  /** Toggle CLI integration on/off */
  toggleCLI: () => void;

  /** Trigger CLI binary installation (runs setup wizard) */
  installCLI: () => void;

  /** Trigger a CLI update to the latest version */
  updateCLI: () => void;

  /** Advance the setup wizard to a specific step (used by CLISetupWizard) */
  setSetupStep: (step: SetupStep) => void;

  /** Set the setup progress percentage (0-100) */
  setSetupProgress: (progress: number) => void;

  /** Set a setup error message */
  setSetupError: (error: string | null) => void;

  /** Mark installation as complete with path and version */
  markInstalled: (path: string, version: string) => void;
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

const CLIContext = createContext<CLIContextValue | null>(null);

/** Hook to consume CLI context. Must be used within a CLIProvider. */
export function useCLI(): CLIContextValue {
  const ctx = useContext(CLIContext);
  if (!ctx) {
    throw new Error('useCLI must be used within a CLIProvider.');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export const CLIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CLIState>(buildInitialState);

  // Ref to track the current terminal session
  const terminalSessionRef = useRef<TerminalSession | null>(null);
  const terminalUnsubscribeRef = useRef<(() => void) | null>(null);

  // Persist relevant fields whenever they change
  useEffect(() => {
    persistState(state);
  }, [
    state.isInstalled,
    state.installPath,
    state.installedVersion,
    state.latestVersion,
    state.updateAvailable,
    state.cliEnabled,
  ]);

  // Initialize CLI installed state from backend on mount
  useEffect(() => {
    const checkInstalled = async () => {
      // 1. Try Electron CLI bridge first (direct IPC to main process)
      const cli = getElectronCLI();
      if (cli) {
        try {
          const pathResult = await cli.getBinaryPath();
          if (pathResult.found) {
            const versionResult = await cli.checkVersion(pathResult.path);
            if (versionResult.success && versionResult.version) {
              setState((prev) => ({
                ...prev,
                isInstalled: true,
                installPath: pathResult.path,
                installedVersion: versionResult.version!,
              }));
              return;
            }
          }
        } catch (err) {
          console.warn('[CLIContext] Electron CLI bridge detectCLI failed, trying cliManager:', err);
        }
      }

      // 2. Fallback to cliManager (uses IPC invoke → mock)
      try {
        const versionInfo = await checkCLIInstalled();
        if (versionInfo) {
          setState((prev) => ({
            ...prev,
            isInstalled: true,
            installPath: versionInfo.path,
            installedVersion: versionInfo.version,
          }));
        }
      } catch (err) {
        console.warn('[CLIContext] Failed to check if CLI is installed:', err);
      }
    };

    checkInstalled();
  }, []);

  // Refine platform/arch from Electron CLI bridge (async, runs once on mount)
  useEffect(() => {
    const refinePlatform = async () => {
      const cli = getElectronCLI();
      if (!cli) return;

      try {
        const info = await cli.getPlatformInfo();
        const refinedPlatform: Platform =
          info.platform === 'win32' ? 'windows' :
          info.platform === 'darwin' ? 'macos' : 'linux';
        const refinedArch: Arch = info.arch === 'arm64' ? 'arm64' : 'x64';

        setState((prev) => {
          // Only update if different to avoid unnecessary re-renders
          if (prev.platform === refinedPlatform && prev.arch === refinedArch) return prev;
          return { ...prev, platform: refinedPlatform, arch: refinedArch };
        });
      } catch (err) {
        // Synchronous detection already set reasonable defaults; no action needed
        console.warn('[CLIContext] Electron CLI bridge getPlatformInfo failed:', err);
      }
    };

    refinePlatform();
  }, []);

  // Cleanup terminal session on unmount
  useEffect(() => {
    return () => {
      if (terminalUnsubscribeRef.current) {
        terminalUnsubscribeRef.current();
        terminalUnsubscribeRef.current = null;
      }
      if (terminalSessionRef.current) {
        const manager = getTerminalManager();
        manager.closeSession(terminalSessionRef.current.id).catch(console.error);
        terminalSessionRef.current = null;
      }
    };
  }, []);

  // --- Actions ---

  const startSetup = useCallback(() => {
    setState((prev) => ({
      ...prev,
      setupStep: 'detect',
      setupProgress: 0,
      setupError: null,
    }));
  }, []);

  const cancelSetup = useCallback(() => {
    setState((prev) => ({
      ...prev,
      setupStep: 'idle',
      setupProgress: 0,
      setupError: null,
    }));
  }, []);

  const checkForUpdates = useCallback(async () => {
    // 1. Try Electron CLI bridge first (direct IPC to main process)
    const cli = getElectronCLI();
    if (cli) {
      try {
        const result = await cli.getLatestRelease();
        if (result.success && result.version) {
          setState((prev) => ({
            ...prev,
            latestVersion: result.version!,
            updateAvailable: prev.installedVersion !== result.version,
          }));
          return;
        }
      } catch (err) {
        console.warn('[CLIContext] Electron CLI bridge getLatestRelease failed, trying cliManager:', err);
      }
    }

    // 2. Try cliManager (uses IPC invoke fallback → mock)
    try {
      const release = await checkForCLIUpdates();

      if (release) {
        setState((prev) => ({
          ...prev,
          latestVersion: release.version,
          updateAvailable: prev.installedVersion !== release.version,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          updateAvailable: false,
        }));
      }
    } catch (error) {
      console.error('[CLIContext] Failed to check for updates:', error);
      // 3. Last resort: hardcoded mock fallback for dev/test mode
      setState((prev) => ({
        ...prev,
        latestVersion: 'v1.24.05',
        updateAvailable: prev.installedVersion !== 'v1.24.05',
      }));
    }
  }, []);

  const openTerminal = useCallback(async () => {
    try {
      // If already have an active session, just show it
      if (terminalSessionRef.current) {
        setState((prev) => ({ ...prev, isTerminalOpen: true }));
        return;
      }

      // Create a new terminal session using the terminal manager
      const manager = getTerminalManager();
      const session = await manager.createSession();
      terminalSessionRef.current = session;

      // Subscribe to output
      const unsubscribe = manager.onOutput(session.id, (output) => {
        setState((prev) => {
          const newEntry: TerminalEntry = {
            id: `out-${output.timestamp}`,
            type: 'output',
            content: output.data,
            timestamp: output.timestamp,
          };
          return {
            ...prev,
            terminalHistory: [...prev.terminalHistory, newEntry].slice(-200),
          };
        });
      });
      terminalUnsubscribeRef.current = unsubscribe;

      // Add welcome message
      setState((prev) => ({
        ...prev,
        isTerminalOpen: true,
        terminalHistory: [
          {
            id: `sys-${Date.now()}`,
            type: 'system',
            content: `Super-Goose CLI terminal ready (${manager.isUsingElectron() ? 'real' : 'mock'} mode). Type a command to begin.`,
            timestamp: Date.now(),
          },
        ],
      }));
    } catch (err) {
      console.error('[CLIContext] Failed to open terminal:', err);

      // Fallback to mock terminal
      setState((prev) => ({
        ...prev,
        isTerminalOpen: true,
        terminalHistory: prev.terminalHistory.length === 0
          ? [
              {
                id: `sys-${Date.now()}`,
                type: 'system',
                content: 'Super-Goose CLI terminal ready. Type a command to begin.',
                timestamp: Date.now(),
              },
            ]
          : prev.terminalHistory,
      }));
    }
  }, []);

  const closeTerminal = useCallback(async () => {
    setState((prev) => ({ ...prev, isTerminalOpen: false }));

    // Optionally close the session (keep it alive for reopening)
    // If you want to close it, uncomment:
    // if (terminalSessionRef.current) {
    //   const manager = getTerminalManager();
    //   await manager.closeSession(terminalSessionRef.current.id);
    //   terminalSessionRef.current = null;
    // }
  }, []);

  const sendCommand = useCallback(async (cmd: string) => {
    const inputEntry: TerminalEntry = {
      id: `in-${Date.now()}`,
      type: 'input',
      content: cmd,
      timestamp: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      terminalHistory: [...prev.terminalHistory, inputEntry].slice(-200),
    }));

    // 1. Try to send to real terminal session (PTY via terminalManager)
    if (terminalSessionRef.current) {
      try {
        const manager = getTerminalManager();
        await manager.sendInput(terminalSessionRef.current.id, cmd + '\n');
        return;
      } catch (err) {
        console.error('[CLIContext] Failed to send command to terminal session:', err);
      }
    }

    // 2. Try Electron CLI bridge executeCommand (one-shot command execution)
    const cli = getElectronCLI();
    if (cli) {
      try {
        const pathResult = await cli.getBinaryPath();
        if (pathResult.found) {
          const args = cmd.split(/\s+/).filter(Boolean);
          const result = await cli.executeCommand(pathResult.path, args);
          const outputContent = result.success
            ? (result.stdout || '(no output)')
            : (result.stderr || result.error || 'Command failed');
          const outputEntry: TerminalEntry = {
            id: `out-${Date.now() + 1}`,
            type: result.success ? 'output' : 'error',
            content: outputContent,
            timestamp: Date.now() + 100,
          };
          setState((prev) => ({
            ...prev,
            terminalHistory: [...prev.terminalHistory, outputEntry].slice(-200),
          }));
          return;
        }
      } catch (err) {
        console.warn('[CLIContext] Electron CLI bridge executeCommand failed, falling back to mock:', err);
      }
    }

    // 3. Fallback: mock response (dev/test mode)
    const outputEntry: TerminalEntry = {
      id: `out-${Date.now() + 1}`,
      type: 'output',
      content: `[mock] Executed: ${cmd}`,
      timestamp: Date.now() + 100,
    };

    setState((prev) => ({
      ...prev,
      terminalHistory: [...prev.terminalHistory, outputEntry].slice(-200),
    }));
  }, []);

  const toggleCLI = useCallback(() => {
    setState((prev) => ({ ...prev, cliEnabled: !prev.cliEnabled }));
  }, []);

  const installCLI = useCallback(async () => {
    try {
      // Start the setup wizard
      setState((prev) => ({
        ...prev,
        setupStep: 'download',
        setupProgress: 0,
        setupError: null,
      }));

      // 1. Try Electron CLI bridge first for release info
      let release: { version: string; downloadUrl: string; size: number; sha256: string; releaseDate: string } | null = null;
      const cli = getElectronCLI();
      if (cli) {
        try {
          const result = await cli.getLatestRelease();
          if (result.success && result.version && result.assets && result.assets.length > 0) {
            release = {
              version: result.version,
              downloadUrl: result.assets[0].url,
              size: result.assets[0].size,
              sha256: '',
              releaseDate: new Date().toISOString(),
            };
          }
        } catch (err) {
          console.warn('[CLIContext] Electron CLI bridge getLatestRelease failed during install, trying cliManager:', err);
        }
      }

      // 2. Fallback to cliManager for release info
      if (!release) {
        release = await checkForCLIUpdates();
      }

      if (!release) {
        throw new Error('No CLI release available for download');
      }

      // Update to install step
      setState((prev) => ({ ...prev, setupStep: 'install' }));

      // Install the CLI with progress tracking
      const versionInfo = await installCLIBinary(release, (percent) => {
        setState((prev) => ({ ...prev, setupProgress: percent }));
      });

      // Mark as complete
      setState((prev) => ({
        ...prev,
        isInstalled: true,
        installPath: versionInfo.path,
        installedVersion: versionInfo.version,
        latestVersion: versionInfo.version,
        updateAvailable: false,
        setupStep: 'complete',
        setupProgress: 100,
        setupError: null,
      }));
    } catch (error) {
      console.error('[CLIContext] Installation failed:', error);
      setState((prev) => ({
        ...prev,
        setupError: error instanceof Error ? error.message : 'Installation failed',
        setupStep: 'idle',
      }));
    }
  }, []);

  const updateCLI = useCallback(async () => {
    try {
      // Reuse the install flow
      await installCLI();
    } catch (error) {
      console.error('[CLIContext] Update failed:', error);
      setState((prev) => ({
        ...prev,
        setupError: error instanceof Error ? error.message : 'Update failed',
        setupStep: 'idle',
      }));
    }
  }, [installCLI]);

  const setSetupStep = useCallback((step: SetupStep) => {
    setState((prev) => ({
      ...prev,
      setupStep: step,
      setupProgress: step === 'idle' ? 0 : prev.setupProgress,
      setupError: null,
    }));
  }, []);

  const setSetupProgress = useCallback((progress: number) => {
    setState((prev) => ({ ...prev, setupProgress: Math.min(100, Math.max(0, progress)) }));
  }, []);

  const setSetupError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, setupError: error }));
  }, []);

  const markInstalled = useCallback((path: string, version: string) => {
    setState((prev) => ({
      ...prev,
      isInstalled: true,
      installPath: path,
      installedVersion: version,
      latestVersion: version,
      updateAvailable: false,
      setupStep: 'complete',
      setupProgress: 100,
      setupError: null,
    }));
  }, []);

  // --- Memoised context value ---

  const value: CLIContextValue = useMemo(
    () => ({
      state,
      startSetup,
      cancelSetup,
      checkForUpdates,
      openTerminal,
      closeTerminal,
      sendCommand,
      toggleCLI,
      installCLI,
      updateCLI,
      setSetupStep,
      setSetupProgress,
      setSetupError,
      markInstalled,
    }),
    [
      state,
      startSetup,
      cancelSetup,
      checkForUpdates,
      openTerminal,
      closeTerminal,
      sendCommand,
      toggleCLI,
      installCLI,
      updateCLI,
      setSetupStep,
      setSetupProgress,
      setSetupError,
      markInstalled,
    ]
  );

  return <CLIContext.Provider value={value}>{children}</CLIContext.Provider>;
};

export default CLIProvider;
