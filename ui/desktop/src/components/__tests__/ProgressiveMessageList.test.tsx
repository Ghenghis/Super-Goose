import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProgressiveMessageList from '../ProgressiveMessageList';
import type { Message } from '../../api';

// Mock child components
vi.mock('../GooseMessage', () => ({
  default: ({ message }: { message: Message }) => (
    <div data-testid={`goose-msg-${message.id}`}>GooseMessage: {message.id}</div>
  ),
}));

vi.mock('../UserMessage', () => ({
  default: ({ message }: { message: Message }) => (
    <div data-testid={`user-msg-${message.id}`}>UserMessage: {message.id}</div>
  ),
}));

vi.mock('../context_management/SystemNotificationInline', () => ({
  SystemNotificationInline: ({ message }: { message: Message }) => (
    <div data-testid={`system-notif-${message.id}`}>SystemNotification</div>
  ),
}));

vi.mock('../LoadingGoose', () => ({
  default: ({ message }: { message?: string }) => (
    <div data-testid="loading-goose">{message}</div>
  ),
}));

vi.mock('../../utils/toolCallChaining', () => ({
  identifyConsecutiveToolCalls: vi.fn(() => []),
  isInChain: vi.fn(() => false),
}));

const makeUserMessage = (id: string, text = 'Hello'): Message => ({
  id,
  role: 'user',
  created: 1700000000,
  content: [{ type: 'text' as const, text }],
  metadata: { userVisible: true, agentVisible: true },
});

const makeAssistantMessage = (id: string, text = 'Hi there'): Message => ({
  id,
  role: 'assistant',
  created: 1700000001,
  content: [{ type: 'text' as const, text }],
  metadata: { userVisible: true, agentVisible: true },
});

const makeToolResponseOnlyMessage = (id: string): Message => ({
  id,
  role: 'user',
  created: 1700000002,
  content: [
    {
      type: 'toolResponse' as const,
      id: 'tool-resp-1',
      toolResult: { status: 'success' },
    },
  ],
  metadata: { userVisible: true, agentVisible: true },
});

const defaultProps = (messages: Message[] = []) => ({
  messages,
  chat: { sessionId: 'sess-1' },
  toolCallNotifications: new Map(),
  append: vi.fn(),
  isUserMessage: (m: Message) => m.role === 'user',
  isStreamingMessage: false,
});

describe('ProgressiveMessageList', () => {
  it('renders nothing for empty messages', () => {
    const { container } = render(<ProgressiveMessageList {...defaultProps([])} />);

    expect(container.querySelectorAll('[data-testid="message-container"]')).toHaveLength(0);
  });

  it('renders user messages', () => {
    const messages = [makeUserMessage('u1')];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    expect(screen.getByTestId('user-msg-u1')).toBeInTheDocument();
  });

  it('renders assistant messages', () => {
    const messages = [makeAssistantMessage('a1')];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    expect(screen.getByTestId('goose-msg-a1')).toBeInTheDocument();
  });

  it('renders a mix of user and assistant messages', () => {
    const messages = [
      makeUserMessage('u1'),
      makeAssistantMessage('a1'),
      makeUserMessage('u2'),
    ];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    expect(screen.getByTestId('user-msg-u1')).toBeInTheDocument();
    expect(screen.getByTestId('goose-msg-a1')).toBeInTheDocument();
    expect(screen.getByTestId('user-msg-u2')).toBeInTheDocument();
  });

  it('skips messages that are not userVisible', () => {
    const messages: Message[] = [
      makeUserMessage('u1'),
      {
        id: 'hidden-1',
        role: 'assistant',
        created: 1700000001,
        content: [{ type: 'text' as const, text: 'Hidden' }],
        metadata: { userVisible: false, agentVisible: true },
      },
    ];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    expect(screen.getByTestId('user-msg-u1')).toBeInTheDocument();
    expect(screen.queryByTestId('goose-msg-hidden-1')).not.toBeInTheDocument();
  });

  it('does not render user messages that are tool-response-only', () => {
    const messages = [makeToolResponseOnlyMessage('tr1')];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    expect(screen.queryByTestId('user-msg-tr1')).not.toBeInTheDocument();
  });

  it('renders system notification inline messages', () => {
    const notifMessage: Message = {
      id: 'notif-1',
      role: 'assistant',
      created: 1700000001,
      content: [
        {
          type: 'systemNotification' as const,
          notificationType: 'inlineMessage' as const,
          msg: 'System message',
        },
      ],
      metadata: { userVisible: true, agentVisible: true },
    };
    render(
      <ProgressiveMessageList
        {...defaultProps([notifMessage])}
        isUserMessage={() => false}
      />
    );

    expect(screen.getByTestId('system-notif-notif-1')).toBeInTheDocument();
  });

  it('uses custom renderMessage when provided', () => {
    const messages = [makeUserMessage('u1')];
    const customRender = (message: Message, index: number) => (
      <div key={message.id} data-testid="custom-render">
        Custom: {message.id}
      </div>
    );
    render(
      <ProgressiveMessageList
        {...defaultProps(messages)}
        renderMessage={customRender}
      />
    );

    expect(screen.getByTestId('custom-render')).toHaveTextContent('Custom: u1');
  });

  it('shows loading indicator for large message lists', async () => {
    // Create more messages than the threshold
    const messages = Array.from({ length: 60 }, (_, i) =>
      makeUserMessage(`u${i}`, `Message ${i}`)
    );
    render(
      <ProgressiveMessageList
        {...defaultProps(messages)}
        showLoadingThreshold={50}
        batchSize={20}
      />
    );

    // Loading indicator should appear for large lists
    expect(screen.getByTestId('loading-goose')).toBeInTheDocument();
  });

  it('does not show loading indicator for small message lists', () => {
    const messages = [makeUserMessage('u1'), makeAssistantMessage('a1')];
    render(
      <ProgressiveMessageList
        {...defaultProps(messages)}
        showLoadingThreshold={50}
      />
    );

    expect(screen.queryByTestId('loading-goose')).not.toBeInTheDocument();
  });

  it('calls onRenderingComplete for small lists', async () => {
    const onComplete = vi.fn();
    const messages = [makeUserMessage('u1')];
    render(
      <ProgressiveMessageList
        {...defaultProps(messages)}
        onRenderingComplete={onComplete}
      />
    );

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('passes onMessageUpdate to UserMessage', () => {
    const onMessageUpdate = vi.fn();
    const messages = [makeUserMessage('u1')];
    render(
      <ProgressiveMessageList
        {...defaultProps(messages)}
        onMessageUpdate={onMessageUpdate}
      />
    );

    expect(screen.getByTestId('user-msg-u1')).toBeInTheDocument();
  });

  it('assigns data-testid message-container to each message', () => {
    const messages = [makeUserMessage('u1'), makeAssistantMessage('a1')];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    const containers = screen.getAllByTestId('message-container');
    expect(containers).toHaveLength(2);
  });

  it('adds "user" class to user message containers', () => {
    const messages = [makeUserMessage('u1')];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    const container = screen.getByTestId('message-container');
    expect(container.className).toContain('user');
  });

  it('adds "assistant" class to assistant message containers', () => {
    const messages = [makeAssistantMessage('a1')];
    render(<ProgressiveMessageList {...defaultProps(messages)} />);

    const container = screen.getByTestId('message-container');
    expect(container.className).toContain('assistant');
  });
});
