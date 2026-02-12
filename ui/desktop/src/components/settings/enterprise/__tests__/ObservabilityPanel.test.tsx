import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ObservabilityPanel from '../ObservabilityPanel';

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
      data-testid="cost-switch"
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
    <button onClick={onClick}>{children}</button>
  ),
}));

describe('ObservabilityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));
  });

  it('shows loading state initially', () => {
    const { container } = render(<ObservabilityPanel />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders Cost Tracking toggle after loading', async () => {
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Cost Tracking')).toBeInTheDocument();
      expect(screen.getByTestId('cost-switch')).toBeInTheDocument();
    });
  });

  it('renders Token Usage card with default values', async () => {
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Token Usage')).toBeInTheDocument();
      expect(screen.getByText('Total Tokens')).toBeInTheDocument();
      expect(screen.getByText('Estimated Cost')).toBeInTheDocument();
      expect(screen.getByText('Prompt Tokens')).toBeInTheDocument();
      expect(screen.getByText('Completion Tokens')).toBeInTheDocument();
    });
  });

  it('renders default cost as $0.00', async () => {
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });
  });

  it('renders Metrics section', async () => {
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeInTheDocument();
      expect(screen.getByText('Avg. response time')).toBeInTheDocument();
      expect(screen.getByText('Requests today')).toBeInTheDocument();
      expect(screen.getByText('Error rate')).toBeInTheDocument();
      expect(screen.getByText('Cache hit rate')).toBeInTheDocument();
    });
  });

  it('renders Export JSON and Export CSV buttons', async () => {
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });
  });

  it('toggles cost tracking switch', async () => {
    const user = userEvent.setup();
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('cost-switch')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('cost-switch'));
    expect(screen.getByTestId('cost-switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('displays data from API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          usage: {
            totalTokens: 150000,
            promptTokens: 100000,
            completionTokens: 50000,
            estimatedCost: '$12.50',
            period: 'last 7 days',
          },
          costTrackingEnabled: true,
        }),
    } as Response);

    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('150.0K')).toBeInTheDocument();
      expect(screen.getByText('$12.50')).toBeInTheDocument();
      expect(screen.getByText('100.0K')).toBeInTheDocument();
      expect(screen.getByText('50.0K')).toBeInTheDocument();
      expect(screen.getByText('last 7 days')).toBeInTheDocument();
    });
  });

  it('handles export JSON click', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
    });

    // Mock appendChild AFTER render so React can mount properly
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => {
        return originalAppendChild(node);
      }
    );

    await user.click(screen.getByText('Export JSON'));
    expect(createObjectURL).toHaveBeenCalled();

    mockAppendChild.mockRestore();
  });

  it('shows current session as default period', async () => {
    render(<ObservabilityPanel />);

    await waitFor(() => {
      expect(screen.getByText('current session')).toBeInTheDocument();
    });
  });
});
