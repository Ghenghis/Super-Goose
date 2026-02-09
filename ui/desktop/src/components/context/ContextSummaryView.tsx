import { useRef, useEffect, useCallback, useState } from 'react';
import { Shrink, Loader2, Clock, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils';
import { TokenUsage, CompactionHistoryEntry } from '../../hooks/useContextManagement';

interface ContextSummaryViewProps {
  tokenUsage: TokenUsage;
  messageCount: number;
  compactionHistory: CompactionHistoryEntry[];
  autoCompactEnabled: boolean;
  onAutoCompactChange: (enabled: boolean) => void;
  canCompact: boolean;
  isCompacting: boolean;
  onCompact: () => void;
}

const formatTokenCount = (count: number): string => {
  if (count >= 1000000) {
    const millions = count / 1000000;
    return millions % 1 === 0 ? `${millions.toFixed(0)}M` : `${millions.toFixed(1)}M`;
  } else if (count >= 1000) {
    const thousands = count / 1000;
    return thousands % 1 === 0 ? `${thousands.toFixed(0)}k` : `${thousands.toFixed(1)}k`;
  }
  return count.toString();
};

const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function getProgressColor(percentage: number): string {
  if (percentage <= 50) return 'bg-green-500';
  if (percentage <= 75) return 'bg-yellow-500';
  if (percentage <= 90) return 'bg-orange-500';
  return 'bg-red-500';
}

function getProgressTextColor(percentage: number): string {
  if (percentage <= 50) return 'text-green-500';
  if (percentage <= 75) return 'text-yellow-500';
  if (percentage <= 90) return 'text-orange-500';
  return 'text-red-500';
}

export function ContextSummaryView({
  tokenUsage,
  messageCount,
  compactionHistory,
  autoCompactEnabled,
  onAutoCompactChange,
  canCompact,
  isCompacting,
  onCompact,
}: ContextSummaryViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 300;
    const popoverHeight = popoverRef.current.offsetHeight || 200;
    const offset = 8;

    let top = triggerRect.top - popoverHeight - offset;
    let left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;

    const viewportWidth = window.innerWidth;

    if (left < 10) {
      left = 10;
    } else if (left + popoverWidth > viewportWidth - 10) {
      left = viewportWidth - popoverWidth - 10;
    }

    if (top < 10) {
      top = triggerRect.bottom + offset;
    }

    setPopoverPosition({ top, left });
  }, []);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      const handleResize = () => calculatePosition();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    return undefined;
  }, [isOpen, calculatePosition]);

  // Recalculate position when history is toggled or content changes
  useEffect(() => {
    if (isOpen && popoverRef.current) {
      const timer = setTimeout(() => {
        calculatePosition();
      }, 10);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, showHistory, calculatePosition]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isInteractiveElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') !== null ||
        target.closest('input') !== null;

      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        !isInteractiveElement
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mouseup', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mouseup', handleClickOutside);
    };
  }, [isOpen]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    hideTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // Don't render anything if no token data is available
  if (tokenUsage.max === 0) {
    return null;
  }

  const progressColor = getProgressColor(tokenUsage.percentage);
  const textColor = getProgressTextColor(tokenUsage.percentage);

  const recentHistory = compactionHistory.slice(-5).reverse();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => {
          handleMouseEnter();
          setIsOpen(true);
        }}
        onMouseLeave={handleMouseLeave}
        className="flex items-center gap-1.5 cursor-pointer text-text-default/70 hover:text-text-default transition-colors h-full"
      >
        {/* Mini progress bar */}
        <div className="flex items-center gap-1">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300', progressColor)}
              style={{ width: `${Math.min(100, tokenUsage.percentage)}%` }}
            />
          </div>
          <span className={cn('text-[10px] font-mono', textColor)}>
            {tokenUsage.percentage}%
          </span>
        </div>
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="fixed w-[300px] rounded-lg overflow-hidden bg-background-default border border-border-default z-50 shadow-lg pointer-events-auto text-left"
          style={{
            top: `${popoverPosition.top}px`,
            left: `${popoverPosition.left}px`,
            visibility: popoverPosition.top === 0 ? 'hidden' : 'visible',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex flex-col">
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-border-default">
              <h3 className="text-xs font-medium text-text-default">Context Usage</h3>
            </div>

            {/* Usage Bar */}
            <div className="px-3 py-3">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[11px] text-text-muted">
                  {formatTokenCount(tokenUsage.current)} / {formatTokenCount(tokenUsage.max)} tokens
                </span>
                <span className={cn('text-[11px] font-medium', textColor)}>
                  {tokenUsage.percentage}%
                </span>
              </div>

              {/* Progress bar with dots (matching AlertBox style) */}
              <div className="flex justify-between w-full mb-2">
                {[...Array(30)].map((_, i) => {
                  const dotPosition = i / 29;
                  const isActive = dotPosition <= tokenUsage.percentage / 100;

                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-full h-[3px] w-[3px] transition-all',
                        isActive ? progressColor : 'bg-gray-300 dark:bg-gray-600'
                      )}
                    />
                  );
                })}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-[11px] text-text-muted">
                <span>{messageCount} messages</span>
                {compactionHistory.length > 0 && (
                  <span>{compactionHistory.length} compactions</span>
                )}
              </div>
            </div>

            {/* Auto-compact toggle */}
            <div className="px-3 py-2 border-t border-border-default">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-text-muted" />
                  <span className="text-[11px] text-text-default">Auto-compact at 80%</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoCompactEnabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAutoCompactChange(!autoCompactEnabled);
                  }}
                  className={cn(
                    'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                    autoCompactEnabled
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-3 w-3 rounded-full bg-white transition-transform',
                      autoCompactEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </label>
            </div>

            {/* Compact button */}
            <div className="px-3 py-2 border-t border-border-default">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canCompact && !isCompacting) {
                    onCompact();
                  }
                }}
                disabled={!canCompact || isCompacting}
                className={cn(
                  'flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md text-[11px] font-medium transition-colors',
                  !canCompact || isCompacting
                    ? 'bg-gray-100 dark:bg-gray-800 text-text-muted cursor-not-allowed'
                    : 'bg-background-accent text-text-on-accent hover:bg-background-accent/90 cursor-pointer'
                )}
              >
                {isCompacting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Compacting...</span>
                  </>
                ) : (
                  <>
                    <Shrink className="w-3 h-3" />
                    <span>Compact now</span>
                  </>
                )}
              </button>
            </div>

            {/* Compaction History */}
            {compactionHistory.length > 0 && (
              <div className="border-t border-border-default">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowHistory(!showHistory);
                  }}
                  className="flex items-center justify-between w-full px-3 py-2 text-[11px] text-text-muted hover:text-text-default transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>Compaction history</span>
                  </div>
                  {showHistory ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {showHistory && (
                  <div className="px-3 pb-2 max-h-32 overflow-y-auto">
                    {recentHistory.length === 0 ? (
                      <p className="text-[10px] text-text-muted italic py-1">No compactions yet</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {recentHistory.map((entry, index) => (
                          <div
                            key={`${entry.timestamp}-${index}`}
                            className="flex items-center justify-between py-1 text-[10px]"
                          >
                            <div className="flex items-center gap-1.5 text-text-muted">
                              <span>{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            <div className="text-text-default">
                              {entry.tokensAfter > 0 ? (
                                <span className="text-green-500">
                                  -{formatTokenCount(Math.max(0, entry.tokensBefore - entry.tokensAfter))} tokens
                                </span>
                              ) : (
                                <span className="text-text-muted italic">pending</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
