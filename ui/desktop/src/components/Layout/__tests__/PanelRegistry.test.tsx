import { describe, it, expect } from 'vitest';
import {
  PANEL_REGISTRY,
  getPanelsForZone,
  getPanelConfig,
  getAllPanelIds,
  getToggleablePanels,
} from '../PanelSystem/PanelRegistry';

describe('PanelRegistry', () => {
  it('registers all expected panels', () => {
    const ids = getAllPanelIds();
    expect(ids).toContain('sidebar');
    expect(ids).toContain('chat');
    expect(ids).toContain('pipeline');
    expect(ids).toContain('terminal');
    expect(ids).toContain('agentPanel');
    expect(ids).toContain('superGoose');
    expect(ids).toContain('logs');
    expect(ids).toContain('search');
    expect(ids).toContain('bookmarks');
  });

  it('has 9 total panels', () => {
    expect(getAllPanelIds().length).toBe(9);
  });

  it('gets panels for left zone', () => {
    const leftPanels = getPanelsForZone('left');
    expect(leftPanels.length).toBe(1);
    expect(leftPanels[0].id).toBe('sidebar');
  });

  it('gets panels for center zone', () => {
    const centerPanels = getPanelsForZone('center');
    expect(centerPanels.length).toBe(1);
    expect(centerPanels[0].id).toBe('chat');
  });

  it('gets panels for bottom zone', () => {
    const bottomPanels = getPanelsForZone('bottom');
    expect(bottomPanels.length).toBe(3);
    const ids = bottomPanels.map((p) => p.id);
    expect(ids).toContain('pipeline');
    expect(ids).toContain('terminal');
    expect(ids).toContain('logs');
  });

  it('gets panels for right zone', () => {
    const rightPanels = getPanelsForZone('right');
    expect(rightPanels.length).toBe(4);
    const ids = rightPanels.map((p) => p.id);
    expect(ids).toContain('agentPanel');
    expect(ids).toContain('superGoose');
    expect(ids).toContain('search');
    expect(ids).toContain('bookmarks');
  });

  it('sorts panels by order within a zone', () => {
    const bottomPanels = getPanelsForZone('bottom');
    for (let i = 1; i < bottomPanels.length; i++) {
      expect((bottomPanels[i].order ?? 0) >= (bottomPanels[i - 1].order ?? 0)).toBe(true);
    }
  });

  it('returns panel config by id', () => {
    const config = getPanelConfig('pipeline');
    expect(config).toBeDefined();
    expect(config?.title).toBe('Pipeline');
    expect(config?.defaultZone).toBe('bottom');
    expect(config?.collapsible).toBe(true);
  });

  it('returns undefined for unknown panel id', () => {
    // @ts-expect-error testing unknown id
    expect(getPanelConfig('nonexistent')).toBeUndefined();
  });

  it('marks sidebar as not closable', () => {
    expect(PANEL_REGISTRY.sidebar.closable).toBe(false);
  });

  it('marks chat as not closable and not collapsible', () => {
    expect(PANEL_REGISTRY.chat.closable).toBe(false);
    expect(PANEL_REGISTRY.chat.collapsible).toBe(false);
  });

  it('marks pipeline as closable', () => {
    expect(PANEL_REGISTRY.pipeline.closable).toBe(true);
  });

  it('returns toggleable panels (closable ones)', () => {
    const toggleable = getToggleablePanels();
    // sidebar and chat are NOT closable
    expect(toggleable.find((p) => p.id === 'sidebar')).toBeUndefined();
    expect(toggleable.find((p) => p.id === 'chat')).toBeUndefined();
    // pipeline, terminal, agentPanel, etc. ARE closable
    expect(toggleable.find((p) => p.id === 'pipeline')).toBeDefined();
    expect(toggleable.find((p) => p.id === 'agentPanel')).toBeDefined();
  });

  it('all panels have an icon component', () => {
    for (const panel of Object.values(PANEL_REGISTRY)) {
      // lucide-react icons are ForwardRef objects, not plain functions
      expect(panel.icon).toBeDefined();
      expect(panel.icon).not.toBeNull();
    }
  });

  it('all panels have a title', () => {
    for (const panel of Object.values(PANEL_REGISTRY)) {
      expect(panel.title.length).toBeGreaterThan(0);
    }
  });

  it('all panels have minSizePercent defined', () => {
    for (const panel of Object.values(PANEL_REGISTRY)) {
      if (panel.id !== 'chat') {
        expect(panel.minSizePercent).toBeDefined();
        expect(panel.minSizePercent).toBeGreaterThan(0);
      }
    }
  });
});
