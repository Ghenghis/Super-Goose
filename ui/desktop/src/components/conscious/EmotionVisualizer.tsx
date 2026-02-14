import { useState, useEffect, useCallback } from 'react';
import { Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { CONSCIOUS_API } from './consciousConfig';

interface MoodData {
  dominant_emotion: string;
  trend: string;
  avg_valence: number;
  history: Array<{ emotion: string; confidence: number }>;
}

interface EmotionData {
  enabled: boolean;
  model_loaded: boolean;
  mood: MoodData;
  latest: { emotion: string; confidence: number; intensity: number } | null;
  should_offer_break: boolean;
}

const EMOTION_COLORS: Record<string, string> = {
  neutral: '#94a3b8',
  happy: '#22c55e',
  sad: '#3b82f6',
  angry: '#ef4444',
  fearful: '#a855f7',
  surprised: '#f59e0b',
  disgusted: '#84cc16',
  frustrated: '#f97316',
};

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-text-subtlest" />;
}

export default function EmotionVisualizer() {
  const [data, setData] = useState<EmotionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/emotion/status`, { signal });
      if (res.ok) setData(await res.json());
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        /* API unreachable */
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatus(controller.signal);
    const interval = setInterval(() => fetchStatus(controller.signal), 3000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="p-3 rounded-lg bg-surface-secondary text-text-subtlest text-sm" role="status">
        Loading emotion data...
      </div>
    );
  }

  if (!data?.enabled) {
    return (
      <div className="p-3 rounded-lg bg-surface-secondary text-text-subtlest text-sm" role="status">
        Emotion engine disabled
      </div>
    );
  }

  const emotion = data.mood?.dominant_emotion || 'neutral';
  const color = EMOTION_COLORS[emotion] || '#94a3b8';
  const valence = data.mood?.avg_valence ?? 0.5;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between" aria-live="polite" role="status">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4" style={{ color }} aria-hidden="true" />
          <span className="text-sm font-medium capitalize">{emotion}</span>
          {data.latest && (
            <span className="text-xs text-text-subtlest">
              {Math.round(data.latest.confidence * 100)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TrendIcon trend={data.mood?.trend || 'stable'} />
          <span className="text-xs text-text-subtlest capitalize">{data.mood?.trend || 'stable'}</span>
        </div>
      </div>

      {/* Valence bar */}
      <div
        className="h-2 rounded-full bg-surface-secondary overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(valence * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Emotional valence: ${Math.round(valence * 100)}%`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${valence * 100}%`,
            background: `linear-gradient(90deg, #ef4444, #f59e0b, #22c55e)`,
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-text-subtlest">
        <span>Negative</span>
        <span>Positive</span>
      </div>

      {data.should_offer_break && (
        <div className="p-2 rounded bg-yellow-500/10 text-yellow-500 text-xs" role="alert">
          You seem stressed — want to take a break?
        </div>
      )}
    </div>
  );
}