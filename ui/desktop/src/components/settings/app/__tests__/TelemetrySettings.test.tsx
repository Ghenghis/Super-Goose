import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TelemetrySettings from '../TelemetrySettings';

// Mock TELEMETRY_UI_ENABLED
vi.mock('../../../../updates', () => ({
  TELEMETRY_UI_ENABLED: true,
}));

// Mock ConfigContext
const mockRead = vi.fn().mockResolvedValue(true);
const mockUpsert = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    read: mockRead,
    upsert: mockUpsert,
  }),
}));

// Mock toasts
vi.mock('../../../../toasts', () => ({
  toastService: {
    error: vi.fn(),
  },
}));

// Mock analytics
vi.mock('../../../../utils/analytics', () => ({
  setTelemetryEnabled: vi.fn(),
  trackTelemetryPreference: vi.fn(),
}));

// Mock TelemetryOptOutModal
vi.mock('../../../TelemetryOptOutModal', () => ({
  default: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
    controlled: boolean;
  }) =>
    isOpen ? (
      <div data-testid="opt-out-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
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
      data-testid="telemetry-switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

describe('TelemetrySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue(true);
  });

  it('renders Privacy title', async () => {
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      expect(screen.getByText('Privacy')).toBeInTheDocument();
    });
  });

  it('renders description text', async () => {
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      expect(screen.getByText('Control how your data is used')).toBeInTheDocument();
    });
  });

  it('renders the telemetry toggle label', async () => {
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      expect(screen.getByText('Anonymous usage data')).toBeInTheDocument();
    });
  });

  it('renders the telemetry toggle description', async () => {
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      expect(
        screen.getByText(/Help improve goose by sharing anonymous usage statistics/)
      ).toBeInTheDocument();
    });
  });

  it('renders the Learn more link', async () => {
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      expect(screen.getByText('Learn more')).toBeInTheDocument();
    });
  });

  it('loads telemetry status on mount', async () => {
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      expect(mockRead).toHaveBeenCalledWith('GOOSE_TELEMETRY_ENABLED', false);
    });
  });

  it('enables the switch after loading', async () => {
    mockRead.mockResolvedValue(true);
    render(<TelemetrySettings isWelcome={false} />);
    await waitFor(() => {
      const toggle = screen.getByTestId('telemetry-switch');
      expect(toggle).not.toBeDisabled();
    });
  });

  it('toggles telemetry on click', async () => {
    const user = userEvent.setup();
    render(<TelemetrySettings isWelcome={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-switch')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('telemetry-switch'));

    expect(mockUpsert).toHaveBeenCalledWith('GOOSE_TELEMETRY_ENABLED', false, false);
  });

  it('opens opt-out modal when Learn more is clicked', async () => {
    const user = userEvent.setup();
    render(<TelemetrySettings isWelcome={false} />);

    await waitFor(() => {
      expect(screen.getByText('Learn more')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Learn more'));
    expect(screen.getByTestId('opt-out-modal')).toBeInTheDocument();
  });

  it('renders in welcome mode with different layout', async () => {
    render(<TelemetrySettings isWelcome={true} />);
    await waitFor(() => {
      // In welcome mode, renders Privacy as h3 instead of CardTitle
      expect(screen.getByText('Privacy')).toBeInTheDocument();
      expect(screen.getByText('Anonymous usage data')).toBeInTheDocument();
    });
  });

  it('handles read failure gracefully', async () => {
    const { toastService } = await import('../../../../toasts');
    mockRead.mockRejectedValue(new Error('Config read failed'));
    render(<TelemetrySettings isWelcome={false} />);

    await waitFor(() => {
      expect(toastService.error).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Configuration Error' })
      );
    });
  });
});
