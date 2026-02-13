import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ModeSelector from '../ModeSelector';

describe('ModeSelector', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: GET returns auto mode, POST succeeds
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (!opts?.method || opts.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: 'auto' }),
        });
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders all 3 mode options', async () => {
    render(<ModeSelector />);

    expect(screen.getByText('Freeform')).toBeDefined();
    expect(screen.getByText('Structured')).toBeDefined();
    expect(screen.getByText('Auto')).toBeDefined();

    expect(screen.getByText('Open-ended chat & research')).toBeDefined();
    expect(screen.getByText('Code-Test-Fix pipeline')).toBeDefined();
    expect(screen.getByText('CoreSelector picks best core')).toBeDefined();
  });

  it('renders the Execution Mode heading', () => {
    render(<ModeSelector />);
    expect(screen.getByText('Execution Mode')).toBeDefined();
  });

  it('loads initial mode from GET /api/settings/execution_mode', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: 'structured' }),
      })
    );

    render(<ModeSelector />);

    await waitFor(() => {
      // The Structured button should have the selected styling (border-blue-500)
      const structuredButton = screen.getByText('Structured').closest('button');
      expect(structuredButton?.className).toContain('border-blue-500');
    });
  });

  it('sends POST when clicking a mode', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: 'auto' }),
      });
    });
    globalThis.fetch = fetchMock;

    render(<ModeSelector />);

    // Wait for initial load
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Click Freeform
    fireEvent.click(screen.getByText('Freeform'));

    await waitFor(() => {
      const postCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(postCalls[0][1]?.body as string);
      expect(body.value).toBe('freeform');
    });
  });

  it('handles failed GET gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<ModeSelector />);

    // Should still render with default mode (auto)
    await waitFor(() => {
      const autoButton = screen.getByText('Auto').closest('button');
      expect(autoButton?.className).toContain('border-blue-500');
    });
  });

  it('shows Saving indicator during POST', async () => {
    let resolvePost: (value: unknown) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return postPromise;
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: 'auto' }),
      });
    });

    render(<ModeSelector />);

    // Click Structured to trigger POST
    fireEvent.click(screen.getByText('Structured'));

    // "Saving..." should appear
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeDefined();
    });

    // Resolve the POST
    resolvePost!({ ok: true });

    await waitFor(() => {
      expect(screen.queryByText('Saving...')).toBeNull();
    });
  });
});
