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

  // -- Build Progress UI tests (Step 6) ----------------------------------------

  it('shows build progress card when build is in progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockBuildProgress = {
      cycle_id: 'cycle-progress',
      phase: 'building',
      started_at: new Date().toISOString(),
      elapsed_secs: 42,
      message: 'Compiling goose-server v1.25.0',
      completed: false,
      success: null,
      restart_required: false,
    };

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/ota/trigger')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            triggered: true,
            cycle_id: 'cycle-progress',
            message: 'Build started in background',
            restart_required: false,
          }),
        });
      }
      if (url.includes('/api/ota/build-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBuildProgress),
        });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOta) });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAuto) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    render(<AutonomousDashboard />);

    // Wait for initial data load
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => {
      expect(screen.getByTestId('ota-trigger-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('ota-trigger-btn'));

    // Advance past trigger response and first build poll interval (3s)
    await vi.advanceTimersByTimeAsync(4000);

    await waitFor(() => {
      expect(screen.getByTestId('ota-build-progress')).toBeDefined();
      expect(screen.getByText('Building...')).toBeDefined();
    });

    vi.useRealTimers();
  });

  it('shows build result card on completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockBuildComplete = {
      cycle_id: 'cycle-done',
      phase: 'completed',
      started_at: new Date().toISOString(),
      elapsed_secs: 180,
      message: 'Build succeeded in 180s',
      completed: true,
      success: true,
      restart_required: true,
    };

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/ota/trigger')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            triggered: true,
            cycle_id: 'cycle-done',
            message: 'Build started in background',
            restart_required: false,
          }),
        });
      }
      if (url.includes('/api/ota/build-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBuildComplete),
        });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOta) });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAuto) });
      }
      if (opts?.method === 'POST' && url.includes('/api/ota/restart')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.25.0' }),
        });
      }
      if (url.includes('/api/ota/restart-completed')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    render(<AutonomousDashboard />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => {
      expect(screen.getByTestId('ota-trigger-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('ota-trigger-btn'));
    await vi.advanceTimersByTimeAsync(4000);

    await waitFor(() => {
      expect(screen.getByTestId('ota-build-result')).toBeDefined();
      expect(screen.getByText('Build Succeeded')).toBeDefined();
    });

    vi.useRealTimers();
  });

  it('shows build failure message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockBuildFail = {
      cycle_id: 'cycle-fail',
      phase: 'failed',
      started_at: new Date().toISOString(),
      elapsed_secs: 30,
      message: 'error[E0308]: mismatched types',
      completed: true,
      success: false,
      restart_required: false,
    };

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/api/ota/trigger')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            triggered: true,
            cycle_id: 'cycle-fail',
            message: 'Build started in background',
            restart_required: false,
          }),
        });
      }
      if (url.includes('/api/ota/build-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBuildFail),
        });
      }
      if (url.includes('/api/ota/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOta) });
      }
      if (url.includes('/api/autonomous/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAuto) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock;

    render(<AutonomousDashboard />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => {
      expect(screen.getByTestId('ota-trigger-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('ota-trigger-btn'));
    await vi.advanceTimersByTimeAsync(4000);

    await waitFor(() => {
      expect(screen.getByTestId('ota-build-result')).toBeDefined();
      expect(screen.getByText('Build Failed')).toBeDefined();
    });

    vi.useRealTimers();
  });

  it('handles API failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<AutonomousDashboard />);

    // Should still render after loading (with N/A values)
    await waitFor(() => {
      expect(screen.getByText('OTA Self-Build')).toBeDefined();
    });
  });

  // -- Restart UI tests -------------------------------------------------------

  it('shows Force Restart button', async () => {
    render(<AutonomousDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Force Restart')).toBeDefined();
    });
  });

  it('disables Force Restart when OTA is busy', async () => {
    const mockTriggerResponse = {
      triggered: true,
      cycle_id: 'cycle-busy',
      message: 'Building...',
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

    // Wait for initial render with data
    await waitFor(() => {
      expect(screen.getByTestId('ota-trigger-btn')).toBeDefined();
    });

    // Trigger OTA to set busy state
    fireEvent.click(screen.getByTestId('ota-trigger-btn'));

    // The Force Restart button should be disabled while OTA is busy
    // (otaBusy is true during the triggerOta async call)
    await waitFor(() => {
      const forceBtn = screen.getByTestId('ota-force-restart-btn');
      expect(forceBtn).toHaveProperty('disabled', true);
    });
  });
});
