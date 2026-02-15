import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCostTracking } from '../useCostTracking';

// Mock the context and pricing utility
vi.mock('../../components/ModelAndProviderContext', () => ({
  useModelAndProvider: vi.fn(() => ({
    currentModel: 'gpt-4',
    currentProvider: 'openai',
  })),
}));

vi.mock('../../utils/pricing', () => ({
  fetchModelPricing: vi.fn(() => Promise.resolve(null)),
}));

import { useModelAndProvider } from '../../components/ModelAndProviderContext';

const mockUseModelAndProvider = useModelAndProvider as ReturnType<typeof vi.fn>;

describe('useCostTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseModelAndProvider.mockReturnValue({
      currentModel: 'gpt-4',
      currentProvider: 'openai',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    sessionInputTokens: 100,
    sessionOutputTokens: 50,
    localInputTokens: 0,
    localOutputTokens: 0,
  };

  it('returns sessionCosts as an empty object initially', () => {
    const { result } = renderHook(() => useCostTracking(defaultProps));

    expect(result.current.sessionCosts).toEqual({});
  });

  it('returns an object with sessionCosts key', () => {
    const { result } = renderHook(() => useCostTracking(defaultProps));

    expect(result.current).toHaveProperty('sessionCosts');
  });

  it('does not accumulate costs when model has not changed', () => {
    const { result, rerender } = renderHook(
      (props) => useCostTracking(props),
      { initialProps: defaultProps }
    );

    // Rerender with updated tokens but same model
    rerender({ ...defaultProps, sessionInputTokens: 200 });

    expect(result.current.sessionCosts).toEqual({});
  });

  it('tracks the current model and provider from context', () => {
    mockUseModelAndProvider.mockReturnValue({
      currentModel: 'claude-3-opus',
      currentProvider: 'anthropic',
    });

    const { result } = renderHook(() => useCostTracking(defaultProps));

    // Should still return empty costs (no model change yet)
    expect(result.current.sessionCosts).toEqual({});
  });

  it('handles zero token counts', () => {
    const { result } = renderHook(() =>
      useCostTracking({
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
        localInputTokens: 0,
        localOutputTokens: 0,
      })
    );

    expect(result.current.sessionCosts).toEqual({});
  });
});
