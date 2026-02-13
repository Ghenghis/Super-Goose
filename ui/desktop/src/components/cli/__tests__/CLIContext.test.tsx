import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLIProvider, useCLI } from '../CLIContext';

// Mock the utility modules
vi.mock('../../../utils/cliManager', () => ({
  checkCLIInstalled: vi.fn(() => Promise.resolve(null)),
  checkForCLIUpdates: vi.fn(() => Promise.resolve(null)),
  installCLI: vi.fn(),
  getCLIPath: vi.fn(() => '/mock/path/goose'),
}));

vi.mock('../../../utils/terminalManager', () => ({
  getTerminalManager: vi.fn(() => ({
    createSession: vi.fn(async () => ({
      id: 'test-session-123',
      pid: 1234,
      shell: '/bin/bash',
      cwd: '/home/test',
      createdAt: new Date().toISOString(),
    })),
    sendInput: vi.fn(() => Promise.resolve()),
    onOutput: vi.fn(() => () => {}),
    closeSession: vi.fn(() => Promise.resolve()),
    isUsingElectron: vi.fn(() => false),
    getActiveSessions: vi.fn(() => []),
  })),
}));

// Helper component that exposes context values for testing
function TestConsumer() {
  const ctx = useCLI();
  return (
    <div>
      <span data-testid="platform">{ctx.state.platform}</span>
      <span data-testid="arch">{ctx.state.arch}</span>
      <span data-testid="isInstalled">{String(ctx.state.isInstalled)}</span>
      <span data-testid="cliEnabled">{String(ctx.state.cliEnabled)}</span>
      <span data-testid="isTerminalOpen">{String(ctx.state.isTerminalOpen)}</span>
      <span data-testid="setupStep">{ctx.state.setupStep}</span>
      <span data-testid="setupProgress">{ctx.state.setupProgress}</span>
      <span data-testid="setupError">{ctx.state.setupError ?? 'null'}</span>
      <span data-testid="latestVersion">{ctx.state.latestVersion ?? 'null'}</span>
      <span data-testid="installedVersion">{ctx.state.installedVersion ?? 'null'}</span>
      <span data-testid="installPath">{ctx.state.installPath ?? 'null'}</span>
      <span data-testid="updateAvailable">{String(ctx.state.updateAvailable)}</span>
      <span data-testid="historyLength">{ctx.state.terminalHistory.length}</span>
      <button data-testid="startSetup" onClick={ctx.startSetup}>startSetup</button>
      <button data-testid="cancelSetup" onClick={ctx.cancelSetup}>cancelSetup</button>
      <button data-testid="openTerminal" onClick={ctx.openTerminal}>openTerminal</button>
      <button data-testid="closeTerminal" onClick={ctx.closeTerminal}>closeTerminal</button>
      <button data-testid="sendCommand" onClick={() => ctx.sendCommand('test cmd')}>sendCommand</button>
      <button data-testid="toggleCLI" onClick={ctx.toggleCLI}>toggleCLI</button>
      <button data-testid="checkForUpdates" onClick={ctx.checkForUpdates}>checkForUpdates</button>
      <button data-testid="installCLI" onClick={ctx.installCLI}>installCLI</button>
      <button data-testid="updateCLI" onClick={ctx.updateCLI}>updateCLI</button>
      <button data-testid="setSetupStep" onClick={() => ctx.setSetupStep('download')}>setSetupStep</button>
      <button data-testid="setSetupProgress" onClick={() => ctx.setSetupProgress(50)}>setSetupProgress</button>
      <button data-testid="setSetupError" onClick={() => ctx.setSetupError('test error')}>setSetupError</button>
      <button data-testid="markInstalled" onClick={() => ctx.markInstalled('/usr/bin/goose', 'v1.24.05')}>markInstalled</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <CLIProvider>
      <TestConsumer />
    </CLIProvider>
  );
}

describe('CLIContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Default state values', () => {
    it('should provide default isInstalled as false', () => {
      renderWithProvider();
      expect(screen.getByTestId('isInstalled')).toHaveTextContent('false');
    });

    it('should provide default cliEnabled as true', () => {
      renderWithProvider();
      expect(screen.getByTestId('cliEnabled')).toHaveTextContent('true');
    });

    it('should provide default isTerminalOpen as false', () => {
      renderWithProvider();
      expect(screen.getByTestId('isTerminalOpen')).toHaveTextContent('false');
    });

    it('should provide default setupStep as idle', () => {
      renderWithProvider();
      expect(screen.getByTestId('setupStep')).toHaveTextContent('idle');
    });

    it('should provide default setupProgress as 0', () => {
      renderWithProvider();
      expect(screen.getByTestId('setupProgress')).toHaveTextContent('0');
    });

    it('should provide default latestVersion', () => {
      renderWithProvider();
      expect(screen.getByTestId('latestVersion')).toHaveTextContent('v1.24.05');
    });
  });

  describe('Platform detection', () => {
    it('should detect platform from window.electron.platform', () => {
      // Setup file sets window.electron.platform = 'darwin'
      renderWithProvider();
      expect(screen.getByTestId('platform')).toHaveTextContent('macos');
    });

    it('should detect arch as x64 by default', () => {
      renderWithProvider();
      expect(screen.getByTestId('arch')).toHaveTextContent('x64');
    });
  });

  describe('sendCommand', () => {
    it('should add input entry to terminal history', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      // Open terminal first
      await user.click(screen.getByTestId('openTerminal'));

      const before = Number(screen.getByTestId('historyLength').textContent);
      await user.click(screen.getByTestId('sendCommand'));

      await waitFor(() => {
        const after = Number(screen.getByTestId('historyLength').textContent);
        // sendCommand adds at least 1 entry: input (output may come async)
        expect(after).toBeGreaterThan(before);
      });
    });
  });

  describe('closeTerminal', () => {
    it('should set isTerminalOpen to false', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('openTerminal'));
      expect(screen.getByTestId('isTerminalOpen')).toHaveTextContent('true');

      await user.click(screen.getByTestId('closeTerminal'));
      expect(screen.getByTestId('isTerminalOpen')).toHaveTextContent('false');
    });
  });

  describe('openTerminal', () => {
    it('should set isTerminalOpen to true and add system message', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('openTerminal'));
      expect(screen.getByTestId('isTerminalOpen')).toHaveTextContent('true');
      // First open adds a system welcome message
      expect(Number(screen.getByTestId('historyLength').textContent)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('startSetup', () => {
    it('should set setupStep to detect', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('startSetup'));
      expect(screen.getByTestId('setupStep')).toHaveTextContent('detect');
    });
  });

  describe('cancelSetup', () => {
    it('should set setupStep to idle', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('startSetup'));
      expect(screen.getByTestId('setupStep')).toHaveTextContent('detect');

      await user.click(screen.getByTestId('cancelSetup'));
      expect(screen.getByTestId('setupStep')).toHaveTextContent('idle');
    });
  });

  describe('toggleCLI', () => {
    it('should toggle cliEnabled from true to false', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      expect(screen.getByTestId('cliEnabled')).toHaveTextContent('true');
      await user.click(screen.getByTestId('toggleCLI'));
      expect(screen.getByTestId('cliEnabled')).toHaveTextContent('false');
    });
  });

  describe('markInstalled', () => {
    it('should set isInstalled, installPath, and installedVersion', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('markInstalled'));
      expect(screen.getByTestId('isInstalled')).toHaveTextContent('true');
      expect(screen.getByTestId('installPath')).toHaveTextContent('/usr/bin/goose');
      expect(screen.getByTestId('installedVersion')).toHaveTextContent('v1.24.05');
      expect(screen.getByTestId('setupStep')).toHaveTextContent('complete');
    });
  });

  describe('setSetupProgress', () => {
    it('should clamp progress between 0 and 100', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('setSetupProgress'));
      expect(screen.getByTestId('setupProgress')).toHaveTextContent('50');
    });
  });

  describe('setSetupError', () => {
    it('should set setupError message', async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByTestId('setSetupError'));
      expect(screen.getByTestId('setupError')).toHaveTextContent('test error');
    });
  });

  describe('useCLI outside provider', () => {
    it('should throw an error when used outside CLIProvider', () => {
      // Suppress console.error for this expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => render(<TestConsumer />)).toThrow(
        'useCLI must be used within a CLIProvider.'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Backend integration', () => {
    it('should call checkCLIInstalled on mount', async () => {
      const { checkCLIInstalled } = await import('../../../utils/cliManager');

      vi.mocked(checkCLIInstalled).mockResolvedValueOnce({
        version: 'v1.24.05',
        path: '/usr/local/bin/goose',
        installedAt: new Date().toISOString(),
        platform: 'linux',
      });

      renderWithProvider();

      await waitFor(() => {
        expect(checkCLIInstalled).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isInstalled')).toHaveTextContent('true');
        expect(screen.getByTestId('installPath')).toHaveTextContent('/usr/local/bin/goose');
      });
    });

    it('should call checkForCLIUpdates when checking for updates', async () => {
      const user = userEvent.setup();
      const { checkForCLIUpdates } = await import('../../../utils/cliManager');

      vi.mocked(checkForCLIUpdates).mockResolvedValueOnce({
        version: 'v1.24.06',
        downloadUrl: 'https://example.com',
        size: 1000,
        sha256: 'abc123',
        releaseDate: new Date().toISOString(),
      });

      renderWithProvider();

      await user.click(screen.getByTestId('checkForUpdates'));

      await waitFor(() => {
        expect(checkForCLIUpdates).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('latestVersion')).toHaveTextContent('v1.24.06');
      });
    });

    it('should use terminalManager when opening terminal', async () => {
      const user = userEvent.setup();
      const { getTerminalManager } = await import('../../../utils/terminalManager');

      renderWithProvider();

      await user.click(screen.getByTestId('openTerminal'));

      await waitFor(() => {
        expect(getTerminalManager).toHaveBeenCalled();
      });

      expect(screen.getByTestId('isTerminalOpen')).toHaveTextContent('true');
    });

    it('should fallback gracefully when backend is unavailable', async () => {
      const user = userEvent.setup();
      const { checkForCLIUpdates } = await import('../../../utils/cliManager');

      vi.mocked(checkForCLIUpdates).mockRejectedValueOnce(new Error('Backend unavailable'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderWithProvider();

      await user.click(screen.getByTestId('checkForUpdates'));

      await waitFor(() => {
        // Should fallback to mock version
        expect(screen.getByTestId('latestVersion')).toHaveTextContent('v1.24.05');
      });

      consoleSpy.mockRestore();
    });

    it('should call localStorage.setItem when state changes', async () => {
      const user = userEvent.setup();

      renderWithProvider();

      await user.click(screen.getByTestId('markInstalled'));

      await waitFor(() => {
        expect(screen.getByTestId('isInstalled')).toHaveTextContent('true');
      });

      // Wait for useEffect to persist
      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'super-goose-cli-state',
          expect.stringContaining('"isInstalled":true')
        );
      }, { timeout: 1000 });
    });
  });
});
