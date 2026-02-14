import { useState, useEffect, useCallback } from 'react';
import { backendApi, ExtensionInfo } from '../../utils/backendApi';
import { SGCard, SGBadge, SGEmptyState } from './shared';

/** Core shape returned by backendApi.listCores(). */
interface CoreEntry {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

type TabId = 'browse' | 'my-cores' | 'sell' | 'extensions' | 'community';

export default function MarketplacePanel() {
  const [tab, setTab] = useState<TabId>('browse');

  // -- Data state -------------------------------------------------------------
  const [cores, setCores] = useState<CoreEntry[]>([]);
  const [coresLoading, setCoresLoading] = useState(true);
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(true);
  const [activeCore, setActiveCore] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());

  // -- Fetch cores + config on mount (single effect to prevent race) ----------
  useEffect(() => {
    let cancelled = false;
    setCoresLoading(true);
    Promise.all([
      backendApi.listCores(),
      backendApi.getCoreConfig().catch(() => null),
    ]).then(([coresData, config]) => {
      if (cancelled) return;
      setCores(coresData);
      // Prefer config.preferred_core, fallback to active flag from list
      const activeId = config?.preferred_core
        || coresData.find(c => c.active)?.id
        || null;
      if (activeId) setActiveCore(activeId);
      setCoresLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // -- Fetch extensions on mount ----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setExtensionsLoading(true);
    backendApi.getExtensions().then(data => {
      if (cancelled) return;
      setExtensions(data ?? []);
      setExtensionsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // -- Switch active core (My Cores tab) --------------------------------------
  const handleSwitchCore = useCallback(async (coreId: string) => {
    setSwitching(true);
    const result = await backendApi.switchCore(coreId);
    if (result?.success) {
      setActiveCore(result.active_core);
      // Also update the cores list active flags
      setCores(prev => prev.map(c => ({ ...c, active: c.id === result.active_core })));
    }
    setSwitching(false);
  }, []);

  // -- Toggle extension (Extensions tab) --------------------------------------
  const handleToggleExtension = useCallback(async (key: string, currentEnabled: boolean) => {
    setTogglingKeys(prev => new Set(prev).add(key));
    const ok = await backendApi.toggleExtension(key, !currentEnabled);
    if (ok) {
      setExtensions(prev =>
        prev.map(ext => ext.key === key ? { ...ext, enabled: !currentEnabled } : ext)
      );
    }
    setTogglingKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // -- Tab definitions --------------------------------------------------------
  const TABS: { id: TabId; label: string }[] = [
    { id: 'browse', label: 'Browse' },
    { id: 'my-cores', label: 'My Cores' },
    { id: 'sell', label: 'Sell' },
    { id: 'extensions', label: 'Extensions' },
    { id: 'community', label: 'Community' },
  ];

  return (
    <div className="space-y-4" role="region" aria-label="Marketplace Panel">
      <div className="sg-tabs" role="tablist" aria-label="Marketplace views">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`sg-tab ${tab === t.id ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`marketplace-tabpanel-${t.id}`}
            id={`marketplace-tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Browse tab: Show all available agent cores as cards                 */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'browse' && (
        <div
          className="space-y-3"
          role="tabpanel"
          id="marketplace-tabpanel-browse"
          aria-labelledby="marketplace-tab-browse"
        >
          {coresLoading ? (
            <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
              Loading cores...
            </div>
          ) : cores.length === 0 ? (
            <SGEmptyState message="No cores available in marketplace" />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {cores.map(core => {
                const isActive = core.id === activeCore || core.active;
                return (
                  <SGCard key={core.id} className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div
                        className="font-medium"
                        style={{ color: 'var(--sg-text-1)', fontSize: '0.8125rem' }}
                        data-testid={`core-name-${core.id}`}
                      >
                        {core.name}
                      </div>
                      {isActive && (
                        <SGBadge variant="emerald">Active</SGBadge>
                      )}
                    </div>
                    <div style={{ color: 'var(--sg-text-3)', fontSize: '0.75rem' }}>
                      {core.description}
                    </div>
                  </SGCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* My Cores tab: Active core + switch                                  */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'my-cores' && (
        <div
          className="space-y-3"
          role="tabpanel"
          id="marketplace-tabpanel-my-cores"
          aria-labelledby="marketplace-tab-my-cores"
        >
          {coresLoading ? (
            <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
              Loading cores...
            </div>
          ) : cores.length === 0 ? (
            <SGEmptyState message="No cores configured" />
          ) : (
            <>
              {/* Active core highlight */}
              {activeCore && (
                <SGCard className="p-4" style={{ borderLeft: '3px solid var(--sg-emerald, #34d399)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem', marginBottom: '2px' }}>
                        Currently Active
                      </div>
                      <div className="font-semibold" style={{ color: 'var(--sg-text-1)', fontSize: '0.9375rem' }}>
                        {cores.find(c => c.id === activeCore)?.name ?? activeCore}
                      </div>
                    </div>
                    <SGBadge variant="emerald">Active</SGBadge>
                  </div>
                </SGCard>
              )}

              {/* All cores with switch buttons */}
              {cores.map(core => {
                const isActive = core.id === activeCore;
                return (
                  <div
                    key={core.id}
                    className={`sg-card flex items-center justify-between ${isActive ? 'ring-1 ring-emerald-500/50' : ''}`}
                  >
                    <div>
                      <div className="font-medium" style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>
                        {core.name}
                      </div>
                      <div style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>
                        {core.description}
                      </div>
                    </div>
                    <button
                      data-testid={`switch-core-${core.id}`}
                      className={`sg-btn ${isActive ? 'sg-btn-ghost opacity-50' : 'sg-btn-ghost'}`}
                      style={{ fontSize: '0.75rem' }}
                      disabled={isActive || switching}
                      aria-label={`Switch to ${core.name}`}
                      onClick={() => handleSwitchCore(core.id)}
                    >
                      {isActive ? 'Active' : 'Switch'}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Sell tab: Coming soon with description                              */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'sell' && (
        <div
          role="tabpanel"
          id="marketplace-tabpanel-sell"
          aria-labelledby="marketplace-tab-sell"
        >
          <SGCard className="p-6" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128736;</div>
            <div style={{ color: 'var(--sg-text-1)', fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Core Marketplace -- Coming Soon
            </div>
            <div style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem' }}>
              Create and share your custom agent cores with the community.
            </div>
          </SGCard>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Extensions tab: List with toggle                                    */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'extensions' && (
        <div
          className="space-y-2"
          role="tabpanel"
          id="marketplace-tabpanel-extensions"
          aria-labelledby="marketplace-tab-extensions"
        >
          {extensionsLoading ? (
            <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
              Loading extensions...
            </div>
          ) : extensions.length === 0 ? (
            <SGEmptyState message="No extensions available" />
          ) : (
            extensions.map(ext => (
              <SGCard key={ext.key} className="flex items-center justify-between p-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-medium"
                      style={{ color: 'var(--sg-text-1)', fontSize: '0.8125rem' }}
                      data-testid={`ext-name-${ext.key}`}
                    >
                      {ext.name}
                    </span>
                    <SGBadge variant={ext.type === 'builtin' ? 'indigo' : 'sky'}>
                      {ext.type}
                    </SGBadge>
                  </div>
                  {ext.description && (
                    <div style={{ color: 'var(--sg-text-3)', fontSize: '0.75rem', marginTop: '2px' }}>
                      {ext.description}
                    </div>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={ext.enabled}
                    disabled={togglingKeys.has(ext.key)}
                    data-testid={`ext-toggle-${ext.key}`}
                    aria-label={`Toggle ${ext.name}`}
                    onChange={() => handleToggleExtension(ext.key, ext.enabled)}
                  />
                  <div
                    className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:rounded-full after:h-4 after:w-4 after:transition-all"
                    style={{
                      background: ext.enabled ? 'var(--sg-emerald, #34d399)' : 'var(--sg-surface-3, #555)',
                    }}
                  />
                </label>
              </SGCard>
            ))
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Community tab: Coming soon with GitHub link                         */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'community' && (
        <div
          role="tabpanel"
          id="marketplace-tabpanel-community"
          aria-labelledby="marketplace-tab-community"
        >
          <SGCard className="p-6" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#127760;</div>
            <div style={{ color: 'var(--sg-text-1)', fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Community -- Coming Soon
            </div>
            <div style={{ color: 'var(--sg-text-3)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
              Community contributions and shared resources are on the way.
            </div>
            <a
              href="https://github.com/Ghenghis/Super-Goose"
              target="_blank"
              rel="noopener noreferrer"
              className="sg-btn sg-btn-ghost"
              style={{ fontSize: '0.8125rem', color: 'var(--sg-indigo, #818cf8)' }}
              data-testid="community-github-link"
            >
              Join the Super-Goose community on GitHub
            </a>
          </SGCard>
        </div>
      )}
    </div>
  );
}
