import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GooseMessage from '../GooseMessage';
import type { Message } from '../../api';

// Mock child components
vi.mock('../ImagePreview', () => ({
  default: ({ src }: { src: string }) => (
    <img data-testid="image-preview" src={src} alt="preview" />
  ),
}));

vi.mock('../MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

vi.mock('../ToolCallWithResponse', () => ({
  default: ({ toolRequest }: { toolRequest: { id: string } }) => (
    <div data-testid={`tool-call-${toolRequest.id}`}>ToolCall</div>
  ),
}));

vi.mock('../ToolCallConfirmation', () => ({
  default: () => <div data-testid="tool-confirmation">ToolConfirmation</div>,
}));

vi.mock('../ElicitationRequest', () => ({
  default: () => <div data-testid="elicitation-request">ElicitationRequest</div>,
}));

vi.mock('../MessageCopyLink', () => ({
  default: ({ text }: { text: string }) => (
    <button data-testid="copy-link">Copy: {text}</button>
  ),
}));

vi.mock('../../utils/timeUtils', () => ({
  formatMessageTimestamp: vi.fn((ts: number) => `timestamp-${ts}`),
}));

vi.mock('../../utils/toolCallChaining', () => ({
  identifyConsecutiveToolCalls: vi.fn(() => []),
  shouldHideTimestamp: vi.fn(() => false),
}));

vi.mock('../chat_coding', () => ({
  ThinkingBlock: ({ content }: { content: string }) => (
    <div data-testid="thinking-block">{content}</div>
  ),
}));

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'goose-msg-1',
  role: 'assistant',
  created: 1700000000,
  content: [{ type: 'text' as const, text: 'Hello from Goose' }],
  metadata: { userVisible: true, agentVisible: true },
  ...overrides,
});

const defaultProps = () => ({
  sessionId: 'sess-1',
  message: makeMessage(),
  messages: [makeMessage()],
  toolCallNotifications: new Map(),
  append: vi.fn(),
  isStreaming: false,
});

describe('GooseMessage', () => {
  it('renders text content', () => {
    render(<GooseMessage {...defaultProps()} />);

    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from Goose');
  });

  it('renders timestamp when not streaming and no tool requests', () => {
    render(<GooseMessage {...defaultProps()} />);

    expect(screen.getByText('timestamp-1700000000')).toBeInTheDocument();
  });

  it('does not render timestamp when streaming', () => {
    render(<GooseMessage {...defaultProps()} isStreaming={true} />);

    expect(screen.queryByText('timestamp-1700000000')).not.toBeInTheDocument();
  });

  it('renders copy link for text-only messages', () => {
    render(<GooseMessage {...defaultProps()} />);

    expect(screen.getByTestId('copy-link')).toBeInTheDocument();
  });

  it('renders images when present', () => {
    const message = makeMessage({
      content: [
        { type: 'text' as const, text: 'See this image' },
        { type: 'image' as const, data: 'imgdata', mimeType: 'image/png' },
      ],
    });
    render(<GooseMessage {...defaultProps()} message={message} />);

    expect(screen.getByTestId('image-preview')).toBeInTheDocument();
  });

  it('renders tool calls when present', () => {
    const message = makeMessage({
      content: [
        { type: 'text' as const, text: 'Running tool' },
        {
          type: 'toolRequest' as const,
          id: 'tool-1',
          toolCall: { value: { name: 'developer__shell' } },
        },
      ],
    });
    const messages = [message];
    render(
      <GooseMessage
        {...defaultProps()}
        message={message}
        messages={messages}
      />
    );

    expect(screen.getByTestId('tool-call-tool-1')).toBeInTheDocument();
  });

  it('renders multiple tool calls', () => {
    const message = makeMessage({
      content: [
        {
          type: 'toolRequest' as const,
          id: 'tool-1',
          toolCall: { value: { name: 'dev__shell' } },
        },
        {
          type: 'toolRequest' as const,
          id: 'tool-2',
          toolCall: { value: { name: 'dev__read' } },
        },
      ],
    });
    render(
      <GooseMessage {...defaultProps()} message={message} messages={[message]} />
    );

    expect(screen.getByTestId('tool-call-tool-1')).toBeInTheDocument();
    expect(screen.getByTestId('tool-call-tool-2')).toBeInTheDocument();
  });

  it('renders thinking block for chain-of-thought content', () => {
    const message = makeMessage({
      content: [
        {
          type: 'text' as const,
          text: '<think>Let me consider this carefully</think>The answer is 42.',
        },
      ],
    });
    render(<GooseMessage {...defaultProps()} message={message} messages={[message]} />);

    expect(screen.getByTestId('thinking-block')).toHaveTextContent(
      'Let me consider this carefully'
    );
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('The answer is 42.');
  });

  it('does not render thinking block when no think tags', () => {
    render(<GooseMessage {...defaultProps()} />);

    expect(screen.queryByTestId('thinking-block')).not.toBeInTheDocument();
  });

  it('renders elicitation request when present', () => {
    const message = makeMessage({
      content: [
        {
          type: 'actionRequired' as const,
          data: {
            actionType: 'elicitation' as const,
            id: 'elic-1',
            message: 'Please provide input',
            requested_schema: {},
          },
        },
      ],
    });
    render(
      <GooseMessage
        {...defaultProps()}
        message={message}
        messages={[message]}
        submitElicitationResponse={vi.fn()}
      />
    );

    expect(screen.getByTestId('elicitation-request')).toBeInTheDocument();
  });

  it('does not render empty text content', () => {
    const message = makeMessage({
      content: [{ type: 'text' as const, text: '' }],
    });
    render(<GooseMessage {...defaultProps()} message={message} messages={[message]} />);

    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument();
  });

  it('renders tool confirmation when present and not shown inline', () => {
    const toolConfMessage = makeMessage({
      content: [
        {
          type: 'actionRequired' as const,
          data: {
            actionType: 'toolConfirmation' as const,
            id: 'confirm-1',
            toolName: 'shell',
            arguments: { cmd: 'rm -rf /' },
            prompt: 'Are you sure?',
          },
        },
      ],
    });
    // No matching tool request in messages = not shown inline
    render(
      <GooseMessage
        {...defaultProps()}
        message={toolConfMessage}
        messages={[toolConfMessage]}
      />
    );

    expect(screen.getByTestId('tool-confirmation')).toBeInTheDocument();
  });

  it('applies goose-message class on wrapper', () => {
    const { container } = render(<GooseMessage {...defaultProps()} />);

    expect(container.querySelector('.goose-message')).toBeInTheDocument();
  });
});
