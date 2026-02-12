import { useState } from 'react';

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

  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active</button>
        <button className={`sg-tab ${tab === 'cores' ? 'active' : ''}`} onClick={() => setTab('cores')}>Cores</button>
        <button className={`sg-tab ${tab === 'builder' ? 'active' : ''}`} onClick={() => setTab('builder')}>Builder</button>
      </div>

      {tab === 'active' && (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No active agents
        </div>
      )}

      {tab === 'cores' && (
        <div className="space-y-3">
          {CORE_TYPES.map(core => (
            <div key={core.id} className="sg-card flex items-center justify-between">
              <div>
                <div className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{core.name}</div>
                <div style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{core.desc}</div>
              </div>
              <button className="sg-btn sg-btn-ghost" style={{ fontSize: '0.75rem' }}>Select</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'builder' && (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          Core builder — coming soon
        </div>
      )}
    </div>
  );
}
