import { useState, useEffect, useCallback } from 'react';
import { TestTube, Wrench, CheckCircle, XCircle } from 'lucide-react';

const CONSCIOUS_API = 'http://localhost:8999';

interface ValidationResult {
  status: string;
  total: number;
  passed: number;
  failed: number;
  failures: string[];
  duration_ms: number;
}

interface HistoryEntry {
  type: string;
  timestamp: number;
  success: boolean;
  details: string;
}

export default function TestingDashboard() {
  const [feature, setFeature] = useState('');
  const [validating, setValidating] = useState(false);
  const [healing, setHealing] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/testing/history`, { signal });
      if (res.ok) {
        const data = await res.json();
        setHistory([
          ...(data.validation_history || []),
          ...(data.healing_history || []),
        ].slice(0, 10));
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

  const handleValidate = async () => {
    setValidating(true);
    setError('');
    setResult(null);
    try {
      const body: Record<string, string> = {};
      if (feature.trim()) body.feature_name = feature.trim();
      const res = await fetch(`${CONSCIOUS_API}/api/testing/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setResult(await res.json());
        await fetchHistory();
      } else {
        const err = await res.json();
        setError(err.error || 'Validation failed');
      }
    } catch {
      setError('Conscious API not reachable');
    }
    setValidating(false);
  };

  const handleHeal = async () => {
    if (!feature.trim()) return;
    setHealing(true);
    setError('');
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/testing/heal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staging_path: '',
          artifact_type: 'feature',
          description: feature,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({
          status: data.success ? 'passed' : 'failed',
          total: data.total_attempts,
          passed: data.success ? 1 : 0,
          failed: data.success ? 0 : 1,
          failures: data.error ? [data.error] : [],
          duration_ms: 0,
        });
        await fetchHistory();
      } else {
        const err = await res.json();
        setError(err.error || 'Healing failed');
      }
    } catch {
      setError('Conscious API not reachable');
    }
    setHealing(false);
  };

  const hasFailed = result && result.failed > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TestTube className="h-4 w-4 text-text-subtlest" />
        <span className="text-sm font-medium">Testing &amp; Self-Healing</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="Feature name (blank = full suite)"
          className="flex-1 px-3 py-1.5 text-xs rounded bg-surface-secondary border border-border-subtle focus:outline-none focus:border-purple-500"
          disabled={validating || healing}
          aria-label="Feature name to validate"
        />
        <button
          onClick={handleValidate}
          disabled={validating || healing}
          className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          aria-label="Run validation"
        >
          {validating ? 'Running...' : 'Validate'}
        </button>
        <button
          onClick={handleHeal}
          disabled={healing || validating || !hasFailed}
          className="px-3 py-1.5 text-xs rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
          aria-label="Run self-healing"
        >
          <Wrench className="h-3 w-3 inline mr-1" />
          {healing ? 'Healing...' : 'Heal'}
        </button>
      </div>

      {error && <div className="text-xs text-red-400" role="alert">{error}</div>}

      {result && (
        <div className={`p-2 rounded text-xs flex items-center gap-2 ${
          result.failed === 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`} role="status" aria-live="polite">
          {result.failed === 0 ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {result.passed}/{result.total} passed
          {result.duration_ms > 0 && ` (${(result.duration_ms / 1000).toFixed(1)}s)`}
        </div>
      )}

      {result?.failures && result.failures.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto" role="list" aria-label="Test failures">
          {result.failures.map((f, i) => (
            <div key={i} role="listitem" className="p-1.5 rounded bg-red-500/5 text-xs text-red-300 font-mono">
              {f}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="text-xs text-text-subtlest" aria-live="polite">
          {history.length} recent test run{history.length !== 1 ? 's' : ''} in history
        </div>
      )}
    </div>
  );
}