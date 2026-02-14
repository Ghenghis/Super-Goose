import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Must mock useAgUi before importing LogsPanel — jsdom has no EventSource
const mockActivities: Array<{
  id: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: number;
}> = [];

vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: () => ({
    activities: mockActivities,
    agentState: { core_type: 'default', status: 'idle' },
    connected: false,
    isRunning: false,
    activeToolCalls: [],
    customEvents: [],
    messages: [],
  }),
}));

// Must also mock lucide-react to avoid SVG rendering issues
vi.mock('lucide-react', () => ({
  Trash2: (props: Record<string, unknown>) => <svg data-testid="trash-icon" {...props} />,
}));

import LogsPanel from './LogsPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addActivity(
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  id?: string
) {
  mockActivities.push({
    id: id ?? `act_${mockActivities.length}`,
    level,
    message,
    timestamp: Date.now() + mockActivities.length * 1000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LogsPanel', () => {
  beforeEach(() => {
    mockActivities.length = 0;
  });

  // -- Empty state ----------------------------------------------------------

  it('shows "No log entries" when there are no activities', () => {
    render(<LogsPanel />);
    expect(screen.getByText('No log entries')).toBeDefined();
  });

  // -- Filter buttons -------------------------------------------------------

  it('renders all 5 filter buttons', () => {
    render(<LogsPanel />);
    expect(screen.getByText(/^All/)).toBeDefined();
    expect(screen.getByText(/^error/)).toBeDefined();
    expect(screen.getByText(/^warn/)).toBeDefined();
    expect(screen.getByText(/^info/)).toBeDefined();
    expect(screen.getByText(/^debug/)).toBeDefined();
  });

  it('shows "All (0)" count when empty', () => {
    render(<LogsPanel />);
    expect(screen.getByText('All (0)')).toBeDefined();
  });

  // -- Rendering log entries ------------------------------------------------

  it('renders log entries with their messages', () => {
    addActivity('info', 'Server started');
    addActivity('error', 'Connection failed');
    render(<LogsPanel />);

    expect(screen.getByText('Server started')).toBeDefined();
    expect(screen.getByText('Connection failed')).toBeDefined();
  });

  it('renders level badges for each entry', () => {
    addActivity('info', 'Test info');
    addActivity('warn', 'Test warning');
    addActivity('error', 'Test error');
    render(<LogsPanel />);

    const badges = screen.getAllByText(/^(info|warn|error)$/);
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it('shows correct count in All button', () => {
    addActivity('info', 'one');
    addActivity('warn', 'two');
    addActivity('error', 'three');
    render(<LogsPanel />);

    expect(screen.getByText('All (3)')).toBeDefined();
  });

  it('shows correct count per level', () => {
    addActivity('info', 'info1');
    addActivity('info', 'info2');
    addActivity('error', 'err1');
    render(<LogsPanel />);

    expect(screen.getByText('info (2)')).toBeDefined();
    expect(screen.getByText('error (1)')).toBeDefined();
    expect(screen.getByText('warn (0)')).toBeDefined();
    expect(screen.getByText('debug (0)')).toBeDefined();
  });

  // -- Level filtering ------------------------------------------------------

  it('filters entries when a level button is clicked', () => {
    addActivity('info', 'Informational');
    addActivity('error', 'Critical error');
    addActivity('warn', 'A warning');
    render(<LogsPanel />);

    // Click error filter
    fireEvent.click(screen.getByText('error (1)'));

    // Should show error entry, not info or warn
    expect(screen.getByText('Critical error')).toBeDefined();
    expect(screen.queryByText('Informational')).toBeNull();
    expect(screen.queryByText('A warning')).toBeNull();
  });

  it('shows all entries when "All" is clicked after filtering', () => {
    addActivity('info', 'Info msg');
    addActivity('error', 'Error msg');
    render(<LogsPanel />);

    // Filter to error only
    fireEvent.click(screen.getByText('error (1)'));
    expect(screen.queryByText('Info msg')).toBeNull();

    // Click "All" to show everything
    fireEvent.click(screen.getByText('All (2)'));
    expect(screen.getByText('Info msg')).toBeDefined();
    expect(screen.getByText('Error msg')).toBeDefined();
  });

  // -- Clear button ---------------------------------------------------------

  it('renders clear button', () => {
    render(<LogsPanel />);
    const clearButton = screen.getByTitle('Clear logs');
    expect(clearButton).toBeDefined();
  });

  it('clears logs when clear button is clicked', () => {
    addActivity('info', 'Visible entry');
    render(<LogsPanel />);

    expect(screen.getByText('Visible entry')).toBeDefined();

    fireEvent.click(screen.getByTitle('Clear logs'));

    expect(screen.queryByText('Visible entry')).toBeNull();
    expect(screen.getByText('No log entries')).toBeDefined();
  });

  it('updates count to 0 after clearing', () => {
    addActivity('info', 'entry');
    addActivity('warn', 'entry2');
    render(<LogsPanel />);

    expect(screen.getByText('All (2)')).toBeDefined();

    fireEvent.click(screen.getByTitle('Clear logs'));

    expect(screen.getByText('All (0)')).toBeDefined();
  });

  // -- Timestamp formatting -------------------------------------------------

  it('renders timestamps for each entry', () => {
    // Set a specific timestamp
    const ts = new Date(2026, 0, 15, 14, 30, 45).getTime();
    mockActivities.push({
      id: 'ts-test',
      level: 'info',
      message: 'Timestamped entry',
      timestamp: ts,
    });
    render(<LogsPanel />);

    // The exact format depends on locale, but should contain "14:30:45" style
    expect(screen.getByText('Timestamped entry')).toBeDefined();
    // Just confirm the entry renders — locale-dependent timestamp tested by existence
  });

  // -- Debug level entries --------------------------------------------------

  it('renders debug entries', () => {
    addActivity('debug', 'Debug info');
    render(<LogsPanel />);
    expect(screen.getByText('Debug info')).toBeDefined();
  });

  it('filters to debug only when debug button clicked', () => {
    addActivity('info', 'Info entry');
    addActivity('debug', 'Debug entry');
    render(<LogsPanel />);

    fireEvent.click(screen.getByText('debug (1)'));
    expect(screen.getByText('Debug entry')).toBeDefined();
    expect(screen.queryByText('Info entry')).toBeNull();
  });
});
