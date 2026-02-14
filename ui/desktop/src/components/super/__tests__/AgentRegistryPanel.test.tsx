import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AgentRegistryPanel from '../AgentRegistryPanel';

// --- Mocks ----------------------------------------------------------------

vi.mock('../../../config', () => ({
  getApiUrl: vi.fn((endpoint: string) => `http://localhost:3000${endpoint}`),
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- Helpers ---------------------------------------------------------------

function agentsResponse(agents: Array<{
  id: string;
  name: string;
  role: string;
  displayName?: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  model: string;
  lastHeartbeat?: string;
}>) {
  return {
    ok: true,
    json: () => Promise.resolve({ agents }),
  };
}

function emptyResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({ agents: [] }),
  };
}

function httpErrorResponse(status = 500, statusText = 'Internal Server Error') {
  return { ok: false, status, statusText };
}

// --- Tests -----------------------------------------------------------------

describe('AgentRegistryPanel', () => {
  // -- Loading state --------------------------------------------------------
  it('shows loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<AgentRegistryPanel />);

    expect(screen.getByTestId('registry-loading')).toBeDefined();
    expect(screen.getByText('Loading agents...')).toBeDefined();
  });

  // -- Agents rendered ------------------------------------------------------
  it('renders agent cards from API response', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Coder', role: 'coder', status: 'online', model: 'gpt-4', displayName: 'Coder Agent' },
      { id: 'a2', name: 'Reviewer', role: 'reviewer', status: 'offline', model: 'claude', displayName: 'Review Agent' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Coder Agent')).toBeDefined();
    });

    expect(screen.getByText('Review Agent')).toBeDefined();
    expect(screen.getByTestId('agent-card-a1')).toBeDefined();
    expect(screen.getByTestId('agent-card-a2')).toBeDefined();
  });

  it('shows online/offline counts', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Coder', role: 'coder', status: 'online', model: 'gpt-4' },
      { id: 'a2', name: 'Reviewer', role: 'reviewer', status: 'offline', model: 'claude' },
      { id: 'a3', name: 'Tester', role: 'tester', status: 'online', model: 'llama' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('2 online')).toBeDefined();
    });

    expect(screen.getByText('1 offline')).toBeDefined();
  });

  it('shows connected status when data loads successfully', async () => {
    mockFetch.mockResolvedValue(agentsResponse([]));
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeDefined();
    });
  });

  // -- Empty state ----------------------------------------------------------
  it('shows empty state when no agents registered', async () => {
    mockFetch.mockResolvedValue(emptyResponse());
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('No agents registered')).toBeDefined();
    });
  });

  // -- Error state ----------------------------------------------------------
  it('shows error state when API fails', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('registry-error')).toBeDefined();
    });

    expect(screen.getByText('Connection refused')).toBeDefined();
  });

  it('shows error on HTTP error response', async () => {
    mockFetch.mockResolvedValue(httpErrorResponse(500, 'Internal Server Error'));
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('registry-error')).toBeDefined();
    });

    expect(screen.getByText('HTTP 500: Internal Server Error')).toBeDefined();
  });

  it('shows Retry button on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed'));
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeDefined();
    });

    // Retry succeeds
    mockFetch.mockResolvedValueOnce(agentsResponse([
      { id: 'a1', name: 'Agent', role: 'coder', status: 'online', model: 'gpt-4' },
    ]));

    await act(async () => {
      fireEvent.click(screen.getByText('Retry'));
    });

    await waitFor(() => {
      expect(screen.getByText('Agent')).toBeDefined();
    });
  });

  // -- Expand/collapse agent details ----------------------------------------
  it('expands agent details on click', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Coder Agent', role: 'coder', status: 'online', model: 'gpt-4', displayName: 'Coder Agent' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Coder Agent')).toBeDefined();
    });

    // Click to expand
    fireEvent.click(screen.getByLabelText('Toggle details for Coder Agent'));

    expect(screen.getByText('gpt-4')).toBeDefined(); // Model shown in details
  });

  it('collapses expanded agent on second click', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Coder Agent', role: 'coder', status: 'online', model: 'gpt-4', displayName: 'Coder Agent' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Coder Agent')).toBeDefined();
    });

    // Expand
    fireEvent.click(screen.getByLabelText('Toggle details for Coder Agent'));
    expect(screen.getByText('gpt-4')).toBeDefined();

    // Collapse
    fireEvent.click(screen.getByLabelText('Toggle details for Coder Agent'));
    // Model should no longer be visible in details section
    // (it may still be in the card badge, so check for the expanded view's specific text)
    const expandedDetails = screen.queryByText('Last Heartbeat');
    expect(expandedDetails).toBeNull();
  });

  // -- Wake button ----------------------------------------------------------
  it('shows Wake button only for offline agents', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Online', role: 'coder', status: 'online', model: 'gpt-4', displayName: 'Online Agent' },
      { id: 'a2', name: 'Offline', role: 'reviewer', status: 'offline', model: 'claude', displayName: 'Offline Agent' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Online Agent')).toBeDefined();
    });

    // Expand the offline agent
    fireEvent.click(screen.getByLabelText('Toggle details for Offline Agent'));

    const wakeButtons = screen.getAllByRole('button', { name: /Wake/ });
    expect(wakeButtons.length).toBe(1);
    expect(wakeButtons[0].getAttribute('aria-label')).toBe('Wake Offline Agent');
  });

  // -- API URL --------------------------------------------------------------
  it('calls the correct API endpoint', async () => {
    mockFetch.mockResolvedValue(emptyResponse());
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/agents/registry',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  // -- Polling --------------------------------------------------------------
  it('polls the registry every 10 seconds', async () => {
    mockFetch.mockResolvedValue(emptyResponse());
    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -- Accessibility --------------------------------------------------------
  it('has correct ARIA region label', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<AgentRegistryPanel />);

    expect(screen.getByRole('region', { name: 'Agent Registry Panel' })).toBeDefined();
  });

  it('has list role for agent cards', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Agent', role: 'agent', status: 'online', model: 'gpt-4' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Registered agents' })).toBeDefined();
    });
  });

  // -- Status badges --------------------------------------------------------
  it('renders status badges with correct text', async () => {
    mockFetch.mockResolvedValue(agentsResponse([
      { id: 'a1', name: 'Agent1', role: 'coder', status: 'online', model: 'gpt-4' },
      { id: 'a2', name: 'Agent2', role: 'reviewer', status: 'busy', model: 'claude' },
      { id: 'a3', name: 'Agent3', role: 'tester', status: 'error', model: 'llama' },
    ]));

    render(<AgentRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Agent1')).toBeDefined();
    });

    expect(screen.getByText('online')).toBeDefined();
    expect(screen.getByText('busy')).toBeDefined();
    expect(screen.getByText('error')).toBeDefined();
  });
});
