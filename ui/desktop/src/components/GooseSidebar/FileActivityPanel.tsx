import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel, FileOp } from './AgentPanelContext';

// --- File operation indicators ---

const FILE_OP_ICON: Record<FileOp, string> = {
  modified: '\u270E',  // ✎
  created: '+',
  read: '\uD83D\uDC41', // eye
  deleted: '\u2715',    // ✕
};

const FILE_OP_COLOR: Record<FileOp, string> = {
  modified: 'text-yellow-400',
  created: 'text-green-400',
  read: 'text-blue-400',
  deleted: 'text-red-400',
};

const FILE_OP_LABEL: Record<FileOp, string> = {
  modified: 'Modified',
  created: 'Created',
  read: 'Read',
  deleted: 'Deleted',
};

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

// --- Extract filename from path ---

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

// --- Panel ---

const FileActivityPanel: React.FC = () => {
  const { state } = useAgentPanel();
  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <FileText className="w-3.5 h-3.5" />
              <span>Files</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {state.fileActivity.length}
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
              {state.fileActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-1.5 py-1 px-2 rounded-md text-xs hover:bg-background-medium/50 transition-colors"
                  title={`${FILE_OP_LABEL[activity.operation]}: ${activity.path}`}
                >
                  {/* Operation icon */}
                  <span
                    className={`flex-shrink-0 text-sm leading-none w-4 text-center ${FILE_OP_COLOR[activity.operation]}`}
                    aria-label={FILE_OP_LABEL[activity.operation]}
                  >
                    {FILE_OP_ICON[activity.operation]}
                  </span>

                  {/* File path */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`block truncate ${
                        activity.operation === 'deleted'
                          ? 'text-text-muted line-through'
                          : 'text-text-default'
                      }`}
                    >
                      {fileName(activity.path)}
                    </span>
                    <span className="text-[10px] text-text-muted truncate block">
                      {parentDir(activity.path)}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-text-muted flex-shrink-0">
                    {timeAgo(activity.timestamp)}
                  </span>
                </div>
              ))}
              {state.fileActivity.length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2">No file activity</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default FileActivityPanel;
