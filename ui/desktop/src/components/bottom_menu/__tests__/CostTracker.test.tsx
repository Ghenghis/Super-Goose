import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostTracker } from '../CostTracker';
import { useModelAndProvider } from '../../ModelAndProviderContext';

// Mock dependencies
vi.mock('../../ModelAndProviderContext', () => ({
  useModelAndProvider: vi.fn(() => ({
    currentModel: 'gpt-4',
    currentProvider: 'openai',
  })),
}));

vi.mock('../../../utils/pricing', () => ({
  fetchModelPricing: vi.fn(() =>
    Promise.resolve({
      input_token_cost: 0.00003,
      output_token_cost: 0.00006,
      currency: '$',
    })
  ),
}));

vi.mock('../../icons', () => ({
  CoinIcon: ({ className, size }: { className?: string; size?: number }) => (
    <span data-testid="coin-icon" className={className} data-size={size}>
      CoinIcon
    </span>
  ),
}));

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('CostTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it('renders loading state initially', () => {
    const { container } = render(<CostTracker />);
    // While loading, it shows "..." as a placeholder
    expect(container.querySelector('.font-mono')).toBeTruthy();
  });

  it('renders cost display after loading', async () => {
    render(<CostTracker inputTokens={1000} outputTokens={500} />);
    // Wait for the pricing data to load
    const costDisplay = await screen.findByText('0.0600');
    expect(costDisplay).toBeInTheDocument();
  });

  it('renders the coin icon', async () => {
    render(<CostTracker inputTokens={100} outputTokens={100} />);
    const icon = await screen.findByTestId('coin-icon');
    expect(icon).toBeInTheDocument();
  });

  it('renders zero cost when no tokens provided', async () => {
    render(<CostTracker />);
    const costDisplay = await screen.findByText('0.0000');
    expect(costDisplay).toBeInTheDocument();
  });

  it('returns null when show_pricing is false', () => {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('false');
    const { container } = render(<CostTracker />);
    // The component should return null — container is empty apart from wrapper div
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no model or provider', () => {
    vi.mocked(useModelAndProvider).mockReturnValue({
      currentModel: null,
      currentProvider: null,
      changeModel: vi.fn(),
      getCurrentModelAndProvider: vi.fn(),
      getFallbackModelAndProvider: vi.fn(),
      getCurrentModelAndProviderForDisplay: vi.fn(),
      getCurrentModelDisplayName: vi.fn(),
      getCurrentProviderDisplayName: vi.fn(),
      refreshCurrentModelAndProvider: vi.fn(),
    });

    const { container } = render(<CostTracker />);
    expect(container.innerHTML).toBe('');
  });
});
