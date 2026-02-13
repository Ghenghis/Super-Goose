import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import {
  Search,
  Package,
  Cpu,
  Blocks,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { Switch } from '../ui/switch';
import ToolDetailModal from './ToolDetailModal';
import bundledExtensions from '../settings/extensions/bundled-extensions.json';
import { backendApi } from '../../utils/backendApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolEntry {
  id: string;
  name: string;
  display_name: string;
  description: string;
  enabled: boolean;
  type: 'builtin' | 'stdio' | 'streamable_http';
  env_keys: string[];
  timeout?: number;
  bundled?: boolean;
}

export type TierKey = 'tier1' | 'tier2' | 'tier3';

interface TierMeta {
  key: TierKey;
  label: string;
  subtitle: string;
  icon: ReactNode;
  badgeColor: string;
  badgeBg: string;
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

const TIER1_IDS = new Set([
  'developer',
  'computercontroller',
  'autovisualiser',
  'memory',
  'tutorial',
]);

const TIER2_IDS = new Set([
  'aider_bridge',
  'autogen_bridge',
  'browser_use_bridge',
  'camel_bridge',
  'composio_bridge',
  'crewai_bridge',
  'dspy_bridge',
  'evoagentx_bridge',
  'goat_bridge',
  'instructor_bridge',
  'langchain_bridge',
  'langgraph_bridge',
  'llamaindex_bridge',
  'mem0_bridge',
  'swarm_bridge',
  'taskweaver_bridge',
]);

// Everything not in tier1 or tier2 is tier3

function classifyTier(id: string): TierKey {
  if (TIER1_IDS.has(id)) return 'tier1';
  if (TIER2_IDS.has(id)) return 'tier2';
  return 'tier3';
}

const TIER_META: TierMeta[] = [
  {
    key: 'tier1',
    label: 'Builtin (Rust)',
    subtitle: 'Always available, compiled into the agent binary',
    icon: <Cpu className="w-4 h-4" />,
    badgeColor: 'text-green-400',
    badgeBg: 'bg-green-400/10 border-green-400/30',
  },
  {
    key: 'tier2',
    label: 'Stage 6 Python Bridges',
    subtitle: 'Core AI framework integrations via MCP stdio',
    icon: <Blocks className="w-4 h-4" />,
    badgeColor: 'text-blue-400',
    badgeBg: 'bg-blue-400/10 border-blue-400/30',
  },
  {
    key: 'tier3',
    label: 'Additional Bridges',
    subtitle: 'Extended tooling, analysis, and orchestration bridges',
    icon: <Package className="w-4 h-4" />,
    badgeColor: 'text-purple-400',
    badgeBg: 'bg-purple-400/10 border-purple-400/30',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ToolsBridgePanel() {
  const [tools, setTools] = useState<ToolEntry[]>(() =>
    (bundledExtensions as ToolEntry[]).map((ext) => ({ ...ext }))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTiers, setExpandedTiers] = useState<Record<TierKey, boolean>>({
    tier1: true,
    tier2: true,
    tier3: true,
  });
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackendAvailable, setIsBackendAvailable] = useState(false);

  // Fetch extensions from backend on mount
  useEffect(() => {
    const fetchExtensions = async () => {
      setIsLoading(true);
      try {
        const extensions = await backendApi.getExtensions();
        if (extensions && extensions.length > 0) {
          setIsBackendAvailable(true);
          // Convert backend ExtensionInfo to ToolEntry
          const toolEntries: ToolEntry[] = extensions.map((ext) => ({
            id: ext.key,
            name: ext.name,
            display_name: ext.name,
            description: ext.description,
            enabled: ext.enabled,
            type: ext.type as 'builtin' | 'stdio' | 'streamable_http',
            env_keys: [],
            bundled: ext.type === 'builtin',
          }));
          setTools(toolEntries);
        } else {
          // Backend unavailable, use bundled fallback
          setIsBackendAvailable(false);
        }
      } catch (err) {
        console.warn('[ToolsBridgePanel] Failed to fetch extensions:', err);
        setIsBackendAvailable(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExtensions();
  }, []);

  // Group tools by tier
  const grouped = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = tools.filter(
      (t) =>
        t.display_name.toLowerCase().includes(lowerQuery) ||
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery)
    );
    const groups: Record<TierKey, ToolEntry[]> = { tier1: [], tier2: [], tier3: [] };
    for (const tool of filtered) {
      groups[classifyTier(tool.id)].push(tool);
    }
    return groups;
  }, [tools, searchQuery]);

  const toggleTier = useCallback((key: TierKey) => {
    setExpandedTiers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggle = useCallback(
    async (id: string) => {
      // Optimistically update local state
      const tool = tools.find((t) => t.id === id);
      if (!tool) return;

      const newEnabledState = !tool.enabled;
      setTools((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: newEnabledState } : t)));

      // Persist to backend if available
      if (isBackendAvailable) {
        const success = await backendApi.toggleExtension(id, newEnabledState);
        if (!success) {
          console.warn('[ToolsBridgePanel] Failed to persist toggle to backend');
          // Rollback on failure
          setTools((prev) =>
            prev.map((t) => (t.id === id ? { ...t, enabled: !newEnabledState } : t))
          );
        }
      }
    },
    [tools, isBackendAvailable]
  );

  const handleSaveTool = useCallback((updated: ToolEntry) => {
    setTools((prev) => prev.map((t) => (t.id === updated.id ? { ...updated } : t)));
    setSelectedTool(null);
  }, []);

  const totalEnabled = tools.filter((t) => t.enabled).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-text-default">Tools &amp; Bridges</h2>
          <p className="text-xs text-text-muted mt-0.5">
            {tools.length} registered &middot; {totalEnabled} enabled
            {isLoading && ' · Loading...'}
            {!isLoading && !isBackendAvailable && ' · Using fallback data'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-default bg-background-default text-text-default placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Tier sections */}
      {TIER_META.map((tier) => {
        const tierTools = grouped[tier.key];
        if (tierTools.length === 0 && searchQuery) return null;
        const isExpanded = expandedTiers[tier.key];

        return (
          <div
            key={tier.key}
            className="rounded-lg border border-border-default overflow-hidden"
          >
            {/* Tier header */}
            <button
              onClick={() => toggleTier(tier.key)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-background-muted hover:bg-background-medium/50 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
              <span className={tier.badgeColor}>{tier.icon}</span>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-default">
                    {tier.label}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tier.badgeBg} ${tier.badgeColor}`}
                  >
                    {tierTools.length}
                  </span>
                </div>
                <p className="text-xs text-text-muted">{tier.subtitle}</p>
              </div>
            </button>

            {/* Tool rows */}
            {isExpanded && (
              <div className="divide-y divide-border-default">
                {tierTools.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-text-muted italic">
                    No tools in this tier
                  </div>
                ) : (
                  tierTools.map((tool) => (
                    <ToolRow
                      key={tool.id}
                      tool={tool}
                      tier={tier}
                      onToggle={handleToggle}
                      onInfo={setSelectedTool}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Detail modal */}
      {selectedTool && (
        <ToolDetailModal
          tool={selectedTool}
          tier={classifyTier(selectedTool.id)}
          onClose={() => setSelectedTool(null)}
          onSave={handleSaveTool}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row sub-component
// ---------------------------------------------------------------------------

function ToolRow({
  tool,
  tier: _tier,
  onToggle,
  onInfo,
}: {
  tool: ToolEntry;
  tier: TierMeta;
  onToggle: (id: string) => void;
  onInfo: (tool: ToolEntry) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-background-medium/30 transition-colors group">
      {/* Status dot */}
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          tool.enabled ? 'bg-green-400' : 'bg-gray-500'
        }`}
      />

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-default truncate">
            {tool.display_name}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
              tool.type === 'builtin'
                ? 'bg-green-400/10 border-green-400/30 text-green-400'
                : 'bg-sky-400/10 border-sky-400/30 text-sky-400'
            }`}
          >
            {tool.type}
          </span>
        </div>
        <p className="text-xs text-text-muted truncate">{tool.description}</p>
      </div>

      {/* Info button */}
      <button
        onClick={() => onInfo(tool)}
        className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background-muted transition-all"
        title="View details"
      >
        <Info className="w-4 h-4 text-text-muted" />
      </button>

      {/* Toggle */}
      <Switch
        checked={tool.enabled}
        onCheckedChange={() => onToggle(tool.id)}
        variant="mono"
        aria-label={`Toggle ${tool.display_name}`}
      />
    </div>
  );
}
