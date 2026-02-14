import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperGoosePanel from '../SuperGoosePanel';

// Mock useAgUi — jsdom has no EventSource
vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: () => ({
    connected: false,
    error: null,
    runId: null,
    threadId: null,
    isRunning: false,
    currentStep: null,
    messages: [],
    agentState: { core_type: 'default', status: 'idle' },
    activeToolCalls: new Map(),
    pendingApprovals: [],
    activities: [],
    reasoningMessages: [],
    isReasoning: false,
    customEvents: [],
    runCount: 0,
    approveToolCall: vi.fn(),
    rejectToolCall: vi.fn(),
    reconnect: vi.fn(),
    abortRun: vi.fn(),
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    sendMessage: vi.fn(),
  }),
}));

// Mock backendApi so child panels (AgentsPanel, MarketplacePanel) don't make real API calls
vi.mock('../../../utils/backendApi', () => ({
  backendApi: {
    getCoreConfig: vi.fn().mockResolvedValue(null),
    setCoreConfig: vi.fn().mockResolvedValue({ success: true }),
    listCores: vi.fn().mockResolvedValue([]),
    switchCore: vi.fn().mockResolvedValue({ success: true, active_core: 'freeform', message: 'ok' }),
    getExtensions: vi.fn().mockResolvedValue([]),
    toggleExtension: vi.fn().mockResolvedValue(true),
    getGpuInfo: vi.fn().mockResolvedValue(null),
  },
}));

// Mock fetch for any remaining fetch calls (e.g., StudiosPanel)
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ extensions: [] }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SuperGoosePanel', () => {
  it('renders the sidebar with all 8 navigation items', () => {
    render(<SuperGoosePanel />);
    expect(screen.getByTitle('Dashboard')).toBeDefined();
    expect(screen.getByTitle('Studios')).toBeDefined();
    expect(screen.getByTitle('Agents')).toBeDefined();
    expect(screen.getByTitle('Marketplace')).toBeDefined();
    expect(screen.getByTitle('GPU')).toBeDefined();
    expect(screen.getByTitle('Connections')).toBeDefined();
    expect(screen.getByTitle('Monitor')).toBeDefined();
    expect(screen.getByTitle('Settings')).toBeDefined();
  });

  it('shows Dashboard panel by default', () => {
    render(<SuperGoosePanel />);
    expect(screen.getByText('Quick Actions')).toBeDefined();
    expect(screen.getByText('Hardware')).toBeDefined();
  });

  it('switches to Studios panel on click', async () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Studios'));
    await waitFor(() => {
      expect(screen.getByText('Core Studio')).toBeDefined();
    });
    expect(screen.getByText('Agent Studio')).toBeDefined();
  });

  it('switches to Agents panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Agents'));
    expect(screen.getByText('Cores')).toBeDefined();
  });

  it('switches to Monitor panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Monitor'));
    expect(screen.getByText('Cost Tracker')).toBeDefined();
    expect(screen.getByText('Live Logs')).toBeDefined();
  });

  it('shows Super-Goose badge', () => {
    render(<SuperGoosePanel />);
    expect(screen.getByText('Super-Goose')).toBeDefined();
  });

  it('has data-super attribute for CSS scoping', () => {
    const { container } = render(<SuperGoosePanel />);
    const panel = container.querySelector('[data-super="true"]');
    expect(panel).toBeDefined();
    expect(panel).not.toBeNull();
  });

  it('switches to Settings panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(screen.getByText('Feature Toggles')).toBeDefined();
    expect(screen.getByText('Experience Store')).toBeDefined();
  });

  it('switches to GPU panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('GPU'));
    expect(screen.getByText('Cluster')).toBeDefined();
    expect(screen.getByText('Local GPU')).toBeDefined();
  });

  it('switches to Connections panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Connections'));
    expect(screen.getByText('Services')).toBeDefined();
    expect(screen.getByText('GitHub')).toBeDefined();
  });

  it('switches to Marketplace panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Marketplace'));
    expect(screen.getByText('Browse')).toBeDefined();
  });
});
