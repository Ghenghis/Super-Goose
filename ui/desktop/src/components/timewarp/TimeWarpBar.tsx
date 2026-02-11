import React, { useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useTimeWarp } from './TimeWarpContext';
import TransportControls from './TransportControls';
import BranchSelector from './BranchSelector';
import TimelineTrack, { InlineEventDots } from './TimelineTrack';
import TimeWarpMinimap from './TimeWarpMinimap';
import EventInspector from './EventInspector';

// ---------------------------------------------------------------------------
// Slim bar (32px) -- always-visible summary strip
// ---------------------------------------------------------------------------

const SlimBar: React.FC = () => {
  const { state, toggleViewMode } = useTimeWarp();

  const branchEvents = useMemo(
    () => state.events.filter((e) => e.branchId === state.activeBranchId),
    [state.events, state.activeBranchId]
  );
  const currentIdx = branchEvents.findIndex((e) => e.id === state.currentEventId) + 1;

  return (
    <div className="flex items-center h-8 px-2 gap-2 w-full">
      {/* Expand toggle */}
      <button
        onClick={toggleViewMode}
        className="flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-default hover:bg-white/10 transition-colors flex-shrink-0"
        title="Expand timeline"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>

      {/* Transport */}
      <TransportControls compact />

      {/* Divider */}
      <div className="w-px h-4 bg-white/10 flex-shrink-0" />

      {/* Branch selector */}
      <BranchSelector compact />

      {/* Inline dots */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <InlineEventDots events={branchEvents} />
      </div>

      {/* Playhead position */}
      <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0 font-mono">
        {currentIdx}/{branchEvents.length}
      </span>

      {/* Recording indicator */}
      {state.isRecording && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
      )}

      {/* Minimap */}
      <TimeWarpMinimap width={80} height={16} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Expanded bar (80-200px) -- full timeline with tracks
// ---------------------------------------------------------------------------

const ExpandedBar: React.FC = () => {
  const { state, toggleViewMode, setZoom } = useTimeWarp();

  // Group events by branch
  const trackData = useMemo(() => {
    return state.branches.map((branch) => ({
      branch,
      events: state.events.filter((e) => e.branchId === branch.id),
    }));
  }, [state.branches, state.events]);

  const branchEvents = state.events.filter((e) => e.branchId === state.activeBranchId);
  const currentIdx = branchEvents.findIndex((e) => e.id === state.currentEventId) + 1;

  const handleZoomIn = useCallback(() => setZoom(state.zoom * 1.5), [state.zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(state.zoom / 1.5), [state.zoom, setZoom]);

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center h-8 px-2 gap-2 border-b border-white/5 flex-shrink-0">
        {/* Collapse toggle */}
        <button
          onClick={toggleViewMode}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-default hover:bg-white/10 transition-colors"
          title="Collapse timeline"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {/* Transport controls */}
        <TransportControls />

        {/* Divider */}
        <div className="w-px h-4 bg-white/10" />

        {/* Branch selector */}
        <BranchSelector />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Playhead position */}
        <span className="text-[10px] text-text-muted whitespace-nowrap font-mono">
          {currentIdx}/{branchEvents.length} events
        </span>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10" />

        {/* Zoom controls */}
        <button
          onClick={handleZoomOut}
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-default hover:bg-white/10 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3 h-3" />
        </button>
        <span className="text-[10px] text-text-muted w-8 text-center">
          {Math.round(state.zoom * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-default hover:bg-white/10 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3 h-3" />
        </button>

        {/* Minimap */}
        <TimeWarpMinimap width={120} height={20} />
      </div>

      {/* Timeline tracks area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
        {trackData.map(({ branch, events }) => (
          <TimelineTrack
            key={branch.id}
            events={events}
            branchColor={branch.color}
            branchName={branch.name}
            compact={state.dock.expandedSize < 120}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Resize handle
// ---------------------------------------------------------------------------

const ResizeHandle: React.FC = () => {
  const { state, setExpandedSize } = useTimeWarp();

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startSize = state.dock.expandedSize;

      const onMouseMove = (moveEvt: MouseEvent) => {
        const delta = startY - moveEvt.clientY;
        setExpandedSize(startSize + delta);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [state.dock.expandedSize, setExpandedSize]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1 cursor-ns-resize bg-transparent hover:bg-blue-500/30 transition-colors flex-shrink-0"
      title="Drag to resize"
    />
  );
};

// ---------------------------------------------------------------------------
// Main TimeWarpBar
// ---------------------------------------------------------------------------

const TimeWarpBar: React.FC = () => {
  const { state } = useTimeWarp();
  const { viewMode, expandedSize } = state.dock;

  if (viewMode === 'hidden') {
    return <HiddenToggle />;
  }

  const isExpanded = viewMode === 'expanded';
  const barHeight = isExpanded ? expandedSize : 32;

  return (
    <div
      className="relative w-full border-t border-white/10 bg-background-default flex-shrink-0"
      style={{ height: barHeight }}
    >
      {/* Resize handle (only in expanded) */}
      {isExpanded && <ResizeHandle />}

      {/* Event inspector popup */}
      <EventInspector />

      {/* Bar content */}
      <div className="h-full overflow-hidden">
        {isExpanded ? <ExpandedBar /> : <SlimBar />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hidden mode toggle (thin line at bottom)
// ---------------------------------------------------------------------------

const HiddenToggle: React.FC = () => {
  const { toggleViewMode } = useTimeWarp();

  return (
    <button
      onClick={toggleViewMode}
      className="w-full h-1 bg-transparent hover:bg-blue-500/20 transition-colors flex-shrink-0 group relative"
      title="Show timeline"
    >
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="bg-blue-500/40 rounded-t px-3 h-3 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-2 h-2 text-blue-400" />
        </div>
      </div>
    </button>
  );
};

export default TimeWarpBar;
