import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgentChat, AgentChatMessage, AgentInfo } from '../../hooks/useAgentChat';
import { SGStatusDot, SGBadge, SGEmptyState } from './shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ChannelFilter = 'all' | 'team' | 'direct' | 'system';

const CHANNEL_TABS: { key: ChannelFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'team', label: 'Team' },
  { key: 'direct', label: 'Direct' },
  { key: 'system', label: 'System' },
];

const STATUS_COLORS: Record<AgentInfo['status'], string> = {
  online: '#22c55e',
  offline: '#6b7280',
  busy: '#f59e0b',
  error: '#ef4444',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function priorityColor(p: AgentChatMessage['priority']): string {
  switch (p) {
    case 'critical': return 'var(--sg-red, #ef4444)';
    case 'high': return 'var(--sg-gold, #f59e0b)';
    case 'low': return 'var(--sg-text-4, #6b7280)';
    default: return 'var(--sg-text-2, #d1d5db)';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Agent registry bar at top of chat panel. */
function AgentBar({
  agents,
  onWake,
}: {
  agents: AgentInfo[];
  onWake: (agentId: string) => void;
}) {
  if (agents.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2 p-2"
      style={{
        background: 'var(--sg-surface-2, #1a1a2e)',
        borderRadius: '8px',
        border: '1px solid var(--sg-border, #2d2d4e)',
      }}
      role="list"
      aria-label="Agent registry"
    >
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="flex items-center gap-1.5 px-2 py-1"
          style={{
            background: 'var(--sg-surface-3, #252544)',
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}
          role="listitem"
          aria-label={`${agent.displayName} - ${agent.status}`}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: STATUS_COLORS[agent.status],
              display: 'inline-block',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span style={{ color: 'var(--sg-text-2, #d1d5db)' }}>{agent.displayName}</span>
          {agent.status === 'offline' && (
            <button
              className="sg-btn-ghost"
              style={{
                fontSize: '0.625rem',
                padding: '1px 4px',
                color: 'var(--sg-emerald, #34d399)',
              }}
              aria-label={`Wake ${agent.displayName}`}
              onClick={() => onWake(agent.id)}
            >
              Wake
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Single chat message row. */
function ChatMessageRow({ msg }: { msg: AgentChatMessage }) {
  const content = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
  return (
    <div
      className="sg-card flex flex-col gap-1 py-2 px-3"
      data-testid={`chat-msg-${msg.id}`}
      style={{ borderLeft: `3px solid ${priorityColor(msg.priority)}` }}
    >
      <div className="flex items-center justify-between" style={{ fontSize: '0.75rem' }}>
        <span className="flex items-center gap-1.5">
          <strong style={{ color: 'var(--sg-emerald, #34d399)' }}>{msg.from}</strong>
          <span style={{ color: 'var(--sg-text-4)' }} aria-hidden="true">&rarr;</span>
          <strong style={{ color: 'var(--sg-indigo, #818cf8)' }}>{msg.to}</strong>
          <SGBadge variant={msg.channel === 'system' ? 'amber' : msg.channel === 'direct' ? 'indigo' : 'emerald'}>
            {msg.channel}
          </SGBadge>
        </span>
        <span style={{ color: 'var(--sg-text-4)', fontSize: '0.625rem' }}>
          {formatTimestamp(msg.timestamp)}
        </span>
      </div>
      <div style={{ color: 'var(--sg-text-1, #f1f5f9)', fontSize: '0.8125rem' }}>
        {content}
      </div>
      <div className="flex items-center gap-2" style={{ fontSize: '0.625rem', color: 'var(--sg-text-4)' }}>
        {msg.delivered && <span>Delivered</span>}
        {msg.acknowledged && <span>ACK</span>}
        {!msg.delivered && <span style={{ color: 'var(--sg-gold, #f59e0b)' }}>Queued</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgentChatPanel() {
  const { messages, agents, connected, sendMessage, wakeAgent, clearMessages } = useAgentChat();
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [inputTo, setInputTo] = useState('');
  const [inputMsg, setInputMsg] = useState('');
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredMessages =
    channelFilter === 'all'
      ? messages
      : messages.filter((m) => m.channel === channelFilter);

  const queuedMessages = messages.filter((m) => !m.delivered);

  const handleSend = useCallback(async () => {
    const to = inputTo.trim() || 'all';
    const content = inputMsg.trim();
    if (!content) return;

    setSending(true);
    await sendMessage(to, content, channelFilter === 'all' ? 'team' : channelFilter);
    setInputMsg('');
    setSending(false);
  }, [inputTo, inputMsg, channelFilter, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleWake = useCallback(
    (agentId: string) => {
      wakeAgent(agentId, 'Manual wake from chat panel');
    },
    [wakeAgent],
  );

  return (
    <div className="flex flex-col h-full space-y-3" role="region" aria-label="Agent Chat Panel">
      {/* Connection status */}
      <div className="flex items-center justify-between">
        <SGStatusDot status={connected ? 'connected' : 'disconnected'} />
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '0.75rem', color: 'var(--sg-text-4)' }}>
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </span>
          {messages.length > 0 && (
            <button
              className="sg-btn-ghost"
              style={{ fontSize: '0.625rem', color: 'var(--sg-text-4)' }}
              onClick={clearMessages}
              aria-label="Clear messages"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Agent registry bar */}
      <AgentBar agents={agents} onWake={handleWake} />

      {/* Channel filter tabs */}
      <div className="sg-tabs" role="tablist" aria-label="Channel filter">
        {CHANNEL_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`sg-tab ${channelFilter === tab.key ? 'active' : ''}`}
            role="tab"
            aria-selected={channelFilter === tab.key}
            aria-controls={`chat-tabpanel-${tab.key}`}
            id={`chat-tab-${tab.key}`}
            onClick={() => setChannelFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Message feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto space-y-2"
        style={{
          minHeight: '120px',
          maxHeight: '400px',
          scrollBehavior: 'smooth',
        }}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        id={`chat-tabpanel-${channelFilter}`}
      >
        {filteredMessages.length > 0 ? (
          filteredMessages.map((msg) => <ChatMessageRow key={msg.id} msg={msg} />)
        ) : (
          <SGEmptyState message="No messages yet" />
        )}
      </div>

      {/* Queued messages indicator */}
      {queuedMessages.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--sg-gold, #f59e0b)',
            padding: '4px 8px',
            background: 'var(--sg-surface-2)',
            borderRadius: '6px',
          }}
          role="status"
          aria-label="Queued messages"
        >
          {queuedMessages.length} message{queuedMessages.length !== 1 ? 's' : ''} queued for offline agents
        </div>
      )}

      {/* Message input */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '8px',
          background: 'var(--sg-surface-2, #1a1a2e)',
          borderRadius: '8px',
          border: '1px solid var(--sg-border, #2d2d4e)',
        }}
      >
        <input
          type="text"
          placeholder="@Agent"
          value={inputTo}
          onChange={(e) => setInputTo(e.target.value)}
          aria-label="Recipient"
          style={{
            width: '80px',
            background: 'var(--sg-surface-3, #252544)',
            color: 'var(--sg-text-1)',
            border: '1px solid var(--sg-border)',
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '0.8125rem',
          }}
        />
        <input
          type="text"
          placeholder="Message..."
          value={inputMsg}
          onChange={(e) => setInputMsg(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Message content"
          style={{
            flex: 1,
            background: 'var(--sg-surface-3, #252544)',
            color: 'var(--sg-text-1)',
            border: '1px solid var(--sg-border)',
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '0.8125rem',
          }}
        />
        <button
          className="sg-btn sg-btn-primary"
          style={{ fontSize: '0.8125rem', padding: '4px 12px' }}
          disabled={sending || !inputMsg.trim()}
          onClick={handleSend}
          aria-label="Send message"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
