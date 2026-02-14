import { useState, useEffect, useCallback } from 'react';
import { Brain, Activity, Mic, ChevronDown, ChevronRight } from 'lucide-react';
import VoiceToggle from '../../conscious/VoiceToggle';
import OutputWaveform from '../../conscious/OutputWaveform';
import PersonalitySelector from '../../conscious/PersonalitySelector';
import consciousBridge from '../../conscious/ConsciousBridge';
import EmotionVisualizer from '../../conscious/EmotionVisualizer';
import MemoryPanel from '../../conscious/MemoryPanel';
import WakeWordIndicator from '../../conscious/WakeWordIndicator';
import CapabilitiesList from '../../conscious/CapabilitiesList';
import CreatorPanel from '../../conscious/CreatorPanel';
import TestingDashboard from '../../conscious/TestingDashboard';
import SkillManager from '../../conscious/SkillManager';

import { CONSCIOUS_API } from '../../conscious/consciousConfig';

interface ConsciousStatus {
  enabled: boolean;
  goose_reachable: boolean;
  queue_busy: boolean;
  queue_size: number;
}

interface EmotionStatus {
  enabled: boolean;
  model_loaded: boolean;
  mood?: {
    dominant_emotion: string;
    trend: string;
    avg_valence: number;
  };
}
function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg bg-surface-primary border border-border-subtle">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-4 text-left"
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title} section`}
      >
        <span className="text-sm font-medium">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-text-subtlest" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-text-subtlest" aria-hidden="true" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function ConsciousSection() {
  const [agenticStatus, setAgenticStatus] = useState<ConsciousStatus | null>(null);
  const [emotionStatus, setEmotionStatus] = useState<EmotionStatus | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [isVoiceActive] = useState(false);
  const [error, setError] = useState('');

  const fetchStatuses = useCallback(async (signal?: AbortSignal) => {
    try {
      const [agRes, emRes] = await Promise.all([
        fetch(`${CONSCIOUS_API}/api/agentic/status`, { signal }).catch(() => null),
        fetch(`${CONSCIOUS_API}/api/emotion/status`, { signal }).catch(() => null),
      ]);
      if (agRes?.ok) setAgenticStatus(await agRes.json());
      if (emRes?.ok) setEmotionStatus(await emRes.json());
      setError('');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError('Conscious API not reachable');
      }
    }
  }, []);
  useEffect(() => {
    const abortController = new AbortController();
    fetchStatuses(abortController.signal);
    const interval = setInterval(() => fetchStatuses(abortController.signal), 5000);

    consciousBridge.on('set_theme', (params) => {
      const theme = params.theme as string;
      if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    });

    consciousBridge.on('toggle_agentic', async (params) => {
      const enabled = params.enabled as boolean;
      await fetch(`${CONSCIOUS_API}/api/agentic/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }).catch(() => null);
      fetchStatuses();
    });

    consciousBridge.on('toggle_emotion', async (params) => {
      const enabled = params.enabled as boolean;
      await fetch(`${CONSCIOUS_API}/api/emotion/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }).catch(() => null);
      fetchStatuses();
    });

    consciousBridge.on('switch_personality', async (params) => {
      const profile = params.profile as string;
      await fetch(`${CONSCIOUS_API}/api/personality/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      }).catch(() => null);
      fetchStatuses();
    });

    consciousBridge.on('refresh_status', () => {
      fetchStatuses();
    });

    consciousBridge.on('navigate', (params) => {
      const target = params.target as string;
      if (target && typeof target === 'string') {
        window.location.hash = target;
      }
    });

    consciousBridge.on('notify', (params) => {
      const message = params.message as string;
      const level = (params.level as string) || 'info';
      if (level === 'error') {
        setError(message);
      }
    });

    consciousBridge.on('set_volume', (params) => {
      const volume = params.volume as number;
      if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
        const audioElements = document.querySelectorAll('audio, video');
        audioElements.forEach((el) => {
          (el as HTMLMediaElement).volume = volume;
        });
      }
    });
    consciousBridge.on('set_model', async (params) => {
      const model = params.model as string;
      if (model && typeof model === 'string') {
        await fetch(`${CONSCIOUS_API}/api/agent/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `set model ${model}` }),
        }).catch(() => null);
        fetchStatuses();
      }
    });

    consciousBridge.on('toggle_voice', async (params) => {
      const enabled = params.enabled as boolean;
      await fetch(`${CONSCIOUS_API}/api/wake-vad/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ always_listen: enabled }),
      }).catch(() => null);
    });

    consciousBridge.on('toggle_sidebar', (params) => {
      const visible = params.visible as boolean;
      const sidebar = document.querySelector('[data-sidebar]');
      if (sidebar) {
        sidebar.setAttribute('data-state', visible ? 'open' : 'closed');
      }
    });

    consciousBridge.on('zoom_in', () => {
      const current = parseFloat(document.documentElement.style.fontSize || '16');
      document.documentElement.style.fontSize = `${Math.min(current + 2, 24)}px`;
    });

    consciousBridge.on('zoom_out', () => {
      const current = parseFloat(document.documentElement.style.fontSize || '16');
      document.documentElement.style.fontSize = `${Math.max(current - 2, 10)}px`;
    });

    consciousBridge.on('show_notification', (params) => {
      const message = params.message as string;
      const level = (params.level as string) || 'info';
      if (level === 'error') {
        setError(message);
      }
    });

    consciousBridge.connect();

    const checkBridge = setInterval(() => {
      setBridgeConnected(consciousBridge.isConnected);
    }, 2000);

    return () => {
      abortController.abort();
      clearInterval(interval);
      clearInterval(checkBridge);
      consciousBridge.off('set_theme');
      consciousBridge.off('toggle_agentic');
      consciousBridge.off('toggle_emotion');
      consciousBridge.off('switch_personality');
      consciousBridge.off('refresh_status');
      consciousBridge.off('navigate');
      consciousBridge.off('notify');
      consciousBridge.off('set_volume');
      consciousBridge.off('set_model');
      consciousBridge.off('toggle_voice');
      consciousBridge.off('toggle_sidebar');
      consciousBridge.off('zoom_in');
      consciousBridge.off('zoom_out');
      consciousBridge.off('show_notification');
      consciousBridge.disconnect();
    };
  }, [fetchStatuses]);
  const toggleEmotion = async () => {
    const enabled = !(emotionStatus?.enabled);
    try {
      await fetch(`${CONSCIOUS_API}/api/emotion/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await fetchStatuses();
    } catch {
      setError('Failed to toggle emotion engine');
    }
  };

  const toggleAgentic = async () => {
    const enabled = !(agenticStatus?.enabled);
    try {
      await fetch(`${CONSCIOUS_API}/api/agentic/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await fetchStatuses();
    } catch {
      setError('Failed to toggle agentic layer');
    }
  };
  return (
    <div className="space-y-6 pr-4 pb-8 mt-1">
      {error && (
        <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm flex items-center gap-2" role="alert">
          <Activity className="h-4 w-4" aria-hidden="true" />
          {error} — Start Conscious with: <code className="bg-surface-secondary px-1 rounded">python -m conscious</code>
        </div>
      )}

      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-primary border border-border-subtle">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-purple-400" aria-hidden="true" />
          <div>
            <h3 className="font-medium">Conscious Agent</h3>
            <p className="text-xs text-text-subtlest">
              Voice AI + Emotion + Personality + Agentic Control
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" aria-live="polite" role="status">
          <span className={`w-2 h-2 rounded-full ${agenticStatus ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
          <span className="text-xs text-text-subtlest">
            {agenticStatus ? 'Connected' : 'Offline'}
          </span>
          {agenticStatus?.goose_reachable && (
            <span className="text-xs text-green-500">Goose OK</span>
          )}
        </div>
      </div>
      {/* Voice Controls Row */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-primary border border-border-subtle">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-text-subtlest" aria-hidden="true" />
            <span className="text-sm font-medium">Voice</span>
          </div>
          <VoiceToggle />
          <OutputWaveform isActive={isVoiceActive} color="#7C3AED" />
        </div>
        <PersonalitySelector />
      </div>

      {/* Agentic Layer Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-primary border border-border-subtle">
        <div>
          <h3 className="text-sm font-medium">Agentic Layer</h3>
          <p className="text-xs text-text-subtlest">
            Intent routing, action execution, GooseBridge
            {agenticStatus?.queue_busy && ' — processing action...'}
          </p>
        </div>
        <button
          onClick={toggleAgentic}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            agenticStatus?.enabled
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-surface-secondary text-text-default hover:bg-surface-tertiary'
          }`}
          aria-label={agenticStatus?.enabled ? 'Disable agentic layer' : 'Enable agentic layer'}
          aria-pressed={agenticStatus?.enabled ?? false}
        >
          {agenticStatus?.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      {/* Emotion Engine Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-primary border border-border-subtle">
        <div>
          <h3 className="text-sm font-medium">Emotion Engine</h3>
          <p className="text-xs text-text-subtlest">
            Wav2Vec2 emotion detection
            {emotionStatus?.mood && ` — ${emotionStatus.mood.dominant_emotion} (${emotionStatus.mood.trend})`}
          </p>
        </div>
        <button
          onClick={toggleEmotion}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            emotionStatus?.enabled
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-surface-secondary text-text-default hover:bg-surface-tertiary'
          }`}
          aria-label={emotionStatus?.enabled ? 'Disable emotion engine' : 'Enable emotion engine'}
          aria-pressed={emotionStatus?.enabled ?? false}
        >
          {emotionStatus?.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* UI Bridge Status */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-primary border border-border-subtle">
        <div>
          <h3 className="text-sm font-medium">UI Bridge</h3>
          <p className="text-xs text-text-subtlest">
            WebSocket link for voice-controlled UI commands
          </p>
        </div>
        <div className="flex items-center gap-2" aria-live="polite" role="status">
          <span className={`w-2 h-2 rounded-full ${bridgeConnected ? 'bg-green-500' : 'bg-yellow-500'}`} aria-hidden="true" />
          <span className="text-xs text-text-subtlest">
            {bridgeConnected ? 'Connected' : 'Waiting...'}
          </span>
        </div>
      </div>
      {/* Emotion Visualizer */}
      <CollapsibleSection title="Emotion Visualizer" defaultOpen={true}>
        <EmotionVisualizer />
      </CollapsibleSection>

      {/* Wake Word + VAD */}
      <CollapsibleSection title="Wake Word + VAD">
        <WakeWordIndicator />
      </CollapsibleSection>

      {/* Conversation Memory */}
      <CollapsibleSection title="Conversation Memory">
        <MemoryPanel />
      </CollapsibleSection>

      {/* AI Creator */}
      <CollapsibleSection title="AI Creator">
        <CreatorPanel />
      </CollapsibleSection>

      {/* Testing & Self-Healing */}
      <CollapsibleSection title="Testing & Self-Healing">
        <TestingDashboard />
      </CollapsibleSection>

      {/* Capabilities */}
      <CollapsibleSection title="Capabilities">
        <CapabilitiesList />
      </CollapsibleSection>

      {/* Skills */}
      <CollapsibleSection title="Skill Manager">
        <SkillManager />
      </CollapsibleSection>
    </div>
  );
}