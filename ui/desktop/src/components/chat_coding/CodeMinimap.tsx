/**
 * CodeMinimap - Bird's-eye view of code structure (VS Code style)
 *
 * Renders a scaled-down representation of the code with:
 * - Proportional rendering of code line lengths
 * - Highlighted viewport indicator for the visible range
 * - Click-to-scroll to any position
 * - Color-coded syntax element hints
 */
import React, { memo, useCallback, useRef, useMemo } from 'react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeMinimapProps {
  code: string;
  visibleRange: [number, number]; // [startLine, endLine] (0-indexed)
  totalLines: number;
  onClick: (line: number) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of each minimap line in pixels */
const LINE_HEIGHT = 3;
/** Maximum minimap height */
const MAX_MINIMAP_HEIGHT = 300;
/** Minimap width */
const MINIMAP_WIDTH = 60;
/** Maximum characters visualised per line */
const MAX_LINE_CHARS = 80;

// ---------------------------------------------------------------------------
// Syntax colour heuristics
// ---------------------------------------------------------------------------

type LineCategory = 'comment' | 'keyword' | 'string' | 'import' | 'default';

const LINE_COLOURS: Record<LineCategory, string> = {
  comment: '#6a9955',   // green (comments)
  keyword: '#569cd6',   // blue (control flow / declarations)
  string: '#ce9178',    // orange (strings)
  import: '#c586c0',    // purple (imports / requires)
  default: '#8b8fa3',   // neutral grey
};

function categoriseLine(line: string): LineCategory {
  const trimmed = line.trimStart();

  // Comments
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('<!--')
  ) {
    return 'comment';
  }

  // Import / require
  if (
    /^\s*(import|from|require|use|include|using)\s/.test(line)
  ) {
    return 'import';
  }

  // String-heavy lines (likely template strings, long strings)
  const quoteCount = (line.match(/['""`]/g) || []).length;
  if (quoteCount >= 2 && trimmed.length > 0 && quoteCount / trimmed.length > 0.15) {
    return 'string';
  }

  // Keywords
  if (
    /^\s*(if|else|for|while|switch|case|return|function|class|def|fn|pub|const|let|var|type|interface|struct|enum|match|try|catch|async|await)\b/.test(
      line
    )
  ) {
    return 'keyword';
  }

  return 'default';
}

// ---------------------------------------------------------------------------
// CodeMinimap component
// ---------------------------------------------------------------------------

const CodeMinimap = memo(function CodeMinimap({
  code,
  visibleRange,
  totalLines,
  onClick,
  className,
}: CodeMinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Precompute line data
  const lineData = useMemo(() => {
    const lines = code.split('\n');
    return lines.map((line) => ({
      length: Math.min(line.length, MAX_LINE_CHARS),
      category: categoriseLine(line),
    }));
  }, [code]);

  // Scale factor if there are many lines
  const effectiveLineHeight = useMemo(() => {
    const naturalHeight = totalLines * LINE_HEIGHT;
    if (naturalHeight <= MAX_MINIMAP_HEIGHT) return LINE_HEIGHT;
    return MAX_MINIMAP_HEIGHT / totalLines;
  }, [totalLines]);

  const minimapHeight = useMemo(
    () => Math.min(totalLines * effectiveLineHeight, MAX_MINIMAP_HEIGHT),
    [totalLines, effectiveLineHeight]
  );

  // Viewport indicator position
  const viewportStyle = useMemo(() => {
    const [start, end] = visibleRange;
    const top = start * effectiveLineHeight;
    const height = Math.max((end - start + 1) * effectiveLineHeight, 4);
    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  }, [visibleRange, effectiveLineHeight]);

  // Handle click to navigate
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const lineIndex = Math.floor(y / effectiveLineHeight);
      const clampedLine = Math.max(0, Math.min(lineIndex, totalLines - 1));
      onClick(clampedLine);
    },
    [effectiveLineHeight, totalLines, onClick]
  );

  // Don't render minimap for very short code
  if (totalLines < 10) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative cursor-pointer select-none shrink-0',
        'bg-[#1e1e2e] border-l border-[#313244]',
        className
      )}
      style={{
        width: `${MINIMAP_WIDTH}px`,
        height: `${minimapHeight}px`,
      }}
      onClick={handleClick}
      role="slider"
      aria-label="Code minimap - click to navigate"
      aria-valuemin={0}
      aria-valuemax={totalLines - 1}
      aria-valuenow={visibleRange[0]}
      tabIndex={0}
    >
      {/* Rendered lines */}
      <div className="absolute inset-0 overflow-hidden">
        {lineData.map((data, idx) => {
          const width = Math.max((data.length / MAX_LINE_CHARS) * (MINIMAP_WIDTH - 8), 1);
          return (
            <div
              key={idx}
              className="absolute left-1"
              style={{
                top: `${idx * effectiveLineHeight}px`,
                height: `${Math.max(effectiveLineHeight - 0.5, 1)}px`,
                width: `${width}px`,
                backgroundColor: LINE_COLOURS[data.category],
                opacity: 0.5,
                borderRadius: '0.5px',
              }}
            />
          );
        })}
      </div>

      {/* Viewport indicator */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          ...viewportStyle,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderTop: '1px solid rgba(255, 255, 255, 0.15)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      />
    </div>
  );
});

export default CodeMinimap;
