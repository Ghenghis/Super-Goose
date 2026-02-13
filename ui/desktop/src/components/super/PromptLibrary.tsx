import { useState } from 'react';
import { SGEmptyState } from './shared';

interface PromptTemplate {
  id: string;
  title: string;
  prompt: string;
  category: 'business' | 'technical' | 'productivity' | 'debugging' | 'creative';
  tags: string[];
}

const CATEGORIES = ['all', 'business', 'technical', 'productivity', 'debugging', 'creative'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  business: 'var(--sg-gold)',
  technical: 'var(--sg-indigo)',
  productivity: 'var(--sg-emerald)',
  debugging: 'var(--sg-red)',
  creative: 'var(--sg-violet)',
};

const PROMPTS: PromptTemplate[] = [
  {
    id: 'debug-test',
    title: 'Debug failing test',
    prompt: 'Analyze the failing test output below and identify the root cause. Suggest a fix with minimal code changes and explain why the test was failing.',
    category: 'debugging',
    tags: ['testing', 'fix'],
  },
  {
    id: 'code-review',
    title: 'Code review checklist',
    prompt: 'Review the following code for correctness, performance, security vulnerabilities, and adherence to best practices. Provide actionable feedback organized by severity.',
    category: 'technical',
    tags: ['review', 'quality'],
  },
  {
    id: 'api-docs',
    title: 'Write API documentation',
    prompt: 'Generate comprehensive API documentation for the following endpoints including request/response schemas, authentication requirements, error codes, and usage examples.',
    category: 'technical',
    tags: ['docs', 'api'],
  },
  {
    id: 'refactor-perf',
    title: 'Refactor for performance',
    prompt: 'Analyze this code for performance bottlenecks. Suggest refactoring strategies that improve speed and memory usage while maintaining readability and correctness.',
    category: 'technical',
    tags: ['perf', 'refactor'],
  },
  {
    id: 'release-notes',
    title: 'Draft release notes',
    prompt: 'Based on the recent commits and changelog, draft user-facing release notes organized by features, improvements, and bug fixes. Use clear, non-technical language.',
    category: 'business',
    tags: ['release', 'docs'],
  },
  {
    id: 'unit-tests',
    title: 'Generate unit tests',
    prompt: 'Write comprehensive unit tests for the following code covering happy paths, edge cases, and error scenarios. Use descriptive test names and follow AAA (Arrange-Act-Assert) pattern.',
    category: 'debugging',
    tags: ['testing', 'coverage'],
  },
  {
    id: 'explain-codebase',
    title: 'Explain this codebase',
    prompt: 'Provide a high-level overview of this codebase including architecture, key modules, data flow, and entry points. Identify the main abstractions and how they interact.',
    category: 'productivity',
    tags: ['onboarding', 'architecture'],
  },
  {
    id: 'migration-plan',
    title: 'Create migration plan',
    prompt: 'Create a step-by-step migration plan for upgrading from the current setup to the target version. Include rollback steps, risk assessment, and estimated timeline.',
    category: 'business',
    tags: ['migration', 'planning'],
  },
  {
    id: 'commit-message',
    title: 'Write commit message',
    prompt: 'Write a clear, conventional commit message for the staged changes. Follow the format: type(scope): description. Include a body explaining the why behind the change.',
    category: 'productivity',
    tags: ['git', 'workflow'],
  },
  {
    id: 'design-system',
    title: 'Design system component',
    prompt: 'Design a reusable UI component with props interface, accessibility attributes, responsive behavior, and theme support. Include usage examples and edge case handling.',
    category: 'creative',
    tags: ['ui', 'design'],
  },
];

export default function PromptLibrary() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = activeCategory === 'all'
    ? PROMPTS
    : PROMPTS.filter((p) => p.category === activeCategory);

  const handleCopy = async (template: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(template.prompt);
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard access denied — silently ignore */
    }
  };

  const handleLaunch = (template: PromptTemplate) => {
    const w = window as unknown as Record<string, unknown>;
    const electron = w.electron as Record<string, unknown> | undefined;
    if (electron && typeof electron.sendPrompt === 'function') {
      (electron.sendPrompt as (p: string) => void)(template.prompt);
    }
  };

  return (
    <div className="space-y-4" role="region" aria-label="Prompt Library">
      {/* Tab bar */}
      <nav className="sg-tabs" role="tablist" aria-label="Prompt categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            aria-controls="prompt-list"
            className={`sg-tab${activeCategory === cat ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat)}
            style={{ textTransform: 'capitalize' }}
          >
            {cat}
          </button>
        ))}
      </nav>

      {/* Prompt list */}
      <div id="prompt-list" role="tabpanel" aria-label={`${activeCategory} prompts`}>
        {filtered.length === 0 ? (
          <SGEmptyState message={`No prompts in "${activeCategory}" yet.`} />
        ) : (
          <ul role="list" aria-label="Prompt templates" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filtered.map((tpl) => (
              <li key={tpl.id} className="sg-card" style={{ padding: '0.75rem 1rem' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span
                    style={{
                      color: 'var(--sg-text-1)',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tpl.title}
                  </span>
                  <span
                    style={{
                      color: CATEGORY_COLORS[tpl.category],
                      fontSize: '0.6875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      flexShrink: 0,
                    }}
                  >
                    {tpl.category}
                  </span>
                </div>

                {/* Prompt preview */}
                <p
                  style={{
                    color: 'var(--sg-text-3)',
                    fontSize: '0.8125rem',
                    lineHeight: 1.4,
                    margin: '0.375rem 0 0.5rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {tpl.prompt}
                </p>

                {/* Tags + actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', minWidth: 0 }} aria-label="Tags">
                    {tpl.tags.map((tag) => (
                      <span key={tag} className="sg-badge sg-badge-indigo" style={{ fontSize: '0.625rem' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                    <button
                      className="sg-btn sg-btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      aria-label={copiedId === tpl.id ? 'Copied to clipboard' : `Copy prompt: ${tpl.title}`}
                      onClick={() => handleCopy(tpl)}
                    >
                      {copiedId === tpl.id ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      className="sg-btn sg-btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      aria-label={`Launch prompt: ${tpl.title}`}
                      onClick={() => handleLaunch(tpl)}
                    >
                      Launch
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
