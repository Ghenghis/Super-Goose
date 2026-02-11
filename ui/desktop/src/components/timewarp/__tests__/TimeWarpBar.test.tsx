import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimeWarpState } from '../TimeWarpTypes';

// We need to mock the child components since TimeWarpBar composes many sub-components
// that also require the context. Instead, we mock the context hook.
const mockSelectEvent = vi.fn();
const mockSetCurrentEvent = vi.fn();
const mockSetViewMode = vi.fn();
const mockSetExpandedSize = vi.fn();
const mockSetZoom = vi.fn();
const mockToggleViewMode = vi.fn();
const mockStepForward = vi.fn();
const mockStepBackward = vi.fn();
const mockSetRecording = vi.fn();
const mockSetPlaybackSpeed = vi.fn();
const mockSetActiveBranch = vi.fn();

const baseState: TimeWarpState = {
  events: [
    { id: 'e1', type: 'message', timestamp: 1000, label: 'msg1', branchId: 'main' },
    { id: 'e2', type: 'tool_call', timestamp: 2000, label: 'tool1', branchId: 'main' },
    { id: 'e3', type: 'edit', timestamp: 3000, label: 'edit1', branchId: 'main' },
  ],
  branches: [{ id: 'main', name: 'main', color: '#3b82f6', isActive: true }],
  currentEventId: 'e3',
  selectedEventId: null,
  activeBranchId: 'main',
  isRecording: true,
  playbackSpeed: 1,
  zoom: 1,
  scrollPosition: 0,
  dock: {
    position: 'bottom',
    viewMode: 'slim',
    expandedSize: 160,
  },
};

let currentState = { ...baseState };

vi.mock('../TimeWarpContext', () => ({
  useTimeWarp: () => ({
    state: currentState,
    selectEvent: mockSelectEvent,
    setCurrentEvent: mockSetCurrentEvent,
    setViewMode: mockSetViewMode,
    setExpandedSize: mockSetExpandedSize,
    setZoom: mockSetZoom,
    toggleViewMode: mockToggleViewMode,
    stepForward: mockStepForward,
    stepBackward: mockStepBackward,
    setRecording: mockSetRecording,
    setPlaybackSpeed: mockSetPlaybackSpeed,
    setActiveBranch: mockSetActiveBranch,
    setDockPosition: vi.fn(),
    setScrollPosition: vi.fn(),
    addEvent: vi.fn(),
  }),
}));

// Dynamic import after mock
import TimeWarpBar from '../TimeWarpBar';

describe('TimeWarpBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentState = { ...baseState, dock: { ...baseState.dock } };
  });

  it('renders in slim mode with 32px height', () => {
    currentState.dock.viewMode = 'slim';
    const { container } = render(<TimeWarpBar />);

    // The main container should have style height: 32
    const barDiv = container.firstChild as HTMLElement;
    expect(barDiv.style.height).toBe('32px');
  });

  it('renders expand toggle button in slim mode', () => {
    currentState.dock.viewMode = 'slim';
    render(<TimeWarpBar />);

    const expandBtn = screen.getByTitle('Expand timeline');
    expect(expandBtn).toBeInTheDocument();
  });

  it('renders in expanded mode with expanded height', () => {
    currentState.dock.viewMode = 'expanded';
    currentState.dock.expandedSize = 160;
    const { container } = render(<TimeWarpBar />);

    const barDiv = container.firstChild as HTMLElement;
    expect(barDiv.style.height).toBe('160px');
  });

  it('renders collapse toggle button in expanded mode', () => {
    currentState.dock.viewMode = 'expanded';
    render(<TimeWarpBar />);

    const collapseBtn = screen.getByTitle('Collapse timeline');
    expect(collapseBtn).toBeInTheDocument();
  });

  it('renders hidden toggle when viewMode is hidden', () => {
    currentState.dock.viewMode = 'hidden';
    render(<TimeWarpBar />);

    const showBtn = screen.getByTitle('Show timeline');
    expect(showBtn).toBeInTheDocument();
  });

  it('calls toggleViewMode when hidden toggle is clicked', async () => {
    const user = userEvent.setup();
    currentState.dock.viewMode = 'hidden';
    render(<TimeWarpBar />);

    await user.click(screen.getByTitle('Show timeline'));
    expect(mockToggleViewMode).toHaveBeenCalledTimes(1);
  });

  it('renders recording indicator in slim mode when recording', () => {
    currentState.dock.viewMode = 'slim';
    currentState.isRecording = true;
    const { container } = render(<TimeWarpBar />);

    // Recording indicator is a span with bg-red-500 and animate-pulse
    const pulse = container.querySelector('.bg-red-500.animate-pulse');
    expect(pulse).toBeInTheDocument();
  });

  it('shows playhead position counter in slim mode', () => {
    currentState.dock.viewMode = 'slim';
    render(<TimeWarpBar />);

    // Current index is e3 which is index 2 (0-based), display is 3/3
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('shows zoom controls in expanded mode', () => {
    currentState.dock.viewMode = 'expanded';
    render(<TimeWarpBar />);

    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows event count in expanded mode', () => {
    currentState.dock.viewMode = 'expanded';
    render(<TimeWarpBar />);

    expect(screen.getByText('3/3 events')).toBeInTheDocument();
  });
});
