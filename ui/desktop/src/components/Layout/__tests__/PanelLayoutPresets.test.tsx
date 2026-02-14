import { describe, it, expect } from 'vitest';
import {
  LAYOUT_PRESETS,
  PRESET_FOCUS,
  PRESET_STANDARD,
  PRESET_FULL,
  PRESET_AGENT,
  PRESET_CUSTOM,
  getPresetById,
  getDefaultPreset,
  buildZonesFromPreset,
} from '../PanelSystem/PanelLayoutPresets';

describe('PanelLayoutPresets', () => {
  it('has 5 presets', () => {
    expect(LAYOUT_PRESETS.length).toBe(5);
  });

  it('each preset has required fields', () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      // lucide-react icons are ForwardRef objects, not plain functions
      expect(preset.icon).toBeDefined();
      expect(preset.icon).not.toBeNull();
      expect(preset.zones).toBeDefined();
      expect(preset.zones.left).toBeDefined();
      expect(preset.zones.center).toBeDefined();
      expect(preset.zones.right).toBeDefined();
      expect(preset.zones.bottom).toBeDefined();
    }
  });

  it('focus preset hides all panels except center', () => {
    expect(PRESET_FOCUS.zones.left.visible).toBe(false);
    expect(PRESET_FOCUS.zones.center.visible).toBe(true);
    expect(PRESET_FOCUS.zones.right.visible).toBe(false);
    expect(PRESET_FOCUS.zones.bottom.visible).toBe(false);
    expect(PRESET_FOCUS.zones.center.panels).toContain('chat');
  });

  it('standard preset shows sidebar + chat + agent panel + pipeline', () => {
    expect(PRESET_STANDARD.zones.left.visible).toBe(true);
    expect(PRESET_STANDARD.zones.left.panels).toContain('sidebar');
    expect(PRESET_STANDARD.zones.center.panels).toContain('chat');
    expect(PRESET_STANDARD.zones.bottom.panels).toContain('pipeline');
    expect(PRESET_STANDARD.zones.right.visible).toBe(true);
    expect(PRESET_STANDARD.zones.right.panels).toContain('agentPanel');
    expect(PRESET_STANDARD.zones.right.panels).toContain('superGoose');
  });

  it('full preset shows all zones', () => {
    expect(PRESET_FULL.zones.left.visible).toBe(true);
    expect(PRESET_FULL.zones.center.visible).toBe(true);
    expect(PRESET_FULL.zones.right.visible).toBe(true);
    expect(PRESET_FULL.zones.bottom.visible).toBe(true);
    expect(PRESET_FULL.zones.right.panels).toContain('agentPanel');
  });

  it('agent preset has agent panels in right zone', () => {
    expect(PRESET_AGENT.zones.right.panels).toContain('agentPanel');
    expect(PRESET_AGENT.zones.right.panels).toContain('superGoose');
  });

  it('all preset zone sizes are positive or zero', () => {
    for (const preset of LAYOUT_PRESETS) {
      for (const zone of Object.values(preset.zones)) {
        expect(zone.sizePercent).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('center zone is never collapsed in any preset', () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(preset.zones.center.collapsed).toBe(false);
      expect(preset.zones.center.visible).toBe(true);
    }
  });

  it('getPresetById returns correct preset', () => {
    expect(getPresetById('focus')).toBe(PRESET_FOCUS);
    expect(getPresetById('standard')).toBe(PRESET_STANDARD);
    expect(getPresetById('full')).toBe(PRESET_FULL);
    expect(getPresetById('agent')).toBe(PRESET_AGENT);
    expect(getPresetById('custom')).toBe(PRESET_CUSTOM);
  });

  it('getPresetById returns undefined for unknown id', () => {
    expect(getPresetById('nonexistent')).toBeUndefined();
  });

  it('getDefaultPreset returns standard', () => {
    const preset = getDefaultPreset();
    expect(preset.id).toBe('standard');
  });

  it('buildZonesFromPreset returns preset zones without overrides', () => {
    const zones = buildZonesFromPreset(PRESET_STANDARD);
    expect(zones.left.panels).toContain('sidebar');
    expect(zones.center.panels).toContain('chat');
  });

  it('buildZonesFromPreset applies overrides', () => {
    const zones = buildZonesFromPreset(PRESET_STANDARD, {
      left: { sizePercent: 25 },
    });
    expect(zones.left.sizePercent).toBe(25);
    // Other zones should be unchanged
    expect(zones.center.panels).toContain('chat');
  });

  it('custom preset falls back to standard zones', () => {
    // Custom preset zones should match standard as a fallback
    expect(PRESET_CUSTOM.zones.left.panels).toContain('sidebar');
    expect(PRESET_CUSTOM.zones.center.panels).toContain('chat');
  });
});
