import { useState, useEffect, useCallback } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';

import { CONSCIOUS_API } from './consciousConfig';

interface VoiceStatus {
  enabled: boolean;
  listening_state: string;
  wake_loaded: boolean;
  vad_loaded: boolean;
  always_listen: boolean;
}

export default function VoiceToggle() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [muted, setMuted] = useState(false);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/wake-vad/status`, { signal });
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        /* Conscious not running */
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatus(controller.signal);
    const interval = setInterval(() => fetchStatus(controller.signal), 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  const toggleAlwaysListen = async () => {
    const newVal = !(status?.always_listen);
    try {
      await fetch(`${CONSCIOUS_API}/api/wake-vad/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ always_listen: newVal }),
      });
      await fetchStatus();
    } catch {
      /* offline */
    }
  };

  const toggleMute = () => {
    setMuted(!muted);
  };

  const stateColor = (state: string) => {
    switch (state) {
      case 'listening': return 'text-green-500';
      case 'wake_detected': return 'text-yellow-500';
      case 'processing': return 'text-blue-500';
      default: return 'text-text-subtlest';
    }
  };

  if (!status) return null;

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Voice controls">
      <button
        onClick={toggleAlwaysListen}
        className={`p-2 rounded-lg transition-colors ${
          status.always_listen || status.listening_state === 'listening'
            ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
            : 'bg-surface-secondary text-text-subtlest hover:bg-surface-tertiary'
        }`}
        aria-label={status.always_listen ? 'Disable always-listen mode' : 'Enable always-listen mode'}
        aria-pressed={status.always_listen}
      >
        <Mic className={`h-4 w-4 ${stateColor(status.listening_state)}`} aria-hidden="true" />
      </button>

      <button
        onClick={toggleMute}
        className={`p-2 rounded-lg transition-colors ${
          muted
            ? 'bg-red-500/10 text-red-400'
            : 'bg-surface-secondary text-text-subtlest hover:bg-surface-tertiary'
        }`}
        aria-label={muted ? 'Unmute audio output' : 'Mute audio output'}
        aria-pressed={muted}
      >
        {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
      </button>

      {status.listening_state !== 'idle' && (
        <span className={`text-xs ${stateColor(status.listening_state)}`} aria-live="polite" role="status">
          {status.listening_state === 'listening' && 'Listening'}
          {status.listening_state === 'wake_detected' && 'Wake detected'}
          {status.listening_state === 'processing' && 'Processing'}
        </span>
      )}
    </div>
  );
}