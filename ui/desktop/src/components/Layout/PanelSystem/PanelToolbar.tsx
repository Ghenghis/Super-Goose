/**
 * PanelToolbar — layout mode selector + lock toggle + panel visibility toggles.
 *
 * Renders in the StatusBar area. Provides:
 *   - Preset selector dropdown (Focus / Standard / Full / Agent / Custom)
 *   - Lock/Unlock toggle button
 *   - Panel visibility toggle buttons (only when unlocked)
 */

import { Lock, Unlock, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '../../../utils';
import { usePanelSystem } from './PanelSystemProvider';
import { getToggleablePanels } from './PanelRegistry';

export function PanelToolbar() {
  const {
    layout,
    isLocked,
    presets,
    applyPreset,
    toggleLocked,
    togglePanel,
    isPanelVisible,
    resetLayout,
  } = usePanelSystem();

  const [presetOpen, setPresetOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetOpen(false);
      }
      if (panelsRef.current && !panelsRef.current.contains(e.target as Node)) {
        setPanelsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentPreset = presets.find((p) => p.id === layout.presetId);
  const toggleablePanels = getToggleablePanels();

  return (
    <div className="flex items-center gap-1">
      {/* Preset selector */}
      <div className="relative" ref={presetRef}>
        <button
          onClick={() => setPresetOpen(!presetOpen)}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
            'text-text-muted hover:text-text-default hover:bg-background-medium',
            'transition-colors'
          )}
          title="Layout preset"
        >
          {currentPreset && <currentPreset.icon className="w-3 h-3" />}
          <span className="hidden sm:inline">{currentPreset?.name ?? 'Custom'}</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {presetOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-48 py-1 bg-background-default border border-border-default rounded-lg shadow-lg z-50">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  applyPreset(preset.id);
                  setPresetOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left',
                  'hover:bg-background-medium transition-colors',
                  layout.presetId === preset.id && 'text-text-default font-medium',
                  layout.presetId !== preset.id && 'text-text-muted'
                )}
              >
                <preset.icon className="w-3.5 h-3.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{preset.name}</div>
                  <div className="text-[10px] text-text-muted truncate">{preset.description}</div>
                </div>
              </button>
            ))}
            <div className="border-t border-border-default my-1" />
            <button
              onClick={() => {
                resetLayout();
                setPresetOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-muted hover:bg-background-medium"
            >
              Reset to default
            </button>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-border-default" />

      {/* Lock toggle */}
      <button
        onClick={toggleLocked}
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
          'transition-colors',
          isLocked
            ? 'text-text-muted hover:text-text-default hover:bg-background-medium'
            : 'text-text-default bg-background-medium'
        )}
        title={isLocked ? 'Unlock layout (Ctrl+Shift+L)' : 'Lock layout (Ctrl+Shift+L)'}
      >
        {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        <span className="hidden sm:inline">{isLocked ? 'Locked' : 'Unlocked'}</span>
      </button>

      {/* Panel toggles — only when unlocked */}
      {!isLocked && (
        <>
          <div className="w-px h-4 bg-border-default" />

          <div className="relative" ref={panelsRef}>
            <button
              onClick={() => setPanelsOpen(!panelsOpen)}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                'text-text-muted hover:text-text-default hover:bg-background-medium',
                'transition-colors'
              )}
              title="Toggle panels"
            >
              Panels
              <ChevronDown className="w-3 h-3" />
            </button>

            {panelsOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-44 py-1 bg-background-default border border-border-default rounded-lg shadow-lg z-50">
                {toggleablePanels.map((panel) => {
                  const visible = isPanelVisible(panel.id);
                  return (
                    <button
                      key={panel.id}
                      onClick={() => togglePanel(panel.id)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-1.5 text-xs',
                        'hover:bg-background-medium transition-colors',
                        visible ? 'text-text-default' : 'text-text-muted'
                      )}
                    >
                      <panel.icon className="w-3.5 h-3.5" />
                      <span className="flex-1 text-left">{panel.title}</span>
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          visible ? 'bg-green-500' : 'bg-neutral-400'
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default PanelToolbar;
