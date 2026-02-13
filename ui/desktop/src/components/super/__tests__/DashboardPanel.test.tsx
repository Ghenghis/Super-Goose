import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DashboardPanel from '../DashboardPanel';

// --- Mocks ----------------------------------------------------------------

const mockUseAgUi = vi.fn();
vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: (...args: unknown[]) => mockUseAgUi(...args),
}));

// --- Helpers ---------------------------------------------------------------

function defaults() {
  mockUseAgUi.mockReturnValue({
    connected: false,
    isRunning: false,
    agentState: {},
    pendingApprovals: [],
    activities: [],
    approveToolCall: vi.fn(),
    rejectToolCall: vi.fn(),
  });
}

beforeEach(() => defaults());
afterEach(() => vi.restoreAllMocks());

// --- Tests -----------------------------------------------------------------

describe('DashboardPanel', () => {
  // -- Loading state --------------------------------------------------------
  it('shows loading placeholders when data is loading', () => {
    // connected=false → loading=true → all metrics show "..."
    render(<DashboardPanel />);

    const dots = screen.getAllByText('...');
    expect(dots.length).toBe(4);
  });

  // -- Populated data -------------------------------------------------------
  it('renders metric values from agentState when connected', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      isRunning: false,
      agentState: {
        autonomous_running: true,
        tasks_completed: 5,
        tasks_failed: 2,
        session_spend: 1.23,
        success_rate: 0.85,
      },
      pendingApprovals: [],
      activities: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('1')).toBeDefined();      // Active Agents (running=true)
    expect(screen.getByText('7')).toBeDefined();       // Tasks Today (5+2)
    expect(screen.getByText('$1.23')).toBeDefined();   // Session Cost
    expect(screen.getByText('85%')).toBeDefined();     // Success Rate
  });

  it('displays N/A for metrics when backend data is null', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      isRunning: false,
      agentState: {},
      pendingApprovals: [],
      activities: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
    });
    render(<DashboardPanel />);

    const naElements = screen.getAllByText('N/A');
    // Tasks Today, Session Cost, Success Rate should all be N/A
    expect(naElements.length).toBe(3);
    // Active Agents shows '0' when autonomous not running / null
    expect(screen.getByText('0')).toBeDefined();
  });

  // -- Quick Actions --------------------------------------------------------
  it('renders Quick Actions section with buttons', () => {
    render(<DashboardPanel />);

    expect(screen.getByText('Quick Actions')).toBeDefined();
    expect(screen.getByText('New Task')).toBeDefined();
    expect(screen.getByText('Run Tests')).toBeDefined();
    expect(screen.getByText('Open Studio')).toBeDefined();
  });

  // -- Hardware section -----------------------------------------------------
  it('renders Hardware section', () => {
    render(<DashboardPanel />);

    expect(screen.getByText('Hardware')).toBeDefined();
    expect(screen.getByText('GPU')).toBeDefined();
    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('Memory')).toBeDefined();
  });

  // -- Recent Activity (empty) ----------------------------------------------
  it('shows empty state when no events', () => {
    render(<DashboardPanel />);

    expect(screen.getByText('No recent activity')).toBeDefined();
  });

  // -- Recent Activity (with activities) ------------------------------------
  it('renders recent activities from useAgUi', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      isRunning: false,
      agentState: {},
      pendingApprovals: [],
      activities: [
        { id: 'a-1', message: 'Task started', level: 'info', timestamp: Date.now() - 2000 },
        { id: 'a-2', message: 'Core switched to StructuredCore', level: 'info', timestamp: Date.now() - 1000 },
      ],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('Task started')).toBeDefined();
    expect(screen.getByText('Core switched to StructuredCore')).toBeDefined();
  });

  // -- LIVE badge -----------------------------------------------------------
  it('shows LIVE badge when SSE is connected', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      isRunning: false,
      agentState: {},
      pendingApprovals: [],
      activities: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('LIVE')).toBeDefined();
  });

  it('does not show LIVE badge when disconnected', () => {
    render(<DashboardPanel />);

    expect(screen.queryByText('LIVE')).toBeNull();
  });

  // -- Pending Approvals ----------------------------------------------------
  it('renders pending approvals from useAgUi', () => {
    const mockApprove = vi.fn();
    const mockReject = vi.fn();
    mockUseAgUi.mockReturnValue({
      connected: true,
      isRunning: false,
      agentState: {},
      pendingApprovals: [
        { toolCallId: 'tc-1', toolCallName: 'delete_files', args: '{"path":"/tmp/old"}', timestamp: Date.now() },
      ],
      activities: [],
      approveToolCall: mockApprove,
      rejectToolCall: mockReject,
    });
    render(<DashboardPanel />);

    expect(screen.getByText('Delete Files')).toBeDefined();
    expect(screen.queryByText('No pending approvals')).toBeNull();
  });

  it('shows empty approvals state when none pending', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      isRunning: false,
      agentState: {},
      pendingApprovals: [],
      activities: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('No pending approvals')).toBeDefined();
  });

  // -- Accessibility --------------------------------------------------------
  it('has correct ARIA region and section labels', () => {
    render(<DashboardPanel />);

    expect(screen.getByRole('region', { name: 'Super-Goose Dashboard' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Super-Goose Dashboard' }).querySelector('[aria-label="Key metrics"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Super-Goose Dashboard' }).querySelector('[aria-label="Quick actions"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Super-Goose Dashboard' }).querySelector('[aria-label="Hardware status"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Super-Goose Dashboard' }).querySelector('[aria-label="Recent activity"]')).not.toBeNull();
  });

  it('renders metric cards in a list role', () => {
    render(<DashboardPanel />);

    const metricsSection = screen.getByLabelText('Key metrics');
    const list = within(metricsSection).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(4);
  });
});
