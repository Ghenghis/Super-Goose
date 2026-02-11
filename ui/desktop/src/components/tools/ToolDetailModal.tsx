import { useState } from 'react';
import { X, Key, Clock, Terminal, CheckCircle, AlertCircle } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import type { ToolEntry, TierKey } from './ToolsBridgePanel';

// ---------------------------------------------------------------------------
// Extended metadata for known bridges (env vars, install instructions)
// In a real build this could come from an API or the bundled-extensions JSON.
// ---------------------------------------------------------------------------

const TOOL_METADATA: Record<
  string,
  { envKeys?: string[]; installCmd?: string; docs?: string }
> = {
  aider_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install aider-chat',
    docs: 'https://aider.chat/docs',
  },
  autogen_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install pyautogen',
    docs: 'https://microsoft.github.io/autogen/',
  },
  browser_use_bridge: {
    installCmd: 'pip install browser-use',
    docs: 'https://github.com/browser-use/browser-use',
  },
  camel_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install camel-ai',
    docs: 'https://www.camel-ai.org/',
  },
  composio_bridge: {
    envKeys: ['COMPOSIO_API_KEY'],
    installCmd: 'pip install composio-core',
    docs: 'https://docs.composio.dev/',
  },
  crewai_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install crewai',
    docs: 'https://docs.crewai.com/',
  },
  dspy_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install dspy-ai',
    docs: 'https://dspy-docs.vercel.app/',
  },
  evoagentx_bridge: {
    installCmd: 'pip install evoagentx',
    docs: 'https://github.com/EvoAgentX/EvoAgentX',
  },
  goat_bridge: {
    installCmd: 'pip install goat-sdk',
    docs: 'https://github.com/ArcadeAI/arcade-ai',
  },
  instructor_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install instructor',
    docs: 'https://python.useinstructor.com/',
  },
  langchain_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install langchain',
    docs: 'https://python.langchain.com/',
  },
  langgraph_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install langgraph',
    docs: 'https://langchain-ai.github.io/langgraph/',
  },
  llamaindex_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install llama-index',
    docs: 'https://docs.llamaindex.ai/',
  },
  mem0_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install mem0ai',
    docs: 'https://docs.mem0.ai/',
  },
  swarm_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install openai',
    docs: 'https://github.com/openai/swarm',
  },
  taskweaver_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install taskweaver',
    docs: 'https://microsoft.github.io/TaskWeaver/',
  },
  microsandbox_bridge: {
    installCmd: 'pip install microsandbox',
    docs: 'https://github.com/nicholasgasior/microsandbox',
  },
  arrakis_bridge: {
    installCmd: 'pip install arrakis',
  },
  astgrep_bridge: {
    installCmd: 'pip install ast-grep-py',
    docs: 'https://ast-grep.github.io/',
  },
  conscious_bridge: {
    installCmd: 'pip install conscious-ai',
  },
  crosshair_bridge: {
    installCmd: 'pip install crosshair-tool',
    docs: 'https://crosshair.readthedocs.io/',
  },
  pydantic_ai_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install pydantic-ai',
    docs: 'https://ai.pydantic.dev/',
  },
  praisonai_bridge: {
    envKeys: ['OPENAI_API_KEY'],
    installCmd: 'pip install praisonai',
    docs: 'https://docs.praison.ai/',
  },
  pr_agent_bridge: {
    envKeys: ['OPENAI_API_KEY', 'GITHUB_TOKEN'],
    installCmd: 'pip install pr-agent',
    docs: 'https://github.com/Codium-ai/pr-agent',
  },
  overnight_gym_bridge: {
    installCmd: 'pip install overnight-gym',
  },
};

// ---------------------------------------------------------------------------
// Tier display helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<TierKey, { label: string; color: string; bg: string }> = {
  tier1: {
    label: 'Tier 1 - Builtin',
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/30',
  },
  tier2: {
    label: 'Tier 2 - Stage 6 Bridge',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/30',
  },
  tier3: {
    label: 'Tier 3 - Additional Bridge',
    color: 'text-purple-400',
    bg: 'bg-purple-400/10 border-purple-400/30',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  tool: ToolEntry;
  tier: TierKey;
  onClose: () => void;
  onSave: (updated: ToolEntry) => void;
}

export default function ToolDetailModal({ tool, tier, onClose, onSave }: Props) {
  const [enabled, setEnabled] = useState(tool.enabled);
  const [timeout, setTimeout_] = useState(tool.timeout ?? 300);

  const meta = TOOL_METADATA[tool.id] ?? {};
  const tierInfo = TIER_LABELS[tier];

  const handleSave = () => {
    onSave({ ...tool, enabled, timeout });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-border-default bg-background-default shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-3 h-3 rounded-full flex-shrink-0 ${
                enabled ? 'bg-green-400' : 'bg-gray-500'
              }`}
            />
            <div className="min-w-0">
              <h3 className="text-base font-medium text-text-default truncate">
                {tool.display_name}
              </h3>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tierInfo.bg} ${tierInfo.color}`}
              >
                {tierInfo.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-background-muted transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Description */}
          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Description
            </label>
            <p className="mt-1 text-sm text-text-default">{tool.description}</p>
          </div>

          {/* Type */}
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">Type:</span>
            <span className="text-xs font-mono text-text-default">{tool.type}</span>
          </div>

          {/* Enable / Disable */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-background-muted">
            <div className="flex items-center gap-2">
              {enabled ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-sm text-text-default">
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              variant="mono"
              aria-label={`Toggle ${tool.display_name}`}
            />
          </div>

          {/* Timeout */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-text-muted" />
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Timeout (seconds)
              </label>
            </div>
            <input
              type="number"
              min={10}
              max={3600}
              value={timeout}
              onChange={(e) => setTimeout_(Number(e.target.value))}
              className="w-28 px-3 py-1.5 text-sm rounded-lg border border-border-default bg-background-default text-text-default focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Environment keys */}
          {meta.envKeys && meta.envKeys.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-text-muted" />
                <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Required environment variables
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {meta.envKeys.map((k) => (
                  <span
                    key={k}
                    className="text-xs font-mono px-2 py-1 rounded bg-background-muted border border-border-default text-text-default"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Installation */}
          {meta.installCmd && (
            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                Installation
              </label>
              <pre className="text-xs font-mono px-3 py-2 rounded-lg bg-background-muted border border-border-default text-text-default overflow-x-auto">
                {meta.installCmd}
              </pre>
            </div>
          )}

          {/* Documentation link */}
          {meta.docs && (
            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                Documentation
              </label>
              <a
                href={meta.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:underline break-all"
              >
                {meta.docs}
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
