import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimeWarpEvent, TimeWarpState } from '../TimeWarpTypes';

const mockSelectEvent = vi.fn();

const testEvents: TimeWarpEvent[] = [
  { id: 'e1', type: 'message', timestamp: 1000, label: 'Message event', branchId: 'main' },
  { id: 'e2', type: 'tool_call', timestamp: 2000, label: 'Tool call event', branchId: 'main' },
  { id: 'e3', type: 'error', timestamp: 3000, label: 'Error event', branchId: 'main' },
  { id: 'e4', type: 'checkpoint', timestamp: 4000, label: 'Checkpoint event', branchId: 'main' },
  { id: 'e5', type: 'milestone', timestamp: 5000, label: 'Milestone event', branchId: 'main' },
];

let mockState: TimeWarpState = {
  events: testEvents,
  branches: [{ id: 'main', name: 'main', color: '#3b82f6', isActive: true }],
  currentEventId: 'e2',
  selectedEventId: null,
  activeBranchId: 'main',
  isRecording: true,
  playbackSpeed: 1,
  zoom: 1,
  scrollPosition: 0,
  dock: { position: 'bottom', viewMode: 'slim', expandedSize: 160 },
};

vi.mock('../TimeWarpContext', () => ({
  useTimeWarp: () => ({
    state: mockState,
    selectEvent: mockSelectEvent,
    setCurrentEvent: vi.fn(),
    setViewMode: vi.fn(),
    setDockPosition: vi.fn(),
    setExpandedSize: vi.fn(),
    setRecording: vi.fn(),
    setPlaybackSpeed: vi.fn(),
    setZoom: vi.fn(),
    setScrollPosition: vi.fn(),
    setActiveBranch: vi.fn(),
    addEvent: vi.fn(),
    stepForward: vi.fn(),
    stepBackward: vi.fn(),
    toggleViewMode: vi.fn(),
  }),
}));

import TimelineTrack, { InlineEventDots } from '../TimelineTrack';

describe('TimelineTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      events: testEvents,
      branches: [{ id: 'main', name: 'main', color: '#3b82f6', isActive: true }],
      currentEventId: 'e2',
      selectedEventId: null,
      activeBranchId: 'main',
      isRecording: true,
      playbackSpeed: 1,
      zoom: 1,
      scrollPosition: 0,
      dock: { position: 'bottom', viewMode: 'slim', expandedSize: 160 },
    };
  });

  it('renders event nodes for each event', () => {
    render(
      <TimelineTrack
        events={testEvents}
        branchColor="#3b82f6"
        branchName="main"
      />
    );

    // Each event should have a button with its label as title
    expect(screen.getByTitle('Message event')).toBeInTheDocument();
    expect(screen.getByTitle('Tool call event')).toBeInTheDocument();
    expect(screen.getByTitle('Error event')).toBeInTheDocument();
    expect(screen.getByTitle('Checkpoint event')).toBeInTheDocument();
    expect(screen.getByTitle('Milestone event')).toBeInTheDocument();
  });

  it('renders branch label with the correct branch name', () => {
    render(
      <TimelineTrack
        events={testEvents}
        branchColor="#3b82f6"
        branchName="feature-branch"
      />
    );

    expect(screen.getByText('feature-branch')).toBeInTheDocument();
  });

  it('clicking a node calls selectEvent with the event id', async () => {
    const user = userEvent.setup();
    render(
      <TimelineTrack
        events={testEvents}
        branchColor="#3b82f6"
        branchName="main"
      />
    );

    await user.click(screen.getByTitle('Message event'));
    expect(mockSelectEvent).toHaveBeenCalledWith('e1');
  });

  it('clicking a selected node deselects it (passes null)', async () => {
    const user = userEvent.setup();
    mockState.selectedEventId = 'e1';
    render(
      <TimelineTrack
        events={testEvents}
        branchColor="#3b82f6"
        branchName="main"
      />
    );

    await user.click(screen.getByTitle('Message event'));
    expect(mockSelectEvent).toHaveBeenCalledWith(null);
  });

  it('returns null when events array is empty', () => {
    const { container } = render(
      <TimelineTrack
        events={[]}
        branchColor="#3b82f6"
        branchName="main"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders compact nodes when compact prop is true', () => {
    const { container } = render(
      <TimelineTrack
        events={testEvents}
        branchColor="#3b82f6"
        branchName="main"
        compact
      />
    );

    // Compact mode uses h-6 for the track
    expect(container.querySelector('.h-6')).toBeInTheDocument();
  });
});

describe('InlineEventDots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dots for each event', () => {
    render(<InlineEventDots events={testEvents} />);

    // Each event has a button with its label as title
    expect(screen.getByTitle('Message event')).toBeInTheDocument();
    expect(screen.getByTitle('Tool call event')).toBeInTheDocument();
    expect(screen.getByTitle('Error event')).toBeInTheDocument();
  });

  it('clicking a dot calls selectEvent', async () => {
    const user = userEvent.setup();
    render(<InlineEventDots events={testEvents} />);

    await user.click(screen.getByTitle('Milestone event'));
    expect(mockSelectEvent).toHaveBeenCalledWith('e5');
  });
});
