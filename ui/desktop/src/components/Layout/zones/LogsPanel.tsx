/**
 * LogsPanel — real-time AG-UI activity log viewer for the bottom zone.
 *
 * Displays activities from the AG-UI SSE stream with level-based coloring,
 * timestamps, and auto-scroll. Provides level filtering and clear controls.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useAgUi, type ActivityItem } from '../../../ag-ui/useAgUi';
import { cn } from '../../../utils';

type LogLevel = ActivityItem['level'];

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-zinc-300',
  debug: 'text-zinc-500',
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  error: 'bg-red-900/40 text-red-400',
  warn: 'bg-yellow-900/40 text-yellow-400',
  info: 'bg-zinc-700 text-zinc-400',
  debug: 'bg-zinc-800 text-zinc-500',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LogsPanel() {
  const { activities } = useAgUi();
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [cleared, setCleared] = useState(0); // index after which to show
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const afterClear = activities.slice(cleared);
    if (filter === 'all') return afterClear;
    return afterClear.filter((a) => a.level === filter);
  }, [activities, filter, cleared]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const a of activities.slice(cleared)) {
      c[a.level] = (c[a.level] || 0) + 1;
    }
    return c;
  }, [activities, cleared]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-xs font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-700/50 shrink-0">
        {(['all', 'error', 'warn', 'info', 'debug'] as const).map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] transition-colors',
              filter === level
                ? 'bg-zinc-600 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            )}
          >
            {level === 'all' ? `All (${activities.length - cleared})` : `${level} (${counts[level]})`}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setCleared(activities.length)}
          className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
          title="Clear logs"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-2 py-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            No log entries
          </div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5 leading-relaxed">
              <span className="text-zinc-600 shrink-0 select-none">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className={cn(
                  'px-1 py-0 rounded text-[9px] uppercase shrink-0 leading-normal',
                  LEVEL_BADGE[entry.level]
                )}
              >
                {entry.level}
              </span>
              <span className={cn('break-all', LEVEL_COLORS[entry.level])}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
