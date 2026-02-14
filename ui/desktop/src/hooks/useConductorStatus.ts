import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConductorChild {
  name: string;
  pid: number;
  status: string;
  uptime: number;
}

export interface ConductorStatus {
  running: boolean;
  children: ConductorChild[];
  lastHealthCheck: string;
  messageQueueSize: number;
  taskQueueSize: number;
}

export interface UseConductorStatusReturn {
  status: ConductorStatus | null;
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useConductorStatus(): UseConductorStatusReturn {
  const [status, setStatus] = useState<ConductorStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const fetchStatus = async () => {
      try {
        const url = getApiUrl('/api/agents/conductor/status');
        const res = await fetch(url);
        if (!res.ok) {
          if (mountedRef.current) setConnected(false);
          return;
        }
        const data = await res.json();
        if (!mountedRef.current) return;

        setStatus({
          running: data.running ?? false,
          children: Array.isArray(data.children)
            ? data.children.map((c: Record<string, unknown>) => ({
                name: (c.name as string) ?? 'unknown',
                pid: (c.pid as number) ?? 0,
                status: (c.status as string) ?? 'unknown',
                uptime: (c.uptime as number) ?? 0,
              }))
            : [],
          lastHealthCheck:
            (data.lastHealthCheck as string) ??
            (data.last_health_check as string) ??
            new Date().toISOString(),
          messageQueueSize:
            (data.messageQueueSize as number) ??
            (data.message_queue_size as number) ??
            0,
          taskQueueSize:
            (data.taskQueueSize as number) ??
            (data.task_queue_size as number) ??
            0,
        });
        setConnected(true);
      } catch {
        if (mountedRef.current) setConnected(false);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { status, connected };
}
