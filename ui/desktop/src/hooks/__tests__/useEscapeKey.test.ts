import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeKey } from '../useEscapeKey';

describe('useEscapeKey', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
  });

  it('registers a keydown listener when isActive is true', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not register a keydown listener when isActive is false', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(false, onEscape));

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it('calls onEscape when Escape key is pressed and isActive is true', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not call onEscape when a different key is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    document.dispatchEvent(event);

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(true, onEscape));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('removes and re-adds listener when isActive changes from false to true', () => {
    const onEscape = vi.fn();
    const { rerender } = renderHook(
      ({ isActive }) => useEscapeKey(isActive, onEscape),
      { initialProps: { isActive: false } }
    );

    expect(addEventListenerSpy).not.toHaveBeenCalled();

    rerender({ isActive: true });

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('removes listener when isActive changes from true to false', () => {
    const onEscape = vi.fn();
    const { rerender } = renderHook(
      ({ isActive }) => useEscapeKey(isActive, onEscape),
      { initialProps: { isActive: true } }
    );

    rerender({ isActive: false });

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    // Pressing Escape should not call the callback after deactivation
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(onEscape).not.toHaveBeenCalled();
  });
});
