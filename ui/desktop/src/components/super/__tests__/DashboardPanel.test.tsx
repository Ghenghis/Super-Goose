import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DashboardPanel from '../DashboardPanel';

// --- Mocks ----------------------------------------------------------------

const mockUseSuperGooseData = vi.fn();
vi.mock('../../../hooks/useSuperGooseData', () => ({
  useSuperGooseData: (...args: unknown[]) => mockUseSuperGooseData(...args),
}));

const mockUseAgentStream = vi.fn();
vi.mock('../../../hooks/useAgentStream', () => ({
  useAgentStream: (...args: unknown[]) => mockUseAgentStream(...args),
}));

// --- Helpers ---------------------------------------------------------------

function defaults() {
  mockUseSuperGooseData.mockReturnValue({
    learningStats: null,
    costSummary: null,
    autonomousStatus: null,
    otaStatus: null,
    loading: false,
    refresh: vi.fn(),
  });
  mockUseAgentStream.mockReturnValue({
    events: [],
    connected: false,
    latestStatus: null,
    clearEvents: vi.fn(),
  });
}

beforeEach(() => defaults());
afterEach(() => vi.restoreAllMocks());

// --- Tests -----------------------------------------------------------------

describe('DashboardPanel', () => {
  // -- Loading state --------------------------------------------------------
  it('shows loading placeholders when data is loading', () => {
    mockUseSuperGooseData.mockReturnValue({
      learningStats: null,
      costSummary: null,
      autonomousStatus: null,
      otaStatus: null,
      loading: true,
      refresh: vi.fn(),
    });
    render(<DashboardPanel />);

    // All four metric cards should display "..."
    const dots = screen.getAllByText('...');
    expect(dots.length).toBe(4);
  });

  // -- Populated data -------------------------------------------------------
  it('renders metric values from useSuperGooseData when loaded', () => {
    mockUseSuperGooseData.mockReturnValue({
      learningStats: { success_rate: 0.85, total_experiences: 10, total_skills: 5, verified_skills: 2, total_insights: 3, experiences_by_core: {} },
      costSummary: { session_spend: 1.23, total_spend: 4.56, budget_limit: null, budget_remaining: null, budget_warning_threshold: 0.8, is_over_budget: false, model_breakdown: [] },
      autonomousStatus: { running: true, uptime_seconds: 3600, tasks_completed: 5, tasks_failed: 2, circuit_breaker: { state: 'closed', consecutive_failures: 0, max_failures: 5, last_failure: null }, current_task: null },
      otaStatus: null,
      loading: false,
      refresh: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('1')).toBeDefined();      // Active Agents (running=true)
    expect(screen.getByText('7')).toBeDefined();       // Tasks Today
    expect(screen.getByText('$1.23')).toBeDefined();   // Session Cost
    expect(screen.getByText('85%')).toBeDefined();     // Success Rate
  });

  it('displays N/A for metrics when backend data is null', () => {
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

  // -- Recent Activity (with events) ----------------------------------------
  it('renders recent events from useAgentStream', () => {
    mockUseAgentStream.mockReturnValue({
      events: [
        { type: 'ToolCalled', tool_name: 'developer' },
        { type: 'AgentStatus', core_type: 'FreeformCore' },
      ],
      connected: true,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('tool called')).toBeDefined();
    expect(screen.getByText('agent status')).toBeDefined();
    expect(screen.getByText('FreeformCore')).toBeDefined();
  });

  // -- LIVE badge -----------------------------------------------------------
  it('shows LIVE badge when SSE is connected', () => {
    mockUseAgentStream.mockReturnValue({
      events: [],
      connected: true,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<DashboardPanel />);

    expect(screen.getByText('LIVE')).toBeDefined();
  });

  it('does not show LIVE badge when disconnected', () => {
    render(<DashboardPanel />);

    expect(screen.queryByText('LIVE')).toBeNull();
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
