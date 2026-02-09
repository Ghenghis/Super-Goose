import { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  FileCode,
  FilePlus,
  FileMinus,
  FileX,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffCardProps {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  lines: DiffLine[];
  language?: string;
  collapsed?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  added: {
    Icon: FilePlus,
    label: 'Added',
    badgeClass: 'bg-green-600/20 text-green-400',
  },
  modified: {
    Icon: FileCode,
    label: 'Modified',
    badgeClass: 'bg-blue-600/20 text-blue-400',
  },
  deleted: {
    Icon: FileX,
    label: 'Deleted',
    badgeClass: 'bg-red-600/20 text-red-400',
  },
  renamed: {
    Icon: FileMinus,
    label: 'Renamed',
    badgeClass: 'bg-yellow-600/20 text-yellow-400',
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFilePath(filePath: string): { dir: string; name: string } {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSlash === -1) return { dir: '', name: filePath };
  return {
    dir: filePath.slice(0, lastSlash + 1),
    name: filePath.slice(lastSlash + 1),
  };
}

function buildDiffText(lines: DiffLine[]): string {
  return lines
    .map((line) => {
      switch (line.type) {
        case 'add':
          return `+${line.content}`;
        case 'remove':
          return `-${line.content}`;
        case 'header':
          return line.content;
        case 'context':
        default:
          return ` ${line.content}`;
      }
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const DiffLineRow = memo(function DiffLineRow({ line }: { line: DiffLine }) {
  const lineStyles: Record<DiffLine['type'], string> = {
    add: 'bg-green-500/10 text-green-300',
    remove: 'bg-red-500/10 text-red-300',
    context: 'text-[color:var(--text-muted)]',
    header: 'bg-blue-500/10 text-blue-400 italic',
  };

  const gutterStyles: Record<DiffLine['type'], string> = {
    add: 'bg-green-500/15 text-green-500/70',
    remove: 'bg-red-500/15 text-red-500/70',
    context: 'text-[color:var(--text-muted)] opacity-50',
    header: 'bg-blue-500/10 text-blue-400/50',
  };

  const prefixChar: Record<DiffLine['type'], string> = {
    add: '+',
    remove: '-',
    context: ' ',
    header: '',
  };

  return (
    <tr className={cn('group/line border-0', lineStyles[line.type])}>
      {/* Old line number gutter */}
      <td
        className={cn(
          'w-[1px] min-w-[3rem] select-none whitespace-nowrap text-right',
          'px-2 py-0 text-xs leading-[20px]',
          'border-r border-[color:var(--border-default)]/20',
          gutterStyles[line.type]
        )}
      >
        {line.type !== 'header' && line.oldLineNum != null ? line.oldLineNum : ''}
      </td>

      {/* New line number gutter */}
      <td
        className={cn(
          'w-[1px] min-w-[3rem] select-none whitespace-nowrap text-right',
          'px-2 py-0 text-xs leading-[20px]',
          'border-r border-[color:var(--border-default)]/20',
          gutterStyles[line.type]
        )}
      >
        {line.type !== 'header' && line.newLineNum != null ? line.newLineNum : ''}
      </td>

      {/* Content */}
      <td className="px-0 py-0">
        <pre
          className="m-0 overflow-x-auto whitespace-pre text-xs leading-[20px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span
            className={cn(
              'inline-block w-4 select-none text-center flex-shrink-0',
              line.type === 'add' && 'text-green-400',
              line.type === 'remove' && 'text-red-400'
            )}
          >
            {prefixChar[line.type]}
          </span>
          <span>{line.content}</span>
        </pre>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// DiffCard
// ---------------------------------------------------------------------------

const DiffCard = memo(function DiffCard({
  filePath,
  status,
  additions,
  deletions,
  lines,
  collapsed = true,
  className,
}: DiffCardProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(() => {
    const text = buildDiffText(lines);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    });
  }, [lines]);

  const { Icon, label, badgeClass } = STATUS_CONFIG[status];
  const { dir, name } = formatFilePath(filePath);

  return (
    <div
      className={cn(
        'rounded-lg border border-[color:var(--border-default)] overflow-hidden',
        'bg-[color:var(--background-default)] text-[color:var(--text-default)]',
        'text-sm',
        className
      )}
    >
      <details open={!collapsed}>
        {/* ----- Header / summary ----- */}
        <summary
          className={cn(
            'flex items-center gap-2 px-3 py-2 cursor-pointer select-none',
            'bg-[color:var(--background-muted)] hover:bg-[color:var(--background-medium)]',
            'border-b border-[color:var(--border-default)]',
            'list-none [&::-webkit-details-marker]:hidden',
            'group/header'
          )}
        >
          {/* Chevron */}
          <ChevronRight
            size={14}
            className={cn(
              'shrink-0 text-[color:var(--text-muted)] transition-transform duration-150',
              '[[open]>& ]:rotate-90'
            )}
          />

          {/* File icon */}
          <Icon size={16} className="shrink-0 text-[color:var(--text-muted)]" />

          {/* File path */}
          <span
            className="truncate flex-1 min-w-0 text-xs"
            style={{ fontFamily: 'var(--font-mono)' }}
            title={filePath}
          >
            {dir && <span className="text-[color:var(--text-muted)]">{dir}</span>}
            <span className="font-semibold">{name}</span>
          </span>

          {/* Status badge */}
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              badgeClass
            )}
          >
            {label}
          </span>

          {/* Stats */}
          <span className="shrink-0 flex items-center gap-1.5 text-xs tabular-nums">
            {additions > 0 && <span className="text-green-400">+{additions}</span>}
            {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
          </span>

          {/* Copy button (visible on hover) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCopy();
            }}
            className={cn(
              'shrink-0 p-1 rounded',
              'opacity-0 group-hover/header:opacity-100 transition-opacity',
              'hover:bg-[color:var(--background-medium)]',
              'text-[color:var(--text-muted)] hover:text-[color:var(--text-default)]'
            )}
            title="Copy diff"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </summary>

        {/* ----- Diff body ----- */}
        <div className="overflow-x-auto bg-[#1e1e2e]">
          <table className="w-full border-collapse text-left" style={{ fontFamily: 'var(--font-mono)' }}>
            <tbody>
              {lines.map((line, idx) => (
                <DiffLineRow key={idx} line={line} />
              ))}
              {lines.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-6 text-center text-xs text-[color:var(--text-muted)] italic"
                  >
                    No changes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
});

export default DiffCard;

// ---------------------------------------------------------------------------
// parseDiffText  --  parse standard unified diff into structured format
// ---------------------------------------------------------------------------

export function parseDiffText(diffText: string): {
  filePath: string;
  status: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
} {
  const rawLines = diffText.split('\n');
  const diffLines: DiffLine[] = [];
  let filePath = '';
  let additions = 0;
  let deletions = 0;
  let oldLine = 0;
  let newLine = 0;
  let status: string = 'modified';

  for (const raw of rawLines) {
    // ---- diff header lines ----

    // "--- a/path" or "--- /dev/null"
    if (raw.startsWith('--- ')) {
      const path = raw.slice(4).replace(/^a\//, '').trim();
      if (path === '/dev/null') {
        status = 'added';
      }
      continue;
    }

    // "+++ b/path" or "+++ /dev/null"
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '').trim();
      if (path === '/dev/null') {
        status = 'deleted';
      } else {
        filePath = path;
      }
      continue;
    }

    // "diff --git a/... b/..."
    if (raw.startsWith('diff --git ')) {
      const match = raw.match(/diff --git a\/(.*?) b\/(.*)/);
      if (match) {
        const [, aPath, bPath] = match;
        filePath = bPath;
        if (aPath !== bPath) {
          status = 'renamed';
        }
      }
      continue;
    }

    // Skip index, mode, and other header lines
    if (
      raw.startsWith('index ') ||
      raw.startsWith('old mode') ||
      raw.startsWith('new mode') ||
      raw.startsWith('new file mode') ||
      raw.startsWith('deleted file mode') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('rename from') ||
      raw.startsWith('rename to') ||
      raw.startsWith('Binary files')
    ) {
      if (raw.startsWith('new file mode')) {
        status = 'added';
      } else if (raw.startsWith('deleted file mode')) {
        status = 'deleted';
      } else if (raw.startsWith('rename from') || raw.startsWith('rename to')) {
        status = 'renamed';
      }
      continue;
    }

    // "@@ -oldStart,oldCount +newStart,newCount @@"
    if (raw.startsWith('@@')) {
      const hunkMatch = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (hunkMatch) {
        oldLine = parseInt(hunkMatch[1], 10);
        newLine = parseInt(hunkMatch[2], 10);
        diffLines.push({
          type: 'header',
          content: raw,
        });
      }
      continue;
    }

    // ---- content lines ----

    if (raw.startsWith('+')) {
      additions++;
      diffLines.push({
        type: 'add',
        content: raw.slice(1),
        newLineNum: newLine,
      });
      newLine++;
    } else if (raw.startsWith('-')) {
      deletions++;
      diffLines.push({
        type: 'remove',
        content: raw.slice(1),
        oldLineNum: oldLine,
      });
      oldLine++;
    } else if (raw.startsWith(' ') || raw === '') {
      // Context line (starts with space) or empty trailing line
      const content = raw.startsWith(' ') ? raw.slice(1) : raw;
      // Skip truly empty trailing lines at end of diff
      if (raw === '' && rawLines.indexOf(raw) === rawLines.length - 1) {
        continue;
      }
      diffLines.push({
        type: 'context',
        content,
        oldLineNum: oldLine,
        newLineNum: newLine,
      });
      oldLine++;
      newLine++;
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" -- skip
      continue;
    }
  }

  return { filePath, status, additions, deletions, lines: diffLines };
}
