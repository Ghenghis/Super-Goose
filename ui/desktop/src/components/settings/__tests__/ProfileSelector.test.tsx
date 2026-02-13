import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileSelector } from '../ProfileSelector';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 404 }));
});

afterEach(() => {
  // @ts-expect-error cleaning up global
  delete globalThis.fetch;
});

describe('ProfileSelector', () => {
  it('renders the Agent Profile heading', () => {
    render(<ProfileSelector />);
    expect(screen.getByText('Agent Profile')).toBeDefined();
  });

  it('renders all 4 profile options', () => {
    render(<ProfileSelector />);

    expect(screen.getByText('Default')).toBeDefined();
    expect(screen.getByText('Code-Focused')).toBeDefined();
    expect(screen.getByText('Research')).toBeDefined();
    expect(screen.getByText('Creative')).toBeDefined();
  });

  it('renders profile descriptions', () => {
    render(<ProfileSelector />);

    expect(screen.getByText('Balanced general-purpose agent')).toBeDefined();
    expect(screen.getByText('Optimized for coding tasks with structured output')).toBeDefined();
    expect(screen.getByText('Deep exploration with extended reasoning')).toBeDefined();
    expect(screen.getByText('Open-ended generation with higher temperature')).toBeDefined();
  });

  it('highlights the default profile initially', async () => {
    render(<ProfileSelector />);

    await waitFor(() => {
      const defaultButton = screen.getByText('Default').closest('button');
      expect(defaultButton?.className).toContain('border-blue-500');
    });
  });

  it('loads saved profile from backend', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/settings/agentProfile')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: 'research' }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<ProfileSelector />);

    await waitFor(() => {
      const researchButton = screen.getByText('Research').closest('button');
      expect(researchButton?.className).toContain('border-blue-500');
    });
  });

  it('switches profile on click', async () => {
    render(<ProfileSelector />);

    // Click Code-Focused
    fireEvent.click(screen.getByText('Code-Focused'));

    await waitFor(() => {
      const codeButton = screen.getByText('Code-Focused').closest('button');
      expect(codeButton?.className).toContain('border-blue-500');
    });

    // Default should no longer be highlighted
    const defaultButton = screen.getByText('Default').closest('button');
    expect(defaultButton?.className).not.toContain('border-blue-500');
  });

  it('sends POST to backend on profile change', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: true }));

    render(<ProfileSelector />);

    fireEvent.click(screen.getByText('Creative'));

    await waitFor(() => {
      const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(postCalls[0][1]?.body as string);
      expect(body.value).toBe('creative');
    });
  });

  it('persists to localStorage on profile change', async () => {
    const mockSetItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false }));

    render(<ProfileSelector />);

    fireEvent.click(screen.getByText('Research'));

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith('settings:agentProfile', '"research"');
    });
  });

  it('handles failed backend gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<ProfileSelector />);

    // Should still render with default profile
    await waitFor(() => {
      const defaultButton = screen.getByText('Default').closest('button');
      expect(defaultButton?.className).toContain('border-blue-500');
    });
  });

  it('renders exactly 4 profile buttons', () => {
    render(<ProfileSelector />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(4);
  });
});
