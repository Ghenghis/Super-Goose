import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PipelineToggle } from '../PipelineToggle';

// Mock fetch for useSettingsBridge backend calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  // Default: backend returns undefined (fall back to default)
  mockFetch.mockImplementation(() =>
    Promise.resolve({ ok: false, status: 404 })
  );
});

afterEach(() => {
  // @ts-expect-error cleaning up global
  delete globalThis.fetch;
});

describe('PipelineToggle', () => {
  it('renders the heading', async () => {
    render(<PipelineToggle />);
    expect(screen.getByText('Pipeline Visualization')).toBeDefined();
  });

  it('renders the toggle description', async () => {
    render(<PipelineToggle />);
    expect(
      screen.getByText('Real-time agent pipeline with quantum particles and stage tracking')
    ).toBeDefined();
  });

  it('renders the Show Pipeline label', async () => {
    render(<PipelineToggle />);
    expect(screen.getByText('Show Pipeline')).toBeDefined();
  });

  it('defaults to enabled (true)', async () => {
    render(<PipelineToggle />);

    await waitFor(() => {
      const toggle = screen.getByTestId('pipeline-viz-toggle');
      // Radix switch uses data-state="checked" when on
      expect(toggle.getAttribute('data-state')).toBe('checked');
    });
  });

  it('loads saved value from backend', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/settings/pipelineVisualization')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: false }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<PipelineToggle />);

    await waitFor(() => {
      const toggle = screen.getByTestId('pipeline-viz-toggle');
      expect(toggle.getAttribute('data-state')).toBe('unchecked');
    });
  });

  it('persists to backend when toggled off', async () => {
    // Start with enabled=true (default, backend returns nothing)
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: true })
    );

    render(<PipelineToggle />);

    await waitFor(() => {
      expect(screen.getByTestId('pipeline-viz-toggle')).toBeDefined();
    });

    // Click the toggle switch
    const toggle = screen.getByTestId('pipeline-viz-toggle');
    fireEvent.click(toggle);

    await waitFor(() => {
      // Should have called POST to persist
      const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(postCalls[0][1]?.body as string);
      expect(body.value).toBe(false);
    });
  });

  it('persists to localStorage when toggled', async () => {
    const mockSetItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false }));

    render(<PipelineToggle />);

    await waitFor(() => {
      expect(screen.getByTestId('pipeline-viz-toggle')).toBeDefined();
    });

    const toggle = screen.getByTestId('pipeline-viz-toggle');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith('settings:pipelineVisualization', 'false');
    });
  });

  it('handles failed backend gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<PipelineToggle />);

    // Should still render with default (true)
    await waitFor(() => {
      const toggle = screen.getByTestId('pipeline-viz-toggle');
      expect(toggle.getAttribute('data-state')).toBe('checked');
    });
  });
});
