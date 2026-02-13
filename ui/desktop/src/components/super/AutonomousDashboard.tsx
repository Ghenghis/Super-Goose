import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:3284';

interface OtaStatus {
  current_version: string;
  last_check: string | null;
  pipeline_state: string;
  improvements_applied: number;
}

interface AutonomousStatus {
  running: boolean;
  task_count: number;
  uptime_seconds: number;
  circuit_breaker: {
    state: string;
    failure_count: number;
    max_failures: number;
  };
}

export default function AutonomousDashboard() {
  const [ota, setOta] = useState<OtaStatus | null>(null);
  const [auto, setAuto] = useState<AutonomousStatus | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="p-4 text-sm text-text-muted">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* OTA Status */}
      <div>
        <h3 className="text-sm font-medium text-text-default mb-2">OTA Self-Build</h3>
        <div className="p-3 rounded-lg border border-border-default bg-background-default space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Version</span>
            <span className="text-text-default font-mono">{ota?.current_version || 'N/A'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Pipeline</span>
            <span
              className={`font-medium ${ota?.pipeline_state === 'idle' ? 'text-green-500' : 'text-blue-500'}`}
            >
              {ota?.pipeline_state || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Improvements</span>
            <span className="text-text-default">{ota?.improvements_applied ?? 0}</span>
          </div>
        </div>
      </div>

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
            <span className="text-text-default">{auto?.task_count ?? 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Circuit Breaker</span>
            <span
              className={`font-medium ${auto?.circuit_breaker?.state === 'closed' ? 'text-green-500' : 'text-red-500'}`}
            >
              {auto?.circuit_breaker?.state || 'Unknown'} (
              {auto?.circuit_breaker?.failure_count ?? 0}/
              {auto?.circuit_breaker?.max_failures ?? 3})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
