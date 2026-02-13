import { useSuperGooseData } from '../../hooks/useSuperGooseData';
import { useAgentStream } from '../../hooks/useAgentStream';

export default function MonitorPanel() {
  const { costSummary, learningStats, loading } = useSuperGooseData();
  const { events, connected, latestStatus } = useAgentStream();

  const sessionCost = costSummary?.session_spend != null ? `$${costSummary.session_spend.toFixed(2)}` : 'N/A';
  const totalCost = costSummary?.total_spend != null ? `$${costSummary.total_spend.toFixed(2)}` : 'N/A';
  const budgetUsedPercent = (costSummary?.budget_limit != null && costSummary.budget_limit > 0)
    ? Math.round((costSummary.total_spend / costSummary.budget_limit) * 100)
    : 0;
  const budgetDisplay = costSummary?.budget_limit != null
    ? `$${costSummary.budget_limit.toFixed(2)} (${budgetUsedPercent}%)`
    : '\u221E';

  const activeCore = latestStatus?.core_type ? String(latestStatus.core_type) : 'FreeformCore';
  const turnCount = learningStats?.total_experiences != null ? String(learningStats.total_experiences) : '0';

  const recentLogs = events.slice(-20).reverse();

  return (
    <div className="space-y-6" role="region" aria-label="Monitor Panel">
      {/* Cost tracker */}
      <section aria-label="Cost tracking">
        <h2 className="sg-section-label">Cost Tracker</h2>
        <div className="sg-card">
          <div className="grid grid-cols-3 gap-4" role="list" aria-label="Cost summary">
            <div role="listitem">
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }} id="cost-session-label">Session</div>
              <div style={{ color: 'var(--sg-gold)', fontSize: '1.25rem', fontWeight: 700 }} aria-labelledby="cost-session-label">
                {loading ? '...' : sessionCost}
              </div>
            </div>
            <div role="listitem">
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }} id="cost-total-label">Total</div>
              <div style={{ color: 'var(--sg-text-1)', fontSize: '1.25rem', fontWeight: 700 }} aria-labelledby="cost-total-label">
                {loading ? '...' : totalCost}
              </div>
            </div>
            <div role="listitem">
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }} id="cost-budget-label">Budget</div>
              <div style={{ color: 'var(--sg-emerald)', fontSize: '1.25rem', fontWeight: 700 }} aria-labelledby="cost-budget-label">
                {loading ? '...' : budgetDisplay}
              </div>
            </div>
          </div>
          {/* Budget progress bar */}
          {costSummary?.budget_limit != null && (
            <div style={{ marginTop: '0.75rem' }}>
              <div
                className="sg-progress"
                role="progressbar"
                aria-valuenow={Math.min(budgetUsedPercent, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Budget usage"
                style={{ height: '0.375rem' }}
              >
                <div
                  className="sg-progress-bar"
                  style={{
                    width: `${Math.min(budgetUsedPercent, 100)}%`,
                    background: budgetUsedPercent > 90 ? 'var(--sg-red)' : 'var(--sg-gold)',
                  }}
                />
              </div>
            </div>
          )}
          {/* Model breakdown */}
          {costSummary?.model_breakdown && costSummary.model_breakdown.length > 0 && (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--sg-border)', paddingTop: '0.5rem' }} role="list" aria-label="Cost by model">
              {costSummary.model_breakdown.map(m => (
                <div key={m.model} className="flex items-center justify-between" role="listitem" style={{ fontSize: '0.75rem', padding: '0.125rem 0' }}>
                  <span style={{ color: 'var(--sg-text-3)' }}>{m.model}</span>
                  <span style={{ color: 'var(--sg-text-2)' }}>${m.cost.toFixed(4)} ({m.input_tokens + m.output_tokens} tokens)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Agent stats */}
      <section aria-label="Agent statistics">
        <h2 className="sg-section-label">Agent Statistics</h2>
        <div className="sg-card">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Active Core</div>
              <div style={{ color: 'var(--sg-indigo)', fontSize: '0.875rem', fontWeight: 500 }}>{activeCore}</div>
            </div>
            <div>
              <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>Experiences</div>
              <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>
                {loading ? '...' : turnCount}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live logs */}
      <section aria-label="Live logs">
        <h2 className="sg-section-label">
          Live Logs
          {connected && <span className="sg-badge sg-badge-emerald" aria-label="Live updates active" style={{ marginLeft: '0.5rem', fontSize: '0.625rem' }}>LIVE</span>}
        </h2>
        <div className="sg-card" role="log" aria-label="Agent event log" aria-live="polite" style={{
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          color: 'var(--sg-text-3)',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '0.75rem',
        }}>
          {recentLogs.length > 0 ? (
            recentLogs.map((evt, i) => (
              <div key={i} style={{ padding: '0.125rem 0', borderBottom: '1px solid var(--sg-border)' }}>
                <span style={{ color: 'var(--sg-text-4)', marginRight: '0.5rem' }}>
                  {evt.type}
                </span>
                {evt.core_type != null && <span style={{ color: 'var(--sg-indigo)' }}>[{String(evt.core_type)}] </span>}
                {evt.tool_name != null && <span style={{ color: 'var(--sg-gold)' }}>{String(evt.tool_name)} </span>}
                {evt.status != null && <span style={{ color: 'var(--sg-emerald)' }}>{String(evt.status)}</span>}
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--sg-text-4)', textAlign: 'center', padding: '1rem' }}>
              Waiting for activity...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
