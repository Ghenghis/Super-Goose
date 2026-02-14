import { useState, useEffect, useCallback } from 'react';
import { Zap, Search } from 'lucide-react';

import { CONSCIOUS_API } from './consciousConfig';

interface Capability {
  name: string;
  description: string;
  category: string;
  voice_triggers: string[];
}

export default function CapabilitiesList() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  const fetchCapabilities = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/agent/capabilities`, { signal });
      if (res.ok) {
        const data = await res.json();
        setCapabilities(data.capabilities || []);
        setError('');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError('Capabilities API not reachable');
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCapabilities(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchCapabilities]);

  const filtered = capabilities.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.description.toLowerCase().includes(filter.toLowerCase()) ||
      c.voice_triggers.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
  );

  const grouped = filtered.reduce<Record<string, Capability[]>>((acc, c) => {
    const cat = c.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-text-subtlest" aria-hidden="true" />
          <span className="text-sm font-medium">
            Capabilities ({capabilities.length})
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-purple-400 hover:text-purple-300"
          aria-label={expanded ? 'Collapse capabilities list' : 'Expand capabilities list'}
          aria-expanded={expanded}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {error && <div className="text-xs text-red-400" role="alert">{error}</div>}

      {expanded && (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-text-subtlest" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search capabilities..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded bg-surface-secondary border border-border-subtle focus:outline-none focus:border-purple-500"
              aria-label="Search capabilities"
            />
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto" role="list" aria-label="Capabilities list">
            {Object.entries(grouped).map(([category, caps]) => (
              <div key={category} role="group" aria-label={`${category} capabilities`}>
                <h4 className="text-xs font-semibold uppercase text-text-subtlest mb-1">
                  {category}
                </h4>
                {caps.map((cap) => (
                  <div
                    key={cap.name}
                    role="listitem"
                    className="p-2 rounded bg-surface-secondary text-xs mb-1"
                  >
                    <div className="font-medium">{cap.name}</div>
                    <div className="text-text-subtlest">{cap.description}</div>
                    <div className="text-purple-400 mt-0.5">
                      &quot;{cap.voice_triggers[0]}&quot;
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-xs text-text-subtlest text-center py-4" role="status">
                No capabilities match your search
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}