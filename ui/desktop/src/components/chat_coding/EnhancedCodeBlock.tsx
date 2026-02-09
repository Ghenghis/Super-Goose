import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  WrapText,
  FileCode,
  Hash,
  Search,
} from 'lucide-react';
import ContentTypeIndicator, { detectContentType } from './ContentTypeIndicator';
import CodeSearch from './CodeSearch';
import CodeMinimap from './CodeMinimap';
import BreadcrumbPath from './BreadcrumbPath';

// ---------------------------------------------------------------------------
// Theme - matches the existing customOneDarkTheme used in MarkdownContent.tsx
// ---------------------------------------------------------------------------
const customOneDarkTheme = {
  ...oneDark,
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    color: '#e6e6e6',
    fontSize: '14px',
  },
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    color: '#e6e6e6',
    fontSize: '14px',
  },
  comment: { ...oneDark.comment, color: '#a0a0a0', fontStyle: 'italic' },
  prolog: { ...oneDark.prolog, color: '#a0a0a0' },
  doctype: { ...oneDark.doctype, color: '#a0a0a0' },
  cdata: { ...oneDark.cdata, color: '#a0a0a0' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EnhancedCodeBlockProps {
  code: string;
  language?: string;
  filePath?: string;
  startLine?: number;
  showLineNumbers?: boolean;
  collapsible?: boolean;
  maxHeight?: number;
  className?: string;
}

// Map of common language identifiers to display names
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  rb: 'Ruby',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  md: 'Markdown',
  markdown: 'Markdown',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  swift: 'Swift',
  php: 'PHP',
  r: 'R',
  lua: 'Lua',
  vim: 'Vim',
  toml: 'TOML',
  ini: 'INI',
  makefile: 'Makefile',
  terraform: 'Terraform',
  hcl: 'HCL',
  proto: 'Protocol Buffers',
  protobuf: 'Protocol Buffers',
  elixir: 'Elixir',
  erlang: 'Erlang',
  haskell: 'Haskell',
  scala: 'Scala',
  clojure: 'Clojure',
  dart: 'Dart',
  zig: 'Zig',
  nim: 'Nim',
  ocaml: 'OCaml',
};

function getLanguageDisplayName(language: string): string {
  const lower = language.toLowerCase();
  return LANGUAGE_DISPLAY_NAMES[lower] ?? language.toUpperCase();
}

// ---------------------------------------------------------------------------
// Fold state helpers
// ---------------------------------------------------------------------------
interface FoldableRegion {
  startLine: number; // 0-indexed
  endLine: number; // 0-indexed, inclusive
}

/**
 * Detect simple foldable regions by looking for brace / bracket blocks.
 * This is intentionally lightweight -- a best-effort heuristic, not a parser.
 */
function detectFoldableRegions(code: string): FoldableRegion[] {
  const lines = code.split('\n');
  const regions: FoldableRegion[] = [];
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') {
        stack.push(i);
      } else if (ch === '}' || ch === ']' || ch === ')') {
        const start = stack.pop();
        if (start !== undefined && i - start >= 2) {
          regions.push({ startLine: start, endLine: i });
        }
      }
    }
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Gutter cell: line number + optional fold toggle */
const GutterCell = memo(function GutterCell({
  lineNumber,
  isFoldStart,
  isFolded,
  onToggleFold,
}: {
  lineNumber: number;
  isFoldStart: boolean;
  isFolded: boolean;
  onToggleFold: (line: number) => void;
}) {
  return (
    <span
      className="inline-flex items-center select-none pr-3 min-w-[3.5rem] justify-end text-right"
      style={{ color: '#636d83', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
    >
      {isFoldStart ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFold(lineNumber);
          }}
          className="mr-1 p-0 border-0 bg-transparent cursor-pointer text-gray-500 hover:text-gray-300 transition-colors duration-150"
          aria-label={isFolded ? 'Unfold code' : 'Fold code'}
        >
          {isFolded ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="inline-block w-3.5 mr-1" />
      )}
      <span>{lineNumber}</span>
    </span>
  );
});

/** Header bar: language badge, content type, file path, line count, copy button, toggles */
const HeaderBar = memo(function HeaderBar({
  language,
  filePath,
  lineCount,
  copied,
  wordWrap,
  lineNumbers,
  showSearch,
  onCopy,
  onToggleWrap,
  onToggleLineNumbers,
  onToggleSearch,
}: {
  language: string | undefined;
  filePath: string | undefined;
  lineCount: number;
  copied: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  showSearch: boolean;
  onCopy: () => void;
  onToggleWrap: () => void;
  onToggleLineNumbers: () => void;
  onToggleSearch: () => void;
}) {
  // Detect content type from filePath or language for the indicator badge
  const contentType = filePath
    ? detectContentType(filePath)
    : language
      ? detectContentType(`file.${language}`)
      : undefined;
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 rounded-t-lg border-b select-none"
      style={{
        backgroundColor: '#21252b',
        borderColor: '#181a1f',
        minHeight: '34px',
      }}
    >
      {/* Left side: language badge + filepath + line count */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {language && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium shrink-0"
            style={{ backgroundColor: '#2c313a', color: '#98c379' }}
          >
            <FileCode className="h-3 w-3" />
            {getLanguageDisplayName(language)}
          </span>
        )}

        {contentType && contentType !== 'unknown' && (
          <ContentTypeIndicator type={contentType} size="sm" />
        )}

        {filePath && (
          <BreadcrumbPath
            filePath={filePath}
            language={language}
            className="text-gray-400"
          />
        )}

        <span
          className="shrink-0 text-xs tabular-nums"
          style={{ color: '#5c6370' }}
        >
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>

      {/* Right side: toggle buttons + copy */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {/* Search toggle */}
        <button
          type="button"
          onClick={onToggleSearch}
          className={`p-1 rounded transition-colors duration-150 ${
            showSearch
              ? 'text-gray-300 bg-gray-700/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          title={showSearch ? 'Close search (Ctrl+F)' : 'Search in code (Ctrl+F)'}
          aria-label={showSearch ? 'Close search' : 'Search in code'}
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        {/* Line numbers toggle */}
        <button
          type="button"
          onClick={onToggleLineNumbers}
          className={`p-1 rounded transition-colors duration-150 ${
            lineNumbers
              ? 'text-gray-300 bg-gray-700/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          title={lineNumbers ? 'Hide line numbers' : 'Show line numbers'}
          aria-label={lineNumbers ? 'Hide line numbers' : 'Show line numbers'}
        >
          <Hash className="h-3.5 w-3.5" />
        </button>

        {/* Word wrap toggle */}
        <button
          type="button"
          onClick={onToggleWrap}
          className={`p-1 rounded transition-colors duration-150 ${
            wordWrap
              ? 'text-gray-300 bg-gray-700/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          aria-label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
        >
          <WrapText className="h-3.5 w-3.5" />
        </button>

        {/* Copy button */}
        <button
          type="button"
          onClick={onCopy}
          className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors duration-150"
          title="Copy code"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const EnhancedCodeBlock = memo(function EnhancedCodeBlock({
  code,
  language,
  filePath,
  startLine = 1,
  showLineNumbers: initialShowLineNumbers = true,
  collapsible = true,
  maxHeight = 600,
  className = '',
}: EnhancedCodeBlockProps) {
  // ---- State ----
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(initialShowLineNumbers);
  const [foldedRegions, setFoldedRegions] = useState<Set<number>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const codeAreaRef = useRef<HTMLDivElement>(null);

  // ---- Derived data ----
  const trimmedCode = useMemo(() => code.replace(/\n$/, ''), [code]);
  const lines = useMemo(() => trimmedCode.split('\n'), [trimmedCode]);
  const lineCount = lines.length;

  const shouldAutoCollapse = collapsible && lineCount > 15;

  // Initialise collapsed state
  useEffect(() => {
    if (shouldAutoCollapse) {
      setIsCollapsed(true);
    }
  }, [shouldAutoCollapse]);

  // Detect foldable regions once
  const foldableRegions = useMemo(() => detectFoldableRegions(trimmedCode), [trimmedCode]);

  // Map: line number -> region  (only fold start lines)
  const foldStartMap = useMemo(() => {
    const map = new Map<number, FoldableRegion>();
    for (const region of foldableRegions) {
      const lineNum = region.startLine + startLine; // convert to display line number
      if (!map.has(lineNum)) {
        map.set(lineNum, region);
      }
    }
    return map;
  }, [foldableRegions, startLine]);

  // Compute which line indices (0-based) are hidden by folding
  const hiddenLines = useMemo(() => {
    const hidden = new Set<number>();
    for (const foldedLineNum of foldedRegions) {
      const region = foldStartMap.get(foldedLineNum);
      if (region) {
        for (let i = region.startLine + 1; i <= region.endLine; i++) {
          hidden.add(i);
        }
      }
    }
    return hidden;
  }, [foldedRegions, foldStartMap]);

  // Build visible code for the syntax highlighter
  const { visibleCode, visibleLineNumbers } = useMemo(() => {
    const visLines: string[] = [];
    const visNums: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!hiddenLines.has(i)) {
        let line = lines[i];
        // If this line starts a folded region, append an indicator
        const lineNum = i + startLine;
        if (foldedRegions.has(lineNum)) {
          const region = foldStartMap.get(lineNum);
          if (region) {
            const foldedCount = region.endLine - region.startLine;
            line = line + `  // ... ${foldedCount} lines folded`;
          }
        }
        visLines.push(line);
        visNums.push(lineNum);
      }
    }
    return { visibleCode: visLines.join('\n'), visibleLineNumbers: visNums };
  }, [lines, hiddenLines, foldedRegions, foldStartMap, startLine]);

  // ---- Callbacks ----
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmedCode);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [trimmedCode]);

  const handleToggleWrap = useCallback(() => {
    setWordWrap((prev) => !prev);
  }, []);

  const handleToggleLineNumbers = useCallback(() => {
    setLineNumbers((prev) => !prev);
  }, []);

  const handleToggleFold = useCallback((lineNum: number) => {
    setFoldedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(lineNum)) {
        next.delete(lineNum);
      } else {
        next.add(lineNum);
      }
      return next;
    });
  }, []);

  const handleToggleSearch = useCallback(() => {
    setShowSearch((prev) => !prev);
  }, []);

  const handleSearchHighlight = useCallback((line: number) => {
    setHighlightedLine(line);
    // Scroll the highlighted line into view in the code area
    if (codeAreaRef.current) {
      const lineHeight = 22.4; // matches gutter line height
      const scrollTarget = line * lineHeight;
      const container = codeAreaRef.current;
      const containerHeight = container.clientHeight;
      // Center the line in the viewport
      container.scrollTop = Math.max(0, scrollTarget - containerHeight / 2);
    }
  }, []);

  // Ctrl+F keyboard shortcut for search
  const blockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch(true);
      }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track visible range for CodeMinimap
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, Math.min(25, lineCount - 1)]);
  const handleCodeAreaScroll = useCallback(() => {
    if (!codeAreaRef.current) return;
    const container = codeAreaRef.current;
    const lineHeight = 22.4;
    const startLine = Math.floor(container.scrollTop / lineHeight);
    const visibleLines = Math.ceil(container.clientHeight / lineHeight);
    setVisibleRange([startLine, Math.min(startLine + visibleLines - 1, lineCount - 1)]);
  }, [lineCount]);

  const handleMinimapClick = useCallback((line: number) => {
    if (codeAreaRef.current) {
      const lineHeight = 22.4;
      codeAreaRef.current.scrollTop = Math.max(0, line * lineHeight);
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // ---- Syntax highlighter (memoised) ----
  const syntaxHighlighterElement = useMemo(() => {
    return (
      <SyntaxHighlighter
        style={customOneDarkTheme}
        language={language || 'text'}
        PreTag="div"
        showLineNumbers={false}
        wrapLines={true}
        wrapLongLines={wordWrap}
        customStyle={{
          margin: 0,
          padding: 0,
          background: 'transparent',
          width: '100%',
          maxWidth: '100%',
          overflow: wordWrap ? 'hidden' : 'auto',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            lineHeight: '1.6',
            ...(wordWrap
              ? {
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'break-word',
                }
              : {
                  whiteSpace: 'pre',
                }),
          },
        }}
        lineProps={(lineIndex: number) => {
          const displayLineNum = visibleLineNumbers[lineIndex - 1];
          // 0-based line index for comparison with highlightedLine
          const zeroBasedLine = displayLineNum != null ? displayLineNum - startLine : lineIndex - 1;
          const isHighlighted = highlightedLine != null && zeroBasedLine === highlightedLine;
          return {
            style: {
              display: 'flex',
              flexWrap: wordWrap ? ('wrap' as const) : ('nowrap' as const),
              ...(isHighlighted
                ? { backgroundColor: 'rgba(255, 213, 79, 0.15)', borderLeft: '2px solid #ffd54f' }
                : {}),
            },
            'data-line-number': displayLineNum ?? lineIndex,
          };
        }}
      >
        {visibleCode}
      </SyntaxHighlighter>
    );
  }, [language, visibleCode, wordWrap, visibleLineNumbers, highlightedLine, startLine]);

  // ---- Gutter ----
  const gutterElement = useMemo(() => {
    if (!lineNumbers) return null;
    return (
      <div
        className="shrink-0 py-3 select-none"
        style={{ backgroundColor: '#282c34' }}
        aria-hidden="true"
      >
        {visibleLineNumbers.map((lineNum, idx) => {
          const isFoldStart = foldStartMap.has(lineNum);
          const isFolded = foldedRegions.has(lineNum);
          return (
            <div
              key={`gutter-${idx}`}
              className="flex items-center"
              style={{ height: '22.4px', lineHeight: '22.4px' }}
            >
              <GutterCell
                lineNumber={lineNum}
                isFoldStart={isFoldStart}
                isFolded={isFolded}
                onToggleFold={handleToggleFold}
              />
            </div>
          );
        })}
      </div>
    );
  }, [lineNumbers, visibleLineNumbers, foldStartMap, foldedRegions, handleToggleFold]);

  // ---- Render ----
  const codeBody = (
    <div ref={blockRef} tabIndex={-1} className={`rounded-lg overflow-hidden ${className}`} style={{ backgroundColor: '#282c34' }}>
      {/* Header */}
      <HeaderBar
        language={language}
        filePath={filePath}
        lineCount={lineCount}
        copied={copied}
        wordWrap={wordWrap}
        lineNumbers={lineNumbers}
        onCopy={handleCopy}
        onToggleWrap={handleToggleWrap}
        onToggleLineNumbers={handleToggleLineNumbers}
        showSearch={showSearch}
        onToggleSearch={handleToggleSearch}
      />

      {/* CodeSearch overlay */}
      {showSearch && (
        <CodeSearch
          code={trimmedCode}
          onHighlight={handleSearchHighlight}
        />
      )}

      {/* Code area with optional minimap */}
      <div className="flex">
        <div
          ref={codeAreaRef}
          className="overflow-auto flex-1 min-w-0"
          style={{ maxHeight: `${maxHeight}px` }}
          onScroll={handleCodeAreaScroll}
        >
          <div className="flex min-w-0">
            {gutterElement}
            <div className="flex-1 min-w-0 py-3 px-3 overflow-x-auto">
              {syntaxHighlighterElement}
            </div>
          </div>
        </div>

        {/* CodeMinimap for long code blocks (50+ lines) */}
        {lineCount >= 50 && (
          <CodeMinimap
            code={trimmedCode}
            visibleRange={visibleRange}
            totalLines={lineCount}
            onClick={handleMinimapClick}
          />
        )}
      </div>
    </div>
  );

  // If auto-collapsible, wrap in a details/summary
  if (shouldAutoCollapse) {
    return (
      <details
        open={!isCollapsed}
        onToggle={(e) => {
          setIsCollapsed(!(e.currentTarget as HTMLDetailsElement).open);
        }}
        className="w-full"
      >
        <summary
          className="cursor-pointer list-none rounded-lg px-3 py-2 flex items-center gap-2 select-none transition-colors duration-150 hover:brightness-110"
          style={{ backgroundColor: '#21252b', color: '#abb2bf' }}
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
              !isCollapsed ? 'rotate-90' : ''
            }`}
          />
          {language && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: '#2c313a', color: '#98c379' }}
            >
              <FileCode className="h-3 w-3" />
              {getLanguageDisplayName(language)}
            </span>
          )}
          {filePath && (
            <BreadcrumbPath
              filePath={filePath}
              language={language}
              className="text-gray-400"
            />
          )}
          <span className="text-xs tabular-nums" style={{ color: '#5c6370' }}>
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </summary>
        {codeBody}
      </details>
    );
  }

  return codeBody;
});

export default EnhancedCodeBlock;
