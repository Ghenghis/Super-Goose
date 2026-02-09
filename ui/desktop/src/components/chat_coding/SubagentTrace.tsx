import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Wrench,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  ArrowDown,
  Circle,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TraceEventType =
  | 'start'
  | 'tool_call'
  | 'tool_result'
  | 'message'
  | 'error'
  | 'complete';

export interface TraceEvent {
  timestamp: number;
  type: TraceEventType;
  tool?: string;
  message?: string;
  duration?: number;
}

export interface SubagentTraceProps {
  agentId: string;
  events: TraceEvent[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Event type metadata
// ---------------------------------------------------------------------------

const EVENT_META: Record<
  TraceEventType,
  {
    icon: React.FC<{ className?: string }>;
    label: string;
    nodeColor: string;
    lineColor: string;
    textColor: string;
  }
> = {
  start: {
    icon: Play,
    label: 'Started',
    nodeColor: 'bg-blue-500 border-blue-400',
    lineColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
  },
  tool_call: {
    icon: Wrench,
    label: 'Tool Call',
    nodeColor: 'bg-yellow-500 border-yellow-400',
    lineColor: 'border-yellow-500/30',
    textColor: 'text-yellow-400',
  },
  tool_result: {
    icon: CheckCircle2,
    label: 'Tool Result',
    nodeColor: 'bg-cyan-500 border-cyan-400',
    lineColor: 'border-cyan-500/30',
    textColor: 'text-cyan-400',
  },
  message: {
    icon: MessageSquare,
    label: 'Message',
    nodeColor: 'bg-gray-400 border-gray-300',
    lineColor: 'border-gray-500/30',
    textColor: 'text-gray-400',
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    nodeColor: 'bg-red-500 border-red-400',
    lineColor: 'border-red-500/30',
    textColor: 'text-red-400',
  },
  complete: {
    icon: CheckCircle2,
    label: 'Completed',
    nodeColor: 'bg-green-500 border-green-400',
    lineColor: 'border-green-500/30',
    textColor: 'text-green-400',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    const remainder = ms % 1000;
    return remainder > 0
      ? `${totalSeconds}.${String(remainder).padStart(3, '0').slice(0, 1)}s`
      : `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function computeGap(prevTs: number, currTs: number): string | null {
  const diff = currTs - prevTs;
  if (diff < 10) return null; // ignore tiny gaps
  return formatDuration(diff);
}

// ---------------------------------------------------------------------------
// TraceEventRow
// ---------------------------------------------------------------------------

const TraceEventRow = memo<{
  event: TraceEvent;
  isLast: boolean;
  gapLabel: string | null;
}>(({ event, isLast, gapLabel }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const hasDetails = !!(event.message || event.tool || event.duration);

  return (
    <div className="relative">
      {/* Gap indicator between events */}
      {gapLabel && (
        <div className="flex items-center pl-[11px] py-0.5">
          <div className="w-px h-4 border-l border-dashed border-gray-600" />
          <span className="text-[10px] text-gray-600 font-mono ml-3 select-none">
            +{gapLabel}
          </span>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Timeline node and connecting line */}
        <div className="flex flex-col items-center shrink-0 pt-0.5">
          {/* Node dot */}
          <div
            className={cn(
              'w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center',
              meta.nodeColor,
              event.type === 'error' && 'ring-2 ring-red-500/20'
            )}
          >
            <Icon className="w-3 h-3 text-white" />
          </div>
          {/* Connecting line */}
          {!isLast && (
            <div
              className={cn(
                'w-px flex-1 min-h-[16px] border-l-2',
                meta.lineColor
              )}
            />
          )}
        </div>

        {/* Event content */}
        <div
          className={cn(
            'flex-1 min-w-0 pb-3',
            hasDetails && 'cursor-pointer'
          )}
          onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
        >
          <div className="flex items-center gap-2">
            {/* Event label */}
            <span className={cn('text-xs font-semibold', meta.textColor)}>
              {meta.label}
            </span>

            {/* Tool name if present */}
            {event.tool && (
              <span className="text-xs text-text-muted font-mono bg-gray-800/60 px-1.5 py-0.5 rounded">
                {event.tool}
              </span>
            )}

            {/* Duration badge */}
            {event.duration != null && (
              <span className="text-[10px] text-text-muted font-mono tabular-nums">
                {formatDuration(event.duration)}
              </span>
            )}

            {/* Timestamp */}
            <span className="text-[10px] text-gray-600 font-mono ml-auto tabular-nums select-none shrink-0">
              {formatTimestamp(event.timestamp)}
            </span>

            {/* Expand indicator */}
            {hasDetails && (
              <span className="text-text-muted shrink-0">
                {expanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
            )}
          </div>

          {/* Expanded details */}
          <div
            className={cn(
              'transition-all duration-200 ease-in-out overflow-hidden',
              expanded ? 'max-h-40 opacity-100 mt-1.5' : 'max-h-0 opacity-0'
            )}
          >
            {event.message && (
              <div
                className={cn(
                  'text-xs font-mono p-2 rounded-md break-all whitespace-pre-wrap',
                  event.type === 'error'
                    ? 'bg-red-950/40 text-red-300 border border-red-500/20'
                    : 'bg-gray-950/60 text-text-muted border border-gray-700/30'
                )}
              >
                {event.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
TraceEventRow.displayName = 'TraceEventRow';

// ---------------------------------------------------------------------------
// SubagentTrace
// ---------------------------------------------------------------------------

export const SubagentTrace = memo<SubagentTraceProps>(
  ({ agentId, events, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScroll = useRef(true);

    const handleScroll = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const threshold = 40;
      shouldAutoScroll.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    }, []);

    // Auto-scroll to latest event
    useEffect(() => {
      const el = containerRef.current;
      if (el && shouldAutoScroll.current) {
        el.scrollTop = el.scrollHeight;
      }
    }, [events.length]);

    const scrollToBottom = useCallback(() => {
      const el = containerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        shouldAutoScroll.current = true;
      }
    }, []);

    if (events.length === 0) {
      return (
        <div
          className={cn(
            'rounded-lg border border-gray-700/50 bg-gray-800/20 p-4',
            className
          )}
        >
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Circle className="w-3.5 h-3.5" />
            <span>No trace events for agent {agentId}</span>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'rounded-lg border border-gray-700/50 bg-gray-800/20 overflow-hidden',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 bg-gray-800/30">
          <Play className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-semibold text-text-default">
            Trace: {agentId}
          </span>
          <span className="text-xs text-text-muted ml-auto tabular-nums">
            {events.length} events
          </span>

          {/* Scroll-to-bottom button */}
          <button
            type="button"
            onClick={scrollToBottom}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Scroll to latest event"
          >
            <ArrowDown className="w-3 h-3 text-text-muted" />
          </button>
        </div>

        {/* Timeline */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="overflow-y-auto px-3 pt-3 scrollbar-thin"
          style={{ maxHeight: '28rem' }}
        >
          {events.map((event, i) => {
            const gapLabel =
              i > 0 ? computeGap(events[i - 1].timestamp, event.timestamp) : null;
            return (
              <TraceEventRow
                key={`${event.timestamp}-${i}`}
                event={event}
                isLast={i === events.length - 1}
                gapLabel={gapLabel}
              />
            );
          })}
        </div>
      </div>
    );
  }
);
SubagentTrace.displayName = 'SubagentTrace';

export default SubagentTrace;
