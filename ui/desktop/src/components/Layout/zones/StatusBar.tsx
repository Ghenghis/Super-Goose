/**
 * StatusBar — always-visible bar at the very bottom of the window.
 *
 * Renders:
 *   - BottomMenuModeSelection (mode selector — no props, uses useConfig)
 *   - Layout toolbar (presets, lock/unlock, panel toggles) via PanelToolbar
 *   - Optional children slot for future chat-specific controls
 *
 * Migration status (from ChatInput.tsx bottom bar):
 *
 *   MIGRATED:
 *   - BottomMenuModeSelection: no props (uses useConfig context only).
 *     Renders a mode dropdown that is independent of chat state.
 *
 *   NOT MIGRATED (too tightly coupled to ChatInput state):
 *   - DirSwitcher: depends on sessionWorkingDir, setChatState, etc.
 *   - CostTracker: depends on token accumulation props from BaseChat.
 *   - ModelsBottomBar: depends on dropdownRef, alerts, setView, sessionId.
 *   - BottomMenuExtensionSelection: depends on sessionId.
 *   - Attach/Recipe/Diagnostics buttons: depend on ChatInput local state.
 *
 *   To migrate the remaining controls, lift shared state into a context.
 */

import { cn } from '../../../utils';
import { BottomMenuModeSelection } from '../../bottom_menu/BottomMenuModeSelection';
import { PanelToolbar } from '../PanelSystem/PanelToolbar';
import { STATUS_BAR_HEIGHT } from '../PanelSystem/types';

interface StatusBarProps {
  /** Extra items rendered by the chat context (model bar, cost, etc.) */
  children?: React.ReactNode;
  /** Hide the mode selector (e.g. when ChatInput still renders its own) */
  hideModeSelector?: boolean;
  className?: string;
}

export function StatusBar({ children, hideModeSelector, className }: StatusBarProps) {
  return (
    <div
      role="region"
      aria-label="Status Bar"
      className={cn(
        'flex items-center gap-1 px-2 shrink-0',
        'bg-background-default border-t border-border-default',
        'text-xs text-text-muted select-none',
        className
      )}
      style={{ height: STATUS_BAR_HEIGHT }}
      data-testid="status-bar"
    >
      {/* Mode selector — migrated from ChatInput bottom bar */}
      {!hideModeSelector && (
        <div className="flex items-center" data-testid="status-bar-mode">
          <BottomMenuModeSelection />
        </div>
      )}

      {/* Chat-specific controls (dir, cost, model, extensions) */}
      {children && <div className="flex items-center gap-1 flex-1 min-w-0">{children}</div>}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout controls (presets, lock, panels) */}
      <PanelToolbar />
    </div>
  );
}

export default StatusBar;
