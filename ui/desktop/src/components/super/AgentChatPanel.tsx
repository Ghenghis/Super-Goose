import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgUi } from '../../ag-ui/useAgUi';
import type { AgUiTextMessage } from '../../ag-ui/useAgUi';
import { SGStatusDot, SGBadge, SGEmptyState } from './shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ChannelFilter = 'all' | 'agent' | 'user' | 'system';

const CHANNEL_TABS: { key: ChannelFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'agent', label: 'Agent' },
  { key: 'user', label: 'User' },
  { key: 'system', label: 'System' },
];

const ROLE_COLORS: Record<string, string> = {
  agent: 'var(--sg-emerald, #34d399)',
  user: 'var(--sg-indigo, #818cf8)',
  system: 'var(--sg-gold, #f59e0b)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function roleBadgeVariant(role: string): 'emerald' | 'indigo' | 'amber' {
  switch (role) {
    case 'agent': return 'emerald';
    case 'system': return 'amber';
    default: return 'indigo';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Active tool calls bar. */
function ToolCallsBar({
  toolCalls,
}: {
  toolCalls: Array<{ toolCallId: string; toolCallName: string; status: string }>;
}) {
  if (toolCalls.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2 p-2"
      style={{
        background: 'var(--sg-surface-2, #1a1a2e)',
        borderRadius: '8px',
        border: '1px solid var(--sg-border, #2d2d4e)',
      }}
      role="list"
      aria-label="Active tool calls"
    >
      {toolCalls.map((tc) => (
        <div
          key={tc.toolCallId}
          className="flex items-center gap-1.5 px-2 py-1"
          style={{
            background: 'var(--sg-surface-3, #252544)',
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}
          role="listitem"
          aria-label={`${tc.toolCallName} - ${tc.status}`}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: tc.status === 'active' ? '#f59e0b' : '#22c55e',
              display: 'inline-block',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span style={{ color: 'var(--sg-text-2, #d1d5db)' }}>{tc.toolCallName}</span>
        </div>
      ))}
    </div>
  );
}

/** Single chat message row. */
function ChatMessageRow({ msg }: { msg: AgUiTextMessage }) {
  return (
    <div
      className="sg-card flex flex-col gap-1 py-2 px-3"
      data-testid={`chat-msg-${msg.messageId}`}
      style={{ borderLeft: `3px solid ${ROLE_COLORS[msg.role] || 'var(--sg-text-2)'}` }}
    >
      <div className="flex items-center justify-between" style={{ fontSize: '0.75rem' }}>
        <span className="flex items-center gap-1.5">
          <strong style={{ color: ROLE_COLORS[msg.role] || 'var(--sg-text-2)' }}>{msg.role}</strong>
          <SGBadge variant={roleBadgeVariant(msg.role)}>
            {msg.role}
          </SGBadge>
          {msg.streaming && (
            <span style={{ color: 'var(--sg-gold, #f59e0b)', fontSize: '0.625rem' }}>
              streaming...
            </span>
          )}
        </span>
        <span style={{ color: 'var(--sg-text-4)', fontSize: '0.625rem' }}>
          {formatTimestamp(msg.timestamp)}
        </span>
      </div>
      <div style={{ color: 'var(--sg-text-1, #f1f5f9)', fontSize: '0.8125rem' }}>
        {msg.content}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgentChatPanel() {
  const agUi = useAgUi();
  const { messages, connected, isRunning, activeToolCalls, sendMessage } = agUi;
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [inputMsg, setInputMsg] = useState('');
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  // Convert activeToolCalls Map to array for rendering
  const toolCallsList = Array.from(activeToolCalls.values()).map((tc) => ({
    toolCallId: tc.toolCallId,
    toolCallName: tc.toolCallName,
    status: tc.status,
  }));

  const filteredMessages =
    channelFilter === 'all'
      ? messages
      : messages.filter((m) => m.role === channelFilter);

  const streamingMessages = messages.filter((m) => m.streaming);

  const handleSend = useCallback(async () => {
    const content = inputMsg.trim();
    if (!content) return;

    setSending(true);
    try {
      sendMessage(content);
    } catch {
      /* silent */
    }
    setInputMsg('');
    setSending(false);
  }, [inputMsg, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col h-full space-y-3" role="region" aria-label="Agent Chat Panel">
      {/* Connection status */}
      <div className="flex items-center justify-between">
        <SGStatusDot status={connected ? 'connected' : 'disconnected'} />
        <div className="flex items-center gap-2">
          {isRunning && (
            <span style={{ fontSize: '0.75rem', color: 'var(--sg-emerald, #34d399)' }}>
              Running
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--sg-text-4)' }}>
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Active tool calls bar */}
      <ToolCallsBar toolCalls={toolCallsList} />

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
          filteredMessages.map((msg) => <ChatMessageRow key={msg.messageId} msg={msg} />)
        ) : (
          <SGEmptyState message="No messages yet" />
        )}
      </div>

      {/* Streaming messages indicator */}
      {streamingMessages.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--sg-gold, #f59e0b)',
            padding: '4px 8px',
            background: 'var(--sg-surface-2)',
            borderRadius: '6px',
          }}
          role="status"
          aria-label="Streaming messages"
        >
          {streamingMessages.length} message{streamingMessages.length !== 1 ? 's' : ''} streaming
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
