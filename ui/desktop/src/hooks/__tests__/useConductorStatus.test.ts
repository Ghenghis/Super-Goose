import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function conductorResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConductorStatus', () => {
  it('fetches conductor status on mount', async () => {
    fetchMock.mockResolvedValue(conductorResponse({
      running: true,
      children: [],
      lastHealthCheck: '2026-01-15T10:00:00Z',
      messageQueueSize: 5,
      taskQueueSize: 2,
    }));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    expect(result.current.status).not.toBeNull();
    expect(result.current.status?.running).toBe(true);
    expect(result.current.status?.messageQueueSize).toBe(5);
    expect(result.current.status?.taskQueueSize).toBe(2);
  });

  it('parses children from response', async () => {
    fetchMock.mockResolvedValue(conductorResponse({
      running: true,
      children: [
        { name: 'developer', pid: 1234, status: 'running', uptime: 3600 },
        { name: 'reviewer', pid: 5678, status: 'idle', uptime: 1800 },
      ],
      lastHealthCheck: '2026-01-15T10:00:00Z',
      messageQueueSize: 0,
      taskQueueSize: 0,
    }));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(result.current.status?.children).toHaveLength(2);
    });

    expect(result.current.status?.children[0].name).toBe('developer');
    expect(result.current.status?.children[0].pid).toBe(1234);
    expect(result.current.status?.children[0].status).toBe('running');
    expect(result.current.status?.children[0].uptime).toBe(3600);
    expect(result.current.status?.children[1].name).toBe('reviewer');
  });

  it('handles snake_case field names from backend', async () => {
    fetchMock.mockResolvedValue(conductorResponse({
      running: true,
      children: [],
      last_health_check: '2026-01-15T10:00:00Z',
      message_queue_size: 3,
      task_queue_size: 1,
    }));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(result.current.status?.messageQueueSize).toBe(3);
    });

    expect(result.current.status?.taskQueueSize).toBe(1);
  });

  it('sets connected to false when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      // Should have attempted the fetch
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it('sets connected to false on HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(result.current.connected).toBe(false);
  });

  it('polls at 5-second interval', async () => {
    fetchMock.mockResolvedValue(conductorResponse({
      running: true,
      children: [],
      lastHealthCheck: '',
      messageQueueSize: 0,
      taskQueueSize: 0,
    }));

    const { useConductorStatus } = await import('../useConductorStatus');
    renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Advance 5 seconds for next poll
    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Advance another 5 seconds
    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it('calls the correct API endpoint', async () => {
    fetchMock.mockResolvedValue(conductorResponse({ running: false, children: [] }));

    const { useConductorStatus } = await import('../useConductorStatus');
    renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3284/api/agents/conductor/status');
    });
  });

  it('cleans up interval on unmount', async () => {
    fetchMock.mockResolvedValue(conductorResponse({ running: true, children: [] }));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { unmount } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Advance time — should NOT trigger another fetch
    vi.advanceTimersByTime(10000);

    // Still only 1 call (no polling after unmount)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('defaults missing children to empty array', async () => {
    fetchMock.mockResolvedValue(conductorResponse({
      running: true,
      // no children field
    }));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(result.current.status).not.toBeNull();
    });

    expect(result.current.status?.children).toEqual([]);
  });

  it('defaults missing child fields gracefully', async () => {
    fetchMock.mockResolvedValue(conductorResponse({
      running: true,
      children: [{ /* empty child */ }],
    }));

    const { useConductorStatus } = await import('../useConductorStatus');
    const { result } = renderHook(() => useConductorStatus());

    await waitFor(() => {
      expect(result.current.status?.children).toHaveLength(1);
    });

    expect(result.current.status?.children[0].name).toBe('unknown');
    expect(result.current.status?.children[0].pid).toBe(0);
    expect(result.current.status?.children[0].status).toBe('unknown');
    expect(result.current.status?.children[0].uptime).toBe(0);
  });
});
