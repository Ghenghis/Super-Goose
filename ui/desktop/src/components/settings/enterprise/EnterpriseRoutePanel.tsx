import { useState } from 'react';
import {
  Shield,
  Globe,
  Activity,
  FileCheck,
  Webhook,
  Database,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import GuardrailsPanel from './GuardrailsPanel';
import GatewayPanel from './GatewayPanel';
import ObservabilityPanel from './ObservabilityPanel';
import PoliciesPanel from './PoliciesPanel';
import HooksPanel from './HooksPanel';
import MemoryPanel from './MemoryPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PanelDef {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Panel definitions
// ---------------------------------------------------------------------------

const PANELS: PanelDef[] = [
  {
    id: 'guardrails',
    label: 'Guardrails',
    description: 'Input/output scanning and safety rules',
    icon: Shield,
    component: <GuardrailsPanel />,
  },
  {
    id: 'gateway',
    label: 'Gateway',
    description: 'Multi-provider routing and failover',
    icon: Globe,
    component: <GatewayPanel />,
  },
  {
    id: 'observability',
    label: 'Observability',
    description: 'Tracing, metrics, and monitoring',
    icon: Activity,
    component: <ObservabilityPanel />,
  },
  {
    id: 'policies',
    label: 'Policies',
    description: 'Approval workflows and compliance',
    icon: FileCheck,
    component: <PoliciesPanel />,
  },
  {
    id: 'hooks',
    label: 'Hooks',
    description: 'Lifecycle hook configuration',
    icon: Webhook,
    component: <HooksPanel />,
  },
  {
    id: 'memory',
    label: 'Memory',
    description: 'Memory system and retrieval settings',
    icon: Database,
    component: <MemoryPanel />,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Standalone route-level view for the enterprise settings.
 *
 * Renders a 2-column card grid by default. Clicking a card opens the
 * corresponding panel inline; a "Back" button returns to the grid.
 */
export default function EnterpriseRoutePanel() {
  const [activePanel, setActivePanel] = useState<string | null>(null);

  const selected = activePanel ? PANELS.find((p) => p.id === activePanel) : null;

  // ---- Detail view (single panel open) ----
  if (selected) {
    const IconComp = selected.icon;
    return (
      <div className="h-full overflow-y-auto px-6 py-6">
        {/* Back button */}
        <button
          onClick={() => setActivePanel(null)}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-default transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Enterprise Settings</span>
        </button>

        {/* Panel header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-background-medium">
            <IconComp className="w-5 h-5 text-text-default" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-default">{selected.label}</h2>
            <p className="text-xs text-text-muted">{selected.description}</p>
          </div>
        </div>

        {/* Panel content */}
        <div className="border border-border-default rounded-lg p-4 bg-background-default">
          {selected.component}
        </div>
      </div>
    );
  }

  // ---- Grid view (all panels as cards) ----
  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-background-medium">
          <Shield className="w-5 h-5 text-text-default" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-text-default">Enterprise Settings</h1>
          <p className="text-xs text-text-muted">
            Security, governance, and infrastructure configuration
          </p>
        </div>
      </div>

      {/* 2-column card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PANELS.map((panel) => {
          const IconComp = panel.icon;
          return (
            <Card
              key={panel.id}
              className="rounded-lg cursor-pointer hover:bg-background-muted/50 transition-colors group"
              onClick={() => setActivePanel(panel.id)}
            >
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-background-medium">
                      <IconComp className="w-4 h-4 text-text-default" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-text-default">{panel.label}</h3>
                      <p className="text-xs text-text-muted mt-0.5">{panel.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-default transition-colors mt-1" />
                </div>
                <button
                  className="self-start px-3 py-1 text-xs font-medium rounded-md border border-border-default text-text-default hover:bg-background-medium transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePanel(panel.id);
                  }}
                >
                  Configure
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
