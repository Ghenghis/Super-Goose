import { useAgUi } from '../../ag-ui/useAgUi';
import type { ActivityItem, ReasoningItem } from '../../ag-ui/useAgUi';

export default function MonitorPanel() {
  const {
    connected,
    agentState,
    activities,
    reasoningMessages,
    isReasoning,
    isRunning,
    currentStep,
  } = useAgUi();

  const loading = !connected;

  // ---------------------------------------------------------------------------
  // Cost data from agentState
  // ---------------------------------------------------------------------------

  const sessionSpend = typeof agentState.session_spend === 'number' ? agentState.session_spend : null;
  const totalSpend = typeof agentState.total_spend === 'number' ? agentState.total_spend : null;
  const budgetLimit = typeof agentState.budget_limit === 'number' ? agentState.budget_limit : null;
  const modelBreakdown = Array.isArray(agentState.model_breakdown)
    ? (agentState.model_breakdown as Array<{ model: string; cost: number; input_tokens: number; output_tokens: number }>)
    : null;

  const sessionCost = sessionSpend != null ? `$${sessionSpend.toFixed(2)}` : 'N/A';
  const totalCost = totalSpend != null ? `$${totalSpend.toFixed(2)}` : 'N/A';
  const budgetUsedPercent = (budgetLimit != null && budgetLimit > 0 && totalSpend != null)
    ? Math.round((totalSpend / budgetLimit) * 100)
    : 0;
  const budgetDisplay = budgetLimit != null
    ? `$${budgetLimit.toFixed(2)} (${budgetUsedPercent}%)`
    : '\u221E';

  // ---------------------------------------------------------------------------
  // Agent stats from agentState
  // ---------------------------------------------------------------------------

  const activeCore = typeof agentState.core_type === 'string' ? agentState.core_type : 'FreeformCore';
  const turnCount = typeof agentState.total_experiences === 'number' ? String(agentState.total_experiences) : '0';

  // ---------------------------------------------------------------------------
  // Activity & reasoning slices
  // ---------------------------------------------------------------------------

  const recentActivities = activities.slice(-20).reverse();
  const recentReasoning = reasoningMessages.slice(-10).reverse();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Color token for activity level. */
  const getLevelColor = (level: ActivityItem['level']): string => {
    switch (level) {
      case 'info':
        return 'var(--sg-emerald)';
      case 'warn':
        return 'var(--sg-amber)';
      case 'error':
        return 'var(--sg-red)';
      case 'debug':
      default:
        return 'var(--sg-text-4)';
    }
  };

  /** Format a unix-ms timestamp as HH:MM:SS. */
  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="space-y-6" role="region" aria-label="Monitor Panel">
      {/* Current Step indicator */}
      {currentStep && (
        <div
          className="sg-card"
          role="status"
          aria-label="Current execution step"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderLeft: '3px solid var(--sg-blue)',
          }}
        >
          <span style={{ color: 'var(--sg-blue)', fontWeight: 600, fontSize: '0.75rem' }}>
            Executing:
          </span>
          <span style={{ color: 'var(--sg-text-1)', fontSize: '0.75rem' }}>
            {currentStep}
          </span>
          {isRunning && (
            <span className="sg-badge sg-badge-blue" style={{ marginLeft: 'auto', fontSize: '0.625rem' }}>
              RUNNING
            </span>
          )}
        </div>
      )}

      {/* Cost tracker */}
      <section aria-label="Cost tracking">
        <h2 className="sg-section-label">Cost Tracker</h2>
        <div className="sg-card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="list" aria-label="Cost summary">
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
          {budgetLimit != null && (
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
          {modelBreakdown && modelBreakdown.length > 0 && (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--sg-border)', paddingTop: '0.5rem' }} role="list" aria-label="Cost by model">
              {modelBreakdown.map(m => (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Agent Reasoning */}
      <section aria-label="Agent reasoning stream">
        <h2 className="sg-section-label">
          Agent Reasoning
          {connected && <span className="sg-badge sg-badge-emerald" aria-label="Live updates active" style={{ marginLeft: '0.5rem', fontSize: '0.625rem' }}>LIVE</span>}
        </h2>
        <div className="sg-card" role="feed" aria-label="Agent reasoning events" aria-live="polite" style={{
          fontSize: '0.875rem',
          maxHeight: '160px',
          overflowY: 'auto',
          padding: '0.75rem',
        }}>
          {/* Thinking indicator */}
          {isReasoning && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0',
              borderBottom: recentReasoning.length > 0 ? '1px solid var(--sg-border)' : 'none',
            }}>
              <span style={{ color: 'var(--sg-purple)', fontWeight: 600, fontSize: '0.875rem' }}>
                Thinking...
              </span>
            </div>
          )}
          {recentReasoning.length > 0 ? (
            recentReasoning.map((item: ReasoningItem, i: number) => (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.5rem 0',
                borderBottom: i < recentReasoning.length - 1 ? '1px solid var(--sg-border)' : 'none',
              }}>
                {/* Reasoning indicator */}
                <span style={{ fontSize: '1rem', lineHeight: 1, marginTop: '0.125rem', color: 'var(--sg-purple)' }}>
                  {item.streaming ? '...' : '\u2713'}
                </span>

                {/* Reasoning content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--sg-text-2)', fontSize: '0.8125rem' }}>
                      {item.content || '(empty)'}
                    </span>
                    {/* Timestamp */}
                    <span style={{ color: 'var(--sg-text-4)', fontSize: '0.625rem', marginLeft: 'auto' }}>
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                  {item.streaming && (
                    <div style={{ color: 'var(--sg-purple)', fontSize: '0.6875rem', marginTop: '0.125rem', fontStyle: 'italic' }}>
                      streaming...
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            !isReasoning && (
              <div style={{ color: 'var(--sg-text-4)', textAlign: 'center', padding: '1rem' }}>
                Waiting for agent activity...
              </div>
            )
          )}
        </div>
      </section>

      {/* Live logs (activity feed) */}
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
          {recentActivities.length > 0 ? (
            recentActivities.map((act: ActivityItem) => (
              <div key={act.id} style={{ padding: '0.125rem 0', borderBottom: '1px solid var(--sg-border)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ color: 'var(--sg-text-4)', fontSize: '0.625rem', whiteSpace: 'nowrap' }}>
                  {formatTime(act.timestamp)}
                </span>
                <span style={{
                  color: getLevelColor(act.level),
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  fontSize: '0.625rem',
                  minWidth: '2.5rem',
                }}>
                  {act.level}
                </span>
                <span style={{ color: 'var(--sg-text-2)' }}>
                  {act.message}
                </span>
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
