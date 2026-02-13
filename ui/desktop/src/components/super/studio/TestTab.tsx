/**
 * TestTab -- Shows test results from the agent pipeline.
 */

import type { StudioTabStatus } from './PlanTab';

export interface TestResult {
  name: string;
  suite?: string;
  passed: boolean;
  duration?: number;
  error?: string;
}

export interface TestTabProps {
  status?: StudioTabStatus;
  results?: TestResult[];
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

const STATUS_COLORS: Record<StudioTabStatus, string> = {
  idle: 'var(--sg-text-4)',
  running: 'var(--sg-sky)',
  success: 'var(--sg-emerald)',
  error: 'var(--sg-red)',
};

const STATUS_LABELS: Record<StudioTabStatus, string> = {
  idle: 'Idle',
  running: 'Running tests...',
  success: 'All passed',
  error: 'Failures detected',
};

export function TestTab({ status = 'idle', results, summary }: TestTabProps) {
  const hasResults = results && results.length > 0;

  return (
    <div className="studio-tab-content" data-testid="test-tab">
      {/* Status indicator */}
      <div className="flex items-center gap-2" style={{ marginBottom: '0.75rem' }}>
        <span
          className="sg-status-dot"
          style={{ background: STATUS_COLORS[status], boxShadow: status === 'running' ? `0 0 6px ${STATUS_COLORS[status]}` : 'none' }}
        />
        <span style={{ color: STATUS_COLORS[status], fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="sg-card" style={{ marginBottom: '0.75rem' }}>
          <div className="flex items-center gap-4" style={{ fontSize: '0.8125rem' }}>
            <span style={{ color: 'var(--sg-text-2)' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{summary.total}</span> total
            </span>
            <span style={{ color: 'var(--sg-emerald)' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{summary.passed}</span> passed
            </span>
            <span style={{ color: 'var(--sg-red)' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{summary.failed}</span> failed
            </span>
            {summary.skipped > 0 && (
              <span style={{ color: 'var(--sg-text-4)' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{summary.skipped}</span> skipped
              </span>
            )}
          </div>
          {/* Progress bar */}
          {summary.total > 0 && (
            <div className="sg-progress" style={{ marginTop: '0.5rem' }}>
              <div
                className="sg-progress-bar"
                style={{
                  width: `${Math.round((summary.passed / summary.total) * 100)}%`,
                  background: summary.failed > 0 ? 'var(--sg-red)' : 'var(--sg-emerald)',
                }}
              />
            </div>
          )}
        </div>
      )}

      {hasResults ? (
        <div className="space-y-1" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {results.map((result, i) => (
            <div key={i} className="flex items-center gap-2" style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              borderBottom: '1px solid var(--sg-border)',
            }}>
              <span style={{ color: result.passed ? 'var(--sg-emerald)' : 'var(--sg-red)', fontSize: '0.875rem' }}>
                {result.passed ? '\u2713' : '\u2717'}
              </span>
              <span style={{ color: 'var(--sg-text-2)', flex: 1 }}>
                {result.suite && <span style={{ color: 'var(--sg-text-4)', marginRight: '0.25rem' }}>{result.suite} &gt; </span>}
                {result.name}
              </span>
              {result.duration != null && (
                <span style={{ color: 'var(--sg-text-5)', fontSize: '0.6875rem' }}>
                  {result.duration}ms
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No test results yet. Tests will appear here when the agent runs them.
        </div>
      )}
    </div>
  );
}
