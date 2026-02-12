export default function MonitorPanel() {
  return (
    <div className="space-y-6">
      {/* Cost tracker */}
      <div>
        <div className="sg-section-label">Cost Tracker</div>
        <div className="sg-card">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Session</div>
              <div style={{ color: 'var(--sg-gold)', fontSize: '1.25rem', fontWeight: 700 }}>$0.00</div>
            </div>
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Today</div>
              <div style={{ color: 'var(--sg-text-1)', fontSize: '1.25rem', fontWeight: 700 }}>$0.00</div>
            </div>
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Budget</div>
              <div style={{ color: 'var(--sg-emerald)', fontSize: '1.25rem', fontWeight: 700 }}>{'\u221E'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent stats */}
      <div>
        <div className="sg-section-label">Agent Statistics</div>
        <div className="sg-card">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Active Core</div>
              <div style={{ color: 'var(--sg-indigo)', fontSize: '0.875rem', fontWeight: 500 }}>FreeformCore</div>
            </div>
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Turns</div>
              <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>0</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live logs */}
      <div>
        <div className="sg-section-label">Live Logs</div>
        <div className="sg-card" style={{
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          color: 'var(--sg-text-3)',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '0.75rem',
        }}>
          <div style={{ color: 'var(--sg-text-4)', textAlign: 'center', padding: '1rem' }}>
            Waiting for activity...
          </div>
        </div>
      </div>
    </div>
  );
}
