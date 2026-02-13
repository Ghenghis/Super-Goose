import { useRef, useEffect } from 'react';
import { useAgUi } from '../../ag-ui/useAgUi';
import type { ToolCallState, ReasoningItem, ToolCallApproval } from '../../ag-ui/useAgUi';
import { SGCard, SGBadge, SGStatusDot, SGEmptyState } from './shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a string and append ellipsis if it exceeds `max` characters. */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

/** Safely parse JSON args for display; returns pretty-printed string or raw. */
function prettyArgs(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

/** Map tool-call status to a badge variant. */
function statusVariant(status: ToolCallState['status']): 'sky' | 'emerald' | 'red' {
  switch (status) {
    case 'active':
      return 'sky';
    case 'completed':
      return 'emerald';
    case 'error':
      return 'red';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunStatusBanner({
  isRunning,
  runId,
  threadId,
  currentStep,
  error,
}: {
  isRunning: boolean;
  runId: string | null;
  threadId: string | null;
  currentStep: string | null;
  error: Error | null;
}) {
  return (
    <SGCard className="sg-card--run-banner">
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        role="status"
        aria-label="Agent run status"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: 'var(--sg-text-2)', fontWeight: 600, fontSize: '0.9375rem' }}>
            Run Status
          </span>
          {isRunning ? (
            <SGBadge variant="emerald" className="sg-pulse">
              Running
            </SGBadge>
          ) : (
            <SGBadge variant="sky">
              Idle
            </SGBadge>
          )}
        </div>

        {currentStep && (
          <span style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>
            Step: <strong style={{ color: 'var(--sg-text-2)' }}>{currentStep}</strong>
          </span>
        )}
      </div>

      {(runId || threadId) && (
        <div
          style={{
            marginTop: '0.5rem',
            display: 'flex',
            gap: '1.5rem',
            fontSize: '0.75rem',
            color: 'var(--sg-text-4)',
            fontFamily: 'monospace',
          }}
        >
          {runId && <span>run: {truncate(runId, 24)}</span>}
          {threadId && <span>thread: {truncate(threadId, 24)}</span>}
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--sg-red)',
            fontSize: '0.8125rem',
          }}
        >
          {error.message}
        </div>
      )}
    </SGCard>
  );
}

function ActiveToolCalls({ toolCalls }: { toolCalls: ToolCallState[] }) {
  if (toolCalls.length === 0) {
    return <SGEmptyState icon="&#128295;" message="No active tool calls" />;
  }

  return (
    <SGCard>
      <h3
        style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}
      >
        Active Tool Calls
      </h3>
      <ul
        role="list"
        aria-label="Active tool calls"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      >
        {toolCalls.map((tc) => (
          <li
            key={tc.toolCallId}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              background: 'var(--sg-input)',
              border: '1px solid var(--sg-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sg-text-1)', fontWeight: 500, fontSize: '0.8125rem' }}>
                {tc.toolCallName}
              </span>
              <SGBadge variant={statusVariant(tc.status)}>{tc.status}</SGBadge>
            </div>
            {tc.args && (
              <pre
                style={{
                  marginTop: '0.375rem',
                  color: 'var(--sg-text-3)',
                  fontFamily: 'monospace',
                  fontSize: '0.6875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: '4rem',
                  overflow: 'hidden',
                }}
              >
                {truncate(tc.args, 200)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </SGCard>
  );
}

function ReasoningStream({
  messages,
  isReasoning,
}: {
  messages: ReasoningItem[];
  isReasoning: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !isReasoning) {
    return <SGEmptyState icon="&#129504;" message="Agent is not reasoning" />;
  }

  return (
    <SGCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
          Reasoning Stream
        </h3>
        {isReasoning && (
          <span
            aria-label="Agent is reasoning"
            className="sg-pulse"
            style={{ fontSize: '1rem' }}
          >
            &#129504;
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Reasoning messages"
        style={{
          maxHeight: '16rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
        }}
      >
        {messages.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '0.375rem 0.625rem',
              borderRadius: '0.375rem',
              background: 'var(--sg-input)',
              color: 'var(--sg-text-2)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
            }}
          >
            {item.content}
            {item.streaming && (
              <span
                style={{ color: 'var(--sg-sky)', marginLeft: '0.125rem' }}
                aria-hidden="true"
              >
                &#9646;
              </span>
            )}
          </div>
        ))}
      </div>
    </SGCard>
  );
}

function HITLApprovalQueue({
  approvals,
  onApprove,
  onReject,
}: {
  approvals: ToolCallApproval[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <SGCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
          Approval Queue
        </h3>
        {approvals.length > 0 && (
          <SGBadge variant="amber">{approvals.length}</SGBadge>
        )}
      </div>

      {approvals.length === 0 ? (
        <div style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem', textAlign: 'center', padding: '1rem 0' }}>
          No pending approvals
        </div>
      ) : (
        <ul
          role="list"
          aria-label="Pending approvals"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          {approvals.map((approval) => (
            <li
              key={approval.toolCallId}
              style={{
                padding: '0.625rem 0.75rem',
                borderRadius: '0.375rem',
                background: 'var(--sg-input)',
                border: '1px solid var(--sg-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--sg-text-1)', fontWeight: 500, fontSize: '0.8125rem' }}>
                  {approval.toolCallName}
                </span>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  <button
                    onClick={() => onApprove(approval.toolCallId)}
                    aria-label={`Approve ${approval.toolCallName}`}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      background: 'var(--sg-emerald)',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onReject(approval.toolCallId)}
                    aria-label={`Reject ${approval.toolCallName}`}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '0.25rem',
                      border: '1px solid var(--sg-red)',
                      background: 'transparent',
                      color: 'var(--sg-red)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
              {approval.args && (
                <pre
                  style={{
                    marginTop: '0.375rem',
                    color: 'var(--sg-text-3)',
                    fontFamily: 'monospace',
                    fontSize: '0.6875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '4rem',
                    overflow: 'hidden',
                  }}
                >
                  {truncate(prettyArgs(approval.args), 300)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </SGCard>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgenticFeatures() {
  const {
    connected,
    error,
    runId,
    threadId,
    isRunning,
    currentStep,
    activeToolCalls,
    pendingApprovals,
    reasoningMessages,
    isReasoning,
    approveToolCall,
    rejectToolCall,
    reconnect,
  } = useAgUi();

  const toolCallsList = Array.from(activeToolCalls.values());

  return (
    <div
      className="super-goose-panel"
      role="region"
      aria-label="Agentic Features"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        height: '100%',
        padding: '0.75rem',
        background: 'var(--sg-bg)',
        color: 'var(--sg-text-1)',
        overflow: 'auto',
      }}
    >
      {/* Run Status Banner — full width */}
      <RunStatusBanner
        isRunning={isRunning}
        runId={runId}
        threadId={threadId}
        currentStep={currentStep}
        error={error}
      />

      {/* 2-column grid: tool calls left, reasoning right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          flex: 1,
          minHeight: 0,
        }}
      >
        <ActiveToolCalls toolCalls={toolCallsList} />
        <ReasoningStream messages={reasoningMessages} isReasoning={isReasoning} />
      </div>

      {/* HITL Approval Queue — full width */}
      <HITLApprovalQueue
        approvals={pendingApprovals}
        onApprove={approveToolCall}
        onReject={rejectToolCall}
      />

      {/* Connection Status Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0 0',
          borderTop: '1px solid var(--sg-border)',
        }}
      >
        <SGStatusDot status={connected ? 'connected' : 'disconnected'} />
        {!connected && (
          <button
            onClick={reconnect}
            aria-label="Reconnect to agent stream"
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '0.25rem',
              border: '1px solid var(--sg-border)',
              background: 'var(--sg-input)',
              color: 'var(--sg-text-2)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
