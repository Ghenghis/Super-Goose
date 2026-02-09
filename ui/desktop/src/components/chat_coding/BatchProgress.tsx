import { memo, useState, useMemo, useRef, useEffect, useCallback, type FC } from 'react';
import {
  Loader2,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchItem {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  result?: string;
  error?: string;
}

export interface BatchProgressProps {
  items: BatchItem[];
  title?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ITEM_STATUS_META: Record<
  BatchItem['status'],
  {
    icon: FC<{ className?: string }>;
    colorClass: string;
    label: string;
  }
> = {
  pending: {
    icon: Clock,
    colorClass: 'text-gray-400',
    label: 'Pending',
  },
  processing: {
    icon: Loader2,
    colorClass: 'text-blue-500',
    label: 'Processing',
  },
  completed: {
    icon: Check,
    colorClass: 'text-green-500',
    label: 'Completed',
  },
  error: {
    icon: X,
    colorClass: 'text-red-500',
    label: 'Error',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ItemStatusIcon = memo<{ status: BatchItem['status']; className?: string }>(
  ({ status, className }) => {
    const meta = ITEM_STATUS_META[status];
    const Icon = meta.icon;

    if (status === 'processing') {
      return (
        <Icon
          className={cn('w-4 h-4 animate-spin', meta.colorClass, className)}
          aria-label="Processing"
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
ItemStatusIcon.displayName = 'ItemStatusIcon';

const ItemProgressBar = memo<{ progress: number }>(({ progress }) => {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="w-full h-1 rounded-full bg-gray-700 overflow-hidden">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
});
ItemProgressBar.displayName = 'ItemProgressBar';

const BatchItemRow = memo<{
  item: BatchItem;
  isCollapsed: boolean;
}>(({ item, isCollapsed }) => {
  if (isCollapsed && item.status === 'completed') {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-3 py-2 border-t border-border-default',
        'transition-colors duration-150',
        item.status === 'processing' && 'bg-blue-500/5',
        item.status === 'error' && 'bg-red-500/5'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <ItemStatusIcon status={item.status} />
        <span
          className={cn(
            'text-sm truncate flex-1 min-w-0',
            item.status === 'completed' && 'text-text-muted',
            item.status === 'error' && 'text-red-400',
            item.status === 'processing' && 'text-text-default font-medium',
            item.status === 'pending' && 'text-text-muted'
          )}
        >
          {item.label}
        </span>
        {item.progress != null && item.status === 'processing' && (
          <span className="text-xs text-blue-400 tabular-nums font-mono shrink-0">
            {Math.round(item.progress)}%
          </span>
        )}
      </div>

      {/* Item-level progress bar for processing items */}
      {item.status === 'processing' && item.progress != null && (
        <div className="pl-6">
          <ItemProgressBar progress={item.progress} />
        </div>
      )}

      {/* Result text */}
      {item.status === 'completed' && item.result && (
        <div className="pl-6">
          <span className="text-xs text-text-muted">{item.result}</span>
        </div>
      )}

      {/* Error text */}
      {item.status === 'error' && item.error && (
        <div className="pl-6">
          <span className="text-xs text-red-400">{item.error}</span>
        </div>
      )}
    </div>
  );
});
BatchItemRow.displayName = 'BatchItemRow';

// ---------------------------------------------------------------------------
// BatchProgress
// ---------------------------------------------------------------------------

export const BatchProgress = memo<BatchProgressProps>(
  ({ items, title, className }) => {
    const [completedCollapsed, setCompletedCollapsed] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    // Compute summary statistics
    const stats = useMemo(() => {
      let completed = 0;
      let errors = 0;
      let processing = 0;
      let pending = 0;

      for (const item of items) {
        switch (item.status) {
          case 'completed':
            completed++;
            break;
          case 'error':
            errors++;
            break;
          case 'processing':
            processing++;
            break;
          case 'pending':
            pending++;
            break;
        }
      }

      const total = items.length;
      const done = completed + errors;
      const overallProgress = total > 0 ? Math.round((done / total) * 100) : 0;

      return { completed, errors, processing, pending, total, done, overallProgress };
    }, [items]);

    // Collect all errors
    const errorItems = useMemo(
      () => items.filter((item) => item.status === 'error'),
      [items]
    );

    // Auto-scroll to current processing item
    useEffect(() => {
      if (!listRef.current) return;
      const processingIndex = items.findIndex((item) => item.status === 'processing');
      if (processingIndex >= 0) {
        const rows = listRef.current.querySelectorAll('[data-batch-item]');
        const row = rows[processingIndex];
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, [items]);

    const toggleCollapsed = useCallback(
      () => setCompletedCollapsed((v) => !v),
      []
    );

    // Determine overall bar color
    const barColorClass = stats.errors > 0
      ? 'bg-red-500'
      : stats.processing > 0
        ? 'bg-blue-500'
        : stats.done === stats.total
          ? 'bg-green-500'
          : 'bg-gray-400';

    return (
      <div
        className={cn(
          'rounded-lg border border-border-default overflow-hidden',
          'bg-background-default',
          className
        )}
      >
        {/* Header */}
        <div className="px-3 py-2.5 bg-background-muted">
          <div className="flex items-center gap-2 mb-1.5">
            {stats.processing > 0 && (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            )}
            {stats.done === stats.total && stats.errors === 0 && stats.total > 0 && (
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            )}
            {stats.done === stats.total && stats.errors > 0 && (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            )}

            <span className="text-sm font-medium text-text-default truncate flex-1">
              {title || 'Batch Progress'}
            </span>

            <span className="text-xs text-text-muted tabular-nums shrink-0">
              {stats.done}/{stats.total}
            </span>
          </div>

          {/* Overall progress bar */}
          <div
            className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
            role="progressbar"
            aria-valuenow={stats.overallProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall batch progress"
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                barColorClass
              )}
              style={{ width: `${stats.overallProgress}%` }}
            />
          </div>
        </div>

        {/* Collapse completed toggle */}
        {stats.completed > 0 && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted',
              'hover:bg-white/5 transition-colors border-t border-border-default',
              'select-none'
            )}
          >
            {completedCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            <span>
              {completedCollapsed
                ? `Show ${stats.completed} completed`
                : `Hide ${stats.completed} completed`}
            </span>
          </button>
        )}

        {/* Item list */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto scrollbar-thin"
        >
          {items.map((item) => (
            <div key={item.id} data-batch-item>
              <BatchItemRow
                item={item}
                isCollapsed={completedCollapsed}
              />
            </div>
          ))}
        </div>

        {/* Error summary */}
        {errorItems.length > 0 && (
          <div className="border-t border-border-default px-3 py-2 bg-red-500/5">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-medium text-red-400">
                {errorItems.length} {errorItems.length === 1 ? 'error' : 'errors'}
              </span>
            </div>
            <div className="space-y-1">
              {errorItems.map((item) => (
                <div key={item.id} className="text-xs text-red-400/80 pl-5 truncate">
                  {item.label}: {item.error || 'Unknown error'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
BatchProgress.displayName = 'BatchProgress';

export default BatchProgress;
