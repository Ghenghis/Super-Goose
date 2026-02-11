import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimeWarpState } from '../TimeWarpTypes';

const mockSelectEvent = vi.fn();
const mockSetCurrentEvent = vi.fn();

let mockState: TimeWarpState = {
  events: [
    {
      id: 'evt-01',
      type: 'tool_call',
      timestamp: Date.now() - 120_000,
      label: 'Read package.json',
      detail: 'developer.read_file("package.json")',
      branchId: 'main',
      agentId: 'goose',
      metadata: { lines: 42 },
    },
    {
      id: 'evt-02',
      type: 'message',
      timestamp: Date.now() - 60_000,
      label: 'User says hello',
      branchId: 'main',
      agentId: 'user',
    },
  ],
  branches: [{ id: 'main', name: 'main', color: '#3b82f6', isActive: true }],
  currentEventId: 'evt-01',
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
    setCurrentEvent: mockSetCurrentEvent,
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

import EventInspector from '../EventInspector';

describe('EventInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      ...mockState,
      selectedEventId: null,
    };
  });

  it('renders nothing when no event is selected', () => {
    mockState.selectedEventId = null;
    const { container } = render(<EventInspector />);
    expect(container.firstChild).toBeNull();
  });

  it('shows event details when an event is selected', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('Read package.json')).toBeInTheDocument();
    expect(screen.getByText('Tool Call')).toBeInTheDocument();
  });

  it('shows event detail/code preview', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('developer.read_file("package.json")')).toBeInTheDocument();
  });

  it('shows agent name when event has agentId', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('goose')).toBeInTheDocument();
  });

  it('shows branch name', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('shows metadata section when metadata exists', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('Metadata')).toBeInTheDocument();
    // The metadata is JSON.stringified
    expect(screen.getByText(/\"lines\": 42/)).toBeInTheDocument();
  });

  it('shows event ID in footer', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('evt-01')).toBeInTheDocument();
  });

  it('has a "Jump to this event" button', () => {
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    expect(screen.getByText('Jump to this event')).toBeInTheDocument();
  });

  it('calls setCurrentEvent when "Jump to this event" is clicked', async () => {
    const user = userEvent.setup();
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    await user.click(screen.getByText('Jump to this event'));
    expect(mockSetCurrentEvent).toHaveBeenCalledWith('evt-01');
  });

  it('calls selectEvent(null) when close button is clicked', async () => {
    const user = userEvent.setup();
    mockState.selectedEventId = 'evt-01';
    render(<EventInspector />);

    await user.click(screen.getByTitle('Close inspector'));
    expect(mockSelectEvent).toHaveBeenCalledWith(null);
  });

  it('shows the correct type label for a message event', () => {
    mockState.selectedEventId = 'evt-02';
    render(<EventInspector />);

    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('User says hello')).toBeInTheDocument();
  });
});
