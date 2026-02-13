/**
 * StatusBar — always-visible bar at the very bottom of the window.
 *
 * Currently renders:
 *   - Layout toolbar (presets, lock/unlock, panel toggles) via PanelToolbar
 *   - Optional children slot for future chat-specific controls
 *
 * TODO: Migrate bottom-bar controls from ChatInput.tsx into this StatusBar.
 *
 * The following ChatInput bottom-bar components were evaluated for extraction
 * but are too tightly coupled to ChatInput's internal state to move safely:
 *
 *   - DirSwitcher: depends on sessionWorkingDir (local state fetched via API
 *     in a useEffect), setSessionWorkingDir, setChatState (restart callbacks),
 *     and onWorkingDirChange (parent callback from BaseChat).
 *
 *   - CostTracker: depends on accumulatedInputTokens, accumulatedOutputTokens,
 *     sessionCosts — all props threaded from BaseChat's token tracking state.
 *
 *   - ModelsBottomBar: depends on dropdownRef (local useRef in ChatInput),
 *     alerts (from useAlerts() hook instantiated inside ChatInput), setView,
 *     and sessionId.
 *
 *   - BottomMenuModeSelection: no props (uses useConfig context). Could be
 *     extracted independently, but splitting the bar across two locations
 *     would create a confusing UX.
 *
 *   - BottomMenuExtensionSelection: depends on sessionId only. Could extract,
 *     but same UX concern as above.
 *
 * The bottom bar row in ChatInput also contains the Attach button, Recipe
 * button, and Diagnostics button — all deeply coupled to ChatInput local
 * state (file picker, modal toggles, etc.).
 *
 * To properly extract these, we would need to either:
 *   1. Lift shared state (sessionId, workingDir, alerts, tokens, chatState)
 *      into a shared context or the existing ChatContext, OR
 *   2. Create a dedicated StatusBarContext that ChatInput populates and
 *      StatusBar consumes via a portal or context pattern.
 *
 * For now the bottom bar stays in ChatInput and this StatusBar renders
 * only the PanelToolbar. The children slot is ready for future use.
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
