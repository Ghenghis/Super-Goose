import { renderHook } from '@testing-library/react';

const mockTrackPageView = vi.fn();

vi.mock('../../utils/analytics', () => ({
  trackPageView: (...args: any[]) => mockTrackPageView(...args),
}));

// We need to mock react-router-dom useLocation
let mockPathname = '/';
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
}));

import { usePageViewTracking } from '../useAnalytics';

describe('usePageViewTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/';
  });

  it('tracks page view on initial render', () => {
    renderHook(() => usePageViewTracking());
    expect(mockTrackPageView).toHaveBeenCalledWith('/', undefined);
  });

  it('tracks page view with current path', () => {
    mockPathname = '/settings';
    renderHook(() => usePageViewTracking());
    expect(mockTrackPageView).toHaveBeenCalledWith('/settings', undefined);
  });

  it('tracks page view when path changes', () => {
    mockPathname = '/';
    const { rerender } = renderHook(() => usePageViewTracking());
    expect(mockTrackPageView).toHaveBeenCalledTimes(1);

    mockPathname = '/extensions';
    rerender();
    expect(mockTrackPageView).toHaveBeenCalledTimes(2);
    expect(mockTrackPageView).toHaveBeenCalledWith('/extensions', '/');
  });

  it('does not track duplicate page views for same path', () => {
    mockPathname = '/settings';
    const { rerender } = renderHook(() => usePageViewTracking());
    expect(mockTrackPageView).toHaveBeenCalledTimes(1);

    rerender();
    expect(mockTrackPageView).toHaveBeenCalledTimes(1);
  });

  it('includes previous path as referrer on subsequent navigation', () => {
    mockPathname = '/';
    const { rerender } = renderHook(() => usePageViewTracking());

    mockPathname = '/pair';
    rerender();

    mockPathname = '/settings';
    rerender();

    expect(mockTrackPageView).toHaveBeenLastCalledWith('/settings', '/pair');
  });
});
