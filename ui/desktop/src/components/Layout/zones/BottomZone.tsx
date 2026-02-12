/**
 * BottomZone — collapsible bottom panel for Pipeline, Terminal, Logs.
 *
 * Features:
 *   - Tab strip for switching between panels
 *   - Collapsible to a thin 32px tab strip
 *   - Pipeline docked here instead of inline in BaseChat
 */

import { cn } from '../../../utils';
import { usePanelSystem } from '../PanelSystem/PanelSystemProvider';
import { PANEL_REGISTRY } from '../PanelSystem/PanelRegistry';
import { BOTTOM_TAB_STRIP_HEIGHT } from '../PanelSystem/types';
import type { PanelId } from '../PanelSystem/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BottomZoneProps {
  /** Panel components keyed by PanelId */
  panelComponents?: Partial<Record<PanelId, React.ReactNode>>;
  /** Fallback content */
  children?: React.ReactNode;
  className?: string;
}

export function BottomZone({ panelComponents, children, className }: BottomZoneProps) {
  const { layout, setActivePanel, toggleZoneCollapsed } = usePanelSystem();
  const zone = layout.zones.bottom;
  const panels = zone.panels;
  const activePanel = zone.activePanel ?? panels[0];
  const isCollapsed = zone.collapsed;

  if (panels.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col border-t border-border-default bg-background-default overflow-hidden',
        className
      )}
      data-testid="bottom-zone"
    >
      {/* Tab strip — always visible, acts as collapse toggle when clicked */}
      <div
        className="flex items-center gap-0 bg-background-muted shrink-0"
        style={{ height: BOTTOM_TAB_STRIP_HEIGHT }}
      >
        {panels.map((panelId) => {
          const config = PANEL_REGISTRY[panelId];
          if (!config) return null;
          const Icon = config.icon;
          const isActive = panelId === activePanel;
          return (
            <button
              key={panelId}
              onClick={() => {
                if (isCollapsed) {
                  toggleZoneCollapsed('bottom');
                }
                setActivePanel('bottom', panelId);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 text-xs border-b-2 transition-colors',
                isActive && !isCollapsed
                  ? 'border-text-default text-text-default'
                  : 'border-transparent text-text-muted hover:text-text-default hover:bg-background-medium'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {config.title}
            </button>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse/Expand toggle */}
        <button
          onClick={() => toggleZoneCollapsed('bottom')}
          className="p-1 mr-1 rounded text-text-muted hover:text-text-default hover:bg-background-medium transition-colors"
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Panel content — hidden when collapsed */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-auto">
          {panelComponents && activePanel && panelComponents[activePanel]
            ? panelComponents[activePanel]
            : children}
        </div>
      )}
    </div>
  );
}

export default BottomZone;
