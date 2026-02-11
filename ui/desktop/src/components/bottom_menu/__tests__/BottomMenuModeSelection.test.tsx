import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomMenuModeSelection } from '../BottomMenuModeSelection';

// Mock dependencies
vi.mock('../../ConfigContext', () => ({
  useConfig: vi.fn(() => ({
    read: vi.fn(() => Promise.resolve('auto')),
    upsert: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../../../utils/analytics', () => ({
  trackModeChanged: vi.fn(),
}));

vi.mock('../../settings/mode/ModeSelectionItem', () => ({
  all_goose_modes: [
    { key: 'auto', label: 'Autonomous', description: 'Full file modification capabilities' },
    { key: 'approve', label: 'Manual', description: 'All tools require human approval' },
    { key: 'smart_approve', label: 'Smart', description: 'Intelligently determine approval' },
    { key: 'chat', label: 'Chat only', description: 'Engage without tools or extensions' },
  ],
  ModeSelectionItem: ({
    mode,
    currentMode,
  }: {
    mode: { key: string; label: string };
    currentMode: string;
  }) => (
    <div data-testid={`mode-item-${mode.key}`} data-current={currentMode === mode.key}>
      {mode.label}
    </div>
  ),
}));

vi.mock('lucide-react', () => ({
  Tornado: ({ className }: { className?: string }) => (
    <span data-testid="tornado-icon" className={className}>
      Tornado
    </span>
  ),
}));

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('BottomMenuModeSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the mode selection trigger', () => {
    render(<BottomMenuModeSelection />);
    expect(screen.getByTestId('dropdown-trigger')).toBeInTheDocument();
  });

  it('renders the tornado icon', () => {
    render(<BottomMenuModeSelection />);
    expect(screen.getByTestId('tornado-icon')).toBeInTheDocument();
  });

  it('displays the default mode label (autonomous)', () => {
    render(<BottomMenuModeSelection />);
    expect(screen.getByText('autonomous')).toBeInTheDocument();
  });

  it('renders all mode items in dropdown', () => {
    render(<BottomMenuModeSelection />);
    expect(screen.getByTestId('mode-item-auto')).toBeInTheDocument();
    expect(screen.getByTestId('mode-item-approve')).toBeInTheDocument();
    expect(screen.getByTestId('mode-item-smart_approve')).toBeInTheDocument();
    expect(screen.getByTestId('mode-item-chat')).toBeInTheDocument();
  });

  it('renders four mode options', () => {
    render(<BottomMenuModeSelection />);
    const modeItems = screen.getAllByTestId(/^mode-item-/);
    expect(modeItems).toHaveLength(4);
  });
});
