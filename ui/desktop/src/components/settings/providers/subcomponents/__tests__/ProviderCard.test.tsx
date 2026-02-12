import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderCard } from '../ProviderCard';

// Mock subcomponents
vi.mock('../CardContainer', () => ({
  default: ({
    testId,
    onClick,
    header,
    body,
    grayedOut,
  }: {
    testId?: string;
    onClick: () => void;
    header: React.ReactNode;
    body: React.ReactNode;
    grayedOut: boolean;
  }) => (
    <div data-testid={testId} data-grayed={grayedOut} onClick={onClick}>
      <div data-testid="card-header-slot">{header}</div>
      <div data-testid="card-body-slot">{body}</div>
    </div>
  ),
}));

vi.mock('../CardHeader', () => ({
  default: ({
    name,
    description,
    isConfigured,
  }: {
    name: string;
    description: string;
    isConfigured: boolean;
  }) => (
    <div data-testid="card-header" data-configured={isConfigured}>
      <span>{name}</span>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock('../CardBody', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-body">{children}</div>
  ),
}));

vi.mock('../buttons/DefaultCardButtons', () => ({
  default: ({
    provider,
    onConfigure,
    onLaunch,
    isOnboardingPage,
  }: {
    provider: { name: string };
    onConfigure: () => void;
    onLaunch: () => void;
    isOnboardingPage: boolean;
  }) => (
    <div data-testid="card-buttons" data-onboarding={isOnboardingPage}>
      <button onClick={onConfigure}>Configure {provider.name}</button>
      <button onClick={onLaunch}>Launch {provider.name}</button>
    </div>
  ),
}));

const createProvider = (overrides = {}) => ({
  name: 'openai',
  is_configured: true,
  metadata: {
    display_name: 'OpenAI',
    description: 'GPT-4 and other models',
  },
  provider_type: 'Standard',
  ...overrides,
});

describe('ProviderCard', () => {
  const defaultProps = {
    provider: createProvider() as any,
    onConfigure: vi.fn(),
    onLaunch: vi.fn(),
    isOnboarding: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the provider display name', () => {
    render(<ProviderCard {...defaultProps} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('renders the provider description', () => {
    render(<ProviderCard {...defaultProps} />);
    expect(screen.getByText('GPT-4 and other models')).toBeInTheDocument();
  });

  it('renders error message when metadata is missing', () => {
    const provider = { name: 'test', metadata: null, is_configured: false, provider_type: 'Standard' };
    render(<ProviderCard {...defaultProps} provider={provider as any} />);
    expect(screen.getByText('ProviderCard error: No metadata provided')).toBeInTheDocument();
  });

  it('uses test id based on provider name', () => {
    render(<ProviderCard {...defaultProps} />);
    expect(screen.getByTestId('provider-card-openai')).toBeInTheDocument();
  });

  it('calls onConfigure when card is clicked and not onboarding', async () => {
    const user = userEvent.setup();
    render(<ProviderCard {...defaultProps} isOnboarding={false} />);
    await user.click(screen.getByTestId('provider-card-openai'));
    expect(defaultProps.onConfigure).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfigure when card is clicked during onboarding', async () => {
    const user = userEvent.setup();
    render(<ProviderCard {...defaultProps} isOnboarding={true} />);
    await user.click(screen.getByTestId('provider-card-openai'));
    expect(defaultProps.onConfigure).not.toHaveBeenCalled();
  });

  it('shows grayed out state for unconfigured providers during onboarding', () => {
    const provider = createProvider({ is_configured: false });
    render(<ProviderCard {...defaultProps} provider={provider as any} isOnboarding={true} />);
    expect(screen.getByTestId('provider-card-openai')).toHaveAttribute('data-grayed', 'true');
  });

  it('does not gray out configured providers during onboarding', () => {
    const provider = createProvider({ is_configured: true });
    render(<ProviderCard {...defaultProps} provider={provider as any} isOnboarding={true} />);
    expect(screen.getByTestId('provider-card-openai')).toHaveAttribute('data-grayed', 'false');
  });

  it('passes isOnboarding to DefaultCardButtons', () => {
    render(<ProviderCard {...defaultProps} isOnboarding={true} />);
    expect(screen.getByTestId('card-buttons')).toHaveAttribute('data-onboarding', 'true');
  });

  it('passes configured state to CardHeader', () => {
    const provider = createProvider({ is_configured: true });
    render(<ProviderCard {...defaultProps} provider={provider as any} />);
    expect(screen.getByTestId('card-header')).toHaveAttribute('data-configured', 'true');
  });
});
