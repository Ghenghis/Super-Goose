import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LinkType = 'extension' | 'recipe' | 'config';
type ExtensionType = 'stdio' | 'streamable_http';

interface EnvVar {
  key: string;
  value: string;
}

interface ExtensionForm {
  name: string;
  type: ExtensionType;
  command: string;
  envVars: EnvVar[];
}

interface RecipeForm {
  title: string;
  description: string;
  instructions: string;
  prompt: string;
  extensions: string;
}

interface ConfigForm {
  provider: string;
  model: string;
  temperature: string;
  extensions: string;
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function buildExtensionUrl(form: ExtensionForm): string {
  const params = new URLSearchParams();
  if (form.name) params.set('name', form.name);
  params.set('type', form.type);
  if (form.command) params.set('cmd', form.command);
  form.envVars.forEach(({ key, value }) => {
    if (key) params.set(`env_${key}`, value);
  });
  return `goose://ext?${params.toString()}`;
}

function buildRecipeUrl(form: RecipeForm): string {
  const params = new URLSearchParams();
  if (form.title) params.set('title', form.title);
  if (form.description) params.set('desc', form.description);
  if (form.instructions) params.set('instructions', form.instructions);
  if (form.prompt) params.set('prompt', form.prompt);
  if (form.extensions) params.set('extensions', form.extensions);
  return `goose://recipe?${params.toString()}`;
}

function buildConfigUrl(form: ConfigForm): string {
  const params = new URLSearchParams();
  if (form.provider) params.set('provider', form.provider);
  if (form.model) params.set('model', form.model);
  if (form.temperature) params.set('temp', form.temperature);
  if (form.extensions) params.set('extensions', form.extensions);
  return `goose://config?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Styles (inline, sg-* tokens only)
// ---------------------------------------------------------------------------

const styles = {
  wrapper: {
    background: 'var(--sg-surface)',
    color: 'var(--sg-text-1)',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid var(--sg-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  heading: {
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--sg-gold)',
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '0.25rem',
    borderBottom: '1px solid var(--sg-border)',
    paddingBottom: '0.5rem',
  },
  tab: (active: boolean) => ({
    padding: '0.375rem 0.75rem',
    borderRadius: '0.375rem 0.375rem 0 0',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--sg-text-1)' : 'var(--sg-text-3)',
    background: active ? 'var(--sg-input)' : 'transparent',
    borderBottom: active ? '2px solid var(--sg-indigo)' : '2px solid transparent',
    transition: 'all 0.15s ease',
  }),
  label: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--sg-text-3)',
    marginBottom: '0.25rem',
  },
  input: {
    width: '100%',
    padding: '0.5rem 0.625rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--sg-border)',
    background: 'var(--sg-input)',
    color: 'var(--sg-text-1)',
    fontSize: '0.8125rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    padding: '0.5rem 0.625rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--sg-border)',
    background: 'var(--sg-input)',
    color: 'var(--sg-text-1)',
    fontSize: '0.8125rem',
    resize: 'vertical' as const,
    minHeight: '3.5rem',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  select: {
    padding: '0.5rem 0.625rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--sg-border)',
    background: 'var(--sg-input)',
    color: 'var(--sg-text-1)',
    fontSize: '0.8125rem',
    outline: 'none',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  envRow: {
    display: 'flex',
    gap: '0.375rem',
    alignItems: 'center' as const,
  },
  smallBtn: (variant: 'primary' | 'danger' | 'ghost') => ({
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: variant === 'danger' ? 'var(--sg-red)' : variant === 'primary' ? '#fff' : 'var(--sg-text-3)',
    background: variant === 'primary' ? 'var(--sg-indigo)' : 'transparent',
  }),
  urlBox: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center' as const,
  },
  copyBtn: (copied: boolean) => ({
    padding: '0.375rem 0.75rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#fff',
    background: copied ? 'var(--sg-emerald)' : 'var(--sg-indigo)',
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.2s ease',
  }),
  preview: {
    background: 'var(--sg-card)',
    border: '1px solid var(--sg-border)',
    borderRadius: '0.375rem',
    padding: '0.625rem 0.75rem',
    fontSize: '0.75rem',
    color: 'var(--sg-text-2)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
  },
  sectionTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--sg-text-2)',
    margin: 0,
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeeplinkGenerator() {
  const [linkType, setLinkType] = useState<LinkType>('extension');
  const [copied, setCopied] = useState(false);

  const [ext, setExt] = useState<ExtensionForm>({ name: '', type: 'stdio', command: '', envVars: [] });
  const [recipe, setRecipe] = useState<RecipeForm>({ title: '', description: '', instructions: '', prompt: '', extensions: '' });
  const [config, setConfig] = useState<ConfigForm>({ provider: '', model: '', temperature: '', extensions: '' });

  // -- URL generation --------------------------------------------------------

  const generatedUrl =
    linkType === 'extension' ? buildExtensionUrl(ext) :
    linkType === 'recipe' ? buildRecipeUrl(recipe) :
    buildConfigUrl(config);

  // -- Clipboard -------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }, [generatedUrl]);

  // -- Env var helpers -------------------------------------------------------

  const addEnvVar = () => setExt(prev => ({ ...prev, envVars: [...prev.envVars, { key: '', value: '' }] }));
  const removeEnvVar = (i: number) => setExt(prev => ({ ...prev, envVars: prev.envVars.filter((_, idx) => idx !== i) }));
  const updateEnvVar = (i: number, field: 'key' | 'value', val: string) =>
    setExt(prev => ({ ...prev, envVars: prev.envVars.map((ev, idx) => idx === i ? { ...ev, [field]: val } : ev) }));

  // -- Preview text ----------------------------------------------------------

  const previewText = (): string => {
    if (linkType === 'extension') {
      const lines = [`Extension: ${ext.name || '(unnamed)'}`, `Type: ${ext.type}`, `Command: ${ext.command || '(none)'}`];
      if (ext.envVars.length > 0) lines.push(`Env vars: ${ext.envVars.map(e => `${e.key}=${e.value}`).join(', ')}`);
      return lines.join('\n');
    }
    if (linkType === 'recipe') {
      return [`Recipe: ${recipe.title || '(untitled)'}`, `Description: ${recipe.description || '-'}`, `Extensions: ${recipe.extensions || 'none'}`, `Prompt: ${recipe.prompt || '-'}`].join('\n');
    }
    return [`Provider: ${config.provider || '-'}`, `Model: ${config.model || '-'}`, `Temperature: ${config.temperature || 'default'}`, `Extensions: ${config.extensions || 'none'}`].join('\n');
  };

  // -- Tab data --------------------------------------------------------------

  const tabs: { id: LinkType; label: string }[] = [
    { id: 'extension', label: 'Extension Link' },
    { id: 'recipe', label: 'Recipe Link' },
    { id: 'config', label: 'Config Link' },
  ];

  // -- Render ----------------------------------------------------------------

  return (
    <section style={styles.wrapper} aria-label="Deeplink Generator">
      <h2 style={styles.heading}>Deeplink Generator</h2>

      {/* Tab bar */}
      <div style={styles.tabs} role="tablist" aria-label="Link type selector">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={linkType === t.id}
            aria-controls={`panel-${t.id}`}
            style={styles.tab(linkType === t.id)}
            onClick={() => setLinkType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Extension form */}
      {linkType === 'extension' && (
        <div id="panel-extension" role="tabpanel" aria-label="Extension link form" style={styles.fieldGroup}>
          <div>
            <label style={styles.label} htmlFor="dl-ext-name">Extension name</label>
            <input id="dl-ext-name" style={styles.input} placeholder="my-tool" value={ext.name} onChange={e => setExt(p => ({ ...p, name: e.target.value }))} aria-label="Extension name" />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-ext-type">Type</label>
            <select id="dl-ext-type" style={styles.select} value={ext.type} onChange={e => setExt(p => ({ ...p, type: e.target.value as ExtensionType }))} aria-label="Extension type">
              <option value="stdio">stdio</option>
              <option value="streamable_http">streamable_http</option>
            </select>
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-ext-cmd">Command / URL</label>
            <input id="dl-ext-cmd" style={styles.input} placeholder={ext.type === 'stdio' ? 'my-command --flag' : 'https://example.com/stream'} value={ext.command} onChange={e => setExt(p => ({ ...p, command: e.target.value }))} aria-label="Extension command or URL" />
          </div>
          <div>
            <p style={{ ...styles.sectionTitle, marginBottom: '0.375rem' }}>Environment Variables</p>
            {ext.envVars.map((ev, i) => (
              <div key={i} style={styles.envRow}>
                <input style={{ ...styles.input, flex: 1 }} placeholder="KEY" value={ev.key} onChange={e => updateEnvVar(i, 'key', e.target.value)} aria-label={`Environment variable ${i + 1} key`} />
                <span style={{ color: 'var(--sg-text-4)' }}>=</span>
                <input style={{ ...styles.input, flex: 1 }} placeholder="value" value={ev.value} onChange={e => updateEnvVar(i, 'value', e.target.value)} aria-label={`Environment variable ${i + 1} value`} />
                <button style={styles.smallBtn('danger')} onClick={() => removeEnvVar(i)} aria-label={`Remove variable ${i + 1}`}>X</button>
              </div>
            ))}
            <button style={styles.smallBtn('primary')} onClick={addEnvVar} aria-label="Add environment variable">+ Add var</button>
          </div>
        </div>
      )}

      {/* Recipe form */}
      {linkType === 'recipe' && (
        <div id="panel-recipe" role="tabpanel" aria-label="Recipe link form" style={styles.fieldGroup}>
          <div>
            <label style={styles.label} htmlFor="dl-rec-title">Title</label>
            <input id="dl-rec-title" style={styles.input} placeholder="My Recipe" value={recipe.title} onChange={e => setRecipe(p => ({ ...p, title: e.target.value }))} aria-label="Recipe title" />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-rec-desc">Description</label>
            <textarea id="dl-rec-desc" style={styles.textarea} placeholder="What this recipe does..." value={recipe.description} onChange={e => setRecipe(p => ({ ...p, description: e.target.value }))} aria-label="Recipe description" rows={2} />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-rec-instr">Instructions</label>
            <textarea id="dl-rec-instr" style={styles.textarea} placeholder="Step-by-step instructions for the agent..." value={recipe.instructions} onChange={e => setRecipe(p => ({ ...p, instructions: e.target.value }))} aria-label="Recipe instructions" rows={3} />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-rec-prompt">Initial prompt</label>
            <textarea id="dl-rec-prompt" style={styles.textarea} placeholder="The starting message..." value={recipe.prompt} onChange={e => setRecipe(p => ({ ...p, prompt: e.target.value }))} aria-label="Recipe initial prompt" rows={2} />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-rec-ext">Extensions (comma-separated)</label>
            <input id="dl-rec-ext" style={styles.input} placeholder="developer, jira, github" value={recipe.extensions} onChange={e => setRecipe(p => ({ ...p, extensions: e.target.value }))} aria-label="Recipe extensions" />
          </div>
        </div>
      )}

      {/* Config form */}
      {linkType === 'config' && (
        <div id="panel-config" role="tabpanel" aria-label="Config link form" style={styles.fieldGroup}>
          <div>
            <label style={styles.label} htmlFor="dl-cfg-provider">Provider</label>
            <input id="dl-cfg-provider" style={styles.input} placeholder="openai, anthropic, ollama..." value={config.provider} onChange={e => setConfig(p => ({ ...p, provider: e.target.value }))} aria-label="Config provider" />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-cfg-model">Model</label>
            <input id="dl-cfg-model" style={styles.input} placeholder="gpt-4o, claude-3-opus..." value={config.model} onChange={e => setConfig(p => ({ ...p, model: e.target.value }))} aria-label="Config model" />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-cfg-temp">Temperature</label>
            <input id="dl-cfg-temp" style={styles.input} type="number" step="0.1" min="0" max="2" placeholder="0.7" value={config.temperature} onChange={e => setConfig(p => ({ ...p, temperature: e.target.value }))} aria-label="Config temperature" />
          </div>
          <div>
            <label style={styles.label} htmlFor="dl-cfg-ext">Extensions (comma-separated)</label>
            <input id="dl-cfg-ext" style={styles.input} placeholder="developer, jira, github" value={config.extensions} onChange={e => setConfig(p => ({ ...p, extensions: e.target.value }))} aria-label="Config extensions" />
          </div>
        </div>
      )}

      {/* Generated URL */}
      <div>
        <p style={styles.sectionTitle}>Generated URL</p>
        <div style={{ ...styles.urlBox, marginTop: '0.375rem' }}>
          <input
            readOnly
            style={{ ...styles.input, flex: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}
            value={generatedUrl}
            aria-label="Generated deeplink URL"
            onFocus={e => e.currentTarget.select()}
          />
          <button style={styles.copyBtn(copied)} onClick={handleCopy} aria-label="Copy URL to clipboard">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p style={{ fontSize: '0.6875rem', color: 'var(--sg-text-4)', marginTop: '0.375rem' }}>
          QR code generation available in a future update
        </p>
      </div>

      {/* Preview */}
      <div>
        <p style={styles.sectionTitle}>Preview</p>
        <pre style={{ ...styles.preview, marginTop: '0.375rem' }} aria-label="Link configuration preview">
          {previewText()}
        </pre>
      </div>
    </section>
  );
}
