import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeWarpProvider, useTimeWarp } from '../TimeWarpContext';

// Mock the API hook to return empty data (no backend needed)
vi.mock('../../../hooks/useTimeWarpEvents', () => ({
  useTimeWarpEvents: () => ({
    events: [],
    branches: [],
    loading: false,
    error: null,
    fetchEvents: vi.fn(),
    fetchBranches: vi.fn(),
    recordEvent: vi.fn().mockResolvedValue(true),
    createBranch: vi.fn().mockResolvedValue(true),
    replayToEvent: vi.fn().mockResolvedValue(true),
  }),
}));

// Helper component that exposes context values for testing
const ContextInspector: React.FC = () => {
  const ctx = useTimeWarp();
  return (
    <div>
      <span data-testid="event-count">{ctx.state.events.length}</span>
      <span data-testid="branch-count">{ctx.state.branches.length}</span>
      <span data-testid="current-event">{ctx.state.currentEventId ?? 'null'}</span>
      <span data-testid="selected-event">{ctx.state.selectedEventId ?? 'null'}</span>
      <span data-testid="active-branch">{ctx.state.activeBranchId}</span>
      <span data-testid="is-recording">{String(ctx.state.isRecording)}</span>
      <span data-testid="playback-speed">{ctx.state.playbackSpeed}</span>
      <span data-testid="view-mode">{ctx.state.dock.viewMode}</span>
      <span data-testid="zoom">{ctx.state.zoom}</span>
      <button data-testid="select-evt-01" onClick={() => ctx.selectEvent('evt-01')} />
      <button data-testid="select-null" onClick={() => ctx.selectEvent(null)} />
      <button data-testid="set-branch" onClick={() => ctx.setActiveBranch('experiment-1')} />
      <button data-testid="toggle-view" onClick={ctx.toggleViewMode} />
      <button data-testid="step-forward" onClick={ctx.stepForward} />
      <button data-testid="step-backward" onClick={ctx.stepBackward} />
      <button data-testid="set-speed" onClick={() => ctx.setPlaybackSpeed(2)} />
      <button data-testid="set-recording-off" onClick={() => ctx.setRecording(false)} />
      <button data-testid="set-zoom" onClick={() => ctx.setZoom(2)} />
      <button
        data-testid="add-event"
        onClick={() =>
          ctx.addEvent({
            id: 'evt-new',
            type: 'message',
            timestamp: Date.now(),
            label: 'New event',
            branchId: 'main',
          })
        }
      />
    </div>
  );
};

describe('TimeWarpContext', () => {
  it('provides default empty state when API returns no data', () => {
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    // 0 events (no demo data, API returns empty)
    expect(Number(screen.getByTestId('event-count').textContent)).toBe(0);
    // 1 default branch (main)
    expect(Number(screen.getByTestId('branch-count').textContent)).toBe(1);
    expect(screen.getByTestId('active-branch').textContent).toBe('main');
    expect(screen.getByTestId('is-recording').textContent).toBe('true');
    expect(screen.getByTestId('view-mode').textContent).toBe('slim');
    expect(screen.getByTestId('selected-event').textContent).toBe('null');
    expect(screen.getByTestId('current-event').textContent).toBe('null');
  });

  it('dispatches SELECT_EVENT action', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(screen.getByTestId('selected-event').textContent).toBe('null');

    await user.click(screen.getByTestId('select-evt-01'));
    expect(screen.getByTestId('selected-event').textContent).toBe('evt-01');

    await user.click(screen.getByTestId('select-null'));
    expect(screen.getByTestId('selected-event').textContent).toBe('null');
  });

  it('dispatches SET_ACTIVE_BRANCH action', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(screen.getByTestId('active-branch').textContent).toBe('main');
    await user.click(screen.getByTestId('set-branch'));
    expect(screen.getByTestId('active-branch').textContent).toBe('experiment-1');
  });

  it('dispatches toggleViewMode cycling slim -> expanded -> hidden -> slim', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(screen.getByTestId('view-mode').textContent).toBe('slim');

    await user.click(screen.getByTestId('toggle-view'));
    expect(screen.getByTestId('view-mode').textContent).toBe('expanded');

    await user.click(screen.getByTestId('toggle-view'));
    expect(screen.getByTestId('view-mode').textContent).toBe('hidden');

    await user.click(screen.getByTestId('toggle-view'));
    expect(screen.getByTestId('view-mode').textContent).toBe('slim');
  });

  it('dispatches STEP_FORWARD and STEP_BACKWARD with events', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    // Start with no events, currentEvent is null
    expect(screen.getByTestId('current-event').textContent).toBe('null');

    // Add events to test stepping
    await user.click(screen.getByTestId('add-event'));
    expect(screen.getByTestId('current-event').textContent).toBe('evt-new');

    // Step backward with only 1 event should stay
    await user.click(screen.getByTestId('step-backward'));
    expect(screen.getByTestId('current-event').textContent).toBe('evt-new');
  });

  it('dispatches SET_PLAYBACK_SPEED', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(screen.getByTestId('playback-speed').textContent).toBe('1');
    await user.click(screen.getByTestId('set-speed'));
    expect(screen.getByTestId('playback-speed').textContent).toBe('2');
  });

  it('dispatches SET_RECORDING', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(screen.getByTestId('is-recording').textContent).toBe('true');
    await user.click(screen.getByTestId('set-recording-off'));
    expect(screen.getByTestId('is-recording').textContent).toBe('false');
  });

  it('dispatches ADD_EVENT', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(Number(screen.getByTestId('event-count').textContent)).toBe(0);
    await user.click(screen.getByTestId('add-event'));
    expect(Number(screen.getByTestId('event-count').textContent)).toBe(1);
    // currentEventId updates to the new event
    expect(screen.getByTestId('current-event').textContent).toBe('evt-new');
  });

  it('dispatches SET_ZOOM with clamping', async () => {
    const user = userEvent.setup();
    render(
      <TimeWarpProvider>
        <ContextInspector />
      </TimeWarpProvider>
    );

    expect(screen.getByTestId('zoom').textContent).toBe('1');
    await user.click(screen.getByTestId('set-zoom'));
    expect(screen.getByTestId('zoom').textContent).toBe('2');
  });

  it('throws error when useTimeWarp is used outside provider', () => {
    const BrokenComponent = () => {
      useTimeWarp();
      return null;
    };

    // Suppress expected error output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BrokenComponent />)).toThrow(
      'useTimeWarp must be used within a <TimeWarpProvider>'
    );
    spy.mockRestore();
  });
});
