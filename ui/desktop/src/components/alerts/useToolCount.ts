import { useState, useEffect } from 'react';
import { getTools } from '../../api';

/**
 * Fetches tool count for a session.
 *
 * Note: In a future optimization, this could be returned as part of the
 * start agent request to eliminate this separate API call.
 */
export const useToolCount = (sessionId: string) => {
  const [toolCount, setToolCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchTools = async () => {
      try {
        const response = await getTools({ query: { session_id: sessionId } });
        setToolCount(response.error || !response.data ? 0 : response.data.length);
      } catch (err) {
        console.error('Error fetching tools:', err);
        setToolCount(0);
      }
    };

    fetchTools();
  }, [sessionId]);

  return toolCount;
};
