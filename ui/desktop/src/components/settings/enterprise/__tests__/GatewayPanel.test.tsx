import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GatewayPanel from '../GatewayPanel';

// Mock UI components
vi.mock('../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    variant?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      data-testid="audit-switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

vi.mock('../../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('../../../ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} data-testid="refresh-button">
      {children}
    </button>
  ),
}));

describe('GatewayPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fetch fails (no backend)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));
  });

  it('shows loading state initially', () => {
    render(<GatewayPanel />);
    // Loading state renders animated pulse divs
    const { container } = render(<GatewayPanel />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders gateway status after loading completes', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));
    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Gateway Server')).toBeInTheDocument();
    });
  });

  it('shows Offline status when fetch fails', async () => {
    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  it('shows Healthy status when fetch succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          healthy: true,
          uptime: '4h 32m',
          version: '1.2.3',
          auditLogging: true,
          permissions: { total: 10, granted: 8, denied: 2 },
        }),
    } as Response);

    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });
  });

  it('displays uptime and version from API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          healthy: true,
          uptime: '4h 32m',
          version: '1.2.3',
          auditLogging: false,
          permissions: { total: 5, granted: 3, denied: 2 },
        }),
    } as Response);

    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('4h 32m')).toBeInTheDocument();
      expect(screen.getByText('1.2.3')).toBeInTheDocument();
    });
  });

  it('renders Audit Logging toggle', async () => {
    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Audit Logging')).toBeInTheDocument();
      expect(screen.getByTestId('audit-switch')).toBeInTheDocument();
    });
  });

  it('toggles audit logging when switch is clicked', async () => {
    // The toggle handler calls backendApi.updateGatewayAuditLogging which uses fetch.
    // If fetch rejects, the toggle reverts. So we need fetch to succeed for toggles.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/audit')) {
        return Promise.resolve({ ok: true } as Response);
      }
      return Promise.reject(new Error('Not available'));
    });

    const user = userEvent.setup();
    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-switch')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('audit-switch'));

    await waitFor(() => {
      expect(screen.getByTestId('audit-switch')).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('renders Permissions Summary section', async () => {
    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Permissions Summary')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Granted')).toBeInTheDocument();
      expect(screen.getByText('Denied')).toBeInTheDocument();
    });
  });

  it('renders Refresh Status button', async () => {
    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Refresh Status')).toBeInTheDocument();
    });
  });

  it('calls fetch again when Refresh Status is clicked', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));

    render(<GatewayPanel />);

    await waitFor(() => {
      expect(screen.getByText('Refresh Status')).toBeInTheDocument();
    });

    fetchSpy.mockClear();
    await user.click(screen.getByText('Refresh Status'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    // The component calls backendApi.fetchGatewayStatus() which uses the full URL
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/enterprise/gateway/status');
  });
});
