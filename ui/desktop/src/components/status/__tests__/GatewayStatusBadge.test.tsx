import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GatewayStatusBadge } from '../GatewayStatusBadge';

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Link2: ({ className }: { className?: string }) => (
    <span data-testid="link-icon" className={className}>
      Link2
    </span>
  ),
}));

describe('GatewayStatusBadge', () => {
  const mockSetView = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when fetch fails (not available)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Not found')));

    const { container } = render(<GatewayStatusBadge setView={mockSetView} />);
    // Wait for the useEffect to run
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('renders when gateway is connected', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ state: 'connected' }),
      } as Response)
    );

    render(<GatewayStatusBadge setView={mockSetView} />);
    const button = await screen.findByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Gateway status');
  });

  it('shows connected tooltip', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ state: 'connected' }),
      } as Response)
    );

    render(<GatewayStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('MCP Gateway: Connected');
  });

  it('shows disconnected tooltip', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ state: 'disconnected' }),
      } as Response)
    );

    render(<GatewayStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('MCP Gateway: Disconnected');
  });

  it('shows not configured tooltip by default', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ state: 'not_configured' }),
      } as Response)
    );

    render(<GatewayStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('MCP Gateway: Not configured');
  });

  it('renders the link icon', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ state: 'connected' }),
      } as Response)
    );

    render(<GatewayStatusBadge setView={mockSetView} />);
    const icon = await screen.findByTestId('link-icon');
    expect(icon).toBeInTheDocument();
  });
});
