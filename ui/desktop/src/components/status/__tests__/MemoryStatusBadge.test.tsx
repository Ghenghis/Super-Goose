import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryStatusBadge } from '../MemoryStatusBadge';

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
  Brain: ({ className }: { className?: string }) => (
    <span data-testid="brain-icon" className={className}>
      Brain
    </span>
  ),
}));

describe('MemoryStatusBadge', () => {
  const mockSetView = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when endpoint not available', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Not found')));

    const { container } = render(<MemoryStatusBadge setView={mockSetView} />);
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('renders when endpoint is available', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: 12 }),
      } as Response)
    );

    render(<MemoryStatusBadge setView={mockSetView} />);
    const button = await screen.findByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Memory status');
  });

  it('shows plural items count in tooltip', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: 12 }),
      } as Response)
    );

    render(<MemoryStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('Memory: 12 items stored');
  });

  it('shows singular item count in tooltip', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: 1 }),
      } as Response)
    );

    render(<MemoryStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('Memory: 1 item stored');
  });

  it('renders the brain icon', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: 5 }),
      } as Response)
    );

    render(<MemoryStatusBadge setView={mockSetView} />);
    const icon = await screen.findByTestId('brain-icon');
    expect(icon).toBeInTheDocument();
  });
});
