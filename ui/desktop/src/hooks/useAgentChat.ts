import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiUrl } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentChatMessage {
  id: string;
  from: string;
  to: string;
  channel: 'direct' | 'team' | 'broadcast' | 'system';
  priority: 'critical' | 'high' | 'normal' | 'low';
  payload: unknown;
  timestamp: string;
  delivered: boolean;
  acknowledged: boolean;
}

export interface AgentInfo {
  id: string;
  role: string;
  displayName: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  model: string;
  lastHeartbeat: string;
}

export interface UseAgentChatReturn {
  messages: AgentChatMessage[];
  agents: AgentInfo[];
  connected: boolean;
  sendMessage: (to: string, content: string, channel?: string) => Promise<void>;
  wakeAgent: (agentId: string, reason: string) => Promise<void>;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 200;
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// ---------------------------------------------------------------------------
// Helper: generate a short unique id
// ---------------------------------------------------------------------------

let _seqId = 0;
function nextId(): string {
  _seqId += 1;
  return `achat_${Date.now()}_${_seqId}`;
}

// ---------------------------------------------------------------------------
// SSE event shapes from the backend
// ---------------------------------------------------------------------------

interface ChatStreamEvent {
  type:
    | 'agent_message'
    | 'agent_registry'
    | 'agent_status'
    | 'heartbeat'
    | 'error';
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useAgentChat(): UseAgentChatReturn {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [connected, setConnected] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_INITIAL_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // -----------------------------------------------------------------------
  // Event dispatch
  // -----------------------------------------------------------------------

  const dispatch = useCallback((evt: ChatStreamEvent) => {
    switch (evt.type) {
      case 'agent_message': {
        const msg: AgentChatMessage = {
          id: (evt.id as string) ?? nextId(),
          from: (evt.from as string) ?? 'unknown',
          to: (evt.to as string) ?? 'all',
          channel: (evt.channel as AgentChatMessage['channel']) ?? 'team',
          priority: (evt.priority as AgentChatMessage['priority']) ?? 'normal',
          payload: evt.payload ?? evt.content ?? '',
          timestamp: (evt.timestamp as string) ?? new Date().toISOString(),
          delivered: (evt.delivered as boolean) ?? true,
          acknowledged: (evt.acknowledged as boolean) ?? false,
        };
        setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
        break;
      }

      case 'agent_registry': {
        const list = evt.agents as Array<Record<string, unknown>>;
        if (Array.isArray(list)) {
          setAgents(
            list.map((a) => ({
              id: (a.id as string) ?? 'unknown',
              role: (a.role as string) ?? 'agent',
              displayName: (a.displayName as string) ?? (a.display_name as string) ?? (a.id as string) ?? 'Agent',
              status: (a.status as AgentInfo['status']) ?? 'offline',
              model: (a.model as string) ?? 'unknown',
              lastHeartbeat: (a.lastHeartbeat as string) ?? (a.last_heartbeat as string) ?? new Date().toISOString(),
            })),
          );
        }
        break;
      }

      case 'agent_status': {
        const agentId = evt.agentId as string;
        const status = evt.status as AgentInfo['status'];
        if (agentId && status) {
          setAgents((prev) =>
            prev.map((a) =>
              a.id === agentId
                ? { ...a, status, lastHeartbeat: (evt.lastHeartbeat as string) ?? new Date().toISOString() }
                : a,
            ),
          );
        }
        break;
      }

      case 'heartbeat':
        // Connection keepalive — no state change
        break;

      case 'error':
        // Backend signaled an error — could add to messages as system
        break;

      default:
        break;
    }
  }, []);

  // -----------------------------------------------------------------------
  // SSE connection with exponential backoff
  // -----------------------------------------------------------------------

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const url = getApiUrl('/api/agents/chat/stream');
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      reconnectDelayRef.current = RECONNECT_INITIAL_MS;
    };

    es.onmessage = (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const evt = JSON.parse(e.data) as ChatStreamEvent;
        dispatch(evt);
      } catch {
        /* skip malformed JSON */
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      es.close();
      esRef.current = null;

      const delay = reconnectDelayRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, delay);

      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
    };
  }, [dispatch]);

  // -----------------------------------------------------------------------
  // Mount / unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const sendMessage = useCallback(
    async (to: string, content: string, channel = 'team') => {
      const url = getApiUrl('/api/agents/chat/send');
      const msg: AgentChatMessage = {
        id: nextId(),
        from: 'user',
        to,
        channel: channel as AgentChatMessage['channel'],
        priority: 'normal',
        payload: content,
        timestamp: new Date().toISOString(),
        delivered: false,
        acknowledged: false,
      };

      // Optimistic local update
      setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);

      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, content, channel }),
        });
      } catch {
        /* silent — backend may be unreachable */
      }
    },
    [],
  );

  const wakeAgent = useCallback(async (agentId: string, reason: string) => {
    const url = getApiUrl('/api/agents/wake');
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, reason }),
      });
      // Optimistic — mark as waking (busy)
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, status: 'busy' as const } : a)),
      );
    } catch {
      /* silent */
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    agents,
    connected,
    sendMessage,
    wakeAgent,
    clearMessages,
  };
}
