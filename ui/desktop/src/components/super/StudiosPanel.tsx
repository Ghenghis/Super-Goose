import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../../config';
import { StudioPipeline } from './studio';
import type { StudioTabId } from './studio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtensionInfo {
  key: string;
  name: string;
  type: string;
  enabled: boolean;
  description: string;
}

interface ExtensionsResponse {
  extensions: ExtensionInfo[];
}

interface Studio {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultTab: StudioTabId;
}

// ---------------------------------------------------------------------------
// Default studios (fallback when API unavailable)
// ---------------------------------------------------------------------------

const DEFAULT_STUDIOS: Studio[] = [
  { id: 'core', name: 'Core Studio', description: 'Build and test agent cores', icon: '\uD83E\uDDE0', color: 'var(--sg-violet)', defaultTab: 'plan' },
  { id: 'agent', name: 'Agent Studio', description: 'Design multi-agent workflows', icon: '\uD83E\uDD16', color: 'var(--sg-indigo)', defaultTab: 'plan' },
  { id: 'data', name: 'Data Studio', description: 'Curate, transform, and validate training datasets', icon: '\uD83D\uDCCA', color: 'var(--sg-emerald)', defaultTab: 'plan' },
  { id: 'eval', name: 'Eval Studio', description: 'Run benchmarks, A/B tests, and quality evaluations', icon: '\uD83D\uDCC8', color: 'var(--sg-gold)', defaultTab: 'test' },
  { id: 'deploy', name: 'Deploy Studio', description: 'Package agents and deploy to staging or production', icon: '\uD83D\uDE80', color: 'var(--sg-sky)', defaultTab: 'deploy' },
  { id: 'vision', name: 'Vision Studio', description: 'Build agents with image, video, and audio capabilities', icon: '\uD83D\uDC41\uFE0F', color: 'var(--sg-amber)', defaultTab: 'code' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map extension type to an appropriate icon. */
function extensionIcon(type: string): string {
  switch (type) {
    case 'builtin': return '\uD83D\uDD27';
    case 'stdio': return '\uD83D\uDCBB';
    case 'streamable_http': return '\uD83C\uDF10';
    case 'platform': return '\uD83C\uDFD7\uFE0F';
    case 'frontend': return '\uD83C\uDFA8';
    case 'inline_python': return '\uD83D\uDC0D';
    case 'sse': return '\uD83D\uDCE1';
    default: return '\uD83D\uDD0C';
  }
}

/** Map extension type to a color. */
function extensionColor(type: string): string {
  switch (type) {
    case 'builtin': return 'var(--sg-violet)';
    case 'stdio': return 'var(--sg-indigo)';
    case 'streamable_http': return 'var(--sg-emerald)';
    case 'platform': return 'var(--sg-gold)';
    case 'frontend': return 'var(--sg-sky)';
    default: return 'var(--sg-amber)';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudiosPanel() {
  const [activeStudio, setActiveStudio] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const lastFocusedStudio = useRef<string | null>(null);

  // --- Fetch extensions from API ---
  const fetchExtensions = useCallback(async (signal?: AbortSignal) => {
    try {
      setFetchError(null);
      const res = await fetch(getApiUrl('/api/extensions'), { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: ExtensionsResponse = await res.json();
      if (!signal?.aborted) {
        setExtensions(data.extensions || []);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!signal?.aborted) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch extensions');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchExtensions(controller.signal);
    return () => controller.abort();
  }, [fetchExtensions]);

  // Build studios from extensions (merged with defaults)
  const studios: Studio[] = (() => {
    // Always include default studios
    const result = [...DEFAULT_STUDIOS];

    // Add extension-based studios for enabled extensions not already represented
    const defaultIds = new Set(DEFAULT_STUDIOS.map((s) => s.id));
    for (const ext of extensions) {
      if (ext.enabled && !defaultIds.has(ext.key)) {
        result.push({
          id: ext.key,
          name: ext.name,
          description: ext.description || `${ext.type} extension`,
          icon: extensionIcon(ext.type),
          color: extensionColor(ext.type),
          defaultTab: 'plan',
        });
      }
    }

    return result;
  })();

  const enabledExtensionCount = extensions.filter((e) => e.enabled).length;
  const totalExtensionCount = extensions.length;

  const selectedStudio = studios.find((s) => s.id === activeStudio);

  const handleOpenStudio = (id: string) => {
    lastFocusedStudio.current = id;
    setActiveStudio(id);
  };

  const handleBackToStudios = () => {
    setActiveStudio(null);
    // Restore focus to previously selected studio card after render
    setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-testid="studio-card-${lastFocusedStudio.current}"]`)?.focus();
    }, 0);
  };

  // Pipeline view when a studio is selected
  if (selectedStudio) {
    return (
      <div className="space-y-3">
        <button
          className="sg-tab flex items-center gap-1"
          onClick={handleBackToStudios}
          data-testid="back-to-studios"
          style={{ color: 'var(--sg-text-2)', fontSize: '0.8125rem' }}
        >
          <span aria-hidden="true">&larr;</span> Back to Studios
        </button>

        <div className="flex items-center gap-2 mb-1" style={{ paddingLeft: '0.25rem' }}>
          <span className="text-xl">{selectedStudio.icon}</span>
          <span className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
            {selectedStudio.name}
          </span>
        </div>

        <StudioPipeline defaultTab={selectedStudio.defaultTab} />
      </div>
    );
  }

  // Grid view
  return (
    <div className="space-y-4">
      {/* Extension count header */}
      {!loading && !fetchError && extensions.length > 0 && (
        <div
          className="flex items-center justify-between"
          style={{ fontSize: '0.75rem', color: 'var(--sg-text-4)' }}
          data-testid="extension-count"
        >
          <span>{enabledExtensionCount} of {totalExtensionCount} extensions enabled</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="sg-card" style={{ padding: '1.5rem', textAlign: 'center' }} data-testid="studios-loading">
          <p style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem' }}>Loading extensions...</p>
        </div>
      )}

      {/* Error state — show default studios as fallback */}
      {fetchError && !loading && (
        <div style={{ fontSize: '0.75rem', color: 'var(--sg-text-4)', marginBottom: '0.5rem' }} data-testid="studios-error">
          Extensions API unavailable. Showing default studios.
        </div>
      )}

      {/* Studios grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {studios.map((studio) => (
            <div
              key={studio.id}
              className="sg-card cursor-pointer"
              onClick={() => handleOpenStudio(studio.id)}
              title={`Open ${studio.name}`}
              data-testid={`studio-card-${studio.id}`}
              role="button"
              tabIndex={0}
              aria-disabled={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenStudio(studio.id);
                }
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{studio.icon}</span>
                <div>
                  <div className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{studio.name}</div>
                </div>
              </div>
              <p style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{studio.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
