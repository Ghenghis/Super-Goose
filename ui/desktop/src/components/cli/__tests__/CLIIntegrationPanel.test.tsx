import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CLIIntegrationPanel from '../CLIIntegrationPanel';
import type { CLIState } from '../CLIContext';

// Mock CLIContext
const mockState: CLIState = {
  isInstalled: false,
  installPath: null,
  installedVersion: null,
  latestVersion: 'v1.24.05',
  updateAvailable: false,
  platform: 'macos' as const,
  arch: 'x64' as const,
  setupStep: 'idle' as const,
  setupProgress: 0,
  setupError: null,
  isTerminalOpen: false,
  terminalHistory: [],
  cliEnabled: true,
};

const mockActions = {
  startSetup: vi.fn(),
  cancelSetup: vi.fn(),
  checkForUpdates: vi.fn(),
  openTerminal: vi.fn(),
  closeTerminal: vi.fn(),
  sendCommand: vi.fn(),
  toggleCLI: vi.fn(),
  installCLI: vi.fn(),
  updateCLI: vi.fn(),
  setSetupStep: vi.fn(),
  setSetupProgress: vi.fn(),
  setSetupError: vi.fn(),
  markInstalled: vi.fn(),
};

vi.mock('../CLIContext', () => ({
  useCLI: () => ({
    state: { ...mockState },
    ...mockActions,
  }),
}));

// Mock CLISetupWizard
vi.mock('../CLISetupWizard', () => ({
  default: () => <div data-testid="setup-wizard">Setup Wizard</div>,
}));

describe('CLIIntegrationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state to defaults before each test
    Object.assign(mockState, {
      isInstalled: false,
      installPath: null,
      installedVersion: null,
      latestVersion: 'v1.24.05',
      updateAvailable: false,
      platform: 'macos' as const,
      arch: 'x64' as const,
      setupStep: 'idle' as const,
      setupProgress: 0,
      setupError: null,
      isTerminalOpen: false,
      terminalHistory: [],
      cliEnabled: true,
    });
  });

  it('should render the CLI Integration header', () => {
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('CLI Integration')).toBeInTheDocument();
  });

  it('should render the CLI toggle switch', () => {
    render(<CLIIntegrationPanel />);
    const toggle = screen.getByRole('switch', { name: /toggle cli integration/i });
    expect(toggle).toBeInTheDocument();
  });

  it('should show "CLI not installed" when not installed', () => {
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('CLI not installed')).toBeInTheDocument();
  });

  it('should show Install CLI button when not installed', () => {
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('Install CLI')).toBeInTheDocument();
  });

  it('should show Platform Info section', () => {
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('Platform Info')).toBeInTheDocument();
  });

  it('should display platform label (macOS)', () => {
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('macOS')).toBeInTheDocument();
  });

  it('should show disabled message when cliEnabled is false', () => {
    mockState.cliEnabled = false;
    render(<CLIIntegrationPanel />);
    expect(
      screen.getByText('CLI integration is disabled. Toggle the switch above to enable.')
    ).toBeInTheDocument();
  });

  it('should show Installed status when CLI is installed', () => {
    mockState.isInstalled = true;
    mockState.installedVersion = 'v1.24.05';
    mockState.installPath = '/usr/local/bin/goose';
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('Installed')).toBeInTheDocument();
  });

  it('should show Quick Actions when installed', () => {
    mockState.isInstalled = true;
    mockState.installedVersion = 'v1.24.05';
    render(<CLIIntegrationPanel />);
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('should show setup wizard when setupStep is not idle', () => {
    mockState.setupStep = 'detect';
    render(<CLIIntegrationPanel />);
    expect(screen.getByTestId('setup-wizard')).toBeInTheDocument();
  });
});
