import { useState } from 'react';
import { useAgentStream } from '../../hooks/useAgentStream';
import { SGStatusDot, SGEmptyState } from './shared';

const CORE_TYPES = [
  { id: 'freeform', name: 'FreeformCore', desc: 'Chat, research, open tasks', color: 'var(--sg-emerald)' },
  { id: 'structured', name: 'StructuredCore', desc: 'Code\u2192Test\u2192Fix deterministic', color: 'var(--sg-indigo)' },
  { id: 'orchestrator', name: 'OrchestratorCore', desc: 'Multi-agent coordination', color: 'var(--sg-violet)' },
  { id: 'swarm', name: 'SwarmCore', desc: 'Parallel agent pool', color: 'var(--sg-sky)' },
  { id: 'workflow', name: 'WorkflowCore', desc: 'Template pipelines', color: 'var(--sg-gold)' },
  { id: 'adversarial', name: 'AdversarialCore', desc: 'Coach/Player review', color: 'var(--sg-red)' },
];

export default function AgentsPanel() {
  const [tab, setTab] = useState<'active' | 'cores' | 'builder'>('active');
  const { events, connected, latestStatus } = useAgentStream();

  const recentEvents = events.slice(-10).reverse();

  return (
    <div className="space-y-4" role="region" aria-label="Agents Panel">
      <div className="sg-tabs" role="tablist" aria-label="Agent views">
        <button
          className={`sg-tab ${tab === 'active' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'active'}
          aria-controls="agents-tabpanel-active"
          id="agents-tab-active"
          onClick={() => setTab('active')}
        >Active</button>
        <button
          className={`sg-tab ${tab === 'cores' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'cores'}
          aria-controls="agents-tabpanel-cores"
          id="agents-tab-cores"
          onClick={() => setTab('cores')}
        >Cores</button>
        <button
          className={`sg-tab ${tab === 'builder' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'builder'}
          aria-controls="agents-tabpanel-builder"
          id="agents-tab-builder"
          onClick={() => setTab('builder')}
        >Builder</button>
      </div>

      {tab === 'active' && (
        <div className="space-y-3" role="tabpanel" id="agents-tabpanel-active" aria-labelledby="agents-tab-active">
          {/* SSE status indicator */}
          <div className="flex items-center justify-between" aria-label={`Agent stream ${connected ? 'connected' : 'disconnected'}`}>
            <SGStatusDot status={connected ? 'connected' : 'disconnected'} />
            {latestStatus?.core != null && (
              <span className="sg-badge sg-badge-indigo" style={{ fontSize: '0.75rem' }}>
                {String(latestStatus.core)}
              </span>
            )}
          </div>

          {recentEvents.length > 0 ? (
            <div className="space-y-2" role="log" aria-label="Agent events" aria-live="polite">
              {recentEvents.map((evt, i) => (
                <div key={i} className="sg-card flex items-center justify-between py-2">
                  <div>
                    <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
                      {evt.type.replace(/_/g, ' ')}
                    </div>
                    {evt.tool != null && (
                      <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>
                        Tool: {String(evt.tool)}
                      </div>
                    )}
                  </div>
                  <span className={`sg-badge ${evt.type === 'core_switched' ? 'sg-badge-violet' : 'sg-badge-emerald'}`} style={{ fontSize: '0.625rem' }}>
                    {evt.type === 'agent_status' ? 'STATUS' : evt.type === 'tool_called' ? 'TOOL' : evt.type === 'core_switched' ? 'CORE' : 'EVENT'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <SGEmptyState message="No active agents" />
          )}
        </div>
      )}

      {tab === 'cores' && (
        <div className="space-y-3" role="tabpanel" id="agents-tabpanel-cores" aria-labelledby="agents-tab-cores">
          <h2 className="sr-only">Available Agent Cores</h2>
          {CORE_TYPES.map(core => (
            <div key={core.id} className="sg-card flex items-center justify-between" role="listitem">
              <div>
                <div className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{core.name}</div>
                <div style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{core.desc}</div>
              </div>
              <button className="sg-btn sg-btn-ghost" aria-label={`Select ${core.name}`} style={{ fontSize: '0.75rem' }}>Select</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'builder' && (
        <div role="tabpanel" id="agents-tabpanel-builder" aria-labelledby="agents-tab-builder">
          <SGEmptyState icon={'\uD83D\uDEE0\uFE0F'} message="Core builder — coming soon" />
        </div>
      )}
    </div>
  );
}
