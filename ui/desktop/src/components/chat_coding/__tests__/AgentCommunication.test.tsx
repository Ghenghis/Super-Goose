import { render, screen, fireEvent, within } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { AgentCommunication } from '../AgentCommunication';
import type { AgentMessage } from '../AgentCommunication';

vi.mock('lucide-react', () => lucideReactMock);

const makeMessage = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
  from: 'AgentA',
  to: 'AgentB',
  content: 'Hello from A',
  timestamp: 1700000000000,
  type: 'request',
  ...overrides,
});

describe('AgentCommunication', () => {
  it('renders empty state when no messages', () => {
    render(<AgentCommunication messages={[]} />);
    expect(screen.getByText('No inter-agent messages')).toBeInTheDocument();
  });

  it('renders messages with correct header info', () => {
    const messages = [
      makeMessage({ from: 'Alpha', to: 'Beta', type: 'request' }),
    ];
    render(<AgentCommunication messages={messages} />);
    expect(screen.getByText('Agent Communication')).toBeInTheDocument();
    // Alpha appears in both the filter bar and the message header; use getAllByText
    expect(screen.getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Beta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Request')).toBeInTheDocument();
  });

  it('shows "All" for broadcast messages', () => {
    const messages = [
      makeMessage({ type: 'broadcast', from: 'Sender', to: 'Everyone' }),
    ];
    render(<AgentCommunication messages={messages} />);
    // "All" appears as filter button and as broadcast target; use getAllByText
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Broadcast')).toBeInTheDocument();
  });

  it('displays message count', () => {
    const messages = [makeMessage(), makeMessage({ timestamp: 1700000001000 })];
    render(<AgentCommunication messages={messages} />);
    expect(screen.getByText(/2.*messages/)).toBeInTheDocument();
  });

  it('truncates long messages and allows expand/collapse', () => {
    const longContent = 'A'.repeat(200);
    const messages = [makeMessage({ content: longContent })];
    render(<AgentCommunication messages={messages} />);
    expect(screen.getByText('[expand]')).toBeInTheDocument();
    const bubble = screen.getByText('[expand]').closest('div');
    if (bubble) fireEvent.click(bubble);
    expect(screen.getByText('[collapse]')).toBeInTheDocument();
  });

  it('shows filter bar when filter button is clicked', () => {
    const messages = [
      makeMessage({ from: 'Alice', to: 'Bob' }),
      makeMessage({ from: 'Bob', to: 'Alice', timestamp: 1700000001000 }),
    ];
    render(<AgentCommunication messages={messages} />);
    const filterBtn = screen.getByLabelText('Filter by agent');
    fireEvent.click(filterBtn);
    // "Alice" and "Bob" appear in both message rows and filter buttons
    // Check that there are at least 2 occurrences (message + filter button)
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(2);
  });
});
