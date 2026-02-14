import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../../config';
const POLL_INTERVAL = 3000; // 3s — faster during OTA cycles

/** Matches backend `ota_api.rs` OtaStatus. */
interface OtaStatus {
  state: string;
  last_build_time: string | null;
  last_build_result: string | null;
  current_version: string;
  pending_improvements: number;
}

/** Matches backend `ota_api.rs` AutonomousStatus. */
interface AutonomousStatus {
  running: boolean;
  uptime_seconds: number;
  tasks_completed: number;
  tasks_failed: number;
  circuit_breaker: {
    state: string;
    consecutive_failures: number;
    max_failures: number;
    last_failure: string | null;
  };
  current_task: string | null;
}

/** Matches backend `ota_api.rs` OtaTriggerResponse. */
interface OtaTriggerResponse {
  triggered: boolean;
  cycle_id: string | null;
  message: string;
  restart_required: boolean;
}

/** Matches backend `state.rs` OtaBuildProgress. */
interface OtaBuildProgress {
  cycle_id: string;
  phase: string;
  started_at: string;
  elapsed_secs: number;
  message: string;
  completed: boolean;
  success: boolean | null;
  restart_required: boolean;
}

export default function AutonomousDashboard() {
  const [ota, setOta] = useState<OtaStatus | null>(null);
  const [auto, setAuto] = useState<AutonomousStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [otaMessage, setOtaMessage] = useState<string | null>(null);
  const [otaBusy, setOtaBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [, setPreviousVersion] = useState<string | null>(null);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState<OtaBuildProgress | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buildPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hover state for buttons
  const [hoverBtn, setHoverBtn] = useState<string | null>(null);

  // Stop build progress polling
  const stopBuildPolling = useCallback(() => {
    if (buildPollRef.current) {
      clearInterval(buildPollRef.current);
      buildPollRef.current = null;
    }
  }, []);

  // Step 5: Extended reconnect timeout — 8 minutes (240 attempts at 2s)
  const pollForReconnect = useCallback(async (prevVersion: string) => {
    setReconnecting(true);
    setReconnectMessage(null);
    const maxAttempts = 240; // 8 minutes at 2s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));

      // Update elapsed message every 10 seconds
      if (i > 0 && i % 5 === 0) {
        const elapsed = (i + 1) * 2;
        setReconnectMessage(`Waiting for backend... (${elapsed}s elapsed)`);
      }

      try {
        const res = await fetch(getApiUrl('/api/version'));
        if (res.ok) {
          const data = await res.json();
          const newVersion = data.version || 'unknown';
          setReconnecting(false);
          setRestarting(false);

          // Check for restart-completed marker with version transition info
          try {
            const rcRes = await fetch(getApiUrl('/api/ota/restart-completed'));
            if (rcRes.ok) {
              const rcData = await rcRes.json();
              if (rcData.previous_version && rcData.current_version) {
                if (rcData.version_changed) {
                  setReconnectMessage(
                    `Upgraded: v${rcData.previous_version} \u2192 v${rcData.current_version}` +
                    (rcData.current_git_hash ? ` (${rcData.current_git_hash.slice(0, 7)})` : '')
                  );
                } else {
                  setReconnectMessage(
                    `Rebuilt: v${rcData.current_version}` +
                    (rcData.current_git_hash ? ` (${rcData.current_git_hash.slice(0, 7)})` : '')
                  );
                }
                return;
              }
            }
          } catch { /* marker may not exist */ }

          if (newVersion !== prevVersion) {
            setReconnectMessage(`Reconnected \u2014 running v${newVersion} (was v${prevVersion})`);
          } else {
            setReconnectMessage(`Reconnected \u2014 v${newVersion}`);
          }
          return;
        }
      } catch { /* still down */ }
    }
    setReconnecting(false);
    setRestarting(false);
    setReconnectMessage('Restart failed \u2014 backend unreachable after 8 minutes');
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [otaRes, autoRes] = await Promise.allSettled([
        fetch(getApiUrl('/api/ota/status')),
        fetch(getApiUrl('/api/autonomous/status')),
      ]);
      if (otaRes.status === 'fulfilled' && otaRes.value.ok) setOta(await otaRes.value.json());
      if (autoRes.status === 'fulfilled' && autoRes.value.ok)
        setAuto(await autoRes.value.json());
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopBuildPolling();
    };
  }, [fetchData, stopBuildPolling]);

  const toggleDaemon = async () => {
    const endpoint = auto?.running ? 'stop' : 'start';
    try {
      const res = await fetch(getApiUrl(`/api/autonomous/${endpoint}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'default' }),
      });
      if (res.ok) await fetchData();
    } catch {
      /* silent */
    }
  };

  // Step 6: Start polling build progress after trigger returns cycle_id
  const startBuildPolling = useCallback(() => {
    stopBuildPolling();
    buildPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(getApiUrl('/api/ota/build-status'));
        if (res.ok) {
          const progress: OtaBuildProgress = await res.json();
          setBuildProgress(progress);

          if (progress.completed) {
            stopBuildPolling();

            if (progress.success && progress.restart_required) {
              // Build succeeded — initiate restart sequence
              const prevVer = ota?.current_version || 'unknown';
              setPreviousVersion(prevVer);
              setRestarting(true);
              setOtaMessage('Build complete \u2014 restarting in 3...');
              let count = 3;
              setRestartCountdown(count);
              const timer = setInterval(() => {
                count--;
                setRestartCountdown(count);
                if (count <= 0) {
                  clearInterval(timer);
                  // Try Electron restart first, fall back to backend restart
                  if (window.electron?.restartApp) {
                    window.electron.restartApp();
                  } else {
                    fetch(getApiUrl('/api/ota/restart'), { method: 'POST' }).catch(() => {});
                  }
                  pollForReconnect(prevVer);
                }
              }, 1000);
            } else if (progress.success === false) {
              setOtaMessage(`Build failed: ${progress.message}`);
              setOtaBusy(false);
            }
          }
        }
      } catch {
        /* server may be down during restart */
      }
    }, POLL_INTERVAL);
  }, [stopBuildPolling, ota?.current_version, pollForReconnect]);

  // Step 6: Refactored triggerOta — non-blocking flow
  const triggerOta = async (dryRun: boolean) => {
    setOtaBusy(true);
    setOtaMessage(dryRun ? 'Running dry-run...' : 'Triggering OTA build...');
    setBuildProgress(null);
    try {
      const res = await fetch(getApiUrl('/api/ota/trigger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'default', dry_run: dryRun }),
      });
      if (res.ok) {
        const data: OtaTriggerResponse = await res.json();
        setOtaMessage(data.message);

        if (dryRun) {
          // Dry-run is synchronous — result comes back immediately
          setOtaBusy(false);
        } else if (data.triggered && data.cycle_id) {
          // Real build started — poll for progress
          startBuildPolling();
        } else {
          // Not triggered (e.g., build already in progress)
          setOtaBusy(false);
        }
        await fetchData();
      } else {
        setOtaMessage(`Trigger failed: HTTP ${res.status}`);
        setOtaBusy(false);
      }
    } catch (err) {
      setOtaMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      setOtaBusy(false);
    }
  };

  const totalTasks = (auto?.tasks_completed ?? 0) + (auto?.tasks_failed ?? 0);

  // Format elapsed seconds as "Xm Ys"
  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Phase display label
  const phaseLabel = (phase: string) => {
    switch (phase) {
      case 'building': return 'Building...';
      case 'testing': return 'Running tests...';
      case 'swapping': return 'Swapping binary...';
      case 'deploying': return 'Deploying...';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      default: return phase;
    }
  };

  if (loading) return <div className="p-4 text-sm" style={{ color: 'var(--sg-text-4)' }}>Loading...</div>;

  return (
    <div className="space-y-6">
      {/* OTA Status */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--sg-text-1)' }}>OTA Self-Build</h3>
          <div className="flex gap-2">
            <button
              data-testid="ota-dry-run-btn"
              onClick={() => triggerOta(true)}
              disabled={otaBusy}
              className="sg-btn px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
              style={{
                backgroundColor: hoverBtn === 'dry-run' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(56, 189, 248, 0.2)',
                color: 'var(--sg-sky)',
              }}
              onMouseEnter={() => setHoverBtn('dry-run')}
              onMouseLeave={() => setHoverBtn(null)}
            >
              Dry Run
            </button>
            <button
              data-testid="ota-trigger-btn"
              onClick={() => triggerOta(false)}
              disabled={otaBusy}
              className="sg-btn px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
              style={{
                backgroundColor: hoverBtn === 'trigger' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
                color: 'var(--sg-amber)',
              }}
              onMouseEnter={() => setHoverBtn('trigger')}
              onMouseLeave={() => setHoverBtn(null)}
            >
              Trigger OTA
            </button>
            <button
              data-testid="ota-force-restart-btn"
              className="sg-btn px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
              style={{
                backgroundColor: hoverBtn === 'force-restart' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                color: 'var(--sg-red)',
              }}
              onMouseEnter={() => setHoverBtn('force-restart')}
              onMouseLeave={() => setHoverBtn(null)}
              disabled={restarting || otaBusy}
              onClick={async () => {
                const prevVer = ota?.current_version || 'unknown';
                setPreviousVersion(prevVer);
                setRestarting(true);
                setRestartCountdown(0);
                try {
                  await fetch(getApiUrl('/api/ota/restart'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ force: true, reason: 'user_force_restart' }),
                  });
                } catch { /* expected — server is exiting */ }
                pollForReconnect(prevVer);
              }}
            >
              Force Restart
            </button>
          </div>
        </div>
        <div
          className="p-3 rounded-lg space-y-2"
          style={{
            border: '1px solid var(--sg-border)',
            backgroundColor: 'var(--sg-surface)',
          }}
        >
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--sg-text-4)' }}>Version</span>
            <span className="font-mono" style={{ color: 'var(--sg-text-1)' }}>{ota?.current_version || 'N/A'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--sg-text-4)' }}>Pipeline</span>
            <span
              className="font-medium"
              style={{ color: ota?.state === 'idle' ? 'var(--sg-emerald)' : 'var(--sg-sky)' }}
            >
              {ota?.state || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--sg-text-4)' }}>Improvements</span>
            <span style={{ color: 'var(--sg-text-1)' }}>{ota?.pending_improvements ?? 0}</span>
          </div>
          {otaMessage && !buildProgress && (
            <div
              className="text-xs pt-1"
              style={{ color: 'var(--sg-text-4)', borderTop: '1px solid var(--sg-border)' }}
            >
              {otaMessage}
            </div>
          )}
        </div>
      </div>

      {/* Step 6: Build Progress Card */}
      {buildProgress && !buildProgress.completed && (
        <div
          data-testid="ota-build-progress"
          className="p-3 rounded-lg"
          style={{
            border: '1px solid var(--sg-border)',
            backgroundColor: 'var(--sg-surface)',
            borderLeft: '3px solid var(--sg-sky, #38bdf8)',
          }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--sg-sky, #38bdf8)' }}>
              {phaseLabel(buildProgress.phase)}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--sg-text-4)' }}>
              {formatElapsed(buildProgress.elapsed_secs)}
            </span>
          </div>
          {/* Indeterminate progress bar */}
          <div
            className="w-full h-1 rounded-full overflow-hidden mb-2"
            style={{ backgroundColor: 'var(--sg-surface-2, #1e293b)' }}
          >
            <div
              className="h-full rounded-full animate-pulse"
              style={{
                width: '40%',
                background: 'var(--sg-sky, #38bdf8)',
                animation: 'ota-progress-slide 2s ease-in-out infinite',
              }}
            />
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--sg-text-4)' }}>{buildProgress.message}</div>
          <style>{`
            @keyframes ota-progress-slide {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(150%); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
        </div>
      )}

      {/* Build completed message */}
      {buildProgress?.completed && (
        <div
          data-testid="ota-build-result"
          className="p-3 rounded-lg"
          style={{
            border: '1px solid var(--sg-border)',
            backgroundColor: 'var(--sg-surface)',
            borderLeft: `3px solid ${buildProgress.success ? 'var(--sg-emerald, #34d399)' : 'var(--sg-red, #ef4444)'}`,
          }}
        >
          <div className="flex justify-between items-center mb-1">
            <span
              className="text-sm font-medium"
              style={{ color: buildProgress.success ? 'var(--sg-emerald, #34d399)' : 'var(--sg-red, #ef4444)' }}
            >
              {buildProgress.success ? 'Build Succeeded' : 'Build Failed'}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--sg-text-4)' }}>
              {formatElapsed(buildProgress.elapsed_secs)}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--sg-text-4)' }}>{buildProgress.message}</div>
        </div>
      )}

      {/* Restart status */}
      {restarting && (
        <div
          className="p-3 rounded-lg"
          style={{
            border: '1px solid var(--sg-border)',
            backgroundColor: 'var(--sg-surface)',
            borderLeft: '3px solid var(--sg-gold, #f59e0b)',
          }}
        >
          {restartCountdown > 0 ? (
            <div style={{ color: 'var(--sg-gold, #f59e0b)', fontSize: '0.875rem', fontWeight: 600 }}>
              Restarting in {restartCountdown}...
            </div>
          ) : reconnecting ? (
            <div style={{ color: 'var(--sg-sky, #38bdf8)', fontSize: '0.875rem' }}>
              <span className="animate-pulse">{'\u25CF'}</span> Reconnecting to backend...
              {reconnectMessage && !reconnectMessage.includes('failed') && !reconnectMessage.includes('Upgraded') && !reconnectMessage.includes('Rebuilt') && (
                <div className="text-xs mt-1" style={{ color: 'var(--sg-text-4)' }}>{reconnectMessage}</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {reconnectMessage && !reconnecting && (
        <div
          className="p-3 rounded-lg"
          style={{
            border: '1px solid var(--sg-border)',
            backgroundColor: 'var(--sg-surface)',
            borderLeft: `3px solid ${reconnectMessage.includes('failed') ? 'var(--sg-red, #ef4444)' : 'var(--sg-emerald, #34d399)'}`,
            fontSize: '0.8125rem',
            color: reconnectMessage.includes('failed') ? 'var(--sg-red, #ef4444)' : 'var(--sg-emerald, #34d399)',
          }}
        >
          {reconnectMessage}
        </div>
      )}

      {/* Autonomous Daemon */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--sg-text-1)' }}>Autonomous Daemon</h3>
          <button
            onClick={toggleDaemon}
            className="sg-btn px-3 py-1 rounded text-xs font-medium"
            style={auto?.running ? {
              backgroundColor: hoverBtn === 'daemon-toggle' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
              color: 'var(--sg-red)',
            } : {
              backgroundColor: hoverBtn === 'daemon-toggle' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(52, 211, 153, 0.2)',
              color: 'var(--sg-emerald)',
            }}
            onMouseEnter={() => setHoverBtn('daemon-toggle')}
            onMouseLeave={() => setHoverBtn(null)}
          >
            {auto?.running ? 'Stop' : 'Start'}
          </button>
        </div>
        <div
          className="p-3 rounded-lg space-y-2"
          style={{
            border: '1px solid var(--sg-border)',
            backgroundColor: 'var(--sg-surface)',
          }}
        >
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--sg-text-4)' }}>Status</span>
            <span
              className="flex items-center gap-1.5"
              style={{ color: auto?.running ? 'var(--sg-emerald)' : 'var(--sg-text-4)' }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: auto?.running ? 'var(--sg-emerald)' : 'var(--sg-text-4)' }}
              />
              {auto?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--sg-text-4)' }}>Tasks</span>
            <span style={{ color: 'var(--sg-text-1)' }}>{totalTasks} ({auto?.tasks_completed ?? 0} OK / {auto?.tasks_failed ?? 0} failed)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--sg-text-4)' }}>Circuit Breaker</span>
            <span
              className="font-medium"
              style={{ color: auto?.circuit_breaker?.state === 'closed' ? 'var(--sg-emerald)' : 'var(--sg-red)' }}
            >
              {auto?.circuit_breaker?.state || 'Unknown'} (
              {auto?.circuit_breaker?.consecutive_failures ?? 0}/
              {auto?.circuit_breaker?.max_failures ?? 3})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
