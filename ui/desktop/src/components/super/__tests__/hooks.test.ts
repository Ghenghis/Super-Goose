import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock getApiUrl so tests don't depend on hardcoded localhost:3284
vi.mock('../../../config', () => ({
  getApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

// ---------------------------------------------------------------------------
// useAgentStream tests
// ---------------------------------------------------------------------------

describe('useAgentStream', () => {
  let mockInstance: {
    url: string;
    onopen: (() => void) | null;
    onmessage: ((e: { data: string }) => void) | null;
    onerror: (() => void) | null;
    close: ReturnType<typeof vi.fn>;
  };

  let constructorCalls: string[];

  beforeEach(() => {
    constructorCalls = [];
    mockInstance = {
      url: '',
      onopen: null,
      onmessage: null,
      onerror: null,
      close: vi.fn(),
    };

    // Define a class that can be instantiated with `new`
    class MockEventSource {
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
      constructor(url: string) {
        constructorCalls.push(url);
        mockInstance.url = url;
        mockInstance.close = this.close;
        // Wire the instance so tests can trigger callbacks
        const self = this;
        Object.defineProperty(mockInstance, 'onopen', {
          get: () => self.onopen,
          set: (v) => { self.onopen = v; },
          configurable: true,
        });
        Object.defineProperty(mockInstance, 'onmessage', {
          get: () => self.onmessage,
          set: (v) => { self.onmessage = v; },
          configurable: true,
        });
        Object.defineProperty(mockInstance, 'onerror', {
          get: () => self.onerror,
          set: (v) => { self.onerror = v; },
          configurable: true,
        });
      }
    }
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('connects to the agent-stream SSE endpoint', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    renderHook(() => useAgentStream());
    expect(constructorCalls).toContain('http://localhost:3000/api/agent-stream');
  });

  it('sets connected to true on open', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    expect(result.current.connected).toBe(false);

    act(() => { mockInstance.onopen?.(); });

    expect(result.current.connected).toBe(true);
  });

  it('sets connected to false on error', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    act(() => { mockInstance.onopen?.(); });
    expect(result.current.connected).toBe(true);

    act(() => { mockInstance.onerror?.(); });
    expect(result.current.connected).toBe(false);
  });

  it('parses incoming events and appends to list', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    const event = { type: 'ToolCalled', tool_name: 'developer' };
    act(() => { mockInstance.onmessage?.({ data: JSON.stringify(event) }); });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].type).toBe('ToolCalled');
  });

  it('updates latestStatus on agent_status events', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    const statusEvent = { type: 'AgentStatus', core_type: 'FreeformCore' };
    act(() => { mockInstance.onmessage?.({ data: JSON.stringify(statusEvent) }); });

    expect(result.current.latestStatus).not.toBeNull();
    expect(result.current.latestStatus?.type).toBe('AgentStatus');
  });

  it('skips malformed JSON messages gracefully', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    act(() => { mockInstance.onmessage?.({ data: 'not-json{{{' }); });
    expect(result.current.events).toHaveLength(0);
  });

  it('clearEvents resets the event list', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    act(() => { mockInstance.onmessage?.({ data: JSON.stringify({ type: 'TaskUpdate' }) }); });
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.clearEvents(); });
    expect(result.current.events).toHaveLength(0);
  });

  it('closes EventSource on unmount', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { unmount } = renderHook(() => useAgentStream());

    unmount();
    expect(mockInstance.close).toHaveBeenCalled();
  });

  it('keeps only the last 100 events', async () => {
    const { useAgentStream } = await import('../../../hooks/useAgentStream');
    const { result } = renderHook(() => useAgentStream());

    // Push 105 events
    act(() => {
      for (let i = 0; i < 105; i++) {
        mockInstance.onmessage?.({ data: JSON.stringify({ type: 'ToolCalled', index: i }) });
      }
    });

    expect(result.current.events.length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// useSuperGooseData tests
// ---------------------------------------------------------------------------

describe('useSuperGooseData', () => {
  const mockLearningStats = {
    total_experiences: 42,
    success_rate: 0.85,
    total_skills: 10,
    verified_skills: 7,
    total_insights: 5,
    experiences_by_core: { FreeformCore: 30, StructuredCore: 12 },
  };

  const mockCostSummary = {
    total_spend: 1.23,
    session_spend: 0.45,
    budget_limit: 10.0,
    budget_remaining: 8.77,
    budget_warning_threshold: 0.8,
    is_over_budget: false,
    model_breakdown: [{ model: 'claude-3-opus', provider: 'anthropic', input_tokens: 5000, output_tokens: 2000, cost: 1.23 }],
  };

  const mockAutonomousStatus = {
    running: true,
    uptime_seconds: 7200,
    tasks_completed: 3,
    tasks_failed: 0,
    circuit_breaker: { state: 'closed', consecutive_failures: 0, max_failures: 3, last_failure: null },
    current_task: null,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fetches all data on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/learning/stats');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/cost/summary');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/autonomous/status');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/ota/status');
    });
  });

  it('populates learningStats when API responds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/learning/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockLearningStats) });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    const { result } = renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(result.current.learningStats).not.toBeNull();
      expect(result.current.learningStats?.total_experiences).toBe(42);
      expect(result.current.learningStats?.success_rate).toBe(0.85);
    });
  });

  it('populates costSummary when API responds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cost/summary')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCostSummary) });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    const { result } = renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(result.current.costSummary).not.toBeNull();
      expect(result.current.costSummary?.session_spend).toBe(0.45);
    });
  });

  it('populates autonomousStatus when API responds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/autonomous/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAutonomousStatus) });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    const { result } = renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(result.current.autonomousStatus).not.toBeNull();
      expect(result.current.autonomousStatus?.running).toBe(true);
      expect(result.current.autonomousStatus?.tasks_completed).toBe(3);
    });
  });

  it('handles network failures gracefully (all null)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    const { result } = renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.learningStats).toBeNull();
    expect(result.current.costSummary).toBeNull();
    expect(result.current.autonomousStatus).toBeNull();
  });

  it('sets loading to false after fetch completes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    const { result } = renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('refresh triggers a new fetch', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSuperGooseData } = await import('../../../hooks/useSuperGooseData');
    const { result } = renderHook(() => useSuperGooseData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCallCount = callCount;

    await act(async () => {
      await result.current.refresh();
    });

    expect(callCount).toBeGreaterThan(initialCallCount);
  });
});
