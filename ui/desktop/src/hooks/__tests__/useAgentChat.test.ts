import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

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

  class MockEventSource {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    close = vi.fn();
    constructor(url: string) {
      constructorCalls.push(url);
      mockInstance.url = url;
      mockInstance.close = this.close;
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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentChat', () => {
  it('connects to the agent chat SSE endpoint', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    renderHook(() => useAgentChat());
    expect(constructorCalls).toContain('http://localhost:3284/api/agents/chat/stream');
  });

  it('sets connected to true on open', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    expect(result.current.connected).toBe(false);
    act(() => { mockInstance.onopen?.(); });
    expect(result.current.connected).toBe(true);
  });

  it('sets connected to false on error', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    act(() => { mockInstance.onopen?.(); });
    expect(result.current.connected).toBe(true);

    act(() => { mockInstance.onerror?.(); });
    expect(result.current.connected).toBe(false);
  });

  it('dispatches agent_message events to messages list', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    const msg = {
      type: 'agent_message',
      id: 'msg-1',
      from: 'orchestrator',
      to: 'developer',
      channel: 'direct',
      priority: 'high',
      payload: 'Build the feature',
      timestamp: '2026-01-15T10:00:00Z',
      delivered: true,
      acknowledged: false,
    };

    act(() => { mockInstance.onmessage?.({ data: JSON.stringify(msg) }); });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].from).toBe('orchestrator');
    expect(result.current.messages[0].to).toBe('developer');
    expect(result.current.messages[0].payload).toBe('Build the feature');
  });

  it('dispatches agent_registry events to agents list', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    const registry = {
      type: 'agent_registry',
      agents: [
        { id: 'agent-1', role: 'developer', displayName: 'Developer Agent', status: 'online', model: 'claude-3-opus', lastHeartbeat: '2026-01-15T10:00:00Z' },
        { id: 'agent-2', role: 'reviewer', display_name: 'Reviewer Agent', status: 'busy', model: 'claude-3-sonnet', last_heartbeat: '2026-01-15T10:00:00Z' },
      ],
    };

    act(() => { mockInstance.onmessage?.({ data: JSON.stringify(registry) }); });

    expect(result.current.agents).toHaveLength(2);
    expect(result.current.agents[0].id).toBe('agent-1');
    expect(result.current.agents[0].displayName).toBe('Developer Agent');
    expect(result.current.agents[1].displayName).toBe('Reviewer Agent');
  });

  it('dispatches agent_status events to update agents', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    // First set up agents
    act(() => {
      mockInstance.onmessage?.({
        data: JSON.stringify({
          type: 'agent_registry',
          agents: [
            { id: 'a1', role: 'dev', displayName: 'Dev', status: 'online', model: 'opus', lastHeartbeat: '' },
          ],
        }),
      });
    });

    expect(result.current.agents[0].status).toBe('online');

    // Now update status
    act(() => {
      mockInstance.onmessage?.({
        data: JSON.stringify({ type: 'agent_status', agentId: 'a1', status: 'busy' }),
      });
    });

    expect(result.current.agents[0].status).toBe('busy');
  });

  it('ignores heartbeat and error event types', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    act(() => {
      mockInstance.onmessage?.({ data: JSON.stringify({ type: 'heartbeat' }) });
      mockInstance.onmessage?.({ data: JSON.stringify({ type: 'error', message: 'test' }) });
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.agents).toHaveLength(0);
  });

  it('skips malformed JSON gracefully', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    act(() => { mockInstance.onmessage?.({ data: 'not-json{{' }); });
    expect(result.current.messages).toHaveLength(0);
  });

  it('caps messages at MAX_MESSAGES (200)', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    act(() => {
      for (let i = 0; i < 210; i++) {
        mockInstance.onmessage?.({
          data: JSON.stringify({
            type: 'agent_message',
            id: `msg-${i}`,
            from: 'agent',
            payload: `Message ${i}`,
          }),
        });
      }
    });

    expect(result.current.messages.length).toBeLessThanOrEqual(200);
  });

  it('sendMessage adds optimistic message and calls fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage('agent-1', 'Hello!', 'direct');
    });

    // Optimistic local update
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].from).toBe('user');
    expect(result.current.messages[0].to).toBe('agent-1');
    expect(result.current.messages[0].payload).toBe('Hello!');

    // Should call fetch with POST
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3284/api/agents/chat/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ to: 'agent-1', content: 'Hello!', channel: 'direct' }),
      })
    );
  });

  it('wakeAgent calls fetch and sets agent to busy', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    // Set up agents first
    act(() => {
      mockInstance.onmessage?.({
        data: JSON.stringify({
          type: 'agent_registry',
          agents: [
            { id: 'a1', role: 'dev', displayName: 'Dev', status: 'offline', model: 'opus', lastHeartbeat: '' },
          ],
        }),
      });
    });

    await act(async () => {
      await result.current.wakeAgent('a1', 'Need help');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3284/api/agents/wake',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agentId: 'a1', reason: 'Need help' }),
      })
    );

    // Optimistic update to busy
    expect(result.current.agents[0].status).toBe('busy');
  });

  it('clearMessages resets the messages list', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    act(() => {
      mockInstance.onmessage?.({
        data: JSON.stringify({ type: 'agent_message', from: 'agent', payload: 'test' }),
      });
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => { result.current.clearMessages(); });
    expect(result.current.messages).toHaveLength(0);
  });

  it('closes EventSource on unmount', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { unmount } = renderHook(() => useAgentChat());

    unmount();
    expect(mockInstance.close).toHaveBeenCalled();
  });

  it('handles missing fields in agent_message gracefully', async () => {
    const { useAgentChat } = await import('../useAgentChat');
    const { result } = renderHook(() => useAgentChat());

    act(() => {
      mockInstance.onmessage?.({
        data: JSON.stringify({ type: 'agent_message' }),
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].from).toBe('unknown');
    expect(result.current.messages[0].to).toBe('all');
    expect(result.current.messages[0].channel).toBe('team');
  });
});
