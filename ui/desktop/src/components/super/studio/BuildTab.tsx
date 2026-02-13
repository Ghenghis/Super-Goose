/**
 * BuildTab -- Shows build status from the agent pipeline.
 */

import type { StudioTabStatus } from './PlanTab';

export interface BuildStep {
  name: string;
  status: StudioTabStatus;
  duration?: number;
  output?: string;
}

export interface BuildTabProps {
  status?: StudioTabStatus;
  steps?: BuildStep[];
  command?: string;
  output?: string;
}

const STATUS_COLORS: Record<StudioTabStatus, string> = {
  idle: 'var(--sg-text-4)',
  running: 'var(--sg-sky)',
  success: 'var(--sg-emerald)',
  error: 'var(--sg-red)',
};

const STATUS_LABELS: Record<StudioTabStatus, string> = {
  idle: 'Idle',
  running: 'Building...',
  success: 'Build succeeded',
  error: 'Build failed',
};

const STEP_ICONS: Record<StudioTabStatus, string> = {
  idle: '\u25CB',
  running: '\u25D4',
  success: '\u25CF',
  error: '\u25CF',
};

export function BuildTab({ status = 'idle', steps, command, output }: BuildTabProps) {
  const hasSteps = steps && steps.length > 0;

  return (
    <div className="studio-tab-content" data-testid="build-tab">
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

      {/* Build command */}
      {command && (
        <div style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '0.75rem',
          color: 'var(--sg-text-3)',
          background: 'var(--sg-bg)',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          marginBottom: '0.75rem',
          border: '1px solid var(--sg-border)',
        }}>
          <span style={{ color: 'var(--sg-emerald)' }}>$</span> {command}
        </div>
      )}

      {hasSteps ? (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="sg-card" style={{ padding: '0.625rem 0.75rem' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: STATUS_COLORS[step.status], fontSize: '0.75rem' }}>
                  {STEP_ICONS[step.status]}
                </span>
                <span style={{ color: 'var(--sg-text-2)', fontSize: '0.8125rem', flex: 1 }}>
                  {step.name}
                </span>
                {step.duration != null && (
                  <span style={{ color: 'var(--sg-text-5)', fontSize: '0.6875rem' }}>
                    {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(1)}s`}
                  </span>
                )}
                <span className="sg-badge" style={{
                  background: `color-mix(in srgb, ${STATUS_COLORS[step.status]} 15%, transparent)`,
                  color: STATUS_COLORS[step.status],
                  border: `1px solid color-mix(in srgb, ${STATUS_COLORS[step.status]} 30%, transparent)`,
                  fontSize: '0.625rem',
                }}>
                  {step.status === 'running' ? 'RUNNING' : step.status === 'success' ? 'DONE' : step.status === 'error' ? 'FAIL' : 'PENDING'}
                </span>
              </div>
              {step.output && (
                <pre style={{
                  margin: '0.5rem 0 0',
                  padding: '0.375rem',
                  background: 'var(--sg-bg)',
                  borderRadius: '0.25rem',
                  fontSize: '0.6875rem',
                  color: 'var(--sg-text-4)',
                  overflow: 'auto',
                  maxHeight: '80px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}>
                  {step.output}
                </pre>
              )}
            </div>
          ))}
        </div>
      ) : output ? (
        <pre className="sg-card" style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '0.75rem',
          color: 'var(--sg-text-3)',
          overflow: 'auto',
          maxHeight: '200px',
          whiteSpace: 'pre-wrap',
        }}>
          {output}
        </pre>
      ) : (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No build activity. Build output will appear here during compilation.
        </div>
      )}
    </div>
  );
}
