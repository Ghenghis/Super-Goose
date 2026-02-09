import React, { memo, useState, useMemo, useCallback } from 'react';
import {
  Loader2,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  Zap,
  Wrench,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillToolCall {
  tool: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: string;
  output?: string;
}

export interface SkillCardProps {
  name: string;
  description: string;
  toolCalls: SkillToolCall[];
  status: 'running' | 'completed' | 'error';
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SkillStatus = SkillCardProps['status'];

const SKILL_STATUS_META: Record<
  SkillStatus,
  {
    icon: React.FC<{ className?: string }>;
    colorClass: string;
    bgTint: string;
    borderTint: string;
    badgeBg: string;
    label: string;
  }
> = {
  running: {
    icon: Loader2,
    colorClass: 'text-blue-500',
    bgTint: 'bg-blue-500/5',
    borderTint: 'border-blue-500/30',
    badgeBg: 'bg-blue-500/15 text-blue-500',
    label: 'Running',
  },
  completed: {
    icon: Check,
    colorClass: 'text-green-500',
    bgTint: 'bg-green-500/5',
    borderTint: 'border-green-500/20',
    badgeBg: 'bg-green-500/15 text-green-500',
    label: 'Completed',
  },
  error: {
    icon: X,
    colorClass: 'text-red-500',
    bgTint: 'bg-red-500/5',
    borderTint: 'border-red-500/20',
    badgeBg: 'bg-red-500/15 text-red-500',
    label: 'Error',
  },
};

const TOOL_STATUS_ICON: Record<
  SkillToolCall['status'],
  {
    icon: React.FC<{ className?: string }>;
    colorClass: string;
  }
> = {
  pending: { icon: Clock, colorClass: 'text-gray-400' },
  running: { icon: Loader2, colorClass: 'text-blue-500' },
  completed: { icon: Check, colorClass: 'text-green-500' },
  error: { icon: X, colorClass: 'text-red-500' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ToolCallRow = memo<{
  call: SkillToolCall;
  index: number;
}>(({ call, index }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_STATUS_ICON[call.status];
  const Icon = meta.icon;
  const hasDetail = !!(call.input || call.output);
  const isRunning = call.status === 'running';

  const toggle = useCallback(() => {
    if (hasDetail) setExpanded((v) => !v);
  }, [hasDetail]);

  return (
    <div
      className={cn(
        'border-t border-border-default first:border-t-0',
        call.status === 'running' && 'bg-blue-500/5'
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
          'transition-colors duration-100',
          hasDetail ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
        )}
      >
        {/* Step number */}
        <span className="text-xs text-text-muted tabular-nums w-4 shrink-0 text-right">
          {index + 1}
        </span>

        {/* Status icon */}
        <Icon
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            meta.colorClass,
            isRunning && 'animate-spin'
          )}
        />

        {/* Tool name */}
        <Wrench className="w-3 h-3 text-text-muted shrink-0" />
        <span
          className={cn(
            'truncate flex-1 min-w-0',
            call.status === 'completed' && 'text-text-muted',
            call.status === 'running' && 'text-text-default font-medium',
            call.status === 'pending' && 'text-text-muted',
            call.status === 'error' && 'text-red-400'
          )}
        >
          {call.tool}
        </span>

        {/* Expand chevron */}
        {hasDetail && (
          <span className="shrink-0 text-text-muted">
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
      </button>

      {/* Expandable detail */}
      {expanded && hasDetail && (
        <div className="px-3 pb-2 pl-12 space-y-1.5">
          {call.input && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                Input
              </span>
              <pre className="mt-0.5 text-xs text-text-muted bg-gray-950/60 rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap max-h-24 overflow-y-auto scrollbar-thin">
                {call.input}
              </pre>
            </div>
          )}
          {call.output && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                Output
              </span>
              <pre
                className={cn(
                  'mt-0.5 text-xs rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap max-h-24 overflow-y-auto scrollbar-thin',
                  call.status === 'error'
                    ? 'text-red-400 bg-red-500/10'
                    : 'text-text-muted bg-gray-950/60'
                )}
              >
                {call.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
ToolCallRow.displayName = 'ToolCallRow';

// ---------------------------------------------------------------------------
// SkillCard
// ---------------------------------------------------------------------------

export const SkillCard = memo<SkillCardProps>(
  ({ name, description, toolCalls, status, className }) => {
    const [isExpanded, setIsExpanded] = useState(status === 'running');
    const meta = SKILL_STATUS_META[status];
    const StatusIcon = meta.icon;

    // Compute progress
    const progress = useMemo(() => {
      if (toolCalls.length === 0) return 0;
      const done = toolCalls.filter(
        (c) => c.status === 'completed' || c.status === 'error'
      ).length;
      return Math.round((done / toolCalls.length) * 100);
    }, [toolCalls]);

    // Summary counts
    const counts = useMemo(() => {
      let completed = 0;
      let running = 0;
      let errors = 0;
      let pending = 0;
      for (const c of toolCalls) {
        switch (c.status) {
          case 'completed': completed++; break;
          case 'running': running++; break;
          case 'error': errors++; break;
          case 'pending': pending++; break;
        }
      }
      return { completed, running, errors, pending };
    }, [toolCalls]);

    const toggleExpanded = useCallback(
      () => setIsExpanded((v) => !v),
      []
    );

    // Result summary for completed/error states
    const resultSummary = useMemo(() => {
      if (status === 'completed' && counts.errors === 0) {
        return `All ${toolCalls.length} tool calls completed successfully`;
      }
      if (status === 'error' || counts.errors > 0) {
        return `${counts.errors} of ${toolCalls.length} tool calls failed`;
      }
      return null;
    }, [status, counts, toolCalls.length]);

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
            'cursor-pointer hover:bg-white/5 transition-colors'
          )}
          onClick={toggleExpanded}
          role="button"
          aria-expanded={isExpanded}
        >
          {/* Collapse chevron */}
          <span className="shrink-0 text-text-muted transition-transform duration-200">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </span>

          {/* Skill icon */}
          <Zap className={cn('w-4 h-4 shrink-0', meta.colorClass)} />

          {/* Name */}
          <span className="text-sm font-medium text-text-default truncate flex-1 min-w-0">
            {name}
          </span>

          {/* Tool call count */}
          <span className="text-xs text-text-muted tabular-nums shrink-0">
            {counts.completed + counts.errors}/{toolCalls.length}
          </span>

          {/* Status badge */}
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full shrink-0 select-none',
              meta.badgeBg
            )}
          >
            {meta.label}
          </span>

          {/* Status icon */}
          <StatusIcon
            className={cn(
              'w-4 h-4 shrink-0',
              meta.colorClass,
              status === 'running' && 'animate-spin'
            )}
          />
        </div>

        {/* Progress bar */}
        {status === 'running' && (
          <div className="px-3 pb-1">
            <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Description */}
        <div className="px-3 pb-2">
          <p className="text-xs text-text-muted pl-[26px]">{description}</p>
        </div>

        {/* Expandable tool call list */}
        <div
          className={cn(
            'transition-all duration-300 ease-in-out overflow-hidden',
            isExpanded ? 'opacity-100' : 'max-h-0 opacity-0'
          )}
          style={
            isExpanded
              ? { maxHeight: `${toolCalls.length * 200 + 100}px` }
              : { maxHeight: 0 }
          }
        >
          <div className="border-t border-border-default">
            {toolCalls.map((call, i) => (
              <ToolCallRow key={`${call.tool}-${i}`} call={call} index={i} />
            ))}
          </div>

          {/* Result summary */}
          {resultSummary && (status === 'completed' || status === 'error') && (
            <div
              className={cn(
                'px-3 py-2 border-t border-border-default text-xs',
                status === 'completed' && counts.errors === 0
                  ? 'text-green-400 bg-green-500/5'
                  : 'text-red-400 bg-red-500/5'
              )}
            >
              <div className="flex items-center gap-1.5 pl-[26px]">
                {status === 'completed' && counts.errors === 0 ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <X className="w-3.5 h-3.5 text-red-500" />
                )}
                <span>{resultSummary}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
SkillCard.displayName = 'SkillCard';

export default SkillCard;
