import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

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

  const checkForUpdates = useCallback(() => {
    // Mock: simulate a brief check then report result
    setState((prev) => ({
      ...prev,
      latestVersion: 'v1.24.05',
      updateAvailable: prev.installedVersion !== 'v1.24.05',
    }));
  }, []);

  const openTerminal = useCallback(() => {
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
  }, []);

  const closeTerminal = useCallback(() => {
    setState((prev) => ({ ...prev, isTerminalOpen: false }));
  }, []);

  const sendCommand = useCallback((cmd: string) => {
    const inputEntry: TerminalEntry = {
      id: `in-${Date.now()}`,
      type: 'input',
      content: cmd,
      timestamp: Date.now(),
    };

    // Mock response after a brief "processing" delay
    const outputEntry: TerminalEntry = {
      id: `out-${Date.now() + 1}`,
      type: 'output',
      content: `[mock] Executed: ${cmd}`,
      timestamp: Date.now() + 100,
    };

    setState((prev) => ({
      ...prev,
      terminalHistory: [...prev.terminalHistory, inputEntry, outputEntry].slice(-200),
    }));
  }, []);

  const toggleCLI = useCallback(() => {
    setState((prev) => ({ ...prev, cliEnabled: !prev.cliEnabled }));
  }, []);

  const installCLI = useCallback(() => {
    // Alias for starting the setup wizard
    setState((prev) => ({
      ...prev,
      setupStep: 'detect',
      setupProgress: 0,
      setupError: null,
    }));
  }, []);

  const updateCLI = useCallback(() => {
    // Mock: simulate an update by re-running download + install
    setState((prev) => ({
      ...prev,
      setupStep: 'download',
      setupProgress: 0,
      setupError: null,
    }));
  }, []);

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
