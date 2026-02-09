import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';

const CONSCIOUS_API = 'http://localhost:8999';

interface MemoryStatus {
  session: {
    session_id: string;
    entry_count: number;
    session_duration_s: number;
    speakers: { user: number; conscious: number };
  };
  recent_transcript: string[];
}

export default function MemoryPanel() {
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/memory/status`, { signal });
      if (res.ok) {
        setStatus(await res.json());
        setError('');
      } else {
        setError('Failed to fetch memory status');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError('Memory API not reachable');
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

  const clearMemory = async () => {
    setClearing(true);
    setError('');
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'clear memory' }),
      });
      if (!res.ok) {
        setError('Failed to clear memory');
      }
      await fetchStatus();
    } catch {
      setError('Memory API not reachable');
    }
    setClearing(false);
  };

  const session = status?.session;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-text-subtlest" />
          <span className="text-sm font-medium">Conversation Memory</span>
        </div>
        <button
          onClick={clearMemory}
          disabled={clearing || !session?.entry_count}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
          aria-label="Clear conversation history"
        >
          <Trash2 className="h-3 w-3" />
          {clearing ? 'Clearing...' : 'Clear'}
        </button>
      </div>

      {error && <div className="text-xs text-red-400" role="alert">{error}</div>}

      {session ? (
        <div className="grid grid-cols-3 gap-2 text-center" aria-live="polite" role="status">
          <div className="p-2 rounded bg-surface-secondary">
            <div className="text-lg font-semibold">{session.entry_count}</div>
            <div className="text-xs text-text-subtlest">Messages</div>
          </div>
          <div className="p-2 rounded bg-surface-secondary">
            <div className="text-lg font-semibold">{session.speakers?.user || 0}</div>
            <div className="text-xs text-text-subtlest">You</div>
          </div>
          <div className="p-2 rounded bg-surface-secondary">
            <div className="text-lg font-semibold">{session.speakers?.conscious || 0}</div>
            <div className="text-xs text-text-subtlest">Conscious</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-text-subtlest" role="status">Memory unavailable</div>
      )}
    </div>
  );
}