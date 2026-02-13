/**
 * PanelSystemProvider — global state for the dockable, resizable layout.
 *
 * Responsibilities:
 *  - Holds the full LayoutState (zones, locked, presetId)
 *  - Persists to localStorage on every change (debounced)
 *  - Exposes actions for zones, panels, presets, and lock/unlock
 *  - Wraps the app so all children can read / mutate layout state
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  LayoutState,
  LayoutZone,
  PanelId,
  PanelSystemContextValue,
  ZoneState,
} from './types';
import { LAYOUT_STORAGE_KEY, DEFAULT_PRESET_ID } from './types';
import { PANEL_REGISTRY } from './PanelRegistry';
import {
  LAYOUT_PRESETS,
  getDefaultPreset,
  getPresetById,
} from './PanelLayoutPresets';
import { useLayoutShortcuts } from './useLayoutShortcuts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadLayout(): LayoutState | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LayoutState;
  } catch {
    return null;
  }
}

function saveLayout(state: LayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

function buildDefaultLayout(): LayoutState {
  const preset = getDefaultPreset();
  return {
    zones: { ...preset.zones },
    presetId: DEFAULT_PRESET_ID,
    locked: true,
  };
}

// ---------------------------------------------------------------------------
// Internal bridge — renders nothing, just activates keyboard shortcuts.
// Must live *inside* the Provider so usePanelSystem() can read context.
// ---------------------------------------------------------------------------

function ShortcutsBridge() {
  useLayoutShortcuts();
  return null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PanelSystemContext = createContext<PanelSystemContextValue | null>(null);

export function usePanelSystem(): PanelSystemContextValue {
  const ctx = useContext(PanelSystemContext);
  if (!ctx) {
    throw new Error('usePanelSystem must be used within <PanelSystemProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PanelSystemProviderProps {
  children: React.ReactNode;
  /** Override initial layout (useful for tests) */
  initialLayout?: LayoutState;
}

export function PanelSystemProvider({ children, initialLayout }: PanelSystemProviderProps) {
  // Initialise from localStorage → fallback to default preset
  const [layout, setLayout] = useState<LayoutState>(
    () => initialLayout ?? loadLayout() ?? buildDefaultLayout()
  );

  // Debounced persistence
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveLayout(layout), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [layout]);

  // ── Zone Actions ─────────────────────────────────────────────────────

  const updateZone = useCallback((zone: LayoutZone, update: Partial<ZoneState>) => {
    setLayout((prev) => ({
      ...prev,
      presetId: 'custom',
      zones: {
        ...prev.zones,
        [zone]: { ...prev.zones[zone], ...update },
      },
    }));
  }, []);

  const toggleZoneCollapsed = useCallback((zone: LayoutZone) => {
    setLayout((prev) => ({
      ...prev,
      presetId: 'custom',
      zones: {
        ...prev.zones,
        [zone]: { ...prev.zones[zone], collapsed: !prev.zones[zone].collapsed },
      },
    }));
  }, []);

  const toggleZoneVisible = useCallback((zone: LayoutZone) => {
    setLayout((prev) => ({
      ...prev,
      presetId: 'custom',
      zones: {
        ...prev.zones,
        [zone]: { ...prev.zones[zone], visible: !prev.zones[zone].visible },
      },
    }));
  }, []);

  const setActivePanel = useCallback((zone: LayoutZone, panelId: PanelId) => {
    setLayout((prev) => ({
      ...prev,
      zones: {
        ...prev.zones,
        [zone]: { ...prev.zones[zone], activePanel: panelId },
      },
    }));
  }, []);

  // ── Panel Actions ────────────────────────────────────────────────────

  const movePanel = useCallback(
    (panelId: PanelId, fromZone: LayoutZone, toZone: LayoutZone) => {
      setLayout((prev) => {
        const from = { ...prev.zones[fromZone] };
        const to = { ...prev.zones[toZone] };
        from.panels = from.panels.filter((p) => p !== panelId);
        to.panels = [...to.panels, panelId];
        if (!to.visible) to.visible = true;
        if (to.collapsed) to.collapsed = false;
        to.activePanel = panelId;
        return {
          ...prev,
          presetId: 'custom',
          zones: { ...prev.zones, [fromZone]: from, [toZone]: to },
        };
      });
    },
    []
  );

  const togglePanel = useCallback((panelId: PanelId) => {
    setLayout((prev) => {
      const newZones = { ...prev.zones };
      // Find which zone currently has this panel
      for (const zoneKey of Object.keys(newZones) as LayoutZone[]) {
        const z = newZones[zoneKey];
        if (z.panels.includes(panelId)) {
          // Remove it
          newZones[zoneKey] = {
            ...z,
            panels: z.panels.filter((p) => p !== panelId),
          };
          // If zone is now empty, hide it (except center)
          if (newZones[zoneKey].panels.length === 0 && zoneKey !== 'center') {
            newZones[zoneKey].visible = false;
          }
          return { ...prev, presetId: 'custom', zones: newZones };
        }
      }
      // Not found — add to its default zone
      const config = PANEL_REGISTRY[panelId];
      if (config) {
        const dz = config.defaultZone;
        newZones[dz] = {
          ...newZones[dz],
          panels: [...newZones[dz].panels, panelId],
          visible: true,
          collapsed: false,
          activePanel: panelId,
        };
      }
      return { ...prev, presetId: 'custom', zones: newZones };
    });
  }, []);

  // ── Preset Actions ───────────────────────────────────────────────────

  const applyPreset = useCallback((presetId: string) => {
    const preset = getPresetById(presetId);
    if (!preset) return;

    if (presetId === 'custom') {
      // Load custom from storage if available
      const saved = loadLayout();
      if (saved && saved.presetId === 'custom') {
        setLayout(saved);
        return;
      }
    }

    setLayout((prev) => ({
      ...prev,
      zones: { ...preset.zones },
      presetId: preset.id,
    }));
  }, []);

  const resetLayout = useCallback(() => {
    const defaultState = buildDefaultLayout();
    setLayout(defaultState);
  }, []);

  const saveCustomLayout = useCallback(() => {
    setLayout((prev) => ({ ...prev, presetId: 'custom' }));
    // Persistence handled by the useEffect
  }, []);

  // ── Lock/Unlock ──────────────────────────────────────────────────────

  const toggleLocked = useCallback(() => {
    setLayout((prev) => ({ ...prev, locked: !prev.locked }));
  }, []);

  const setLocked = useCallback((locked: boolean) => {
    setLayout((prev) => ({ ...prev, locked }));
  }, []);

  // ── Resize handler ───────────────────────────────────────────────────

  const handlePanelResize = useCallback((sizes: number[]) => {
    // This is called by PanelGroup's onLayout with [leftSize, centerSize, rightSize?]
    // We map array indices to zone names based on visibility
    setLayout((prev) => {
      const visibleZones: LayoutZone[] = [];
      if (prev.zones.left.visible && !prev.zones.left.collapsed) visibleZones.push('left');
      visibleZones.push('center'); // always visible
      if (prev.zones.right.visible && !prev.zones.right.collapsed) visibleZones.push('right');

      const newZones = { ...prev.zones };
      sizes.forEach((size, i) => {
        const zoneKey = visibleZones[i];
        if (zoneKey) {
          newZones[zoneKey] = { ...newZones[zoneKey], sizePercent: size };
        }
      });

      return { ...prev, presetId: 'custom', zones: newZones };
    });
  }, []);

  // ── Query helpers ────────────────────────────────────────────────────

  const isPanelVisible = useCallback(
    (panelId: PanelId): boolean => {
      return Object.values(layout.zones).some(
        (z) => z.visible && !z.collapsed && z.panels.includes(panelId)
      );
    },
    [layout]
  );

  const getPanelZone = useCallback(
    (panelId: PanelId): LayoutZone | null => {
      for (const [zoneKey, z] of Object.entries(layout.zones)) {
        if (z.panels.includes(panelId)) return zoneKey as LayoutZone;
      }
      return null;
    },
    [layout]
  );

  // ── Context value ────────────────────────────────────────────────────

  const value = useMemo<PanelSystemContextValue>(
    () => ({
      layout,
      isLocked: layout.locked,
      panels: PANEL_REGISTRY,
      presets: LAYOUT_PRESETS,
      // Actions
      updateZone,
      toggleZoneCollapsed,
      toggleZoneVisible,
      setActivePanel,
      movePanel,
      togglePanel,
      applyPreset,
      toggleLocked,
      setLocked,
      resetLayout,
      saveCustomLayout,
      handlePanelResize,
      // Queries
      isPanelVisible,
      getPanelZone,
    }),
    [
      layout,
      updateZone,
      toggleZoneCollapsed,
      toggleZoneVisible,
      setActivePanel,
      movePanel,
      togglePanel,
      applyPreset,
      toggleLocked,
      setLocked,
      resetLayout,
      saveCustomLayout,
      handlePanelResize,
      isPanelVisible,
      getPanelZone,
    ]
  );

  return (
    <PanelSystemContext.Provider value={value}>
      <ShortcutsBridge />
      {children}
    </PanelSystemContext.Provider>
  );
}

export default PanelSystemProvider;
