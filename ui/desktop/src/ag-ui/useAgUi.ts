import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiUrl } from '../config';

// ---------------------------------------------------------------------------
// Buffer limits
// ---------------------------------------------------------------------------
const MAX_MESSAGES = 100;
const MAX_ACTIVITIES = 50;
const MAX_REASONING = 20;
const MAX_CUSTOM_EVENTS = 50;

// ---------------------------------------------------------------------------
// Reconnect parameters (exponential backoff)
// ---------------------------------------------------------------------------
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// ---------------------------------------------------------------------------
// AG-UI event type discriminators (sent by backend in the `type` field)
// ---------------------------------------------------------------------------
export type AgUiEventType =
  // Lifecycle
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  // Messages
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TEXT_MESSAGE_CHUNK'
  // State
  | 'STATE_SNAPSHOT'
  | 'STATE_DELTA'
  // Tool calls
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'TOOL_CALL_RESULT'
  | 'TOOL_CALL_CHUNK'
  // Custom
  | 'CUSTOM'
  // Reasoning / CoT
  | 'REASONING_START'
  | 'REASONING_CONTENT'
  | 'REASONING_END'
  | 'REASONING_MESSAGE_CHUNK'
  // Activity feed
  | 'ACTIVITY'
  | 'ACTIVITY_SNAPSHOT'
  | 'ACTIVITY_DELTA'
  // Snapshots
  | 'MESSAGES_SNAPSHOT'
  // Raw
  | 'RAW';

// ---------------------------------------------------------------------------
// Shared payload types
// ---------------------------------------------------------------------------

export interface AgUiEvent {
  type: AgUiEventType;
  [key: string]: unknown;
}

/** A completed or in-progress text message from the agent. */
export interface AgUiTextMessage {
  messageId: string;
  role: 'agent' | 'user' | 'system';
  content: string;
  /** True while content chunks are still arriving. */
  streaming: boolean;
  timestamp: number;
}

/** Tracks a single tool call from start through completion. */
export interface ToolCallState {
  toolCallId: string;
  toolCallName: string;
  args: string;
  /** Populated once TOOL_CALL_END arrives. */
  result?: string;
  status: 'active' | 'completed' | 'error';
  timestamp: number;
}

/** A tool call that requires user approval before execution. */
export interface ToolCallApproval {
  toolCallId: string;
  toolCallName: string;
  args: string;
  timestamp: number;
}

/** An item in the activity feed. */
export interface ActivityItem {
  id: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** A reasoning / chain-of-thought chunk. */
export interface ReasoningItem {
  id: string;
  content: string;
  streaming: boolean;
  timestamp: number;
}

/** A custom event forwarded from the backend. */
export interface CustomEventItem {
  name: string;
  value: unknown;
  timestamp: number;
}

/** A frontend-defined tool the agent can call. */
export interface FrontendToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  /** Called when agent invokes this tool. Return result string. */
  handler: (args: string) => Promise<string> | string;
}

/** Options for the useAgUi hook. */
export interface UseAgUiOptions {
  /** Override the API base URL. */
  apiBase?: string;
  /** Frontend-defined tools available to the agent. */
  frontendTools?: FrontendToolDefinition[];
  /** If true, abort the current run when disconnecting. */
  abortOnDisconnect?: boolean;
}

/** Subscriber hook called for each event. Return false to stop propagation. */
export type AgUiSubscriber = (event: AgUiEvent) => boolean | void;

// ---------------------------------------------------------------------------
// JSON Patch types (RFC 6902 subset: add, remove, replace)
// ---------------------------------------------------------------------------

interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

// ---------------------------------------------------------------------------
// Aggregate state exposed by the hook
// ---------------------------------------------------------------------------

export interface AgUiState {
  // Connection
  connected: boolean;
  error: Error | null;

  // Lifecycle
  runId: string | null;
  threadId: string | null;
  isRunning: boolean;
  currentStep: string | null;

  // Messages (last N)
  messages: AgUiTextMessage[];

  // Agent state (from STATE_SNAPSHOT / STATE_DELTA)
  agentState: Record<string, unknown>;

  // Tool calls (active + completed)
  activeToolCalls: Map<string, ToolCallState>;
  pendingApprovals: ToolCallApproval[];

  // Activity
  activities: ActivityItem[];

  // Reasoning (CoT stream)
  reasoningMessages: ReasoningItem[];
  isReasoning: boolean;

  // Custom events buffer
  customEvents: CustomEventItem[];

  /** Total number of runs completed. */
  runCount: number;
}

// ---------------------------------------------------------------------------
// Return type of the hook — state + actions
// ---------------------------------------------------------------------------

export interface UseAgUiReturn extends AgUiState {
  /** Approve a pending tool call. POSTs `{ approved: true }` to the backend. */
  approveToolCall: (toolCallId: string) => void;
  /** Reject a pending tool call. POSTs `{ approved: false }` to the backend. */
  rejectToolCall: (toolCallId: string) => void;
  /** Reset all state and reconnect. */
  reconnect: () => void;
  /** Abort the current run. */
  abortRun: () => void;
  /** Register a frontend tool definition. */
  registerTool: (tool: FrontendToolDefinition) => void;
  /** Unregister a frontend tool by name. */
  unregisterTool: (name: string) => void;
  /** Add a subscriber for raw events. Returns unsubscribe function. */
  subscribe: (subscriber: AgUiSubscriber) => () => void;
  /** Send a user message to the agent. */
  sendMessage: (content: string) => void;
  /** Total count of runs since connection. */
  runCount: number;
}

// ---------------------------------------------------------------------------
// JSON Patch apply (inline, no external deps)
// ---------------------------------------------------------------------------

/**
 * Resolve a JSON Pointer path (e.g. "/foo/bar/0") into segments.
 * Leading slash is stripped; "~1" → "/" and "~0" → "~" per RFC 6901.
 */
function parsePointer(path: string): string[] {
  if (path === '' || path === '/') return [];
  const raw = path.startsWith('/') ? path.slice(1) : path;
  return raw.split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Apply a minimal JSON Patch (add / remove / replace) to `obj` *immutably*,
 * returning a new top-level object.  Only the three core ops are supported;
 * `move`, `copy`, and `test` are intentionally omitted to keep things simple.
 */
function applyJsonPatch(
  obj: Record<string, unknown>,
  ops: JsonPatchOp[],
): Record<string, unknown> {
  let result: Record<string, unknown> = { ...obj };

  for (const op of ops) {
    const segments = parsePointer(op.path);
    if (segments.length === 0) {
      // Replacing the root — only makes sense for 'replace' / 'add'
      if (op.op === 'replace' || op.op === 'add') {
        result = (op.value as Record<string, unknown>) ?? {};
      }
      continue;
    }

    // Walk to the parent of the target key, shallow-cloning along the way so
    // React picks up the change.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = result;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (Array.isArray(current[seg])) {
        current[seg] = [...current[seg]];
      } else if (current[seg] && typeof current[seg] === 'object') {
        current[seg] = { ...current[seg] };
      } else {
        // Path doesn't exist yet — create intermediate object for 'add'
        current[seg] = {};
      }
      current = current[seg];
    }

    const lastKey = segments[segments.length - 1];

    switch (op.op) {
      case 'add':
      case 'replace':
        if (Array.isArray(current)) {
          const idx = lastKey === '-' ? current.length : Number(lastKey);
          if (op.op === 'add') {
            current.splice(idx, 0, op.value);
          } else {
            current[idx] = op.value;
          }
        } else {
          current[lastKey] = op.value;
        }
        break;
      case 'remove':
        if (Array.isArray(current)) {
          current.splice(Number(lastKey), 1);
        } else {
          delete current[lastKey];
        }
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: generate a short unique id for items that lack one
// ---------------------------------------------------------------------------
let _seqId = 0;
function nextId(): string {
  _seqId += 1;
  return `agui_${Date.now()}_${_seqId}`;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useAgUi(options?: UseAgUiOptions): UseAgUiReturn {
  const apiBase = (options?.apiBase ?? getApiUrl('')).replace(/\/+$/, '');
  const abortOnDisconnect = options?.abortOnDisconnect ?? false;

  // -- Connection state --
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // -- Lifecycle --
  const [runId, setRunId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  // -- Messages --
  const [messages, setMessages] = useState<AgUiTextMessage[]>([]);

  // -- Agent state --
  const [agentState, setAgentState] = useState<Record<string, unknown>>({});

  // -- Tool calls --
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCallState>>(
    () => new Map(),
  );
  const [pendingApprovals, setPendingApprovals] = useState<ToolCallApproval[]>([]);

  // -- Activity --
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // -- Reasoning --
  const [reasoningMessages, setReasoningMessages] = useState<ReasoningItem[]>([]);
  const [isReasoning, setIsReasoning] = useState(false);

  // -- Custom events --
  const [customEvents, setCustomEvents] = useState<CustomEventItem[]>([]);

  // -- Run count --
  const [runCount, setRunCount] = useState(0);

  // -- Refs --
  const esRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_INITIAL_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const frontendToolsRef = useRef<Map<string, FrontendToolDefinition>>(new Map());
  const subscribersRef = useRef<Set<AgUiSubscriber>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Seed frontend tools from options
  useEffect(() => {
    if (options?.frontendTools) {
      for (const tool of options.frontendTools) {
        frontendToolsRef.current.set(tool.name, tool);
      }
    }
  }, [options?.frontendTools]);

  // -----------------------------------------------------------------------
  // Tool-call approval / rejection
  // -----------------------------------------------------------------------

  const sendToolResult = useCallback((toolCallId: string, approved: boolean) => {
    // Remove from pending list immediately for snappy UI
    setPendingApprovals((prev) => prev.filter((p) => p.toolCallId !== toolCallId));

    fetch(`${apiBase}/api/ag-ui/tool-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCallId,
        content: JSON.stringify({ approved }),
      }),
    }).catch(() => {
      /* silent — backend may be unreachable */
    });
  }, [apiBase]);

  const approveToolCall = useCallback(
    (toolCallId: string) => sendToolResult(toolCallId, true),
    [sendToolResult],
  );

  const rejectToolCall = useCallback(
    (toolCallId: string) => sendToolResult(toolCallId, false),
    [sendToolResult],
  );

  // -----------------------------------------------------------------------
  // Abort run
  // -----------------------------------------------------------------------

  const abortRun = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Also POST abort to backend
    fetch(`${apiBase}/api/ag-ui/abort`, { method: 'POST' }).catch(() => {});
    setIsRunning(false);
    setCurrentStep(null);
  }, [apiBase]);

  // -----------------------------------------------------------------------
  // Frontend tool registration
  // -----------------------------------------------------------------------

  const registerTool = useCallback((tool: FrontendToolDefinition) => {
    frontendToolsRef.current.set(tool.name, tool);
  }, []);

  const unregisterTool = useCallback((name: string) => {
    frontendToolsRef.current.delete(name);
  }, []);

  // -----------------------------------------------------------------------
  // Subscriber management
  // -----------------------------------------------------------------------

  const subscribe = useCallback((subscriber: AgUiSubscriber) => {
    subscribersRef.current.add(subscriber);
    return () => { subscribersRef.current.delete(subscriber); };
  }, []);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------

  const sendMessage = useCallback((content: string) => {
    fetch(`${apiBase}/api/ag-ui/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch(() => {});

    // Optimistic local update
    const msg: AgUiTextMessage = {
      messageId: nextId(),
      role: 'user',
      content,
      streaming: false,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
  }, [apiBase]);

  // -----------------------------------------------------------------------
  // Event dispatch — called for every parsed SSE message
  // -----------------------------------------------------------------------

  const dispatch = useCallback((evt: AgUiEvent) => {
    // Notify subscribers — if any returns false, skip default handling
    const subs = Array.from(subscribersRef.current);
    for (let i = 0; i < subs.length; i++) {
      if (subs[i](evt) === false) return;
    }

    const now = Date.now();

    switch (evt.type) {
      // ---- Lifecycle ----
      case 'RUN_STARTED':
        setRunId((evt.runId as string) ?? null);
        setThreadId((evt.threadId as string) ?? null);
        setIsRunning(true);
        setError(null);
        setCurrentStep(null);
        setRunCount((c) => c + 1);
        abortControllerRef.current = new AbortController();
        break;

      case 'RUN_FINISHED':
        setIsRunning(false);
        setCurrentStep(null);
        abortControllerRef.current = null;
        break;

      case 'RUN_ERROR':
        setIsRunning(false);
        setCurrentStep(null);
        setError(new Error((evt.message as string) ?? 'Run error'));
        abortControllerRef.current = null;
        break;

      case 'STEP_STARTED':
        setCurrentStep((evt.stepName as string) ?? (evt.stepId as string) ?? null);
        break;

      case 'STEP_FINISHED':
        setCurrentStep(null);
        break;

      // ---- Text messages ----
      case 'TEXT_MESSAGE_START': {
        const msg: AgUiTextMessage = {
          messageId: (evt.messageId as string) ?? nextId(),
          role: (evt.role as AgUiTextMessage['role']) ?? 'agent',
          content: '',
          streaming: true,
          timestamp: now,
        };
        setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
        break;
      }

      case 'TEXT_MESSAGE_CONTENT': {
        const mid = evt.messageId as string;
        const chunk = (evt.content as string) ?? '';
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.messageId === mid);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
          return updated;
        });
        break;
      }

      case 'TEXT_MESSAGE_END': {
        const mid = evt.messageId as string;
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.messageId === mid);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], streaming: false };
          return updated;
        });
        break;
      }

      case 'TEXT_MESSAGE_CHUNK': {
        // Stateless chunk — create or append to message
        const mid = (evt.messageId as string) ?? nextId();
        const delta = (evt.delta as string) ?? (evt.content as string) ?? '';
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.messageId === mid);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: updated[idx].content + delta };
            return updated;
          }
          // First chunk for this message — create it
          return [...prev.slice(-(MAX_MESSAGES - 1)), {
            messageId: mid,
            role: (evt.role as AgUiTextMessage['role']) ?? 'agent',
            content: delta,
            streaming: true,
            timestamp: now,
          }];
        });
        break;
      }

      // ---- Agent state ----
      case 'STATE_SNAPSHOT':
        setAgentState((evt.snapshot as Record<string, unknown>) ?? {});
        break;

      case 'STATE_DELTA': {
        const ops = evt.delta as JsonPatchOp[] | undefined;
        if (ops && Array.isArray(ops)) {
          setAgentState((prev) => applyJsonPatch(prev, ops));
        }
        break;
      }

      // ---- Messages snapshot ----
      case 'MESSAGES_SNAPSHOT': {
        const msgs = evt.messages as Array<{id?: string; messageId?: string; role?: string; content?: string}>;
        if (Array.isArray(msgs)) {
          setMessages(msgs.map((m) => ({
            messageId: m.messageId ?? m.id ?? nextId(),
            role: (m.role as AgUiTextMessage['role']) ?? 'agent',
            content: (m.content as string) ?? '',
            streaming: false,
            timestamp: now,
          })));
        }
        break;
      }

      // ---- Tool calls ----
      case 'TOOL_CALL_START': {
        const tcId = (evt.toolCallId as string) ?? nextId();
        const tcName = (evt.toolCallName as string) ?? 'unknown';
        const tcArgs = (evt.args as string) ?? '';

        const entry: ToolCallState = {
          toolCallId: tcId,
          toolCallName: tcName,
          args: tcArgs,
          status: 'active',
          timestamp: now,
        };

        setActiveToolCalls((prev) => {
          const next = new Map(prev);
          next.set(tcId, entry);
          return next;
        });

        // If this is an approval request, surface it
        if (tcName === 'request_approval') {
          const approval: ToolCallApproval = {
            toolCallId: tcId,
            toolCallName: tcName,
            args: tcArgs,
            timestamp: now,
          };
          setPendingApprovals((prev) => [...prev, approval]);
        }

        // Auto-execute frontend-defined tools
        const frontendTool = frontendToolsRef.current.get(tcName);
        if (frontendTool) {
          Promise.resolve(frontendTool.handler(tcArgs)).then((result) => {
            // Send result back to backend
            fetch(`${apiBase}/api/ag-ui/tool-result`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolCallId: tcId, content: result }),
            }).catch(() => {});
            // Mark completed locally
            setActiveToolCalls((prev) => {
              const existing = prev.get(tcId);
              if (!existing) return prev;
              const next = new Map(prev);
              next.set(tcId, { ...existing, result, status: 'completed' });
              return next;
            });
          }).catch((err) => {
            setActiveToolCalls((prev) => {
              const existing = prev.get(tcId);
              if (!existing) return prev;
              const next = new Map(prev);
              next.set(tcId, { ...existing, result: String(err), status: 'error' });
              return next;
            });
          });
        }
        break;
      }

      case 'TOOL_CALL_ARGS': {
        const tcId = evt.toolCallId as string;
        const argChunk = (evt.args as string) ?? '';
        setActiveToolCalls((prev) => {
          const existing = prev.get(tcId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(tcId, { ...existing, args: existing.args + argChunk });
          return next;
        });
        break;
      }

      case 'TOOL_CALL_END': {
        const tcId = evt.toolCallId as string;
        const result = (evt.result as string) ?? undefined;
        const errorMsg = evt.error as string | undefined;
        setActiveToolCalls((prev) => {
          const existing = prev.get(tcId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(tcId, {
            ...existing,
            result: result ?? errorMsg,
            status: errorMsg ? 'error' : 'completed',
          });
          return next;
        });
        break;
      }

      case 'TOOL_CALL_RESULT': {
        const tcId = (evt.toolCallId as string);
        const content = (evt.content as string) ?? '';
        setActiveToolCalls((prev) => {
          const existing = prev.get(tcId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(tcId, { ...existing, result: content, status: 'completed' });
          return next;
        });
        break;
      }

      case 'TOOL_CALL_CHUNK': {
        const tcId = (evt.toolCallId as string) ?? nextId();
        const tcName = (evt.toolCallName as string) ?? 'unknown';
        const delta = (evt.delta as string) ?? '';
        setActiveToolCalls((prev) => {
          const existing = prev.get(tcId);
          if (existing) {
            const next = new Map(prev);
            next.set(tcId, { ...existing, args: existing.args + delta });
            return next;
          }
          // First chunk — create entry
          const next = new Map(prev);
          next.set(tcId, { toolCallId: tcId, toolCallName: tcName, args: delta, status: 'active', timestamp: now });
          return next;
        });
        break;
      }

      // ---- Activity ----
      case 'ACTIVITY': {
        const item: ActivityItem = {
          id: (evt.id as string) ?? nextId(),
          message: (evt.message as string) ?? '',
          level: (evt.level as ActivityItem['level']) ?? 'info',
          timestamp: now,
          metadata: evt.metadata as Record<string, unknown> | undefined,
        };
        setActivities((prev) => [...prev.slice(-(MAX_ACTIVITIES - 1)), item]);
        break;
      }

      case 'ACTIVITY_SNAPSHOT': {
        const item: ActivityItem = {
          id: (evt.messageId as string) ?? (evt.id as string) ?? nextId(),
          message: typeof evt.content === 'string' ? evt.content : JSON.stringify(evt.content ?? ''),
          level: (evt.level as ActivityItem['level']) ?? 'info',
          timestamp: now,
          metadata: evt.metadata as Record<string, unknown> | undefined,
        };
        // replace=true replaces last activity of same type
        if (evt.replace === true) {
          setActivities((prev) => {
            const idx = prev.findIndex((a) => a.id === item.id);
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = item;
              return updated;
            }
            return [...prev.slice(-(MAX_ACTIVITIES - 1)), item];
          });
        } else {
          setActivities((prev) => [...prev.slice(-(MAX_ACTIVITIES - 1)), item]);
        }
        break;
      }

      case 'ACTIVITY_DELTA': {
        const targetId = (evt.messageId as string) ?? (evt.id as string);
        const ops = evt.patch as JsonPatchOp[] | undefined;
        if (targetId && ops && Array.isArray(ops)) {
          setActivities((prev) => {
            const idx = prev.findIndex((a) => a.id === targetId);
            if (idx === -1) return prev;
            const patched = applyJsonPatch(prev[idx] as unknown as Record<string, unknown>, ops);
            const updated = [...prev];
            updated[idx] = patched as unknown as ActivityItem;
            return updated;
          });
        }
        break;
      }

      // ---- Reasoning / CoT ----
      case 'REASONING_START': {
        const rid = (evt.reasoningId as string) ?? nextId();
        const item: ReasoningItem = {
          id: rid,
          content: '',
          streaming: true,
          timestamp: now,
        };
        setReasoningMessages((prev) => [...prev.slice(-(MAX_REASONING - 1)), item]);
        setIsReasoning(true);
        break;
      }

      case 'REASONING_CONTENT': {
        const rid = evt.reasoningId as string;
        const chunk = (evt.content as string) ?? '';
        setReasoningMessages((prev) => {
          const idx = prev.findIndex((r) => r.id === rid);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
          return updated;
        });
        break;
      }

      case 'REASONING_END': {
        const rid = evt.reasoningId as string;
        setReasoningMessages((prev) => {
          const idx = prev.findIndex((r) => r.id === rid);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], streaming: false };
          return updated;
        });
        setIsReasoning(false);
        break;
      }

      case 'REASONING_MESSAGE_CHUNK': {
        const mid = (evt.messageId as string) ?? nextId();
        const delta = (evt.delta as string) ?? (evt.content as string) ?? '';
        setReasoningMessages((prev) => {
          const idx = prev.findIndex((r) => r.id === mid);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: updated[idx].content + delta };
            return updated;
          }
          return [...prev.slice(-(MAX_REASONING - 1)), {
            id: mid, content: delta, streaming: true, timestamp: now,
          }];
        });
        break;
      }

      // ---- Custom events ----
      case 'CUSTOM': {
        const item: CustomEventItem = {
          name: (evt.name as string) ?? 'unknown',
          value: evt.value,
          timestamp: now,
        };
        setCustomEvents((prev) => [...prev.slice(-(MAX_CUSTOM_EVENTS - 1)), item]);
        break;
      }

      // ---- Raw events ----
      case 'RAW':
        // Pass through to custom events with name='raw'
        setCustomEvents((prev) => [...prev.slice(-(MAX_CUSTOM_EVENTS - 1)), {
          name: 'raw', value: evt.event ?? evt, timestamp: now,
        }]);
        break;

      default:
        // Unknown event type — ignore silently
        break;
    }
  }, [apiBase]);

  // -----------------------------------------------------------------------
  // SSE connection with exponential backoff reconnect
  // -----------------------------------------------------------------------

  const connect = useCallback(() => {
    // Close any existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`${apiBase}/api/ag-ui/stream`);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setError(null);
      // Reset backoff on successful connection
      reconnectDelayRef.current = RECONNECT_INITIAL_MS;
    };

    es.onmessage = (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const evt = JSON.parse(e.data) as AgUiEvent;
        dispatch(evt);
      } catch {
        /* skip malformed JSON */
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);

      // Abort on disconnect if configured
      if (abortOnDisconnect && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        fetch(`${apiBase}/api/ag-ui/abort`, { method: 'POST' }).catch(() => {});
      }

      // Close the broken connection
      es.close();
      esRef.current = null;

      // Schedule reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, delay);

      // Increase delay for next attempt, capped at max
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
    };
  }, [dispatch, apiBase, abortOnDisconnect]);

  // -----------------------------------------------------------------------
  // Manual reconnect — resets state and reconnects immediately
  // -----------------------------------------------------------------------

  const reconnect = useCallback(() => {
    // Clear any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Reset backoff
    reconnectDelayRef.current = RECONNECT_INITIAL_MS;
    // Reconnect
    connect();
  }, [connect]);

  // -----------------------------------------------------------------------
  // Mount / unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      // Tear down EventSource
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      // Cancel pending reconnect
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  // -----------------------------------------------------------------------
  // Assemble return value
  // -----------------------------------------------------------------------

  return {
    // Connection
    connected,
    error,

    // Lifecycle
    runId,
    threadId,
    isRunning,
    currentStep,

    // Messages
    messages,

    // Agent state
    agentState,

    // Tool calls
    activeToolCalls,
    pendingApprovals,

    // Activity
    activities,

    // Reasoning
    reasoningMessages,
    isReasoning,

    // Custom events
    customEvents,

    // Run count
    runCount,

    // Actions
    approveToolCall,
    rejectToolCall,
    reconnect,
    abortRun,
    registerTool,
    unregisterTool,
    subscribe,
    sendMessage,
  };
}
