import { useState, useEffect, useCallback } from 'react';
import { SGStatusDot, SGEmptyState } from './shared';
import { getApiUrl } from '../../config';

interface ExtensionEntry {
  name: string;
  enabled: boolean;
  type: string;
}

interface Connection {
  name: string;
  icon: string;
  status: 'connected' | 'disconnected';
  category: 'services' | 'models' | 'keys';
}

const STATIC_CONNECTIONS: Connection[] = [
  { name: 'GitHub', icon: '\uD83D\uDC19', status: 'disconnected', category: 'services' },
  { name: 'HuggingFace', icon: '\uD83E\uDD17', status: 'disconnected', category: 'services' },
  { name: 'Docker Hub', icon: '\uD83D\uDC33', status: 'disconnected', category: 'services' },
  { name: 'W&B', icon: '\uD83D\uDCCA', status: 'disconnected', category: 'services' },
  { name: 'Ollama', icon: '\uD83E\uDD99', status: 'disconnected', category: 'models' },
  { name: 'Claude', icon: '\uD83E\uDD16', status: 'disconnected', category: 'models' },
  { name: 'OpenAI', icon: '\uD83E\uDDE0', status: 'disconnected', category: 'models' },
];

export default function ConnectionsPanel() {
  const [tab, setTab] = useState<'services' | 'models' | 'keys'>('services');
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([]);
  const [connections, setConnections] = useState<Connection[]>(STATIC_CONNECTIONS);
  const [extensionsLoaded, setExtensionsLoaded] = useState(false);

  const fetchExtensions = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/config/extensions'));
      if (!res.ok) return;
      const data = await res.json();
      const exts: ExtensionEntry[] = Array.isArray(data) ? data : (data.extensions ?? []);
      setExtensions(exts);
      setExtensionsLoaded(true);

      // Merge extension status into connections where names match
      setConnections(prev =>
        prev.map(conn => {
          const ext = exts.find(e => e.name.toLowerCase().includes(conn.name.toLowerCase()));
          if (ext) {
            return { ...conn, status: ext.enabled ? 'connected' : 'disconnected' };
          }
          return conn;
        })
      );
    } catch {
      /* backend unreachable */
    }
  }, []);

  useEffect(() => { fetchExtensions(); }, [fetchExtensions]);

  const filtered = connections.filter(c => c.category === tab);

  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>Services</button>
        <button className={`sg-tab ${tab === 'models' ? 'active' : ''}`} onClick={() => setTab('models')}>Models</button>
        <button className={`sg-tab ${tab === 'keys' ? 'active' : ''}`} onClick={() => setTab('keys')}>API Keys</button>
      </div>

      {tab === 'keys' ? (
        <div>
          {extensionsLoaded && extensions.length > 0 ? (
            <div className="space-y-2">
              {extensions.map(ext => (
                <div key={ext.name} className="sg-card flex items-center justify-between py-2">
                  <div>
                    <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{ext.name}</div>
                    <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>{ext.type}</div>
                  </div>
                  <SGStatusDot status={ext.enabled ? 'connected' : 'disconnected'} />
                </div>
              ))}
            </div>
          ) : (
            <SGEmptyState message="API key management — coming soon" />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length > 0 ? (
            filtered.map(conn => (
              <div key={conn.name} className="sg-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{conn.icon}</span>
                  <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{conn.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <SGStatusDot status={conn.status} label={conn.status === 'connected' ? 'Active' : undefined} />
                  <button className="sg-btn sg-btn-ghost" style={{ fontSize: '0.75rem' }}>
                    {conn.status === 'connected' ? 'Configure' : 'Connect'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <SGEmptyState message="No connections in this category" />
          )}
        </div>
      )}
    </div>
  );
}
