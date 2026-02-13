/**
 * Panel Registry — central catalog of all dockable panels.
 *
 * Each panel is registered with its component, default zone, size constraints,
 * and UI metadata (icon, title). The registry is consumed by PanelSystemProvider
 * to build zone configurations and by the PanelToolbar for visibility toggles.
 */

import {
  PanelLeft,
  MessageSquare,
  Workflow,
  TerminalSquare,
  Bot,
  Sparkles,
  ScrollText,
  Search,
  Bookmark,
} from 'lucide-react';
import type { PanelConfig, PanelId } from './types';

// ---------------------------------------------------------------------------
// Lazy component references
// ---------------------------------------------------------------------------
// We use dynamic imports to avoid circular dependencies.
// Components are resolved at render time by the zone containers.

const LazyPlaceholder = () => null;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PANEL_REGISTRY: Record<PanelId, PanelConfig> = {
  // ── Left Zone ──────────────────────────────────────────────────────────
  sidebar: {
    id: 'sidebar',
    title: 'Sidebar',
    icon: PanelLeft,
    component: LazyPlaceholder, // resolved to AppSidebar in LeftZone
    defaultZone: 'left',
    minSizePercent: 10,
    maxSizePercent: 30,
    collapsible: true,
    closable: false,
    order: 0,
  },

  // ── Center Zone (always visible) ───────────────────────────────────────
  chat: {
    id: 'chat',
    title: 'Chat',
    icon: MessageSquare,
    component: LazyPlaceholder, // resolved to Outlet in CenterZone
    defaultZone: 'center',
    minSizePercent: 30,
    collapsible: false,
    closable: false,
    order: 0,
  },

  // ── Bottom Zone ────────────────────────────────────────────────────────
  pipeline: {
    id: 'pipeline',
    title: 'Pipeline',
    icon: Workflow,
    component: LazyPlaceholder, // resolved to AnimatedPipeline in BottomZone
    defaultZone: 'bottom',
    minSizePercent: 5,
    maxSizePercent: 15,
    collapsible: true,
    closable: true,
    order: 0,
  },

  terminal: {
    id: 'terminal',
    title: 'Terminal',
    icon: TerminalSquare,
    component: LazyPlaceholder, // resolved to EmbeddedTerminal in BottomZone
    defaultZone: 'bottom',
    minSizePercent: 10,
    maxSizePercent: 50,
    collapsible: true,
    closable: true,
    order: 1,
  },

  logs: {
    id: 'logs',
    title: 'Logs',
    icon: ScrollText,
    component: LazyPlaceholder,
    defaultZone: 'bottom',
    minSizePercent: 8,
    maxSizePercent: 40,
    collapsible: true,
    closable: true,
    order: 2,
  },

  // ── Right Zone ─────────────────────────────────────────────────────────
  agentPanel: {
    id: 'agentPanel',
    title: 'Agent',
    icon: Bot,
    component: LazyPlaceholder, // resolved to AgentPanel in RightZone
    defaultZone: 'right',
    minSizePercent: 15,
    maxSizePercent: 40,
    collapsible: true,
    closable: true,
    order: 0,
  },

  superGoose: {
    id: 'superGoose',
    title: 'Super-Goose',
    icon: Sparkles,
    component: LazyPlaceholder, // resolved to SuperGoosePanel in RightZone
    defaultZone: 'right',
    minSizePercent: 15,
    maxSizePercent: 45,
    collapsible: true,
    closable: true,
    order: 1,
  },

  search: {
    id: 'search',
    title: 'Search',
    icon: Search,
    component: LazyPlaceholder,
    defaultZone: 'right',
    minSizePercent: 15,
    maxSizePercent: 35,
    collapsible: true,
    closable: true,
    order: 2,
  },

  bookmarks: {
    id: 'bookmarks',
    title: 'Bookmarks',
    icon: Bookmark,
    component: LazyPlaceholder,
    defaultZone: 'right',
    minSizePercent: 15,
    maxSizePercent: 35,
    collapsible: true,
    closable: true,
    order: 3,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all panels that belong to a specific zone by default */
export function getPanelsForZone(zone: PanelConfig['defaultZone']): PanelConfig[] {
  return Object.values(PANEL_REGISTRY)
    .filter((p) => p.defaultZone === zone)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Get a panel config by id, or undefined if not registered */
export function getPanelConfig(id: PanelId): PanelConfig | undefined {
  return PANEL_REGISTRY[id];
}

/** Get all panel IDs */
export function getAllPanelIds(): PanelId[] {
  return Object.keys(PANEL_REGISTRY) as PanelId[];
}

/** Get all closable panels (for the toolbar toggle list) */
export function getToggleablePanels(): PanelConfig[] {
  return Object.values(PANEL_REGISTRY).filter((p) => p.closable);
}
