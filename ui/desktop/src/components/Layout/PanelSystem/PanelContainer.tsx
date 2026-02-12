/**
 * PanelContainer — wrapper around each panel providing:
 *   - Header bar with title, icon, minimize/maximize/close buttons
 *   - Drag grip (when unlocked)
 *   - Collapse animation
 *
 * In locked mode, the header is hidden for the center zone (chat stays clean).
 */

import { GripVertical, Minimize2, Maximize2, X } from 'lucide-react';
import { cn } from '../../../utils';
import type { PanelConfig, LayoutZone } from './types';
import { usePanelSystem } from './PanelSystemProvider';
import { PANEL_HEADER_HEIGHT } from './types';

interface PanelContainerProps {
  config: PanelConfig;
  zone: LayoutZone;
  children: React.ReactNode;
  /** Hide the header entirely (used for center zone in locked mode) */
  hideHeader?: boolean;
  className?: string;
}

export function PanelContainer({
  config,
  zone,
  children,
  hideHeader = false,
  className,
}: PanelContainerProps) {
  const { isLocked, togglePanel, toggleZoneCollapsed } = usePanelSystem();
  const Icon = config.icon;

  const showHeader = !hideHeader && (zone !== 'center' || !isLocked);

  return (
    <div
      className={cn(
        'flex flex-col h-full overflow-hidden',
        'bg-background-default',
        className
      )}
      data-panel-id={config.id}
    >
      {showHeader && (
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 border-b border-border-default',
            'bg-background-muted select-none shrink-0',
            'transition-colors duration-150',
          )}
          style={{ height: PANEL_HEADER_HEIGHT }}
        >
          {/* Drag grip — only when unlocked */}
          {!isLocked && (
            <GripVertical className="w-3.5 h-3.5 text-text-muted cursor-grab opacity-50 hover:opacity-100" />
          )}

          {/* Panel icon + title */}
          <Icon className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-medium text-text-muted truncate flex-1">
            {config.title}
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5">
            {config.collapsible && (
              <button
                onClick={() => toggleZoneCollapsed(zone)}
                className="p-0.5 rounded hover:bg-background-medium text-text-muted hover:text-text-default transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-3 h-3" />
              </button>
            )}
            {config.collapsible && (
              <button
                onClick={() => toggleZoneCollapsed(zone)}
                className="p-0.5 rounded hover:bg-background-medium text-text-muted hover:text-text-default transition-colors"
                title="Maximize"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
            {config.closable && (
              <button
                onClick={() => togglePanel(config.id)}
                className="p-0.5 rounded hover:bg-background-medium text-text-muted hover:text-text-default transition-colors"
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}

export default PanelContainer;
