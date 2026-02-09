import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Maximize2, Minimize2, Download, Copy, Check, AlertCircle } from 'lucide-react';

export interface MermaidDiagramProps {
  /** Mermaid diagram definition string */
  code: string;
  /** Optional title for the diagram */
  title?: string;
}

/**
 * MermaidDiagram — renders Mermaid diagram definitions (flowchart, sequence, class, etc.)
 * as interactive SVG visualizations in the chat.
 *
 * Lazily loads the mermaid library on first use for performance.
 * Supports expand/collapse, SVG download, and copy-to-clipboard.
 */
const MermaidDiagram = memo(function MermaidDiagram({ code, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate a unique ID for this diagram
  const diagramId = useMemo(
    () => `mermaid-${Math.random().toString(36).substring(2, 10)}`,
    []
  );

  // Detect diagram type for title fallback
  const diagramType = useMemo(() => {
    const firstLine = code.trim().split('\n')[0].toLowerCase();
    if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) return 'Flowchart';
    if (firstLine.startsWith('sequencediagram') || firstLine.startsWith('sequence')) return 'Sequence Diagram';
    if (firstLine.startsWith('classdiagram') || firstLine.startsWith('class')) return 'Class Diagram';
    if (firstLine.startsWith('statediagram') || firstLine.startsWith('state')) return 'State Diagram';
    if (firstLine.startsWith('erdiagram') || firstLine.startsWith('er')) return 'ER Diagram';
    if (firstLine.startsWith('gantt')) return 'Gantt Chart';
    if (firstLine.startsWith('pie')) return 'Pie Chart';
    if (firstLine.startsWith('gitgraph') || firstLine.startsWith('git')) return 'Git Graph';
    if (firstLine.startsWith('mindmap')) return 'Mind Map';
    if (firstLine.startsWith('timeline')) return 'Timeline';
    if (firstLine.startsWith('journey')) return 'User Journey';
    if (firstLine.startsWith('quadrantchart') || firstLine.startsWith('quadrant')) return 'Quadrant Chart';
    if (firstLine.startsWith('sankey')) return 'Sankey Diagram';
    if (firstLine.startsWith('xychart') || firstLine.startsWith('xy')) return 'XY Chart';
    return 'Diagram';
  }, [code]);

  // Render the mermaid diagram
  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import mermaid (tree-shaken, only loads when needed)
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#3b82f6',
            primaryTextColor: '#e5e7eb',
            primaryBorderColor: '#60a5fa',
            lineColor: '#9ca3af',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0f172a',
            background: '#1e1e2e',
            mainBkg: '#1e293b',
            nodeBorder: '#60a5fa',
            clusterBkg: '#0f172a',
            titleColor: '#e5e7eb',
            edgeLabelBackground: '#1e293b',
          },
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          fontSize: 13,
          flowchart: { curve: 'monotoneX', padding: 15 },
          sequence: { actorMargin: 50, messageMargin: 40 },
        });

        const { svg } = await mermaid.render(diagramId, code.trim());

        if (!cancelled) {
          setSvgContent(svg);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to render diagram';
          setError(msg);
          setIsLoading(false);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  // Copy SVG to clipboard
  const handleCopy = useCallback(async () => {
    if (!svgContent) return;
    try {
      await navigator.clipboard.writeText(svgContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = svgContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [svgContent]);

  // Download as SVG file
  const handleDownload = useCallback(() => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || diagramType).replace(/\s+/g, '-').toLowerCase()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [svgContent, title, diagramType]);

  // Error state
  if (error) {
    return (
      <div
        className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 my-2"
        data-testid="mermaid-error"
      >
        <div className="flex items-center gap-2 text-red-400 text-sm mb-2">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">Diagram Error</span>
        </div>
        <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            Show source
          </summary>
          <pre className="mt-1 text-xs text-gray-400 whitespace-pre-wrap font-mono bg-gray-900/50 rounded p-2">
            {code}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-border-default bg-[#1e1e2e] my-2 overflow-hidden transition-all duration-200 ${
        isExpanded ? 'fixed inset-4 z-50 shadow-2xl' : ''
      }`}
      data-testid="mermaid-diagram"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default bg-[#181825]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-blue-400">
            📊 {title || diagramType}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            title={copied ? 'Copied!' : 'Copy SVG'}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            title="Download SVG"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Diagram content */}
      <div
        ref={containerRef}
        className={`flex items-center justify-center overflow-auto p-4 ${
          isExpanded ? 'h-[calc(100%-40px)]' : 'max-h-[500px]'
        }`}
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full" />
            <span>Rendering diagram...</span>
          </div>
        ) : (
          <div
            className="mermaid-svg-container [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
});

export default MermaidDiagram;
