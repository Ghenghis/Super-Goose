/**
 * ResizableLayout — main layout orchestrator using react-resizable-panels.
 *
 * Replaces the fixed Sidebar+SidebarInset layout in AppLayout with a
 * fully resizable, customizable zone-based system.
 *
 * Structure:
 *   ┌─────┬──────────┬──────┐
 *   │Left │  Center  │Right │   ← Horizontal Group
 *   │     │          │      │
 *   ├─────┴──────────┴──────┤
 *   │      Bottom Zone      │   ← Vertical (outside horizontal group)
 *   ├───────────────────────┤
 *   │      Status Bar       │   ← Fixed 28px
 *   └───────────────────────┘
 */

import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '../../utils';
import { usePanelSystem } from './PanelSystem/PanelSystemProvider';
import { LeftZone } from './zones/LeftZone';
import { CenterZone } from './zones/CenterZone';
import { RightZone } from './zones/RightZone';
import { BottomZone } from './zones/BottomZone';
import { StatusBar } from './zones/StatusBar';
import type { PanelId } from './PanelSystem/types';

// ---------------------------------------------------------------------------
// Resize Handle Component
// ---------------------------------------------------------------------------

function ResizeHandle({
  direction,
  isLocked,
}: {
  direction: 'horizontal' | 'vertical';
  isLocked: boolean;
}) {
  if (isLocked) {
    return (
      <div
        className={cn(
          direction === 'horizontal' ? 'w-px' : 'h-px',
          'bg-border-default'
        )}
      />
    );
  }

  return (
    <Separator
      className={cn(
        'group relative transition-colors',
        direction === 'horizontal'
          ? 'w-1 hover:w-1.5 cursor-col-resize'
          : 'h-1 hover:h-1.5 cursor-row-resize',
        'bg-border-default hover:bg-accent',
        'data-[separator]:hover:bg-accent'
      )}
    >
      {/* Visual indicator dot on hover */}
      <div
        className={cn(
          'absolute opacity-0 group-hover:opacity-100 transition-opacity',
          'bg-accent rounded-full',
          direction === 'horizontal'
            ? 'w-1 h-8 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : 'h-1 w-8 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
        )}
      />
    </Separator>
  );
}

// ---------------------------------------------------------------------------
// ResizableLayout
// ---------------------------------------------------------------------------

interface ResizableLayoutProps {
  /** Content for the left zone (AppSidebar) */
  leftContent: React.ReactNode;
  /** Content for the center zone (Outlet + ChatSessions) */
  centerContent: React.ReactNode;
  /** Optional panel components for the right zone */
  rightPanelComponents?: Partial<Record<PanelId, React.ReactNode>>;
  /** Optional panel components for the bottom zone */
  bottomPanelComponents?: Partial<Record<PanelId, React.ReactNode>>;
  /** Extra status bar content (model bar, cost tracker, etc.) */
  statusBarContent?: React.ReactNode;
  className?: string;
}

export function ResizableLayout({
  leftContent,
  centerContent,
  rightPanelComponents,
  bottomPanelComponents,
  statusBarContent,
  className,
}: ResizableLayoutProps) {
  const { layout, isLocked } = usePanelSystem();
  const { left, right, bottom } = layout.zones;

  const showLeft = left.visible;
  const showRight = right.visible && right.panels.length > 0;
  const showBottom = bottom.visible && bottom.panels.length > 0;

  return (
    <div
      className={cn('flex flex-col h-full w-full min-h-0', className)}
      data-testid="resizable-layout"
    >
      {/* ── Main horizontal split ──────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <Group
          orientation="horizontal"
          id="sg-main-horizontal"
        >
          {/* LEFT PANEL */}
          {showLeft && (
            <>
              <Panel
                id="left-zone"
                defaultSize={left.sizePercent}
                minSize={10}
                maxSize={30}
                collapsible={true}
                collapsedSize={0}
              >
                <LeftZone>{leftContent}</LeftZone>
              </Panel>
              <ResizeHandle direction="horizontal" isLocked={isLocked} />
            </>
          )}

          {/* CENTER PANEL (always visible) */}
          <Panel
            id="center-zone"
            minSize={30}
          >
            <CenterZone>{centerContent}</CenterZone>
          </Panel>

          {/* RIGHT PANEL */}
          {showRight && (
            <>
              <ResizeHandle direction="horizontal" isLocked={isLocked} />
              <Panel
                id="right-zone"
                defaultSize={right.sizePercent}
                minSize={15}
                maxSize={45}
                collapsible={true}
                collapsedSize={0}
              >
                <RightZone panelComponents={rightPanelComponents} />
              </Panel>
            </>
          )}
        </Group>
      </div>

      {/* ── Bottom zone ────────────────────────────────────────────── */}
      {showBottom && (
        <BottomZone panelComponents={bottomPanelComponents} />
      )}

      {/* ── Status bar (always visible) ────────────────────────────── */}
      <StatusBar>{statusBarContent}</StatusBar>
    </div>
  );
}

export default ResizableLayout;
