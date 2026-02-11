import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../use-mobile';

// The breakpoint used by the hook
const MOBILE_BREAKPOINT = 930;

describe('useIsMobile', () => {
  let listeners: Array<() => void>;
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let mockRemoveEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    listeners = [];
    mockAddEventListener = vi.fn((_, cb) => {
      listeners.push(cb);
    });
    mockRemoveEventListener = vi.fn();

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      })),
    });
  });

  it('returns false when window.innerWidth is above the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when window.innerWidth is below the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 800 });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when window.innerWidth equals the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: MOBILE_BREAKPOINT });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when window.innerWidth is one less than the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: MOBILE_BREAKPOINT - 1,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('registers a change listener on the media query list', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    renderHook(() => useIsMobile());

    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes the change listener on unmount', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    const { unmount } = renderHook(() => useIsMobile());
    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('updates when the media query change listener fires', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize below breakpoint
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 800 });
    act(() => {
      listeners.forEach((cb) => cb());
    });

    expect(result.current).toBe(true);
  });
});
