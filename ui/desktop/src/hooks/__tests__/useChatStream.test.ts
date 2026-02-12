import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChatStream } from '../useChatStream';

// Mock the API module
vi.mock('../../api', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({ data: { name: 'test-session', conversation: [] } })
  ),
  reply: vi.fn(() =>
    Promise.resolve({
      stream: (async function* () {
        yield { type: 'Finish' };
      })(),
    })
  ),
  resumeAgent: vi.fn(() =>
    Promise.resolve({
      data: {
        session: {
          id: 'test-session-id',
          name: 'Test',
          conversation: [],
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          accumulated_input_tokens: 100,
          accumulated_output_tokens: 50,
          accumulated_total_tokens: 150,
        },
        extension_results: [],
      },
    })
  ),
  updateFromSession: vi.fn(() => Promise.resolve()),
  updateSessionUserRecipeValues: vi.fn(() => Promise.resolve()),
  listApps: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../utils/extensionErrorUtils', () => ({
  showExtensionLoadResults: vi.fn(),
}));

vi.mock('../../utils/platform_events', () => ({
  maybeHandlePlatformEvent: vi.fn(),
}));

vi.mock('../../utils/conversionUtils', () => ({
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

describe('useChatStream', () => {
  const onStreamFinish = vi.fn();
  const onSessionLoaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with Idle state and empty messages', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: '',
        onStreamFinish,
      })
    );

    // With empty sessionId, should stay at initial state
    expect(result.current.messages).toEqual([]);
    expect(result.current.chatState).toBeDefined();
  });

  it('loads session on mount when sessionId is provided', async () => {
    const { resumeAgent } = await import('../../api');

    const { result: _result } = renderHook(() =>
      useChatStream({
        sessionId: 'test-123',
        onStreamFinish,
        onSessionLoaded,
      })
    );

    await waitFor(() => {
      expect(resumeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            session_id: 'test-123',
          }),
        })
      );
    });
  });

  it('returns stopStreaming function', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: 'test-123',
        onStreamFinish,
      })
    );

    expect(typeof result.current.stopStreaming).toBe('function');
  });

  it('returns handleSubmit function', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: 'test-123',
        onStreamFinish,
      })
    );

    expect(typeof result.current.handleSubmit).toBe('function');
  });

  it('returns setChatState function', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: 'test-123',
        onStreamFinish,
      })
    );

    expect(typeof result.current.setChatState).toBe('function');
  });

  it('returns token state with initial values', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: '',
        onStreamFinish,
      })
    );

    expect(result.current.tokenState).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      accumulatedInputTokens: 0,
      accumulatedOutputTokens: 0,
      accumulatedTotalTokens: 0,
    });
  });

  it('returns notifications as a Map', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: '',
        onStreamFinish,
      })
    );

    expect(result.current.notifications).toBeInstanceOf(Map);
  });

  it('returns submitElicitationResponse function', () => {
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: 'test-123',
        onStreamFinish,
      })
    );

    expect(typeof result.current.submitElicitationResponse).toBe('function');
  });
});
