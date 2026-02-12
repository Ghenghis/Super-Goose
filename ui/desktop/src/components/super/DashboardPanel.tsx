export default function DashboardPanel() {
  const stats = [
    { label: 'Active Agents', value: '0', color: 'var(--sg-emerald)' },
    { label: 'Tasks Today', value: '0', color: 'var(--sg-indigo)' },
    { label: 'Session Cost', value: '$0.00', color: 'var(--sg-gold)' },
    { label: 'Success Rate', value: '--', color: 'var(--sg-violet)' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map(s => (
          <div key={s.label} className="sg-card">
            <div className="text-xs" style={{ color: 'var(--sg-text-4)' }}>{s.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <div className="sg-section-label">Quick Actions</div>
        <div className="flex flex-wrap gap-2">
          <button className="sg-btn sg-btn-primary">New Task</button>
          <button className="sg-btn sg-btn-ghost">Run Tests</button>
          <button className="sg-btn sg-btn-ghost">Open Studio</button>
        </div>
      </div>

      {/* Hardware status */}
      <div>
        <div className="sg-section-label">Hardware</div>
        <div className="sg-card space-y-3">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>GPU</span>
            <span className="sg-badge sg-badge-emerald">
              <span className="sg-status-dot sg-status-idle" />
              Not detected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>CPU</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>Idle</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Memory</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>--</span>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="sg-section-label">Recent Activity</div>
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No recent activity
        </div>
      </div>
    </div>
  );
}
