/**
 * PlanTab -- Shows current plan/reasoning from the agent pipeline.
 */

export type StudioTabStatus = 'idle' | 'running' | 'success' | 'error';

export interface PlanTabProps {
  status?: StudioTabStatus;
  reasoning?: string;
  steps?: string[];
}

const STATUS_COLORS: Record<StudioTabStatus, string> = {
  idle: 'var(--sg-text-4)',
  running: 'var(--sg-sky)',
  success: 'var(--sg-emerald)',
  error: 'var(--sg-red)',
};

const STATUS_LABELS: Record<StudioTabStatus, string> = {
  idle: 'Idle',
  running: 'Planning...',
  success: 'Complete',
  error: 'Error',
};

export function PlanTab({ status = 'idle', reasoning, steps }: PlanTabProps) {
  const hasContent = reasoning || (steps && steps.length > 0);

  return (
    <div className="studio-tab-content" data-testid="plan-tab">
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

      {hasContent ? (
        <div className="space-y-3">
          {reasoning && (
            <div className="sg-card" style={{ fontSize: '0.8125rem', color: 'var(--sg-text-2)', lineHeight: '1.6' }}>
              {reasoning}
            </div>
          )}
          {steps && steps.length > 0 && (
            <div className="sg-card">
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Steps
              </div>
              <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {steps.map((step, i) => (
                  <li key={i} style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem', padding: '0.125rem 0' }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No active plan. Start a task to see the reasoning pipeline.
        </div>
      )}
    </div>
  );
}
