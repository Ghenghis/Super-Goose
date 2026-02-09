import { memo, useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwarmProgressProps {
  totalAgents: number;
  completedAgents: number;
  failedAgents: number;
  currentPhase?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function estimateRemaining(
  totalAgents: number,
  completedAgents: number,
  elapsedMs: number
): string | null {
  const finished = completedAgents;
  if (finished === 0 || finished >= totalAgents) return null;
  const avgPerAgent = elapsedMs / finished;
  const remaining = totalAgents - finished;
  const estimateMs = avgPerAgent * remaining;
  return formatElapsed(estimateMs);
}

// ---------------------------------------------------------------------------
// Circular progress ring
// ---------------------------------------------------------------------------

const CircularProgress = memo<{
  progress: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  hasErrors: boolean;
}>(({ progress, size = 48, strokeWidth = 4, hasErrors }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  const strokeColor = hasErrors
    ? 'stroke-red-500'
    : progress >= 100
      ? 'stroke-green-500'
      : 'stroke-blue-500';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
    >
      {/* Background ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-700/50"
      />
      {/* Progress ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cn('transition-all duration-500 ease-out', strokeColor)}
      />
    </svg>
  );
});
CircularProgress.displayName = 'CircularProgress';

// ---------------------------------------------------------------------------
// SwarmProgress
// ---------------------------------------------------------------------------

export const SwarmProgress = memo<SwarmProgressProps>(
  ({ totalAgents, completedAgents, failedAgents, currentPhase, className }) => {
    const [expanded, setExpanded] = useState(false);
    const [startTime] = useState(() => Date.now());
    const [now, setNow] = useState(Date.now);

    const isRunning = completedAgents + failedAgents < totalAgents;

    useEffect(() => {
      if (!isRunning) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [isRunning]);

    const elapsedMs = now - startTime;
    const finishedAgents = completedAgents + failedAgents;
    const pendingAgents = totalAgents - finishedAgents;
    const progress = totalAgents > 0 ? (finishedAgents / totalAgents) * 100 : 0;
    const hasErrors = failedAgents > 0;
    const isDone = finishedAgents >= totalAgents && totalAgents > 0;

    const eta = useMemo(
      () => estimateRemaining(totalAgents, finishedAgents, elapsedMs),
      [totalAgents, finishedAgents, elapsedMs]
    );

    return (
      <div
        className={cn(
          'rounded-lg border overflow-hidden transition-all duration-300',
          isDone
            ? hasErrors
              ? 'border-red-500/20 bg-red-500/5'
              : 'border-green-500/20 bg-green-500/5'
            : 'border-gray-700/50 bg-gray-800/20',
          className
        )}
      >
        {/* Main compact view */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          {/* Circular progress */}
          <div className="relative">
            <CircularProgress
              progress={progress}
              hasErrors={hasErrors}
              size={40}
              strokeWidth={3}
            />
            {/* Centered percentage or icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isDone ? (
                hasErrors ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )
              ) : (
                <span className="text-[10px] font-bold text-text-default tabular-nums">
                  {Math.round(progress)}%
                </span>
              )}
            </div>
          </div>

          {/* Status text */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-default">
                {isDone
                  ? hasErrors
                    ? 'Swarm completed with errors'
                    : 'Swarm complete'
                  : 'Swarm in progress'}
              </span>
              {isRunning && (
                <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="tabular-nums">
                {finishedAgents}/{totalAgents} agents
              </span>
              {currentPhase && (
                <>
                  <span className="text-gray-600">|</span>
                  <span className="truncate">{currentPhase}</span>
                </>
              )}
            </div>
          </div>

          {/* Timer + ETA */}
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-xs tabular-nums text-text-muted font-mono">
              {formatElapsed(elapsedMs)}
            </span>
            {eta && isRunning && (
              <span className="text-[10px] text-gray-600 font-mono tabular-nums">
                ~{eta} left
              </span>
            )}
          </div>

          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
            )}
          </button>
        </div>

        {/* Linear progress bar */}
        <div className="px-3 pb-2">
          <div className="w-full h-1 rounded-full bg-gray-700/50 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                hasErrors ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500'
              )}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Expanded details */}
        <div
          className={cn(
            'transition-all duration-300 ease-in-out overflow-hidden',
            expanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="px-3 pb-3 border-t border-gray-700/30">
            <div className="grid grid-cols-3 gap-3 pt-2">
              {/* Completed */}
              <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/5 border border-green-500/10">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-green-400 tabular-nums">
                    {completedAgents}
                  </span>
                  <span className="text-[10px] text-gray-500">Completed</span>
                </div>
              </div>

              {/* Failed */}
              <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/5 border border-red-500/10">
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-red-400 tabular-nums">
                    {failedAgents}
                  </span>
                  <span className="text-[10px] text-gray-500">Failed</span>
                </div>
              </div>

              {/* Pending */}
              <div className="flex items-center gap-2 p-2 rounded-md bg-gray-500/5 border border-gray-500/10">
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-400 tabular-nums">
                    {pendingAgents}
                  </span>
                  <span className="text-[10px] text-gray-500">Pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
SwarmProgress.displayName = 'SwarmProgress';

// ---------------------------------------------------------------------------
// Keyframe injection for circular progress animation (if needed later)
// ---------------------------------------------------------------------------

const STYLE_ID = '__swarm-progress-animations';

if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes swarm-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.animate-swarm-pulse {
  animation: swarm-pulse 2s ease-in-out infinite;
}
`;
  document.head.appendChild(style);
}

export default SwarmProgress;
