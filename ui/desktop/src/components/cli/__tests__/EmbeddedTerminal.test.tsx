import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmbeddedTerminal from '../EmbeddedTerminal';

// Mock TerminalManager
const mockTerminalManager = {
  createSession: vi.fn().mockResolvedValue({
    id: 'test-session',
    pid: 12345,
    shell: 'cmd.exe',
    cwd: 'C:\\Users\\Test',
    createdAt: new Date().toISOString(),
  }),
  sendInput: vi.fn().mockResolvedValue(undefined),
  onOutput: vi.fn().mockReturnValue(() => {}), // Return unsubscribe function
  resize: vi.fn().mockResolvedValue(undefined),
  closeSession: vi.fn().mockResolvedValue(undefined),
  getActiveSessions: vi.fn().mockReturnValue([]),
  isUsingElectron: vi.fn().mockReturnValue(false),
};

vi.mock('../../../utils/terminalManager', () => ({
  getTerminalManager: () => mockTerminalManager,
  resetTerminalManager: vi.fn(),
}));

// Mutable mock state
const mockState = {
  isInstalled: true,
  installPath: '/usr/local/bin/goose',
  installedVersion: 'v1.24.05',
  latestVersion: 'v1.24.05',
  updateAvailable: false,
  platform: 'macos' as const,
  arch: 'x64' as const,
  setupStep: 'idle' as const,
  setupProgress: 0,
  setupError: null,
  isTerminalOpen: true,
  terminalHistory: [
    { id: 'sys-1', type: 'system' as const, content: 'Welcome to CLI', timestamp: 1000 },
    { id: 'in-1', type: 'input' as const, content: 'goose session', timestamp: 2000 },
    { id: 'out-1', type: 'output' as const, content: 'Session started', timestamp: 3000 },
  ],
  cliEnabled: true,
};

const mockSendCommand = vi.fn();
const mockCloseTerminal = vi.fn();

vi.mock('../CLIContext', () => ({
  useCLI: () => ({
    state: { ...mockState },
    sendCommand: mockSendCommand,
    closeTerminal: mockCloseTerminal,
    startSetup: vi.fn(),
    cancelSetup: vi.fn(),
    checkForUpdates: vi.fn(),
    openTerminal: vi.fn(),
    toggleCLI: vi.fn(),
    installCLI: vi.fn(),
    updateCLI: vi.fn(),
    setSetupStep: vi.fn(),
    setSetupProgress: vi.fn(),
    setSetupError: vi.fn(),
    markInstalled: vi.fn(),
  }),
}));

describe('EmbeddedTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockState, {
      isTerminalOpen: true,
      terminalHistory: [
        { id: 'sys-1', type: 'system' as const, content: 'Welcome to CLI', timestamp: 1000 },
        { id: 'in-1', type: 'input' as const, content: 'goose session', timestamp: 2000 },
        { id: 'out-1', type: 'output' as const, content: 'Session started', timestamp: 3000 },
      ],
      installedVersion: 'v1.24.05',
    });

    // Reset terminal manager mocks
    mockTerminalManager.createSession.mockResolvedValue({
      id: 'test-session',
      pid: 12345,
      shell: 'cmd.exe',
      cwd: 'C:\\Users\\Test',
      createdAt: new Date().toISOString(),
    });
    mockTerminalManager.sendInput.mockResolvedValue(undefined);
    mockTerminalManager.onOutput.mockReturnValue(() => {});
  });

  it('should render terminal when isTerminalOpen is true', () => {
    render(<EmbeddedTerminal />);
    expect(screen.getByText('Super-Goose CLI')).toBeInTheDocument();
  });

  it('should not render when isTerminalOpen is false', () => {
    mockState.isTerminalOpen = false;
    const { container } = render(<EmbeddedTerminal />);
    expect(container.firstChild).toBeNull();
  });

  it('should render terminal history entries', () => {
    render(<EmbeddedTerminal />);
    expect(screen.getByText('Welcome to CLI')).toBeInTheDocument();
    expect(screen.getByText('goose session')).toBeInTheDocument();
    expect(screen.getByText('Session started')).toBeInTheDocument();
  });

  it('should render the command input field', () => {
    render(<EmbeddedTerminal />);
    const input = screen.getByPlaceholderText('Type a command...');
    expect(input).toBeInTheDocument();
  });

  it('should send command on Enter key', async () => {
    const user = userEvent.setup();
    render(<EmbeddedTerminal />);

    // Wait for terminal session to be created
    await vi.waitFor(() => {
      expect(mockTerminalManager.createSession).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Type a command...');
    await user.type(input, 'goose features');
    await user.keyboard('{Enter}');

    // Should send to terminal manager
    expect(mockTerminalManager.sendInput).toHaveBeenCalledWith('test-session', 'goose features\n');
  });

  it('should clear input after submitting', async () => {
    const user = userEvent.setup();
    render(<EmbeddedTerminal />);

    const input = screen.getByPlaceholderText('Type a command...') as HTMLInputElement;
    await user.type(input, 'goose cost');
    await user.keyboard('{Enter}');

    expect(input.value).toBe('');
  });

  it('should not send empty commands', async () => {
    const user = userEvent.setup();
    render(<EmbeddedTerminal />);

    const input = screen.getByPlaceholderText('Type a command...');
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('should render quick command buttons', () => {
    render(<EmbeddedTerminal />);
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('features')).toBeInTheDocument();
    expect(screen.getByText('cost')).toBeInTheDocument();
    expect(screen.getByText('configure')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument();
  });

  it('should send quick command when button is clicked', async () => {
    const user = userEvent.setup();
    render(<EmbeddedTerminal />);

    // Wait for terminal session to be created
    await vi.waitFor(() => {
      expect(mockTerminalManager.createSession).toHaveBeenCalled();
    });

    await user.click(screen.getByText('features'));

    // Should send to terminal manager
    expect(mockTerminalManager.sendInput).toHaveBeenCalledWith('test-session', 'goose features\n');
  });

  it('should render close button that calls closeTerminal', async () => {
    const user = userEvent.setup();
    render(<EmbeddedTerminal />);

    const closeBtn = screen.getByTitle('Close terminal');
    await user.click(closeBtn);
    expect(mockCloseTerminal).toHaveBeenCalled();
  });

  it('should display version badge when installedVersion is available', () => {
    render(<EmbeddedTerminal />);
    expect(screen.getByText('v1.24.05')).toBeInTheDocument();
  });
});
