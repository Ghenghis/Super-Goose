import { memo, useState, useMemo, type FC } from 'react';
import {
  ArrowRight,
  Radio,
  Filter,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentMessageType = 'request' | 'response' | 'broadcast';

export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  timestamp: number;
  type: AgentMessageType;
}

export interface AgentCommunicationProps {
  messages: AgentMessage[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Message type metadata
// ---------------------------------------------------------------------------

const MESSAGE_TYPE_META: Record<
  AgentMessageType,
  {
    label: string;
    badgeClass: string;
    bubbleBorderClass: string;
    icon: FC<{ className?: string }>;
  }
> = {
  request: {
    label: 'Request',
    badgeClass: 'bg-blue-500/15 text-blue-400',
    bubbleBorderClass: 'border-blue-500/20',
    icon: ArrowRight,
  },
  response: {
    label: 'Response',
    badgeClass: 'bg-green-500/15 text-green-400',
    bubbleBorderClass: 'border-green-500/20',
    icon: ArrowRight,
  },
  broadcast: {
    label: 'Broadcast',
    badgeClass: 'bg-yellow-500/15 text-yellow-400',
    bubbleBorderClass: 'border-yellow-500/20',
    icon: Radio,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Extract unique agent names from messages. */
function getUniqueAgents(messages: AgentMessage[]): string[] {
  const set = new Set<string>();
  for (const msg of messages) {
    set.add(msg.from);
    if (msg.to) set.add(msg.to);
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

const MessageBubble = memo<{ message: AgentMessage }>(({ message }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = MESSAGE_TYPE_META[message.type];
  const TypeIcon = meta.icon;

  // Truncate long messages in collapsed state
  const isLong = message.content.length > 120;
  const displayContent =
    !expanded && isLong
      ? message.content.slice(0, 120) + '...'
      : message.content;

  return (
    <div className="flex flex-col gap-1">
      {/* Header line: from -> to + type + timestamp */}
      <div className="flex items-center gap-1.5 text-xs">
        {/* From agent */}
        <span className="font-semibold text-text-default bg-gray-700/50 px-1.5 py-0.5 rounded text-[11px]">
          {message.from}
        </span>

        {/* Arrow / broadcast icon */}
        <TypeIcon className="w-3 h-3 text-gray-500" />

        {/* To agent */}
        <span className="font-semibold text-text-default bg-gray-700/50 px-1.5 py-0.5 rounded text-[11px]">
          {message.type === 'broadcast' ? 'All' : message.to}
        </span>

        {/* Type badge */}
        <span
          className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full select-none ml-1',
            meta.badgeClass
          )}
        >
          {meta.label}
        </span>

        {/* Timestamp */}
        <span className="text-[10px] text-gray-600 font-mono tabular-nums ml-auto select-none">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      {/* Content bubble */}
      <div
        className={cn(
          'rounded-lg border px-3 py-2 text-xs text-text-muted',
          'font-mono whitespace-pre-wrap break-all',
          'bg-gray-900/50',
          meta.bubbleBorderClass,
          isLong && 'cursor-pointer hover:bg-gray-900/70 transition-colors'
        )}
        onClick={isLong ? () => setExpanded((v) => !v) : undefined}
      >
        {displayContent}
        {isLong && (
          <span className="ml-1 text-[10px] text-gray-600 select-none">
            {expanded ? '[collapse]' : '[expand]'}
          </span>
        )}
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';

// ---------------------------------------------------------------------------
// AgentCommunication
// ---------------------------------------------------------------------------

export const AgentCommunication = memo<AgentCommunicationProps>(
  ({ messages, className }) => {
    const [filterAgent, setFilterAgent] = useState<string | null>(null);
    const [showFilter, setShowFilter] = useState(false);

    const uniqueAgents = useMemo(() => getUniqueAgents(messages), [messages]);

    const filteredMessages = useMemo(() => {
      if (!filterAgent) return messages;
      return messages.filter(
        (m) => m.from === filterAgent || m.to === filterAgent
      );
    }, [messages, filterAgent]);

    if (messages.length === 0) {
      return (
        <div
          className={cn(
            'rounded-lg border border-gray-700/50 bg-gray-800/20 p-4',
            className
          )}
        >
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>No inter-agent messages</span>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'rounded-lg border border-gray-700/50 bg-gray-800/20 overflow-hidden',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 bg-gray-800/30">
          <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-semibold text-text-default">
            Agent Communication
          </span>

          <span className="text-xs text-text-muted ml-auto tabular-nums">
            {filteredMessages.length}
            {filterAgent ? ` / ${messages.length}` : ''} messages
          </span>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilter((v) => !v)}
            className={cn(
              'p-1 rounded transition-colors',
              showFilter
                ? 'bg-blue-500/15 text-blue-400'
                : 'hover:bg-white/10 text-text-muted'
            )}
            aria-label="Filter by agent"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filter bar */}
        <div
          className={cn(
            'transition-all duration-200 ease-in-out overflow-hidden border-b border-gray-700/50',
            showFilter ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0 border-b-0'
          )}
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto scrollbar-thin">
            <button
              type="button"
              onClick={() => setFilterAgent(null)}
              className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors',
                filterAgent === null
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-gray-700/40 text-text-muted hover:bg-gray-700/60'
              )}
            >
              All
            </button>
            {uniqueAgents.map((agent) => (
              <button
                key={agent}
                type="button"
                onClick={() =>
                  setFilterAgent((prev) => (prev === agent ? null : agent))
                }
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors',
                  filterAgent === agent
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-700/40 text-text-muted hover:bg-gray-700/60'
                )}
              >
                {agent}
              </button>
            ))}
          </div>
        </div>

        {/* Message list */}
        <div
          className="overflow-y-auto px-3 py-2 space-y-3 scrollbar-thin"
          style={{ maxHeight: '24rem' }}
        >
          {filteredMessages.map((msg, i) => (
            <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
          ))}
        </div>
      </div>
    );
  }
);
AgentCommunication.displayName = 'AgentCommunication';

export default AgentCommunication;
