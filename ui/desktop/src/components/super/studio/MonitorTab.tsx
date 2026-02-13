/**
 * MonitorTab -- Shows monitoring/health data from the agent pipeline.
 */

import type { StudioTabStatus } from './PlanTab';

export interface HealthMetric {
  label: string;
  value: string;
  status: StudioTabStatus;
  unit?: string;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface MonitorTabProps {
  status?: StudioTabStatus;
  metrics?: HealthMetric[];
  logs?: LogEntry[];
  uptime?: number;
}

const STATUS_COLORS: Record<StudioTabStatus, string> = {
  idle: 'var(--sg-text-4)',
  running: 'var(--sg-sky)',
  success: 'var(--sg-emerald)',
  error: 'var(--sg-red)',
};

const STATUS_LABELS: Record<StudioTabStatus, string> = {
  idle: 'Offline',
  running: 'Monitoring...',
  success: 'Healthy',
  error: 'Issues detected',
};

const LOG_COLORS: Record<string, string> = {
  info: 'var(--sg-text-3)',
  warn: 'var(--sg-amber)',
  error: 'var(--sg-red)',
};

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function MonitorTab({ status = 'idle', metrics, logs, uptime }: MonitorTabProps) {
  const hasMetrics = metrics && metrics.length > 0;
  const hasLogs = logs && logs.length > 0;
  const hasContent = hasMetrics || hasLogs;

  return (
    <div className="studio-tab-content" data-testid="monitor-tab">
      {/* Status indicator */}
      <div className="flex items-center gap-2" style={{ marginBottom: '0.75rem' }}>
        <span
          className="sg-status-dot"
          style={{ background: STATUS_COLORS[status], boxShadow: status === 'running' ? `0 0 6px ${STATUS_COLORS[status]}` : 'none' }}
        />
        <span style={{ color: STATUS_COLORS[status], fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {STATUS_LABELS[status]}
        </span>
        {uptime != null && (
          <span style={{ color: 'var(--sg-text-5)', fontSize: '0.6875rem', marginLeft: 'auto' }}>
            Uptime: {formatUptime(uptime)}
          </span>
        )}
      </div>

      {hasContent ? (
        <div className="space-y-3">
          {/* Health metrics grid */}
          {hasMetrics && (
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((metric, i) => (
                <div key={i} className="sg-card" style={{ padding: '0.625rem 0.75rem' }}>
                  <div style={{ color: 'var(--sg-text-4)', fontSize: '0.6875rem', marginBottom: '0.25rem' }}>
                    {metric.label}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span style={{ color: STATUS_COLORS[metric.status], fontSize: '1rem', fontWeight: 700 }}>
                      {metric.value}
                    </span>
                    {metric.unit && (
                      <span style={{ color: 'var(--sg-text-5)', fontSize: '0.6875rem' }}>
                        {metric.unit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Log stream */}
          {hasLogs && (
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.375rem' }}>
                Logs
              </div>
              <div className="sg-card" style={{
                padding: '0.5rem',
                maxHeight: '150px',
                overflowY: 'auto',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: '0.6875rem',
              }}>
                {logs.map((entry, i) => (
                  <div key={i} style={{ padding: '0.125rem 0', display: 'flex', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--sg-text-5)', flexShrink: 0, width: '52px' }}>
                      {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ color: LOG_COLORS[entry.level], flexShrink: 0, width: '36px', fontWeight: 600 }}>
                      {entry.level.toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--sg-text-3)' }}>
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No monitoring data available. Health metrics will appear here when a pipeline is active.
        </div>
      )}
    </div>
  );
}
