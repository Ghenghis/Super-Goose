import React, { useMemo } from 'react';
import {
  Circle,
  Diamond,
  Star,
  AlertCircle,
  GitBranch,
  Pencil,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import type { TimeWarpEvent, EventType } from './TimeWarpTypes';
import { useTimeWarp } from './TimeWarpContext';

// ---------------------------------------------------------------------------
// Event appearance configuration
// ---------------------------------------------------------------------------

interface EventAppearance {
  color: string;
  bgColor: string;
  borderColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const EVENT_STYLES: Record<EventType, EventAppearance> = {
  tool_call: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    Icon: Wrench,
  },
  message: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/50',
    Icon: MessageSquare,
  },
  edit: {
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/50',
    Icon: Pencil,
  },
  checkpoint: {
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/50',
    Icon: Diamond,
  },
  branch_point: {
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/50',
    Icon: GitBranch,
  },
  error: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    Icon: AlertCircle,
  },
  milestone: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/50',
    Icon: Star,
  },
};

// ---------------------------------------------------------------------------
// Single event node
// ---------------------------------------------------------------------------

interface EventNodeProps {
  event: TimeWarpEvent;
  isCurrent: boolean;
  isSelected: boolean;
  compact?: boolean;
}

const EventNode: React.FC<EventNodeProps> = ({ event, isCurrent, isSelected, compact }) => {
  const { selectEvent } = useTimeWarp();
  const style = EVENT_STYLES[event.type];
  const { Icon } = style;

  const sizeClass = compact ? 'w-4 h-4' : 'w-6 h-6';
  const iconSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <button
      onClick={() => selectEvent(isSelected ? null : event.id)}
      title={event.label}
      className={[
        'relative flex items-center justify-center rounded-full border transition-all duration-150',
        'hover:scale-125 hover:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        sizeClass,
        style.bgColor,
        style.borderColor,
        isSelected ? 'ring-2 ring-white/60 scale-110' : '',
        isCurrent ? 'ring-2 ring-blue-400 scale-110' : '',
      ].join(' ')}
    >
      <Icon className={`${iconSize} ${style.color}`} />
      {isCurrent && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Timeline Track
// ---------------------------------------------------------------------------

interface TimelineTrackProps {
  events: TimeWarpEvent[];
  branchColor: string;
  branchName: string;
  compact?: boolean;
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({
  events,
  branchColor,
  branchName,
  compact = false,
}) => {
  const { state } = useTimeWarp();

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.timestamp - b.timestamp),
    [events]
  );

  if (sortedEvents.length === 0) return null;

  const trackHeight = compact ? 'h-6' : 'h-10';

  return (
    <div className={`flex items-center gap-0.5 ${trackHeight} group`}>
      {/* Branch label */}
      <div className="flex-shrink-0 w-20 pr-2 text-right">
        <span
          className="text-[10px] font-medium truncate block"
          style={{ color: branchColor }}
          title={branchName}
        >
          {branchName}
        </span>
      </div>

      {/* Track line with events */}
      <div className="flex-1 relative flex items-center">
        {/* Background rail */}
        <div
          className="absolute left-0 right-0 h-px opacity-30"
          style={{ backgroundColor: branchColor }}
        />

        {/* Event nodes */}
        <div className="relative flex items-center gap-1 w-full">
          {sortedEvents.map((event) => (
            <EventNode
              key={event.id}
              event={event}
              isCurrent={state.currentEventId === event.id}
              isSelected={state.selectedEventId === event.id}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Compact inline track for slim mode (no branch labels)
// ---------------------------------------------------------------------------

export const InlineEventDots: React.FC<{ events: TimeWarpEvent[] }> = ({ events }) => {
  const { state, selectEvent } = useTimeWarp();

  const sorted = useMemo(
    () => [...events].sort((a, b) => a.timestamp - b.timestamp),
    [events]
  );

  return (
    <div className="flex items-center gap-0.5 overflow-hidden">
      {sorted.map((evt) => {
        const style = EVENT_STYLES[evt.type];
        const isCurrent = state.currentEventId === evt.id;
        return (
          <button
            key={evt.id}
            onClick={() => selectEvent(evt.id)}
            title={evt.label}
            className={[
              'w-2 h-2 rounded-full flex-shrink-0 transition-transform',
              'hover:scale-150',
              isCurrent ? 'ring-1 ring-blue-400 scale-125' : '',
            ].join(' ')}
          >
            <Circle className={`w-2 h-2 fill-current ${style.color}`} />
          </button>
        );
      })}
    </div>
  );
};

export default TimelineTrack;
