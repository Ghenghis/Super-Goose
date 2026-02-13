import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonitorPanel from '../MonitorPanel';

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

describe('MonitorPanel', () => {
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
    render(<MonitorPanel />);

    // Session, Total, Budget, and Experiences should all show "..."
    const dots = screen.getAllByText('...');
    expect(dots.length).toBe(4);
  });

  // -- Cost tracker section -------------------------------------------------
  it('renders Cost Tracker heading', () => {
    render(<MonitorPanel />);
    expect(screen.getByText('Cost Tracker')).toBeDefined();
  });

  it('displays N/A for cost values when no data', () => {
    render(<MonitorPanel />);
    const naElements = screen.getAllByText('N/A');
    // Session and Total both N/A
    expect(naElements.length).toBe(2);
  });

  it('renders cost values from useSuperGooseData', () => {
    mockUseSuperGooseData.mockReturnValue({
      learningStats: { total_experiences: 42, success_rate: 0.9, total_skills: 5, verified_skills: 3, total_insights: 2, experiences_by_core: {} },
      costSummary: {
        session_cost: 2.5,
        total_cost: 10.75,
        model_breakdown: [],
        budget_limit: 50,
        budget_used_percent: 21.5,
      },
      autonomousStatus: null,
      otaStatus: null,
      loading: false,
      refresh: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('$2.50')).toBeDefined();
    expect(screen.getByText('$10.75')).toBeDefined();
    expect(screen.getByText('$50.00 (22%)')).toBeDefined();
  });

  // -- Budget progress bar --------------------------------------------------
  it('renders budget progress bar when budget_limit is set', () => {
    mockUseSuperGooseData.mockReturnValue({
      learningStats: null,
      costSummary: {
        session_cost: 5,
        total_cost: 20,
        model_breakdown: [],
        budget_limit: 100,
        budget_used_percent: 45,
      },
      autonomousStatus: null,
      otaStatus: null,
      loading: false,
      refresh: vi.fn(),
    });
    render(<MonitorPanel />);

    const progressbar = screen.getByRole('progressbar', { name: 'Budget usage' });
    expect(progressbar).toBeDefined();
    expect(progressbar.getAttribute('aria-valuenow')).toBe('45');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('does not render progress bar when budget_limit is null', () => {
    render(<MonitorPanel />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  // -- Model breakdown ------------------------------------------------------
  it('renders model breakdown when present', () => {
    mockUseSuperGooseData.mockReturnValue({
      learningStats: null,
      costSummary: {
        session_cost: 1,
        total_cost: 5,
        model_breakdown: [
          { model: 'claude-3-opus', cost: 3.1234, calls: 12 },
          { model: 'claude-3-sonnet', cost: 1.5678, calls: 8 },
        ],
        budget_limit: null,
        budget_used_percent: 0,
      },
      autonomousStatus: null,
      otaStatus: null,
      loading: false,
      refresh: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('claude-3-opus')).toBeDefined();
    expect(screen.getByText('$3.1234 (12 calls)')).toBeDefined();
    expect(screen.getByText('claude-3-sonnet')).toBeDefined();
    expect(screen.getByText('$1.5678 (8 calls)')).toBeDefined();
  });

  // -- Agent Statistics section ---------------------------------------------
  it('renders Agent Statistics section', () => {
    render(<MonitorPanel />);
    expect(screen.getByText('Agent Statistics')).toBeDefined();
    expect(screen.getByText('Active Core')).toBeDefined();
    expect(screen.getByText('FreeformCore')).toBeDefined(); // default
    expect(screen.getByText('Experiences')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined(); // default experience count
  });

  it('shows active core from latestStatus', () => {
    mockUseAgentStream.mockReturnValue({
      events: [],
      connected: true,
      latestStatus: { type: 'agent_status', core: 'OrchestratorCore' },
      clearEvents: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('OrchestratorCore')).toBeDefined();
  });

  it('shows experience count from learningStats', () => {
    mockUseSuperGooseData.mockReturnValue({
      learningStats: { total_experiences: 137, success_rate: 0.5, total_skills: 3, verified_skills: 1, total_insights: 2, experiences_by_core: {} },
      costSummary: null,
      autonomousStatus: null,
      otaStatus: null,
      loading: false,
      refresh: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('137')).toBeDefined();
  });

  // -- Live Logs section ----------------------------------------------------
  it('renders Live Logs heading', () => {
    render(<MonitorPanel />);
    expect(screen.getByText('Live Logs')).toBeDefined();
  });

  it('shows waiting message when no events', () => {
    render(<MonitorPanel />);
    expect(screen.getByText('Waiting for activity...')).toBeDefined();
  });

  it('renders log events from useAgentStream', () => {
    mockUseAgentStream.mockReturnValue({
      events: [
        { type: 'tool_called', tool: 'developer', status: 'running' },
        { type: 'core_switched', core: 'SwarmCore' },
      ],
      connected: false,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('tool_called')).toBeDefined();
    expect(screen.getByText('developer')).toBeDefined();
    expect(screen.getByText('running')).toBeDefined();
    expect(screen.getByText('core_switched')).toBeDefined();
    expect(screen.getByText(/SwarmCore/)).toBeDefined();
  });

  // -- SSE connection indicator ---------------------------------------------
  it('shows LIVE badge when connected', () => {
    mockUseAgentStream.mockReturnValue({
      events: [],
      connected: true,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('LIVE')).toBeDefined();
  });

  it('hides LIVE badge when disconnected', () => {
    render(<MonitorPanel />);
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  // -- Accessibility --------------------------------------------------------
  it('has correct ARIA region label', () => {
    render(<MonitorPanel />);
    expect(screen.getByRole('region', { name: 'Monitor Panel' })).toBeDefined();
  });

  it('has a log role for the event log area', () => {
    render(<MonitorPanel />);
    expect(screen.getByRole('log', { name: 'Agent event log' })).toBeDefined();
  });

  // -- Budget display infinity when null ------------------------------------
  it('shows infinity symbol when no budget limit', () => {
    render(<MonitorPanel />);
    // The unicode infinity character
    expect(screen.getByText('\u221E')).toBeDefined();
  });
});
