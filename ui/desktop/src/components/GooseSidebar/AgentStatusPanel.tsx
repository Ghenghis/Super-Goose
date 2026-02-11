import React from 'react';
import { Bot, ChevronRight, Cpu } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel, AgentStatus, AgentState } from './AgentPanelContext';

// --- Status dot colors ---

const STATUS_COLORS: Record<AgentState, string> = {
  idle: 'bg-gray-400',
  gathering: 'bg-blue-400 animate-pulse',
  acting: 'bg-green-400 animate-pulse',
  verifying: 'bg-yellow-400 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
};

const STATUS_LABELS: Record<AgentState, string> = {
  idle: 'Idle',
  gathering: 'Gathering',
  acting: 'Acting',
  verifying: 'Verifying',
  complete: 'Complete',
  error: 'Error',
};

// --- Context usage gauge ---

const ContextGauge: React.FC<{ usage: number }> = ({ usage }) => {
  const color =
    usage > 80 ? 'bg-red-500' : usage > 60 ? 'bg-yellow-500' : 'bg-blue-500';

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-background-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, usage))}%` }}
        />
      </div>
      <span className="text-[10px] text-text-muted tabular-nums w-7 text-right">{usage}%</span>
    </div>
  );
};

// --- Single agent row ---

const AgentRow: React.FC<{ agent: AgentStatus; depth?: number }> = ({ agent, depth = 0 }) => {
  const hasChildren = agent.children && agent.children.length > 0;
  const [expanded, setExpanded] = React.useState(true);

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`w-full flex items-center gap-1.5 py-1 px-1 rounded-md text-xs hover:bg-background-medium/50 transition-colors ${
          depth > 0 ? 'ml-3' : ''
        }`}
        style={{ paddingLeft: depth > 0 ? `${depth * 12 + 4}px` : undefined }}
        title={`${agent.name} - ${STATUS_LABELS[agent.status]}${agent.currentAction ? `: ${agent.currentAction}` : ''}`}
      >
        {/* Expand chevron or spacer */}
        {hasChildren ? (
          <ChevronRight
            className={`w-3 h-3 text-text-muted transition-transform duration-200 flex-shrink-0 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[agent.status]}`}
          aria-label={STATUS_LABELS[agent.status]}
        />

        {/* Agent icon */}
        {agent.type === 'main' ? (
          <Bot className="w-3 h-3 text-text-muted flex-shrink-0" />
        ) : (
          <Cpu className="w-3 h-3 text-text-muted flex-shrink-0" />
        )}

        {/* Name + action */}
        <div className="flex-1 min-w-0 text-left">
          <span className="text-text-default truncate block">{agent.name}</span>
        </div>
      </button>

      {/* Current action indicator */}
      {agent.currentAction && (
        <div
          className="text-[10px] text-text-muted truncate"
          style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
        >
          {agent.currentAction}
        </div>
      )}

      {/* Context + model row */}
      <div
        className="flex items-center gap-2 py-0.5"
        style={{ paddingLeft: `${(depth + 1) * 12 + 20}px`, paddingRight: '4px' }}
      >
        <ContextGauge usage={agent.contextUsage} />
        <span className="text-[10px] text-text-muted truncate max-w-[60px]" title={agent.model}>
          {agent.model.split('-').slice(0, 2).join('-')}
        </span>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {agent.children!.map((child) => (
            <AgentRow key={child.id} agent={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Panel ---

const AgentStatusPanel: React.FC = () => {
  const { state } = useAgentPanel();
  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <Bot className="w-3.5 h-3.5" />
              <span>Agents</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {state.agents.length}
              </span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="mt-1 space-y-0.5 px-1">
              {state.agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default AgentStatusPanel;
