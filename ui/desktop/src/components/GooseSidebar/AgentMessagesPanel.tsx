import React from 'react';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel } from './AgentPanelContext';

// --- Relative time helper ---

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// --- Panel ---

const AgentMessagesPanel: React.FC = () => {
  const { state } = useAgentPanel();
  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Messages</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {state.messages.length}
              </span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="mt-1 space-y-1">
              {state.messages.map((msg) => (
                <div
                  key={msg.id}
                  className="py-1.5 px-2 rounded-md text-xs hover:bg-background-medium/50 transition-colors"
                  title={`${msg.from} -> ${msg.to}: ${msg.content}`}
                >
                  {/* From -> To header */}
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-text-default font-medium truncate">{msg.from}</span>
                    <span className="text-text-muted flex-shrink-0">{'\u2192'}</span>
                    <span className="text-text-default truncate">{msg.to}</span>
                    <span className="ml-auto text-[10px] text-text-muted flex-shrink-0">
                      {timeAgo(msg.timestamp)}
                    </span>
                  </div>
                  {/* Content */}
                  <div className="text-text-muted text-[11px] leading-snug line-clamp-2">
                    {msg.content}
                  </div>
                </div>
              ))}
              {state.messages.length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2">No messages</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default AgentMessagesPanel;
