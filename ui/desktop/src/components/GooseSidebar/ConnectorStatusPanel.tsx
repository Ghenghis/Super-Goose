import React from 'react';
import { ChevronRight, Link } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel, ConnectorStatus } from './AgentPanelContext';

// --- Status indicators ---

const CONNECTOR_ICON: Record<ConnectorStatus['state'], string> = {
  connected: '\u25CF',  // ●
  available: '\u25CB',  // ○
  error: '\u2715',      // ✕
};

const CONNECTOR_COLOR: Record<ConnectorStatus['state'], string> = {
  connected: 'text-green-500',
  available: 'text-gray-400',
  error: 'text-red-500',
};

const CONNECTOR_LABEL: Record<ConnectorStatus['state'], string> = {
  connected: 'Connected',
  available: 'Available',
  error: 'Error',
};

// --- Panel ---

const ConnectorStatusPanel: React.FC = () => {
  const { state } = useAgentPanel();
  const [isExpanded, setIsExpanded] = React.useState(true);

  const connectedCount = state.connectors.filter((c) => c.state === 'connected').length;

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <Link className="w-3.5 h-3.5" />
              <span>Connectors</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {connectedCount}/{state.connectors.length}
              </span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="mt-1 space-y-0.5">
              {state.connectors.map((connector) => (
                <div
                  key={connector.id}
                  className="flex items-center gap-1.5 py-1 px-2 rounded-md text-xs hover:bg-background-medium/50 transition-colors"
                  title={`${connector.name} - ${CONNECTOR_LABEL[connector.state]}${connector.description ? `: ${connector.description}` : ''}`}
                >
                  {/* Status symbol */}
                  <span
                    className={`flex-shrink-0 text-sm leading-none ${CONNECTOR_COLOR[connector.state]}`}
                    aria-label={CONNECTOR_LABEL[connector.state]}
                  >
                    {CONNECTOR_ICON[connector.state]}
                  </span>

                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <span className="text-text-default truncate block">{connector.name}</span>
                  </div>

                  {/* State badge */}
                  <span
                    className={`text-[10px] flex-shrink-0 ${
                      connector.state === 'error'
                        ? 'text-red-400'
                        : connector.state === 'connected'
                          ? 'text-green-400'
                          : 'text-text-muted'
                    }`}
                  >
                    {CONNECTOR_LABEL[connector.state]}
                  </span>
                </div>
              ))}
              {state.connectors.length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2">No connectors</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default ConnectorStatusPanel;
