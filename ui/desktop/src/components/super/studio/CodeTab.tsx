/**
 * CodeTab -- Shows code being generated or edited by the agent.
 */

import type { StudioTabStatus } from './PlanTab';

export interface CodeChange {
  file: string;
  language: string;
  diff?: string;
  action: 'create' | 'edit' | 'delete';
}

export interface CodeTabProps {
  status?: StudioTabStatus;
  changes?: CodeChange[];
  activeFile?: string;
}

const ACTION_BADGES: Record<string, { color: string; label: string }> = {
  create: { color: 'var(--sg-emerald)', label: 'NEW' },
  edit: { color: 'var(--sg-sky)', label: 'EDIT' },
  delete: { color: 'var(--sg-red)', label: 'DEL' },
};

const STATUS_COLORS: Record<StudioTabStatus, string> = {
  idle: 'var(--sg-text-4)',
  running: 'var(--sg-sky)',
  success: 'var(--sg-emerald)',
  error: 'var(--sg-red)',
};

const STATUS_LABELS: Record<StudioTabStatus, string> = {
  idle: 'Idle',
  running: 'Generating...',
  success: 'Complete',
  error: 'Error',
};

export function CodeTab({ status = 'idle', changes, activeFile }: CodeTabProps) {
  const hasChanges = changes && changes.length > 0;

  return (
    <div className="studio-tab-content" data-testid="code-tab">
      {/* Status indicator */}
      <div className="flex items-center gap-2" style={{ marginBottom: '0.75rem' }}>
        <span
          className="sg-status-dot"
          style={{ background: STATUS_COLORS[status], boxShadow: status === 'running' ? `0 0 6px ${STATUS_COLORS[status]}` : 'none' }}
        />
        <span style={{ color: STATUS_COLORS[status], fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {STATUS_LABELS[status]}
        </span>
        {activeFile && (
          <span style={{ color: 'var(--sg-text-3)', fontSize: '0.75rem', marginLeft: 'auto', fontFamily: 'monospace' }}>
            {activeFile}
          </span>
        )}
      </div>

      {hasChanges ? (
        <div className="space-y-2">
          {changes.map((change, i) => {
            const badge = ACTION_BADGES[change.action];
            return (
              <div key={i} className="sg-card" style={{ padding: '0.75rem' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: change.diff ? '0.5rem' : 0 }}>
                  <span style={{
                    color: badge.color,
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '0.0625rem 0.375rem',
                    borderRadius: '0.25rem',
                    background: `color-mix(in srgb, ${badge.color} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${badge.color} 30%, transparent)`,
                  }}>
                    {badge.label}
                  </span>
                  <span style={{ color: 'var(--sg-text-2)', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                    {change.file}
                  </span>
                  <span style={{ color: 'var(--sg-text-5)', fontSize: '0.6875rem', marginLeft: 'auto' }}>
                    {change.language}
                  </span>
                </div>
                {change.diff && (
                  <pre style={{
                    margin: 0,
                    padding: '0.5rem',
                    background: 'var(--sg-bg)',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    color: 'var(--sg-text-3)',
                    overflow: 'auto',
                    maxHeight: '120px',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  }}>
                    {change.diff}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No code changes yet. The agent will show edits here during execution.
        </div>
      )}
    </div>
  );
}
