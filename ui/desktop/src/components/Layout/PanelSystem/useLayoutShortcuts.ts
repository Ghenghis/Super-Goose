/**
 * useLayoutShortcuts — keyboard shortcuts for the PanelSystem.
 *
 * Shortcuts (Cmd on Mac, Ctrl on Windows/Linux):
 *   Mod+Shift+L  Toggle layout lock/unlock
 *   Mod+1        Apply 'focus' preset
 *   Mod+2        Apply 'standard' preset
 *   Mod+3        Apply 'full' preset
 *   Mod+4        Apply 'agent' preset
 *   Mod+5        Apply 'custom' preset
 *   Mod+B        Toggle left zone (sidebar) visibility
 *   Mod+J        Toggle bottom zone visibility
 */

import { useEffect } from 'react';
import { usePanelSystem } from './PanelSystemProvider';

const PRESET_BY_KEY: Record<string, string> = {
  '1': 'focus',
  '2': 'standard',
  '3': 'full',
  '4': 'agent',
  '5': 'custom',
};

export function useLayoutShortcuts(): void {
  const { toggleLocked, applyPreset, toggleZoneVisible, toggleZoneCollapsed } = usePanelSystem();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ctrl/Cmd + Shift + L  =>  toggle lock
      if (e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLocked();
        return;
      }

      // Ctrl/Cmd + 1-5  =>  apply preset
      const preset = PRESET_BY_KEY[e.key];
      if (preset && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        applyPreset(preset);
        return;
      }

      // Ctrl/Cmd + B  =>  toggle left zone collapsed (sidebar icon-only)
      if (e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleZoneCollapsed('left');
        return;
      }

      // Ctrl/Cmd + J  =>  toggle bottom zone
      if (e.key.toLowerCase() === 'j' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleZoneVisible('bottom');
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleLocked, applyPreset, toggleZoneVisible, toggleZoneCollapsed]);
}
