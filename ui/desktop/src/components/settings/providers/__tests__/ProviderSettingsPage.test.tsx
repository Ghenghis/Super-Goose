import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderSettings from '../ProviderSettingsPage';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock ConfigContext
const mockGetProviders = vi.fn();
vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    getProviders: mockGetProviders,
  }),
}));

// Mock ProviderGrid
vi.mock('../ProviderGrid', () => ({
  default: ({ providers, isOnboarding }: { providers: unknown[]; isOnboarding: boolean }) => (
    <div data-testid="provider-grid" data-onboarding={isOnboarding}>
      {providers.length} providers loaded
    </div>
  ),
}));

// Mock ScrollArea
vi.mock('../../../ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

// Mock BackButton
vi.mock('../../../ui/BackButton', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="back-button" onClick={onClick}>Back</button>
  ),
}));

// Mock navigationUtils
vi.mock('../../../../utils/navigationUtils', () => ({
  createNavigationHandler: vi.fn(() => vi.fn()),
}));

const mockProviders = [
  {
    name: 'openai',
    is_configured: true,
    metadata: { display_name: 'OpenAI', description: 'GPT models' },
    provider_type: 'Standard',
  },
  {
    name: 'anthropic',
    is_configured: false,
    metadata: { display_name: 'Anthropic', description: 'Claude models' },
    provider_type: 'Standard',
  },
];

describe('ProviderSettingsPage', () => {
  const defaultProps = {
    onClose: vi.fn(),
    isOnboarding: false,
    onProviderLaunched: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviders.mockResolvedValue(mockProviders);
  });

  it('renders the settings heading when not onboarding', async () => {
    render(<ProviderSettings {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('provider-selection-heading')).toHaveTextContent(
        'Provider Configuration Settings'
      );
    });
  });

  it('renders the onboarding heading when isOnboarding is true', async () => {
    render(<ProviderSettings {...defaultProps} isOnboarding={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('provider-selection-heading')).toHaveTextContent('Other providers');
    });
  });

  it('shows onboarding description text when isOnboarding is true', async () => {
    render(<ProviderSettings {...defaultProps} isOnboarding={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Select an AI model provider/)).toBeInTheDocument();
    });
  });

  it('does not show onboarding description when not onboarding', async () => {
    render(<ProviderSettings {...defaultProps} isOnboarding={false} />);
    await waitFor(() => {
      expect(screen.queryByText(/Select an AI model provider/)).not.toBeInTheDocument();
    });
  });

  it('shows loading state before providers are fetched', () => {
    mockGetProviders.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ProviderSettings {...defaultProps} />);
    expect(screen.getByText('Loading providers...')).toBeInTheDocument();
  });

  it('renders ProviderGrid after loading completes', async () => {
    render(<ProviderSettings {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('provider-grid')).toBeInTheDocument();
      expect(screen.getByText('2 providers loaded')).toBeInTheDocument();
    });
  });

  it('calls onClose when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<ProviderSettings {...defaultProps} />);

    await user.click(screen.getByTestId('back-button'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('handles getProviders failure gracefully', async () => {
    mockGetProviders.mockRejectedValue(new Error('Network error'));
    render(<ProviderSettings {...defaultProps} />);

    // Should still finish loading (not stuck in loading state)
    await waitFor(() => {
      expect(screen.queryByText('Loading providers...')).not.toBeInTheDocument();
    });
  });

  it('passes isOnboarding prop to ProviderGrid', async () => {
    render(<ProviderSettings {...defaultProps} isOnboarding={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('provider-grid')).toHaveAttribute('data-onboarding', 'true');
    });
  });

  it('renders the back button', () => {
    render(<ProviderSettings {...defaultProps} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
  });
});
