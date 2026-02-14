import { useState, useEffect, useCallback } from 'react';
import { Wand2, History, CheckCircle } from 'lucide-react';

import { CONSCIOUS_API } from './consciousConfig';

interface CreationResult {
  success: boolean;
  artifact_type: string;
  artifact_name: string;
  staging_path: string;
  needs_validation: boolean;
}

interface HistoryItem {
  type: string;
  name: string;
  timestamp: number;
  status: string;
  staging_path?: string;
}

export default function CreatorPanel() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreationResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/creator/history`, { signal });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        /* offline */
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchHistory]);

  const handleCreate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/creator/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      });
      if (res.ok) {
        setResult(await res.json());
        setInput('');
        await fetchHistory();
      } else {
        const err = await res.json();
        setError(err.error || 'Creation failed');
      }
    } catch {
      setError('Conscious API not reachable');
    }
    setLoading(false);
  };

  const handlePromote = async (stagingPath: string) => {
    if (!stagingPath || stagingPath.includes('..') || stagingPath.includes('~') || /[<>"|?*]/.test(stagingPath)) {
      setError('Invalid staging path');
      return;
    }
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/creator/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staging_path: stagingPath }),
      });
      if (res.ok) await fetchHistory();
      else setError('Promote failed');
    } catch {
      setError('Conscious API not reachable');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-text-subtlest" />
        <span className="text-sm font-medium">AI Creator</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="create a pirate personality..."
          className="flex-1 px-3 py-1.5 text-xs rounded bg-surface-secondary border border-border-subtle focus:outline-none focus:border-purple-500"
          disabled={loading}
          aria-label="Creation command"
        />
        <button
          onClick={handleCreate}
          disabled={loading || !input.trim()}
          className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
          aria-label="Create artifact"
        >
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>

      {error && <div className="text-xs text-red-400" role="alert">{error}</div>}

      {result?.success && (
        <div className="p-2 rounded bg-green-500/10 text-green-400 text-xs flex items-center gap-1" role="status" aria-live="polite">
          <CheckCircle className="h-3 w-3" />
          Created {result.artifact_type}: {result.artifact_name}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-text-subtlest">
            <History className="h-3 w-3" />
            Recent
          </div>
          {history.slice(0, 5).map((item, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded bg-surface-secondary text-xs">
              <div>
                <span className="font-medium">{item.name}</span>
                <span className="text-text-subtlest ml-1">({item.type})</span>
              </div>
              {item.staging_path && item.status !== 'promoted' && (
                <button
                  onClick={() => handlePromote(item.staging_path!)}
                  className="px-2 py-0.5 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors"
                  aria-label={`Promote ${item.name}`}
                >
                  Promote
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}