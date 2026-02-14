import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../config';

export interface TimeWarpEventAPI {
  id: string;
  session_id: string;
  branch_id: string;
  event_type: string;
  label: string;
  detail: string;
  agent_id: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface TimeWarpBranchAPI {
  id: string;
  session_id: string;
  name: string;
  parent_branch_id: string | null;
  fork_event_id: string | null;
  created_at: string;
  is_active: boolean;
}

export function useTimeWarpEvents(sessionId: string | null) {
  const [events, setEvents] = useState<TimeWarpEventAPI[]>([]);
  const [branches, setBranches] = useState<TimeWarpBranchAPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        getApiUrl(`/api/timewarp/events?session_id=${encodeURIComponent(sessionId)}`)
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      } else if (res.status === 404) {
        // TimeWarp route not yet available — silently use empty
        setEvents([]);
      } else {
        setError(`HTTP ${res.status}`);
      }
    } catch {
      // Backend likely unreachable — use empty state
      setEvents([]);
    }
    setLoading(false);
  }, [sessionId]);

  const fetchBranches = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(
        getApiUrl(`/api/timewarp/branches?session_id=${encodeURIComponent(sessionId)}`)
      );
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
      }
    } catch {
      /* silent */
    }
  }, [sessionId]);

  const recordEvent = useCallback(
    async (event: Omit<TimeWarpEventAPI, 'id' | 'timestamp'>) => {
      try {
        const res = await fetch(getApiUrl('/api/timewarp/events'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (res.ok) await fetchEvents();
        return res.ok;
      } catch {
        return false;
      }
    },
    [fetchEvents]
  );

  const createBranch = useCallback(
    async (name: string, forkEventId?: string) => {
      try {
        const res = await fetch(getApiUrl('/api/timewarp/branches'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            name,
            fork_event_id: forkEventId,
          }),
        });
        if (res.ok) await fetchBranches();
        return res.ok;
      } catch {
        return false;
      }
    },
    [sessionId, fetchBranches]
  );

  const replayToEvent = useCallback(
    async (eventId: string) => {
      try {
        const res = await fetch(getApiUrl('/api/timewarp/replay'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, event_id: eventId }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [sessionId]
  );

  useEffect(() => {
    fetchEvents();
    fetchBranches();
  }, [fetchEvents, fetchBranches]);

  return {
    events,
    branches,
    loading,
    error,
    fetchEvents,
    fetchBranches,
    recordEvent,
    createBranch,
    replayToEvent,
  };
}
