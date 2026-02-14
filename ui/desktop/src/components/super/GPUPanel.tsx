import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GpuInfo {
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  utilization_pct: number;
}

interface GpuResponse {
  detected: boolean;
  gpus: GpuInfo[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a CSS color based on utilization percentage thresholds. */
function utilizationColor(pct: number): string {
  if (pct >= 80) return 'var(--sg-red, #ef4444)';
  if (pct >= 60) return 'var(--sg-gold, #f59e0b)';
  return 'var(--sg-green, #22c55e)';
}

/** Format megabytes to a human-readable string (e.g. "24.0 GB"). */
function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GPUPanel() {
  const [tab, setTab] = useState<'cluster' | 'jobs' | 'launch'>('cluster');
  const [gpuData, setGpuData] = useState<GpuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchGpuInfo = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await fetch(getApiUrl('/api/system/gpu'), { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: GpuResponse = await res.json();
      if (!signal?.aborted) setGpuData(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!signal?.aborted) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch GPU info');
        setGpuData(null);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    fetchGpuInfo(controller.signal);
    // Refresh every 10 seconds to keep utilization data current
    const interval = setInterval(() => fetchGpuInfo(controller.signal), 10000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchGpuInfo]);

  /** Manual retry — abort any in-flight request first. */
  const handleRetry = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    fetchGpuInfo(controller.signal);
  }, [fetchGpuInfo]);

  return (
    <div className="space-y-4" role="region" aria-label="GPU Panel">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'cluster' ? 'active' : ''}`} onClick={() => setTab('cluster')}>Cluster</button>
        <button className={`sg-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>Jobs</button>
        <button className={`sg-tab ${tab === 'launch' ? 'active' : ''}`} onClick={() => setTab('launch')}>Launch</button>
      </div>

      {tab === 'cluster' && (
        <div className="space-y-3">
          {/* Local GPU card */}
          {loading ? (
            <div className="sg-card" data-testid="gpu-loading">
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>Local GPU</span>
                <span className="sg-badge" style={{ color: 'var(--sg-text-4)' }}>Detecting...</span>
              </div>
              <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>
                Querying nvidia-smi for GPU information...
              </p>
            </div>
          ) : fetchError ? (
            <div className="sg-card" data-testid="gpu-error">
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>Local GPU</span>
                <span className="sg-badge sg-badge-red">
                  <span className="sg-status-dot sg-status-idle" />
                  Error
                </span>
              </div>
              <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>
                {fetchError}
              </p>
              <button
                onClick={handleRetry}
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--sg-accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          ) : gpuData?.detected ? (
            /* One card per detected GPU */
            gpuData.gpus.map((gpu, idx) => {
              const memPct = gpu.memory_total_mb > 0
                ? Math.round((gpu.memory_used_mb / gpu.memory_total_mb) * 100)
                : 0;
              return (
                <div className="sg-card" key={idx} data-testid={`gpu-card-${idx}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>
                      {gpu.name}
                    </span>
                    <span className="sg-badge sg-badge-green">
                      <span className="sg-status-dot sg-status-active" />
                      Active
                    </span>
                  </div>

                  {/* Memory usage */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div className="flex items-center justify-between" style={{ fontSize: '0.8125rem', color: 'var(--sg-text-3)' }}>
                      <span>Memory</span>
                      <span>{formatMB(gpu.memory_used_mb)} / {formatMB(gpu.memory_total_mb)}</span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '6px',
                        borderRadius: '3px',
                        background: 'var(--sg-border, #333)',
                        marginTop: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        role="progressbar"
                        aria-label="GPU memory usage"
                        aria-valuenow={memPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        data-testid={`gpu-memory-bar-${idx}`}
                        style={{
                          width: `${memPct}%`,
                          height: '100%',
                          borderRadius: '3px',
                          background: utilizationColor(memPct),
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Utilization */}
                  <div className="flex items-center justify-between" style={{ fontSize: '0.8125rem', color: 'var(--sg-text-3)' }}>
                    <span>Utilization</span>
                    <span style={{ color: utilizationColor(gpu.utilization_pct), fontWeight: 600 }}>
                      {gpu.utilization_pct}%
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sg-card" data-testid="gpu-not-detected">
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>Local GPU</span>
                <span className="sg-badge sg-badge-red">
                  <span className="sg-status-dot sg-status-idle" />
                  Not detected
                </span>
              </div>
              <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>
                {gpuData?.error || 'No NVIDIA GPU detected. Install NVIDIA drivers and ensure nvidia-smi is in your PATH.'}
              </p>
            </div>
          )}

          {/* Cloud GPU card (unchanged) */}
          <div className="sg-card">
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>Cloud GPU</span>
              <span className="sg-badge sg-badge-gold">BYOK</span>
            </div>
            <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>
              Bring your own key: RunPod, Lambda, Vast.ai, SkyPilot
            </p>
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No running jobs
        </div>
      )}

      {tab === 'launch' && (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          GPU launch — configure cloud provider first
        </div>
      )}
    </div>
  );
}
