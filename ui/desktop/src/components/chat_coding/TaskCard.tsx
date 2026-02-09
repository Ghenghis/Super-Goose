import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2,
  Check,
  X,
  Clock,
  ChevronRight,
  ChevronDown,
  Terminal,
  Ban,
} from 'lucide-react';
import { cn } from '../../utils';
import TaskGraph from './TaskGraph';
import type { TaskGraphNode } from './TaskGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface TaskLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface SubTask {
  id: string;
  title: string;
  status: TaskStatus;
  logs?: TaskLog[];
}

export interface TaskCardProps {
  id: string;
  title: string;
  status: TaskStatus;
  progress?: number; // 0-100, undefined = indeterminate
  startedAt?: number; // unix ms timestamp
  completedAt?: number; // unix ms timestamp
  logs?: TaskLog[];
  subtasks?: SubTask[];
  dependencies?: TaskGraphNode[];
  collapsed?: boolean;
  className?: string;
}

export interface TaskCardGroupProps {
  title: string;
  tasks: TaskCardProps[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  TaskStatus,
  {
    icon: React.FC<{ className?: string }>;
    colorClass: string;
    bgTint: string;
    borderTint: string;
    label: string;
  }
> = {
  pending: {
    icon: Clock,
    colorClass: 'text-gray-400',
    bgTint: 'bg-gray-500/5',
    borderTint: 'border-gray-500/20',
    label: 'Pending',
  },
  running: {
    icon: Loader2,
    colorClass: 'text-blue-500',
    bgTint: 'bg-blue-500/5',
    borderTint: 'border-blue-500/30',
    label: 'Running',
  },
  success: {
    icon: Check,
    colorClass: 'text-green-500',
    bgTint: 'bg-green-500/5',
    borderTint: 'border-green-500/20',
    label: 'Success',
  },
  error: {
    icon: X,
    colorClass: 'text-red-500',
    bgTint: 'bg-red-500/5',
    borderTint: 'border-red-500/20',
    label: 'Error',
  },
  cancelled: {
    icon: Ban,
    colorClass: 'text-gray-400',
    bgTint: 'bg-gray-500/5',
    borderTint: 'border-gray-500/20',
    label: 'Cancelled',
  },
};

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

/** Format a log timestamp relative to task start */
function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

const LOG_LEVEL_STYLES: Record<TaskLog['level'], string> = {
  info: 'text-text-muted',
  warn: 'text-yellow-500',
  error: 'text-red-500',
  debug: 'text-gray-500',
};

// ---------------------------------------------------------------------------
// StatusIcon
// ---------------------------------------------------------------------------

const StatusIcon = memo<{ status: TaskStatus; className?: string }>(
  ({ status, className }) => {
    const meta = STATUS_META[status];
    const Icon = meta.icon;

    if (status === 'running') {
      return (
        <Icon
          className={cn('w-4 h-4 animate-spin', meta.colorClass, className)}
          aria-label="Running"
        />
      );
    }

    return (
      <Icon
        className={cn('w-4 h-4', meta.colorClass, className)}
        aria-label={meta.label}
      />
    );
  }
);
StatusIcon.displayName = 'StatusIcon';

// ---------------------------------------------------------------------------
// ElapsedTimer -- live-updating elapsed time
// ---------------------------------------------------------------------------

const ElapsedTimer = memo<{ startedAt: number; completedAt?: number; status: TaskStatus }>(
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
ElapsedTimer.displayName = 'ElapsedTimer';

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

const ProgressBar = memo<{ progress?: number; status: TaskStatus }>(
  ({ progress, status }) => {
    const isDeterminate = typeof progress === 'number';
    const meta = STATUS_META[status];

    // Map status to bar color
    const barColor = (() => {
      switch (status) {
        case 'running':
          return 'bg-blue-500';
        case 'success':
          return 'bg-green-500';
        case 'error':
          return 'bg-red-500';
        default:
          return 'bg-gray-400';
      }
    })();

    if (status === 'pending') {
      return (
        <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" />
      );
    }

    return (
      <div
        className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={isDeterminate ? progress : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={meta.label}
      >
        {isDeterminate ? (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              barColor
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        ) : (
          <div
            className={cn(
              'h-full rounded-full',
              barColor,
              status === 'running' && 'animate-indeterminate-bar'
            )}
          />
        )}
      </div>
    );
  }
);
ProgressBar.displayName = 'ProgressBar';

// ---------------------------------------------------------------------------
// LogViewer -- auto-scrolling terminal-like log output
// ---------------------------------------------------------------------------

const LogViewer = memo<{ logs: TaskLog[]; maxHeight?: string }>(
  ({ logs, maxHeight = '12rem' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScroll = useRef(true);

    const handleScroll = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      // If user scrolled up, stop auto-scrolling; re-enable when near bottom
      const threshold = 30;
      shouldAutoScroll.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (el && shouldAutoScroll.current) {
        el.scrollTop = el.scrollHeight;
      }
    }, [logs.length]);

    if (logs.length === 0) return null;

    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto overflow-x-hidden bg-gray-950/60 dark:bg-gray-950/80 rounded-md font-mono text-xs leading-5 p-2 scrollbar-thin"
        style={{ maxHeight }}
      >
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 items-start hover:bg-white/5 px-1 rounded">
            <span className="text-gray-600 select-none shrink-0 w-16 text-right">
              {formatLogTime(log.timestamp)}
            </span>
            <span
              className={cn(
                'break-all whitespace-pre-wrap',
                LOG_LEVEL_STYLES[log.level]
              )}
            >
              {log.message}
            </span>
          </div>
        ))}
      </div>
    );
  }
);
LogViewer.displayName = 'LogViewer';

// ---------------------------------------------------------------------------
// SubTaskRow
// ---------------------------------------------------------------------------

const SubTaskRow = memo<{ subtask: SubTask }>(({ subtask }) => {
  const [logsOpen, setLogsOpen] = useState(false);
  const hasLogs = subtask.logs && subtask.logs.length > 0;

  return (
    <div className="pl-6 border-l-2 border-border-default ml-2">
      <div className="flex items-center gap-2 py-1.5 px-2">
        <StatusIcon status={subtask.status} />
        <span className="text-sm text-text-default truncate flex-1">
          {subtask.title}
        </span>
        {hasLogs && (
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
            aria-label={logsOpen ? 'Hide subtask logs' : 'Show subtask logs'}
          >
            <Terminal className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
      </div>
      {logsOpen && hasLogs && (
        <div className="pb-2 pl-2">
          <LogViewer logs={subtask.logs!} maxHeight="8rem" />
        </div>
      )}
    </div>
  );
});
SubTaskRow.displayName = 'SubTaskRow';

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

export const TaskCard = memo<TaskCardProps>(
  ({
    title,
    status,
    progress,
    startedAt,
    completedAt,
    logs = [],
    subtasks = [],
    dependencies,
    collapsed: initialCollapsed,
    className,
  }) => {
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed ?? false);
    const [logsOpen, setLogsOpen] = useState(status === 'running');
    const meta = STATUS_META[status];

    // Auto-expand logs when task starts running
    useEffect(() => {
      if (status === 'running') {
        setLogsOpen(true);
      }
    }, [status]);

    const hasLogs = logs.length > 0;
    const hasSubtasks = subtasks.length > 0;
    const hasExpandableContent = hasLogs || hasSubtasks;

    return (
      <div
        className={cn(
          'rounded-lg border overflow-hidden transition-all duration-300 ease-in-out',
          meta.borderTint,
          meta.bgTint,
          className
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-2.5 px-3 py-2.5 select-none',
            hasExpandableContent && 'cursor-pointer hover:bg-white/5 transition-colors'
          )}
          onClick={
            hasExpandableContent ? () => setIsCollapsed((v) => !v) : undefined
          }
          role={hasExpandableContent ? 'button' : undefined}
          aria-expanded={hasExpandableContent ? !isCollapsed : undefined}
        >
          {/* Collapse chevron */}
          {hasExpandableContent ? (
            <span className="shrink-0 text-text-muted transition-transform duration-200">
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          ) : (
            <span className="w-4 shrink-0" /> /* spacer for alignment */
          )}

          {/* Status icon */}
          <StatusIcon status={status} />

          {/* Title */}
          <span className="text-sm font-medium text-text-default truncate flex-1 min-w-0">
            {title}
          </span>

          {/* Status pill */}
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full shrink-0 select-none',
              status === 'running' && 'bg-blue-500/15 text-blue-500',
              status === 'success' && 'bg-green-500/15 text-green-500',
              status === 'error' && 'bg-red-500/15 text-red-500',
              status === 'pending' && 'bg-gray-500/15 text-gray-400',
              status === 'cancelled' && 'bg-gray-500/15 text-gray-400'
            )}
          >
            {meta.label}
          </span>

          {/* Elapsed timer */}
          {startedAt != null && (
            <ElapsedTimer
              startedAt={startedAt}
              completedAt={completedAt}
              status={status}
            />
          )}
        </div>

        {/* Progress bar */}
        {(status === 'running' || status === 'pending') && (
          <div className="px-3 pb-1">
            <ProgressBar progress={progress} status={status} />
          </div>
        )}

        {/* Expandable content */}
        <div
          className={cn(
            'transition-all duration-300 ease-in-out overflow-hidden',
            isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100'
          )}
        >
          {/* Subtasks */}
          {hasSubtasks && (
            <div className="px-3 pt-1 pb-2 border-t border-border-default">
              <div className="space-y-0.5">
                {subtasks.map((sub) => (
                  <SubTaskRow key={sub.id} subtask={sub} />
                ))}
              </div>
            </div>
          )}

          {/* Task dependency graph */}
          {dependencies && dependencies.length > 0 && (
            <div className="mt-2 border-t border-white/5 pt-2">
              <TaskGraph nodes={dependencies} />
            </div>
          )}

          {/* Logs section */}
          {hasLogs && (
            <div className="border-t border-border-default">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLogsOpen((v) => !v);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:bg-white/5 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span className="font-medium">Logs</span>
                <span className="text-gray-500">({logs.length})</span>
                <span className="ml-auto">
                  {logsOpen ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
              </button>
              <div
                className={cn(
                  'transition-all duration-300 ease-in-out overflow-hidden',
                  logsOpen ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
                )}
              >
                <div className="px-3 pb-3">
                  <LogViewer logs={logs} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
TaskCard.displayName = 'TaskCard';

// ---------------------------------------------------------------------------
// TaskCardGroup
// ---------------------------------------------------------------------------

export const TaskCardGroup = memo<TaskCardGroupProps>(
  ({ title, tasks, className }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Compute summary counts
    const counts = tasks.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      },
      {} as Record<TaskStatus, number>
    );

    const total = tasks.length;
    const completed = (counts.success || 0) + (counts.error || 0) + (counts.cancelled || 0);
    const isAllDone = completed === total && total > 0;
    const hasErrors = (counts.error || 0) > 0;
    const running = counts.running || 0;

    // Determine overall group status
    const groupStatus: TaskStatus = (() => {
      if (total === 0) return 'pending';
      if (hasErrors && isAllDone) return 'error';
      if (isAllDone) return 'success';
      if (running > 0) return 'running';
      return 'pending';
    })();

    const groupMeta = STATUS_META[groupStatus];

    // Summary line
    const summaryParts: string[] = [];
    if (counts.success) summaryParts.push(`${counts.success} done`);
    if (counts.running) summaryParts.push(`${counts.running} running`);
    if (counts.error) summaryParts.push(`${counts.error} failed`);
    if (counts.pending) summaryParts.push(`${counts.pending} pending`);
    if (counts.cancelled) summaryParts.push(`${counts.cancelled} cancelled`);
    const summaryText = summaryParts.join(' \u00b7 ');

    // Overall progress
    const overallProgress =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
      <div
        className={cn(
          'rounded-xl border overflow-hidden transition-all duration-300',
          groupMeta.borderTint,
          'bg-background-default',
          className
        )}
      >
        {/* Group header */}
        <div
          className={cn(
            'flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none',
            'hover:bg-white/5 transition-colors',
            groupMeta.bgTint
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

          <StatusIcon status={groupStatus} />

          <span className="text-sm font-semibold text-text-default truncate flex-1 min-w-0">
            {title}
          </span>

          {/* Completion fraction */}
          <span className="text-xs text-text-muted tabular-nums shrink-0">
            {completed}/{total}
          </span>
        </div>

        {/* Overall progress bar */}
        <div className="px-4 pb-1">
          <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                hasErrors ? 'bg-red-500' : groupStatus === 'running' ? 'bg-blue-500' : 'bg-green-500'
              )}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Summary text */}
        <div className="px-4 pb-2">
          <span className="text-xs text-text-muted">{summaryText}</span>
        </div>

        {/* Task list */}
        <div
          className={cn(
            'transition-all duration-300 ease-in-out overflow-hidden',
            isCollapsed ? 'max-h-0 opacity-0' : 'opacity-100'
          )}
          style={
            isCollapsed
              ? { maxHeight: 0 }
              : { maxHeight: `${tasks.length * 600 + 100}px` }
          }
        >
          <div className="px-3 pb-3 space-y-2">
            {tasks.map((task) => (
              <TaskCard key={task.id} {...task} />
            ))}
          </div>
        </div>
      </div>
    );
  }
);
TaskCardGroup.displayName = 'TaskCardGroup';

// ---------------------------------------------------------------------------
// Keyframe injection for indeterminate progress bar animation
// ---------------------------------------------------------------------------
// This injects a small stylesheet for the indeterminate animation used by
// ProgressBar. It is safe to call multiple times; only one style element is
// created.

const STYLE_ID = '__task-card-animations';

if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes indeterminate-bar {
  0%   { width: 15%; transform: translateX(-100%); }
  50%  { width: 40%; transform: translateX(100%); }
  100% { width: 15%; transform: translateX(400%); }
}
.animate-indeterminate-bar {
  animation: indeterminate-bar 1.8s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
`;
  document.head.appendChild(style);
}

export default TaskCard;
