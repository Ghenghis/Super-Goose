import { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskGraphNode {
  id: number;
  tool: string;
  description: string;
  depends_on: number[];
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
}

export interface TaskGraphProps {
  nodes: TaskGraphNode[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const NODE_GAP_X = 60;
const NODE_GAP_Y = 20;
const PADDING = 24;
const ARROW_SIZE = 6;

const STATUS_COLORS: Record<TaskGraphNode['status'], {
  fill: string;
  stroke: string;
  text: string;
  badge: string;
}> = {
  pending: {
    fill: '#374151',
    stroke: '#4B5563',
    text: '#9CA3AF',
    badge: '#6B7280',
  },
  running: {
    fill: '#1E3A5F',
    stroke: '#3B82F6',
    text: '#93C5FD',
    badge: '#3B82F6',
  },
  completed: {
    fill: '#14532D',
    stroke: '#22C55E',
    text: '#86EFAC',
    badge: '#22C55E',
  },
  error: {
    fill: '#7F1D1D',
    stroke: '#EF4444',
    text: '#FCA5A5',
    badge: '#EF4444',
  },
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

interface LayoutNode {
  node: TaskGraphNode;
  col: number;
  row: number;
  x: number;
  y: number;
}

interface LayoutEdge {
  from: LayoutNode;
  to: LayoutNode;
}

/**
 * Assign columns via topological sort (longest path from roots),
 * then assign rows within each column.
 */
function computeLayout(nodes: TaskGraphNode[]): {
  layoutNodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { layoutNodes: [], edges: [], width: 0, height: 0 };
  }

  const nodeMap = new Map<number, TaskGraphNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Compute column as longest path from any root to this node
  const colMap = new Map<number, number>();

  function getCol(id: number): number {
    if (colMap.has(id)) return colMap.get(id)!;
    const node = nodeMap.get(id);
    if (!node || node.depends_on.length === 0) {
      colMap.set(id, 0);
      return 0;
    }
    let maxParentCol = 0;
    for (const depId of node.depends_on) {
      if (nodeMap.has(depId)) {
        maxParentCol = Math.max(maxParentCol, getCol(depId) + 1);
      }
    }
    colMap.set(id, maxParentCol);
    return maxParentCol;
  }

  for (const n of nodes) {
    getCol(n.id);
  }

  // Group by column
  const columns = new Map<number, TaskGraphNode[]>();
  let maxCol = 0;
  for (const n of nodes) {
    const col = colMap.get(n.id)!;
    maxCol = Math.max(maxCol, col);
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(n);
  }

  // Assign positions
  const layoutNodeMap = new Map<number, LayoutNode>();
  let maxRow = 0;

  for (let col = 0; col <= maxCol; col++) {
    const colNodes = columns.get(col) || [];
    colNodes.forEach((node, row) => {
      maxRow = Math.max(maxRow, row);
      const ln: LayoutNode = {
        node,
        col,
        row,
        x: PADDING + col * (NODE_WIDTH + NODE_GAP_X),
        y: PADDING + row * (NODE_HEIGHT + NODE_GAP_Y),
      };
      layoutNodeMap.set(node.id, ln);
    });
  }

  const layoutNodes = Array.from(layoutNodeMap.values());

  // Build edges
  const edges: LayoutEdge[] = [];
  for (const n of nodes) {
    const toNode = layoutNodeMap.get(n.id)!;
    for (const depId of n.depends_on) {
      const fromNode = layoutNodeMap.get(depId);
      if (fromNode) {
        edges.push({ from: fromNode, to: toNode });
      }
    }
  }

  const width = PADDING * 2 + (maxCol + 1) * NODE_WIDTH + maxCol * NODE_GAP_X;
  const height = PADDING * 2 + (maxRow + 1) * NODE_HEIGHT + maxRow * NODE_GAP_Y;

  return { layoutNodes, edges, width, height };
}

/** Format duration in ms as human-readable */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const GraphEdge = memo<{
  edge: LayoutEdge;
  highlighted: boolean;
}>(({ edge, highlighted }) => {
  const { from, to } = edge;

  // Edge goes from right side of "from" to left side of "to"
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;

  // Bezier control points for a smooth curve
  const midX = (x1 + x2) / 2;

  const pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

  // Arrow head
  const arrowAngle = Math.atan2(y2 - y1, x2 - midX);
  const ax1 = x2 - ARROW_SIZE * Math.cos(arrowAngle - Math.PI / 6);
  const ay1 = y2 - ARROW_SIZE * Math.sin(arrowAngle - Math.PI / 6);
  const ax2 = x2 - ARROW_SIZE * Math.cos(arrowAngle + Math.PI / 6);
  const ay2 = y2 - ARROW_SIZE * Math.sin(arrowAngle + Math.PI / 6);

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={highlighted ? '#60A5FA' : '#4B5563'}
        strokeWidth={highlighted ? 2 : 1.5}
        strokeDasharray={highlighted ? undefined : undefined}
        opacity={highlighted ? 1 : 0.6}
        className="transition-all duration-200"
      />
      <polygon
        points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`}
        fill={highlighted ? '#60A5FA' : '#4B5563'}
        opacity={highlighted ? 1 : 0.6}
        className="transition-all duration-200"
      />
    </g>
  );
});
GraphEdge.displayName = 'GraphEdge';

const GraphNode = memo<{
  layoutNode: LayoutNode;
  highlighted: boolean;
  selected: boolean;
  onHoverStart: (id: number) => void;
  onHoverEnd: () => void;
  onClick: (id: number) => void;
}>(({ layoutNode, highlighted, selected, onHoverStart, onHoverEnd, onClick }) => {
  const { node, x, y } = layoutNode;
  const colors = STATUS_COLORS[node.status];

  const handleMouseEnter = useCallback(() => onHoverStart(node.id), [node.id, onHoverStart]);
  const handleClick = useCallback(() => onClick(node.id), [node.id, onClick]);

  // Pulse animation for running nodes
  const isRunning = node.status === 'running';

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHoverEnd}
      onClick={handleClick}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`${node.tool}: ${node.description} (${node.status})`}
    >
      {/* Node body */}
      <rect
        x={x}
        y={y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        ry={8}
        fill={colors.fill}
        stroke={selected ? '#F59E0B' : highlighted ? '#60A5FA' : colors.stroke}
        strokeWidth={selected ? 2.5 : highlighted ? 2 : 1.5}
        className="transition-all duration-200"
      >
        {isRunning && (
          <animate
            attributeName="stroke-opacity"
            values="1;0.4;1"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </rect>

      {/* Status dot */}
      <circle
        cx={x + 14}
        cy={y + 16}
        r={4}
        fill={colors.badge}
      >
        {isRunning && (
          <animate
            attributeName="r"
            values="4;5;4"
            dur="1.5s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Tool name */}
      <text
        x={x + 24}
        y={y + 19}
        fill={colors.text}
        fontSize={12}
        fontWeight={600}
        fontFamily="system-ui, -apple-system, sans-serif"
        className="select-none pointer-events-none"
      >
        {node.tool.length > 16 ? node.tool.slice(0, 15) + '\u2026' : node.tool}
      </text>

      {/* Description */}
      <text
        x={x + 10}
        y={y + 38}
        fill={colors.text}
        fontSize={10}
        opacity={0.7}
        fontFamily="system-ui, -apple-system, sans-serif"
        className="select-none pointer-events-none"
      >
        {node.description.length > 22
          ? node.description.slice(0, 21) + '\u2026'
          : node.description}
      </text>

      {/* Duration badge */}
      {node.duration != null && (
        <text
          x={x + NODE_WIDTH - 8}
          y={y + 19}
          fill={colors.text}
          fontSize={9}
          fontFamily="monospace"
          textAnchor="end"
          opacity={0.6}
          className="select-none pointer-events-none"
        >
          {formatDuration(node.duration)}
        </text>
      )}
    </g>
  );
});
GraphNode.displayName = 'GraphNode';

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

const NodeDetailPanel = memo<{
  node: TaskGraphNode;
  onClose: () => void;
}>(({ node, onClose }) => {
  const colors = STATUS_COLORS[node.status];

  return (
    <div
      className={cn(
        'absolute top-2 right-2 z-10 w-64 rounded-lg border p-3',
        'bg-gray-900/95 backdrop-blur-sm shadow-xl',
        'text-sm'
      )}
      style={{ borderColor: colors.stroke }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-white truncate">{node.tool}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors text-xs px-1"
          aria-label="Close detail panel"
        >
          &times;
        </button>
      </div>
      <p className="text-gray-300 text-xs mb-2">{node.description}</p>
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: colors.badge }}
        />
        <span className="text-gray-400 capitalize">{node.status}</span>
        {node.duration != null && (
          <span className="text-gray-500 ml-auto font-mono">
            {formatDuration(node.duration)}
          </span>
        )}
      </div>
      {node.depends_on.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <span className="text-gray-500 text-xs">
            Depends on: {node.depends_on.map((d) => `#${d}`).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
});
NodeDetailPanel.displayName = 'NodeDetailPanel';

// ---------------------------------------------------------------------------
// TaskGraph
// ---------------------------------------------------------------------------

export const TaskGraph = memo<TaskGraphProps>(({ nodes, className }) => {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { layoutNodes, edges, width, height } = useMemo(
    () => computeLayout(nodes),
    [nodes]
  );

  // Determine which nodes are connected to hovered node
  const connectedIds = useMemo(() => {
    if (hoveredId === null) return new Set<number>();

    const connected = new Set<number>();
    connected.add(hoveredId);

    // Walk upstream (dependencies)
    function walkUp(id: number) {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      for (const depId of node.depends_on) {
        if (!connected.has(depId)) {
          connected.add(depId);
          walkUp(depId);
        }
      }
    }

    // Walk downstream (dependents)
    function walkDown(id: number) {
      for (const n of nodes) {
        if (n.depends_on.includes(id) && !connected.has(n.id)) {
          connected.add(n.id);
          walkDown(n.id);
        }
      }
    }

    walkUp(hoveredId);
    walkDown(hoveredId);

    return connected;
  }, [hoveredId, nodes]);

  const handleHoverStart = useCallback((id: number) => setHoveredId(id), []);
  const handleHoverEnd = useCallback(() => setHoveredId(null), []);
  const handleClick = useCallback(
    (id: number) => setSelectedId((prev) => (prev === id ? null : id)),
    []
  );
  const handleCloseDetail = useCallback(() => setSelectedId(null), []);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  // Auto-scroll to show running nodes
  useEffect(() => {
    if (!containerRef.current) return;
    const runningNode = layoutNodes.find((ln) => ln.node.status === 'running');
    if (runningNode) {
      containerRef.current.scrollTo({
        left: Math.max(0, runningNode.x - 100),
        behavior: 'smooth',
      });
    }
  }, [layoutNodes]);

  if (nodes.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-border-default p-6 text-center text-sm text-text-muted',
          className
        )}
      >
        No tasks to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative rounded-lg border border-border-default overflow-x-auto overflow-y-hidden',
        'bg-gray-950/60',
        className
      )}
    >
      <svg
        width={Math.max(width, 300)}
        height={Math.max(height, 100)}
        viewBox={`0 0 ${Math.max(width, 300)} ${Math.max(height, 100)}`}
        className="block"
      >
        {/* Render edges first (behind nodes) */}
        {edges.map((edge, i) => {
          const isHighlighted =
            hoveredId !== null &&
            connectedIds.has(edge.from.node.id) &&
            connectedIds.has(edge.to.node.id);
          return (
            <GraphEdge key={`e-${i}`} edge={edge} highlighted={isHighlighted} />
          );
        })}

        {/* Render nodes */}
        {layoutNodes.map((ln) => (
          <GraphNode
            key={ln.node.id}
            layoutNode={ln}
            highlighted={hoveredId !== null && connectedIds.has(ln.node.id)}
            selected={selectedId === ln.node.id}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
            onClick={handleClick}
          />
        ))}
      </svg>

      {/* Detail panel overlay */}
      {selectedNode && (
        <NodeDetailPanel node={selectedNode} onClose={handleCloseDetail} />
      )}
    </div>
  );
});
TaskGraph.displayName = 'TaskGraph';

export default TaskGraph;
