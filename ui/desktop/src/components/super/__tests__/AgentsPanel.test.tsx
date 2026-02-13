import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentsPanel from '../AgentsPanel';

// --- Mocks ----------------------------------------------------------------

const mockUseAgUi = vi.fn();
vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: (...args: unknown[]) => mockUseAgUi(...args),
}));

const mockSwitchCore = vi.fn();
const mockListCores = vi.fn();
const mockGetCoreConfig = vi.fn();
const mockSetCoreConfig = vi.fn();
vi.mock('../../../utils/backendApi', () => ({
  backendApi: {
    switchCore: (...args: unknown[]) => mockSwitchCore(...args),
    listCores: (...args: unknown[]) => mockListCores(...args),
    getCoreConfig: (...args: unknown[]) => mockGetCoreConfig(...args),
    setCoreConfig: (...args: unknown[]) => mockSetCoreConfig(...args),
  },
}));

// --- Helpers ---------------------------------------------------------------

function defaults() {
  mockUseAgUi.mockReturnValue({
    connected: false,
    agentState: {},
    activities: [],
    messages: [],
    activeToolCalls: new Map(),
    pendingApprovals: [],
    reasoningMessages: [],
    isRunning: false,
    currentStep: null,
    isReasoning: false,
    customEvents: [],
    approveToolCall: vi.fn(),
    rejectToolCall: vi.fn(),
    reconnect: vi.fn(),
  });
}

beforeEach(() => {
  defaults();
  mockSwitchCore.mockResolvedValue({ success: true, active_core: 'structured', message: 'Switched' });
  mockListCores.mockResolvedValue([]);
  mockGetCoreConfig.mockResolvedValue(null); // Default: no saved config
  mockSetCoreConfig.mockResolvedValue({ success: true, message: 'Configuration saved' });
});
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
    mockUseAgUi.mockReturnValue({
      connected: true,
      agentState: {},
      activities: [],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('shows Disconnected status when SSE is disconnected', () => {
    render(<AgentsPanel />);
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  // -- Active core badge ----------------------------------------------------
  it('shows active core badge from agentState', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      agentState: { core_type: 'StructuredCore' },
      activities: [],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('StructuredCore')).toBeDefined();
  });

  it('does not show core badge when agentState has no core', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      agentState: {},
      activities: [],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    const { container } = render(<AgentsPanel />);

    // No badge with core name in the status indicator area
    const badges = container.querySelectorAll('.sg-badge-indigo');
    expect(badges.length).toBe(0);
  });

  // -- Active tab with events -----------------------------------------------
  it('renders agent events on Active tab', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      agentState: {},
      activities: [
        { id: 'a1', message: 'Tool called', metadata: { event_type: 'ToolCalled', tool_name: 'developer' } },
        { id: 'a2', message: 'Agent status', metadata: { event_type: 'AgentStatus' } },
        { id: 'a3', message: 'Core switched', metadata: { event_type: 'CoreSwitched' } },
      ],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('tool called')).toBeDefined();
    expect(screen.getByText('agent status')).toBeDefined();
    expect(screen.getByText('core switched')).toBeDefined();
  });

  it('shows tool name in event detail', () => {
    mockUseAgUi.mockReturnValue({
      connected: false,
      agentState: {},
      activities: [
        { id: 'a1', message: 'Tool called', metadata: { event_type: 'ToolCalled', tool_name: 'bash' } },
      ],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByText('Tool: bash')).toBeDefined();
  });

  it('assigns correct badge labels to event types', () => {
    mockUseAgUi.mockReturnValue({
      connected: false,
      agentState: {},
      activities: [
        { id: 'a1', message: 'Status', metadata: { event_type: 'AgentStatus' } },
        { id: 'a2', message: 'Tool', metadata: { event_type: 'ToolCalled', tool_name: 'x' } },
        { id: 'a3', message: 'Core', metadata: { event_type: 'CoreSwitched' } },
        { id: 'a4', message: 'Exp', metadata: { event_type: 'ExperienceRecorded' } },
      ],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
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

  // -- Core selection (wiring) -----------------------------------------------
  it('calls switchCore when Select button is clicked', async () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select StructuredCore' }));

    await waitFor(() => {
      expect(mockSwitchCore).toHaveBeenCalledWith('structured');
    });
  });

  it('updates active core after successful switch', async () => {
    mockSwitchCore.mockResolvedValue({ success: true, active_core: 'structured', message: 'Switched' });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select StructuredCore' }));

    await waitFor(() => {
      expect(screen.getByText('(active)')).toBeDefined();
    });
  });

  it('shows Active label on button after core is selected', async () => {
    mockSwitchCore.mockResolvedValue({ success: true, active_core: 'freeform', message: 'Switched' });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select FreeformCore' }));

    await waitFor(() => {
      const btn = screen.getByTestId('select-core-freeform');
      expect(btn.textContent).toBe('Active');
    });
  });

  it('does not update core on failed switch', async () => {
    mockSwitchCore.mockResolvedValue({ success: false, active_core: 'unknown', message: 'Error' });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select SwarmCore' }));

    await waitFor(() => {
      expect(mockSwitchCore).toHaveBeenCalledWith('swarm');
    });

    // All buttons should still say Select (no active core)
    const selectButtons = screen.getAllByRole('button', { name: /Select/ });
    expect(selectButtons.length).toBe(6);
  });

  it('does not update core when switchCore returns null', async () => {
    mockSwitchCore.mockResolvedValue(null);
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select OrchestratorCore' }));

    await waitFor(() => {
      expect(mockSwitchCore).toHaveBeenCalledWith('orchestrator');
    });

    // All buttons should still say Select
    const selectButtons = screen.getAllByRole('button', { name: /Select/ });
    expect(selectButtons.length).toBe(6);
  });

  it('disables selected core button after activation', async () => {
    mockSwitchCore.mockResolvedValue({ success: true, active_core: 'adversarial', message: 'Switched' });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select AdversarialCore' }));

    await waitFor(() => {
      const btn = screen.getByTestId('select-core-adversarial');
      expect(btn).toHaveProperty('disabled', true);
    });
  });

  it('derives active core from SSE agentState on Cores tab', () => {
    mockUseAgUi.mockReturnValue({
      connected: true,
      agentState: { core_type: 'workflow' },
      activities: [],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));

    const btn = screen.getByTestId('select-core-workflow');
    expect(btn.textContent).toBe('Active');
    expect(btn).toHaveProperty('disabled', true);
  });

  // -- Builder tab ----------------------------------------------------------
  it('shows auto-selection config on Builder tab', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    expect(screen.getByText('Core Auto-Selection')).toBeDefined();
    expect(screen.getByText('Core Priority Order')).toBeDefined();
    expect(screen.getByLabelText('Enable auto-selection')).toBeDefined();
    expect(screen.getByLabelText('Confidence threshold')).toBeDefined();
    expect(screen.getByLabelText('Preferred core')).toBeDefined();
    expect(screen.getByText('Save Configuration')).toBeDefined();
  });

  it('adjusts confidence threshold on Builder tab', () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    const slider = screen.getByLabelText('Confidence threshold') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(screen.getByText(/0\.5/)).toBeDefined();
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
    mockUseAgUi.mockReturnValue({
      connected: false,
      agentState: {},
      activities: [
        { id: 'a1', message: 'Status', metadata: { event_type: 'AgentStatus' } },
      ],
      messages: [],
      activeToolCalls: new Map(),
      pendingApprovals: [],
      reasoningMessages: [],
      isRunning: false,
      currentStep: null,
      isReasoning: false,
      customEvents: [],
      approveToolCall: vi.fn(),
      rejectToolCall: vi.fn(),
      reconnect: vi.fn(),
    });
    render(<AgentsPanel />);

    expect(screen.getByRole('log', { name: 'Agent events' })).toBeDefined();
  });

  // -- Builder tab: Config persistence ----------------------------------------

  it('loads saved core config on mount', async () => {
    mockGetCoreConfig.mockResolvedValue({
      auto_select: false,
      threshold: 0.3,
      preferred_core: 'structured',
      priorities: ['structured', 'freeform', 'orchestrator', 'swarm', 'workflow', 'adversarial'],
    });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    await waitFor(() => {
      const slider = screen.getByLabelText('Confidence threshold') as HTMLInputElement;
      expect(slider.value).toBe('0.3');
    });
  });

  it('calls getCoreConfig on mount', () => {
    render(<AgentsPanel />);
    expect(mockGetCoreConfig).toHaveBeenCalled();
  });

  it('calls setCoreConfig when Save is clicked', async () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(mockSetCoreConfig).toHaveBeenCalledTimes(1);
      expect(mockSetCoreConfig).toHaveBeenCalledWith({
        auto_select: true,
        threshold: 0.7,
        preferred_core: 'freeform',
        priorities: ['freeform', 'structured', 'orchestrator', 'swarm', 'workflow', 'adversarial'],
      });
    });
  });

  it('shows success message after save', async () => {
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.getByText('Configuration saved')).toBeDefined();
    });
  });

  it('shows error message on save failure', async () => {
    mockSetCoreConfig.mockResolvedValue({ success: false, message: 'Failed to write config' });
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.getByText('Failed to write config')).toBeDefined();
    });
  });

  it('disables Save button while saving', async () => {
    // Make setCoreConfig hang
    mockSetCoreConfig.mockImplementation(() => new Promise(() => {}));
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeDefined();
    });
  });

  it('uses default config when getCoreConfig returns null', async () => {
    mockGetCoreConfig.mockResolvedValue(null);
    render(<AgentsPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    // Default threshold is 0.7
    const slider = screen.getByLabelText('Confidence threshold') as HTMLInputElement;
    expect(slider.value).toBe('0.7');
  });
});
