import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../../config';

interface FeatureToggle {
  name: string;
  enabled: boolean;
  description: string;
}

const FALLBACK_TOGGLES: FeatureToggle[] = [
  { name: 'Experience Store', description: 'Cross-session learning', enabled: false },
  { name: 'Skill Library', description: 'Reusable strategies', enabled: false },
  { name: 'Auto Core Selection', description: 'Auto-pick best core per task', enabled: false },
  { name: 'Autonomous Mode', description: '24/7 agent daemon', enabled: false },
  { name: 'OTA Self-Update', description: 'Self-building pipeline', enabled: false },
];

export default function SGSettingsPanel() {
  const [features, setFeatures] = useState<FeatureToggle[]>(FALLBACK_TOGGLES);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [learningStats, setLearningStats] = useState<{
    total_experiences?: number;
    total_skills?: number;
    verified_skills?: number;
  } | null>(null);
  const [version, setVersion] = useState<string>('v1.24.05');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    fetch(getApiUrl('/api/learning/stats'), { signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !signal.aborted) setLearningStats(data); })
      .catch(() => {});

    fetch(getApiUrl('/api/version'), { signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.version && !signal.aborted) setVersion(`v${data.version}`); })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/features'));
      if (!res.ok) return;
      const data = await res.json();
      const list: FeatureToggle[] = (data.features ?? data ?? []).map((f: { name: string; enabled: boolean; description?: string }) => ({
        name: f.name,
        enabled: f.enabled,
        description: f.description ?? '',
      }));
      if (list.length > 0) {
        setFeatures(list);
        setApiAvailable(true);
      }
    } catch {
      /* backend unreachable — keep fallback */
    }
  }, []);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const handleToggle = async (featureName: string) => {
    const current = features.find(f => f.name === featureName);
    if (!current) return;

    const newEnabled = !current.enabled;

    // Optimistic update
    setFeatures(prev => prev.map(f => f.name === featureName ? { ...f, enabled: newEnabled } : f));

    if (apiAvailable) {
      try {
        const res = await fetch(getApiUrl(`/api/features/${encodeURIComponent(featureName)}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newEnabled }),
        });
        if (!res.ok) {
          // Revert on failure
          setFeatures(prev => prev.map(f => f.name === featureName ? { ...f, enabled: !newEnabled } : f));
        }
      } catch {
        // Revert on error
        setFeatures(prev => prev.map(f => f.name === featureName ? { ...f, enabled: !newEnabled } : f));
      }
    }
  };

  const expDbStatus = learningStats?.total_experiences != null
    ? `${learningStats.total_experiences} entries`
    : 'Not initialized';
  const skillsDbStatus = learningStats?.total_skills != null
    ? `${learningStats.total_skills} skills (${learningStats.verified_skills} verified)`
    : 'Not initialized';

  return (
    <div className="space-y-6">
      {/* Feature toggles */}
      <div>
        <div className="sg-section-label">
          Feature Toggles
          {!apiAvailable && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--sg-text-4)', fontSize: '0.625rem' }}>(offline)</span>
          )}
        </div>
        <div className="space-y-2">
          {features.map(toggle => (
            <div key={toggle.name} className="sg-card flex items-center justify-between py-2">
              <div>
                <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{toggle.name}</div>
                <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>{toggle.description}</div>
              </div>
              <div
                role="switch"
                aria-checked={toggle.enabled}
                aria-label={`Toggle ${toggle.name}`}
                tabIndex={0}
                onClick={() => handleToggle(toggle.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(toggle.name); } }}
                style={{
                  width: '2.5rem',
                  height: '1.25rem',
                  borderRadius: '9999px',
                  background: toggle.enabled ? 'var(--sg-emerald)' : 'var(--sg-input)',
                  cursor: 'pointer',
                  position: 'relative',
                  border: `1px solid ${toggle.enabled ? 'var(--sg-emerald)' : 'var(--sg-border)'}`,
                }}>
                <div style={{
                  width: '0.875rem',
                  height: '0.875rem',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '50%',
                  transform: `translateY(-50%) translateX(${toggle.enabled ? '1.25rem' : '0.125rem'})`,
                  transition: 'transform 0.15s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Storage info */}
      <div>
        <div className="sg-section-label">Storage</div>
        <div className="sg-card">
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Experience DB</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>{expDbStatus}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Skills DB</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>{skillsDbStatus}</span>
          </div>
        </div>
      </div>

      {/* Version info */}
      <div>
        <div className="sg-section-label">Version</div>
        <div className="sg-card">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Super-Goose</span>
            <span style={{ color: 'var(--sg-gold)', fontSize: '0.875rem' }}>{version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
