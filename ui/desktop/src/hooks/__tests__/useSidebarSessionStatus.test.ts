import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarSessionStatus } from '../useSidebarSessionStatus';
import { AppEvents } from '../../constants/events';

describe('useSidebarSessionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns getSessionStatus and clearUnread functions', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    expect(typeof result.current.getSessionStatus).toBe('function');
    expect(typeof result.current.clearUnread).toBe('function');
  });

  it('getSessionStatus returns undefined for unknown sessions', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    expect(result.current.getSessionStatus('unknown-id')).toBeUndefined();
  });

  it('tracks session status from SESSION_STATUS_UPDATE events', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'streaming' },
        })
      );
    });

    const status = result.current.getSessionStatus('session-2');
    expect(status).toBeDefined();
    expect(status?.streamState).toBe('streaming');
  });

  it('marks unread when a background session transitions from streaming to idle', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    // First: set session-2 to streaming
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'streaming' },
        })
      );
    });

    // Then: set session-2 to idle (while session-1 is active)
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'idle' },
        })
      );
    });

    const status = result.current.getSessionStatus('session-2');
    expect(status?.hasUnreadActivity).toBe(true);
  });

  it('does not mark unread for the active session', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    // Stream and finish on the active session
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-1', streamState: 'streaming' },
        })
      );
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-1', streamState: 'idle' },
        })
      );
    });

    const status = result.current.getSessionStatus('session-1');
    expect(status?.hasUnreadActivity).toBe(false);
  });

  it('clearUnread removes the unread flag for a session', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    // Make session-2 unread
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'streaming' },
        })
      );
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'idle' },
        })
      );
    });

    expect(result.current.getSessionStatus('session-2')?.hasUnreadActivity).toBe(true);

    // Clear unread
    act(() => {
      result.current.clearUnread('session-2');
    });

    expect(result.current.getSessionStatus('session-2')?.hasUnreadActivity).toBe(false);
  });

  it('clears unread when activeSessionId changes to that session', () => {
    const { result, rerender } = renderHook(
      ({ activeId }) => useSidebarSessionStatus(activeId),
      { initialProps: { activeId: 'session-1' } }
    );

    // Make session-2 unread
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'streaming' },
        })
      );
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
          detail: { sessionId: 'session-2', streamState: 'idle' },
        })
      );
    });

    expect(result.current.getSessionStatus('session-2')?.hasUnreadActivity).toBe(true);

    // Switch to session-2 as active
    rerender({ activeId: 'session-2' });

    expect(result.current.getSessionStatus('session-2')?.hasUnreadActivity).toBe(false);
  });

  it('clearUnread is a no-op for sessions without unread activity', () => {
    const { result } = renderHook(() => useSidebarSessionStatus('session-1'));

    // Should not throw or change anything
    act(() => {
      result.current.clearUnread('nonexistent');
    });

    expect(result.current.getSessionStatus('nonexistent')).toBeUndefined();
  });

  it('removes the event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useSidebarSessionStatus('session-1'));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      AppEvents.SESSION_STATUS_UPDATE,
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });
});
