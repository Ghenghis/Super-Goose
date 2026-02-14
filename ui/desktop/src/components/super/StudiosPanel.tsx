import { useState, useRef } from 'react';
import { StudioPipeline } from './studio';
import type { StudioTabId } from './studio';

interface Studio {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultTab: StudioTabId;
}

const STUDIOS: Studio[] = [
  { id: 'core', name: 'Core Studio', description: 'Build and test agent cores', icon: '\uD83E\uDDE0', color: 'var(--sg-violet)', defaultTab: 'plan' },
  { id: 'agent', name: 'Agent Studio', description: 'Design multi-agent workflows', icon: '\uD83E\uDD16', color: 'var(--sg-indigo)', defaultTab: 'plan' },
  { id: 'data', name: 'Data Studio', description: 'Curate, transform, and validate training datasets', icon: '\uD83D\uDCCA', color: 'var(--sg-emerald)', defaultTab: 'plan' },
  { id: 'eval', name: 'Eval Studio', description: 'Run benchmarks, A/B tests, and quality evaluations', icon: '\uD83D\uDCC8', color: 'var(--sg-gold)', defaultTab: 'test' },
  { id: 'deploy', name: 'Deploy Studio', description: 'Package agents and deploy to staging or production', icon: '\uD83D\uDE80', color: 'var(--sg-sky)', defaultTab: 'deploy' },
  { id: 'vision', name: 'Vision Studio', description: 'Build agents with image, video, and audio capabilities', icon: '\uD83D\uDC41\uFE0F', color: 'var(--sg-amber)', defaultTab: 'code' },
];

export default function StudiosPanel() {
  const [activeStudio, setActiveStudio] = useState<string | null>(null);
  const lastFocusedStudio = useRef<string | null>(null);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STUDIOS.map(studio => (
          <div
            key={studio.id}
            className="sg-card cursor-pointer"
            onClick={() => handleOpenStudio(studio.id)}
            title={`Open ${studio.name}`}
            data-testid={`studio-card-${studio.id}`}
            role="button"
            tabIndex={0}
            aria-disabled={false}
            onKeyDown={(e) => {
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
              </div>
            </div>
            <p style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>{studio.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
