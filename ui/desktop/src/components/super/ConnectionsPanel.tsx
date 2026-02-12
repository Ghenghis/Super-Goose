import { useState } from 'react';

interface Connection {
  name: string;
  icon: string;
  status: 'connected' | 'disconnected';
  category: 'services' | 'models' | 'keys';
}

const CONNECTIONS: Connection[] = [
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

  const filtered = CONNECTIONS.filter(c => c.category === tab);

  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>Services</button>
        <button className={`sg-tab ${tab === 'models' ? 'active' : ''}`} onClick={() => setTab('models')}>Models</button>
        <button className={`sg-tab ${tab === 'keys' ? 'active' : ''}`} onClick={() => setTab('keys')}>API Keys</button>
      </div>

      {tab === 'keys' ? (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          API key management — coming soon
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(conn => (
            <div key={conn.name} className="sg-card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{conn.icon}</span>
                <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{conn.name}</span>
              </div>
              <button className="sg-btn sg-btn-ghost" style={{ fontSize: '0.75rem' }}>
                Connect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
