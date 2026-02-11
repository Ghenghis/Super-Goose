import React from 'react';
import { ChevronRight, Terminal } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel, ToolCallStatus } from './AgentPanelContext';

// --- Status indicators ---

const TOOL_STATUS_ICON: Record<ToolCallStatus, string> = {
  running: '\u25B6',   // ►
  success: '\u2713',   // ✓
  error: '\u2715',     // ✕
};

const TOOL_STATUS_COLOR: Record<ToolCallStatus, string> = {
  running: 'text-blue-400 animate-pulse',
  success: 'text-green-500',
  error: 'text-red-500',
};

// --- Relative time helper ---

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// --- Panel ---

const ToolCallLog: React.FC = () => {
  const { state } = useAgentPanel();
  // Collapsed by default as specified in requirements
  const [isExpanded, setIsExpanded] = React.useState(false);

  const runningCount = state.toolCalls.filter((t) => t.status === 'running').length;

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <Terminal className="w-3.5 h-3.5" />
              <span>Tool Calls</span>
              {runningCount > 0 && (
                <span className="text-[10px] text-blue-400 animate-pulse">
                  {runningCount} running
                </span>
              )}
              <span className="ml-auto text-[10px] text-text-muted">
                {state.toolCalls.length}
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
              {state.toolCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-1.5 py-1 px-2 rounded-md text-xs hover:bg-background-medium/50 transition-colors"
                  title={`${call.toolName}(${call.inputSummary}) - ${call.status}${call.durationMs ? ` (${formatDuration(call.durationMs)})` : ''}`}
                >
                  {/* Status icon */}
                  <span
                    className={`flex-shrink-0 text-sm leading-none w-3 text-center ${TOOL_STATUS_COLOR[call.status]}`}
                    aria-label={call.status}
                  >
                    {TOOL_STATUS_ICON[call.status]}
                  </span>

                  {/* Tool name */}
                  <span className="text-text-default font-mono flex-shrink-0">
                    {call.toolName}
                  </span>

                  {/* Input summary */}
                  <span className="flex-1 min-w-0 text-text-muted truncate">
                    {call.inputSummary}
                  </span>

                  {/* Duration or time */}
                  <span className="text-[10px] text-text-muted flex-shrink-0">
                    {call.durationMs ? formatDuration(call.durationMs) : timeAgo(call.timestamp)}
                  </span>
                </div>
              ))}
              {state.toolCalls.length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2">No tool calls</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default ToolCallLog;
