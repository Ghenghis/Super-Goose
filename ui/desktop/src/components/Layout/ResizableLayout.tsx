/**
 * ResizableLayout — main layout orchestrator using react-resizable-panels.
 *
 * Structure:
 *   ┌─────────────────────────┐
 *   │  Vertical PanelGroup    │
 *   │ ┌─────┬────────┬──────┐ │
 *   │ │Left │ Center │Right │ │  ← Top Panel (Horizontal Group)
 *   │ │     │        │      │ │
 *   │ ├─────┴────────┴──────┤ │
 *   │ │  ═══ resize bar ═══ │ │  ← Vertical Separator
 *   │ ├─────────────────────┤ │
 *   │ │    Bottom Zone      │ │  ← Bottom Panel (resizable)
 *   │ └─────────────────────┘ │
 *   ├─────────────────────────┤
 *   │      Status Bar         │  ← Fixed 28px
 *   └─────────────────────────┘
 */

import { useCallback } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { cn } from '../../utils';
import { usePanelSystem } from './PanelSystem/PanelSystemProvider';
import { LeftZone } from './zones/LeftZone';
import { CenterZone } from './zones/CenterZone';
import { RightZone } from './zones/RightZone';
import { BottomZone } from './zones/BottomZone';
import { StatusBar } from './zones/StatusBar';
import type { PanelId } from './PanelSystem/types';

/** Separator size in pixels — must match CSS [role="separator"] width/height */
const SEP_SIZE = 6;

/** Vertical separator (between left/center/right panels) */
function VSeparator({ disabled, id }: { disabled: boolean; id: string }) {
  return (
    <Separator
      disabled={disabled}
      id={id}
      style={{ width: SEP_SIZE, flexBasis: SEP_SIZE }}
    />
  );
}

/** Horizontal separator (between top/bottom panels) */
function HSeparator({ disabled, id }: { disabled: boolean; id: string }) {
  return (
    <Separator
      disabled={disabled}
      id={id}
      style={{ height: SEP_SIZE, flexBasis: SEP_SIZE }}
    />
  );
}

// ---------------------------------------------------------------------------
// Horizontal Content (Left + Center + Right)
// ---------------------------------------------------------------------------

function HorizontalContent({
  leftContent,
  centerContent,
  rightPanelComponents,
  showLeft,
  showRight,
  left,
  right,
  isLocked,
  onLayoutChanged,
  layoutGeneration,
}: {
  leftContent: React.ReactNode;
  centerContent: React.ReactNode;
  rightPanelComponents?: Partial<Record<PanelId, React.ReactNode>>;
  showLeft: boolean;
  showRight: boolean;
  left: { sizePercent: number };
  right: { sizePercent: number };
  isLocked: boolean;
  onLayoutChanged?: (layout: Layout) => void;
  layoutGeneration?: number;
}) {
  return (
    <Group
      key={`h-gen-${layoutGeneration ?? 0}`}
      orientation="horizontal"
      id="sg-main-horizontal"
      className="h-full"
      onLayoutChanged={onLayoutChanged}
    >
      {/* LEFT PANEL — icon sidebar, collapsible to 0 */}
      {showLeft && (
        <>
          <Panel
            id="left-zone"
            defaultSize={Math.max(left.sizePercent, 10)}
            minSize={3}
            maxSize={30}
            collapsible={true}
            collapsedSize={0}
          >
            <LeftZone>{leftContent}</LeftZone>
          </Panel>
          <VSeparator disabled={isLocked} id="sep-left-center" />
        </>
      )}

      {/* CENTER PANEL (always visible) */}
      <Panel
        id="center-zone"
        minSize={20}
      >
        <CenterZone>{centerContent}</CenterZone>
      </Panel>

      {/* RIGHT PANEL — agent panel, collapsible to 0 */}
      {showRight && (
        <>
          <VSeparator disabled={isLocked} id="sep-center-right" />
          <Panel
            id="right-zone"
            defaultSize={Math.max(right.sizePercent, 15)}
            minSize={8}
            maxSize={50}
            collapsible={true}
            collapsedSize={0}
          >
            <RightZone panelComponents={rightPanelComponents} />
          </Panel>
        </>
      )}
    </Group>
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
  const { layout, isLocked, handlePanelResize, handleVerticalResize, layoutGeneration } = usePanelSystem();
  const { left, right, bottom } = layout.zones;

  const showLeft = left.visible;
  const showRight = right.visible && right.panels.length > 0;
  const showBottom = bottom.visible && bottom.panels.length > 0;

  // Sync horizontal panel sizes back to state
  // Uses the same showLeft/showRight booleans that control rendering
  const onHorizontalLayout = useCallback(
    (layoutObj: Layout) => {
      const sizes: number[] = [];
      if (showLeft && layoutObj['left-zone'] != null) sizes.push(layoutObj['left-zone']);
      sizes.push(layoutObj['center-zone'] ?? 100);
      if (showRight && layoutObj['right-zone'] != null) sizes.push(layoutObj['right-zone']);
      handlePanelResize(sizes);
    },
    [handlePanelResize, showLeft, showRight]
  );

  // Sync vertical panel sizes (top/bottom split) back to state
  const onVerticalLayout = useCallback(
    (layoutObj: Layout) => {
      const bottomSize = layoutObj['bottom-zone'];
      if (bottomSize != null) {
        handleVerticalResize(bottomSize);
      }
    },
    [handleVerticalResize]
  );

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full min-h-0',
        isLocked && 'layout-locked',
        className,
      )}
      data-testid="resizable-layout"
    >
      {/* ── Vertical split: top content + bottom zone ─────────────── */}
      <div className="flex-1 min-h-0">
        {showBottom ? (
          <Group
            key={`v-gen-${layoutGeneration}`}
            orientation="vertical"
            id="sg-main-vertical"
            className="h-full"
            onLayoutChanged={onVerticalLayout}
          >
            {/* TOP: Horizontal layout (left + center + right) */}
            <Panel
              id="top-content"
              defaultSize={bottom.collapsed ? 95 : 100 - bottom.sizePercent}
              minSize={30}
            >
              <HorizontalContent
                leftContent={leftContent}
                centerContent={centerContent}
                rightPanelComponents={rightPanelComponents}
                showLeft={showLeft}
                showRight={showRight}
                left={left}
                right={right}
                isLocked={isLocked}
                onLayoutChanged={onHorizontalLayout}
                layoutGeneration={layoutGeneration}
              />
            </Panel>

            {/* Vertical resize handle between top and bottom */}
            <HSeparator
              disabled={isLocked || bottom.collapsed}
              id="sep-top-bottom"
            />

            {/* BOTTOM: Pipeline, Terminal, Logs */}
            <Panel
              id="bottom-zone"
              defaultSize={bottom.collapsed ? 5 : bottom.sizePercent}
              minSize={5}
              maxSize={50}
              collapsible={true}
              collapsedSize={5}
            >
              <BottomZone panelComponents={bottomPanelComponents} />
            </Panel>
          </Group>
        ) : (
          /* No bottom zone — just the horizontal layout */
          <HorizontalContent
            leftContent={leftContent}
            centerContent={centerContent}
            rightPanelComponents={rightPanelComponents}
            showLeft={showLeft}
            showRight={showRight}
            left={left}
            right={right}
            isLocked={isLocked}
            onLayoutChanged={onHorizontalLayout}
          />
        )}
      </div>

      {/* ── Status bar (always visible) ────────────────────────────── */}
      <StatusBar>{statusBarContent}</StatusBar>
    </div>
  );
}

export default ResizableLayout;
