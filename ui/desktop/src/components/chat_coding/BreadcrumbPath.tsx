/**
 * BreadcrumbPath - File path breadcrumb navigation for code blocks
 *
 * Renders a file path as clickable breadcrumb segments with:
 * - Path segments separated by chevrons
 * - File icon based on detected language
 * - Long path truncation with ellipsis
 * - Copy full path on segment click
 */
import React, { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  FileCode,
  FileJson,
  FileText,
  FileType,
  File,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreadcrumbPathProps {
  filePath: string;
  language?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Language to icon mapping
// ---------------------------------------------------------------------------

type IconComponent = React.FC<{ className?: string }>;

const LANGUAGE_ICONS: Record<string, IconComponent> = {
  typescript: FileCode,
  tsx: FileCode,
  javascript: FileCode,
  jsx: FileCode,
  python: FileCode,
  rust: FileCode,
  go: FileCode,
  java: FileCode,
  cpp: FileCode,
  c: FileCode,
  csharp: FileCode,
  ruby: FileCode,
  php: FileCode,
  swift: FileCode,
  kotlin: FileCode,
  json: FileJson,
  yaml: FileText,
  yml: FileText,
  toml: FileText,
  xml: FileCode,
  html: FileCode,
  css: FileType,
  scss: FileType,
  markdown: FileText,
  md: FileText,
  sql: FileCode,
  bash: FileText,
  shell: FileText,
  sh: FileText,
};

function getFileIcon(language?: string): IconComponent {
  if (!language) return File;
  const lower = language.toLowerCase();
  return LANGUAGE_ICONS[lower] || File;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maximum number of visible breadcrumb segments before truncation */
const MAX_VISIBLE_SEGMENTS = 5;

function splitPath(filePath: string): string[] {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean);
}

// ---------------------------------------------------------------------------
// BreadcrumbPath component
// ---------------------------------------------------------------------------

const BreadcrumbPath = memo(function BreadcrumbPath({
  filePath,
  language,
  className,
}: BreadcrumbPathProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const segments = useMemo(() => splitPath(filePath), [filePath]);

  // Determine which segments to show
  const { displaySegments, truncated } = useMemo(() => {
    if (segments.length <= MAX_VISIBLE_SEGMENTS) {
      return { displaySegments: segments, truncated: false };
    }
    // Show first segment, ellipsis, then last (MAX_VISIBLE_SEGMENTS - 2) segments
    const tail = segments.slice(-(MAX_VISIBLE_SEGMENTS - 1));
    return {
      displaySegments: [segments[0], '...', ...tail],
      truncated: true,
    };
  }, [segments]);

  const FileIcon = useMemo(() => getFileIcon(language), [language]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      setCopied(true);
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  }, [filePath]);

  if (!filePath) return null;


  return (
    <div
      className={cn(
        'flex items-center gap-0.5 min-w-0 overflow-hidden',
        'text-xs',
        className
      )}
      title={filePath}
    >
      {/* File icon */}
      <FileIcon
        className="h-3.5 w-3.5 shrink-0 mr-1"
      />

      {/* Breadcrumb segments */}
      {displaySegments.map((segment, idx) => {
        const isLast = idx === displaySegments.length - 1;
        const isEllipsis = segment === '...' && truncated && idx === 1;

        return (
          <React.Fragment key={`${segment}-${idx}`}>
            {idx > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-gray-600"
              />
            )}
            {isEllipsis ? (
              <span className="text-gray-500 shrink-0 px-0.5">{'\u2026'}</span>
            ) : (
              <button
                type="button"
                onClick={handleCopyPath}
                className={cn(
                  'truncate px-0.5 rounded transition-colors duration-150',
                  'hover:bg-white/10 hover:text-gray-200',
                  isLast
                    ? 'text-[#cdd6f4] font-medium'
                    : 'text-gray-500'
                )}
                title={`Copy path: ${filePath}`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              >
                {segment}
              </button>
            )}
          </React.Fragment>
        );
      })}

      {/* Tiny copy indicator */}
      <button
        type="button"
        onClick={handleCopyPath}
        className={cn(
          'ml-1 p-0.5 rounded shrink-0 transition-colors duration-150',
          'text-gray-600 hover:text-gray-300 hover:bg-white/10'
        )}
        title="Copy full path"
        aria-label="Copy full path"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
});

export default BreadcrumbPath;
