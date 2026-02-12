/**
 * PipelineToggle tests — pipeline visibility toggle in settings.
 *
 * Tests that:
 * - PipelineContext exposes isVisible/setIsVisible
 * - Toggle changes pipeline visibility state
 * - Setting persists to localStorage under 'pipeline_visible'
 * - Initial state reads from localStorage on mount
 */
import { renderHook, act } from '@testing-library/react';
import { PipelineProvider, usePipeline } from '../PipelineContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <PipelineProvider>{children}</PipelineProvider>;
}

describe('PipelineToggle', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    vi.clearAllMocks();

    // Provide a functional localStorage mock for these tests
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => mockStorage[key] ?? null
    );
    (window.localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string, value: string) => {
        mockStorage[key] = value;
      }
    );
  });

  describe('default visibility', () => {
    it('defaults to visible when localStorage has no value', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.isVisible).toBe(true);
    });

    it('exposes setIsVisible function', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(typeof result.current.setIsVisible).toBe('function');
    });
  });

  describe('toggle changes visibility', () => {
    it('sets isVisible to false when toggled off', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.isVisible).toBe(true);

      act(() => {
        result.current.setIsVisible(false);
      });

      expect(result.current.isVisible).toBe(false);
    });

    it('sets isVisible back to true when toggled on', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });

      act(() => {
        result.current.setIsVisible(false);
      });
      expect(result.current.isVisible).toBe(false);

      act(() => {
        result.current.setIsVisible(true);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  describe('localStorage persistence', () => {
    it('persists false to localStorage when toggled off', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });

      act(() => {
        result.current.setIsVisible(false);
      });

      expect(window.localStorage.setItem).toHaveBeenCalledWith('pipeline_visible', 'false');
    });

    it('persists true to localStorage when toggled on', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });

      act(() => {
        result.current.setIsVisible(true);
      });

      expect(window.localStorage.setItem).toHaveBeenCalledWith('pipeline_visible', 'true');
    });

    it('writes to localStorage on every toggle', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });

      act(() => {
        result.current.setIsVisible(false);
      });
      act(() => {
        result.current.setIsVisible(true);
      });
      act(() => {
        result.current.setIsVisible(false);
      });

      expect(window.localStorage.setItem).toHaveBeenCalledTimes(3);
      expect(mockStorage['pipeline_visible']).toBe('false');
    });
  });

  describe('initial state from localStorage', () => {
    it('reads false from localStorage on mount', () => {
      mockStorage['pipeline_visible'] = 'false';

      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.isVisible).toBe(false);
    });

    it('reads true from localStorage on mount', () => {
      mockStorage['pipeline_visible'] = 'true';

      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.isVisible).toBe(true);
    });

    it('defaults to true for unexpected localStorage values', () => {
      mockStorage['pipeline_visible'] = 'garbage';

      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.isVisible).toBe(true);
    });

    it('defaults to true when localStorage key does not exist', () => {
      // mockStorage has no 'pipeline_visible' key
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.isVisible).toBe(true);
    });
  });
});
