/**
 * CodeActionBar - Action toolbar for code blocks in chat
 *
 * Appears at the top of code blocks, showing:
 * - Language badge
 * - File path (when available)
 * - Copy button
 * - Apply button (for code that can be applied to files)
 * - Wrap toggle
 * - Line count
 */
import { memo, useState, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  WrapText,
  FileCode2,
  ChevronDown,
  ChevronRight,
  Play,
} from 'lucide-react';

// Language display names and colors
const LANGUAGE_META: Record<string, { label: string; color: string }> = {
  typescript: { label: 'TypeScript', color: '#3178c6' },
  tsx: { label: 'TSX', color: '#3178c6' },
  javascript: { label: 'JavaScript', color: '#f7df1e' },
  jsx: { label: 'JSX', color: '#f7df1e' },
  python: { label: 'Python', color: '#3776ab' },
  rust: { label: 'Rust', color: '#dea584' },
  go: { label: 'Go', color: '#00add8' },
  java: { label: 'Java', color: '#ed8b00' },
  cpp: { label: 'C++', color: '#00599c' },
  c: { label: 'C', color: '#555555' },
  csharp: { label: 'C#', color: '#239120' },
  ruby: { label: 'Ruby', color: '#cc342d' },
  php: { label: 'PHP', color: '#777bb4' },
  swift: { label: 'Swift', color: '#fa7343' },
  kotlin: { label: 'Kotlin', color: '#7f52ff' },
  html: { label: 'HTML', color: '#e34c26' },
  css: { label: 'CSS', color: '#264de4' },
  scss: { label: 'SCSS', color: '#cf649a' },
  json: { label: 'JSON', color: '#292929' },
  yaml: { label: 'YAML', color: '#cb171e' },
  toml: { label: 'TOML', color: '#9c4221' },
  markdown: { label: 'Markdown', color: '#083fa1' },
  sql: { label: 'SQL', color: '#e38c00' },
  bash: { label: 'Bash', color: '#4eaa25' },
  shell: { label: 'Shell', color: '#4eaa25' },
  sh: { label: 'Shell', color: '#4eaa25' },
  powershell: { label: 'PowerShell', color: '#012456' },
  dockerfile: { label: 'Dockerfile', color: '#2496ed' },
  diff: { label: 'Diff', color: '#41b883' },
  xml: { label: 'XML', color: '#0060ac' },
  lua: { label: 'Lua', color: '#000080' },
  r: { label: 'R', color: '#276dc3' },
  dart: { label: 'Dart', color: '#00b4ab' },
  zig: { label: 'Zig', color: '#f7a41d' },
  elixir: { label: 'Elixir', color: '#6e4a7e' },
};

interface CodeActionBarProps {
  language?: string;
  filePath?: string;
  lineCount: number;
  code: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onToggleWrap?: () => void;
  isWrapped?: boolean;
  showApply?: boolean;
  onApply?: () => void;
  className?: string;
}

const CodeActionBar = memo(function CodeActionBar({
  language,
  filePath,
  lineCount,
  code,
  isCollapsed,
  onToggleCollapse,
  onToggleWrap,
  isWrapped,
  showApply,
  onApply,
  className = '',
}: CodeActionBarProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const langMeta = language ? LANGUAGE_META[language.toLowerCase()] : undefined;
  const langLabel = langMeta?.label || language?.toUpperCase() || 'Text';
  const langColor = langMeta?.color || '#888';

  // Extract just the filename from a path
  const fileName = filePath?.split(/[/\\]/).pop() || filePath;

  return (
    <div
      className={`flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] border-b border-[#313244] rounded-t-lg text-xs font-mono select-none ${className}`}
    >
      {/* Left side: collapse toggle + language badge + file path */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-white/10 rounded transition-colors"
            title={isCollapsed ? 'Expand code' : 'Collapse code'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>
        )}

        {/* Language badge */}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: `${langColor}20`,
            color: langColor,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: langColor }}
          />
          {langLabel}
        </span>

        {/* File path */}
        {filePath && (
          <span className="flex items-center gap-1 text-gray-400 truncate min-w-0">
            <FileCode2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate" title={filePath}>
              {fileName}
            </span>
          </span>
        )}

        {/* Line count */}
        <span className="text-gray-500 flex-shrink-0">{lineCount} lines</span>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {/* Wrap toggle */}
        {onToggleWrap && (
          <button
            onClick={onToggleWrap}
            className={`p-1 rounded transition-colors ${
              isWrapped
                ? 'bg-white/10 text-gray-200'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            title={isWrapped ? 'Disable word wrap' : 'Enable word wrap'}
          >
            <WrapText className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Apply button */}
        {showApply && onApply && (
          <button
            onClick={onApply}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors"
            title="Apply to file"
          >
            <Play className="h-3 w-3" />
            <span>Apply</span>
          </button>
        )}

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});

export default CodeActionBar;
export { LANGUAGE_META };
