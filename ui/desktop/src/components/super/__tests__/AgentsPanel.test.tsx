import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentsPanel from '../AgentsPanel';

// --- Mocks ----------------------------------------------------------------

const mockUseAgentStream = vi.fn();
vi.mock('../../../hooks/useAgentStream', () => ({
  useAgentStream: (...args: unknown[]) => mockUseAgentStream(...args),
}));

// --- Helpers ---------------------------------------------------------------

function defaults() {
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

describe('AgentsPanel', () => {
  // -- Tab navigation -------------------------------------------------------
  it('renders three tabs: Active, Cores, Builder', () => {
    render(<AgentsPanel />);

    expect(screen.getByRole('tab', { name: 'Active' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Cores' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Builder' })).toBeDefined();
  });

  it('shows Active tab selected by default', () => {
    render(<AgentsPanel />);
    const activeTab = screen.getByRole('tab', { name: 'Active' });
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches to Cores tab on click', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    expect(screen.getByRole('tab', { name: 'Cores' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Active' }).getAttribute('aria-selected')).toBe('false');
  });

  it('switches to Builder tab on click', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    expect(screen.getByRole('tab', { name: 'Builder' }).getAttribute('aria-selected')).toBe('true');
  });

  // -- Active tab (empty) ---------------------------------------------------
  it('shows empty state when no events on Active tab', () => {
    render(<AgentsPanel />);
    expect(screen.getByText('No active agents')).toBeDefined();
  });

  // -- SSE connection indicator on Active tab -------------------------------
  it('shows Connected status when SSE is connected', () => {
    mockUseAgentStream.mockReturnValue({
      events: [],
      connected: true,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('shows Disconnected status when SSE is disconnected', () => {
    render(<AgentsPanel />);
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  // -- Active core badge ----------------------------------------------------
  it('shows active core badge from latestStatus', () => {
    mockUseAgentStream.mockReturnValue({
      events: [],
      connected: true,
      latestStatus: { type: 'agent_status', core: 'StructuredCore' },
      clearEvents: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('StructuredCore')).toBeDefined();
  });

  it('does not show core badge when latestStatus has no core', () => {
    mockUseAgentStream.mockReturnValue({
      events: [],
      connected: true,
      latestStatus: { type: 'agent_status' },
      clearEvents: vi.fn(),
    });
    const { container } = render(<AgentsPanel />);

    // No badge with core name in the status indicator area
    const badges = container.querySelectorAll('.sg-badge-indigo');
    expect(badges.length).toBe(0);
  });

  // -- Active tab with events -----------------------------------------------
  it('renders agent events on Active tab', () => {
    mockUseAgentStream.mockReturnValue({
      events: [
        { type: 'tool_called', tool: 'developer' },
        { type: 'agent_status' },
        { type: 'core_switched' },
      ],
      connected: true,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('tool called')).toBeDefined();
    expect(screen.getByText('agent status')).toBeDefined();
    expect(screen.getByText('core switched')).toBeDefined();
  });

  it('shows tool name in event detail', () => {
    mockUseAgentStream.mockReturnValue({
      events: [{ type: 'tool_called', tool: 'bash' }],
      connected: false,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('Tool: bash')).toBeDefined();
  });

  it('assigns correct badge labels to event types', () => {
    mockUseAgentStream.mockReturnValue({
      events: [
        { type: 'agent_status' },
        { type: 'tool_called', tool: 'x' },
        { type: 'core_switched' },
        { type: 'experience_recorded' },
      ],
      connected: false,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('STATUS')).toBeDefined();
    expect(screen.getByText('TOOL')).toBeDefined();
    expect(screen.getByText('CORE')).toBeDefined();
    expect(screen.getByText('EVENT')).toBeDefined();
  });

  // -- Cores tab ------------------------------------------------------------
  it('renders all 6 core types on Cores tab', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));

    expect(screen.getByText('FreeformCore')).toBeDefined();
    expect(screen.getByText('StructuredCore')).toBeDefined();
    expect(screen.getByText('OrchestratorCore')).toBeDefined();
    expect(screen.getByText('SwarmCore')).toBeDefined();
    expect(screen.getByText('WorkflowCore')).toBeDefined();
    expect(screen.getByText('AdversarialCore')).toBeDefined();
  });

  it('renders core descriptions on Cores tab', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));

    expect(screen.getByText('Chat, research, open tasks')).toBeDefined();
    expect(screen.getByText('Multi-agent coordination')).toBeDefined();
  });

  it('renders Select button for each core', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));

    const selectButtons = screen.getAllByRole('button', { name: /Select/ });
    expect(selectButtons.length).toBe(6);
  });

  it('each Select button has correct aria-label', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));

    expect(screen.getByRole('button', { name: 'Select FreeformCore' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Select StructuredCore' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Select OrchestratorCore' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Select SwarmCore' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Select WorkflowCore' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Select AdversarialCore' })).toBeDefined();
  });

  // -- Builder tab ----------------------------------------------------------
  it('shows coming soon message on Builder tab', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    expect(screen.getByText(/Core builder.*coming soon/)).toBeDefined();
  });

  // -- Accessibility --------------------------------------------------------
  it('has correct ARIA region label', () => {
    render(<AgentsPanel />);
    expect(screen.getByRole('region', { name: 'Agents Panel' })).toBeDefined();
  });

  it('has tablist with correct label', () => {
    render(<AgentsPanel />);
    expect(screen.getByRole('tablist', { name: 'Agent views' })).toBeDefined();
  });

  it('renders tabpanel for active tab', () => {
    render(<AgentsPanel />);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('id')).toBe('agents-tabpanel-active');
  });

  it('renders cores tabpanel when switched', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('id')).toBe('agents-tabpanel-cores');
  });

  it('has log role for events when present', () => {
    mockUseAgentStream.mockReturnValue({
      events: [{ type: 'agent_status' }],
      connected: false,
      latestStatus: null,
      clearEvents: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByRole('log', { name: 'Agent events' })).toBeDefined();
  });
});
