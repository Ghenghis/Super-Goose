/**
 * ToolResultCodeBlock - Smart code detection for tool results
 *
 * Detects code patterns in tool call outputs and renders them
 * with the enhanced code block instead of plain text. Handles:
 * - Shell command output (with command header)
 * - File content reads (with file path header)
 * - Code execution results (with language detection)
 * - Diff output (with DiffCard rendering)
 */
import React, { memo, useMemo } from 'react';
import CodeActionBar from './CodeActionBar';

interface ToolResultCodeBlockProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  content: string;
  className?: string;
}

interface DetectedBlock {
  type: 'code' | 'diff' | 'shell' | 'output' | 'text';
  content: string;
  language?: string;
  filePath?: string;
  command?: string;
}

// Detect the type of content from tool results
function detectContentType(
  toolName: string,
  args: Record<string, unknown>,
  content: string
): DetectedBlock {
  const name = toolName.split('__').pop()?.toLowerCase() || toolName.toLowerCase();

  // Shell commands
  if (name === 'shell' || name === 'bash' || name === 'execute_command') {
    const command = typeof args.command === 'string' ? args.command : undefined;
    return {
      type: 'shell',
      content,
      command,
      language: 'bash',
    };
  }

  // File reads
  if (name === 'text_editor' || name === 'read_file' || name === 'view') {
    const path = (args.path || args.file_path) as string | undefined;
    const lang = path ? detectLanguageFromPath(path) : undefined;
    return {
      type: 'code',
      content,
      language: lang,
      filePath: path,
    };
  }

  // Code execution
  if (name === 'execute' || name === 'execute_code' || name === 'run') {
    const lang = (args.language as string) || 'typescript';
    return {
      type: 'code',
      content,
      language: lang,
    };
  }

  // Diff content
  if (
    content.startsWith('--- ') ||
    content.startsWith('diff --git') ||
    content.startsWith('@@')
  ) {
    return {
      type: 'diff',
      content,
      language: 'diff',
    };
  }

  // Auto-detect if it looks like code
  if (looksLikeCode(content)) {
    return {
      type: 'code',
      content,
      language: detectLanguageFromContent(content),
    };
  }

  return {
    type: 'text',
    content,
  };
}

// Heuristic: does this content look like source code?
function looksLikeCode(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 3) return false;

  const codeIndicators = [
    /^\s*(import|from|require|export|const|let|var|function|class|def|fn|pub|use|package|module)\s/,
    /^\s*(if|else|for|while|switch|match|try|catch|return|yield)\s/,
    /[{}\[\]();]/,
    /^\s*\/\/|^\s*#|^\s*\/\*/,
    /=>/,
    /\.\w+\(/,
  ];

  let matches = 0;
  const sampleLines = lines.slice(0, 20);
  for (const line of sampleLines) {
    if (codeIndicators.some((rx) => rx.test(line))) {
      matches++;
    }
  }

  return matches >= 3;
}

// Detect programming language from file extension
function detectLanguageFromPath(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    ps1: 'powershell',
    xml: 'xml',
    lua: 'lua',
    r: 'r',
    dart: 'dart',
    zig: 'zig',
    ex: 'elixir',
    exs: 'elixir',
  };
  return ext ? extMap[ext] : undefined;
}

// Detect language from content heuristics
function detectLanguageFromContent(text: string): string | undefined {
  if (/^\s*(import|from)\s+.*\s+(import|from)\s/m.test(text)) return 'python';
  if (/^\s*(use |fn |let |pub |mod |impl |struct |enum )/m.test(text)) return 'rust';
  if (/^\s*(func |package |import ")/m.test(text)) return 'go';
  if (/^\s*(import |export |const |interface |type )/m.test(text)) return 'typescript';
  if (/^\s*(def |class |import |from )/m.test(text)) return 'python';
  if (/^\s*(<\?php|namespace )/m.test(text)) return 'php';
  if (/^\s*(require |module\.exports|console\.)/m.test(text)) return 'javascript';
  return undefined;
}

/**
 * ToolResultCodeBlock renders tool output with smart code detection
 * and enhanced formatting.
 */
const ToolResultCodeBlock = memo(function ToolResultCodeBlock({
  toolName,
  toolArgs = {},
  content,
  className = '',
}: ToolResultCodeBlockProps) {
  const detected = useMemo(
    () => detectContentType(toolName, toolArgs, content),
    [toolName, toolArgs, content]
  );

  const lineCount = content.split('\n').length;
  const [collapsed, setCollapsed] = React.useState(lineCount > 25);
  const [wrapped, setWrapped] = React.useState(false);

  if (detected.type === 'text') {
    // Plain text, no special rendering
    return (
      <pre
        className={`font-mono text-sm text-text-default whitespace-pre-wrap p-3 ${className}`}
      >
        {content}
      </pre>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden border border-[#313244] ${className}`}>
      {/* Action bar header */}
      <CodeActionBar
        language={detected.language}
        filePath={detected.filePath}
        lineCount={lineCount}
        code={content}
        isCollapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onToggleWrap={() => setWrapped(!wrapped)}
        isWrapped={wrapped}
      />

      {/* Shell command header */}
      {detected.type === 'shell' && detected.command && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#11111b] border-b border-[#313244] text-xs">
          <span className="text-emerald-400 font-mono">$</span>
          <span className="text-gray-300 font-mono truncate">{detected.command}</span>
        </div>
      )}

      {/* Code content */}
      {!collapsed && (
        <div className="relative">
          <pre
            className={`font-mono text-sm text-[#cdd6f4] bg-[#1e1e2e] p-3 overflow-x-auto max-h-[500px] overflow-y-auto ${
              wrapped ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
            }`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
          >
            {content}
          </pre>
        </div>
      )}

      {/* Collapsed indicator */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full px-3 py-2 bg-[#1e1e2e] text-gray-500 text-xs font-mono hover:text-gray-300 hover:bg-[#11111b] transition-colors text-center"
        >
          Click to expand {lineCount} lines
        </button>
      )}
    </div>
  );
});

export default ToolResultCodeBlock;
export { detectContentType, detectLanguageFromPath, looksLikeCode };
