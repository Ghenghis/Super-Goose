import { memo, useState, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Users,
  Wrench,
  Maximize2,
  Minimize2,
  GitBranch,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask?: string;
  startedAt: number;
  completedAt?: number;
  toolCallCount: number;
  parentId?: string;
}

export interface SwarmOverviewProps {
  agents: AgentInfo[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

const AGENT_STATUS_META: Record<
  AgentStatus,
  { dotColor: string; label: string; pillClass: string }
> = {
  idle: {
    dotColor: 'bg-gray-400',
    label: 'Idle',
    pillClass: 'bg-gray-500/15 text-gray-400',
  },
  running: {
    dotColor: 'bg-blue-500',
    label: 'Running',
    pillClass: 'bg-blue-500/15 text-blue-500',
  },
  completed: {
    dotColor: 'bg-green-500',
    label: 'Done',
    pillClass: 'bg-green-500/15 text-green-500',
  },
  error: {
    dotColor: 'bg-red-500',
    label: 'Error',
    pillClass: 'bg-red-500/15 text-red-500',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a duration (ms) as "Xm Ys" or "Xs" */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/** Build a parent-child tree from a flat list of agents. */
interface AgentNode {
  agent: AgentInfo;
  children: AgentNode[];
  depth: number;
}

function buildAgentTree(agents: AgentInfo[]): AgentNode[] {
  const map = new Map<string, AgentNode>();
  const roots: AgentNode[] = [];

  // First pass: create nodes
  for (const agent of agents) {
    map.set(agent.id, { agent, children: [], depth: 0 });
  }

  // Second pass: attach children
  for (const agent of agents) {
    const node = map.get(agent.id)!;
    if (agent.parentId && map.has(agent.parentId)) {
      const parent = map.get(agent.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Third pass: set correct depth for deeply nested nodes
  function setDepth(node: AgentNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    setDepth(root, 0);
  }

  return roots;
}

/** Flatten the tree in pre-order traversal for rendering. */
function flattenTree(nodes: AgentNode[]): AgentNode[] {
  const result: AgentNode[] = [];
  function walk(node: AgentNode) {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const n of nodes) {
    walk(n);
  }
  return result;
}

// ---------------------------------------------------------------------------
// ElapsedTimer -- live-updating elapsed time for an agent
// ---------------------------------------------------------------------------

const AgentElapsed = memo<{ startedAt: number; completedAt?: number; status: AgentStatus }>(
  ({ startedAt, completedAt, status }) => {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
      if (status !== 'running') return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [status]);

    const end = completedAt ?? (status === 'running' ? now : startedAt);
    const elapsed = Math.max(0, end - startedAt);

    return (
      <span className="text-xs tabular-nums text-text-muted font-mono select-none">
        {formatElapsed(elapsed)}
      </span>
    );
  }
);
AgentElapsed.displayName = 'AgentElapsed';

// ---------------------------------------------------------------------------
// StatusDot -- animated dot for agent status
// ---------------------------------------------------------------------------

const StatusDot = memo<{ status: AgentStatus; className?: string }>(
  ({ status, className }) => {
    const meta = AGENT_STATUS_META[status];
    return (
      <span className={cn('relative flex h-2.5 w-2.5 shrink-0', className)}>
        {status === 'running' && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              meta.dotColor
            )}
          />
        )}
        <span
          className={cn('relative inline-flex rounded-full h-2.5 w-2.5', meta.dotColor)}
        />
      </span>
    );
  }
);
StatusDot.displayName = 'StatusDot';

// ---------------------------------------------------------------------------
// AgentCard -- individual agent display (compact and expanded)
// ---------------------------------------------------------------------------

const AgentCard = memo<{ node: AgentNode; compact: boolean }>(
  ({ node, compact }) => {
    const { agent } = node;
    const meta = AGENT_STATUS_META[agent.status];

    if (compact) {
      return (
        <div
          className={cn(
            'flex items-center gap-2 px-2.5 py-1.5 rounded-md',
            'bg-gray-800/40 border border-gray-700/50',
            'transition-colors duration-200'
          )}
          style={{ marginLeft: `${node.depth * 20}px` }}
        >
          {node.depth > 0 && (
            <GitBranch className="w-3 h-3 text-gray-600 shrink-0" />
          )}
          <StatusDot status={agent.status} />
          <span className="text-xs text-text-default truncate flex-1 min-w-0">
            {agent.name}
          </span>
          {agent.status === 'running' && (
            <AgentElapsed
              startedAt={agent.startedAt}
              completedAt={agent.completedAt}
              status={agent.status}
            />
          )}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'rounded-lg border overflow-hidden transition-all duration-200',
          agent.status === 'running'
            ? 'border-blue-500/30 bg-blue-500/5'
            : agent.status === 'error'
              ? 'border-red-500/30 bg-red-500/5'
              : agent.status === 'completed'
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-gray-500/20 bg-gray-500/5'
        )}
        style={{ marginLeft: `${node.depth * 24}px` }}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {node.depth > 0 && (
            <GitBranch className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          )}
          <StatusDot status={agent.status} />

          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-text-default truncate">
              {agent.name}
            </span>
            {agent.currentTask && agent.status === 'running' && (
              <span className="text-xs text-text-muted truncate mt-0.5">
                {agent.currentTask}
              </span>
            )}
          </div>

          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full shrink-0 select-none',
              meta.pillClass
            )}
          >
            {meta.label}
          </span>

          <div className="flex items-center gap-1 text-xs text-text-muted shrink-0">
            <Wrench className="w-3 h-3" />
            <span className="tabular-nums">{agent.toolCallCount}</span>
          </div>

          <AgentElapsed
            startedAt={agent.startedAt}
            completedAt={agent.completedAt}
            status={agent.status}
          />
        </div>
      </div>
    );
  }
);
AgentCard.displayName = 'AgentCard';

// ---------------------------------------------------------------------------
// SwarmOverview
// ---------------------------------------------------------------------------

export const SwarmOverview = memo<SwarmOverviewProps>(({ agents, className }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [compact, setCompact] = useState(false);

  const tree = useMemo(() => buildAgentTree(agents), [agents]);
  const flatNodes = useMemo(() => flattenTree(tree), [tree]);

  const activeCount = agents.filter((a) => a.status === 'running').length;
  const completedCount = agents.filter(
    (a) => a.status === 'completed' || a.status === 'error'
  ).length;
  const totalCount = agents.length;

  const summaryText = `${completedCount} of ${totalCount} agents complete`;

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-all duration-300',
        'border-gray-700/50 bg-background-default',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none',
          'hover:bg-white/5 transition-colors bg-gray-800/30'
        )}
        onClick={() => setIsCollapsed((v) => !v)}
        role="button"
        aria-expanded={!isCollapsed}
      >
        <span className="shrink-0 text-text-muted transition-transform duration-200">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </span>

        <Users className="w-4 h-4 text-text-muted shrink-0" />

        <span className="text-sm font-semibold text-text-default truncate flex-1 min-w-0">
          Agent Swarm
        </span>

        {/* Active count badge */}
        {activeCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500 shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
            {activeCount} active
          </span>
        )}

        {/* Summary */}
        <span className="text-xs text-text-muted tabular-nums shrink-0">
          {summaryText}
        </span>

        {/* Compact / Expanded toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCompact((v) => !v);
          }}
          className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
          aria-label={compact ? 'Expand view' : 'Compact view'}
        >
          {compact ? (
            <Maximize2 className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5 text-text-muted" />
          )}
        </button>
      </div>

      {/* Agent cards */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out overflow-hidden',
          isCollapsed ? 'max-h-0 opacity-0' : 'opacity-100'
        )}
        style={
          isCollapsed
            ? { maxHeight: 0 }
            : { maxHeight: `${agents.length * 200 + 100}px` }
        }
      >
        <div className={cn('px-3 pb-3', compact ? 'space-y-1' : 'space-y-2')}>
          {flatNodes.map((node) => (
            <AgentCard key={node.agent.id} node={node} compact={compact} />
          ))}
        </div>
      </div>
    </div>
  );
});
SwarmOverview.displayName = 'SwarmOverview';

export default SwarmOverview;
