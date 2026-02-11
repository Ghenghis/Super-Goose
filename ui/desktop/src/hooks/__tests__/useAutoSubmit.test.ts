import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoSubmit } from '../useAutoSubmit';
import { ChatState } from '../../types/chatState';

// Mock react-router-dom
const mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(() => [mockSearchParams]),
}));

// Mock AppEvents
vi.mock('../../constants/events', () => ({
  AppEvents: {
    CLEAR_INITIAL_MESSAGE: 'clear-initial-message',
  },
}));

describe('useAutoSubmit', () => {
  const mockHandleSubmit = vi.fn();
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  const defaultProps = {
    sessionId: 'session-1',
    session: {
      id: 'session-1',
      name: 'Test Session',
      message_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      working_dir: '/tmp',
      extension_data: {} as Record<string, unknown>,
    },
    messages: [] as Array<{ id: string; role: string; created: number; content: never[]; metadata: { agentVisible: boolean; userVisible: boolean } }>,
    chatState: ChatState.Idle,
    initialMessage: undefined as { msg: string; images: Array<{ data: string; mimeType: string }> } | undefined,
    handleSubmit: mockHandleSubmit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params
    mockSearchParams.delete('resumeSessionId');
    mockSearchParams.delete('shouldStartAgent');
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });

  it('returns hasAutoSubmitted as false when there is no initial message', () => {
    const { result } = renderHook(() => useAutoSubmit(defaultProps));

    expect(result.current.hasAutoSubmitted).toBe(false);
  });

  it('does not auto-submit when session is undefined', () => {
    const { result } = renderHook(() =>
      useAutoSubmit({
        ...defaultProps,
        session: undefined,
      })
    );

    expect(mockHandleSubmit).not.toHaveBeenCalled();
    expect(result.current.hasAutoSubmitted).toBe(false);
  });

  it('does not auto-submit when chatState is not Idle', () => {
    renderHook(() =>
      useAutoSubmit({
        ...defaultProps,
        chatState: ChatState.Streaming,
        initialMessage: { msg: 'hello', images: [] },
      })
    );

    expect(mockHandleSubmit).not.toHaveBeenCalled();
  });

  it('auto-submits for scenario 1: new session with initial message (message_count === 0)', () => {
    renderHook(() =>
      useAutoSubmit({
        ...defaultProps,
        initialMessage: { msg: 'hello from hub', images: [] },
      })
    );

    expect(mockHandleSubmit).toHaveBeenCalledWith({ msg: 'hello from hub', images: [] });
    expect(dispatchEventSpy).toHaveBeenCalled();
  });

  it('auto-submits for scenario 3: resume with shouldStartAgent', () => {
    mockSearchParams.set('resumeSessionId', 'session-1');
    mockSearchParams.set('shouldStartAgent', 'true');

    renderHook(() =>
      useAutoSubmit({
        ...defaultProps,
        session: {
          id: 'session-1',
          name: 'Test Session',
          message_count: 5,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          working_dir: '/tmp',
          extension_data: {} as Record<string, unknown>,
        },
        messages: [
          { id: '1', role: 'user', created: 1, content: [] },
        ] as unknown as typeof defaultProps.messages,
      })
    );

    // Scenario 3: shouldStartAgent without initialMessage sends empty msg
    expect(mockHandleSubmit).toHaveBeenCalledWith({ msg: '', images: [] });
  });

  it('does not auto-submit when shouldStartAgent is false', () => {
    mockSearchParams.set('resumeSessionId', 'session-1');
    mockSearchParams.set('shouldStartAgent', 'false');

    renderHook(() =>
      useAutoSubmit({
        ...defaultProps,
        session: {
          id: 'session-1',
          name: 'Test Session',
          message_count: 5,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          working_dir: '/tmp',
          extension_data: {} as Record<string, unknown>,
        },
        messages: [
          { id: '1', role: 'user', created: 1, content: [] },
        ] as unknown as typeof defaultProps.messages,
      })
    );

    expect(mockHandleSubmit).not.toHaveBeenCalled();
  });

  it('dispatches CLEAR_INITIAL_MESSAGE event after auto-submitting with initial message', () => {
    renderHook(() =>
      useAutoSubmit({
        ...defaultProps,
        initialMessage: { msg: 'hello', images: [] },
      })
    );

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'clear-initial-message',
      })
    );
  });
});
