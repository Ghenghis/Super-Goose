import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentScaler } from '../AgentScaler';

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

describe('AgentScaler', () => {
  it('renders the Concurrent Agents heading', () => {
    render(<AgentScaler />);
    expect(screen.getByText('Concurrent Agents')).toBeDefined();
  });

  it('renders the Agent Count label', () => {
    render(<AgentScaler />);
    expect(screen.getByText('Agent Count')).toBeDefined();
  });

  it('renders the slider description', () => {
    render(<AgentScaler />);
    expect(
      screen.getByText('Number of agents that can run concurrently (1-8)')
    ).toBeDefined();
  });

  it('defaults to 1 agent', async () => {
    render(<AgentScaler />);

    await waitFor(() => {
      const display = screen.getByTestId('agent-count-display');
      expect(display.textContent).toBe('1');
    });
  });

  it('renders a range slider with min=1 and max=8', () => {
    render(<AgentScaler />);

    const slider = screen.getByTestId('agent-count-slider') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('1');
    expect(slider.max).toBe('8');
  });

  it('loads saved agent count from backend', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/settings/concurrentAgents')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: 4 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<AgentScaler />);

    await waitFor(() => {
      const display = screen.getByTestId('agent-count-display');
      expect(display.textContent).toBe('4');
    });
  });

  it('updates display when slider changes', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: true }));

    render(<AgentScaler />);

    const slider = screen.getByTestId('agent-count-slider');
    fireEvent.change(slider, { target: { value: '5' } });

    await waitFor(() => {
      const display = screen.getByTestId('agent-count-display');
      expect(display.textContent).toBe('5');
    });
  });

  it('sends POST to backend on slider change', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: true }));

    render(<AgentScaler />);

    const slider = screen.getByTestId('agent-count-slider');
    fireEvent.change(slider, { target: { value: '3' } });

    await waitFor(() => {
      const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(postCalls[0][1]?.body as string);
      expect(body.value).toBe(3);
    });
  });

  it('persists to localStorage on slider change', async () => {
    const mockSetItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false }));

    render(<AgentScaler />);

    const slider = screen.getByTestId('agent-count-slider');
    fireEvent.change(slider, { target: { value: '6' } });

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith('settings:concurrentAgents', '6');
    });
  });

  it('renders min and max labels', () => {
    render(<AgentScaler />);

    // Min label: "1" appears in both the display and the min label, use getAllByText
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2); // display + min label

    // Max label: "8" is unique
    expect(screen.getByText('8')).toBeDefined();
  });

  it('handles failed backend gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<AgentScaler />);

    // Should still render with default (1)
    await waitFor(() => {
      const display = screen.getByTestId('agent-count-display');
      expect(display.textContent).toBe('1');
    });
  });
});
