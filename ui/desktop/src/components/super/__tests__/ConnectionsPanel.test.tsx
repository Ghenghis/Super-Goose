import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConnectionsPanel from '../ConnectionsPanel';

// Mock getApiUrl so tests don't depend on hardcoded localhost:3284
vi.mock('../../../config', () => ({
  getApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

// --- Helpers ---------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe('ConnectionsPanel', () => {
  // -- Tab navigation -------------------------------------------------------
  it('renders three tabs: Services, Models, API Keys', () => {
    render(<ConnectionsPanel />);

    expect(screen.getByText('Services')).toBeDefined();
    expect(screen.getByText('Models')).toBeDefined();
    expect(screen.getByText('API Keys')).toBeDefined();
  });

  // -- Services tab (default) -----------------------------------------------
  it('renders service connections on Services tab by default', () => {
    render(<ConnectionsPanel />);

    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText('HuggingFace')).toBeDefined();
    expect(screen.getByText('Docker Hub')).toBeDefined();
    expect(screen.getByText('W&B')).toBeDefined();
  });

  it('shows Disconnected status and Connect button for services by default', () => {
    render(<ConnectionsPanel />);

    // All service connections default to disconnected with Connect button
    const connectButtons = screen.getAllByText('Connect');
    expect(connectButtons.length).toBeGreaterThanOrEqual(4);
  });

  // -- Models tab -----------------------------------------------------------
  it('switches to Models tab and shows model connections', () => {
    render(<ConnectionsPanel />);
    fireEvent.click(screen.getByText('Models'));

    expect(screen.getByText('Ollama')).toBeDefined();
    expect(screen.getByText('Claude')).toBeDefined();
    expect(screen.getByText('OpenAI')).toBeDefined();
  });

  // -- API Keys tab (empty) -------------------------------------------------
  it('shows coming soon on API Keys tab when no extensions loaded', () => {
    render(<ConnectionsPanel />);
    fireEvent.click(screen.getByText('API Keys'));

    expect(screen.getByText(/API key management.*coming soon/)).toBeDefined();
  });

  // -- Fetches extensions on mount ------------------------------------------
  it('fetches extensions from /config/extensions on mount', () => {
    render(<ConnectionsPanel />);

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/config/extensions');
  });

  // -- Extension data renders on API Keys tab -------------------------------
  it('renders extension list on API Keys tab when fetch succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        extensions: [
          { name: 'developer', enabled: true, type: 'builtin' },
          { name: 'computercontroller', enabled: false, type: 'builtin' },
        ],
      }),
    });

    render(<ConnectionsPanel />);

    // Wait for the async fetch to resolve
    await waitFor(() => {
      fireEvent.click(screen.getByText('API Keys'));
    });

    await waitFor(() => {
      expect(screen.getByText('developer')).toBeDefined();
      expect(screen.getByText('computercontroller')).toBeDefined();
    });
  });

  it('shows extension type on API Keys tab', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { name: 'my-tool', enabled: true, type: 'stdio' },
      ]),
    });

    render(<ConnectionsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText('API Keys'));
    });

    await waitFor(() => {
      expect(screen.getByText('my-tool')).toBeDefined();
      expect(screen.getByText('stdio')).toBeDefined();
    });
  });

  // -- Extension status merged into connections -----------------------------
  it('updates connection status when extension name matches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        extensions: [
          { name: 'github-connector', enabled: true, type: 'bundled' },
        ],
      }),
    });

    render(<ConnectionsPanel />);

    // Wait for fetch and state update
    await waitFor(() => {
      // GitHub should now show as connected
      expect(screen.getByText('Configure')).toBeDefined();
    });
  });

  // -- Connection status indicators -----------------------------------------
  it('shows Connected indicator for connected services', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        extensions: [
          { name: 'github-integration', enabled: true, type: 'bundled' },
        ],
      }),
    });

    render(<ConnectionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeDefined();
    });
  });

  // -- Graceful failure on fetch error --------------------------------------
  it('renders normally when fetch fails', () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<ConnectionsPanel />);

    // Should still render static connections
    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText('HuggingFace')).toBeDefined();
  });

  it('renders normally when fetch returns non-ok', () => {
    render(<ConnectionsPanel />);

    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText('Docker Hub')).toBeDefined();
  });

  // -- Tab switching preserves state ----------------------------------------
  it('can switch between all tabs', () => {
    render(<ConnectionsPanel />);

    // Start on Services
    expect(screen.getByText('GitHub')).toBeDefined();

    // Switch to Models
    fireEvent.click(screen.getByText('Models'));
    expect(screen.getByText('Ollama')).toBeDefined();

    // Switch to API Keys
    fireEvent.click(screen.getByText('API Keys'));
    expect(screen.getByText(/API key management.*coming soon/)).toBeDefined();

    // Switch back to Services
    fireEvent.click(screen.getByText('Services'));
    expect(screen.getByText('GitHub')).toBeDefined();
  });
});
