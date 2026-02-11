import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Brain,
  Shield,
  Code2,
  RefreshCw,
  Search,
  FolderSearch,
  Gauge,
  Bookmark,
  ChevronRight,
  Layers,
} from 'lucide-react';

type FeatureStatus = 'working' | 'partial' | 'disabled';

interface FeatureInfo {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  statusNote?: string;
  sourceRef: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  link?: string;
}

const FEATURES: FeatureInfo[] = [
  {
    id: 'cost-tracker',
    name: 'CostTracker / Budget',
    description: 'Track spending per session with configurable budget limits and cost breakdown by model.',
    status: 'working',
    sourceRef: 'agent.rs:2103',
    icon: DollarSign,
    iconColor: 'text-green-500',
    link: '/budget',
  },
  {
    id: 'reflexion',
    name: 'Reflexion',
    description: 'Learn from failures. Records mistakes and injects lessons into future agent context.',
    status: 'working',
    sourceRef: 'agent.rs:1935',
    icon: Brain,
    iconColor: 'text-purple-500',
    link: '/reflexion',
  },
  {
    id: 'guardrails',
    name: 'Guardrails',
    description: 'Input/output scanning for safety, secrets, PII, and prompt injection detection.',
    status: 'working',
    statusNote: 'warn-only',
    sourceRef: 'agent.rs:1777',
    icon: Shield,
    iconColor: 'text-emerald-500',
    link: '/guardrails',
  },
  {
    id: 'code-test-fix',
    name: 'Code-Test-Fix',
    description: 'Structured execution mode that breaks tasks into code, test, and fix phases.',
    status: 'partial',
    statusNote: 'ExecutionMode exists',
    sourceRef: 'ExecutionMode::Structured',
    icon: Code2,
    iconColor: 'text-orange-500',
    link: '/plans',
  },
  {
    id: 'model-hot-switch',
    name: '/model Hot-Switch',
    description: 'Switch between AI models mid-session without restarting the conversation.',
    status: 'working',
    sourceRef: 'session/input.rs:238',
    icon: RefreshCw,
    iconColor: 'text-blue-500',
  },
  {
    id: 'compaction-manager',
    name: 'Compaction Manager',
    description: 'Compress long conversation contexts to stay within token limits.',
    status: 'partial',
    statusNote: 'Instantiated only',
    sourceRef: 'old context_mgmt does actual work',
    icon: Layers,
    iconColor: 'text-slate-500',
  },
  {
    id: 'cross-session-search',
    name: 'Cross-Session Search',
    description: 'Search across all previous sessions for messages, code, and context.',
    status: 'working',
    sourceRef: 'goose session search',
    icon: Search,
    iconColor: 'text-cyan-500',
    link: '/search',
  },
  {
    id: 'project-auto-detection',
    name: 'Project Auto-Detection',
    description: 'Automatically detect project type and inject relevant context into system prompt.',
    status: 'working',
    sourceRef: 'reply_parts.rs:190',
    icon: FolderSearch,
    iconColor: 'text-teal-500',
  },
  {
    id: 'rate-limiting',
    name: 'Rate Limiting',
    description: '50 calls/min cap with 500ms backpressure to protect API quotas.',
    status: 'working',
    sourceRef: 'agent.rs:2282, 50 calls/min',
    icon: Gauge,
    iconColor: 'text-rose-500',
  },
  {
    id: 'bookmarks',
    name: 'Bookmarks',
    description: 'Save and manage bookmarks at important points in conversations via /bookmark.',
    status: 'working',
    sourceRef: '/bookmark via CheckpointManager + SQLite',
    icon: Bookmark,
    iconColor: 'text-amber-500',
    link: '/bookmarks',
  },
];

const statusBadge: Record<FeatureStatus, { label: string; className: string; indicator: string }> = {
  working: {
    label: 'Working',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    indicator: '\u2713',
  },
  partial: {
    label: 'Partial',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    indicator: '\u25D0',
  },
  disabled: {
    label: 'Disabled',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    indicator: '\u2715',
  },
};

export default function FeatureStatusDashboard() {
  const navigate = useNavigate();

  const workingCount = FEATURES.filter((f) => f.status === 'working').length;
  const partialCount = FEATURES.filter((f) => f.status === 'partial').length;

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1">
      {/* Summary bar */}
      <div className="flex items-center justify-between p-3 border border-border-default rounded-lg bg-background-default">
        <div>
          <h3 className="text-sm font-medium text-text-default">Backend Feature Status</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {workingCount} working, {partialCount} partial, {FEATURES.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            {workingCount}/{FEATURES.length}
          </span>
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FEATURES.map((feature) => {
          const sb = statusBadge[feature.status];
          const IconComponent = feature.icon;
          const hasLink = !!feature.link;

          return (
            <button
              key={feature.id}
              onClick={() => {
                if (feature.link) {
                  navigate(feature.link);
                }
              }}
              disabled={!hasLink}
              className={`text-left border border-border-default rounded-lg p-3 transition-colors ${
                hasLink
                  ? 'hover:bg-background-muted/50 cursor-pointer'
                  : 'cursor-default'
              } bg-background-default`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${feature.iconColor}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-text-default">{feature.name}</h4>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                      {feature.description}
                    </p>
                    <p className="text-[10px] font-mono text-text-muted/60 mt-1">
                      {feature.sourceRef}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${sb.className}`}
                  >
                    <span>{sb.indicator}</span>
                    {sb.label}
                    {feature.statusNote && (
                      <span className="opacity-70">({feature.statusNote})</span>
                    )}
                  </span>
                  {hasLink && (
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
