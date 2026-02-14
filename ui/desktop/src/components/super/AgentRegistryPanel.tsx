import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../../config';
import { SGStatusDot, SGBadge, SGEmptyState } from './shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  displayName: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  model: string;
  lastHeartbeat: string;
}

interface AgentRegistryResponse {
  agents: AgentInfo[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10000;

const STATUS_COLORS: Record<AgentInfo['status'], string> = {
  online: '#22c55e',
  offline: '#6b7280',
  busy: '#f59e0b',
  error: '#ef4444',
};

const STATUS_BADGE_VARIANT: Record<AgentInfo['status'], 'emerald' | 'sky' | 'gold' | 'red'> = {
  online: 'emerald',
  offline: 'sky',
  busy: 'gold',
  error: 'red',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatUptime(isoStr: string): string {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  } catch {
    return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

function AgentCard({
  agent,
  expanded,
  onToggle,
  onWake,
  onSendMessage,
}: {
  agent: AgentInfo;
  expanded: boolean;
  onToggle: () => void;
  onWake: (id: string) => void;
  onSendMessage: (id: string) => void;
}) {
  return (
    <div
      className={`sg-card ${expanded ? 'ring-1 ring-emerald-500/30' : ''}`}
      data-testid={`agent-card-${agent.id}`}
      role="article"
      aria-label={`Agent: ${agent.displayName || agent.name}`}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-3 cursor-pointer"
        style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Toggle details for ${agent.displayName || agent.name}`}
      >
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: STATUS_COLORS[agent.status],
              display: 'inline-block',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <div>
            <div
              className="font-medium"
              style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}
            >
              {agent.displayName || agent.name}
            </div>
            <div style={{ color: 'var(--sg-text-3)', fontSize: '0.75rem' }}>
              {agent.role}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SGBadge variant={STATUS_BADGE_VARIANT[agent.status]}>
            {agent.status}
          </SGBadge>
          <span
            style={{
              fontSize: '0.625rem',
              color: 'var(--sg-text-4)',
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            aria-hidden="true"
          >
            &#9660;
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="px-3 pb-3 space-y-3"
          style={{
            borderTop: '1px solid var(--sg-border, #2d2d4e)',
          }}
        >
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 pt-2" style={{ fontSize: '0.75rem' }}>
            <div>
              <span style={{ color: 'var(--sg-text-4)' }}>Model</span>
              <div style={{ color: 'var(--sg-text-2)' }}>{agent.model}</div>
            </div>
            <div>
              <span style={{ color: 'var(--sg-text-4)' }}>Last Heartbeat</span>
              <div style={{ color: 'var(--sg-text-2)' }}>{formatUptime(agent.lastHeartbeat)}</div>
            </div>
            <div>
              <span style={{ color: 'var(--sg-text-4)' }}>ID</span>
              <div style={{ color: 'var(--sg-text-2)', fontFamily: 'monospace' }}>{agent.id}</div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2">
            {agent.status === 'offline' && (
              <button
                className="sg-btn sg-btn-primary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => onWake(agent.id)}
                aria-label={`Wake ${agent.displayName || agent.name}`}
              >
                Wake
              </button>
            )}
            <button
              className="sg-btn sg-btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => onSendMessage(agent.id)}
              aria-label={`Send message to ${agent.displayName || agent.name}`}
            >
              Send Message
            </button>
            <button
              className="sg-btn sg-btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              aria-label={`View logs for ${agent.displayName || agent.name}`}
            >
              View Logs
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgentRegistryPanel() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Fetch agents from REST API ---
  const fetchAgents = useCallback(async (signal?: AbortSignal) => {
    try {
      setFetchError(null);
      const res = await fetch(getApiUrl('/api/agents/registry'), { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: AgentRegistryResponse = await res.json();
      if (!signal?.aborted) {
        setAgents(
          (data.agents || []).map((a) => ({
            ...a,
            displayName: a.displayName || a.name || a.id,
            lastHeartbeat: a.lastHeartbeat || new Date().toISOString(),
            status: a.status || 'offline',
            model: a.model || 'unknown',
            role: a.role || 'agent',
          })),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!signal?.aborted) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch agents');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Fetch on mount + poll
  useEffect(() => {
    const controller = new AbortController();
    fetchAgents(controller.signal);
    const interval = setInterval(() => fetchAgents(controller.signal), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchAgents]);

  // --- Actions ---
  const handleToggle = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
    },
    [],
  );

  const handleWake = useCallback(
    async (agentId: string) => {
      try {
        await fetch(getApiUrl('/api/agents/wake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, reason: 'Manual wake from registry panel' }),
        });
        // Optimistic update
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, status: 'busy' as const } : a)),
        );
      } catch {
        /* silent */
      }
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (agentId: string) => {
      const content = window.prompt(`Send message to ${agentId}:`);
      if (content) {
        try {
          await fetch(getApiUrl('/ag-ui/message'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, to: agentId }),
          });
        } catch {
          /* silent */
        }
      }
    },
    [],
  );

  const onlineCount = agents.filter((a) => a.status === 'online').length;
  const offlineCount = agents.filter((a) => a.status === 'offline').length;
  const connected = !loading && !fetchError;

  return (
    <div className="space-y-4" role="region" aria-label="Agent Registry Panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <SGStatusDot status={connected ? 'connected' : 'disconnected'} />
        <div className="flex items-center gap-3" style={{ fontSize: '0.75rem' }}>
          <span style={{ color: 'var(--sg-emerald, #34d399)' }}>
            {onlineCount} online
          </span>
          <span style={{ color: 'var(--sg-text-4)' }}>
            {offlineCount} offline
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="sg-card" style={{ padding: '1.5rem', textAlign: 'center' }} data-testid="registry-loading">
          <p style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem' }}>Loading agents...</p>
        </div>
      )}

      {/* Error state */}
      {fetchError && !loading && (
        <div className="sg-card" style={{ padding: '1rem' }} data-testid="registry-error">
          <p style={{ color: 'var(--sg-red, #ef4444)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            {fetchError}
          </p>
          <button
            onClick={() => fetchAgents()}
            style={{
              fontSize: '0.75rem',
              color: 'var(--sg-accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Agent list */}
      {!loading && !fetchError && agents.length > 0 ? (
        <div className="space-y-2" role="list" aria-label="Registered agents">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              expanded={expandedId === agent.id}
              onToggle={() => handleToggle(agent.id)}
              onWake={handleWake}
              onSendMessage={handleSendMessage}
            />
          ))}
        </div>
      ) : !loading && !fetchError ? (
        <SGEmptyState message="No agents registered" />
      ) : null}
    </div>
  );
}
