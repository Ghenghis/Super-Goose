/**
 * ThinkingBlock - Enhanced chain-of-thought / reasoning display
 *
 * Replaces the basic HTML details/summary used for thinking content in
 * GooseMessage with a polished, animated component that shows:
 * - Animated collapse/expand with smooth transitions
 * - "Thinking..." label with brain icon and animated dots while streaming
 * - Formatted markdown content inside
 * - Elapsed time indicator
 * - Word count / token estimate display
 * - Distinct muted visual style
 */
import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Brain, ChevronRight, ChevronDown, Clock, Hash } from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThinkingBlockProps {
  /** The thinking / chain-of-thought content (markdown string). */
  content: string;
  /** Whether the model is still actively generating thinking tokens. */
  isStreaming?: boolean;
  /** Additional CSS classes on the outermost wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rough token estimate: ~4 characters per token for English text. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

/** Count words in a string. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Format a duration (ms) as "Xm Ys" or "Xs". */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// AnimatedDots - three dots that pulse while streaming
// ---------------------------------------------------------------------------

const AnimatedDots = memo(function AnimatedDots() {
  return (
    <span className="inline-flex items-center gap-[2px] ml-1" aria-hidden="true">
      <span className="w-1 h-1 rounded-full bg-purple-400 animate-thinking-dot-1" />
      <span className="w-1 h-1 rounded-full bg-purple-400 animate-thinking-dot-2" />
      <span className="w-1 h-1 rounded-full bg-purple-400 animate-thinking-dot-3" />
    </span>
  );
});

// ---------------------------------------------------------------------------
// ElapsedTimer -- live-updating elapsed time while streaming
// ---------------------------------------------------------------------------

const ElapsedTimer = memo<{ startedAt: number; isStreaming: boolean }>(
  ({ startedAt, isStreaming }) => {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
      if (!isStreaming) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [isStreaming]);

    const elapsed = Math.max(0, (isStreaming ? now : Date.now()) - startedAt);

    if (elapsed < 1000) return null;

    return (
      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-text-muted font-mono select-none">
        <Clock className="w-3 h-3" />
        {formatElapsed(elapsed)}
      </span>
    );
  }
);
ElapsedTimer.displayName = 'ElapsedTimer';

// ---------------------------------------------------------------------------
// ThinkingBlock
// ---------------------------------------------------------------------------

const ThinkingBlock = memo(function ThinkingBlock({
  content,
  isStreaming = false,
  className,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number>(Date.now());

  // Auto-expand while streaming so the user can watch the reasoning
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  // Auto-scroll to bottom of content while streaming
  useEffect(() => {
    if (isStreaming && isExpanded && contentRef.current) {
      const el = contentRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [isStreaming, isExpanded, content]);

  const toggle = useCallback(() => {
    setIsExpanded((v) => !v);
  }, []);

  // Compute stats
  const wordCount = useMemo(() => countWords(content), [content]);
  const tokenEstimate = useMemo(() => estimateTokens(content), [content]);

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden transition-all duration-300 ease-in-out',
        'border-purple-500/20 bg-purple-500/5',
        className
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 select-none',
          'cursor-pointer hover:bg-purple-500/10 transition-colors duration-150',
          'text-left'
        )}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse thinking' : 'Expand thinking'}
      >
        {/* Collapse chevron */}
        <span className="shrink-0 text-purple-400/70 transition-transform duration-200">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>

        {/* Brain icon */}
        <Brain
          className={cn(
            'w-4 h-4 shrink-0',
            isStreaming ? 'text-purple-400 animate-pulse' : 'text-purple-400/70'
          )}
        />

        {/* Label */}
        <span className="text-sm font-medium text-purple-300 select-none">
          {isStreaming ? 'Thinking' : 'Thought process'}
          {isStreaming && <AnimatedDots />}
        </span>

        {/* Spacer */}
        <span className="flex-1 min-w-0" />

        {/* Word count / token estimate */}
        {wordCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-text-muted font-mono tabular-nums select-none shrink-0">
            <Hash className="w-3 h-3" />
            {wordCount} words
            <span className="text-gray-600 mx-0.5">/</span>
            ~{tokenEstimate} tokens
          </span>
        )}

        {/* Elapsed timer */}
        <ElapsedTimer
          startedAt={startedAtRef.current}
          isStreaming={isStreaming}
        />
      </button>

      {/* Expandable content area */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out overflow-hidden',
          isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="border-t border-purple-500/15">
          <div
            ref={contentRef}
            className={cn(
              'px-4 py-3 overflow-y-auto overflow-x-hidden',
              'text-sm text-text-muted leading-relaxed',
              'prose prose-invert prose-sm max-w-none',
              'prose-p:text-text-muted prose-p:my-1.5',
              'prose-headings:text-purple-300/80 prose-headings:font-medium',
              'prose-code:text-purple-300/90 prose-code:bg-purple-500/10 prose-code:px-1 prose-code:rounded',
              'prose-strong:text-purple-200/80',
              'prose-li:text-text-muted prose-li:my-0.5',
              'whitespace-pre-wrap break-words'
            )}
            style={{ maxHeight: '500px' }}
          >
            {content || (
              <span className="italic text-gray-500">
                No thinking content yet...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
ThinkingBlock.displayName = 'ThinkingBlock';

// ---------------------------------------------------------------------------
// Keyframe injection for the animated dots
// ---------------------------------------------------------------------------

const STYLE_ID = '__thinking-block-animations';

if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes thinking-dot-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
}
.animate-thinking-dot-1 {
  animation: thinking-dot-bounce 1.4s ease-in-out infinite;
  animation-delay: 0s;
}
.animate-thinking-dot-2 {
  animation: thinking-dot-bounce 1.4s ease-in-out infinite;
  animation-delay: 0.2s;
}
.animate-thinking-dot-3 {
  animation: thinking-dot-bounce 1.4s ease-in-out infinite;
  animation-delay: 0.4s;
}
`;
  document.head.appendChild(style);
}

export default ThinkingBlock;
