/**
 * DeployTab -- Shows deployment status from the agent pipeline.
 */

import type { StudioTabStatus } from './PlanTab';

export interface DeployTarget {
  name: string;
  environment: string;
  status: StudioTabStatus;
  url?: string;
  timestamp?: number;
}

export interface DeployTabProps {
  status?: StudioTabStatus;
  targets?: DeployTarget[];
  currentEnvironment?: string;
}

const STATUS_COLORS: Record<StudioTabStatus, string> = {
  idle: 'var(--sg-text-4)',
  running: 'var(--sg-sky)',
  success: 'var(--sg-emerald)',
  error: 'var(--sg-red)',
};

const STATUS_LABELS: Record<StudioTabStatus, string> = {
  idle: 'Idle',
  running: 'Deploying...',
  success: 'Deployed',
  error: 'Deploy failed',
};

const ENV_COLORS: Record<string, string> = {
  development: 'var(--sg-sky)',
  staging: 'var(--sg-amber)',
  production: 'var(--sg-emerald)',
};

export function DeployTab({ status = 'idle', targets, currentEnvironment }: DeployTabProps) {
  const hasTargets = targets && targets.length > 0;

  return (
    <div className="studio-tab-content" data-testid="deploy-tab">
      {/* Status indicator */}
      <div className="flex items-center gap-2" style={{ marginBottom: '0.75rem' }}>
        <span
          className="sg-status-dot"
          style={{ background: STATUS_COLORS[status], boxShadow: status === 'running' ? `0 0 6px ${STATUS_COLORS[status]}` : 'none' }}
        />
        <span style={{ color: STATUS_COLORS[status], fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {STATUS_LABELS[status]}
        </span>
        {currentEnvironment && (
          <span className="sg-badge" style={{
            background: `color-mix(in srgb, ${ENV_COLORS[currentEnvironment] || 'var(--sg-text-4)'} 15%, transparent)`,
            color: ENV_COLORS[currentEnvironment] || 'var(--sg-text-4)',
            border: `1px solid color-mix(in srgb, ${ENV_COLORS[currentEnvironment] || 'var(--sg-text-4)'} 30%, transparent)`,
            fontSize: '0.625rem',
            marginLeft: 'auto',
          }}>
            {currentEnvironment.toUpperCase()}
          </span>
        )}
      </div>

      {hasTargets ? (
        <div className="space-y-2">
          {targets.map((target, i) => {
            const envColor = ENV_COLORS[target.environment] || 'var(--sg-text-4)';
            return (
              <div key={i} className="sg-card" style={{ padding: '0.75rem' }}>
                <div className="flex items-center gap-2">
                  <span
                    className="sg-status-dot"
                    style={{ background: STATUS_COLORS[target.status] }}
                  />
                  <span style={{ color: 'var(--sg-text-2)', fontSize: '0.8125rem', fontWeight: 500, flex: 1 }}>
                    {target.name}
                  </span>
                  <span className="sg-badge" style={{
                    background: `color-mix(in srgb, ${envColor} 15%, transparent)`,
                    color: envColor,
                    border: `1px solid color-mix(in srgb, ${envColor} 30%, transparent)`,
                    fontSize: '0.625rem',
                  }}>
                    {target.environment.toUpperCase()}
                  </span>
                </div>
                {target.url && (
                  <div style={{
                    marginTop: '0.375rem',
                    fontSize: '0.75rem',
                    color: 'var(--sg-indigo)',
                    fontFamily: 'monospace',
                  }}>
                    {target.url}
                  </div>
                )}
                {target.timestamp && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--sg-text-5)' }}>
                    {new Date(target.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No deployments yet. Deployment targets will appear here when configured.
        </div>
      )}
    </div>
  );
}
