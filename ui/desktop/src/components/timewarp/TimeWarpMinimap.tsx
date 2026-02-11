import React, { useMemo } from 'react';
import { useTimeWarp } from './TimeWarpContext';
import type { EventType } from './TimeWarpTypes';

// ---------------------------------------------------------------------------
// Color map for minimap dots
// ---------------------------------------------------------------------------

const MINIMAP_COLORS: Record<EventType, string> = {
  tool_call: '#3b82f6',
  message: '#22c55e',
  edit: '#f97316',
  checkpoint: '#06b6d4',
  branch_point: '#a855f7',
  error: '#ef4444',
  milestone: '#eab308',
};

// ---------------------------------------------------------------------------
// Minimap Component
// ---------------------------------------------------------------------------

interface TimeWarpMinimapProps {
  width?: number;
  height?: number;
}

const TimeWarpMinimap: React.FC<TimeWarpMinimapProps> = ({ width = 120, height = 24 }) => {
  const { state, selectEvent } = useTimeWarp();

  // All events for the active branch, sorted by timestamp
  const branchEvents = useMemo(() => {
    return state.events
      .filter((e) => e.branchId === state.activeBranchId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [state.events, state.activeBranchId]);

  // Time range
  const minTs = branchEvents[0]?.timestamp ?? 0;
  const maxTs = branchEvents[branchEvents.length - 1]?.timestamp ?? 1;
  const range = maxTs - minTs || 1;

  // Map events to x positions
  const dots = useMemo(() => {
    return branchEvents.map((evt) => {
      const x = ((evt.timestamp - minTs) / range) * (width - 4) + 2;
      const color = MINIMAP_COLORS[evt.type];
      return { id: evt.id, x, color };
    });
  }, [branchEvents, minTs, range, width]);

  // Current event marker position
  const currentX = useMemo(() => {
    const current = branchEvents.find((e) => e.id === state.currentEventId);
    if (!current) return null;
    return ((current.timestamp - minTs) / range) * (width - 4) + 2;
  }, [branchEvents, state.currentEventId, minTs, range, width]);

  if (branchEvents.length === 0) return null;

  return (
    <div
      className="relative rounded border border-white/10 bg-white/5 overflow-hidden flex-shrink-0 cursor-pointer"
      style={{ width, height }}
      title="Timeline overview"
    >
      {/* Event density dots */}
      <svg width={width} height={height} className="absolute inset-0">
        {/* Baseline */}
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />

        {/* Dots */}
        {dots.map((dot) => (
          <circle
            key={dot.id}
            cx={dot.x}
            cy={height / 2}
            r={2}
            fill={dot.color}
            opacity={0.7}
            onClick={() => selectEvent(dot.id)}
            className="cursor-pointer hover:opacity-100"
          />
        ))}

        {/* Current position marker */}
        {currentX !== null && (
          <line
            x1={currentX}
            y1={2}
            x2={currentX}
            y2={height - 2}
            stroke="#3b82f6"
            strokeWidth={1.5}
            opacity={0.9}
          />
        )}
      </svg>

      {/* Event count badge */}
      <div className="absolute top-0 right-0 px-1 text-[8px] text-text-muted opacity-50 leading-none" style={{ marginTop: 1 }}>
        {branchEvents.length}
      </div>
    </div>
  );
};

export default TimeWarpMinimap;
