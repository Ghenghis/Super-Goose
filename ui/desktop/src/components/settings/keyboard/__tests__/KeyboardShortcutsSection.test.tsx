import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import KeyboardShortcutsSection from '../KeyboardShortcutsSection';

// Mock dependencies
vi.mock('../../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="card-description">{children}</p>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3 data-testid="card-title">{children}</h3>
  ),
}));

vi.mock('../../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked: boolean;
    onCheckedChange?: (val: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="switch"
      data-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      Toggle
    </button>
  ),
}));

vi.mock('../ShortcutRecorder', () => ({
  ShortcutRecorder: () => <div data-testid="shortcut-recorder">ShortcutRecorder</div>,
}));

vi.mock('../../../../utils/analytics', () => ({
  trackSettingToggled: vi.fn(),
}));

const mockKeyboardShortcuts = {
  focusWindow: 'CommandOrControl+Alt+G',
  quickLauncher: 'CommandOrControl+Alt+Shift+G',
  newChat: 'CommandOrControl+T',
  newChatWindow: 'CommandOrControl+N',
  openDirectory: 'CommandOrControl+O',
  settings: 'CommandOrControl+,',
  find: 'CommandOrControl+F',
  findNext: 'CommandOrControl+G',
  findPrevious: 'CommandOrControl+Shift+G',
  alwaysOnTop: 'CommandOrControl+Shift+T',
};

vi.mock('../../../../utils/settings', () => ({
  defaultKeyboardShortcuts: {
    focusWindow: 'CommandOrControl+Alt+G',
    quickLauncher: 'CommandOrControl+Alt+Shift+G',
    newChat: 'CommandOrControl+T',
    newChatWindow: 'CommandOrControl+N',
    openDirectory: 'CommandOrControl+O',
    settings: 'CommandOrControl+,',
    find: 'CommandOrControl+F',
    findNext: 'CommandOrControl+G',
    findPrevious: 'CommandOrControl+Shift+G',
    alwaysOnTop: 'CommandOrControl+Shift+T',
  },
}));

const setupGetSettings = () => {
  (window.electron.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
    keyboardShortcuts: { ...mockKeyboardShortcuts },
  });
};

describe('KeyboardShortcutsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGetSettings();
  });

  it('shows Loading initially before settings load', () => {
    // Override getSettings to never resolve for this test only
    (window.electron.getSettings as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {})
    );

    render(<KeyboardShortcutsSection />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders category titles after loading', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      expect(screen.getByText('Global Shortcuts')).toBeInTheDocument();
    });
    expect(screen.getByText('Application Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Search Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Window Shortcuts')).toBeInTheDocument();
  });

  it('renders shortcut labels after loading', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      expect(screen.getByText('Focus Super-Goose Window')).toBeInTheDocument();
    });
    expect(screen.getByText('Quick Launcher')).toBeInTheDocument();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Find')).toBeInTheDocument();
  });

  it('renders shortcut descriptions', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      expect(
        screen.getByText('Bring Super-Goose window to front from anywhere')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Open the quick launcher overlay')).toBeInTheDocument();
  });

  it('renders Reset to Defaults section', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      expect(screen.getByText('Reset to Defaults')).toBeInTheDocument();
    });
    expect(screen.getByText('Reset All Shortcuts')).toBeInTheDocument();
  });

  it('renders Change buttons for each shortcut', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      const changeButtons = screen.getAllByText('Change');
      expect(changeButtons.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('renders toggle switches for each shortcut', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      const switches = screen.getAllByTestId('switch');
      expect(switches.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('renders category descriptions', async () => {
    render(<KeyboardShortcutsSection />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'These shortcuts work system-wide, even when Super-Goose is not focused'
        )
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText('These shortcuts work when Super-Goose is the active application')
    ).toBeInTheDocument();
  });
});
