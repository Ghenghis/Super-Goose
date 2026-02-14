/**
 * Layout Presets — predefined zone configurations users can switch between.
 *
 * Presets:
 *   1. Focus    — Chat only, everything hidden
 *   2. Standard — Sidebar + Chat + Bottom pipeline (default)
 *   3. Full     — All zones visible
 *   4. Agent    — Optimised for multi-agent workflows
 *   5. Custom   — User-saved layout
 */

import { Maximize, Layout, LayoutDashboard, Bot, Settings2 } from 'lucide-react';
import type { LayoutPreset, LayoutZone, ZoneState } from './types';

// ---------------------------------------------------------------------------
// Helper to build a zone config
// ---------------------------------------------------------------------------

function zone(
  overrides: Partial<ZoneState> & { panels: ZoneState['panels']; sizePercent: number }
): ZoneState {
  return {
    collapsed: false,
    visible: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const PRESET_FOCUS: LayoutPreset = {
  id: 'focus',
  name: 'Focus',
  description: 'Chat only — zero distractions',
  icon: Maximize,
  zones: {
    left: zone({ panels: [], sizePercent: 0, collapsed: true, visible: false }),
    center: zone({ panels: ['chat'], sizePercent: 100 }),
    right: zone({ panels: [], sizePercent: 0, collapsed: true, visible: false }),
    bottom: zone({ panels: [], sizePercent: 0, collapsed: true, visible: false }),
  },
};

export const PRESET_STANDARD: LayoutPreset = {
  id: 'standard',
  name: 'Standard',
  description: 'Sidebar + Chat + Agent Panel',
  icon: Layout,
  zones: {
    left: zone({ panels: ['sidebar'], sizePercent: 18 }),
    center: zone({ panels: ['chat'], sizePercent: 52 }),
    right: zone({
      panels: ['agentPanel', 'superGoose'],
      sizePercent: 30,
      activePanel: 'agentPanel',
    }),
    bottom: zone({ panels: ['pipeline', 'terminal', 'logs'], sizePercent: 25, activePanel: 'pipeline', collapsed: true }),
  },
};

export const PRESET_FULL: LayoutPreset = {
  id: 'full',
  name: 'Full',
  description: 'All panels visible',
  icon: LayoutDashboard,
  zones: {
    left: zone({ panels: ['sidebar'], sizePercent: 18 }),
    center: zone({ panels: ['chat'], sizePercent: 50 }),
    right: zone({
      panels: ['agentPanel'],
      sizePercent: 32,  // 18+50+32=100
      activePanel: 'agentPanel',
    }),
    bottom: zone({
      panels: ['pipeline', 'terminal', 'logs'],
      sizePercent: 30,
      activePanel: 'pipeline',
    }),
  },
};

export const PRESET_AGENT: LayoutPreset = {
  id: 'agent',
  name: 'Agent',
  description: 'Multi-agent workflows',
  icon: Bot,
  zones: {
    left: zone({ panels: ['sidebar'], sizePercent: 15 }),
    center: zone({ panels: ['chat'], sizePercent: 50 }),
    right: zone({
      panels: ['agentPanel', 'superGoose'],
      sizePercent: 35,
      activePanel: 'agentPanel',
    }),
    bottom: zone({ panels: ['pipeline', 'terminal', 'logs'], sizePercent: 25, activePanel: 'pipeline' }),
  },
};

/** Custom preset — zones are loaded from localStorage, these are just defaults */
export const PRESET_CUSTOM: LayoutPreset = {
  id: 'custom',
  name: 'Custom',
  description: 'Your saved layout',
  icon: Settings2,
  zones: { ...PRESET_STANDARD.zones }, // fallback to Standard if no saved custom layout
};

// ---------------------------------------------------------------------------
// All presets in display order
// ---------------------------------------------------------------------------

export const LAYOUT_PRESETS: LayoutPreset[] = [
  PRESET_FOCUS,
  PRESET_STANDARD,
  PRESET_FULL,
  PRESET_AGENT,
  PRESET_CUSTOM,
];

/** Get a preset by id */
export function getPresetById(id: string): LayoutPreset | undefined {
  return LAYOUT_PRESETS.find((p) => p.id === id);
}

/** Get the default preset */
export function getDefaultPreset(): LayoutPreset {
  return PRESET_STANDARD;
}

/** Build a LayoutState zones record from a preset, overriding specific zones */
export function buildZonesFromPreset(
  preset: LayoutPreset,
  overrides?: Partial<Record<LayoutZone, Partial<ZoneState>>>
): Record<LayoutZone, ZoneState> {
  const zones = { ...preset.zones };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      const z = key as LayoutZone;
      zones[z] = { ...zones[z], ...value };
    }
  }
  return zones;
}
