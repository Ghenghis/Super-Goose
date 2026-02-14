import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentChatPanel from '../AgentChatPanel';

// --- Mocks ----------------------------------------------------------------

const mockUseAgentChat = vi.fn();
vi.mock('../../../hooks/useAgentChat', () => ({
  useAgentChat: (...args: unknown[]) => mockUseAgentChat(...args),
}));

// --- Helpers ---------------------------------------------------------------

const mockSendMessage = vi.fn();
const mockWakeAgent = vi.fn();
const mockClearMessages = vi.fn();

function defaults() {
  mockSendMessage.mockResolvedValue(undefined);
  mockWakeAgent.mockResolvedValue(undefined);
  mockClearMessages.mockReturnValue(undefined);

  mockUseAgentChat.mockReturnValue({
    messages: [],
    agents: [],
    connected: false,
    sendMessage: mockSendMessage,
    wakeAgent: mockWakeAgent,
    clearMessages: mockClearMessages,
  });
}

function withAgents(agents: Array<{
  id: string;
  role: string;
  displayName: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  model: string;
  lastHeartbeat: string;
}>) {
  mockUseAgentChat.mockReturnValue({
    messages: [],
    agents,
    connected: true,
    sendMessage: mockSendMessage,
    wakeAgent: mockWakeAgent,
    clearMessages: mockClearMessages,
  });
}

function withMessages(msgs: Array<{
  id: string;
  from: string;
  to: string;
  channel: 'direct' | 'team' | 'broadcast' | 'system';
  priority: 'critical' | 'high' | 'normal' | 'low';
  payload: unknown;
  timestamp: string;
  delivered: boolean;
  acknowledged: boolean;
}>) {
  mockUseAgentChat.mockReturnValue({
    messages: msgs,
    agents: [],
    connected: true,
    sendMessage: mockSendMessage,
    wakeAgent: mockWakeAgent,
    clearMessages: mockClearMessages,
  });
}

// --- Setup / Teardown ------------------------------------------------------

beforeEach(() => {
  defaults();
});
afterEach(() => vi.restoreAllMocks());

// --- Tests -----------------------------------------------------------------

describe('AgentChatPanel', () => {
  // -- Basic rendering ------------------------------------------------------
  it('renders the panel with correct ARIA region', () => {
    render(<AgentChatPanel />);
    expect(screen.getByRole('region', { name: 'Agent Chat Panel' })).toBeDefined();
  });

  it('shows disconnected status when not connected', () => {
    render(<AgentChatPanel />);
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('shows connected status when connected', () => {
    mockUseAgentChat.mockReturnValue({
      messages: [],
      agents: [],
      connected: true,
      sendMessage: mockSendMessage,
      wakeAgent: mockWakeAgent,
      clearMessages: mockClearMessages,
    });
    render(<AgentChatPanel />);
    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('shows agent count', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Coder', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
      { id: 'a2', role: 'reviewer', displayName: 'Reviewer', status: 'offline', model: 'claude', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('2 agents')).toBeDefined();
  });

  it('shows singular agent count for 1 agent', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Coder', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('1 agent')).toBeDefined();
  });

  // -- Empty state ----------------------------------------------------------
  it('shows empty state when no messages', () => {
    render(<AgentChatPanel />);
    expect(screen.getByText('No messages yet')).toBeDefined();
  });

  // -- Agent registry bar ---------------------------------------------------
  it('renders agent dots in the registry bar', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Coder Agent', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
      { id: 'a2', role: 'reviewer', displayName: 'Review Agent', status: 'offline', model: 'claude', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('Coder Agent')).toBeDefined();
    expect(screen.getByText('Review Agent')).toBeDefined();
  });

  it('shows Wake button only for offline agents', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Coder Agent', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
      { id: 'a2', role: 'reviewer', displayName: 'Review Agent', status: 'offline', model: 'claude', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);

    const wakeButtons = screen.getAllByRole('button', { name: /Wake/ });
    expect(wakeButtons.length).toBe(1);
    expect(wakeButtons[0].getAttribute('aria-label')).toBe('Wake Review Agent');
  });

  it('calls wakeAgent when Wake button is clicked', async () => {
    withAgents([
      { id: 'a2', role: 'reviewer', displayName: 'Review Agent', status: 'offline', model: 'claude', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Wake Review Agent' }));

    await waitFor(() => {
      expect(mockWakeAgent).toHaveBeenCalledWith('a2', 'Manual wake from chat panel');
    });
  });

  // -- Channel filter tabs --------------------------------------------------
  it('renders channel filter tabs', () => {
    render(<AgentChatPanel />);

    expect(screen.getByRole('tab', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Team' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Direct' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'System' })).toBeDefined();
  });

  it('All tab is selected by default', () => {
    render(<AgentChatPanel />);
    const allTab = screen.getByRole('tab', { name: 'All' });
    expect(allTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switching to Direct tab updates selection', () => {
    render(<AgentChatPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Direct' }));

    expect(screen.getByRole('tab', { name: 'Direct' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('false');
  });

  it('filters messages by channel', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'reviewer', channel: 'team', priority: 'normal',
        payload: 'Team message here', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
      {
        id: 'm2', from: 'coder', to: 'reviewer', channel: 'direct', priority: 'normal',
        payload: 'Direct message here', timestamp: '2026-02-14T10:01:00Z', delivered: true, acknowledged: false,
      },
      {
        id: 'm3', from: 'system', to: 'all', channel: 'system', priority: 'low',
        payload: 'System alert', timestamp: '2026-02-14T10:02:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);

    // All shows everything
    expect(screen.getByText('Team message here')).toBeDefined();
    expect(screen.getByText('Direct message here')).toBeDefined();
    expect(screen.getByText('System alert')).toBeDefined();

    // Switch to Direct
    fireEvent.click(screen.getByRole('tab', { name: 'Direct' }));
    expect(screen.getByText('Direct message here')).toBeDefined();
    expect(screen.queryByText('Team message here')).toBeNull();
    expect(screen.queryByText('System alert')).toBeNull();

    // Switch to System
    fireEvent.click(screen.getByRole('tab', { name: 'System' }));
    expect(screen.getByText('System alert')).toBeDefined();
    expect(screen.queryByText('Direct message here')).toBeNull();
  });

  // -- Message rendering ----------------------------------------------------
  it('renders messages with from/to labels', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'reviewer', channel: 'team', priority: 'normal',
        payload: 'Hello reviewer!', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('coder')).toBeDefined();
    expect(screen.getByText('reviewer')).toBeDefined();
    expect(screen.getByText('Hello reviewer!')).toBeDefined();
  });

  it('renders channel badge on messages', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'reviewer', channel: 'direct', priority: 'normal',
        payload: 'DM content', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('direct')).toBeDefined();
  });

  it('shows Delivered indicator for delivered messages', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'all', channel: 'team', priority: 'normal',
        payload: 'Delivered msg', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('Delivered')).toBeDefined();
  });

  it('shows ACK indicator for acknowledged messages', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'all', channel: 'team', priority: 'normal',
        payload: 'Acked msg', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: true,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('ACK')).toBeDefined();
  });

  it('shows Queued indicator for undelivered messages', () => {
    withMessages([
      {
        id: 'm1', from: 'user', to: 'offline-agent', channel: 'direct', priority: 'normal',
        payload: 'Queued message', timestamp: '2026-02-14T10:00:00Z', delivered: false, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('Queued')).toBeDefined();
  });

  // -- Queued messages section -----------------------------------------------
  it('shows queued messages count', () => {
    withMessages([
      {
        id: 'm1', from: 'user', to: 'offline-agent', channel: 'direct', priority: 'normal',
        payload: 'Queued 1', timestamp: '2026-02-14T10:00:00Z', delivered: false, acknowledged: false,
      },
      {
        id: 'm2', from: 'user', to: 'offline-agent', channel: 'direct', priority: 'normal',
        payload: 'Queued 2', timestamp: '2026-02-14T10:01:00Z', delivered: false, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('2 messages queued for offline agents')).toBeDefined();
  });

  it('does not show queued section when all messages are delivered', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'all', channel: 'team', priority: 'normal',
        payload: 'Delivered', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.queryByText(/queued for offline agents/)).toBeNull();
  });

  // -- Message sending ------------------------------------------------------
  it('renders message input fields', () => {
    render(<AgentChatPanel />);

    expect(screen.getByLabelText('Recipient')).toBeDefined();
    expect(screen.getByLabelText('Message content')).toBeDefined();
    expect(screen.getByLabelText('Send message')).toBeDefined();
  });

  it('disables Send button when message input is empty', () => {
    render(<AgentChatPanel />);
    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toHaveProperty('disabled', true);
  });

  it('enables Send button when message input has text', () => {
    render(<AgentChatPanel />);
    fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Hello world' } });
    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toHaveProperty('disabled', false);
  });

  it('calls sendMessage when Send button is clicked', async () => {
    render(<AgentChatPanel />);

    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'agent-1' } });
    fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Test message' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('agent-1', 'Test message', 'team');
    });
  });

  it('sends to "all" when recipient is empty', async () => {
    render(<AgentChatPanel />);

    fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Broadcast msg' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('all', 'Broadcast msg', 'team');
    });
  });

  it('uses active channel filter when sending', async () => {
    render(<AgentChatPanel />);

    // Switch to Direct channel
    fireEvent.click(screen.getByRole('tab', { name: 'Direct' }));

    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'agent-1' } });
    fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Direct msg' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('agent-1', 'Direct msg', 'direct');
    });
  });

  it('clears message input after sending', async () => {
    render(<AgentChatPanel />);

    const msgInput = screen.getByLabelText('Message content') as HTMLInputElement;
    fireEvent.change(msgInput, { target: { value: 'Will be cleared' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(msgInput.value).toBe('');
    });
  });

  it('sends message on Enter key', async () => {
    render(<AgentChatPanel />);

    const msgInput = screen.getByLabelText('Message content');
    fireEvent.change(msgInput, { target: { value: 'Enter message' } });
    fireEvent.keyDown(msgInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('all', 'Enter message', 'team');
    });
  });

  // -- Clear messages -------------------------------------------------------
  it('shows Clear button when messages exist', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'all', channel: 'team', priority: 'normal',
        payload: 'msg', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByLabelText('Clear messages')).toBeDefined();
  });

  it('does not show Clear button when no messages', () => {
    render(<AgentChatPanel />);
    expect(screen.queryByLabelText('Clear messages')).toBeNull();
  });

  it('calls clearMessages when Clear button is clicked', () => {
    withMessages([
      {
        id: 'm1', from: 'coder', to: 'all', channel: 'team', priority: 'normal',
        payload: 'msg', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);

    fireEvent.click(screen.getByLabelText('Clear messages'));
    expect(mockClearMessages).toHaveBeenCalledTimes(1);
  });

  // -- Accessibility --------------------------------------------------------
  it('has tablist with correct label', () => {
    render(<AgentChatPanel />);
    expect(screen.getByRole('tablist', { name: 'Channel filter' })).toBeDefined();
  });

  it('has log role for message feed', () => {
    render(<AgentChatPanel />);
    expect(screen.getByRole('log', { name: 'Chat messages' })).toBeDefined();
  });

  it('agent registry bar has list role', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Coder', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByRole('list', { name: 'Agent registry' })).toBeDefined();
  });

  // -- Message with different priorities ------------------------------------
  it('renders messages with different priorities', () => {
    withMessages([
      {
        id: 'm1', from: 'system', to: 'all', channel: 'system', priority: 'critical',
        payload: 'Critical alert', timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
      {
        id: 'm2', from: 'coder', to: 'all', channel: 'team', priority: 'low',
        payload: 'Low priority note', timestamp: '2026-02-14T10:01:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('Critical alert')).toBeDefined();
    expect(screen.getByText('Low priority note')).toBeDefined();
  });

  // -- Message with non-string payload --------------------------------------
  it('renders JSON payload as stringified text', () => {
    withMessages([
      {
        id: 'm1', from: 'agent', to: 'all', channel: 'system', priority: 'normal',
        payload: { action: 'deploy', target: 'prod' },
        timestamp: '2026-02-14T10:00:00Z', delivered: true, acknowledged: false,
      },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('{"action":"deploy","target":"prod"}')).toBeDefined();
  });

  // -- Agents in different states -------------------------------------------
  it('renders agents in online, offline, busy, error states', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Online Agent', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
      { id: 'a2', role: 'reviewer', displayName: 'Offline Agent', status: 'offline', model: 'claude', lastHeartbeat: new Date().toISOString() },
      { id: 'a3', role: 'tester', displayName: 'Busy Agent', status: 'busy', model: 'llama', lastHeartbeat: new Date().toISOString() },
      { id: 'a4', role: 'deployer', displayName: 'Error Agent', status: 'error', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('Online Agent')).toBeDefined();
    expect(screen.getByText('Offline Agent')).toBeDefined();
    expect(screen.getByText('Busy Agent')).toBeDefined();
    expect(screen.getByText('Error Agent')).toBeDefined();
  });

  it('only offline agents have Wake buttons', () => {
    withAgents([
      { id: 'a1', role: 'coder', displayName: 'Online Agent', status: 'online', model: 'gpt-4', lastHeartbeat: new Date().toISOString() },
      { id: 'a2', role: 'reviewer', displayName: 'Offline Agent', status: 'offline', model: 'claude', lastHeartbeat: new Date().toISOString() },
      { id: 'a3', role: 'tester', displayName: 'Busy Agent', status: 'busy', model: 'llama', lastHeartbeat: new Date().toISOString() },
    ]);
    render(<AgentChatPanel />);

    const wakeButtons = screen.getAllByRole('button', { name: /Wake/ });
    expect(wakeButtons.length).toBe(1);
    expect(wakeButtons[0].getAttribute('aria-label')).toBe('Wake Offline Agent');
  });
});
