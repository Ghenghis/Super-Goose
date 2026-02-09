import { memo, useMemo } from 'react';
import { Loader2, Check, Scissors } from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompactionIndicatorProps {
  isCompacting: boolean;
  beforeTokens?: number;
  afterTokens?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a token count as a human-readable string (e.g. 12.3k, 1.2M) */
function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

// ---------------------------------------------------------------------------
// CompactionIndicator
// ---------------------------------------------------------------------------

export const CompactionIndicator = memo<CompactionIndicatorProps>(
  ({ isCompacting, beforeTokens, afterTokens, className }) => {
    // Calculate reduction percentage
    const reduction = useMemo(() => {
      if (
        beforeTokens == null ||
        afterTokens == null ||
        beforeTokens === 0
      ) {
        return null;
      }
      return Math.round(((beforeTokens - afterTokens) / beforeTokens) * 100);
    }, [beforeTokens, afterTokens]);

    const isComplete = !isCompacting && beforeTokens != null && afterTokens != null;

    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs',
          'border transition-all duration-300 ease-in-out',
          isCompacting
            ? 'border-blue-500/30 bg-blue-500/5'
            : isComplete
              ? 'border-green-500/20 bg-green-500/5'
              : 'border-border-default bg-background-muted',
          className
        )}
        role="status"
        aria-label={
          isCompacting
            ? 'Compacting context'
            : isComplete
              ? 'Context compacted'
              : 'Context compaction'
        }
      >
        {/* Icon */}
        {isCompacting ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
        ) : isComplete ? (
          <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
        ) : (
          <Scissors className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}

        {/* Main label */}
        <span
          className={cn(
            'font-medium select-none',
            isCompacting ? 'text-blue-400' : isComplete ? 'text-green-400' : 'text-text-muted'
          )}
        >
          {isCompacting ? 'Compacting context' : 'Context compacted'}
        </span>

        {/* Animated dots while compacting */}
        {isCompacting && (
          <span className="text-blue-400 tracking-widest" aria-hidden="true">
            <span className="animate-pulse">...</span>
          </span>
        )}

        {/* Token comparison */}
        {beforeTokens != null && afterTokens != null && (
          <span className="flex items-center gap-1 text-text-muted tabular-nums font-mono">
            <span className={isCompacting ? 'text-blue-400/70' : 'text-text-muted'}>
              {formatTokens(beforeTokens)}
            </span>
            <span className="text-text-muted">&rarr;</span>
            <span
              className={cn(
                isComplete ? 'text-green-400' : 'text-blue-400/70'
              )}
            >
              {formatTokens(afterTokens)}
            </span>
          </span>
        )}

        {/* Reduction percentage badge */}
        {reduction != null && isComplete && (
          <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-semibold">
            -{reduction}%
          </span>
        )}
      </div>
    );
  }
);
CompactionIndicator.displayName = 'CompactionIndicator';

export default CompactionIndicator;
