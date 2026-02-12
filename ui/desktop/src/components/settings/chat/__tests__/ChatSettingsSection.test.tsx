import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatSettingsSection from '../ChatSettingsSection';

// Mock all sub-components
vi.mock('../../mode/ModeSection', () => ({
  ModeSection: () => <div data-testid="mode-section">ModeSection</div>,
}));

vi.mock('../../dictation/DictationSettings', () => ({
  DictationSettings: () => <div data-testid="dictation-settings">DictationSettings</div>,
}));

vi.mock('../../security/SecurityToggle', () => ({
  SecurityToggle: () => <div data-testid="security-toggle">SecurityToggle</div>,
}));

vi.mock('../../response_styles/ResponseStylesSection', () => ({
  ResponseStylesSection: () => <div data-testid="response-styles">ResponseStylesSection</div>,
}));

vi.mock('../GoosehintsSection', () => ({
  GoosehintsSection: () => <div data-testid="goosehints-section">GoosehintsSection</div>,
}));

vi.mock('../SpellcheckToggle', () => ({
  SpellcheckToggle: () => <div data-testid="spellcheck-toggle">SpellcheckToggle</div>,
}));

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

describe('ChatSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Mode section card with title', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByText('Mode')).toBeInTheDocument();
  });

  it('renders the Mode section description', () => {
    render(<ChatSettingsSection />);
    expect(
      screen.getByText('Configure how Goose interacts with tools and extensions')
    ).toBeInTheDocument();
  });

  it('renders the ModeSection component', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByTestId('mode-section')).toBeInTheDocument();
  });

  it('renders the GoosehintsSection component', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByTestId('goosehints-section')).toBeInTheDocument();
  });

  it('renders the DictationSettings component', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByTestId('dictation-settings')).toBeInTheDocument();
  });

  it('renders the SpellcheckToggle component', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByTestId('spellcheck-toggle')).toBeInTheDocument();
  });

  it('renders the Response Styles section with title', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByText('Response Styles')).toBeInTheDocument();
  });

  it('renders the Response Styles description', () => {
    render(<ChatSettingsSection />);
    expect(
      screen.getByText('Choose how Goose should format and style its responses')
    ).toBeInTheDocument();
  });

  it('renders the ResponseStylesSection component', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByTestId('response-styles')).toBeInTheDocument();
  });

  it('renders the SecurityToggle component', () => {
    render(<ChatSettingsSection />);
    expect(screen.getByTestId('security-toggle')).toBeInTheDocument();
  });

  it('renders multiple cards for the different sections', () => {
    render(<ChatSettingsSection />);
    const cards = screen.getAllByTestId('card');
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });
});
