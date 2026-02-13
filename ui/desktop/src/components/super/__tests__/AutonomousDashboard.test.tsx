import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AutonomousDashboard from '../AutonomousDashboard';

describe('AutonomousDashboard', () => {
  const originalFetch = globalThis.fetch;

  const mockOta = {
    current_version: '1.24.05',
    last_build_time: '2026-02-12T10:00:00Z',
    last_build_result: null,
    state: 'idle',
    pending_improvements: 7,
  };

  const mockAuto = {
    running: true,
    tasks_completed: 3,
    tasks_failed: 0,
    uptime_seconds: 3600,
    circuit_breaker: {
      state: 'closed',
      consecutive_failures: 0,
      max_failures: 3,
      last_failure: null,
    },
    current_task: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOta),
        });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAuto),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows loading state initially', () => {
    // Make fetch never resolve so we stay in loading
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<AutonomousDashboard />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders OTA Self-Build section', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('OTA Self-Build')).toBeDefined();
    });
  });

  it('renders Autonomous Daemon section', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Autonomous Daemon')).toBeDefined();
    });
  });

  it('displays OTA version from API', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('1.24.05')).toBeDefined();
    });
  });

  it('displays pipeline state from API', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('idle')).toBeDefined();
    });
  });

  it('displays improvements count from API', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('7')).toBeDefined();
    });
  });

  it('shows Running status when daemon is running', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Running')).toBeDefined();
    });
  });

  it('shows Stop button when daemon is running', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeDefined();
    });
  });

  it('shows Start button when daemon is stopped', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOta),
        });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockAuto,
              running: false,
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Start')).toBeDefined();
      expect(screen.getByText('Stopped')).toBeDefined();
    });
  });

  it('displays circuit breaker state', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Circuit Breaker')).toBeDefined();
      expect(screen.getByText(/closed/)).toBeDefined();
    });
  });

  it('displays task count', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/3 \(3 OK \/ 0 failed\)/)).toBeDefined();
    });
  });

  it('toggles daemon when Stop button clicked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/autonomous/stop')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOta),
        });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAuto),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    render(<AutonomousDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      const postCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST' && c[0].includes('/api/autonomous/stop')
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders OTA trigger buttons', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('ota-dry-run-btn')).toBeDefined();
      expect(screen.getByTestId('ota-trigger-btn')).toBeDefined();
    });
  });

  it('triggers dry-run OTA when dry-run button clicked', async () => {
    const mockTriggerResponse = {
      triggered: false,
      cycle_id: null,
      message: 'Dry-run complete: Completed',
      restart_required: false,
    };

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/ota/trigger')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTriggerResponse),
        });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOta),
        });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAuto),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('ota-dry-run-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('ota-dry-run-btn'));

    await waitFor(() => {
      const triggerCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST' && c[0].includes('/api/ota/trigger')
      );
      expect(triggerCalls.length).toBeGreaterThanOrEqual(1);
      // Verify it was a dry run
      const body = JSON.parse(triggerCalls[0][1]?.body as string);
      expect(body.dry_run).toBe(true);
    });
  });

  it('triggers real OTA when trigger button clicked', async () => {
    const mockTriggerResponse = {
      triggered: true,
      cycle_id: 'cycle-abc',
      message: 'Build failed: cargo not found',
      restart_required: false,
    };

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/ota/trigger')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTriggerResponse),
        });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOta),
        });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAuto),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('ota-trigger-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('ota-trigger-btn'));

    await waitFor(() => {
      const triggerCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
        (c) => c[1]?.method === 'POST' && c[0].includes('/api/ota/trigger')
      );
      expect(triggerCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(triggerCalls[0][1]?.body as string);
      expect(body.dry_run).toBe(false);
    });
  });

  it('shows OTA message after trigger', async () => {
    const mockTriggerResponse = {
      triggered: false,
      cycle_id: null,
      message: 'Dry-run complete: Completed',
      restart_required: false,
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/ota/trigger')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTriggerResponse),
        });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOta),
        });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAuto),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('ota-dry-run-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('ota-dry-run-btn'));

    await waitFor(() => {
      expect(screen.getByText('Dry-run complete: Completed')).toBeDefined();
    });
  });

  it('handles API failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<AutonomousDashboard />);

    // Should still render after loading (with N/A values)
    await waitFor(() => {
      expect(screen.getByText('OTA Self-Build')).toBeDefined();
    });
  });
});
