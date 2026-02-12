import { useState } from 'react';

interface Studio {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'available' | 'coming-soon';
}

const STUDIOS: Studio[] = [
  { id: 'core', name: 'Core Studio', description: 'Build and test agent cores', icon: '\uD83E\uDDE0', color: 'var(--sg-violet)', status: 'available' },
  { id: 'agent', name: 'Agent Studio', description: 'Design multi-agent workflows', icon: '\uD83E\uDD16', color: 'var(--sg-indigo)', status: 'available' },
  { id: 'data', name: 'Data Studio', description: 'Prepare training datasets', icon: '\uD83D\uDCCA', color: 'var(--sg-emerald)', status: 'coming-soon' },
  { id: 'eval', name: 'Eval Studio', description: 'Benchmark and evaluate models', icon: '\uD83D\uDCC8', color: 'var(--sg-gold)', status: 'coming-soon' },
  { id: 'deploy', name: 'Deploy Studio', description: 'Package and distribute', icon: '\uD83D\uDE80', color: 'var(--sg-sky)', status: 'coming-soon' },
  { id: 'vision', name: 'Vision Studio', description: 'Multimodal capabilities', icon: '\uD83D\uDC41\uFE0F', color: 'var(--sg-amber)', status: 'coming-soon' },
];

export default function StudiosPanel() {
  const [filter, setFilter] = useState<'all' | 'available'>('all');

  const filtered = filter === 'all' ? STUDIOS : STUDIOS.filter(s => s.status === 'available');

  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Studios</button>
        <button className={`sg-tab ${filter === 'available' ? 'active' : ''}`} onClick={() => setFilter('available')}>Available</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map(studio => (
          <div key={studio.id} className="sg-card cursor-pointer" style={{ opacity: studio.status === 'coming-soon' ? 0.6 : 1 }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{studio.icon}</span>
              <div>
                <div className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{studio.name}</div>
                {studio.status === 'coming-soon' && (
                  <span className="sg-badge sg-badge-gold" style={{ fontSize: '0.625rem' }}>Coming Soon</span>
                )}
              </div>
            </div>
            <p style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{studio.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
