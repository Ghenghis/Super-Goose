import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:3284';
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollForReconnect = useCallback(async (prevVersion: string) => {
    setReconnecting(true);
    setReconnectMessage(null);
    const maxAttempts = 30; // 60s at 2s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch(`${API_BASE}/api/version`);
        if (res.ok) {
          const data = await res.json();
          const newVersion = data.version || 'unknown';
          setReconnecting(false);
          setRestarting(false);
          if (newVersion !== prevVersion) {
            setReconnectMessage(`Reconnected — running v${newVersion} (was v${prevVersion})`);
          } else {
            setReconnectMessage(`Reconnected — v${newVersion}`);
          }
          return;
        }
      } catch { /* still down */ }
    }
    setReconnecting(false);
    setRestarting(false);
    setReconnectMessage('Restart failed — backend unreachable after 60s');
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [otaRes, autoRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/ota/status`),
        fetch(`${API_BASE}/api/autonomous/status`),
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
    };
  }, [fetchData]);

  const toggleDaemon = async () => {
    const endpoint = auto?.running ? 'stop' : 'start';
    try {
      const res = await fetch(`${API_BASE}/api/autonomous/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'default' }),
      });
      if (res.ok) await fetchData();
    } catch {
      /* silent */
    }
  };

  const triggerOta = async (dryRun: boolean) => {
    setOtaBusy(true);
    setOtaMessage(dryRun ? 'Running dry-run...' : 'Triggering OTA build...');
    try {
      const res = await fetch(`${API_BASE}/api/ota/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'default', dry_run: dryRun }),
      });
      if (res.ok) {
        const data: OtaTriggerResponse = await res.json();
        setOtaMessage(data.message);
        if (data.restart_required) {
          const prevVer = ota?.current_version || 'unknown';
          setPreviousVersion(prevVer);
          setRestarting(true);
          setOtaMessage('OTA complete — restarting in 3...');
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
                fetch(`${API_BASE}/api/ota/restart`, { method: 'POST' }).catch(() => {});
              }
              // Start polling for reconnection
              pollForReconnect(prevVer);
            }
          }, 1000);
        }
        await fetchData();
      } else {
        setOtaMessage(`Trigger failed: HTTP ${res.status}`);
      }
    } catch (err) {
      setOtaMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setOtaBusy(false);
  };

  const totalTasks = (auto?.tasks_completed ?? 0) + (auto?.tasks_failed ?? 0);

  if (loading) return <div className="p-4 text-sm text-text-muted">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* OTA Status */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-text-default">OTA Self-Build</h3>
          <div className="flex gap-2">
            <button
              data-testid="ota-dry-run-btn"
              onClick={() => triggerOta(true)}
              disabled={otaBusy}
              className="px-3 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50"
            >
              Dry Run
            </button>
            <button
              data-testid="ota-trigger-btn"
              onClick={() => triggerOta(false)}
              disabled={otaBusy}
              className="px-3 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
            >
              Trigger OTA
            </button>
            <button
              data-testid="ota-force-restart-btn"
              className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
              disabled={restarting || otaBusy}
              onClick={async () => {
                const prevVer = ota?.current_version || 'unknown';
                setPreviousVersion(prevVer);
                setRestarting(true);
                setRestartCountdown(0);
                try {
                  await fetch(`${API_BASE}/api/ota/restart`, {
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
        <div className="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Version</span>
            <span className="text-text-default font-mono">{ota?.current_version || 'N/A'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Pipeline</span>
            <span
              className={`font-medium ${ota?.state === 'idle' ? 'text-green-500' : 'text-blue-500'}`}
            >
              {ota?.state || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Improvements</span>
            <span className="text-text-default">{ota?.pending_improvements ?? 0}</span>
          </div>
          {otaMessage && (
            <div className="text-xs text-text-muted pt-1 border-t border-border-default">
              {otaMessage}
            </div>
          )}
        </div>
      </div>

      {/* Restart status */}
      {restarting && (
        <div className="p-3 rounded-lg border border-border-default bg-background-default" style={{ borderLeft: '3px solid var(--sg-gold, #f59e0b)' }}>
          {restartCountdown > 0 ? (
            <div style={{ color: 'var(--sg-gold, #f59e0b)', fontSize: '0.875rem', fontWeight: 600 }}>
              Restarting in {restartCountdown}...
            </div>
          ) : reconnecting ? (
            <div style={{ color: 'var(--sg-sky, #38bdf8)', fontSize: '0.875rem' }}>
              <span className="animate-pulse">●</span> Reconnecting to backend...
            </div>
          ) : null}
        </div>
      )}

      {reconnectMessage && (
        <div
          className="p-3 rounded-lg border border-border-default bg-background-default"
          style={{
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
          <h3 className="text-sm font-medium text-text-default">Autonomous Daemon</h3>
          <button
            onClick={toggleDaemon}
            className={`px-3 py-1 rounded text-xs font-medium ${
              auto?.running
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {auto?.running ? 'Stop' : 'Start'}
          </button>
        </div>
        <div className="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Status</span>
            <span
              className={`flex items-center gap-1.5 ${auto?.running ? 'text-green-500' : 'text-text-muted'}`}
            >
              <div
                className={`w-2 h-2 rounded-full ${auto?.running ? 'bg-green-500' : 'bg-gray-400'}`}
              />
              {auto?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Tasks</span>
            <span className="text-text-default">{totalTasks} ({auto?.tasks_completed ?? 0} OK / {auto?.tasks_failed ?? 0} failed)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Circuit Breaker</span>
            <span
              className={`font-medium ${auto?.circuit_breaker?.state === 'closed' ? 'text-green-500' : 'text-red-500'}`}
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
