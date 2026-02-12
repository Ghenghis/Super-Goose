/**
 * StatusBar — extracted from ChatInput's bottom bar area.
 *
 * Always visible at the very bottom of the window. Contains:
 *   - Working directory switcher
 *   - Cost tracker
 *   - Model/provider selector
 *   - Mode selector
 *   - Extension selector
 *   - Layout toolbar (presets, lock/unlock, panel toggles)
 */

import { cn } from '../../../utils';
import { PanelToolbar } from '../PanelSystem/PanelToolbar';
import { STATUS_BAR_HEIGHT } from '../PanelSystem/types';

interface StatusBarProps {
  /** Extra items rendered by the chat context (model bar, cost, etc.) */
  children?: React.ReactNode;
  className?: string;
}

export function StatusBar({ children, className }: StatusBarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 shrink-0',
        'bg-background-default border-t border-border-default',
        'text-xs text-text-muted select-none',
        className
      )}
      style={{ height: STATUS_BAR_HEIGHT }}
      data-testid="status-bar"
    >
      {/* Chat-specific controls (dir, cost, model, mode, extensions) */}
      {children && <div className="flex items-center gap-1 flex-1 min-w-0">{children}</div>}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout controls (presets, lock, panels) */}
      <PanelToolbar />
    </div>
  );
}

export default StatusBar;
