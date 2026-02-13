/**
 * terminalManager.test.ts
 *
 * Unit tests for the TerminalManager class and its mock/Electron implementations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TerminalManager,
  getTerminalManager,
  resetTerminalManager,
  type TerminalOutput,
} from '../terminalManager';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Mock Electron API for testing */
interface MockElectronAPI {
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  platform?: string;
}

/** Setup mock Electron API on window */
function setupMockElectron(): MockElectronAPI {
  const mockAPI: MockElectronAPI = {
    invoke: vi.fn(),
    on: vi.fn(() => vi.fn()), // Return unsubscribe function
    platform: 'win32',
  };

  (window as any).electron = mockAPI;
  return mockAPI;
}

/** Remove mock Electron API from window */
function cleanupMockElectron(): void {
  if ((window as any).electron) {
    (window as any).electron = undefined;
  }
}

/** Wait for a short delay (useful for async mock operations) */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TerminalManager', () => {
  afterEach(() => {
    cleanupMockElectron();
    resetTerminalManager();
  });

  describe('Mock Terminal (no Electron)', () => {
    let manager: TerminalManager;

    beforeEach(() => {
      cleanupMockElectron();
      manager = new TerminalManager();
    });

    it('should create a mock terminal session', async () => {
      const session = await manager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^mock-/);
      expect(session.pid).toBeGreaterThan(0);
      expect(session.shell).toBeTruthy();
      expect(session.cwd).toBeTruthy();
      expect(session.createdAt).toBeTruthy();
    });

    it('should create session with custom shell and cwd', async () => {
      const session = await manager.createSession('/bin/zsh', '/home/user');

      expect(session.shell).toBe('/bin/zsh');
      expect(session.cwd).toBe('/home/user');
    });

    it('should send input and receive output', async () => {
      const session = await manager.createSession();
      const outputs: TerminalOutput[] = [];

      // Subscribe to output
      const unsubscribe = manager.onOutput(session.id, (output) => {
        outputs.push(output);
      });

      // Wait for welcome message
      await delay(150);

      // Send a command
      await manager.sendInput(session.id, 'echo hello\n');

      // Wait for response
      await delay(100);

      // Should have received welcome message + echo response
      expect(outputs.length).toBeGreaterThan(0);
      const outputText = outputs.map((o) => o.data).join('');
      expect(outputText).toContain('Mock terminal');
      expect(outputText).toContain('echo hello');

      unsubscribe();
    });

    it('should handle multiple subscribers', async () => {
      const session = await manager.createSession();
      const outputs1: TerminalOutput[] = [];
      const outputs2: TerminalOutput[] = [];

      const unsub1 = manager.onOutput(session.id, (output) => outputs1.push(output));
      const unsub2 = manager.onOutput(session.id, (output) => outputs2.push(output));

      await delay(150);
      await manager.sendInput(session.id, 'test\n');
      await delay(100);

      // Both subscribers should receive the same output
      expect(outputs1.length).toBeGreaterThan(0);
      expect(outputs2.length).toBe(outputs1.length);
      expect(outputs1.map((o) => o.data)).toEqual(outputs2.map((o) => o.data));

      unsub1();
      unsub2();
    });

    it('should unsubscribe correctly', async () => {
      const session = await manager.createSession();
      const outputs: TerminalOutput[] = [];

      const unsubscribe = manager.onOutput(session.id, (output) => outputs.push(output));

      await delay(150);
      const countBefore = outputs.length;

      // Unsubscribe
      unsubscribe();

      // Send more input
      await manager.sendInput(session.id, 'test\n');
      await delay(100);

      // Should not receive new output
      expect(outputs.length).toBe(countBefore);
    });

    it('should close a session', async () => {
      const session = await manager.createSession();

      await manager.closeSession(session.id);

      const sessions = manager.getActiveSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should track multiple active sessions', async () => {
      const session1 = await manager.createSession();
      const session2 = await manager.createSession();
      const session3 = await manager.createSession();

      const sessions = manager.getActiveSessions();
      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.id)).toContain(session1.id);
      expect(sessions.map((s) => s.id)).toContain(session2.id);
      expect(sessions.map((s) => s.id)).toContain(session3.id);
    });

    it('should handle resize (no-op for mock)', async () => {
      const session = await manager.createSession();

      // Should not throw
      await expect(manager.resize(session.id, 100, 30)).resolves.toBeUndefined();
    });

    it('should throw error when sending to non-existent session', async () => {
      await expect(manager.sendInput('invalid-session', 'test\n')).rejects.toThrow(
        'Terminal session not found'
      );
    });

    it('should throw error when subscribing to non-existent session', () => {
      expect(() => manager.onOutput('invalid-session', () => {})).toThrow(
        'Terminal session not found'
      );
    });

    it('should report not using Electron', () => {
      expect(manager.isUsingElectron()).toBe(false);
    });

    it('should handle special commands (clear)', async () => {
      const session = await manager.createSession();
      const outputs: TerminalOutput[] = [];

      manager.onOutput(session.id, (output) => outputs.push(output));

      await delay(150);
      outputs.length = 0; // Clear welcome messages

      await manager.sendInput(session.id, 'clear\n');
      await delay(100);

      const outputText = outputs.map((o) => o.data).join('');
      // Should contain ANSI clear sequence
      expect(outputText).toContain('\x1b[2J\x1b[H');
    });

    it('should handle cd command', async () => {
      const session = await manager.createSession();
      const outputs: TerminalOutput[] = [];

      manager.onOutput(session.id, (output) => outputs.push(output));

      await delay(150);
      await manager.sendInput(session.id, 'cd /tmp\n');
      await delay(100);

      // Session cwd should be updated
      const updatedSessions = manager.getActiveSessions();
      const updatedSession = updatedSessions.find((s) => s.id === session.id);
      expect(updatedSession?.cwd).toBe('/tmp');
    });
  });

  describe('Electron Terminal (with IPC)', () => {
    let manager: TerminalManager;
    let mockAPI: MockElectronAPI;

    beforeEach(() => {
      mockAPI = setupMockElectron();
      manager = new TerminalManager();
    });

    it('should create a session via Electron IPC', async () => {
      const mockSession = {
        id: 'electron-session-1',
        pid: 12345,
        shell: 'cmd.exe',
        cwd: 'C:\\Users\\Test',
        createdAt: new Date().toISOString(),
      };

      mockAPI.invoke.mockResolvedValueOnce(mockSession);

      const session = await manager.createSession();

      expect(mockAPI.invoke).toHaveBeenCalledWith('terminal:create', expect.any(Object));
      expect(session.id).toBe(mockSession.id);
      expect(session.pid).toBe(mockSession.pid);
      expect(session.shell).toBe(mockSession.shell);
      expect(session.cwd).toBe(mockSession.cwd);
    });

    it('should pass options to Electron IPC', async () => {
      const mockSession = {
        id: 'electron-session-2',
        pid: 12346,
        shell: '/bin/zsh',
        cwd: '/home/test',
        createdAt: new Date().toISOString(),
      };

      mockAPI.invoke.mockResolvedValueOnce(mockSession);

      await manager.createSession('/bin/zsh', '/home/test', 120, 40);

      expect(mockAPI.invoke).toHaveBeenCalledWith('terminal:create', {
        shell: '/bin/zsh',
        cwd: '/home/test',
        cols: 120,
        rows: 40,
      });
    });

    it('should send input via Electron IPC', async () => {
      const mockSession = {
        id: 'electron-session-3',
        pid: 12347,
        shell: 'cmd.exe',
        cwd: 'C:\\',
        createdAt: new Date().toISOString(),
      };

      mockAPI.invoke.mockResolvedValueOnce(mockSession);

      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);

      await manager.sendInput(session.id, 'dir\n');

      expect(mockAPI.invoke).toHaveBeenCalledWith('terminal:input', {
        sessionId: session.id,
        data: 'dir\n',
      });
    });

    it('should subscribe to output via Electron IPC', async () => {
      const mockSession = {
        id: 'electron-session-4',
        pid: 12348,
        shell: 'cmd.exe',
        cwd: 'C:\\',
        createdAt: new Date().toISOString(),
      };

      let outputCallback: ((data: string) => void) | null = null;

      mockAPI.invoke.mockResolvedValueOnce(mockSession);
      mockAPI.on.mockImplementationOnce((channel: string, callback: (data: string) => void) => {
        expect(channel).toBe(`terminal:output:${mockSession.id}`);
        outputCallback = callback;
        return vi.fn(); // Return unsubscribe function
      });

      const session = await manager.createSession();
      const outputs: TerminalOutput[] = [];

      manager.onOutput(session.id, (output) => outputs.push(output));

      // Simulate output from Electron
      expect(outputCallback).toBeTruthy();
      outputCallback!('Hello from terminal\r\n');
      outputCallback!('Another line\r\n');

      expect(outputs).toHaveLength(2);
      expect(outputs[0].data).toBe('Hello from terminal\r\n');
      expect(outputs[1].data).toBe('Another line\r\n');
    });

    it('should resize via Electron IPC', async () => {
      const mockSession = {
        id: 'electron-session-5',
        pid: 12349,
        shell: 'cmd.exe',
        cwd: 'C:\\',
        createdAt: new Date().toISOString(),
      };

      mockAPI.invoke.mockResolvedValueOnce(mockSession);

      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);

      await manager.resize(session.id, 100, 30);

      expect(mockAPI.invoke).toHaveBeenCalledWith('terminal:resize', {
        sessionId: session.id,
        cols: 100,
        rows: 30,
      });
    });

    it('should close session via Electron IPC', async () => {
      const mockSession = {
        id: 'electron-session-6',
        pid: 12350,
        shell: 'cmd.exe',
        cwd: 'C:\\',
        createdAt: new Date().toISOString(),
      };

      const mockUnsubscribe = vi.fn();
      mockAPI.invoke.mockResolvedValueOnce(mockSession);
      mockAPI.on.mockReturnValueOnce(mockUnsubscribe);

      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);

      await manager.closeSession(session.id);

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockAPI.invoke).toHaveBeenCalledWith('terminal:close', {
        sessionId: session.id,
      });
      expect(manager.getActiveSessions()).toHaveLength(0);
    });

    it('should handle IPC errors gracefully', async () => {
      mockAPI.invoke.mockRejectedValueOnce(new Error('IPC communication failed'));

      await expect(manager.createSession()).rejects.toThrow(
        'Failed to create terminal session'
      );
    });

    it('should clean up on close even if IPC fails', async () => {
      const mockSession = {
        id: 'electron-session-7',
        pid: 12351,
        shell: 'cmd.exe',
        cwd: 'C:\\',
        createdAt: new Date().toISOString(),
      };

      mockAPI.invoke.mockResolvedValueOnce(mockSession);
      const session = await manager.createSession();

      // Make close fail
      mockAPI.invoke.mockRejectedValueOnce(new Error('Close failed'));

      await manager.closeSession(session.id);

      // Should still clean up local state
      expect(manager.getActiveSessions()).toHaveLength(0);
    });

    it('should report using Electron', () => {
      expect(manager.isUsingElectron()).toBe(true);
    });
  });

  describe('Singleton instance', () => {
    afterEach(() => {
      resetTerminalManager();
    });

    it('should return same instance on multiple calls', () => {
      const manager1 = getTerminalManager();
      const manager2 = getTerminalManager();

      expect(manager1).toBe(manager2);
    });

    it('should create new instance after reset', () => {
      const manager1 = getTerminalManager();
      resetTerminalManager();
      const manager2 = getTerminalManager();

      expect(manager1).not.toBe(manager2);
    });
  });

  describe('IPC channel name contracts', () => {
    // These tests verify the exact IPC channel names that the ElectronTerminal
    // sends to the main process, ensuring the frontend and main.ts stay in sync.

    let mockAPI: MockElectronAPI;

    beforeEach(() => {
      mockAPI = setupMockElectron();
    });

    it('should invoke "terminal:create" for session creation', async () => {
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'chan-test-1',
        pid: 9000,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const manager = new TerminalManager();
      await manager.createSession();

      expect(mockAPI.invoke).toHaveBeenCalledTimes(1);
      expect(mockAPI.invoke.mock.calls[0][0]).toBe('terminal:create');
    });

    it('should invoke "terminal:input" for sending data', async () => {
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'chan-test-2',
        pid: 9001,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const manager = new TerminalManager();
      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);
      await manager.sendInput(session.id, 'ls\n');

      expect(mockAPI.invoke.mock.calls[1][0]).toBe('terminal:input');
    });

    it('should invoke "terminal:resize" for resizing', async () => {
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'chan-test-3',
        pid: 9002,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const manager = new TerminalManager();
      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);
      await manager.resize(session.id, 120, 40);

      expect(mockAPI.invoke.mock.calls[1][0]).toBe('terminal:resize');
    });

    it('should invoke "terminal:close" for session teardown', async () => {
      const mockUnsubscribe = vi.fn();
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'chan-test-4',
        pid: 9003,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });
      mockAPI.on.mockReturnValueOnce(mockUnsubscribe);

      const manager = new TerminalManager();
      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);
      await manager.closeSession(session.id);

      expect(mockAPI.invoke.mock.calls[1][0]).toBe('terminal:close');
    });

    it('should subscribe to "terminal:output:{sessionId}" for output', async () => {
      const sessionId = 'chan-test-5';
      mockAPI.invoke.mockResolvedValueOnce({
        id: sessionId,
        pid: 9004,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const capturedChannels: string[] = [];
      mockAPI.on.mockImplementation((channel: string) => {
        capturedChannels.push(channel);
        return vi.fn();
      });

      const manager = new TerminalManager();
      await manager.createSession();

      expect(capturedChannels).toContain(`terminal:output:${sessionId}`);
    });

    it('should pass default cols=80 and rows=24 when not specified', async () => {
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'defaults-test',
        pid: 9010,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const manager = new TerminalManager();
      await manager.createSession();

      const createArgs = mockAPI.invoke.mock.calls[0][1];
      expect(createArgs.cols).toBe(80);
      expect(createArgs.rows).toBe(24);
    });

    it('should use createdAt from response or fall back to current time', async () => {
      const specificDate = '2025-06-15T12:00:00.000Z';
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'date-test-1',
        pid: 9011,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: specificDate,
      });

      const manager = new TerminalManager();
      const session = await manager.createSession();
      expect(session.createdAt).toBe(specificDate);
    });

    it('should fall back to current ISO string when createdAt is missing', async () => {
      const before = new Date().toISOString();
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'date-test-2',
        pid: 9012,
        shell: 'bash',
        cwd: '/tmp',
        // No createdAt field
      });

      const manager = new TerminalManager();
      const session = await manager.createSession();

      const after = new Date().toISOString();
      // createdAt should be an ISO date string between before and after
      expect(session.createdAt).toBeDefined();
      expect(session.createdAt >= before).toBe(true);
      expect(session.createdAt <= after).toBe(true);
    });

    it('should throw when sending input to non-existent Electron session', async () => {
      const manager = new TerminalManager();
      await expect(manager.sendInput('nonexistent-id', 'data')).rejects.toThrow(
        'Terminal session not found'
      );
    });

    it('should throw when resizing a non-existent Electron session', async () => {
      const manager = new TerminalManager();
      await expect(manager.resize('nonexistent-id', 80, 24)).rejects.toThrow(
        'Terminal session not found'
      );
    });

    it('should not throw when closing a non-existent Electron session', async () => {
      const manager = new TerminalManager();
      // closeSession on non-existent session should succeed silently
      await expect(manager.closeSession('nonexistent-id')).resolves.toBeUndefined();
    });

    it('should include sessionId in terminal:input payload', async () => {
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'payload-test',
        pid: 9020,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const manager = new TerminalManager();
      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);
      await manager.sendInput(session.id, 'echo hello\n');

      expect(mockAPI.invoke.mock.calls[1][1]).toEqual({
        sessionId: 'payload-test',
        data: 'echo hello\n',
      });
    });

    it('should include sessionId in terminal:close payload', async () => {
      const mockUnsubscribe = vi.fn();
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'close-payload-test',
        pid: 9021,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });
      mockAPI.on.mockReturnValueOnce(mockUnsubscribe);

      const manager = new TerminalManager();
      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);
      await manager.closeSession(session.id);

      expect(mockAPI.invoke.mock.calls[1][1]).toEqual({
        sessionId: 'close-payload-test',
      });
    });

    it('should include cols and rows in terminal:resize payload', async () => {
      mockAPI.invoke.mockResolvedValueOnce({
        id: 'resize-payload-test',
        pid: 9022,
        shell: 'bash',
        cwd: '/tmp',
        createdAt: new Date().toISOString(),
      });

      const manager = new TerminalManager();
      const session = await manager.createSession();

      mockAPI.invoke.mockResolvedValueOnce(undefined);
      await manager.resize(session.id, 200, 50);

      expect(mockAPI.invoke.mock.calls[1][1]).toEqual({
        sessionId: 'resize-payload-test',
        cols: 200,
        rows: 50,
      });
    });
  });

  describe('Platform detection', () => {
    it('should detect Windows platform', () => {
      const mockAPI = setupMockElectron();
      mockAPI.platform = 'win32';

      const manager = new TerminalManager();
      // Can't directly test shell detection, but we can verify it doesn't crash
      expect(manager).toBeDefined();
    });

    it('should detect macOS platform', () => {
      const mockAPI = setupMockElectron();
      mockAPI.platform = 'darwin';

      const manager = new TerminalManager();
      expect(manager).toBeDefined();
    });

    it('should detect Linux platform', () => {
      const mockAPI = setupMockElectron();
      mockAPI.platform = 'linux';

      const manager = new TerminalManager();
      expect(manager).toBeDefined();
    });
  });
});
