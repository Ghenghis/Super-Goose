import { useState } from 'react';

export default function GPUPanel() {
  const [tab, setTab] = useState<'cluster' | 'jobs' | 'launch'>('cluster');

  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${tab === 'cluster' ? 'active' : ''}`} onClick={() => setTab('cluster')}>Cluster</button>
        <button className={`sg-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>Jobs</button>
        <button className={`sg-tab ${tab === 'launch' ? 'active' : ''}`} onClick={() => setTab('launch')}>Launch</button>
      </div>

      {tab === 'cluster' && (
        <div className="space-y-3">
          <div className="sg-card">
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>Local GPU</span>
              <span className="sg-badge sg-badge-red">
                <span className="sg-status-dot sg-status-idle" />
                Not detected
              </span>
            </div>
            <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>
              Connect a CUDA-capable GPU to enable local training
            </p>
          </div>
          <div className="sg-card">
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem', fontWeight: 500 }}>Cloud GPU</span>
              <span className="sg-badge sg-badge-gold">BYOK</span>
            </div>
            <p style={{ color: 'var(--sg-text-4)', fontSize: '0.8125rem' }}>
              Bring your own key: RunPod, Lambda, Vast.ai, SkyPilot
            </p>
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No running jobs
        </div>
      )}

      {tab === 'launch' && (
        <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          GPU launch — configure cloud provider first
        </div>
      )}
    </div>
  );
}
