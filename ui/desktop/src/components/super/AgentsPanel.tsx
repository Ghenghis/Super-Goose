import { useState, useCallback, useEffect } from 'react';
import { useAgentStream } from '../../hooks/useAgentStream';
import { SGStatusDot, SGEmptyState } from './shared';
import { backendApi } from '../../utils/backendApi';

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
  const [activeCore, setActiveCore] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [builderConfig, setBuilderConfig] = useState({
    autoSelect: true,
    threshold: 0.7,
    preferredCore: 'freeform',
    priorities: CORE_TYPES.map(c => c.id),
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Load persisted core config on mount
  useEffect(() => {
    backendApi.getCoreConfig().then(config => {
      if (config) {
        setBuilderConfig({
          autoSelect: config.auto_select,
          threshold: config.threshold,
          preferredCore: config.preferred_core,
          priorities: config.priorities.length > 0 ? config.priorities : CORE_TYPES.map(c => c.id),
        });
      }
    });
  }, []);

  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true);
    setConfigMessage(null);
    const result = await backendApi.setCoreConfig({
      auto_select: builderConfig.autoSelect,
      threshold: builderConfig.threshold,
      preferred_core: builderConfig.preferredCore,
      priorities: builderConfig.priorities,
    });
    if (result?.success) {
      setConfigMessage('Configuration saved');
    } else {
      setConfigMessage(result?.message ?? 'Failed to save configuration');
    }
    setConfigSaving(false);
    // Clear message after 3s
    setTimeout(() => setConfigMessage(null), 3000);
  }, [builderConfig]);

  const handleSelectCore = useCallback(async (coreId: string) => {
    setSwitching(true);
    const result = await backendApi.switchCore(coreId);
    if (result?.success) {
      setActiveCore(result.active_core);
    }
    setSwitching(false);
  }, []);

  // Derive active core from SSE stream or local state
  const currentCore = activeCore ?? (latestStatus?.core_type != null ? String(latestStatus.core_type) : null);

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
            {currentCore != null && (
              <span className="sg-badge sg-badge-indigo" style={{ fontSize: '0.75rem' }}>
                {currentCore}
              </span>
            )}
          </div>

          {recentEvents.length > 0 ? (
            <div className="space-y-2" role="log" aria-label="Agent events" aria-live="polite">
              {recentEvents.map((evt, i) => (
                <div key={i} className="sg-card flex items-center justify-between py-2">
                  <div>
                    <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
                      {evt.type.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                    </div>
                    {evt.tool_name != null && (
                      <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>
                        Tool: {String(evt.tool_name)}
                      </div>
                    )}
                  </div>
                  <span className={`sg-badge ${evt.type === 'CoreSwitched' ? 'sg-badge-violet' : 'sg-badge-emerald'}`} style={{ fontSize: '0.625rem' }}>
                    {evt.type === 'AgentStatus' ? 'STATUS' : evt.type === 'ToolCalled' ? 'TOOL' : evt.type === 'CoreSwitched' ? 'CORE' : 'EVENT'}
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
          {CORE_TYPES.map(core => {
            const isActive = currentCore === core.id;
            return (
              <div
                key={core.id}
                className={`sg-card flex items-center justify-between ${isActive ? 'ring-1 ring-emerald-500/50' : ''}`}
                role="listitem"
              >
                <div>
                  <div className="font-medium flex items-center gap-2" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
                    {core.name}
                    {isActive && <span className="text-xs text-emerald-400">(active)</span>}
                  </div>
                  <div style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{core.desc}</div>
                </div>
                <button
                  data-testid={`select-core-${core.id}`}
                  className={`sg-btn ${isActive ? 'sg-btn-ghost opacity-50' : 'sg-btn-ghost'}`}
                  aria-label={`Select ${core.name}`}
                  style={{ fontSize: '0.75rem' }}
                  disabled={isActive || switching}
                  onClick={() => handleSelectCore(core.id)}
                >
                  {isActive ? 'Active' : 'Select'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'builder' && (
        <div className="space-y-4" role="tabpanel" id="agents-tabpanel-builder" aria-labelledby="agents-tab-builder">
          <h2 className="font-semibold" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
            Core Auto-Selection
          </h2>

          <div className="sg-card space-y-3 p-3">
            <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: '0.8125rem', color: 'var(--sg-text-2)' }}>
              <input
                type="checkbox"
                checked={builderConfig.autoSelect}
                onChange={e => setBuilderConfig(c => ({ ...c, autoSelect: e.target.checked }))}
                className="accent-emerald-500"
              />
              Enable auto-selection
            </label>

            <div>
              <label className="block mb-1" style={{ fontSize: '0.75rem', color: 'var(--sg-text-3)' }}>
                Confidence threshold: <strong>{builderConfig.threshold.toFixed(1)}</strong>
              </label>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.1}
                value={builderConfig.threshold}
                onChange={e => setBuilderConfig(c => ({ ...c, threshold: parseFloat(e.target.value) }))}
                className="w-full"
                aria-label="Confidence threshold"
              />
              <div className="flex justify-between" style={{ fontSize: '0.625rem', color: 'var(--sg-text-4)' }}>
                <span>0.1 (aggressive)</span>
                <span>1.0 (manual only)</span>
              </div>
            </div>

            <div>
              <label className="block mb-1" style={{ fontSize: '0.75rem', color: 'var(--sg-text-3)' }}>
                Preferred core
              </label>
              <select
                value={builderConfig.preferredCore}
                onChange={e => setBuilderConfig(c => ({ ...c, preferredCore: e.target.value }))}
                className="sg-select w-full"
                aria-label="Preferred core"
                style={{
                  background: 'var(--sg-surface-2)',
                  color: 'var(--sg-text-1)',
                  border: '1px solid var(--sg-border)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.8125rem',
                }}
              >
                {CORE_TYPES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <h2 className="font-semibold" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
            Core Priority Order
          </h2>

          <div className="sg-card p-3">
            {builderConfig.priorities.map((coreId, idx) => {
              const core = CORE_TYPES.find(c => c.id === coreId);
              return (
                <div key={coreId} className="flex items-center justify-between py-1" style={{ fontSize: '0.8125rem', color: 'var(--sg-text-2)' }}>
                  <span>
                    <span style={{ color: 'var(--sg-text-4)', marginRight: '8px' }}>{idx + 1}.</span>
                    {core?.name ?? coreId}
                  </span>
                  <span className="flex gap-1">
                    <button
                      className="sg-btn-ghost px-1"
                      style={{ fontSize: '0.75rem' }}
                      disabled={idx === 0}
                      aria-label={`Move ${core?.name} up`}
                      onClick={() => setBuilderConfig(c => {
                        const p = [...c.priorities];
                        [p[idx - 1], p[idx]] = [p[idx], p[idx - 1]];
                        return { ...c, priorities: p };
                      })}
                    >&#9650;</button>
                    <button
                      className="sg-btn-ghost px-1"
                      style={{ fontSize: '0.75rem' }}
                      disabled={idx === builderConfig.priorities.length - 1}
                      aria-label={`Move ${core?.name} down`}
                      onClick={() => setBuilderConfig(c => {
                        const p = [...c.priorities];
                        [p[idx], p[idx + 1]] = [p[idx + 1], p[idx]];
                        return { ...c, priorities: p };
                      })}
                    >&#9660;</button>
                  </span>
                </div>
              );
            })}
          </div>

          <button
            className="sg-btn sg-btn-primary w-full"
            style={{ fontSize: '0.8125rem' }}
            disabled={configSaving}
            onClick={handleSaveConfig}
          >
            {configSaving ? 'Saving...' : 'Save Configuration'}
          </button>

          {configMessage && (
            <div
              className="text-center"
              style={{
                fontSize: '0.75rem',
                color: configMessage.includes('Failed') ? 'var(--sg-red, #ef4444)' : 'var(--sg-emerald, #34d399)',
                marginTop: '4px',
              }}
            >
              {configMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
