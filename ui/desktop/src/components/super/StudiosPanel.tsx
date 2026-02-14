import { useState, useRef } from 'react';
import { StudioPipeline } from './studio';
import type { StudioTabId } from './studio';

interface Studio {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'available' | 'coming-soon';
  defaultTab: StudioTabId;
}

const STUDIOS: Studio[] = [
  { id: 'core', name: 'Core Studio', description: 'Build and test agent cores', icon: '\uD83E\uDDE0', color: 'var(--sg-violet)', status: 'available', defaultTab: 'plan' },
  { id: 'agent', name: 'Agent Studio', description: 'Design multi-agent workflows', icon: '\uD83E\uDD16', color: 'var(--sg-indigo)', status: 'available', defaultTab: 'plan' },
  { id: 'data', name: 'Data Studio', description: 'Prepare training datasets', icon: '\uD83D\uDCCA', color: 'var(--sg-emerald)', status: 'coming-soon', defaultTab: 'plan' },
  { id: 'eval', name: 'Eval Studio', description: 'Benchmark and evaluate models', icon: '\uD83D\uDCC8', color: 'var(--sg-gold)', status: 'coming-soon', defaultTab: 'plan' },
  { id: 'deploy', name: 'Deploy Studio', description: 'Package and distribute', icon: '\uD83D\uDE80', color: 'var(--sg-sky)', status: 'coming-soon', defaultTab: 'plan' },
  { id: 'vision', name: 'Vision Studio', description: 'Multimodal capabilities', icon: '\uD83D\uDC41\uFE0F', color: 'var(--sg-amber)', status: 'coming-soon', defaultTab: 'plan' },
];

export default function StudiosPanel() {
  const [filter, setFilter] = useState<'all' | 'available'>('all');
  const [activeStudio, setActiveStudio] = useState<string | null>(null);
  const lastFocusedStudio = useRef<string | null>(null);

  const filtered = filter === 'all' ? STUDIOS : STUDIOS.filter(s => s.status === 'available');
  const selectedStudio = STUDIOS.find(s => s.id === activeStudio);

  const handleOpenStudio = (id: string) => {
    lastFocusedStudio.current = id;
    setActiveStudio(id);
  };

  const handleBackToStudios = () => {
    setActiveStudio(null);
    // Restore focus to previously selected studio card after render
    setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-testid="studio-card-${lastFocusedStudio.current}"]`)?.focus();
    }, 0);
  };

  // Pipeline view when a studio is selected
  if (selectedStudio) {
    return (
      <div className="space-y-3">
        <button
          className="sg-tab flex items-center gap-1"
          onClick={handleBackToStudios}
          data-testid="back-to-studios"
          style={{ color: 'var(--sg-text-2)', fontSize: '0.8125rem' }}
        >
          <span aria-hidden="true">&larr;</span> Back to Studios
        </button>

        <div className="flex items-center gap-2 mb-1" style={{ paddingLeft: '0.25rem' }}>
          <span className="text-xl">{selectedStudio.icon}</span>
          <span className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
            {selectedStudio.name}
          </span>
        </div>

        <StudioPipeline defaultTab={selectedStudio.defaultTab} />
      </div>
    );
  }

  // Grid view
  return (
    <div className="space-y-4">
      <div className="sg-tabs">
        <button className={`sg-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Studios</button>
        <button className={`sg-tab ${filter === 'available' ? 'active' : ''}`} onClick={() => setFilter('available')}>Available</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map(studio => {
          const isComingSoon = studio.status === 'coming-soon';

          return (
            <div
              key={studio.id}
              className={`sg-card ${isComingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={isComingSoon ? undefined : () => handleOpenStudio(studio.id)}
              title={isComingSoon ? 'Coming soon \u2014 this studio is under development' : `Open ${studio.name}`}
              data-testid={`studio-card-${studio.id}`}
              role="button"
              tabIndex={isComingSoon ? -1 : 0}
              aria-disabled={isComingSoon}
              onKeyDown={isComingSoon ? undefined : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenStudio(studio.id);
                }
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{studio.icon}</span>
                <div>
                  <div className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{studio.name}</div>
                  {isComingSoon && (
                    <span className="sg-badge sg-badge-gold" style={{ fontSize: '0.625rem' }}>Coming Soon</span>
                  )}
                </div>
              </div>
              <p style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{studio.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
