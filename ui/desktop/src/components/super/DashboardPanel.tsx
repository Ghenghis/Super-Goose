import { useSuperGooseData } from '../../hooks/useSuperGooseData';
import { useAgentStream } from '../../hooks/useAgentStream';
import { SGMetricCard, SGEmptyState } from './shared';

export default function DashboardPanel() {
  const { learningStats, costSummary, autonomousStatus, loading } = useSuperGooseData();
  const { events, connected } = useAgentStream();

  const activeAgents = autonomousStatus?.running ? '1' : '0';
  const tasksToday = autonomousStatus?.task_count != null ? String(autonomousStatus.task_count) : 'N/A';
  const sessionCost = costSummary?.session_cost != null ? `$${costSummary.session_cost.toFixed(2)}` : 'N/A';
  const successRate = learningStats?.success_rate != null ? `${Math.round(learningStats.success_rate * 100)}%` : 'N/A';

  const stats = [
    { label: 'Active Agents', value: loading ? '...' : activeAgents, color: 'var(--sg-emerald)' },
    { label: 'Tasks Today', value: loading ? '...' : tasksToday, color: 'var(--sg-indigo)' },
    { label: 'Session Cost', value: loading ? '...' : sessionCost, color: 'var(--sg-gold)' },
    { label: 'Success Rate', value: loading ? '...' : successRate, color: 'var(--sg-violet)' },
  ];

  const recentEvents = events.slice(-5).reverse();

  return (
    <div className="space-y-6" role="region" aria-label="Super-Goose Dashboard">
      {/* Stats grid */}
      <section aria-label="Key metrics">
        <h2 className="sr-only">Key Metrics</h2>
        <div className="grid grid-cols-2 gap-4" role="list">
          {stats.map(s => (
            <div key={s.label} role="listitem">
              <SGMetricCard label={s.label} value={s.value} color={s.color} />
            </div>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <h2 className="sg-section-label">Quick Actions</h2>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Quick action buttons">
          <button className="sg-btn sg-btn-primary">New Task</button>
          <button className="sg-btn sg-btn-ghost">Run Tests</button>
          <button className="sg-btn sg-btn-ghost">Open Studio</button>
        </div>
      </section>

      {/* Hardware status */}
      <section aria-label="Hardware status">
        <h2 className="sg-section-label">Hardware</h2>
        <div className="sg-card space-y-3" role="list" aria-label="Hardware resources">
          <div className="flex items-center justify-between" role="listitem">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>GPU</span>
            <span className="sg-badge sg-badge-emerald">
              <span className="sg-status-dot sg-status-idle" aria-hidden="true" />
              Not detected
            </span>
          </div>
          <div className="flex items-center justify-between" role="listitem">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>CPU</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>Idle</span>
          </div>
          <div className="flex items-center justify-between" role="listitem">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Memory</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>--</span>
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section aria-label="Recent activity">
        <h2 className="sg-section-label">
          Recent Activity
          {connected && <span className="sg-badge sg-badge-emerald" aria-label="Live updates active" style={{ marginLeft: '0.5rem', fontSize: '0.625rem' }}>LIVE</span>}
        </h2>
        {recentEvents.length > 0 ? (
          <div className="sg-card space-y-2" role="log" aria-label="Activity feed" aria-live="polite" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {recentEvents.map((evt, i) => (
              <div key={i} className="flex items-center gap-2" style={{ fontSize: '0.8125rem' }}>
                <span className="sg-status-dot sg-status-active" aria-hidden="true" />
                <span style={{ color: 'var(--sg-text-3)' }}>{evt.type.replace(/_/g, ' ')}</span>
                {evt.core != null && <span className="sg-badge sg-badge-indigo" style={{ fontSize: '0.625rem' }}>{String(evt.core)}</span>}
              </div>
            ))}
          </div>
        ) : (
          <SGEmptyState message="No recent activity" />
        )}
      </section>
    </div>
  );
}
