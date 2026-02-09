/**
 * CodeSearch - In-code-block text search with match navigation
 *
 * Provides a search bar overlay for code blocks with:
 * - Text search with match highlighting
 * - Match count display ("3 of 15 matches")
 * - Next / previous match navigation
 * - Case-sensitive toggle
 * - Ctrl+F keyboard shortcut support
 * - Close button
 */
import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchMatch {
  line: number;    // 0-based line index
  startCol: number;
  endCol: number;
}

export interface CodeSearchProps {
  code: string;
  onHighlight: (line: number) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMatches(code: string, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return [];

  const lines = code.split('\n');
  const matches: SearchMatch[] = [];
  const needle = caseSensitive ? query : query.toLowerCase();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const haystack = caseSensitive ? lines[lineIdx] : lines[lineIdx].toLowerCase();
    let searchFrom = 0;

    while (searchFrom < haystack.length) {
      const foundAt = haystack.indexOf(needle, searchFrom);
      if (foundAt === -1) break;

      matches.push({
        line: lineIdx,
        startCol: foundAt,
        endCol: foundAt + needle.length,
      });
      searchFrom = foundAt + 1; // allow overlapping matches
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// CodeSearch component
// ---------------------------------------------------------------------------

const CodeSearch = memo(function CodeSearch({
  code,
  onHighlight,
  className,
}: CodeSearchProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute matches whenever query, code, or case sensitivity changes
  const matches = useMemo(
    () => findMatches(code, query, caseSensitive),
    [code, query, caseSensitive]
  );

  // Clamp current match index when matches change
  useEffect(() => {
    if (matches.length === 0) {
      setCurrentMatchIndex(0);
    } else if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(0);
    }
  }, [matches.length, currentMatchIndex]);

  // Notify parent of highlighted line whenever the active match changes
  useEffect(() => {
    if (matches.length > 0 && currentMatchIndex < matches.length) {
      onHighlight(matches[currentMatchIndex].line);
    }
  }, [matches, currentMatchIndex, onHighlight]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Navigate to next match
  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  // Navigate to previous match
  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // Toggle case sensitivity
  const toggleCaseSensitive = useCallback(() => {
    setCaseSensitive((prev) => !prev);
    setCurrentMatchIndex(0);
  }, []);

  // Handle keyboard shortcuts inside the search input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          goPrev();
        } else {
          goNext();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery('');
      }
    },
    [goNext, goPrev]
  );

  // Match count label
  const matchLabel = useMemo(() => {
    if (!query) return '';
    if (matches.length === 0) return 'No matches';
    return `${currentMatchIndex + 1} of ${matches.length} match${matches.length === 1 ? '' : 'es'}`;
  }, [query, matches.length, currentMatchIndex]);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5',
        'bg-[#1e1e2e] border-b border-[#313244]',
        'text-xs',
        className
      )}
    >
      {/* Search icon */}
      <Search className="h-3.5 w-3.5 text-gray-500 shrink-0" />

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCurrentMatchIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Find in code..."
        className={cn(
          'flex-1 min-w-0 bg-[#313244] text-[#cdd6f4] placeholder-gray-500',
          'rounded px-2 py-1 text-xs outline-none',
          'border border-transparent focus:border-blue-500/50',
          'transition-colors duration-150'
        )}
        style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
        aria-label="Search in code"
      />

      {/* Match count */}
      {query && (
        <span
          className={cn(
            'shrink-0 tabular-nums text-[11px]',
            matches.length === 0 ? 'text-red-400' : 'text-gray-400'
          )}
        >
          {matchLabel}
        </span>
      )}

      {/* Previous match */}
      <button
        type="button"
        onClick={goPrev}
        disabled={matches.length === 0}
        className={cn(
          'p-0.5 rounded transition-colors duration-150',
          matches.length > 0
            ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
            : 'text-gray-600 cursor-not-allowed'
        )}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>

      {/* Next match */}
      <button
        type="button"
        onClick={goNext}
        disabled={matches.length === 0}
        className={cn(
          'p-0.5 rounded transition-colors duration-150',
          matches.length > 0
            ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
            : 'text-gray-600 cursor-not-allowed'
        )}
        title="Next match (Enter)"
        aria-label="Next match"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {/* Case-sensitive toggle */}
      <button
        type="button"
        onClick={toggleCaseSensitive}
        className={cn(
          'p-0.5 rounded transition-colors duration-150',
          caseSensitive
            ? 'text-blue-400 bg-blue-500/20'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'
        )}
        title={caseSensitive ? 'Case sensitive (on)' : 'Case sensitive (off)'}
        aria-label="Toggle case sensitivity"
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </button>

      {/* Close button */}
      <button
        type="button"
        onClick={() => setQuery('')}
        className="p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors duration-150"
        title="Clear search"
        aria-label="Clear search"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

export default CodeSearch;
export { findMatches };
export type { SearchMatch as CodeSearchMatch };
