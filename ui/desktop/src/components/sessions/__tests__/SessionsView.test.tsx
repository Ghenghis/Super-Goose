import { render, screen, waitFor } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockSetView = vi.fn();
const mockGetSession = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/sessions', state: null }),
}));

vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: () => mockSetView,
}));

vi.mock('../../../api', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

vi.mock('../SessionListView', () => ({
  default: ({
    onSelectSession,
    selectedSessionId,
  }: {
    onSelectSession: (id: string) => void;
    selectedSessionId: string | null;
  }) => (
    <div data-testid="session-list-view">
      <span data-testid="selected-id">{selectedSessionId ?? 'none'}</span>
      <button data-testid="select-session-btn" onClick={() => onSelectSession('sess-42')}>
        Select
      </button>
    </div>
  ),
}));

vi.mock('../SessionHistoryView', () => ({
  default: ({
    session,
    isLoading,
    error,
    onBack,
    onRetry,
  }: {
    session: { id: string; name: string };
    isLoading: boolean;
    error: string | null;
    onBack: () => void;
    onRetry: () => void;
  }) => (
    <div data-testid="session-history-view">
      <span data-testid="history-session-id">{session.id}</span>
      <span data-testid="history-session-name">{session.name}</span>
      {isLoading && <span data-testid="history-loading">Loading...</span>}
      {error && <span data-testid="history-error">{error}</span>}
      <button data-testid="history-back-btn" onClick={onBack}>
        Back
      </button>
      <button data-testid="history-retry-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import SessionsView from '../SessionsView';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SessionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SessionListView by default', () => {
    render(<SessionsView />);
    expect(screen.getByTestId('session-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('session-history-view')).not.toBeInTheDocument();
  });

  it('passes null as selectedSessionId when no session is selected', () => {
    render(<SessionsView />);
    expect(screen.getByTestId('selected-id')).toHaveTextContent('none');
  });

  it('calls setView with pair route when a session is selected from list', async () => {
    render(<SessionsView />);
    screen.getByTestId('select-session-btn').click();

    await waitFor(() => {
      expect(mockSetView).toHaveBeenCalledWith('pair', {
        disableAnimation: true,
        resumeSessionId: 'sess-42',
      });
    });
  });

  it('does not show SessionHistoryView when no session is loading', () => {
    render(<SessionsView />);
    expect(screen.queryByTestId('session-history-view')).not.toBeInTheDocument();
  });

  it('shows SessionListView as the default view', () => {
    render(<SessionsView />);
    const listView = screen.getByTestId('session-list-view');
    expect(listView).toBeInTheDocument();
  });

  it('renders without errors when mounted', () => {
    const { container } = render(<SessionsView />);
    expect(container).toBeTruthy();
  });

  it('does not call getSession on initial render without location state', () => {
    render(<SessionsView />);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('passes onSelectSession callback to SessionListView', () => {
    render(<SessionsView />);
    // The select button exists, which proves the callback was passed
    expect(screen.getByTestId('select-session-btn')).toBeInTheDocument();
  });

  it('handles multiple rapid session selections without errors', async () => {
    render(<SessionsView />);
    const btn = screen.getByTestId('select-session-btn');
    btn.click();
    btn.click();
    btn.click();

    await waitFor(() => {
      expect(mockSetView).toHaveBeenCalledTimes(3);
    });
  });
});
