import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppSettingsSection from '../AppSettingsSection';

// Mock updates constants
vi.mock('../../../../updates', () => ({
  COST_TRACKING_ENABLED: true,
  UPDATES_ENABLED: true,
}));

// Mock analytics
vi.mock('../../../../utils/analytics', () => ({
  trackSettingToggled: vi.fn(),
}));

// Mock sub-components
vi.mock('../UpdateSection', () => ({
  default: () => <div data-testid="update-section">UpdateSection</div>,
}));

vi.mock('../../tunnel/TunnelSection', () => ({
  default: () => <div data-testid="tunnel-section">TunnelSection</div>,
}));

vi.mock('../../../GooseSidebar/ThemeSelector', () => ({
  default: ({ hideTitle, horizontal }: { hideTitle: boolean; horizontal: boolean; className?: string }) => (
    <div data-testid="theme-selector" data-hide-title={hideTitle} data-horizontal={horizontal}>
      ThemeSelector
    </div>
  ),
}));

vi.mock('../TelemetrySettings', () => ({
  default: ({ isWelcome }: { isWelcome: boolean }) => (
    <div data-testid="telemetry-settings" data-welcome={isWelcome}>TelemetrySettings</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Settings: () => <span data-testid="settings-icon">Settings</span>,
}));

// Mock card components
vi.mock('../../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 className={className}>{children}</h3>
  ),
}));

// Mock switch
vi.mock('../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      data-testid="switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

// Mock button
vi.mock('../../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

// Mock dialog
vi.mock('../../../ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock image imports
vi.mock('../icons/block-lockup_black.png', () => ({ default: 'block-black.png' }));
vi.mock('../icons/block-lockup_white.png', () => ({ default: 'block-white.png' }));

describe('AppSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup window.electron mock
    Object.defineProperty(window, 'electron', {
      writable: true,
      value: {
        platform: 'win32',
        getMenuBarIconState: vi.fn().mockResolvedValue(true),
        getDockIconState: vi.fn().mockResolvedValue(true),
        getWakelockState: vi.fn().mockResolvedValue(false),
        setMenuBarIcon: vi.fn().mockResolvedValue(true),
        setDockIcon: vi.fn().mockResolvedValue(true),
        setWakelock: vi.fn().mockResolvedValue(true),
        openNotificationsSettings: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Setup window.appConfig mock
    Object.defineProperty(window, 'appConfig', {
      writable: true,
      value: {
        get: vi.fn((key: string) => {
          if (key === 'GOOSE_VERSION') return undefined; // Show updates section
          return undefined;
        }),
      },
    });

    // Reset localStorage mock
    (window.localStorage.getItem as any).mockReturnValue(null);
  });

  it('renders the Appearance card title', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeInTheDocument();
    });
  });

  it('renders the Appearance description', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Configure how goose appears on your system')).toBeInTheDocument();
    });
  });

  it('renders the Notifications section', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  it('renders the Menu bar icon setting', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Menu bar icon')).toBeInTheDocument();
    });
  });

  it('renders the Prevent Sleep setting', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Prevent Sleep')).toBeInTheDocument();
    });
  });

  it('renders the Theme card', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeInTheDocument();
      expect(screen.getByTestId('theme-selector')).toBeInTheDocument();
    });
  });

  it('renders TelemetrySettings with isWelcome=false', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      const telemetry = screen.getByTestId('telemetry-settings');
      expect(telemetry).toHaveAttribute('data-welcome', 'false');
    });
  });

  it('renders the Help & feedback card', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Help & feedback')).toBeInTheDocument();
      expect(screen.getByText('Report a Bug')).toBeInTheDocument();
      expect(screen.getByText('Request a Feature')).toBeInTheDocument();
    });
  });

  it('renders the Super-Goose Features card', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Super-Goose Features')).toBeInTheDocument();
      expect(screen.getByText('Configure advanced AI agent capabilities')).toBeInTheDocument();
    });
  });

  it('renders Session Budget Limit input', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Session Budget Limit')).toBeInTheDocument();
    });
  });

  it('renders Guardrails as Active', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Input/Output Guardrails')).toBeInTheDocument();
      const activeLabels = screen.getAllByText('Active');
      expect(activeLabels.length).toBeGreaterThan(0);
    });
  });

  it('renders Execution Mode selector', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Execution Mode')).toBeInTheDocument();
    });
  });

  it('renders Slash Commands section', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('Slash Commands')).toBeInTheDocument();
    });
  });

  it('opens notification modal when Configuration guide is clicked', async () => {
    const user = userEvent.setup();
    render(<AppSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText('Configuration guide')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Configuration guide'));

    await waitFor(() => {
      expect(screen.getByText('How to Enable Notifications')).toBeInTheDocument();
    });
  });

  it('renders the tunnel section', async () => {
    render(<AppSettingsSection />);
    await waitFor(() => {
      expect(screen.getByTestId('tunnel-section')).toBeInTheDocument();
    });
  });
});
