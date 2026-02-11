import React, { useMemo } from 'react';
import { X, Clock, GitBranch, User, FileCode2 } from 'lucide-react';
import { useTimeWarp } from './TimeWarpContext';
import type { EventType } from './TimeWarpTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

const TYPE_LABELS: Record<EventType, string> = {
  tool_call: 'Tool Call',
  message: 'Message',
  edit: 'File Edit',
  checkpoint: 'Checkpoint',
  branch_point: 'Branch Point',
  error: 'Error',
  milestone: 'Milestone',
};

const TYPE_COLORS: Record<EventType, string> = {
  tool_call: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  message: 'bg-green-500/20 text-green-400 border-green-500/40',
  edit: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  checkpoint: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  branch_point: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  error: 'bg-red-500/20 text-red-400 border-red-500/40',
  milestone: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EventInspector: React.FC = () => {
  const { state, selectEvent, setCurrentEvent } = useTimeWarp();

  const event = useMemo(
    () => state.events.find((e) => e.id === state.selectedEventId) ?? null,
    [state.events, state.selectedEventId]
  );

  if (!event) return null;

  const branch = state.branches.find((b) => b.id === event.branchId);
  const typeStyle = TYPE_COLORS[event.type];

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 z-50">
      <div className="bg-neutral-900/95 backdrop-blur border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeStyle}`}>
              {TYPE_LABELS[event.type]}
            </span>
            <span className="text-xs text-text-default font-medium truncate">{event.label}</span>
          </div>
          <button
            onClick={() => selectEvent(null)}
            className="text-text-muted hover:text-text-default p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
            title="Close inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-3 py-2 space-y-2 text-xs">
          {/* Timestamp row */}
          <div className="flex items-center gap-2 text-text-muted">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>{formatTimestamp(event.timestamp)}</span>
            <span className="opacity-50">({formatRelative(event.timestamp)})</span>
          </div>

          {/* Branch row */}
          {branch && (
            <div className="flex items-center gap-2 text-text-muted">
              <GitBranch className="w-3 h-3 flex-shrink-0" />
              <span style={{ color: branch.color }}>{branch.name}</span>
            </div>
          )}

          {/* Agent row */}
          {event.agentId && (
            <div className="flex items-center gap-2 text-text-muted">
              <User className="w-3 h-3 flex-shrink-0" />
              <span>{event.agentId}</span>
            </div>
          )}

          {/* Detail / diff preview */}
          {event.detail && (
            <div className="flex items-start gap-2 text-text-muted">
              <FileCode2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <code className="text-[11px] font-mono bg-white/5 rounded px-1.5 py-0.5 break-all">
                {event.detail}
              </code>
            </div>
          )}

          {/* Metadata */}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="border-t border-white/5 pt-2 mt-2">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Metadata</p>
              <pre className="text-[10px] font-mono text-text-muted bg-white/5 rounded p-1.5 overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-white/5">
          <button
            onClick={() => setCurrentEvent(event.id)}
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            Jump to this event
          </button>
          <span className="text-text-muted text-[10px] opacity-30">|</span>
          <span className="text-[10px] text-text-muted opacity-50 font-mono">{event.id}</span>
        </div>
      </div>
    </div>
  );
};

export default EventInspector;
