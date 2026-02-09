import { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Radio } from 'lucide-react';

const CONSCIOUS_API = 'http://localhost:8999';

interface WakeVADStatus {
  state: string;
  always_listen: boolean;
  wake_word_loaded: boolean;
  vad_loaded: boolean;
}

const STATE_CONFIG: Record<string, { color: string; label: string }> = {
  idle: { color: 'bg-gray-400', label: 'Idle' },
  listening: { color: 'bg-yellow-400', label: 'Listening...' },
  wake_detected: { color: 'bg-green-400', label: 'Wake Detected' },
  speech_active: { color: 'bg-blue-400', label: 'Speech Active' },
  stopped: { color: 'bg-red-400', label: 'Stopped' },
};

export default function WakeWordIndicator() {
  const [status, setStatus] = useState<WakeVADStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/wake-vad/status`, { signal });
      if (res.ok) {
        setStatus(await res.json());
        setError('');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError('Wake word API not reachable');
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatus(controller.signal);
    const interval = setInterval(() => fetchStatus(controller.signal), 2000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  const toggleAlwaysListen = async () => {
    setToggling(true);
    setError('');
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/wake-vad/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ always_listen: !status?.always_listen }),
      });
      if (!res.ok) {
        setError('Failed to toggle listen mode');
      }
      await fetchStatus();
    } catch {
      setError('Wake word API not reachable');
    }
    setToggling(false);
  };

  const state = status?.state || 'stopped';
  const config = STATE_CONFIG[state] || STATE_CONFIG.stopped;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-text-subtlest" aria-hidden="true" />
          <span className="text-sm font-medium">Wake Word + VAD</span>
        </div>
        <div className="flex items-center gap-2" aria-live="polite" role="status">
          <span className={`w-2.5 h-2.5 rounded-full ${config.color} animate-pulse`} aria-hidden="true" />
          <span className="text-xs text-text-subtlest">{config.label}</span>
        </div>
      </div>

      {error && <div className="text-xs text-red-400" role="alert">{error}</div>}

      {state === 'idle' && !status?.always_listen && (
        <p className="text-xs text-text-subtlest italic">
          Say &quot;Hey Goose&quot; to activate
        </p>
      )}

      <button
        onClick={toggleAlwaysListen}
        disabled={toggling}
        className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          status?.always_listen
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-surface-secondary text-text-default hover:bg-surface-tertiary'
        } disabled:opacity-50`}
        aria-label={status?.always_listen ? 'Disable always-listen mode' : 'Enable always-listen mode'}
        aria-pressed={status?.always_listen ?? false}
      >
        {status?.always_listen ? (
          <><Mic className="h-4 w-4" aria-hidden="true" /> Always Listening</>
        ) : (
          <><MicOff className="h-4 w-4" aria-hidden="true" /> Wake Word Required</>
        )}
      </button>
    </div>
  );
}