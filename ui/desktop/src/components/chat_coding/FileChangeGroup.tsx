import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FilePlus2,
  FileEdit,
  FileX2,
  FileSymlink,
  Files,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../../utils';
import ContentTypeIndicator, { detectContentType } from './ContentTypeIndicator';

/**
 * Represents a single file change within a batch operation.
 */
export interface FileChange {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  language?: string;
  diff?: string;
}

/**
 * Props for the FileChangeGroup component.
 */
export interface FileChangeGroupProps {
  /** Optional commit-message-style summary, e.g. "Created enterprise API routes" */
  title?: string;
  /** Array of file changes to display */
  files: FileChange[];
  /** Whether the group starts collapsed */
  collapsed?: boolean;
  /** Whether to allow showing full diffs or just the file list */
  showDiffs?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  FileChange['status'],
  {
    icon: React.ElementType;
    dotColor: string;
    label: string;
  }
> = {
  added: {
    icon: FilePlus2,
    dotColor: 'bg-green-100',
    label: 'Added',
  },
  modified: {
    icon: FileEdit,
    dotColor: 'bg-yellow-100',
    label: 'Modified',
  },
  deleted: {
    icon: FileX2,
    dotColor: 'bg-red-100',
    label: 'Deleted',
  },
  renamed: {
    icon: FileSymlink,
    dotColor: 'bg-blue-100',
    label: 'Renamed',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the file name from a full path. */
function fileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

/** Extract the directory portion of a path (everything before the file name). */
function fileDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Inline stat badge showing additions / deletions for a single file.
 */
const StatBadge = memo(function StatBadge({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions === 0 && deletions === 0) return null;

  return (
    <span className="ml-auto flex items-center gap-1.5 shrink-0 font-mono text-xs tabular-nums">
      {additions > 0 && (
        <span className="text-green-100">+{additions}</span>
      )}
      {deletions > 0 && (
        <span className="text-red-100">-{deletions}</span>
      )}
    </span>
  );
});

/**
 * A simple block that renders the raw unified diff text.
 */
const DiffBlock = memo(function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split('\n');

  return (
    <div className="overflow-x-auto border-t border-border-default bg-neutral-950/60">
      <pre className="p-3 text-xs leading-relaxed font-mono">
        {lines.map((line, i) => {
          let lineClass = 'text-text-muted';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'text-green-100 bg-green-100/10';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'text-red-100 bg-red-100/10';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-blue-100';
          }

          return (
            <div key={i} className={cn('px-1 whitespace-pre-wrap', lineClass)}>
              {line || '\u00A0'}
            </div>
          );
        })}
      </pre>
    </div>
  );
});

/**
 * A single file row inside the list.
 */
const FileRow = memo(function FileRow({
  file,
  isExpanded,
  onToggle,
  showDiffs,
}: {
  file: FileChange;
  isExpanded: boolean;
  onToggle: () => void;
  showDiffs: boolean;
}) {
  const config = STATUS_CONFIG[file.status];
  const dir = fileDir(file.filePath);
  const name = fileName(file.filePath);
  const hasDiff = showDiffs && !!file.diff;

  return (
    <div className="border-t border-border-default first:border-t-0">
      <button
        type="button"
        onClick={hasDiff ? onToggle : undefined}
        className={cn(
          'group flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm font-sans',
          'transition-colors duration-100',
          hasDiff
            ? 'hover:bg-background-muted cursor-pointer'
            : 'cursor-default'
        )}
      >
        {/* Status dot */}
        <span
          className={cn('w-2 h-2 rounded-full shrink-0', config.dotColor)}
          title={config.label}
        />

        {/* File path */}
        <span className="truncate min-w-0 flex-1">
          {dir && (
            <span className="text-text-muted">{dir}</span>
          )}
          <span className="text-text-default font-medium">{name}</span>
        </span>

        {/* Content type indicator */}
        <ContentTypeIndicator type={detectContentType(file.filePath)} size="sm" />

        {/* Language tag */}
        {file.language && (
          <span className="text-[10px] uppercase tracking-wider text-text-muted bg-background-muted px-1.5 py-0.5 rounded shrink-0">
            {file.language}
          </span>
        )}

        {/* Stat badge */}
        <StatBadge additions={file.additions} deletions={file.deletions} />

        {/* Expand chevron */}
        {hasDiff && (
          <ChevronRight
            size={14}
            className={cn(
              'shrink-0 text-text-muted transition-transform duration-150',
              'opacity-50 group-hover:opacity-100',
              isExpanded && 'rotate-90'
            )}
          />
        )}
      </button>

      {/* Diff content */}
      {isExpanded && file.diff && <DiffBlock diff={file.diff} />}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FileChangeGroup = memo(function FileChangeGroup({
  title,
  files,
  collapsed = false,
  showDiffs = true,
  className,
}: FileChangeGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [allDiffsShown, setAllDiffsShown] = useState(false);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const f of files) {
      totalAdditions += f.additions;
      totalDeletions += f.deletions;
    }
    return { totalAdditions, totalDeletions, count: files.length };
  }, [files]);

  const filesWithDiffs = useMemo(
    () => files.filter((f) => !!f.diff),
    [files]
  );
  const hasDiffs = showDiffs && filesWithDiffs.length > 0;

  // Toggle a single file diff
  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  // Show / hide all diffs
  const toggleAllDiffs = useCallback(() => {
    if (allDiffsShown) {
      setExpandedFiles(new Set());
      setAllDiffsShown(false);
    } else {
      setExpandedFiles(new Set(filesWithDiffs.map((f) => f.filePath)));
      setAllDiffsShown(true);
    }
  }, [allDiffsShown, filesWithDiffs]);

  // Keep allDiffsShown in sync when individual files are toggled
  const isFileExpanded = useCallback(
    (filePath: string) => expandedFiles.has(filePath),
    [expandedFiles]
  );

  if (files.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-border-default overflow-hidden',
        'text-sm font-sans',
        className
      )}
    >
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <button
        type="button"
        onClick={() => setIsCollapsed((c) => !c)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-left',
          'bg-background-muted hover:bg-background-medium transition-colors duration-100',
          'select-none cursor-pointer'
        )}
      >
        {/* Collapse chevron */}
        {isCollapsed ? (
          <ChevronRight size={16} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-text-muted" />
        )}

        {/* File icon */}
        <Files size={16} className="shrink-0 text-text-muted" />

        {/* Summary text */}
        <span className="flex-1 min-w-0 truncate">
          {title && (
            <span className="text-text-default font-medium mr-2">
              {title}
            </span>
          )}
          <span className="text-text-muted">
            {stats.count} {stats.count === 1 ? 'file' : 'files'} changed
          </span>
          {(stats.totalAdditions > 0 || stats.totalDeletions > 0) && (
            <span className="ml-2 font-mono text-xs tabular-nums">
              {stats.totalAdditions > 0 && (
                <span className="text-green-100">
                  +{stats.totalAdditions}
                </span>
              )}
              {stats.totalAdditions > 0 && stats.totalDeletions > 0 && (
                <span className="text-text-muted mx-1">/</span>
              )}
              {stats.totalDeletions > 0 && (
                <span className="text-red-100">
                  -{stats.totalDeletions}
                </span>
              )}
            </span>
          )}
        </span>
      </button>

      {/* ----------------------------------------------------------------- */}
      {/* Body                                                              */}
      {/* ----------------------------------------------------------------- */}
      {!isCollapsed && (
        <div>
          {/* Toggle all diffs button */}
          {hasDiffs && (
            <div className="flex justify-end px-3 py-1 border-t border-border-default bg-background-muted/50">
              <button
                type="button"
                onClick={toggleAllDiffs}
                className={cn(
                  'flex items-center gap-1 text-xs text-text-muted',
                  'hover:text-text-default transition-colors duration-100',
                  'cursor-pointer select-none'
                )}
              >
                {allDiffsShown ? (
                  <>
                    <EyeOff size={12} />
                    <span>Hide all diffs</span>
                  </>
                ) : (
                  <>
                    <Eye size={12} />
                    <span>Show all diffs</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* File list */}
          <div>
            {files.map((file) => (
              <FileRow
                key={file.filePath}
                file={file}
                isExpanded={isFileExpanded(file.filePath)}
                onToggle={() => toggleFile(file.filePath)}
                showDiffs={showDiffs}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default FileChangeGroup;
