import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:3284';

/** Event types as sent by the backend (PascalCase serde tags). */
export type AgentStreamEventType =
  | 'AgentStatus'
  | 'TaskUpdate'
  | 'ToolCalled'
  | 'CoreSwitched'
  | 'ExperienceRecorded'
  | 'Heartbeat';

export interface AgentStreamEvent {
  type: AgentStreamEventType;
  [key: string]: unknown;
}

export function useAgentStream() {
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [latestStatus, setLatestStatus] = useState<AgentStreamEvent | null>(null);
  const [reconnectedAfterGap, setReconnectedAfterGap] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const disconnectTimeRef = useRef<number>(0);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/agent-stream`);
    esRef.current = es;
    es.onopen = () => {
      setConnected(true);
      if (disconnectTimeRef.current > 0) {
        const gap = Date.now() - disconnectTimeRef.current;
        if (gap > 2000) { // More than 2s gap = likely OTA restart
          setReconnectedAfterGap(true);
          // Auto-clear after 10s
          setTimeout(() => setReconnectedAfterGap(false), 10000);
        }
        disconnectTimeRef.current = 0;
      }
    };
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as AgentStreamEvent;
        setEvents(prev => [...prev.slice(-99), evt]);
        if (evt.type === 'AgentStatus') setLatestStatus(evt);
      } catch { /* skip malformed */ }
    };
    es.onerror = () => {
      setConnected(false);
      if (disconnectTimeRef.current === 0) {
        disconnectTimeRef.current = Date.now();
      }
    };
    return () => { es.close(); esRef.current = null; };
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);
  return { events, connected, latestStatus, clearEvents, reconnectedAfterGap };
}
