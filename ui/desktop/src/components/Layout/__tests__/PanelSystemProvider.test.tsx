import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PanelSystemProvider, usePanelSystem } from '../PanelSystem/PanelSystemProvider';
import { LAYOUT_STORAGE_KEY } from '../PanelSystem/types';
import type { LayoutState } from '../PanelSystem/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function wrapper({ children }: { children: React.ReactNode }) {
  return <PanelSystemProvider>{children}</PanelSystemProvider>;
}

describe('PanelSystemProvider', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('provides default layout when no saved state', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.layout).toBeDefined();
    expect(result.current.layout.presetId).toBe('standard');
    expect(result.current.layout.locked).toBe(false);
  });

  it('starts in unlocked mode by default', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.isLocked).toBe(false);
  });

  it('toggles locked state', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.toggleLocked());
    expect(result.current.isLocked).toBe(true);
    act(() => result.current.toggleLocked());
    expect(result.current.isLocked).toBe(false);
  });

  it('sets locked state directly', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.setLocked(false));
    expect(result.current.isLocked).toBe(false);
    act(() => result.current.setLocked(true));
    expect(result.current.isLocked).toBe(true);
  });

  it('has all 4 zones in default layout', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    const { zones } = result.current.layout;
    expect(zones.left).toBeDefined();
    expect(zones.center).toBeDefined();
    expect(zones.right).toBeDefined();
    expect(zones.bottom).toBeDefined();
  });

  it('center zone always has chat panel', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.layout.zones.center.panels).toContain('chat');
    expect(result.current.layout.zones.center.visible).toBe(true);
  });

  it('standard preset has sidebar in left zone', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.layout.zones.left.panels).toContain('sidebar');
  });

  it('toggles zone collapsed state', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    const initialCollapsed = result.current.layout.zones.bottom.collapsed;
    act(() => result.current.toggleZoneCollapsed('bottom'));
    expect(result.current.layout.zones.bottom.collapsed).toBe(!initialCollapsed);
  });

  it('toggles zone visibility', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    const initialVisible = result.current.layout.zones.right.visible;
    act(() => result.current.toggleZoneVisible('right'));
    expect(result.current.layout.zones.right.visible).toBe(!initialVisible);
  });

  it('updates zone state partially', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.updateZone('left', { sizePercent: 20 }));
    expect(result.current.layout.zones.left.sizePercent).toBe(20);
    // Other properties should be preserved
    expect(result.current.layout.zones.left.panels).toContain('sidebar');
  });

  it('marks layout as custom when zone is modified', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.layout.presetId).toBe('standard');
    act(() => result.current.updateZone('left', { sizePercent: 25 }));
    expect(result.current.layout.presetId).toBe('custom');
  });

  it('applies focus preset', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.applyPreset('focus'));
    expect(result.current.layout.presetId).toBe('focus');
    expect(result.current.layout.zones.left.visible).toBe(false);
    expect(result.current.layout.zones.right.visible).toBe(false);
    expect(result.current.layout.zones.bottom.visible).toBe(false);
    expect(result.current.layout.zones.center.visible).toBe(true);
  });

  it('applies full preset', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.applyPreset('full'));
    expect(result.current.layout.presetId).toBe('full');
    expect(result.current.layout.zones.left.visible).toBe(true);
    expect(result.current.layout.zones.right.visible).toBe(true);
    expect(result.current.layout.zones.right.panels).toContain('agentPanel');
  });

  it('applies agent preset', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.applyPreset('agent'));
    expect(result.current.layout.presetId).toBe('agent');
    expect(result.current.layout.zones.right.panels).toContain('agentPanel');
    expect(result.current.layout.zones.right.panels).toContain('superGoose');
  });

  it('resets layout to default', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.applyPreset('focus'));
    expect(result.current.layout.presetId).toBe('focus');
    act(() => result.current.resetLayout());
    expect(result.current.layout.presetId).toBe('standard');
    expect(result.current.layout.locked).toBe(false);
  });

  it('toggles a panel on/off', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    // agentPanel should be in right zone by default (standard preset)
    expect(result.current.isPanelVisible('agentPanel')).toBe(true);
    act(() => result.current.togglePanel('agentPanel'));
    expect(result.current.isPanelVisible('agentPanel')).toBe(false);
    act(() => result.current.togglePanel('agentPanel'));
    expect(result.current.isPanelVisible('agentPanel')).toBe(true);
  });

  it('sets active panel in a zone', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.applyPreset('full'));
    act(() => result.current.setActivePanel('bottom', 'terminal'));
    expect(result.current.layout.zones.bottom.activePanel).toBe('terminal');
  });

  it('returns correct panel zone', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.getPanelZone('sidebar')).toBe('left');
    expect(result.current.getPanelZone('chat')).toBe('center');
    expect(result.current.getPanelZone('pipeline')).toBe('bottom');
  });

  it('returns null for panel not in any zone', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    // In standard preset, search panel is not in any zone
    expect(result.current.getPanelZone('search')).toBeNull();
  });

  it('provides panel registry', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.panels).toBeDefined();
    expect(result.current.panels.sidebar).toBeDefined();
    expect(result.current.panels.chat).toBeDefined();
    expect(result.current.panels.pipeline).toBeDefined();
  });

  it('provides preset list', () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.presets.length).toBe(5);
    const ids = result.current.presets.map((p) => p.id);
    expect(ids).toContain('focus');
    expect(ids).toContain('standard');
    expect(ids).toContain('full');
    expect(ids).toContain('agent');
    expect(ids).toContain('custom');
  });

  it('persists layout to localStorage after debounce', async () => {
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    act(() => result.current.toggleLocked());
    // Wait for debounce (300ms)
    await vi.waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        LAYOUT_STORAGE_KEY,
        expect.any(String)
      );
    }, { timeout: 500 });
  });

  it('loads saved layout from localStorage', () => {
    const saved: LayoutState = {
      zones: {
        left: { panels: ['sidebar'], sizePercent: 20, collapsed: false, visible: true },
        center: { panels: ['chat'], sizePercent: 60, collapsed: false, visible: true },
        right: { panels: ['agentPanel'], sizePercent: 20, collapsed: false, visible: true },
        bottom: { panels: [], sizePercent: 0, collapsed: true, visible: false },
      },
      presetId: 'custom',
      locked: false,
    };
    localStorageMock.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(saved));
    const { result } = renderHook(() => usePanelSystem(), { wrapper });
    expect(result.current.layout.presetId).toBe('custom');
    expect(result.current.isLocked).toBe(false);
    expect(result.current.layout.zones.right.panels).toContain('agentPanel');
  });

  it('accepts initial layout override (for tests)', () => {
    const custom: LayoutState = {
      zones: {
        left: { panels: [], sizePercent: 0, collapsed: true, visible: false },
        center: { panels: ['chat'], sizePercent: 100, collapsed: false, visible: true },
        right: { panels: [], sizePercent: 0, collapsed: true, visible: false },
        bottom: { panels: [], sizePercent: 0, collapsed: true, visible: false },
      },
      presetId: 'focus',
      locked: true,
    };
    function customWrapper({ children }: { children: React.ReactNode }) {
      return <PanelSystemProvider initialLayout={custom}>{children}</PanelSystemProvider>;
    }
    const { result } = renderHook(() => usePanelSystem(), { wrapper: customWrapper });
    expect(result.current.layout.presetId).toBe('focus');
    expect(result.current.layout.zones.left.visible).toBe(false);
  });

  it('throws when used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => usePanelSystem());
    }).toThrow('usePanelSystem must be used within <PanelSystemProvider>');
    spy.mockRestore();
  });
});
