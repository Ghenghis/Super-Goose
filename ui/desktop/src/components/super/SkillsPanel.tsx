import { useState, useCallback } from 'react';
import { SGMetricCard, SGBadge, SGEmptyState } from './shared';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: 'builtin' | 'learned' | 'community';
  enabled: boolean;
  usageCount: number;
  lastUsed: string | null;
  source: string;
}

type CategoryFilter = 'all' | 'builtin' | 'learned' | 'community';

const CATEGORY_BADGE_VARIANT: Record<Skill['category'], 'indigo' | 'emerald' | 'gold'> = {
  builtin: 'indigo',
  learned: 'emerald',
  community: 'gold',
};

const INITIAL_SKILLS: Skill[] = [
  { id: 'file-ops', name: 'File Operations', description: 'Read, write, move, and manage files across the filesystem', category: 'builtin', enabled: true, usageCount: 47, lastUsed: '2026-02-13T10:30:00Z', source: 'core' },
  { id: 'code-analysis', name: 'Code Analysis', description: 'Static analysis, linting, and structural code inspection', category: 'builtin', enabled: true, usageCount: 23, lastUsed: '2026-02-13T09:15:00Z', source: 'core' },
  { id: 'web-search', name: 'Web Search', description: 'Search the web and retrieve relevant information', category: 'builtin', enabled: true, usageCount: 15, lastUsed: '2026-02-12T18:45:00Z', source: 'core' },
  { id: 'terminal-cmds', name: 'Terminal Commands', description: 'Execute shell commands and manage system processes', category: 'builtin', enabled: true, usageCount: 89, lastUsed: '2026-02-13T11:00:00Z', source: 'core' },
  { id: 'pattern-recog', name: 'Pattern Recognition', description: 'Identify recurring patterns in code and behavior', category: 'learned', enabled: true, usageCount: 12, lastUsed: '2026-02-13T08:20:00Z', source: 'learning-engine' },
  { id: 'error-recovery', name: 'Error Recovery', description: 'Automatically recover from common error scenarios', category: 'learned', enabled: true, usageCount: 8, lastUsed: '2026-02-11T14:30:00Z', source: 'learning-engine' },
  { id: 'api-integration', name: 'API Integration', description: 'Connect to third-party APIs and manage endpoints', category: 'community', enabled: false, usageCount: 3, lastUsed: '2026-02-10T16:00:00Z', source: 'marketplace' },
  { id: 'doc-writer', name: 'Documentation Writer', description: 'Generate and maintain project documentation', category: 'community', enabled: true, usageCount: 5, lastUsed: '2026-02-12T12:00:00Z', source: 'marketplace' },
];

export default function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>(INITIAL_SKILLS);
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const handleToggle = useCallback((skillId: string) => {
    setSkills(prev =>
      prev.map(s => {
        if (s.id !== skillId) return s;
        const newEnabled = !s.enabled;
        // Attempt IPC call if available
        const electron = (window as unknown as Record<string, unknown>).electron as
          | { toggleSkill?: (id: string, enabled: boolean) => void }
          | undefined;
        if (electron?.toggleSkill) {
          electron.toggleSkill(s.id, newEnabled);
        }
        return { ...s, enabled: newEnabled };
      })
    );
  }, []);

  const totalCount = skills.length;
  const activeCount = skills.filter(s => s.enabled).length;
  const learnedCount = skills.filter(s => s.category === 'learned').length;

  const filtered = filter === 'all' ? skills : skills.filter(s => s.category === filter);

  const TABS: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'builtin', label: 'Builtin' },
    { key: 'learned', label: 'Learned' },
    { key: 'community', label: 'Community' },
  ];

  return (
    <div className="space-y-4" role="region" aria-label="Skills management panel">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <SGMetricCard label="Total Skills" value={String(totalCount)} color="var(--sg-text-1)" />
        <SGMetricCard label="Active" value={String(activeCount)} color="var(--sg-emerald)" />
        <SGMetricCard label="Learned" value={String(learnedCount)} color="var(--sg-violet)" />
      </div>

      {/* Category filter tabs */}
      <div className="sg-tabs" role="tablist" aria-label="Filter skills by category">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            className={`sg-tab ${filter === t.key ? 'active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Skills list */}
      {filtered.length === 0 ? (
        <SGEmptyState icon="&#x1F9E9;" message={`No ${filter} skills available`} />
      ) : (
        <div className="space-y-2" role="list" aria-label="Skills list">
          {filtered.map(skill => (
            <div
              key={skill.id}
              className="sg-card flex items-center justify-between py-2"
              role="listitem"
              aria-label={`${skill.name} skill, ${skill.enabled ? 'enabled' : 'disabled'}`}
            >
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="font-bold truncate"
                    style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}
                  >
                    {skill.name}
                  </span>
                  <SGBadge variant={CATEGORY_BADGE_VARIANT[skill.category]}>
                    {skill.category}
                  </SGBadge>
                </div>
                <div
                  className="truncate"
                  style={{ color: 'var(--sg-text-3)', fontSize: '0.75rem' }}
                >
                  {skill.description}
                </div>
                <div style={{ color: 'var(--sg-text-4)', fontSize: '0.688rem', marginTop: '2px' }}>
                  {skill.usageCount} uses &middot; {skill.source}
                </div>
              </div>

              <button
                onClick={() => handleToggle(skill.id)}
                aria-label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
                className="sg-btn sg-btn-ghost flex-shrink-0"
                style={{
                  width: '2.75rem',
                  height: '1.5rem',
                  borderRadius: '9999px',
                  padding: 0,
                  position: 'relative',
                  backgroundColor: skill.enabled ? 'var(--sg-emerald)' : 'var(--sg-surface-2)',
                  transition: 'background-color 150ms ease',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: '1.1rem',
                    height: '1.1rem',
                    borderRadius: '9999px',
                    backgroundColor: 'var(--sg-text-1)',
                    position: 'absolute',
                    top: '0.2rem',
                    left: skill.enabled ? '1.45rem' : '0.2rem',
                    transition: 'left 150ms ease',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
