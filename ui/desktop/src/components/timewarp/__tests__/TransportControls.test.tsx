import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimeWarpState } from '../TimeWarpTypes';

const mockStepForward = vi.fn();
const mockStepBackward = vi.fn();
const mockSetRecording = vi.fn();
const mockSetPlaybackSpeed = vi.fn();

let mockState: TimeWarpState = {
  events: [],
  branches: [{ id: 'main', name: 'main', color: '#3b82f6', isActive: true }],
  currentEventId: null,
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
    stepForward: mockStepForward,
    stepBackward: mockStepBackward,
    setRecording: mockSetRecording,
    setPlaybackSpeed: mockSetPlaybackSpeed,
    selectEvent: vi.fn(),
    setCurrentEvent: vi.fn(),
    setViewMode: vi.fn(),
    setDockPosition: vi.fn(),
    setExpandedSize: vi.fn(),
    setZoom: vi.fn(),
    setScrollPosition: vi.fn(),
    setActiveBranch: vi.fn(),
    addEvent: vi.fn(),
    toggleViewMode: vi.fn(),
  }),
}));

import TransportControls from '../TransportControls';

describe('TransportControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      ...mockState,
      isRecording: true,
      playbackSpeed: 1,
    };
  });

  it('renders play/pause button showing Pause when recording', () => {
    render(<TransportControls />);

    expect(screen.getByTitle('Pause recording')).toBeInTheDocument();
  });

  it('renders play button when not recording', () => {
    mockState.isRecording = false;
    render(<TransportControls />);

    expect(screen.getByTitle('Resume recording')).toBeInTheDocument();
  });

  it('toggles recording state when play/pause is clicked', async () => {
    const user = userEvent.setup();
    render(<TransportControls />);

    await user.click(screen.getByTitle('Pause recording'));
    expect(mockSetRecording).toHaveBeenCalledWith(false);
  });

  it('calls stepForward when step forward button is clicked', async () => {
    const user = userEvent.setup();
    render(<TransportControls />);

    await user.click(screen.getByTitle('Step forward'));
    expect(mockStepForward).toHaveBeenCalledTimes(1);
  });

  it('calls stepBackward when step backward button is clicked', async () => {
    const user = userEvent.setup();
    render(<TransportControls />);

    await user.click(screen.getByTitle('Step backward'));
    expect(mockStepBackward).toHaveBeenCalledTimes(1);
  });

  it('renders speed selector in non-compact mode', () => {
    render(<TransportControls />);

    const select = screen.getByTitle('Playback speed');
    expect(select).toBeInTheDocument();
    expect(select.tagName.toLowerCase()).toBe('select');
  });

  it('hides speed selector in compact mode', () => {
    render(<TransportControls compact />);

    expect(screen.queryByTitle('Playback speed')).not.toBeInTheDocument();
  });

  it('changes playback speed via selector', async () => {
    const user = userEvent.setup();
    render(<TransportControls />);

    const select = screen.getByTitle('Playback speed');
    await user.selectOptions(select, '4');
    expect(mockSetPlaybackSpeed).toHaveBeenCalledWith(4);
  });

  it('renders recording indicator button', () => {
    render(<TransportControls />);

    expect(screen.getByTitle('Recording')).toBeInTheDocument();
  });

  it('shows not-recording indicator when not recording', () => {
    mockState.isRecording = false;
    render(<TransportControls />);

    expect(screen.getByTitle('Not recording')).toBeInTheDocument();
  });
});
