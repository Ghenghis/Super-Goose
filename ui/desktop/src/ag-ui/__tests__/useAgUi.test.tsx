/**
 * AG-UI Protocol — useAgUi hook tests
 *
 * Validates SSE connection lifecycle, event dispatching, state management,
 * tool call tracking, HITL approvals, reconnection with backoff, buffer
 * limits, and cleanup behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgUi } from '../useAgUi';

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // Store reference so tests can access it
    mockESInstances.push(this);
  }

  /** Simulate server opening the connection. */
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  /** Simulate a single SSE message with a JSON payload. */
  simulateEvent(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  /** Simulate multiple SSE messages in sequence. */
  simulateEvents(events: object[]) {
    for (const data of events) {
      this.simulateEvent(data);
    }
  }

  /** Simulate an SSE connection error. */
  simulateError() {
    this.readyState = 2;
    this.onerror?.({} as Event);
  }
}

/** Track all created MockEventSource instances for test assertions. */
let mockESInstances: MockEventSource[] = [];

/** Get the most recently created MockEventSource. */
function latestMockES(): MockEventSource {
  return mockESInstances[mockESInstances.length - 1];
}

// ---------------------------------------------------------------------------
// Stub globals
// ---------------------------------------------------------------------------

const originalEventSource = globalThis.EventSource;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  mockESInstances = [];

  // Stub EventSource globally
  vi.stubGlobal(
    'EventSource',
    class extends MockEventSource {
      constructor(url: string) {
        super(url);
      }
    },
  );

  // Stub fetch for tool-result POSTs
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.EventSource = originalEventSource;
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 1. Connection
// ---------------------------------------------------------------------------
describe('Connection', () => {
  it('connects to the correct SSE endpoint on mount', () => {
    renderHook(() => useAgUi());
    expect(mockESInstances).toHaveLength(1);
    expect(latestMockES().url).toBe('http://localhost:3284/api/ag-ui/stream');
  });

  it('sets connected: true when EventSource opens', () => {
    const { result } = renderHook(() => useAgUi());
    expect(result.current.connected).toBe(false);

    act(() => latestMockES().simulateOpen());
    expect(result.current.connected).toBe(true);
  });

  it('sets connected: false on error', () => {
    const { result } = renderHook(() => useAgUi());

    act(() => latestMockES().simulateOpen());
    expect(result.current.connected).toBe(true);

    act(() => latestMockES().simulateError());
    expect(result.current.connected).toBe(false);
  });

  it('starts with default state values', () => {
    const { result } = renderHook(() => useAgUi());
    expect(result.current.runId).toBeNull();
    expect(result.current.threadId).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.currentStep).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.agentState).toEqual({});
    expect(result.current.activeToolCalls.size).toBe(0);
    expect(result.current.pendingApprovals).toEqual([]);
    expect(result.current.activities).toEqual([]);
    expect(result.current.reasoningMessages).toEqual([]);
    expect(result.current.isReasoning).toBe(false);
    expect(result.current.customEvents).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Lifecycle events
// ---------------------------------------------------------------------------
describe('Lifecycle events', () => {
  it('RUN_STARTED sets runId, threadId, isRunning', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'RUN_STARTED',
        runId: 'run-42',
        threadId: 'thread-7',
      }),
    );

    expect(result.current.runId).toBe('run-42');
    expect(result.current.threadId).toBe('thread-7');
    expect(result.current.isRunning).toBe(true);
  });

  it('RUN_FINISHED clears isRunning and currentStep', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'RUN_STARTED',
        runId: 'run-1',
        threadId: 't-1',
      });
      latestMockES().simulateEvent({
        type: 'STEP_STARTED',
        stepName: 'analysis',
      });
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.currentStep).toBe('analysis');

    act(() => latestMockES().simulateEvent({ type: 'RUN_FINISHED' }));

    expect(result.current.isRunning).toBe(false);
    expect(result.current.currentStep).toBeNull();
  });

  it('RUN_ERROR sets error and clears isRunning', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'RUN_STARTED',
        runId: 'r-1',
        threadId: 't-1',
      }),
    );
    expect(result.current.isRunning).toBe(true);

    act(() =>
      latestMockES().simulateEvent({
        type: 'RUN_ERROR',
        message: 'Out of memory',
        code: 'OOM',
      }),
    );

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Out of memory');
  });

  it('STEP_STARTED and STEP_FINISHED update currentStep', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'STEP_STARTED',
        stepName: 'data-fetch',
      }),
    );
    expect(result.current.currentStep).toBe('data-fetch');

    act(() =>
      latestMockES().simulateEvent({
        type: 'STEP_FINISHED',
        stepName: 'data-fetch',
      }),
    );
    expect(result.current.currentStep).toBeNull();
  });

  it('RUN_STARTED clears previous error', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    // First run errors
    act(() =>
      latestMockES().simulateEvent({ type: 'RUN_ERROR', message: 'fail' }),
    );
    expect(result.current.error).not.toBeNull();

    // New run clears the error
    act(() =>
      latestMockES().simulateEvent({
        type: 'RUN_STARTED',
        runId: 'r-2',
        threadId: 't-2',
      }),
    );
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Text messages
// ---------------------------------------------------------------------------
describe('Text messages', () => {
  it('TEXT_MESSAGE_START creates a new streaming message', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
        role: 'agent',
      }),
    );

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].messageId).toBe('msg-1');
    expect(result.current.messages[0].content).toBe('');
    expect(result.current.messages[0].streaming).toBe(true);
  });

  it('TEXT_MESSAGE_CONTENT accumulates text', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        content: 'Hello ',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        content: 'World!',
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello World!');
    expect(result.current.messages[0].streaming).toBe(true);
  });

  it('TEXT_MESSAGE_END sets streaming to false', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        content: 'Done',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_END',
        messageId: 'msg-1',
      });
    });

    expect(result.current.messages[0].content).toBe('Done');
    expect(result.current.messages[0].streaming).toBe(false);
  });

  it('TEXT_MESSAGE_CONTENT for unknown messageId is a no-op', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'nonexistent',
        content: 'ghost',
      }),
    );

    expect(result.current.messages).toHaveLength(0);
  });

  it('multiple messages tracked independently', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        content: 'First',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-2',
      });
      latestMockES().simulateEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-2',
        content: 'Second',
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe('First');
    expect(result.current.messages[1].content).toBe('Second');
  });
});

// ---------------------------------------------------------------------------
// 4. Tool calls
// ---------------------------------------------------------------------------
describe('Tool calls', () => {
  it('TOOL_CALL_START adds to activeToolCalls', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'developer',
        args: '{"action":"create"}',
      }),
    );

    expect(result.current.activeToolCalls.size).toBe(1);
    const tc = result.current.activeToolCalls.get('tc-1');
    expect(tc).toBeDefined();
    expect(tc!.toolCallName).toBe('developer');
    expect(tc!.args).toBe('{"action":"create"}');
    expect(tc!.status).toBe('active');
  });

  it('TOOL_CALL_ARGS appends to existing args', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'search',
        args: '{"query":',
      });
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'tc-1',
        args: '"hello"}',
      });
    });

    const tc = result.current.activeToolCalls.get('tc-1');
    expect(tc!.args).toBe('{"query":"hello"}');
  });

  it('TOOL_CALL_ARGS for unknown toolCallId is a no-op', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'nonexistent',
        args: 'data',
      }),
    );

    expect(result.current.activeToolCalls.size).toBe(0);
  });

  it('TOOL_CALL_END marks tool call as completed', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        result: 'file contents here',
      });
    });

    const tc = result.current.activeToolCalls.get('tc-1');
    expect(tc!.status).toBe('completed');
    expect(tc!.result).toBe('file contents here');
  });

  it('TOOL_CALL_END with error marks status as error', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'dangerous',
      });
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        error: 'Permission denied',
      });
    });

    const tc = result.current.activeToolCalls.get('tc-1');
    expect(tc!.status).toBe('error');
    expect(tc!.result).toBe('Permission denied');
  });

  it('multiple tool calls tracked independently', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'search',
      });
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-2',
        toolCallName: 'read_file',
      });
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        result: 'found',
      });
    });

    expect(result.current.activeToolCalls.size).toBe(2);
    expect(result.current.activeToolCalls.get('tc-1')!.status).toBe('completed');
    expect(result.current.activeToolCalls.get('tc-2')!.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// 5. HITL approvals
// ---------------------------------------------------------------------------
describe('HITL approvals', () => {
  it('request_approval tool call appears in pendingApprovals', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-approval-1',
        toolCallName: 'request_approval',
        args: '{"action":"delete_file","path":"/important.txt"}',
      }),
    );

    expect(result.current.pendingApprovals).toHaveLength(1);
    expect(result.current.pendingApprovals[0].toolCallId).toBe('tc-approval-1');
    expect(result.current.pendingApprovals[0].toolCallName).toBe('request_approval');
    expect(result.current.pendingApprovals[0].args).toBe(
      '{"action":"delete_file","path":"/important.txt"}',
    );
  });

  it('non-approval tool calls do not appear in pendingApprovals', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      }),
    );

    expect(result.current.pendingApprovals).toHaveLength(0);
  });

  it('approveToolCall sends POST and removes from pending', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-a1',
        toolCallName: 'request_approval',
        args: '{}',
      }),
    );
    expect(result.current.pendingApprovals).toHaveLength(1);

    act(() => result.current.approveToolCall('tc-a1'));

    expect(result.current.pendingApprovals).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3284/api/ag-ui/tool-result',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // Verify the body contains approved: true
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.toolCallId).toBe('tc-a1');
    expect(JSON.parse(body.content).approved).toBe(true);
  });

  it('rejectToolCall sends POST with approved: false', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-a2',
        toolCallName: 'request_approval',
        args: '{}',
      }),
    );

    act(() => result.current.rejectToolCall('tc-a2'));

    expect(result.current.pendingApprovals).toHaveLength(0);
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(JSON.parse(body.content).approved).toBe(false);
  });

  it('multiple pending approvals tracked and removed individually', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-a1',
        toolCallName: 'request_approval',
        args: '{"action":"delete"}',
      });
      latestMockES().simulateEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-a2',
        toolCallName: 'request_approval',
        args: '{"action":"format"}',
      });
    });

    expect(result.current.pendingApprovals).toHaveLength(2);

    act(() => result.current.approveToolCall('tc-a1'));
    expect(result.current.pendingApprovals).toHaveLength(1);
    expect(result.current.pendingApprovals[0].toolCallId).toBe('tc-a2');
  });
});

// ---------------------------------------------------------------------------
// 6. State management
// ---------------------------------------------------------------------------
describe('State management', () => {
  it('STATE_SNAPSHOT replaces agentState', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_SNAPSHOT',
        snapshot: { count: 10, status: 'active' },
      }),
    );

    expect(result.current.agentState).toEqual({ count: 10, status: 'active' });
  });

  it('STATE_SNAPSHOT with new data replaces previous state entirely', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_SNAPSHOT',
        snapshot: { a: 1, b: 2 },
      }),
    );

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_SNAPSHOT',
        snapshot: { c: 3 },
      }),
    );

    // Previous keys (a, b) should be gone
    expect(result.current.agentState).toEqual({ c: 3 });
  });

  it('STATE_DELTA applies JSON patch operations', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    // Set initial state
    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_SNAPSHOT',
        snapshot: { count: 5, items: ['a', 'b'] },
      }),
    );

    // Apply delta
    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_DELTA',
        delta: [
          { op: 'replace', path: '/count', value: 10 },
          { op: 'add', path: '/items/-', value: 'c' },
        ],
      }),
    );

    expect(result.current.agentState.count).toBe(10);
    expect(result.current.agentState.items).toEqual(['a', 'b', 'c']);
  });

  it('STATE_DELTA with remove operation deletes key', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_SNAPSHOT',
        snapshot: { keep: 'yes', remove: 'me' },
      }),
    );

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_DELTA',
        delta: [{ op: 'remove', path: '/remove' }],
      }),
    );

    expect(result.current.agentState).toEqual({ keep: 'yes' });
  });

  it('STATE_DELTA with empty array is a no-op', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_SNAPSHOT',
        snapshot: { value: 42 },
      }),
    );

    act(() =>
      latestMockES().simulateEvent({
        type: 'STATE_DELTA',
        delta: [],
      }),
    );

    expect(result.current.agentState).toEqual({ value: 42 });
  });
});

// ---------------------------------------------------------------------------
// 7. Activity
// ---------------------------------------------------------------------------
describe('Activity', () => {
  it('ACTIVITY event adds to activities buffer', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'ACTIVITY',
        id: 'act-1',
        message: 'Searching files...',
        level: 'info',
      }),
    );

    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].id).toBe('act-1');
    expect(result.current.activities[0].message).toBe('Searching files...');
    expect(result.current.activities[0].level).toBe('info');
  });

  it('ACTIVITY with metadata is preserved', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'ACTIVITY',
        id: 'act-2',
        message: 'Found results',
        level: 'info',
        metadata: { count: 5, source: 'web' },
      }),
    );

    expect(result.current.activities[0].metadata).toEqual({
      count: 5,
      source: 'web',
    });
  });

  it('activities default to info level', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'ACTIVITY',
        id: 'act-3',
        message: 'Something happened',
      }),
    );

    expect(result.current.activities[0].level).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// 8. Reasoning
// ---------------------------------------------------------------------------
describe('Reasoning events', () => {
  it('REASONING_START creates new reasoning item and sets isReasoning', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'REASONING_START',
        reasoningId: 'r-1',
      }),
    );

    expect(result.current.isReasoning).toBe(true);
    expect(result.current.reasoningMessages).toHaveLength(1);
    expect(result.current.reasoningMessages[0].id).toBe('r-1');
    expect(result.current.reasoningMessages[0].content).toBe('');
    expect(result.current.reasoningMessages[0].streaming).toBe(true);
  });

  it('REASONING_MESSAGE_CONTENT appends to reasoning message', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'REASONING_START',
        reasoningId: 'r-1',
      });
      latestMockES().simulateEvent({
        type: 'REASONING_MESSAGE_CONTENT',
        reasoningId: 'r-1',
        content: 'Let me think ',
      });
      latestMockES().simulateEvent({
        type: 'REASONING_MESSAGE_CONTENT',
        reasoningId: 'r-1',
        content: 'about this...',
      });
    });

    expect(result.current.reasoningMessages[0].content).toBe(
      'Let me think about this...',
    );
  });

  it('REASONING_MESSAGE_END sets streaming to false, REASONING_END sets isReasoning to false', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'REASONING_START',
        reasoningId: 'r-1',
      });
      latestMockES().simulateEvent({
        type: 'REASONING_MESSAGE_CONTENT',
        reasoningId: 'r-1',
        content: 'Done thinking',
      });
      latestMockES().simulateEvent({
        type: 'REASONING_MESSAGE_END',
        reasoningId: 'r-1',
      });
      latestMockES().simulateEvent({
        type: 'REASONING_END',
      });
    });

    expect(result.current.isReasoning).toBe(false);
    expect(result.current.reasoningMessages[0].streaming).toBe(false);
    expect(result.current.reasoningMessages[0].content).toBe('Done thinking');
  });

  it('REASONING_MESSAGE_CONTENT for unknown reasoningId is a no-op', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'REASONING_MESSAGE_CONTENT',
        reasoningId: 'nonexistent',
        content: 'ghost',
      }),
    );

    expect(result.current.reasoningMessages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Custom events
// ---------------------------------------------------------------------------
describe('Custom events', () => {
  it('CUSTOM event is buffered correctly', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'CUSTOM',
        name: 'telemetry',
        value: { latencyMs: 42 },
      }),
    );

    expect(result.current.customEvents).toHaveLength(1);
    expect(result.current.customEvents[0].name).toBe('telemetry');
    expect(result.current.customEvents[0].value).toEqual({ latencyMs: 42 });
  });

  it('multiple custom events accumulate', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      latestMockES().simulateEvent({
        type: 'CUSTOM',
        name: 'event-a',
        value: 1,
      });
      latestMockES().simulateEvent({
        type: 'CUSTOM',
        name: 'event-b',
        value: 2,
      });
      latestMockES().simulateEvent({
        type: 'CUSTOM',
        name: 'event-c',
        value: 3,
      });
    });

    expect(result.current.customEvents).toHaveLength(3);
    expect(result.current.customEvents.map((e) => e.name)).toEqual([
      'event-a',
      'event-b',
      'event-c',
    ]);
  });

  it('CUSTOM event defaults name to "unknown" when missing', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'CUSTOM',
        value: 'no name',
      }),
    );

    expect(result.current.customEvents[0].name).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 10. Reconnection with backoff
// ---------------------------------------------------------------------------
describe('Reconnection', () => {
  it('reconnects after error with exponential backoff', () => {
    renderHook(() => useAgUi());
    expect(mockESInstances).toHaveLength(1);

    // Simulate error (first retry is 1000ms)
    act(() => latestMockES().simulateError());

    // Before 1000ms: no reconnect yet
    act(() => vi.advanceTimersByTime(999));
    expect(mockESInstances).toHaveLength(1);

    // After 1000ms: reconnect
    act(() => vi.advanceTimersByTime(1));
    expect(mockESInstances).toHaveLength(2);

    // Second error: retry at 2000ms
    act(() => mockESInstances[1].simulateError());
    act(() => vi.advanceTimersByTime(1999));
    expect(mockESInstances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(mockESInstances).toHaveLength(3);
  });

  it('resets backoff delay on successful connection', () => {
    renderHook(() => useAgUi());

    // Error -> reconnect after 1000ms
    act(() => latestMockES().simulateError());
    act(() => vi.advanceTimersByTime(1000));
    expect(mockESInstances).toHaveLength(2);

    // Error again -> would be 2000ms, but first successfully open
    act(() => mockESInstances[1].simulateOpen());
    // Then error
    act(() => mockESInstances[1].simulateError());
    // Should be back to 1000ms (reset backoff)
    act(() => vi.advanceTimersByTime(1000));
    expect(mockESInstances).toHaveLength(3);
  });

  it('reconnect() method resets and reconnects immediately', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    const initialInstanceCount = mockESInstances.length;

    act(() => result.current.reconnect());

    expect(mockESInstances.length).toBe(initialInstanceCount + 1);
  });

  it('backoff is capped at 30000ms', () => {
    renderHook(() => useAgUi());

    // Trigger multiple errors to push backoff to max
    // Delays: 1000, 2000, 4000, 8000, 16000, 30000 (capped), 30000
    for (let i = 0; i < 6; i++) {
      act(() => latestMockES().simulateError());
      const delay = Math.min(1000 * Math.pow(2, i), 30000);
      act(() => vi.advanceTimersByTime(delay));
    }

    const countBefore = mockESInstances.length;

    // Next error should also use 30000ms (capped)
    act(() => latestMockES().simulateError());
    act(() => vi.advanceTimersByTime(29999));
    expect(mockESInstances.length).toBe(countBefore);
    act(() => vi.advanceTimersByTime(1));
    expect(mockESInstances.length).toBe(countBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// 11. Cleanup on unmount
// ---------------------------------------------------------------------------
describe('Cleanup', () => {
  it('EventSource.close() is called on unmount', () => {
    const { unmount } = renderHook(() => useAgUi());
    const es = latestMockES();

    unmount();

    expect(es.close).toHaveBeenCalled();
  });

  it('pending reconnect timer is cleared on unmount', () => {
    const { unmount } = renderHook(() => useAgUi());

    // Trigger an error to schedule a reconnect
    act(() => latestMockES().simulateError());

    const instancesBeforeUnmount = mockESInstances.length;
    unmount();

    // Advance time past the reconnect delay
    act(() => vi.advanceTimersByTime(5000));

    // No new EventSource should be created after unmount
    expect(mockESInstances.length).toBe(instancesBeforeUnmount);
  });

  it('events after unmount are ignored', () => {
    const { result: _result, unmount } = renderHook(() => useAgUi());
    const es = latestMockES();
    act(() => es.simulateOpen());

    unmount();

    // Simulate events after unmount -- should not throw or update state
    // (mountedRef.current is false, so callbacks bail early)
    expect(() => {
      es.simulateEvent({
        type: 'RUN_STARTED',
        runId: 'r-ghost',
        threadId: 't-ghost',
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 12. Buffer limits
// ---------------------------------------------------------------------------
describe('Buffer limits', () => {
  it('messages are capped at 100', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    // Add 105 messages
    act(() => {
      for (let i = 0; i < 105; i++) {
        latestMockES().simulateEvent({
          type: 'TEXT_MESSAGE_START',
          messageId: `msg-${i}`,
        });
      }
    });

    expect(result.current.messages.length).toBeLessThanOrEqual(100);
    // Most recent message should be the last one added
    expect(result.current.messages[result.current.messages.length - 1].messageId).toBe(
      'msg-104',
    );
  });

  it('activities are capped at 50', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      for (let i = 0; i < 55; i++) {
        latestMockES().simulateEvent({
          type: 'ACTIVITY',
          id: `act-${i}`,
          message: `Activity ${i}`,
          level: 'info',
        });
      }
    });

    expect(result.current.activities.length).toBeLessThanOrEqual(50);
    expect(
      result.current.activities[result.current.activities.length - 1].id,
    ).toBe('act-54');
  });

  it('reasoning messages are capped at 20', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      for (let i = 0; i < 25; i++) {
        latestMockES().simulateEvent({
          type: 'REASONING_START',
          reasoningId: `r-${i}`,
        });
      }
    });

    expect(result.current.reasoningMessages.length).toBeLessThanOrEqual(20);
    expect(
      result.current.reasoningMessages[
        result.current.reasoningMessages.length - 1
      ].id,
    ).toBe('r-24');
  });

  it('custom events are capped at 50', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() => {
      for (let i = 0; i < 55; i++) {
        latestMockES().simulateEvent({
          type: 'CUSTOM',
          name: `evt-${i}`,
          value: i,
        });
      }
    });

    expect(result.current.customEvents.length).toBeLessThanOrEqual(50);
    expect(
      result.current.customEvents[result.current.customEvents.length - 1].name,
    ).toBe('evt-54');
  });
});

// ---------------------------------------------------------------------------
// 13. Multiple rapid events (batch processing)
// ---------------------------------------------------------------------------
describe('Multiple rapid events', () => {
  it('processes a full message lifecycle in one batch', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvents([
        { type: 'RUN_STARTED', runId: 'r-1', threadId: 't-1' },
        { type: 'STEP_STARTED', stepName: 'generate' },
        { type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'agent' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', content: 'Hello ' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', content: 'World!' },
        { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
        { type: 'STEP_FINISHED', stepName: 'generate' },
        { type: 'RUN_FINISHED' },
      ]),
    );

    expect(result.current.runId).toBe('r-1');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.currentStep).toBeNull();
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello World!');
    expect(result.current.messages[0].streaming).toBe(false);
  });

  it('handles interleaved tool calls and messages', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvents([
        { type: 'RUN_STARTED', runId: 'r-1', threadId: 't-1' },
        { type: 'TEXT_MESSAGE_START', messageId: 'msg-1' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', content: 'Let me ' },
        { type: 'TOOL_CALL_START', toolCallId: 'tc-1', toolCallName: 'search' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'tc-1', args: '{"q":"test"}' },
        { type: 'TOOL_CALL_END', toolCallId: 'tc-1', result: 'found' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', content: 'search.' },
        { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
        { type: 'RUN_FINISHED' },
      ]),
    );

    expect(result.current.messages[0].content).toBe('Let me search.');
    expect(result.current.activeToolCalls.get('tc-1')!.status).toBe('completed');
    expect(result.current.isRunning).toBe(false);
  });

  it('handles mixed event types in rapid succession', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvents([
        { type: 'RUN_STARTED', runId: 'r-1', threadId: 't-1' },
        { type: 'STATE_SNAPSHOT', snapshot: { mode: 'active' } },
        { type: 'ACTIVITY', id: 'a-1', message: 'Starting', level: 'info' },
        { type: 'REASONING_START', reasoningId: 'cot-1' },
        { type: 'REASONING_MESSAGE_CONTENT', reasoningId: 'cot-1', content: 'Thinking' },
        { type: 'REASONING_MESSAGE_END', reasoningId: 'cot-1' },
        { type: 'REASONING_END' },
        { type: 'CUSTOM', name: 'timing', value: { ms: 100 } },
        { type: 'TEXT_MESSAGE_START', messageId: 'msg-1' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', content: 'Result' },
        { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
        { type: 'RUN_FINISHED' },
      ]),
    );

    expect(result.current.agentState).toEqual({ mode: 'active' });
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.reasoningMessages).toHaveLength(1);
    expect(result.current.reasoningMessages[0].content).toBe('Thinking');
    expect(result.current.isReasoning).toBe(false);
    expect(result.current.customEvents).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Result');
    expect(result.current.isRunning).toBe(false);
  });

  it('malformed JSON messages are silently skipped', () => {
    const { result } = renderHook(() => useAgUi());
    const es = latestMockES();
    act(() => es.simulateOpen());

    // Send a malformed message directly (not via simulateEvent which auto-serializes)
    act(() => {
      es.onmessage?.({ data: 'not valid json {{{' } as MessageEvent);
    });

    // State should remain unchanged
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('unknown event types are silently ignored', () => {
    const { result } = renderHook(() => useAgUi());
    act(() => latestMockES().simulateOpen());

    act(() =>
      latestMockES().simulateEvent({
        type: 'UNKNOWN_FUTURE_EVENT',
        data: 'some data',
      }),
    );

    // No crash, state unchanged
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isRunning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14. Return type completeness
// ---------------------------------------------------------------------------
describe('Return type completeness', () => {
  it('exposes all expected state fields and actions', () => {
    const { result } = renderHook(() => useAgUi());
    const ret = result.current;

    // Connection
    expect(typeof ret.connected).toBe('boolean');
    expect(ret.error === null || ret.error instanceof Error).toBe(true);

    // Lifecycle
    expect(ret.runId === null || typeof ret.runId === 'string').toBe(true);
    expect(ret.threadId === null || typeof ret.threadId === 'string').toBe(true);
    expect(typeof ret.isRunning).toBe('boolean');
    expect(ret.currentStep === null || typeof ret.currentStep === 'string').toBe(true);

    // Collections
    expect(Array.isArray(ret.messages)).toBe(true);
    expect(typeof ret.agentState).toBe('object');
    expect(ret.activeToolCalls instanceof Map).toBe(true);
    expect(Array.isArray(ret.pendingApprovals)).toBe(true);
    expect(Array.isArray(ret.activities)).toBe(true);
    expect(Array.isArray(ret.reasoningMessages)).toBe(true);
    expect(typeof ret.isReasoning).toBe('boolean');
    expect(Array.isArray(ret.customEvents)).toBe(true);

    // Actions
    expect(typeof ret.approveToolCall).toBe('function');
    expect(typeof ret.rejectToolCall).toBe('function');
    expect(typeof ret.reconnect).toBe('function');
  });
});
