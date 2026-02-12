import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderGrid from '../ProviderGrid';

// Mock ProviderCard
vi.mock('../subcomponents/ProviderCard', () => ({
  ProviderCard: ({
    provider,
    onConfigure,
    onLaunch,
    isOnboarding,
  }: {
    provider: { name: string; metadata: { display_name: string } };
    onConfigure: () => void;
    onLaunch: () => void;
    isOnboarding: boolean;
  }) => (
    <div data-testid={`provider-card-${provider.name}`} data-onboarding={isOnboarding}>
      <span>{provider.metadata.display_name}</span>
      <button onClick={onConfigure}>Configure</button>
      <button onClick={onLaunch}>Launch</button>
    </div>
  ),
}));

// Mock CardContainer
vi.mock('../subcomponents/CardContainer', () => ({
  default: ({
    testId,
    onClick,
    body,
  }: {
    testId?: string;
    onClick: () => void;
    body: React.ReactNode;
    header: React.ReactNode;
    grayedOut: boolean;
    borderStyle?: string;
  }) => (
    <div data-testid={testId} onClick={onClick}>
      {body}
    </div>
  ),
}));

// Mock ProviderConfigurationModal
vi.mock('../modal/ProviderConfiguationModal', () => ({
  default: () => <div data-testid="config-modal">Configuration Modal</div>,
}));

// Mock CustomProviderForm
vi.mock('../modal/subcomponents/forms/CustomProviderForm', () => ({
  default: () => <div data-testid="custom-form">Custom Provider Form</div>,
}));

// Mock SwitchModelModal
vi.mock('../../models/subcomponents/SwitchModelModal', () => ({
  SwitchModelModal: () => <div data-testid="switch-model-modal">Switch Model</div>,
}));

// Mock Dialog
vi.mock('../../../ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

// Mock ModelAndProviderContext
vi.mock('../../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    getCurrentModelAndProvider: vi.fn().mockResolvedValue({
      model: 'gpt-4',
      provider: 'openai',
    }),
  }),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
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

describe('ProviderGrid', () => {
  const defaultProps = {
    providers: mockProviders as any,
    isOnboarding: false,
    refreshProviders: vi.fn(),
    setView: vi.fn(),
    onModelSelected: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders provider cards for each provider', () => {
    render(<ProviderGrid {...defaultProps} />);
    expect(screen.getByTestId('provider-card-openai')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-anthropic')).toBeInTheDocument();
  });

  it('renders providers sorted alphabetically by display name', () => {
    render(<ProviderGrid {...defaultProps} />);
    const cards = screen.getAllByTestId(/^provider-card-/);
    // Anthropic comes before OpenAI alphabetically
    expect(cards[0]).toHaveAttribute('data-testid', 'provider-card-anthropic');
    expect(cards[1]).toHaveAttribute('data-testid', 'provider-card-openai');
  });

  it('renders the add custom provider card', () => {
    render(<ProviderGrid {...defaultProps} />);
    expect(screen.getByTestId('add-custom-provider-card')).toBeInTheDocument();
  });

  it('shows Add Custom Provider text', () => {
    render(<ProviderGrid {...defaultProps} />);
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Custom Provider')).toBeInTheDocument();
  });

  it('handles empty providers array', () => {
    render(<ProviderGrid {...defaultProps} providers={[]} />);
    // Should still render the custom provider card
    expect(screen.getByTestId('add-custom-provider-card')).toBeInTheDocument();
  });

  it('passes isOnboarding to ProviderCard', () => {
    render(<ProviderGrid {...defaultProps} isOnboarding={true} />);
    const card = screen.getByTestId('provider-card-openai');
    expect(card).toHaveAttribute('data-onboarding', 'true');
  });

  it('opens custom provider modal when add card is clicked', async () => {
    const user = userEvent.setup();
    render(<ProviderGrid {...defaultProps} />);

    await user.click(screen.getByTestId('add-custom-provider-card'));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Provider')).toBeInTheDocument();
  });

  it('renders the grid layout container', () => {
    const { container } = render(<ProviderGrid {...defaultProps} />);
    const gridEl = container.querySelector('.grid');
    expect(gridEl).toBeInTheDocument();
  });
});
