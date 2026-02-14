import { useAgUi, type ToolCallApproval } from '../../ag-ui/useAgUi';
import { SGMetricCard, SGEmptyState, SGApprovalGate } from './shared';
import type { PanelId } from './SuperGoosePanel';

interface DashboardPanelProps {
  /** Navigate to another Super-Goose panel (provided by SuperGoosePanel). */
  onNavigate?: (panel: PanelId) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a human-readable action label from the tool call name. */
function actionLabel(toolCallName: string): string {
  return toolCallName
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Try to produce a readable description from the raw JSON args string. */
function descriptionFromArgs(args: string): string {
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed === 'object' && parsed !== null) {
      const entries = Object.entries(parsed)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ');
      return entries || 'No parameters';
    }
    return String(parsed);
  } catch {
    return args || 'No parameters';
  }
}

/** Heuristic risk level based on the tool call name. */
function riskFromToolName(toolCallName: string): 'low' | 'medium' | 'high' {
  const name = toolCallName.toLowerCase();
  if (name.includes('delete') || name.includes('remove') || name.includes('drop') || name.includes('destroy')) {
    return 'high';
  }
  if (name.includes('read') || name.includes('get') || name.includes('list') || name.includes('search')) {
    return 'low';
  }
  return 'medium';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPanel({ onNavigate }: DashboardPanelProps) {
  const {
    connected,
    isRunning,
    agentState,
    pendingApprovals,
    activities,
    approveToolCall,
    rejectToolCall,
  } = useAgUi();

  // -- Derive stats from agentState ------------------------------------------
  const autonomousRunning = agentState.autonomous_running as boolean | undefined;
  const tasksCompleted = (agentState.tasks_completed as number) ?? 0;
  const tasksFailed = (agentState.tasks_failed as number) ?? 0;
  const sessionSpend = agentState.session_spend as number | undefined;
  const successRateRaw = agentState.success_rate as number | undefined;

  const activeAgents = autonomousRunning ? '1' : '0';
  const totalTasks = tasksCompleted + tasksFailed;
  const tasksToday = autonomousRunning != null ? String(totalTasks) : 'N/A';
  const sessionCost = sessionSpend != null ? `$${sessionSpend.toFixed(2)}` : 'N/A';
  const successRate = successRateRaw != null ? `${Math.round(successRateRaw * 100)}%` : 'N/A';

  const loading = !connected;

  const stats = [
    { label: 'Active Agents', value: loading ? '...' : activeAgents, color: 'var(--sg-emerald)' },
    { label: 'Tasks Today', value: loading ? '...' : tasksToday, color: 'var(--sg-indigo)' },
    { label: 'Session Cost', value: loading ? '...' : sessionCost, color: 'var(--sg-gold)' },
    { label: 'Success Rate', value: loading ? '...' : successRate, color: 'var(--sg-violet)' },
  ];

  // -- Recent activities (latest 5, newest first) ----------------------------
  const recentActivities = activities.slice(-5).reverse();

  // -- Level → status dot class mapping --------------------------------------
  const levelDotClass: Record<string, string> = {
    info: 'sg-status-active',
    warn: 'sg-status-warning',
    error: 'sg-status-error',
    debug: 'sg-status-idle',
  };

  return (
    <div className="space-y-6" role="region" aria-label="Super-Goose Dashboard">
      {/* Stats grid */}
      <section aria-label="Key metrics">
        <h2 className="sr-only">Key Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
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
          <button className="sg-btn sg-btn-primary" onClick={() => onNavigate?.('agentic')}>New Task</button>
          <button className="sg-btn sg-btn-ghost" onClick={() => onNavigate?.('monitor')}>Run Tests</button>
          <button className="sg-btn sg-btn-ghost" onClick={() => onNavigate?.('studios')}>Open Studio</button>
        </div>
      </section>

      {/* Pending approvals — driven by AG-UI pendingApprovals */}
      <section aria-label="Pending approvals">
        <h2 className="sg-section-label">Pending Approvals</h2>
        {pendingApprovals.length > 0 ? (
          <div role="list" aria-label="Approval requests">
            {pendingApprovals.map((approval: ToolCallApproval) => {
              const action = actionLabel(approval.toolCallName);
              const description = descriptionFromArgs(approval.args);
              const risk = riskFromToolName(approval.toolCallName);

              return (
                <div key={approval.toolCallId} role="listitem">
                  <SGApprovalGate
                    action={action}
                    description={description}
                    risk={risk}
                    toolName={approval.toolCallName}
                    onApprove={() => approveToolCall(approval.toolCallId)}
                    onReject={() => rejectToolCall(approval.toolCallId)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <SGEmptyState icon="✅" message="No pending approvals" />
        )}
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
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>
              {isRunning ? 'Active' : 'Idle'}
            </span>
          </div>
          <div className="flex items-center justify-between" role="listitem">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Memory</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>--</span>
          </div>
        </div>
      </section>

      {/* Recent activity — driven by AG-UI activities stream */}
      <section aria-label="Recent activity">
        <h2 className="sg-section-label">
          Recent Activity
          {connected && <span className="sg-badge sg-badge-emerald" aria-label="Live updates active" style={{ marginLeft: '0.5rem', fontSize: '0.625rem' }}>LIVE</span>}
        </h2>
        {recentActivities.length > 0 ? (
          <div className="sg-card space-y-2" role="log" aria-label="Activity feed" aria-live="polite" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-2" style={{ fontSize: '0.8125rem' }}>
                <span
                  className={`sg-status-dot ${levelDotClass[activity.level] ?? 'sg-status-idle'}`}
                  aria-hidden="true"
                />
                <span style={{ color: 'var(--sg-text-3)', flex: 1 }}>{activity.message}</span>
                <span style={{ color: 'var(--sg-text-4)', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
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
