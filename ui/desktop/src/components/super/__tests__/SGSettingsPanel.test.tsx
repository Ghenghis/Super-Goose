import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SGSettingsPanel from '../SGSettingsPanel';

// Mock getApiUrl so tests don't depend on hardcoded localhost:3284
vi.mock('../../../config', () => ({
  getApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

// --- Mocks ----------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>;

/**
 * Helper: create a fetch mock that routes by URL.
 * features endpoint and learning/stats endpoint return { ok: false } by default.
 */
function createFetchMock(overrides: {
  features?: Response | (() => Promise<Response>);
  learningStats?: Response | (() => Promise<Response>);
  put?: Response | (() => Promise<Response>);
} = {}) {
  const defaultResponse = { ok: false } as Response;
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (opts?.method === 'PUT' && overrides.put) {
      const v = overrides.put;
      return typeof v === 'function' ? v() : Promise.resolve(v);
    }
    if (typeof url === 'string' && url.includes('/api/learning/stats') && overrides.learningStats) {
      const v = overrides.learningStats;
      return typeof v === 'function' ? v() : Promise.resolve(v);
    }
    if (typeof url === 'string' && url.includes('/api/features') && !url.includes('/api/features/') && overrides.features) {
      const v = overrides.features;
      return typeof v === 'function' ? v() : Promise.resolve(v);
    }
    return Promise.resolve(defaultResponse);
  });
}

beforeEach(() => {
  mockFetch = createFetchMock();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe('SGSettingsPanel', () => {
  // -- Feature Toggles section ----------------------------------------------
  it('renders Feature Toggles heading', () => {
    render(<SGSettingsPanel />);
    expect(screen.getByText('Feature Toggles')).toBeDefined();
  });

  it('renders all fallback feature toggles', () => {
    render(<SGSettingsPanel />);

    expect(screen.getByText('Experience Store')).toBeDefined();
    expect(screen.getByText('Skill Library')).toBeDefined();
    expect(screen.getByText('Auto Core Selection')).toBeDefined();
    expect(screen.getByText('Autonomous Mode')).toBeDefined();
    expect(screen.getByText('OTA Self-Update')).toBeDefined();
  });

  it('renders feature descriptions', () => {
    render(<SGSettingsPanel />);

    expect(screen.getByText('Cross-session learning')).toBeDefined();
    expect(screen.getByText('Reusable strategies')).toBeDefined();
    expect(screen.getByText('Auto-pick best core per task')).toBeDefined();
    expect(screen.getByText('24/7 agent daemon')).toBeDefined();
    expect(screen.getByText('Self-building pipeline')).toBeDefined();
  });

  it('renders toggle switches for each feature', () => {
    render(<SGSettingsPanel />);

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBe(5);
  });

  it('all toggles default to off (aria-checked=false)', () => {
    render(<SGSettingsPanel />);

    const switches = screen.getAllByRole('switch');
    switches.forEach(sw => {
      expect(sw.getAttribute('aria-checked')).toBe('false');
    });
  });

  // -- Toggle interaction ---------------------------------------------------
  it('toggles feature on click (optimistic update)', async () => {
    render(<SGSettingsPanel />);

    const expStoreToggle = screen.getByRole('switch', { name: 'Toggle Experience Store' });
    expect(expStoreToggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(expStoreToggle);

    expect(expStoreToggle.getAttribute('aria-checked')).toBe('true');
  });

  it('toggles feature off when clicked again', async () => {
    render(<SGSettingsPanel />);

    const toggle = screen.getByRole('switch', { name: 'Toggle Skill Library' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggles feature on keyboard Enter', () => {
    render(<SGSettingsPanel />);

    const toggle = screen.getByRole('switch', { name: 'Toggle Experience Store' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('toggles feature on keyboard Space', () => {
    render(<SGSettingsPanel />);

    const toggle = screen.getByRole('switch', { name: 'Toggle Experience Store' });
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  // -- API integration (when available) ------------------------------------
  it('fetches features from /api/features on mount', () => {
    render(<SGSettingsPanel />);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/features');
  });

  it('uses API features when fetch succeeds', async () => {
    mockFetch = createFetchMock({
      features: {
        ok: true,
        json: async () => ({
          features: [
            { name: 'Custom Feature', enabled: true, description: 'From API' },
            { name: 'Another Feature', enabled: false, description: 'Also from API' },
          ],
        }),
      } as unknown as Response,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SGSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Custom Feature')).toBeDefined();
      expect(screen.getByText('From API')).toBeDefined();
      expect(screen.getByText('Another Feature')).toBeDefined();
    });
  });

  it('sends PUT request when toggling with API available', async () => {
    mockFetch = createFetchMock({
      features: {
        ok: true,
        json: async () => ({
          features: [
            { name: 'TestFeature', enabled: false, description: 'Test' },
          ],
        }),
      } as unknown as Response,
      put: { ok: true } as Response,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SGSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('TestFeature')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle TestFeature' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/features/TestFeature',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        })
      );
    });
  });

  it('reverts toggle on PUT failure', async () => {
    mockFetch = createFetchMock({
      features: {
        ok: true,
        json: async () => ({
          features: [
            { name: 'RevertTest', enabled: false, description: 'Will fail' },
          ],
        }),
      } as unknown as Response,
      put: { ok: false } as Response,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SGSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('RevertTest')).toBeDefined();
    });

    const toggle = screen.getByRole('switch', { name: 'Toggle RevertTest' });
    fireEvent.click(toggle);

    // Optimistic: should be true
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    // After PUT fails: should revert to false
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('reverts toggle on network error', async () => {
    mockFetch = createFetchMock({
      features: {
        ok: true,
        json: async () => ({
          features: [
            { name: 'NetError', enabled: false, description: 'Will error' },
          ],
        }),
      } as unknown as Response,
      put: (() => Promise.reject(new Error('Network error'))) as unknown as Response,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SGSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('NetError')).toBeDefined();
    });

    const toggle = screen.getByRole('switch', { name: 'Toggle NetError' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  // -- Offline indicator ----------------------------------------------------
  it('shows (offline) badge when API is not available', () => {
    render(<SGSettingsPanel />);
    expect(screen.getByText('(offline)')).toBeDefined();
  });

  it('hides (offline) badge when API features load', async () => {
    mockFetch = createFetchMock({
      features: {
        ok: true,
        json: async () => ({
          features: [{ name: 'F1', enabled: false, description: '' }],
        }),
      } as unknown as Response,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SGSettingsPanel />);

    await waitFor(() => {
      expect(screen.queryByText('(offline)')).toBeNull();
    });
  });

  // -- Storage section ------------------------------------------------------
  it('renders Storage section', () => {
    render(<SGSettingsPanel />);

    expect(screen.getByText('Storage')).toBeDefined();
    expect(screen.getByText('Experience DB')).toBeDefined();
    expect(screen.getByText('Skills DB')).toBeDefined();
  });

  it('shows Not initialized when no learning stats', () => {
    render(<SGSettingsPanel />);

    const notInit = screen.getAllByText('Not initialized');
    expect(notInit.length).toBe(2);
  });

  it('shows learning stats when available', async () => {
    mockFetch = createFetchMock({
      learningStats: {
        ok: true,
        json: async () => ({
          total_experiences: 100,
          total_skills: 25,
          verified_skills: 10,
        }),
      } as unknown as Response,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SGSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('100 entries')).toBeDefined();
      expect(screen.getByText('25 skills (10 verified)')).toBeDefined();
    });
  });

  // -- Version section ------------------------------------------------------
  it('renders Version section', () => {
    render(<SGSettingsPanel />);

    expect(screen.getByText('Version')).toBeDefined();
    expect(screen.getByText('Super-Goose')).toBeDefined();
    expect(screen.getByText('v1.24.05')).toBeDefined();
  });

  // -- Graceful failure on API fetch ----------------------------------------
  it('keeps fallback toggles when fetch throws', async () => {
    mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);
    render(<SGSettingsPanel />);

    // All fallback toggles should still be visible
    await waitFor(() => {
      expect(screen.getByText('Experience Store')).toBeDefined();
      expect(screen.getByText('Autonomous Mode')).toBeDefined();
    });
  });
});
