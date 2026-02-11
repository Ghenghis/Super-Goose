import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CLIPreferencesPanel from '../CLIPreferencesPanel';

// Mock CLIDownloadService
vi.mock('../CLIDownloadService', () => ({
  detectPlatform: () => ({
    os: 'macos',
    arch: 'x64',
    assetName: 'goose-x86_64-apple-darwin.tar.bz2',
    installDir: '/Users/admin/.goose/bin',
    binaryName: 'goose',
  }),
  getInstallPath: (platform: any) => `${platform.installDir}/goose`,
}));

describe('CLIPreferencesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it('should render the CLI Path card', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('CLI Path')).toBeInTheDocument();
  });

  it('should render the Updates & Provider card', () => {
    render(<CLIPreferencesPanel />);
    // Contains HTML entity &amp; which renders as &
    expect(screen.getByText(/Updates/)).toBeInTheDocument();
  });

  it('should render Shell Integration card', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Shell Integration')).toBeInTheDocument();
  });

  it('should render Terminal Settings card', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Terminal Settings')).toBeInTheDocument();
  });

  it('should render Advanced card', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('should render the cli path in a read-only input', () => {
    render(<CLIPreferencesPanel />);
    const pathInput = screen.getByDisplayValue('/Users/admin/.goose/bin/goose');
    expect(pathInput).toBeInTheDocument();
    expect(pathInput).toHaveAttribute('readOnly');
  });

  it('should render the Auto-Update CLI toggle', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Auto-Update CLI')).toBeInTheDocument();
  });

  it('should render default provider dropdown with Anthropic selected', () => {
    render(<CLIPreferencesPanel />);
    const select = screen.getByDisplayValue('Anthropic');
    expect(select).toBeInTheDocument();
  });

  it('should render provider options in dropdown', () => {
    render(<CLIPreferencesPanel />);
    const options = screen.getAllByRole('option');
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain('Anthropic');
    expect(labels).toContain('OpenAI');
    expect(labels).toContain('Google');
    expect(labels).toContain('Ollama');
  });

  it('should render Font Size slider', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Font Size')).toBeInTheDocument();
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('should render Show Timestamps toggle', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Show Timestamps')).toBeInTheDocument();
  });

  it('should render Debug Mode toggle', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Debug Mode')).toBeInTheDocument();
  });

  it('should render Reset CLI Configuration button', () => {
    render(<CLIPreferencesPanel />);
    expect(screen.getByText('Reset CLI Configuration')).toBeInTheDocument();
  });

  it('should show confirmation when Reset is clicked', async () => {
    const user = userEvent.setup();
    render(<CLIPreferencesPanel />);

    await user.click(screen.getByText('Reset CLI Configuration'));
    expect(screen.getByText('Confirm Reset')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
  });

  it('should hide confirmation when Cancel is clicked after Reset', async () => {
    const user = userEvent.setup();
    render(<CLIPreferencesPanel />);

    await user.click(screen.getByText('Reset CLI Configuration'));
    expect(screen.getByText('Confirm Reset')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Confirm Reset')).not.toBeInTheDocument();
  });

  it('should persist provider change to localStorage', async () => {
    const user = userEvent.setup();
    render(<CLIPreferencesPanel />);

    const select = screen.getByDisplayValue('Anthropic');
    await user.selectOptions(select, 'openai');
    expect(localStorage.setItem).toHaveBeenCalledWith('cli_default_provider', 'openai');
  });
});
