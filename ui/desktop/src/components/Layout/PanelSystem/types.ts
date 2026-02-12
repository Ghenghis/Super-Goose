/**
 * Super-Goose Panel System Types
 *
 * Defines the dockable, resizable, customizable layout system.
 * Uses react-resizable-panels for the underlying split-pane mechanics.
 */

import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Zone & Panel Identifiers
// ---------------------------------------------------------------------------

/** Layout zones where panels can be docked */
export type LayoutZone = 'left' | 'center' | 'right' | 'bottom';

/** Unique panel identifiers */
export type PanelId =
  | 'sidebar'
  | 'chat'
  | 'pipeline'
  | 'terminal'
  | 'agentPanel'
  | 'superGoose'
  | 'logs'
  | 'search'
  | 'bookmarks';

// ---------------------------------------------------------------------------
// Panel Configuration
// ---------------------------------------------------------------------------

/** Static definition of a registrable panel */
export interface PanelConfig {
  /** Unique identifier */
  id: PanelId;
  /** Display name shown in panel header */
  title: string;
  /** Lucide icon component for tabs/toolbar */
  icon: ComponentType<{ className?: string }>;
  /** The React component to render inside this panel */
  component: ComponentType<Record<string, unknown>>;
  /** Which zone this panel lives in by default */
  defaultZone: LayoutZone;
  /** Minimum size in percentage of parent PanelGroup */
  minSizePercent?: number;
  /** Maximum size in percentage of parent PanelGroup */
  maxSizePercent?: number;
  /** Whether this panel can be collapsed to 0 */
  collapsible: boolean;
  /** Whether the user can close (hide) this panel */
  closable: boolean;
  /** Order within its zone's tab strip (lower = first) */
  order?: number;
}

// ---------------------------------------------------------------------------
// Zone Configuration (runtime state)
// ---------------------------------------------------------------------------

/** Runtime state of a single layout zone */
export interface ZoneState {
  /** Which panels are docked here (by id), in tab order */
  panels: PanelId[];
  /** Current size as percentage of the parent PanelGroup */
  sizePercent: number;
  /** Whether this zone is collapsed (0-width/height) */
  collapsed: boolean;
  /** Whether this zone is visible at all */
  visible: boolean;
  /** Which panel tab is active (for zones with multiple panels) */
  activePanel?: PanelId;
}

// ---------------------------------------------------------------------------
// Layout State (full snapshot)
// ---------------------------------------------------------------------------

/** Complete layout snapshot — serializable to localStorage */
export interface LayoutState {
  /** Zone configurations keyed by zone name */
  zones: Record<LayoutZone, ZoneState>;
  /** Which preset this layout is based on (or 'custom') */
  presetId: string;
  /** Whether the layout is locked (no resize handles) */
  locked: boolean;
}

// ---------------------------------------------------------------------------
// Layout Presets
// ---------------------------------------------------------------------------

/** A named layout preset users can switch between */
export interface LayoutPreset {
  /** Unique preset identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description of when to use this preset */
  description: string;
  /** Icon for the preset selector */
  icon: ComponentType<{ className?: string }>;
  /** The zone configuration for this preset */
  zones: Record<LayoutZone, ZoneState>;
}

// ---------------------------------------------------------------------------
// Panel System Context
// ---------------------------------------------------------------------------

/** Actions available through the PanelSystem context */
export interface PanelSystemActions {
  /** Update a zone's state (partial merge) */
  updateZone: (zone: LayoutZone, update: Partial<ZoneState>) => void;
  /** Toggle a zone's collapsed state */
  toggleZoneCollapsed: (zone: LayoutZone) => void;
  /** Toggle a zone's visibility */
  toggleZoneVisible: (zone: LayoutZone) => void;
  /** Set the active panel tab within a zone */
  setActivePanel: (zone: LayoutZone, panelId: PanelId) => void;
  /** Move a panel from one zone to another */
  movePanel: (panelId: PanelId, fromZone: LayoutZone, toZone: LayoutZone) => void;
  /** Show or hide a specific panel */
  togglePanel: (panelId: PanelId) => void;
  /** Apply a layout preset */
  applyPreset: (presetId: string) => void;
  /** Toggle lock/unlock mode */
  toggleLocked: () => void;
  /** Set lock state directly */
  setLocked: (locked: boolean) => void;
  /** Reset layout to default preset */
  resetLayout: () => void;
  /** Save current layout as the custom preset */
  saveCustomLayout: () => void;
  /** Update zone sizes from react-resizable-panels onLayout callback */
  handlePanelResize: (sizes: number[]) => void;
}

/** Full PanelSystem context value */
export interface PanelSystemContextValue extends PanelSystemActions {
  /** Current layout state */
  layout: LayoutState;
  /** Whether layout is locked */
  isLocked: boolean;
  /** All registered panels */
  panels: Record<PanelId, PanelConfig>;
  /** Available presets */
  presets: LayoutPreset[];
  /** Check if a specific panel is currently visible */
  isPanelVisible: (panelId: PanelId) => boolean;
  /** Get the zone a panel is currently in */
  getPanelZone: (panelId: PanelId) => LayoutZone | null;
}

// ---------------------------------------------------------------------------
// Resize Handle
// ---------------------------------------------------------------------------

/** Direction of a resize handle */
export type ResizeDirection = 'horizontal' | 'vertical';

/** Props for the custom resize handle component */
export interface ResizeHandleProps {
  direction: ResizeDirection;
  isLocked: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for persisting layout */
export const LAYOUT_STORAGE_KEY = 'sg-layout-v1';

/** Default preset ID applied on first load */
export const DEFAULT_PRESET_ID = 'standard';

/** Status bar fixed height in pixels */
export const STATUS_BAR_HEIGHT = 28;

/** Panel header height in pixels */
export const PANEL_HEADER_HEIGHT = 32;

/** Bottom zone tab strip height when collapsed */
export const BOTTOM_TAB_STRIP_HEIGHT = 32;
