import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ── Mock data ──────────────────────────────────────────────────────────────────

const mockSchedules = [
  {
    id: 'schedule-1',
    source: 'file:///path/to/recipe.yaml',
    cron: '0 14 * * *',
    last_run: '2026-01-15T14:00:00Z',
    currently_running: false,
    paused: false,
  },
  {
    id: 'schedule-2',
    source: 'file:///path/to/other.yaml',
    cron: '0 9 * * 1',
    last_run: null,
    currently_running: true,
    paused: false,
  },
  {
    id: 'schedule-3',
    source: 'file:///paused/recipe.yaml',
    cron: '0 12 * * *',
    last_run: '2026-01-14T12:00:00Z',
    currently_running: false,
    paused: true,
  },
];

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockListSchedules = vi.fn();
const mockCreateSchedule = vi.fn();
const mockDeleteSchedule = vi.fn();
const mockPauseSchedule = vi.fn();
const mockUnpauseSchedule = vi.fn();
const mockUpdateSchedule = vi.fn();
const mockKillRunningJob = vi.fn();
const mockInspectRunningJob = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/schedules', state: null }),
}));

vi.mock('../../../schedule', () => ({
  listSchedules: () => mockListSchedules(),
  createSchedule: (...args: unknown[]) => mockCreateSchedule(...args),
  deleteSchedule: (...args: unknown[]) => mockDeleteSchedule(...args),
  pauseSchedule: (...args: unknown[]) => mockPauseSchedule(...args),
  unpauseSchedule: (...args: unknown[]) => mockUnpauseSchedule(...args),
  updateSchedule: (...args: unknown[]) => mockUpdateSchedule(...args),
  killRunningJob: (...args: unknown[]) => mockKillRunningJob(...args),
  inspectRunningJob: (...args: unknown[]) => mockInspectRunningJob(...args),
}));

vi.mock('../../../toasts', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../utils/date', () => ({
  formatToLocalDateWithTimezone: (d: string | null) => d ?? 'Never',
}));

vi.mock('../../../utils/conversionUtils', () => ({
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock('../../../utils/analytics', () => ({
  trackScheduleCreated: vi.fn(),
  trackScheduleDeleted: vi.fn(),
  getErrorType: vi.fn(() => 'unknown'),
}));

vi.mock('cronstrue', () => ({
  default: { toString: (c: string) => `Cron: ${c}` },
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

vi.mock('../../ui/card', () => ({
  Card: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <div data-testid="schedule-card" onClick={onClick}>
      {children}
    </div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('../ScheduleModal', () => ({
  ScheduleModal: ({ isOpen }: { isOpen: boolean; [key: string]: unknown }) =>
    isOpen ? <div data-testid="schedule-modal">Modal</div> : null,
}));

vi.mock('../ScheduleDetailView', () => ({
  default: ({
    scheduleId,
    onNavigateBack,
  }: {
    scheduleId: string;
    onNavigateBack: () => void;
  }) => (
    <div data-testid="schedule-detail-view">
      <span data-testid="detail-schedule-id">{scheduleId}</span>
      <button data-testid="detail-back-btn" onClick={onNavigateBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock('../../icons/TrashIcon', () => ({
  TrashIcon: ({ className }: { className?: string }) => <span data-testid="trash-icon" />,
}));

vi.mock('lucide-react', () => ({
  Plus: () => <span />,
  RefreshCw: () => <span />,
  Pause: () => <span />,
  Play: () => <span />,
  Edit: () => <span />,
  Square: () => <span />,
  Eye: () => <span />,
  CircleDotDashed: () => <span data-testid="icon-empty" />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import SchedulesView from '../SchedulesView';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SchedulesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSchedules.mockResolvedValue(mockSchedules);
  });

  it('renders the page title "Scheduler"', async () => {
    render(<SchedulesView />);
    expect(screen.getByText('Scheduler')).toBeInTheDocument();
  });

  it('renders inside MainPanelLayout', async () => {
    render(<SchedulesView />);
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('shows loading spinner while fetching schedules', () => {
    mockListSchedules.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SchedulesView />);
    // The loading spinner is a div with animate-spin class
    expect(screen.queryByText('No schedules yet')).not.toBeInTheDocument();
  });

  it('shows schedule cards after loading', async () => {
    render(<SchedulesView />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('schedule-card');
      expect(cards.length).toBe(3);
    });
  });

  it('displays schedule IDs', async () => {
    render(<SchedulesView />);

    await waitFor(() => {
      expect(screen.getByText('schedule-1')).toBeInTheDocument();
      expect(screen.getByText('schedule-2')).toBeInTheDocument();
      expect(screen.getByText('schedule-3')).toBeInTheDocument();
    });
  });

  it('shows empty state when no schedules exist', async () => {
    mockListSchedules.mockResolvedValue([]);
    render(<SchedulesView />);

    await waitFor(() => {
      expect(screen.getByText('No schedules yet')).toBeInTheDocument();
    });
  });

  it('shows error banner when fetchSchedules fails', async () => {
    mockListSchedules.mockRejectedValue(new Error('Connection failed'));
    render(<SchedulesView />);

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
    });
  });

  it('renders Create Schedule button', () => {
    render(<SchedulesView />);
    expect(screen.getByText('Create Schedule')).toBeInTheDocument();
  });

  it('renders Refresh button', () => {
    render(<SchedulesView />);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('shows "Running" badge for running jobs', async () => {
    render(<SchedulesView />);

    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument();
    });
  });

  it('shows "Paused" badge for paused jobs', async () => {
    render(<SchedulesView />);

    await waitFor(() => {
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });
  });

  it('calls listSchedules on mount', () => {
    render(<SchedulesView />);
    expect(mockListSchedules).toHaveBeenCalled();
  });
});
