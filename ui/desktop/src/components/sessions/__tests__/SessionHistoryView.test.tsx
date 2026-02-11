import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionHistoryView from '../SessionHistoryView';

// Mock all heavy dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/' })),
}));

vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: vi.fn(() => vi.fn()),
}));

vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-panel-layout">{children}</div>
  ),
}));

vi.mock('../../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('../../ui/BackButton', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="back-button" onClick={onClick}>
      Back
    </button>
  ),
}));

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}));

vi.mock('../../ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog">{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../ProgressiveMessageList', () => ({
  default: () => <div data-testid="progressive-message-list">Messages</div>,
}));

vi.mock('../../conversation/SearchView', () => ({
  SearchView: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="search-view">{children}</div>
  ),
}));

vi.mock('../../../utils/timeUtils', () => ({
  formatMessageTimestamp: vi.fn(() => 'Jan 15, 2026'),
}));

vi.mock('../../../sharedSessions', () => ({
  createSharedSession: vi.fn(() => Promise.resolve('share-token-123')),
}));

vi.mock('../../../sessions', () => ({
  resumeSession: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../utils/conversionUtils', () => ({
  errorMessage: vi.fn((err: Error) => err?.message || 'Unknown error'),
}));

vi.mock('lucide-react', () => ({
  Calendar: () => <span data-testid="icon-calendar" />,
  MessageSquareText: () => <span data-testid="icon-messages" />,
  Folder: () => <span data-testid="icon-folder" />,
  Share2: () => <span data-testid="icon-share" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Copy: () => <span data-testid="icon-copy" />,
  Check: () => <span data-testid="icon-check" />,
  Target: () => <span data-testid="icon-target" />,
  LoaderCircle: () => <span data-testid="icon-loader" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
}));

describe('SessionHistoryView', () => {
  const mockSession = {
    id: 'session-1',
    name: 'My Test Session',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    message_count: 15,
    working_dir: '/home/user/project',
    total_tokens: 5000,
    extension_data: {} as Record<string, unknown>,
    conversation: [
      {
        role: 'user' as const,
        created: 1705312800,
        content: [{ type: 'text' as const, text: 'Hello' }],
        metadata: { agentVisible: true, userVisible: true },
      },
      {
        role: 'assistant' as const,
        created: 1705312860,
        content: [{ type: 'text' as const, text: 'Hi there!' }],
        metadata: { agentVisible: true, userVisible: true },
      },
    ],
  };

  const defaultProps = {
    session: mockSession,
    isLoading: false,
    error: null,
    onBack: vi.fn(),
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it('renders the session name as title', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByText('My Test Session')).toBeInTheDocument();
  });

  it('renders inside MainPanelLayout', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('renders message count', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders working directory', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();
  });

  it('renders total tokens', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByText('5,000')).toBeInTheDocument();
  });

  it('renders the back button', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
  });

  it('shows loading state when isLoading is true', () => {
    render(<SessionHistoryView {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Loading session details...')).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    render(<SessionHistoryView {...defaultProps} error="Failed to load session" />);
    expect(screen.getByText('Error Loading Session Details')).toBeInTheDocument();
    expect(screen.getByText('Failed to load session')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders Resume button when not loading', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('renders Share button when not loading', () => {
    render(<SessionHistoryView {...defaultProps} />);
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('hides action buttons when showActionButtons is false', () => {
    render(<SessionHistoryView {...defaultProps} showActionButtons={false} />);
    expect(screen.queryByText('Resume')).not.toBeInTheDocument();
    // The Share text might appear in the share dialog that's always rendered
    // so check there's no "Sharing..." button either
    expect(screen.queryByText('Sharing...')).not.toBeInTheDocument();
  });

  it('renders empty state when no messages', () => {
    render(
      <SessionHistoryView
        {...defaultProps}
        session={{ ...mockSession, conversation: [] }}
      />
    );
    expect(screen.getByText('No messages found')).toBeInTheDocument();
  });
});
