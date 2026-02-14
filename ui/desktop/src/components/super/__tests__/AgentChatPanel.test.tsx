import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentChatPanel from '../AgentChatPanel';

// --- Mocks ----------------------------------------------------------------

// jsdom has no EventSource — must mock useAgUi
const mockSendMessage = vi.fn();
const mockApproveToolCall = vi.fn();
const mockRejectToolCall = vi.fn();
const mockReconnect = vi.fn();
const mockAbortRun = vi.fn();
const mockRegisterTool = vi.fn();
const mockUnregisterTool = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue(() => {});

const mockUseAgUi = vi.fn();
vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: (...args: unknown[]) => mockUseAgUi(...args),
}));

// --- Helpers ---------------------------------------------------------------

function defaults() {
  mockSendMessage.mockReturnValue(undefined);

  mockUseAgUi.mockReturnValue({
    connected: false,
    error: null,
    runId: null,
    threadId: null,
    isRunning: false,
    currentStep: null,
    messages: [],
    agentState: { core_type: 'default', status: 'idle' },
    activeToolCalls: new Map(),
    pendingApprovals: [],
    activities: [],
    reasoningMessages: [],
    isReasoning: false,
    customEvents: [],
    runCount: 0,
    approveToolCall: mockApproveToolCall,
    rejectToolCall: mockRejectToolCall,
    reconnect: mockReconnect,
    abortRun: mockAbortRun,
    registerTool: mockRegisterTool,
    unregisterTool: mockUnregisterTool,
    subscribe: mockSubscribe,
    sendMessage: mockSendMessage,
  });
}

function withMessages(msgs: Array<{
  messageId: string;
  role: 'agent' | 'user' | 'system';
  content: string;
  streaming: boolean;
  timestamp: number;
}>) {
  mockUseAgUi.mockReturnValue({
    connected: true,
    error: null,
    runId: 'run-1',
    threadId: 'thread-1',
    isRunning: false,
    currentStep: null,
    messages: msgs,
    agentState: { core_type: 'default', status: 'idle' },
    activeToolCalls: new Map(),
    pendingApprovals: [],
    activities: [],
    reasoningMessages: [],
    isReasoning: false,
    customEvents: [],
    runCount: 1,
    approveToolCall: mockApproveToolCall,
    rejectToolCall: mockRejectToolCall,
    reconnect: mockReconnect,
    abortRun: mockAbortRun,
    registerTool: mockRegisterTool,
    unregisterTool: mockUnregisterTool,
    subscribe: mockSubscribe,
    sendMessage: mockSendMessage,
  });
}

function withToolCalls(toolCalls: Array<{
  toolCallId: string;
  toolCallName: string;
  args: string;
  status: 'active' | 'completed' | 'error';
  timestamp: number;
}>) {
  const map = new Map(toolCalls.map((tc) => [tc.toolCallId, tc]));
  mockUseAgUi.mockReturnValue({
    connected: true,
    error: null,
    runId: 'run-1',
    threadId: 'thread-1',
    isRunning: true,
    currentStep: null,
    messages: [],
    agentState: { core_type: 'default', status: 'idle' },
    activeToolCalls: map,
    pendingApprovals: [],
    activities: [],
    reasoningMessages: [],
    isReasoning: false,
    customEvents: [],
    runCount: 1,
    approveToolCall: mockApproveToolCall,
    rejectToolCall: mockRejectToolCall,
    reconnect: mockReconnect,
    abortRun: mockAbortRun,
    registerTool: mockRegisterTool,
    unregisterTool: mockUnregisterTool,
    subscribe: mockSubscribe,
    sendMessage: mockSendMessage,
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
    mockUseAgUi.mockReturnValue({
      ...mockUseAgUi(),
      connected: true,
    });
    render(<AgentChatPanel />);
    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('shows message count', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Hello', streaming: false, timestamp: Date.now() },
      { messageId: 'm2', role: 'user', content: 'Hi', streaming: false, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('2 messages')).toBeDefined();
  });

  it('shows singular message count for 1 message', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Hello', streaming: false, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('1 message')).toBeDefined();
  });

  // -- Empty state ----------------------------------------------------------
  it('shows empty state when no messages', () => {
    render(<AgentChatPanel />);
    expect(screen.getByText('No messages yet')).toBeDefined();
  });

  // -- Tool calls bar -------------------------------------------------------
  it('renders active tool calls in the tool calls bar', () => {
    withToolCalls([
      { toolCallId: 'tc1', toolCallName: 'read_file', args: '{}', status: 'active', timestamp: Date.now() },
      { toolCallId: 'tc2', toolCallName: 'write_file', args: '{}', status: 'active', timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('read_file')).toBeDefined();
    expect(screen.getByText('write_file')).toBeDefined();
  });

  it('shows Running indicator when agent is running', () => {
    withToolCalls([
      { toolCallId: 'tc1', toolCallName: 'test', args: '{}', status: 'active', timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('Running')).toBeDefined();
  });

  // -- Channel filter tabs --------------------------------------------------
  it('renders channel filter tabs', () => {
    render(<AgentChatPanel />);

    expect(screen.getByRole('tab', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Agent' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'User' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'System' })).toBeDefined();
  });

  it('All tab is selected by default', () => {
    render(<AgentChatPanel />);
    const allTab = screen.getByRole('tab', { name: 'All' });
    expect(allTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switching to Agent tab updates selection', () => {
    render(<AgentChatPanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Agent' }));

    expect(screen.getByRole('tab', { name: 'Agent' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('false');
  });

  it('filters messages by role', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Agent message', streaming: false, timestamp: Date.now() },
      { messageId: 'm2', role: 'user', content: 'User message', streaming: false, timestamp: Date.now() },
      { messageId: 'm3', role: 'system', content: 'System alert', streaming: false, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);

    // All shows everything
    expect(screen.getByText('Agent message')).toBeDefined();
    expect(screen.getByText('User message')).toBeDefined();
    expect(screen.getByText('System alert')).toBeDefined();

    // Switch to Agent
    fireEvent.click(screen.getByRole('tab', { name: 'Agent' }));
    expect(screen.getByText('Agent message')).toBeDefined();
    expect(screen.queryByText('User message')).toBeNull();
    expect(screen.queryByText('System alert')).toBeNull();

    // Switch to System
    fireEvent.click(screen.getByRole('tab', { name: 'System' }));
    expect(screen.getByText('System alert')).toBeDefined();
    expect(screen.queryByText('Agent message')).toBeNull();
  });

  // -- Message rendering ----------------------------------------------------
  it('renders messages with role labels', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Hello user!', streaming: false, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);

    // "agent" appears in both the <strong> label and the <SGBadge>
    const agentLabels = screen.getAllByText('agent');
    expect(agentLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hello user!')).toBeDefined();
  });

  it('shows streaming indicator for streaming messages', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Thinking...', streaming: true, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('streaming...')).toBeDefined();
  });

  // -- Streaming messages indicator ------------------------------------------
  it('shows streaming messages count', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Streaming 1', streaming: true, timestamp: Date.now() },
      { messageId: 'm2', role: 'agent', content: 'Streaming 2', streaming: true, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.getByText('2 messages streaming')).toBeDefined();
  });

  it('does not show streaming section when no messages are streaming', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Done', streaming: false, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);
    expect(screen.queryByText(/streaming/i)).toBeNull();
  });

  // -- Message sending ------------------------------------------------------
  it('renders message input field', () => {
    render(<AgentChatPanel />);

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

    fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Test message' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Test message');
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
      expect(mockSendMessage).toHaveBeenCalledWith('Enter message');
    });
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

  // -- Messages with different roles ----------------------------------------
  it('renders messages from agent, user, and system roles', () => {
    withMessages([
      { messageId: 'm1', role: 'agent', content: 'Agent says hello', streaming: false, timestamp: Date.now() },
      { messageId: 'm2', role: 'user', content: 'User responds', streaming: false, timestamp: Date.now() },
      { messageId: 'm3', role: 'system', content: 'System notification', streaming: false, timestamp: Date.now() },
    ]);
    render(<AgentChatPanel />);

    expect(screen.getByText('Agent says hello')).toBeDefined();
    expect(screen.getByText('User responds')).toBeDefined();
    expect(screen.getByText('System notification')).toBeDefined();
  });
});
