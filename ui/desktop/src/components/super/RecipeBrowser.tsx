import { useState, useMemo } from 'react';
import { SGEmptyState } from './shared';

interface Recipe {
  id: string;
  title: string;
  description: string;
  author: string;
  category: 'development' | 'devops' | 'data' | 'productivity' | 'creative';
  extensions: string[];
  instructions: string;
  prompt: string;
  stars: number;
}

const CATEGORIES = ['all', 'development', 'devops', 'data', 'productivity', 'creative'] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

const CATEGORY_BADGE: Record<Recipe['category'], { variant: string; label: string }> = {
  development: { variant: 'sg-badge-violet', label: 'Development' },
  devops: { variant: 'sg-badge-sky', label: 'DevOps' },
  data: { variant: 'sg-badge-emerald', label: 'Data' },
  productivity: { variant: 'sg-badge-gold', label: 'Productivity' },
  creative: { variant: 'sg-badge-red', label: 'Creative' },
};

const SAMPLE_RECIPES: Recipe[] = [
  {
    id: 'docker-env',
    title: 'Docker Environment Setup',
    description: 'Spin up containerized development environments with Docker Compose, including database services and hot-reload.',
    author: 'blockeng',
    category: 'devops',
    extensions: ['docker', 'shell', 'file-editor'],
    instructions: 'Analyze the project structure, generate a Dockerfile and docker-compose.yml, configure volumes for hot-reload.',
    prompt: 'Set up a Docker development environment for this project.',
    stars: 142,
  },
  {
    id: 'code-review',
    title: 'Code Review Assistant',
    description: 'Review pull requests and code changes against best practices, security patterns, and team conventions.',
    author: 'supergoose',
    category: 'development',
    extensions: ['git', 'file-editor', 'linter'],
    instructions: 'Fetch the diff, analyze each changed file for bugs, security issues, and style violations.',
    prompt: 'Review my latest changes and suggest improvements.',
    stars: 238,
  },
  {
    id: 'data-pipeline',
    title: 'Data Pipeline Builder',
    description: 'Build extract-transform-load pipelines with validation, error handling, and scheduling support.',
    author: 'dataops',
    category: 'data',
    extensions: ['python', 'database', 'file-editor'],
    instructions: 'Identify data sources, design schema transformations, generate pipeline code with retry logic.',
    prompt: 'Build an ETL pipeline for ingesting CSV data into PostgreSQL.',
    stars: 97,
  },
  {
    id: 'meeting-notes',
    title: 'Meeting Notes Generator',
    description: 'Generate structured meeting summaries with action items, decisions, and follow-up tasks from transcripts.',
    author: 'prodtools',
    category: 'productivity',
    extensions: ['file-editor', 'calendar'],
    instructions: 'Parse transcript, extract key decisions, identify action items with owners and deadlines.',
    prompt: 'Summarize today\'s standup meeting notes.',
    stars: 185,
  },
  {
    id: 'api-docs',
    title: 'API Documentation Writer',
    description: 'Generate OpenAPI specs and developer-friendly documentation from existing code and route definitions.',
    author: 'blockeng',
    category: 'development',
    extensions: ['file-editor', 'shell', 'git'],
    instructions: 'Scan route handlers, extract request/response types, generate OpenAPI 3.0 YAML with examples.',
    prompt: 'Generate API documentation for all routes in this project.',
    stars: 163,
  },
  {
    id: 'creative-writing',
    title: 'Creative Writing Coach',
    description: 'Get feedback on tone, pacing, dialogue, and narrative structure for fiction and non-fiction writing.',
    author: 'creativelabs',
    category: 'creative',
    extensions: ['file-editor'],
    instructions: 'Analyze writing style, suggest improvements for clarity and engagement, flag passive voice.',
    prompt: 'Review my draft and provide feedback on narrative flow.',
    stars: 74,
  },
];

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </svg>
  );
}

function ExtensionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export default function RecipeBrowser() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return SAMPLE_RECIPES.filter((r) => {
      const matchCategory = activeCategory === 'all' || r.category === activeCategory;
      const matchSearch =
        !query || r.title.toLowerCase().includes(query) || r.description.toLowerCase().includes(query);
      return matchCategory && matchSearch;
    });
  }, [activeCategory, search]);

  const handleLaunch = (recipe: Recipe) => {
    const electron = (window as unknown as Record<string, unknown>).electron as
      | { launchRecipe?: (r: Recipe) => void }
      | undefined;
    if (electron?.launchRecipe) {
      electron.launchRecipe(recipe);
    } else {
      setToastMessage(`Launching "${recipe.title}"...`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  return (
    <div className="space-y-4" role="region" aria-label="Recipe Browser">
      {/* Category filter tabs */}
      <div className="sg-tabs" role="tablist" aria-label="Recipe categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            className={`sg-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          aria-label="Search recipes"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--sg-border)',
            background: 'var(--sg-input)',
            color: 'var(--sg-text-1)',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
      </div>

      {/* Recipe cards grid */}
      {filtered.length === 0 ? (
        <SGEmptyState icon="📦" message="No recipes match your filter. Try a different category or search." />
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          role="list"
          aria-label="Recipe list"
        >
          {filtered.map((recipe) => {
            const badge = CATEGORY_BADGE[recipe.category];
            return (
              <div key={recipe.id} className="sg-card" role="listitem" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ color: 'var(--sg-text-1)', fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>
                    {recipe.title}
                  </h3>
                  <span className={`sg-badge ${badge.variant}`} style={{ flexShrink: 0, marginLeft: '0.5rem' }}>
                    {badge.label}
                  </span>
                </div>

                {/* Description */}
                <p
                  style={{
                    color: 'var(--sg-text-3)',
                    fontSize: '0.8125rem',
                    lineHeight: 1.5,
                    margin: '0 0 0.75rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {recipe.description}
                </p>

                {/* Meta row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginTop: 'auto',
                    marginBottom: '0.75rem',
                    color: 'var(--sg-text-4)',
                    fontSize: '0.75rem',
                  }}
                >
                  <span aria-label={`Author: ${recipe.author}`}>@{recipe.author}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} aria-label={`${recipe.extensions.length} extensions`}>
                    <ExtensionIcon /> {recipe.extensions.length}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--sg-gold)' }} aria-label={`${recipe.stars} stars`}>
                    <StarIcon /> {recipe.stars}
                  </span>
                </div>

                {/* Launch button */}
                <button
                  className="sg-btn sg-btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => handleLaunch(recipe)}
                  aria-label={`Launch ${recipe.title}`}
                >
                  Launch
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            background: 'var(--sg-card)',
            border: '1px solid var(--sg-indigo)',
            color: 'var(--sg-text-1)',
            padding: '0.75rem 1.25rem',
            borderRadius: '0.5rem',
            fontSize: '0.8125rem',
            boxShadow: 'var(--sg-shadow-lg)',
            zIndex: 9999,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
