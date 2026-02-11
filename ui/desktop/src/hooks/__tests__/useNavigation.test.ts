import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNavigation } from '../useNavigation';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('../../utils/navigationUtils', () => ({
  createNavigationHandler: vi.fn((navigate) => {
    return (view: string, options?: unknown) => navigate(`/${view}`, { state: options });
  }),
}));

import { createNavigationHandler } from '../../utils/navigationUtils';

const mockCreateNavigationHandler = createNavigationHandler as ReturnType<typeof vi.fn>;

describe('useNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a function', () => {
    const { result } = renderHook(() => useNavigation());

    expect(typeof result.current).toBe('function');
  });

  it('calls createNavigationHandler with the navigate function', () => {
    renderHook(() => useNavigation());

    expect(mockCreateNavigationHandler).toHaveBeenCalledWith(mockNavigate);
  });

  it('the returned handler calls navigate when invoked', () => {
    const { result } = renderHook(() => useNavigation());

    result.current('settings', { showEnvVars: true });

    expect(mockNavigate).toHaveBeenCalledWith('/settings', {
      state: { showEnvVars: true },
    });
  });

  it('the returned handler works with no options', () => {
    const { result } = renderHook(() => useNavigation());

    result.current('chat');

    expect(mockNavigate).toHaveBeenCalledWith('/chat', { state: undefined });
  });
});
