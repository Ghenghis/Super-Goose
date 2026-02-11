import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContextManagement } from '../useContextManagement';
import { ChatState } from '../../types/chatState';
import type { TokenState } from '../../api/types.gen';

const mockLocalStorageGetItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const mockLocalStorageSetItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;

describe('useContextManagement', () => {
  const defaultTokenState: TokenState = {
    accumulatedInputTokens: 0,
    accumulatedOutputTokens: 0,
    accumulatedTotalTokens: 50000,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
  };

  const defaultProps = {
    tokenState: defaultTokenState,
    messages: [] as Array<{ id: string; role: string; created: number; content: never[]; metadata: { agentVisible: boolean; userVisible: boolean } }>,
    chatState: ChatState.Idle,
    contextWindowSize: 128000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorageGetItem.mockReturnValue(null);
  });

  // -------------------------------------------------------------------------
  // Token usage calculation
  // -------------------------------------------------------------------------

  it('computes tokenUsage.current from accumulatedTotalTokens', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    expect(result.current.tokenUsage.current).toBe(50000);
  });

  it('falls back to totalTokens when accumulatedTotalTokens is 0', () => {
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        tokenState: { ...defaultTokenState, accumulatedTotalTokens: 0 },
      })
    );

    // accumulatedTotalTokens is 0 which is falsy, so it uses totalTokens
    expect(result.current.tokenUsage.current).toBe(150);
  });

  it('computes tokenUsage.max from contextWindowSize', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    expect(result.current.tokenUsage.max).toBe(128000);
  });

  it('computes tokenUsage.percentage correctly', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    // 50000 / 128000 * 100 = ~39.06 => rounded to 39
    expect(result.current.tokenUsage.percentage).toBe(39);
  });

  it('caps tokenUsage.percentage at 100', () => {
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        tokenState: { ...defaultTokenState, accumulatedTotalTokens: 200000 },
      })
    );

    expect(result.current.tokenUsage.percentage).toBe(100);
  });

  it('uses DEFAULT_CONTEXT_WINDOW of 128000 when contextWindowSize is not provided', () => {
    const { result } = renderHook(() =>
      useContextManagement({
        tokenState: defaultTokenState,
        messages: [],
        chatState: ChatState.Idle,
      })
    );

    expect(result.current.tokenUsage.max).toBe(128000);
  });

  // -------------------------------------------------------------------------
  // messageCount
  // -------------------------------------------------------------------------

  it('returns the correct messageCount', () => {
    const messages = [
      { id: '1', role: 'user', created: 1, content: [], metadata: { agentVisible: true, userVisible: true } },
      { id: '2', role: 'assistant', created: 2, content: [], metadata: { agentVisible: true, userVisible: true } },
    ] as typeof defaultProps.messages;

    const { result } = renderHook(() =>
      useContextManagement({ ...defaultProps, messages })
    );

    expect(result.current.messageCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // isCompacting
  // -------------------------------------------------------------------------

  it('returns isCompacting as true when chatState is Compacting', () => {
    const { result } = renderHook(() =>
      useContextManagement({ ...defaultProps, chatState: ChatState.Compacting })
    );

    expect(result.current.isCompacting).toBe(true);
  });

  it('returns isCompacting as false when chatState is Idle', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    expect(result.current.isCompacting).toBe(false);
  });

  // -------------------------------------------------------------------------
  // canCompact
  // -------------------------------------------------------------------------

  it('returns canCompact as false when percentage is below threshold (50%)', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    // 39% < 50%
    expect(result.current.canCompact).toBe(false);
  });

  it('returns canCompact as true when percentage is at or above threshold', () => {
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        tokenState: { ...defaultTokenState, accumulatedTotalTokens: 70000 },
      })
    );

    // 70000 / 128000 = ~54.7% >= 50%
    expect(result.current.canCompact).toBe(true);
  });

  it('returns canCompact as false when compacting even if above threshold', () => {
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        tokenState: { ...defaultTokenState, accumulatedTotalTokens: 70000 },
        chatState: ChatState.Compacting,
      })
    );

    expect(result.current.canCompact).toBe(false);
  });

  // -------------------------------------------------------------------------
  // autoCompactEnabled
  // -------------------------------------------------------------------------

  it('starts with autoCompactEnabled as false when localStorage is empty', () => {
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() => useContextManagement(defaultProps));

    expect(result.current.autoCompactEnabled).toBe(false);
  });

  it('starts with autoCompactEnabled as true when localStorage has "true"', () => {
    mockLocalStorageGetItem.mockReturnValue('true');

    const { result } = renderHook(() => useContextManagement(defaultProps));

    expect(result.current.autoCompactEnabled).toBe(true);
  });

  it('setAutoCompactEnabled updates the value and persists to localStorage', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    act(() => {
      result.current.setAutoCompactEnabled(true);
    });

    expect(result.current.autoCompactEnabled).toBe(true);
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith('goose-auto-compact-enabled', 'true');
  });

  // -------------------------------------------------------------------------
  // compactionHistory
  // -------------------------------------------------------------------------

  it('starts with empty compactionHistory', () => {
    const { result } = renderHook(() => useContextManagement(defaultProps));

    expect(result.current.compactionHistory).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // compact()
  // -------------------------------------------------------------------------

  it('compact() calls onSendMessage when canCompact is true', async () => {
    const onSendMessage = vi.fn();
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        tokenState: { ...defaultTokenState, accumulatedTotalTokens: 70000 },
        onSendMessage,
      })
    );

    await act(async () => {
      await result.current.compact();
    });

    expect(onSendMessage).toHaveBeenCalledWith(
      'Please compact and summarize the conversation to reduce context usage while preserving key information.'
    );
  });

  it('compact() does nothing when canCompact is false', async () => {
    const onSendMessage = vi.fn();
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        onSendMessage,
      })
    );

    await act(async () => {
      await result.current.compact();
    });

    // canCompact is false (39% < 50%), so onSendMessage should not be called
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('compact() does nothing when onSendMessage is not provided', async () => {
    const { result } = renderHook(() =>
      useContextManagement({
        ...defaultProps,
        tokenState: { ...defaultTokenState, accumulatedTotalTokens: 70000 },
      })
    );

    // Should not throw
    await act(async () => {
      await result.current.compact();
    });
  });
});
