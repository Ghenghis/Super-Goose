import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TimeWarpState } from '../TimeWarpTypes';

const mockSetActiveBranch = vi.fn();

let mockState: TimeWarpState = {
  events: [
    { id: 'e1', type: 'message', timestamp: 1000, label: 'msg1', branchId: 'main' },
    { id: 'e2', type: 'tool_call', timestamp: 2000, label: 'tool1', branchId: 'main' },
    { id: 'e3', type: 'edit', timestamp: 3000, label: 'edit1', branchId: 'experiment-1' },
  ],
  branches: [
    { id: 'main', name: 'main', color: '#3b82f6', isActive: true },
    { id: 'experiment-1', name: 'experiment-1', color: '#a855f7', isActive: false },
  ],
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
    setActiveBranch: mockSetActiveBranch,
    selectEvent: vi.fn(),
    setCurrentEvent: vi.fn(),
    setViewMode: vi.fn(),
    setDockPosition: vi.fn(),
    setExpandedSize: vi.fn(),
    setRecording: vi.fn(),
    setPlaybackSpeed: vi.fn(),
    setZoom: vi.fn(),
    setScrollPosition: vi.fn(),
    addEvent: vi.fn(),
    stepForward: vi.fn(),
    stepBackward: vi.fn(),
    toggleViewMode: vi.fn(),
  }),
}));

import BranchSelector from '../BranchSelector';

describe('BranchSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders switch branch button', () => {
    render(<BranchSelector />);

    expect(screen.getByTitle('Switch branch')).toBeInTheDocument();
  });

  it('renders current branch name in non-compact mode', () => {
    render(<BranchSelector />);

    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('does not render branch name in compact mode', () => {
    render(<BranchSelector compact />);

    // The branch name text should not be present in compact
    // The button only shows the git branch icon + chevron
    const btn = screen.getByTitle('Switch branch');
    // In compact mode there is no span with the branch name
    expect(btn.querySelector('span.truncate')).toBeNull();
  });

  it('shows dropdown with all branches on click', async () => {
    const user = userEvent.setup();
    render(<BranchSelector />);

    // Dropdown is not visible initially
    expect(screen.queryByText('experiment-1')).not.toBeInTheDocument();

    // Click to open dropdown
    await user.click(screen.getByTitle('Switch branch'));

    // Now both branches should be visible
    expect(screen.getByText('experiment-1')).toBeInTheDocument();
    // "main" appears both in the button and in the dropdown
    expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(2);
  });

  it('shows event count per branch in dropdown', async () => {
    const user = userEvent.setup();
    render(<BranchSelector />);

    await user.click(screen.getByTitle('Switch branch'));

    // main has 2 events, experiment-1 has 1 event
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows branch count footer when multiple branches exist', async () => {
    const user = userEvent.setup();
    render(<BranchSelector />);

    await user.click(screen.getByTitle('Switch branch'));

    expect(screen.getByText('2 branches')).toBeInTheDocument();
  });

  it('calls setActiveBranch and closes dropdown when a branch is selected', async () => {
    const user = userEvent.setup();
    render(<BranchSelector />);

    await user.click(screen.getByTitle('Switch branch'));
    await user.click(screen.getByText('experiment-1'));

    expect(mockSetActiveBranch).toHaveBeenCalledWith('experiment-1');
    // Dropdown should close after selection
    // The branch count footer should be gone
    expect(screen.queryByText('2 branches')).not.toBeInTheDocument();
  });

  it('shows color indicator dots for each branch', async () => {
    const user = userEvent.setup();
    const { container } = render(<BranchSelector />);

    await user.click(screen.getByTitle('Switch branch'));

    // Color dots are spans with backgroundColor set inline
    const colorDots = container.querySelectorAll('span.rounded-full');
    // There should be at least 2 color dots (one per branch)
    expect(colorDots.length).toBeGreaterThanOrEqual(2);
  });
});
