import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../ui/collapsible';
import { Card } from '../../ui/card';
import GuardrailsPanel from './GuardrailsPanel';
import GatewayPanel from './GatewayPanel';
import ObservabilityPanel from './ObservabilityPanel';
import PoliciesPanel from './PoliciesPanel';
import HooksPanel from './HooksPanel';
import MemoryPanel from './MemoryPanel';

interface SectionConfig {
  id: string;
  title: string;
  description: string;
  statusLabel: string;
  statusColor: string;
  component: React.ReactNode;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'guardrails',
    title: 'Guardrails',
    description: 'Content filtering and safety detectors',
    statusLabel: 'Configure',
    statusColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    component: <GuardrailsPanel />,
  },
  {
    id: 'gateway',
    title: 'Gateway',
    description: 'API gateway, routing, and audit logging',
    statusLabel: 'Configure',
    statusColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    component: <GatewayPanel />,
  },
  {
    id: 'observability',
    title: 'Observability',
    description: 'Cost tracking, metrics, and usage analytics',
    statusLabel: 'Configure',
    statusColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    component: <ObservabilityPanel />,
  },
  {
    id: 'policies',
    title: 'Policies',
    description: 'Rule engine for access control and governance',
    statusLabel: 'Configure',
    statusColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    component: <PoliciesPanel />,
  },
  {
    id: 'hooks',
    title: 'Hooks',
    description: 'Lifecycle event handlers and integrations',
    statusLabel: 'Configure',
    statusColor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    component: <HooksPanel />,
  },
  {
    id: 'memory',
    title: 'Memory',
    description: 'Persistent memory subsystems and knowledge management',
    statusLabel: 'Configure',
    statusColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    component: <MemoryPanel />,
  },
];

export default function EnterpriseSettingsSection() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const handleToggle = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1">
      {SECTIONS.map((section) => {
        const isOpen = openSections[section.id] || false;

        return (
          <Card key={section.id} className="rounded-lg overflow-hidden">
            <Collapsible open={isOpen} onOpenChange={() => handleToggle(section.id)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between px-4 py-3 hover:bg-background-muted transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-text-default">{section.title}</h3>
                      <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${section.statusColor}`}
                    >
                      {section.statusLabel}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-text-muted transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border-default px-4 pb-4">
                  {section.component}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
