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

type JobType = 'inference' | 'finetune' | 'benchmark' | 'embedding';
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

interface GpuJob {
  id: string;
  job_type: JobType;
  model: string;
  status: JobStatus;
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  config: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  logs?: string[];
}

interface JobListResponse {
  jobs: GpuJob[];
  total: number;
}

interface LocalModel {
  name: string;
  size?: string;
  provider: string;
  quantization?: string;
}

interface ModelsResponse {
  models: LocalModel[];
  ollama_running: boolean;
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

/** Return a badge color class for a job status. */
function statusBadgeClass(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'sg-badge sg-badge-gold';
    case 'running':
      return 'sg-badge sg-badge-green';
    case 'completed':
      return 'sg-badge sg-badge-green';
    case 'failed':
      return 'sg-badge sg-badge-red';
    case 'cancelled':
      return 'sg-badge';
  }
}

/** Return a human-friendly label for a job status. */
function statusLabel(status: JobStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
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

  // --- Jobs tab state ---
  const [jobs, setJobs] = useState<GpuJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // --- Launch tab state ---
  const [models, setModels] = useState<LocalModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedJobType, setSelectedJobType] = useState<JobType>('inference');
  const [prompt, setPrompt] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // --- GPU cluster fetch ---
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

  // --- Jobs fetch ---
  const fetchJobs = useCallback(async () => {
    try {
      setJobsLoading(true);
      const res = await fetch(getApiUrl('/api/gpu/jobs'));
      if (res.ok) {
        const data: JobListResponse = await res.json();
        setJobs(data.jobs);
      }
    } catch {
      // silently ignore — jobs tab will show empty
    } finally {
      setJobsLoading(false);
    }
  }, []);

  // Fetch jobs when switching to the Jobs tab, and poll every 3s while on it
  useEffect(() => {
    if (tab !== 'jobs') return;
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [tab, fetchJobs]);

  // --- Models fetch ---
  const fetchModels = useCallback(async () => {
    try {
      setModelsLoading(true);
      const res = await fetch(getApiUrl('/api/gpu/models'));
      if (res.ok) {
        const data: ModelsResponse = await res.json();
        setModels(data.models);
        setOllamaRunning(data.ollama_running);
        // Auto-select first model if none selected
        if (!selectedModel && data.models.length > 0) {
          setSelectedModel(data.models[0].name);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setModelsLoading(false);
    }
  }, [selectedModel]);

  // Fetch models when switching to the Launch tab
  useEffect(() => {
    if (tab !== 'launch') return;
    fetchModels();
  }, [tab, fetchModels]);

  // --- Cancel job ---
  const handleCancel = useCallback(async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await fetch(getApiUrl(`/api/gpu/jobs/${jobId}`), { method: 'DELETE' });
      await fetchJobs();
    } catch {
      // ignore
    } finally {
      setCancellingId(null);
    }
  }, [fetchJobs]);

  // --- Launch job ---
  const handleLaunch = useCallback(async () => {
    if (!selectedModel.trim()) {
      setLaunchError('Please select a model');
      return;
    }
    setLaunching(true);
    setLaunchError(null);
    try {
      const config: Record<string, unknown> = {};
      if (selectedJobType === 'inference' && prompt.trim()) {
        config.prompt = prompt.trim();
      }
      const res = await fetch(getApiUrl('/api/gpu/jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          job_type: selectedJobType,
          config,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Switch to Jobs tab to see the running job
      setTab('jobs');
      setPrompt('');
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  }, [selectedModel, selectedJobType, prompt]);

  return (
    <div className="space-y-4" role="region" aria-label="GPU Panel">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'cluster' ? 'active' : ''}`} onClick={() => setTab('cluster')}>Cluster</button>
        <button className={`sg-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>Jobs</button>
        <button className={`sg-tab ${tab === 'launch' ? 'active' : ''}`} onClick={() => setTab('launch')}>Launch</button>
      </div>

      {/* ===== Cluster Tab ===== */}
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

      {/* ===== Jobs Tab ===== */}
      {tab === 'jobs' && (
        <div className="space-y-3" data-testid="jobs-tab">
          {jobsLoading && jobs.length === 0 ? (
            <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
              Loading jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
              No GPU jobs yet. Go to the Launch tab to start one.
            </div>
          ) : (
            jobs.map((job) => (
              <div className="sg-card" key={job.id} data-testid={`job-card-${job.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>
                    {job.model}
                  </span>
                  <span className={statusBadgeClass(job.status)}>
                    {statusLabel(job.status)}
                  </span>
                </div>

                <div className="flex items-center justify-between" style={{ fontSize: '0.8125rem', color: 'var(--sg-text-3)', marginBottom: '0.25rem' }}>
                  <span>Type: {job.job_type}</span>
                  <span>{Math.round(job.progress * 100)}%</span>
                </div>

                {/* Progress bar */}
                {(job.status === 'running' || job.status === 'queued') && (
                  <div
                    style={{
                      width: '100%',
                      height: '4px',
                      borderRadius: '2px',
                      background: 'var(--sg-border, #333)',
                      marginBottom: '0.5rem',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      role="progressbar"
                      aria-label="Job progress"
                      aria-valuenow={Math.round(job.progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      data-testid={`job-progress-${job.id}`}
                      style={{
                        width: `${Math.round(job.progress * 100)}%`,
                        height: '100%',
                        borderRadius: '2px',
                        background: 'var(--sg-accent, #3b82f6)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}

                {/* Error message */}
                {job.error && (
                  <p style={{ color: 'var(--sg-red, #ef4444)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    {job.error}
                  </p>
                )}

                {/* Cancel button for running/queued jobs */}
                {(job.status === 'running' || job.status === 'queued') && (
                  <button
                    onClick={() => handleCancel(job.id)}
                    disabled={cancellingId === job.id}
                    data-testid={`cancel-job-${job.id}`}
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--sg-red, #ef4444)',
                      background: 'none',
                      border: 'none',
                      cursor: cancellingId === job.id ? 'default' : 'pointer',
                      textDecoration: 'underline',
                      opacity: cancellingId === job.id ? 0.5 : 1,
                    }}
                  >
                    {cancellingId === job.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== Launch Tab ===== */}
      {tab === 'launch' && (
        <div className="space-y-3" data-testid="launch-tab">
          {/* Model selector */}
          <div className="sg-card">
            <label
              htmlFor="gpu-model-select"
              style={{ display: 'block', color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Model
            </label>

            {modelsLoading ? (
              <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>Detecting local models...</p>
            ) : models.length === 0 ? (
              <div>
                <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                  {ollamaRunning
                    ? 'Ollama is running but no models found. Pull a model with: ollama pull llama3'
                    : 'No local model providers detected. Install Ollama or LM Studio to get started.'}
                </p>
                <input
                  id="gpu-model-select"
                  type="text"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  placeholder="Enter model name (e.g. llama3:8b)"
                  data-testid="model-input"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.8125rem',
                    background: 'var(--sg-bg-2, #1e1e1e)',
                    border: '1px solid var(--sg-border, #333)',
                    borderRadius: '4px',
                    color: 'var(--sg-text-1)',
                    outline: 'none',
                  }}
                />
              </div>
            ) : (
              <select
                id="gpu-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                data-testid="model-select"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.8125rem',
                  background: 'var(--sg-bg-2, #1e1e1e)',
                  border: '1px solid var(--sg-border, #333)',
                  borderRadius: '4px',
                  color: 'var(--sg-text-1)',
                  outline: 'none',
                }}
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.provider}{m.size ? `, ${m.size}` : ''})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Job type selector */}
          <div className="sg-card">
            <label
              htmlFor="gpu-job-type"
              style={{ display: 'block', color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Task Type
            </label>
            <select
              id="gpu-job-type"
              value={selectedJobType}
              onChange={(e) => setSelectedJobType(e.target.value as JobType)}
              data-testid="job-type-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.8125rem',
                background: 'var(--sg-bg-2, #1e1e1e)',
                border: '1px solid var(--sg-border, #333)',
                borderRadius: '4px',
                color: 'var(--sg-text-1)',
                outline: 'none',
              }}
            >
              <option value="inference">Inference</option>
              <option value="benchmark">Benchmark</option>
              <option value="embedding">Embedding</option>
              <option value="finetune">Fine-tune (preview)</option>
            </select>
          </div>

          {/* Prompt input for inference */}
          {selectedJobType === 'inference' && (
            <div className="sg-card">
              <label
                htmlFor="gpu-prompt"
                style={{ display: 'block', color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
              >
                Prompt
              </label>
              <textarea
                id="gpu-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your prompt..."
                data-testid="prompt-input"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.8125rem',
                  background: 'var(--sg-bg-2, #1e1e1e)',
                  border: '1px solid var(--sg-border, #333)',
                  borderRadius: '4px',
                  color: 'var(--sg-text-1)',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* Launch error */}
          {launchError && (
            <p data-testid="launch-error" style={{ color: 'var(--sg-red, #ef4444)', fontSize: '0.8125rem', padding: '0 0.25rem' }}>
              {launchError}
            </p>
          )}

          {/* Launch button */}
          <button
            onClick={handleLaunch}
            disabled={launching || !selectedModel.trim()}
            data-testid="launch-button"
            style={{
              width: '100%',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              background: launching || !selectedModel.trim()
                ? 'var(--sg-border, #555)'
                : 'var(--sg-accent, #3b82f6)',
              border: 'none',
              borderRadius: '6px',
              cursor: launching || !selectedModel.trim() ? 'default' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {launching ? 'Launching...' : 'Launch GPU Job'}
          </button>
        </div>
      )}
    </div>
  );
}
