import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CLISetupWizard from '../CLISetupWizard';
import type { CLIState } from '../CLIContext';

// Mock state that tests can mutate
const mockState: CLIState = {
  isInstalled: false,
  installPath: null,
  installedVersion: null,
  latestVersion: 'v1.24.05',
  updateAvailable: false,
  platform: 'macos' as const,
  arch: 'x64' as const,
  setupStep: 'detect' as const,
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

describe('CLISetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockState, {
      isInstalled: false,
      installPath: null,
      installedVersion: null,
      latestVersion: 'v1.24.05',
      updateAvailable: false,
      platform: 'macos' as const,
      arch: 'x64' as const,
      setupStep: 'detect' as const,
      setupProgress: 0,
      setupError: null,
      isTerminalOpen: false,
      terminalHistory: [],
      cliEnabled: true,
    });
  });

  it('should render the Setup Wizard header', () => {
    render(<CLISetupWizard />);
    expect(screen.getByText('Setup Wizard')).toBeInTheDocument();
  });

  it('should render 5 step indicators (Detect, Download, Install, Configure, Complete)', () => {
    render(<CLISetupWizard />);
    expect(screen.getByText('Detect')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Install')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('should show detect step content (platform info) by default', () => {
    render(<CLISetupWizard />);
    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getByText('Recommended Download')).toBeInTheDocument();
  });

  it('should show the Confirm & Download button in detect step', () => {
    render(<CLISetupWizard />);
    // The button text has an HTML entity (&amp;) so check for plain text
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
  });

  it('should call setSetupStep("download") when Confirm & Download is clicked', async () => {
    const user = userEvent.setup();
    render(<CLISetupWizard />);

    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);
    expect(mockActions.setSetupStep).toHaveBeenCalledWith('download');
  });

  it('should show a Cancel button', () => {
    render(<CLISetupWizard />);
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('should call cancelSetup when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<CLISetupWizard />);

    // There may be multiple cancel buttons; the X icon and the text Cancel button
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(mockActions.cancelSetup).toHaveBeenCalled();
  });

  it('should show complete step with success message', () => {
    mockState.setupStep = 'complete' as any;
    mockState.isInstalled = true;
    mockState.installedVersion = 'v1.24.05';
    mockState.installPath = '/usr/local/bin/goose';
    render(<CLISetupWizard />);
    expect(screen.getByText('Installation Complete!')).toBeInTheDocument();
  });

  it('should show download step content when step is download', () => {
    mockState.setupStep = 'download' as any;
    render(<CLISetupWizard />);
    expect(screen.getByText('Downloading CLI binary...')).toBeInTheDocument();
  });
});
