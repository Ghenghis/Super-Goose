import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GPUPanel from '../GPUPanel';

// --- Mocks ----------------------------------------------------------------

vi.mock('../../../config', () => ({
  getApiUrl: vi.fn((endpoint: string) => `http://localhost:3000${endpoint}`),
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- Helpers ---------------------------------------------------------------

/** Build a successful GPU response with detected GPUs. */
function gpuDetectedResponse(gpus: Array<{
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  utilization_pct: number;
}>) {
  return {
    ok: true,
    json: () => Promise.resolve({ detected: true, gpus }),
  };
}

/** Build a response where no GPU is detected. */
function gpuNotDetectedResponse(error = 'nvidia-smi not found') {
  return {
    ok: true,
    json: () => Promise.resolve({ detected: false, gpus: [], error }),
  };
}

/** Build a failing HTTP response. */
function httpErrorResponse(status = 500, statusText = 'Internal Server Error') {
  return { ok: false, status, statusText };
}

// --- Tests -----------------------------------------------------------------

describe('GPUPanel', () => {
  // -- Loading state --------------------------------------------------------
  it('shows loading state initially', async () => {
    // Never resolve the fetch so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<GPUPanel />);

    expect(screen.getByTestId('gpu-loading')).toBeDefined();
    expect(screen.getByText('Detecting...')).toBeDefined();
    expect(screen.getByText('Querying nvidia-smi for GPU information...')).toBeDefined();
  });

  // -- GPU detected ---------------------------------------------------------
  it('renders detected GPU with name, memory, and utilization', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'NVIDIA GeForce RTX 3090 Ti',
      memory_total_mb: 24576,
      memory_used_mb: 4096,
      utilization_pct: 25,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('NVIDIA GeForce RTX 3090 Ti')).toBeDefined();
    });

    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('4.0 GB / 24.0 GB')).toBeDefined();
    expect(screen.getByText('25%')).toBeDefined();
    expect(screen.getByTestId('gpu-card-0')).toBeDefined();
  });

  it('renders multiple GPUs when detected', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([
      {
        name: 'NVIDIA GeForce RTX 4090',
        memory_total_mb: 24576,
        memory_used_mb: 2048,
        utilization_pct: 10,
      },
      {
        name: 'NVIDIA GeForce RTX 3080',
        memory_total_mb: 10240,
        memory_used_mb: 512,
        utilization_pct: 5,
      },
    ]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('NVIDIA GeForce RTX 4090')).toBeDefined();
    });

    expect(screen.getByText('NVIDIA GeForce RTX 3080')).toBeDefined();
    expect(screen.getByTestId('gpu-card-0')).toBeDefined();
    expect(screen.getByTestId('gpu-card-1')).toBeDefined();
  });

  // -- Memory bar -----------------------------------------------------------
  it('renders memory usage progress bar with correct ARIA attributes', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'RTX 3090',
      memory_total_mb: 24576,
      memory_used_mb: 12288, // 50%
      utilization_pct: 50,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('gpu-memory-bar-0')).toBeDefined();
    });

    const bar = screen.getByTestId('gpu-memory-bar-0');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('GPU memory usage');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  // -- Color coding ---------------------------------------------------------
  it('shows green color for low utilization (<60%)', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'RTX 3090',
      memory_total_mb: 24576,
      memory_used_mb: 1024,
      utilization_pct: 15,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('15%')).toBeDefined();
    });

    const utilText = screen.getByText('15%');
    expect(utilText.style.color).toContain('22c55e');
  });

  it('shows yellow color for medium utilization (60-80%)', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'RTX 3090',
      memory_total_mb: 24576,
      memory_used_mb: 16384,
      utilization_pct: 70,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('70%')).toBeDefined();
    });

    const utilText = screen.getByText('70%');
    expect(utilText.style.color).toContain('f59e0b');
  });

  it('shows red color for high utilization (>=80%)', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'RTX 3090',
      memory_total_mb: 24576,
      memory_used_mb: 22000,
      utilization_pct: 95,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('95%')).toBeDefined();
    });

    const utilText = screen.getByText('95%');
    expect(utilText.style.color).toContain('ef4444');
  });

  // -- GPU not detected -----------------------------------------------------
  it('shows "Not detected" when no GPU found', async () => {
    mockFetch.mockResolvedValue(gpuNotDetectedResponse('nvidia-smi not found'));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('gpu-not-detected')).toBeDefined();
    });

    expect(screen.getByText('Not detected')).toBeDefined();
    expect(screen.getByText('nvidia-smi not found')).toBeDefined();
  });

  it('shows default "not detected" message when error is absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ detected: false, gpus: [] }),
    });

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('gpu-not-detected')).toBeDefined();
    });

    expect(screen.getByText('No NVIDIA GPU detected. Install NVIDIA drivers and ensure nvidia-smi is in your PATH.')).toBeDefined();
  });

  // -- Fetch error ----------------------------------------------------------
  it('shows error state when API is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('gpu-error')).toBeDefined();
    });

    expect(screen.getByText('Error')).toBeDefined();
    expect(screen.getByText('Failed to fetch')).toBeDefined();
  });

  it('shows error state on HTTP error response', async () => {
    mockFetch.mockResolvedValue(httpErrorResponse(500, 'Internal Server Error'));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('gpu-error')).toBeDefined();
    });

    expect(screen.getByText('HTTP 500: Internal Server Error')).toBeDefined();
  });

  it('shows Retry button on error and retries when clicked', async () => {
    // First call fails
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('gpu-error')).toBeDefined();
    });

    expect(screen.getByText('Retry')).toBeDefined();

    // Second call succeeds
    mockFetch.mockResolvedValueOnce(gpuDetectedResponse([{
      name: 'RTX 3090 Ti',
      memory_total_mb: 24576,
      memory_used_mb: 1024,
      utilization_pct: 10,
    }]));

    await act(async () => {
      fireEvent.click(screen.getByText('Retry'));
    });

    await waitFor(() => {
      expect(screen.getByText('RTX 3090 Ti')).toBeDefined();
    });
  });

  // -- Tab navigation -------------------------------------------------------
  it('renders three tabs: Cluster, Jobs, Launch', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<GPUPanel />);

    expect(screen.getByText('Cluster')).toBeDefined();
    expect(screen.getByText('Jobs')).toBeDefined();
    expect(screen.getByText('Launch')).toBeDefined();
  });

  it('switches to Jobs tab', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<GPUPanel />);

    fireEvent.click(screen.getByText('Jobs'));
    expect(screen.getByText('No running jobs')).toBeDefined();
  });

  it('switches to Launch tab', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<GPUPanel />);

    fireEvent.click(screen.getByText('Launch'));
    expect(screen.getByText(/GPU launch/)).toBeDefined();
  });

  // -- Cloud GPU card always visible ----------------------------------------
  it('shows Cloud GPU card alongside local GPU', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'RTX 3090',
      memory_total_mb: 24576,
      memory_used_mb: 1024,
      utilization_pct: 10,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('RTX 3090')).toBeDefined();
    });

    expect(screen.getByText('Cloud GPU')).toBeDefined();
    expect(screen.getByText('BYOK')).toBeDefined();
  });

  // -- Accessibility --------------------------------------------------------
  it('has correct ARIA region label', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<GPUPanel />);

    expect(screen.getByRole('region', { name: 'GPU Panel' })).toBeDefined();
  });

  // -- API URL --------------------------------------------------------------
  it('calls the correct API endpoint', async () => {
    mockFetch.mockResolvedValue(gpuNotDetectedResponse());

    render(<GPUPanel />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/system/gpu',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  // -- Memory formatting ----------------------------------------------------
  it('formats memory in MB for small values', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'Test GPU',
      memory_total_mb: 512,
      memory_used_mb: 256,
      utilization_pct: 50,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('256 MB / 512 MB')).toBeDefined();
    });
  });

  it('formats memory in GB for large values', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'Test GPU',
      memory_total_mb: 24576,
      memory_used_mb: 12288,
      utilization_pct: 50,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(screen.getByText('12.0 GB / 24.0 GB')).toBeDefined();
    });
  });

  // -- Periodic refresh -----------------------------------------------------
  it('refreshes GPU data every 10 seconds', async () => {
    mockFetch.mockResolvedValue(gpuDetectedResponse([{
      name: 'RTX 3090',
      memory_total_mb: 24576,
      memory_used_mb: 1024,
      utilization_pct: 10,
    }]));

    render(<GPUPanel />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Advance 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Advance another 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
