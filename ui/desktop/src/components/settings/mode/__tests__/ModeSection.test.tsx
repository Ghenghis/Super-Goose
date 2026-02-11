import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeSection } from '../ModeSection';

// Mock dependencies
vi.mock('../../../ConfigContext', () => ({
  useConfig: vi.fn(() => ({
    read: vi.fn(() => Promise.resolve('auto')),
    upsert: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../ModeSelectionItem', () => ({
  all_goose_modes: [
    { key: 'auto', label: 'Autonomous', description: 'Full file modification capabilities' },
    { key: 'approve', label: 'Manual', description: 'All tools require human approval' },
    { key: 'smart_approve', label: 'Smart', description: 'Intelligently determine approval' },
    { key: 'chat', label: 'Chat only', description: 'Engage without tools or extensions' },
  ],
  ModeSelectionItem: ({
    mode,
    currentMode,
    showDescription,
  }: {
    mode: { key: string; label: string; description: string };
    currentMode: string;
    showDescription: boolean;
  }) => (
    <div data-testid={`mode-item-${mode.key}`} data-current={currentMode === mode.key}>
      <span>{mode.label}</span>
      {showDescription && <span>{mode.description}</span>}
    </div>
  ),
}));

vi.mock('../ConversationLimitsDropdown', () => ({
  ConversationLimitsDropdown: ({
    maxTurns,
  }: {
    maxTurns: number;
    onMaxTurnsChange: (v: number) => void;
  }) => (
    <div data-testid="conversation-limits">
      <span>Max turns: {maxTurns}</span>
    </div>
  ),
}));

describe('ModeSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four mode options', () => {
    render(<ModeSection />);
    expect(screen.getByTestId('mode-item-auto')).toBeInTheDocument();
    expect(screen.getByTestId('mode-item-approve')).toBeInTheDocument();
    expect(screen.getByTestId('mode-item-smart_approve')).toBeInTheDocument();
    expect(screen.getByTestId('mode-item-chat')).toBeInTheDocument();
  });

  it('renders mode labels', () => {
    render(<ModeSection />);
    expect(screen.getByText('Autonomous')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('Smart')).toBeInTheDocument();
    expect(screen.getByText('Chat only')).toBeInTheDocument();
  });

  it('renders mode descriptions', () => {
    render(<ModeSection />);
    expect(screen.getByText('Full file modification capabilities')).toBeInTheDocument();
    expect(screen.getByText('All tools require human approval')).toBeInTheDocument();
  });

  it('renders the conversation limits dropdown', () => {
    render(<ModeSection />);
    expect(screen.getByTestId('conversation-limits')).toBeInTheDocument();
  });

  it('shows default max turns of 1000', () => {
    render(<ModeSection />);
    expect(screen.getByText('Max turns: 1000')).toBeInTheDocument();
  });

  it('sets auto as default current mode', () => {
    render(<ModeSection />);
    const autoMode = screen.getByTestId('mode-item-auto');
    expect(autoMode).toHaveAttribute('data-current', 'true');
  });
});
