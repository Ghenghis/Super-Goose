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

/** Minimum sizePercent thresholds for non-collapsed visible zones */
const MIN_ZONE_SIZES: Record<string, number> = { left: 10, right: 15, bottom: 5 };

/** Default sizePercent values used when a zone needs repair */
const DEFAULT_ZONE_SIZES: Record<string, number> = { left: 18, center: 52, right: 30, bottom: 25 };

/**
 * Validate and repair a loaded layout.
 * Instead of nuking the entire layout when one zone is bad,
 * we repair individual zones to their default sizes.
 */
function validateLayout(state: LayoutState): LayoutState | null {
  try {
    const { zones } = state;
    if (!zones || !zones.left || !zones.center || !zones.right || !zones.bottom) {
      return null; // missing zones — corrupted
    }
    // Ensure center always has positive size
    if (zones.center.sizePercent <= 0) return null;

    // Repair zones that are visible + uncollapsed but have tiny/zero sizePercent
    let repaired = false;
    const fixedZones = { ...zones };
    for (const key of ['left', 'right', 'bottom'] as const) {
      const z = fixedZones[key];
      const minSize = MIN_ZONE_SIZES[key] ?? 5;
      if (z.visible && !z.collapsed && z.panels.length > 0 && z.sizePercent < minSize) {
        console.warn(`[PanelSystem] Repairing zone "${key}": sizePercent=${z.sizePercent}% → ${DEFAULT_ZONE_SIZES[key]}%`);
        fixedZones[key] = { ...z, sizePercent: DEFAULT_ZONE_SIZES[key] ?? minSize };
        repaired = true;
      }
    }

    if (repaired) {
      // Rebalance horizontal sizes to ~100%
      const hVisible = ['left', 'center', 'right'] as const;
      const hSum = hVisible.reduce((sum, k) => {
        const z = fixedZones[k];
        if (k === 'center' || (z.visible && z.panels.length > 0)) return sum + z.sizePercent;
        return sum;
      }, 0);
      if (hSum > 0 && Math.abs(hSum - 100) > 5) {
        // Scale center to absorb the difference
        const nonCenter = (fixedZones.left.visible ? fixedZones.left.sizePercent : 0)
          + (fixedZones.right.visible && fixedZones.right.panels.length > 0 ? fixedZones.right.sizePercent : 0);
        fixedZones.center = { ...fixedZones.center, sizePercent: Math.max(20, 100 - nonCenter) };
      }
      return { ...state, zones: fixedZones };
    }

    return state;
  } catch {
    return null;
  }
}

function loadLayout(): LayoutState | null {
  try {
    // Clean up old layout keys from previous versions
    localStorage.removeItem('sg-layout-v1');
    localStorage.removeItem('sg-layout-v2');
    localStorage.removeItem('sg-layout-v3');
    localStorage.removeItem('sg-layout-v4');
    localStorage.removeItem('sg-layout-v5');
    localStorage.removeItem('sg-layout-v6');
    localStorage.removeItem('sg-layout-v7');
    localStorage.removeItem('sg-layout-v8');
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LayoutState;
    return validateLayout(parsed);
  } catch {
    return null;
  }
}

function saveLayout(state: LayoutState): void {
  try {
    // Safety net: don't persist layouts with broken zone sizes
    const { zones } = state;
    if (zones.center.sizePercent <= 0) return;
    for (const key of ['left', 'right'] as const) {
      const z = zones[key];
      if (z.visible && !z.collapsed && z.panels.length > 0 && z.sizePercent < 3) {
        console.warn(`[PanelSystem] Refusing to save: zone "${key}" has sizePercent=${z.sizePercent}%`);
        return;
      }
    }
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
    locked: false,
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

  // Generation counter — increments on reset/preset apply to force Group remount
  const [layoutGeneration, setLayoutGeneration] = useState(0);

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
        setLayoutGeneration((g) => g + 1);
        return;
      }
    }

    setLayout((prev) => ({
      ...prev,
      zones: { ...preset.zones },
      presetId: preset.id,
    }));
    setLayoutGeneration((g) => g + 1);
  }, []);

  const resetLayout = useCallback(() => {
    const defaultState = buildDefaultLayout();
    setLayout(defaultState);
    setLayoutGeneration((g) => g + 1);
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

  /** Handle horizontal resize (left / center / right) */
  const handlePanelResize = useCallback((sizes: number[]) => {
    // Called by horizontal Group's onLayoutChanged with Layout mapped to array
    // Must match the same visibility check used in ResizableLayout's onHorizontalLayout
    setLayout((prev) => {
      const visibleZones: LayoutZone[] = [];
      // Match ResizableLayout: showLeft = left.visible, showRight = right.visible && right.panels.length > 0
      if (prev.zones.left.visible) visibleZones.push('left');
      visibleZones.push('center'); // always visible
      if (prev.zones.right.visible && prev.zones.right.panels.length > 0) visibleZones.push('right');

      // Guard: if all sizes are NaN or sum is unreasonable, skip this update
      if (sizes.some((s) => isNaN(s)) || sizes.reduce((a, b) => a + b, 0) < 50) {
        return prev;
      }

      const newZones = { ...prev.zones };
      sizes.forEach((size, i) => {
        const zoneKey = visibleZones[i];
        if (!zoneKey) return;
        // If the reported size is 0 (or very close), the panel is collapsed
        // by react-resizable-panels. Preserve the pre-collapse sizePercent
        // so the panel can return to its previous width when uncollapsed.
        if (size < 1 && zoneKey !== 'center') {
          // Mark as collapsed but keep the old sizePercent
          newZones[zoneKey] = { ...newZones[zoneKey], collapsed: true };
        } else {
          newZones[zoneKey] = { ...newZones[zoneKey], sizePercent: size, collapsed: false };
        }
      });

      return { ...prev, presetId: 'custom', zones: newZones };
    });
  }, []);

  /** Handle vertical resize (top content / bottom zone) */
  const handleVerticalResize = useCallback((bottomSizePercent: number) => {
    setLayout((prev) => {
      // If bottom is at its collapsed size (≤5%), mark collapsed but keep old sizePercent
      if (bottomSizePercent <= 5) {
        return {
          ...prev,
          presetId: 'custom',
          zones: {
            ...prev.zones,
            bottom: { ...prev.zones.bottom, collapsed: true },
          },
        };
      }
      return {
        ...prev,
        presetId: 'custom',
        zones: {
          ...prev.zones,
          bottom: { ...prev.zones.bottom, sizePercent: bottomSizePercent, collapsed: false },
        },
      };
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
      layoutGeneration,
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
      handleVerticalResize,
      // Queries
      isPanelVisible,
      getPanelZone,
    }),
    [
      layout,
      layoutGeneration,
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
      handleVerticalResize,
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
