import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTimeWarpEvents } from '../useTimeWarpEvents';

describe('useTimeWarpEvents', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns empty state when sessionId is null', () => {
    const { result } = renderHook(() => useTimeWarpEvents(null));
    expect(result.current.events).toEqual([]);
    expect(result.current.branches).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches events when sessionId is provided', async () => {
    const mockEvents = [
      {
        id: 'e1',
        session_id: 'sess-1',
        branch_id: 'main',
        event_type: 'message',
        label: 'Hello',
        detail: '',
        agent_id: null,
        timestamp: '2026-01-01T00:00:00Z',
        metadata: {},
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/timewarp/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: mockEvents }),
        });
      }
      if (url.includes('/api/timewarp/branches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ branches: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    expect(result.current.events[0].id).toBe('e1');
    expect(result.current.events[0].label).toBe('Hello');
  });

  it('handles 404 gracefully for missing timewarp route', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles network error gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.events).toEqual([]);
  });

  it('sets error on non-404 HTTP failures', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/timewarp/events')) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.error).toBe('HTTP 500');
    });
  });

  it('recordEvent sends POST and refreshes events', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/timewarp/events')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/timewarp/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: [] }),
        });
      }
      if (url.includes('/api/timewarp/branches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ branches: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.recordEvent({
        session_id: 'sess-1',
        branch_id: 'main',
        event_type: 'message',
        label: 'Test',
        detail: '',
        agent_id: null,
        metadata: {},
      });
    });

    expect(ok).toBe(true);
    // Should have called POST
    const postCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
      (c) => c[1]?.method === 'POST'
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('replayToEvent sends POST to replay endpoint', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/timewarp/replay')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/timewarp/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: [] }),
        });
      }
      if (url.includes('/api/timewarp/branches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ branches: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.replayToEvent('evt-5');
    });

    expect(ok).toBe(true);
  });

  it('createBranch sends POST with correct payload', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/timewarp/branches')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/timewarp/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: [] }),
        });
      }
      if (url.includes('/api/timewarp/branches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ branches: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useTimeWarpEvents('sess-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createBranch('experiment', 'evt-3');
    });

    expect(ok).toBe(true);
    const postCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
      (c) => c[1]?.method === 'POST' && c[0].includes('/api/timewarp/branches')
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(postCalls[0][1]?.body as string);
    expect(body.session_id).toBe('sess-1');
    expect(body.name).toBe('experiment');
    expect(body.fork_event_id).toBe('evt-3');
  });
});
