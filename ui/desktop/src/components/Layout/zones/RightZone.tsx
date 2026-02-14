/**
 * RightZone — optional right panel for Agent Panel, SuperGoose, search, etc.
 *
 * Supports multiple panels via tabs. When a zone has multiple panels,
 * a tab strip is shown at the top allowing users to switch between them.
 */

import { cn } from '../../../utils';
import { usePanelSystem } from '../PanelSystem/PanelSystemProvider';
import { PANEL_REGISTRY } from '../PanelSystem/PanelRegistry';
import type { PanelId } from '../PanelSystem/types';

interface RightZoneProps {
  /** Fallback content when specific panels aren't resolved */
  children?: React.ReactNode;
  /** Panel components keyed by PanelId */
  panelComponents?: Partial<Record<PanelId, React.ReactNode>>;
  className?: string;
}

export function RightZone({ children, panelComponents, className }: RightZoneProps) {
  const { layout, setActivePanel } = usePanelSystem();
  const zone = layout.zones.right;
  const panels = zone.panels;
  const activePanel = zone.activePanel ?? panels[0];

  if (panels.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('h-full overflow-hidden flex flex-col min-w-0', className)}
      data-testid="right-zone"
    >
      {/* Tab strip — only show when multiple panels */}
      {panels.length > 1 && (
        <div className="flex items-center gap-0 border-b border-border-default bg-background-muted shrink-0">
          {panels.map((panelId) => {
            const config = PANEL_REGISTRY[panelId];
            if (!config) return null;
            const Icon = config.icon;
            const isActive = panelId === activePanel;
            return (
              <button
                key={panelId}
                onClick={() => setActivePanel('right', panelId)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors',
                  isActive
                    ? 'border-text-default text-text-default bg-background-default'
                    : 'border-transparent text-text-muted hover:text-text-default hover:bg-background-medium'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {config.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Active panel content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {panelComponents && activePanel && panelComponents[activePanel]
          ? panelComponents[activePanel]
          : children}
      </div>
    </div>
  );
}

export default RightZone;
