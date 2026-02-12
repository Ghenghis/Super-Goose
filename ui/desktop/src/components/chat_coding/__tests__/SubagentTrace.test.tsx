import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { SubagentTrace } from '../SubagentTrace';
import type { TraceEvent } from '../SubagentTrace';

vi.mock('lucide-react', () => lucideReactMock);

const makeEvent = (overrides: Partial<TraceEvent> = {}): TraceEvent => ({
  timestamp: 1700000000000,
  type: 'start',
  ...overrides,
});

describe('SubagentTrace', () => {
  it('renders empty state when no events', () => {
    render(<SubagentTrace agentId="agent-1" events={[]} />);
    expect(screen.getByText('No trace events for agent agent-1')).toBeInTheDocument();
  });

  it('renders header with agent id', () => {
    const events = [makeEvent()];
    render(<SubagentTrace agentId="planner" events={events} />);
    expect(screen.getByText('Trace: planner')).toBeInTheDocument();
  });

  it('shows event count', () => {
    const events = [
      makeEvent({ type: 'start' }),
      makeEvent({ type: 'tool_call', timestamp: 1700000001000 }),
      makeEvent({ type: 'complete', timestamp: 1700000002000 }),
    ];
    render(<SubagentTrace agentId="agent-1" events={events} />);
    expect(screen.getByText('3 events')).toBeInTheDocument();
  });

  it('renders event labels for each type', () => {
    const events = [
      makeEvent({ type: 'start', timestamp: 1700000000000 }),
      makeEvent({ type: 'tool_call', tool: 'read_file', timestamp: 1700000001000 }),
    ];
    render(<SubagentTrace agentId="agent-1" events={events} />);
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Tool Call')).toBeInTheDocument();
  });

  it('shows tool name when present', () => {
    const events = [
      makeEvent({ type: 'tool_call', tool: 'search_files' }),
    ];
    render(<SubagentTrace agentId="agent-1" events={events} />);
    expect(screen.getByText('search_files')).toBeInTheDocument();
  });

  it('has scroll-to-bottom button', () => {
    const events = [makeEvent()];
    render(<SubagentTrace agentId="agent-1" events={events} />);
    expect(screen.getByLabelText('Scroll to latest event')).toBeInTheDocument();
  });
});
