import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:3284';

export interface AgentStreamEvent {
  type: 'agent_status' | 'task_update' | 'tool_called' | 'core_switched' | 'experience_recorded';
  [key: string]: unknown;
}

export function useAgentStream() {
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [latestStatus, setLatestStatus] = useState<AgentStreamEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/agent-stream`);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as AgentStreamEvent;
        setEvents(prev => [...prev.slice(-99), evt]);
        if (evt.type === 'agent_status') setLatestStatus(evt);
      } catch { /* skip malformed */ }
    };
    es.onerror = () => setConnected(false);
    return () => { es.close(); esRef.current = null; };
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);
  return { events, connected, latestStatus, clearEvents };
}
