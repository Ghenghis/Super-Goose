/**
 * terminalManager.ts
 *
 * Terminal session management for the Super-Goose CLI panel.
 * Provides a unified interface for creating terminal sessions, sending input,
 * receiving output, and managing session lifecycle.
 *
 * When running in Electron, uses IPC to communicate with native PTY processes.
 * Falls back to a mock terminal implementation when Electron APIs are unavailable.
 */

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** Represents a terminal session with its metadata */
export interface TerminalSession {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
  createdAt: string;
}

/** Output data from a terminal session */
export interface TerminalOutput {
  data: string;
  timestamp: number;
}

/** Configuration for creating a new terminal session */
export interface CreateSessionOptions {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

/** Configuration for resizing a terminal */
export interface ResizeOptions {
  cols: number;
  rows: number;
}

// ---------------------------------------------------------------------------
// Type guard for Electron API
// ---------------------------------------------------------------------------

interface ElectronAPI {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, callback: (...args: any[]) => void): () => void;
  off?(channel: string, callback: (...args: any[]) => void): void;
}

/** Check if Electron APIs are available */
function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    'electron' in window &&
    typeof (window as any).electron?.invoke === 'function' &&
    typeof (window as any).electron?.on === 'function'
  );
}

/** Get the Electron API if available */
function getElectronAPI(): ElectronAPI | null {
  if (hasElectronAPI()) {
    return (window as any).electron as ElectronAPI;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/** Detect the current platform */
function detectPlatform(): 'windows' | 'macos' | 'linux' {
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

/** Get the default shell for the current platform */
function getDefaultShell(): string {
  const platform = detectPlatform();
  switch (platform) {
    case 'windows':
      return 'cmd.exe';
    case 'macos':
      return '/bin/zsh';
    case 'linux':
    default:
      return '/bin/bash';
  }
}

// ---------------------------------------------------------------------------
// Mock Terminal Implementation
// ---------------------------------------------------------------------------

/** Simple mock terminal that echoes commands back */
class MockTerminal {
  private sessions = new Map<string, TerminalSession>();
  private outputCallbacks = new Map<string, Set<(output: TerminalOutput) => void>>();
  private nextPid = 1000;

  /** Create a mock terminal session */
  async createSession(options: CreateSessionOptions): Promise<TerminalSession> {
    const id = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const session: TerminalSession = {
      id,
      pid: this.nextPid++,
      shell: options.shell || getDefaultShell(),
      cwd: options.cwd || process.cwd?.() || '~',
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(id, session);
    this.outputCallbacks.set(id, new Set());

    // Send welcome message
    setTimeout(() => {
      this.sendOutput(id, `Mock terminal session started (${session.shell})\r\n`);
      this.sendOutput(id, `Working directory: ${session.cwd}\r\n`);
      this.sendOutput(id, `Type commands to see them echoed back.\r\n`);
    }, 100);

    return session;
  }

  /** Send input to a mock terminal session */
  async sendInput(sessionId: string, data: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    // Echo the input
    this.sendOutput(sessionId, data);

    // Simulate command execution
    setTimeout(() => {
      const trimmed = data.trim();
      if (trimmed) {
        // Handle special commands
        if (trimmed === 'clear' || trimmed === 'cls') {
          this.sendOutput(sessionId, '\x1b[2J\x1b[H'); // ANSI clear screen
        } else if (trimmed === 'exit' || trimmed === 'quit') {
          this.sendOutput(sessionId, 'Session closed.\r\n');
          this.closeSession(sessionId);
        } else if (trimmed.startsWith('cd ')) {
          const newDir = trimmed.substring(3).trim();
          session.cwd = newDir;
          this.sendOutput(sessionId, `\r\n`);
        } else {
          // Echo command result
          this.sendOutput(sessionId, `\r\n[mock] Executed: ${trimmed}\r\n`);
        }
      } else {
        this.sendOutput(sessionId, `\r\n`);
      }
    }, 50);
  }

  /** Subscribe to output from a mock terminal session */
  onOutput(sessionId: string, callback: (output: TerminalOutput) => void): () => void {
    const callbacks = this.outputCallbacks.get(sessionId);
    if (!callbacks) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
    };
  }

  /** Resize mock terminal (no-op for mock) */
  async resize(sessionId: string, _options: ResizeOptions): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }
    // Mock terminal doesn't need to do anything for resize
  }

  /** Close a mock terminal session */
  async closeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.outputCallbacks.delete(sessionId);
  }

  /** Get all active sessions */
  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  /** Helper to send output to all subscribers */
  private sendOutput(sessionId: string, data: string): void {
    const callbacks = this.outputCallbacks.get(sessionId);
    if (callbacks) {
      const output: TerminalOutput = {
        data,
        timestamp: Date.now(),
      };
      callbacks.forEach((cb) => cb(output));
    }
  }
}

// ---------------------------------------------------------------------------
// Real Terminal Implementation (Electron IPC)
// ---------------------------------------------------------------------------

/** Real terminal using Electron IPC to communicate with PTY processes */
class ElectronTerminal {
  private api: ElectronAPI;
  private sessions = new Map<string, TerminalSession>();
  private outputCallbacks = new Map<string, Set<(output: TerminalOutput) => void>>();
  private ipcUnsubscribers = new Map<string, () => void>();

  constructor(api: ElectronAPI) {
    this.api = api;
  }

  /** Create a real terminal session via Electron IPC */
  async createSession(options: CreateSessionOptions): Promise<TerminalSession> {
    try {
      const result = await this.api.invoke('terminal:create', {
        shell: options.shell,
        cwd: options.cwd,
        cols: options.cols || 80,
        rows: options.rows || 24,
      });

      const session: TerminalSession = {
        id: result.id,
        pid: result.pid,
        shell: result.shell,
        cwd: result.cwd,
        createdAt: result.createdAt || new Date().toISOString(),
      };

      this.sessions.set(session.id, session);
      this.outputCallbacks.set(session.id, new Set());

      // Subscribe to output events from this session
      const unsubscribe = this.api.on(`terminal:output:${session.id}`, (data: string) => {
        this.handleOutput(session.id, data);
      });
      this.ipcUnsubscribers.set(session.id, unsubscribe);

      return session;
    } catch (error) {
      console.error('[TerminalManager] Failed to create session via IPC:', error);
      throw new Error(`Failed to create terminal session: ${error}`);
    }
  }

  /** Send input to a real terminal session via Electron IPC */
  async sendInput(sessionId: string, data: string): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    try {
      await this.api.invoke('terminal:input', { sessionId, data });
    } catch (error) {
      console.error('[TerminalManager] Failed to send input via IPC:', error);
      throw new Error(`Failed to send terminal input: ${error}`);
    }
  }

  /** Subscribe to output from a real terminal session */
  onOutput(sessionId: string, callback: (output: TerminalOutput) => void): () => void {
    const callbacks = this.outputCallbacks.get(sessionId);
    if (!callbacks) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
    };
  }

  /** Resize real terminal via Electron IPC */
  async resize(sessionId: string, options: ResizeOptions): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    try {
      await this.api.invoke('terminal:resize', {
        sessionId,
        cols: options.cols,
        rows: options.rows,
      });
    } catch (error) {
      console.error('[TerminalManager] Failed to resize terminal via IPC:', error);
      throw new Error(`Failed to resize terminal: ${error}`);
    }
  }

  /** Close a real terminal session via Electron IPC */
  async closeSession(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      return; // Already closed
    }

    try {
      // Unsubscribe from IPC events
      const unsubscribe = this.ipcUnsubscribers.get(sessionId);
      if (unsubscribe) {
        unsubscribe();
        this.ipcUnsubscribers.delete(sessionId);
      }

      // Close the session via IPC
      await this.api.invoke('terminal:close', { sessionId });

      // Clean up local state
      this.sessions.delete(sessionId);
      this.outputCallbacks.delete(sessionId);
    } catch (error) {
      console.error('[TerminalManager] Failed to close session via IPC:', error);
      // Clean up local state even if IPC fails
      this.sessions.delete(sessionId);
      this.outputCallbacks.delete(sessionId);
    }
  }

  /** Get all active sessions */
  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  /** Handle output from IPC and distribute to subscribers */
  private handleOutput(sessionId: string, data: string): void {
    const callbacks = this.outputCallbacks.get(sessionId);
    if (callbacks) {
      const output: TerminalOutput = {
        data,
        timestamp: Date.now(),
      };
      callbacks.forEach((cb) => cb(output));
    }
  }
}

// ---------------------------------------------------------------------------
// Main TerminalManager class
// ---------------------------------------------------------------------------

/**
 * TerminalManager provides a unified interface for managing terminal sessions.
 * Automatically uses Electron IPC when available, falls back to mock terminal otherwise.
 */
export class TerminalManager {
  private backend: MockTerminal | ElectronTerminal;
  private isElectron: boolean;

  constructor() {
    const api = getElectronAPI();
    if (api) {
      this.backend = new ElectronTerminal(api);
      this.isElectron = true;
    } else {
      this.backend = new MockTerminal();
      this.isElectron = false;
    }
  }

  /**
   * Create a new terminal session.
   *
   * @param shell - Shell to use (defaults to platform-specific shell)
   * @param cwd - Working directory (defaults to home directory)
   * @param cols - Terminal columns (defaults to 80)
   * @param rows - Terminal rows (defaults to 24)
   * @returns Promise resolving to the created session
   */
  async createSession(
    shell?: string,
    cwd?: string,
    cols?: number,
    rows?: number
  ): Promise<TerminalSession> {
    return this.backend.createSession({ shell, cwd, cols, rows });
  }

  /**
   * Send input to a terminal session.
   *
   * @param sessionId - ID of the session
   * @param data - Input data to send
   */
  async sendInput(sessionId: string, data: string): Promise<void> {
    return this.backend.sendInput(sessionId, data);
  }

  /**
   * Subscribe to output from a terminal session.
   *
   * @param sessionId - ID of the session
   * @param callback - Function to call when output is received
   * @returns Unsubscribe function
   */
  onOutput(sessionId: string, callback: (output: TerminalOutput) => void): () => void {
    return this.backend.onOutput(sessionId, callback);
  }

  /**
   * Resize a terminal session.
   *
   * @param sessionId - ID of the session
   * @param cols - New column count
   * @param rows - New row count
   */
  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    return this.backend.resize(sessionId, { cols, rows });
  }

  /**
   * Close a terminal session.
   *
   * @param sessionId - ID of the session
   */
  async closeSession(sessionId: string): Promise<void> {
    return this.backend.closeSession(sessionId);
  }

  /**
   * Get all active terminal sessions.
   *
   * @returns Array of active sessions
   */
  getActiveSessions(): TerminalSession[] {
    return this.backend.getActiveSessions();
  }

  /**
   * Check if running in Electron with real terminal support.
   *
   * @returns true if using Electron IPC, false if using mock terminal
   */
  isUsingElectron(): boolean {
    return this.isElectron;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let instance: TerminalManager | null = null;

/**
 * Get the singleton TerminalManager instance.
 * Creates one if it doesn't exist.
 */
export function getTerminalManager(): TerminalManager {
  if (!instance) {
    instance = new TerminalManager();
  }
  return instance;
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetTerminalManager(): void {
  instance = null;
}
