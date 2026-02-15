import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HooksPanel from '../HooksPanel';

// Mock UI components
vi.mock('../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    variant?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      data-testid="hook-switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

vi.mock('../../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe('HooksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    const { container } = render(<HooksPanel />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders all default lifecycle events after loading', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      // Session events
      expect(screen.getByText('Session Start')).toBeInTheDocument();
      expect(screen.getByText('Session End')).toBeInTheDocument();
      expect(screen.getByText('Session Pause')).toBeInTheDocument();
      expect(screen.getByText('Session Resume')).toBeInTheDocument();
    });
  });

  it('renders tool events', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getByText('Tool Call Start')).toBeInTheDocument();
      expect(screen.getByText('Tool Call End')).toBeInTheDocument();
      expect(screen.getByText('Tool Error')).toBeInTheDocument();
      expect(screen.getByText('Tool Approval')).toBeInTheDocument();
      expect(screen.getByText('Tool Rejection')).toBeInTheDocument();
    });
  });

  it('renders flow events', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getByText('Message Received')).toBeInTheDocument();
      expect(screen.getByText('Response Generated')).toBeInTheDocument();
      expect(screen.getByText('Guardrail Triggered')).toBeInTheDocument();
      expect(screen.getByText('Policy Evaluated')).toBeInTheDocument();
    });
  });

  it('renders category labels', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getByText('Session')).toBeInTheDocument();
      expect(screen.getByText('Tools')).toBeInTheDocument();
      expect(screen.getByText('Flow')).toBeInTheDocument();
    });
  });

  it('shows summary with hook counts', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      // All 13 events default to disabled
      expect(screen.getByText('0/13 hooks enabled')).toBeInTheDocument();
    });
  });

  it('shows recent events count', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getByText('0 recent events')).toBeInTheDocument();
    });
  });

  it('toggles a hook when its switch is clicked', async () => {
    // The toggle handler calls backendApi.toggleHook which uses fetch.
    // If fetch rejects, the toggle reverts. So we need fetch to succeed for toggle calls.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/hooks/events/')) {
        return Promise.resolve({ ok: true } as Response);
      }
      return Promise.reject(new Error('Not available'));
    });

    const user = userEvent.setup();
    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId('hook-switch').length).toBe(13);
    });

    // Toggle the first hook
    const switches = screen.getAllByTestId('hook-switch');
    await user.click(switches[0]);

    await waitFor(() => {
      expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('renders switches for all events', async () => {
    render(<HooksPanel />);

    await waitFor(() => {
      const switches = screen.getAllByTestId('hook-switch');
      expect(switches).toHaveLength(13);
    });
  });

  it('updates summary count after toggling', async () => {
    // The toggle handler calls backendApi.toggleHook which uses fetch.
    // If fetch rejects, the toggle reverts. So we need fetch to succeed for toggle calls.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/hooks/events/')) {
        return Promise.resolve({ ok: true } as Response);
      }
      return Promise.reject(new Error('Not available'));
    });

    const user = userEvent.setup();
    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getByText('0/13 hooks enabled')).toBeInTheDocument();
    });

    const switches = screen.getAllByTestId('hook-switch');
    await user.click(switches[0]);

    await waitFor(() => {
      expect(screen.getByText('1/13 hooks enabled')).toBeInTheDocument();
    });
  });

  it('uses data from API when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          events: [
            { id: 'session_start', name: 'Session Start', category: 'session', enabled: true, recentCount: 5 },
            { id: 'tool_error', name: 'Tool Error', category: 'tools', enabled: true, recentCount: 2 },
          ],
        }),
    } as Response);

    render(<HooksPanel />);

    await waitFor(() => {
      expect(screen.getByText('2/2 hooks enabled')).toBeInTheDocument();
      expect(screen.getByText('7 recent events')).toBeInTheDocument();
    });
  });
});
