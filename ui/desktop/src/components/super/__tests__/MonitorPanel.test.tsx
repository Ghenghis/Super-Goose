import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonitorPanel from '../MonitorPanel';

// --- Mocks ----------------------------------------------------------------

const mockUseAgUi = vi.fn();
vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: (...args: unknown[]) => mockUseAgUi(...args),
}));

// --- Helpers ---------------------------------------------------------------

function defaults() {
  mockUseAgUi.mockReturnValue({
    connected: false,
    error: null,
    runId: null,
    threadId: null,
    isRunning: false,
    currentStep: null,
    messages: [],
    agentState: {},
    activeToolCalls: new Map(),
    pendingApprovals: [],
    activities: [],
    reasoningMessages: [],
    isReasoning: false,
    customEvents: [],
    approveToolCall: vi.fn(),
    rejectToolCall: vi.fn(),
    reconnect: vi.fn(),
  });
}

beforeEach(() => defaults());
afterEach(() => vi.restoreAllMocks());

// --- Tests -----------------------------------------------------------------

describe('MonitorPanel', () => {
  // -- Loading state --------------------------------------------------------
  it('shows loading placeholders when not connected', () => {
    // connected=false means loading=true
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

  it('displays N/A for cost values when no data in agentState', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    const naElements = screen.getAllByText('N/A');
    // Session and Total both N/A
    expect(naElements.length).toBe(2);
  });

  it('renders cost values from agentState', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {
        session_spend: 2.5,
        total_spend: 10.75,
        budget_limit: 50,
        total_experiences: 42,
        model_breakdown: [],
      },
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('$2.50')).toBeDefined();
    expect(screen.getByText('$10.75')).toBeDefined();
    expect(screen.getByText('$50.00 (22%)')).toBeDefined();
  });

  // -- Budget progress bar --------------------------------------------------
  it('renders budget progress bar when budget_limit is set', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {
        session_spend: 5,
        total_spend: 20,
        budget_limit: 100,
        model_breakdown: [],
      },
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    const progressbar = screen.getByRole('progressbar', { name: 'Budget usage' });
    expect(progressbar).toBeDefined();
    expect(progressbar.getAttribute('aria-valuenow')).toBe('20');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('does not render progress bar when budget_limit is absent', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  // -- Model breakdown ------------------------------------------------------
  it('renders model breakdown when present', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {
        session_spend: 1,
        total_spend: 5,
        model_breakdown: [
          { model: 'claude-3-opus', cost: 3.1234, input_tokens: 8000, output_tokens: 4000 },
          { model: 'claude-3-sonnet', cost: 1.5678, input_tokens: 5000, output_tokens: 3000 },
        ],
      },
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('claude-3-opus')).toBeDefined();
    expect(screen.getByText('$3.1234 (12000 tokens)')).toBeDefined();
    expect(screen.getByText('claude-3-sonnet')).toBeDefined();
    expect(screen.getByText('$1.5678 (8000 tokens)')).toBeDefined();
  });

  // -- Agent Statistics section ---------------------------------------------
  it('renders Agent Statistics section', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    expect(screen.getByText('Agent Statistics')).toBeDefined();
    expect(screen.getByText('Active Core')).toBeDefined();
    expect(screen.getByText('FreeformCore')).toBeDefined(); // default
    expect(screen.getByText('Experiences')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined(); // default experience count
  });

  it('shows active core from agentState', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: { core_type: 'OrchestratorCore' },
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('OrchestratorCore')).toBeDefined();
  });

  it('shows experience count from agentState', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: { total_experiences: 137 },
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('137')).toBeDefined();
  });

  // -- Live Logs section ----------------------------------------------------
  it('renders Live Logs heading', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    expect(screen.getByText('Live Logs')).toBeDefined();
  });

  it('shows waiting message when no activities', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    expect(screen.getByText('Waiting for activity...')).toBeDefined();
  });

  it('renders activity items in Live Logs', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [
        { id: 'a1', message: 'Tool developer called', level: 'info', timestamp: Date.now() },
        { id: 'a2', message: 'Core switched to SwarmCore', level: 'warn', timestamp: Date.now() },
      ],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByRole('log', { name: 'Agent event log' })).toBeDefined();
    expect(screen.getByText('Tool developer called')).toBeDefined();
    expect(screen.getByText('Core switched to SwarmCore')).toBeDefined();
    // Level labels rendered
    expect(screen.getByText('info')).toBeDefined();
    expect(screen.getByText('warn')).toBeDefined();
  });

  // -- SSE connection indicator ---------------------------------------------
  it('shows LIVE badge when connected', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    // Two LIVE badges: one in Agent Reasoning, one in Live Logs
    const liveBadges = screen.getAllByText('LIVE');
    expect(liveBadges.length).toBe(2);
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
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    expect(screen.getByRole('log', { name: 'Agent event log' })).toBeDefined();
  });

  // -- Budget display infinity when null ------------------------------------
  it('shows infinity symbol when no budget limit', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);
    // The unicode infinity character
    expect(screen.getByText('\u221E')).toBeDefined();
  });

  // -- Current Step indicator -----------------------------------------------
  it('shows current step indicator when currentStep is set', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: 'run-1',
      threadId: 'thread-1',
      isRunning: true,
      currentStep: 'Analyzing code',
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('Executing:')).toBeDefined();
    expect(screen.getByText('Analyzing code')).toBeDefined();
    expect(screen.getByText('RUNNING')).toBeDefined();
  });

  it('hides current step indicator when currentStep is null', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: false,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.queryByText('Executing:')).toBeNull();
  });

  // -- Reasoning section ----------------------------------------------------
  it('shows Thinking indicator when isReasoning is true', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: true,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [],
      isReasoning: true,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('Thinking...')).toBeDefined();
  });

  it('renders reasoning messages', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      error: null,
      runId: null,
      threadId: null,
      isRunning: true,
      currentStep: null,
      messages: [],
      agentState: {},
      activeToolCalls: new Map(),
      pendingApprovals: [],
      activities: [],
      reasoningMessages: [
        { id: 'r1', content: 'Let me think about this problem...', streaming: false, timestamp: Date.now() },
        { id: 'r2', content: 'The solution involves refactoring', streaming: true, timestamp: Date.now() },
      ],
      isReasoning: true,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<MonitorPanel />);

    expect(screen.getByText('Let me think about this problem...')).toBeDefined();
    expect(screen.getByText('The solution involves refactoring')).toBeDefined();
    // The streaming item shows "streaming..." indicator
    expect(screen.getByText('streaming...')).toBeDefined();
  });
});
