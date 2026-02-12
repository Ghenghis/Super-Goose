import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserMessage from '../UserMessage';
import type { Message } from '../../api';

// Mock child components and utilities
vi.mock('../ImagePreview', () => ({
  default: ({ src }: { src: string }) => (
    <img data-testid="image-preview" src={src} alt="preview" />
  ),
}));

vi.mock('../MarkdownContent', () => ({
  default: ({ content, className }: { content: string; className?: string }) => (
    <div data-testid="markdown-content" className={className}>
      {content}
    </div>
  ),
}));

vi.mock('../MessageCopyLink', () => ({
  default: ({ text }: { text: string }) => (
    <button data-testid="copy-link">Copy: {text}</button>
  ),
}));

vi.mock('../../utils/timeUtils', () => ({
  formatMessageTimestamp: vi.fn((ts: number) => `timestamp-${ts}`),
}));

vi.mock('../icons/Edit', () => ({
  default: ({ className }: { className?: string }) => (
    <span data-testid="edit-icon" className={className}>
      EditIcon
    </span>
  ),
}));

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

// Mock window.electron
beforeEach(() => {
  (window.electron as Record<string, unknown>).logInfo = vi.fn();
});

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  role: 'user',
  created: 1700000000,
  content: [{ type: 'text' as const, text: 'Hello world' }],
  metadata: { userVisible: true, agentVisible: true },
  ...overrides,
});

describe('UserMessage', () => {
  it('renders text content in markdown', () => {
    render(<UserMessage message={makeMessage()} />);

    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello world');
  });

  it('renders timestamp', () => {
    render(<UserMessage message={makeMessage({ created: 1700000000 })} />);

    expect(screen.getByText('timestamp-1700000000')).toBeInTheDocument();
  });

  it('renders copy link', () => {
    render(<UserMessage message={makeMessage()} />);

    expect(screen.getByTestId('copy-link')).toBeInTheDocument();
  });

  it('renders Edit button', () => {
    render(<UserMessage message={makeMessage()} />);

    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('renders images when present', () => {
    const message = makeMessage({
      content: [
        { type: 'text' as const, text: 'Check this' },
        { type: 'image' as const, data: 'abc123', mimeType: 'image/png' },
      ],
    });
    render(<UserMessage message={message} />);

    expect(screen.getByTestId('image-preview')).toBeInTheDocument();
  });

  it('does not render image section when no images', () => {
    render(<UserMessage message={makeMessage()} />);

    expect(screen.queryByTestId('image-preview')).not.toBeInTheDocument();
  });

  it('enters edit mode when Edit is clicked', () => {
    render(<UserMessage message={makeMessage()} />);

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByRole('textbox', { name: /edit message/i })).toBeInTheDocument();
  });

  it('populates textarea with message content in edit mode', () => {
    render(<UserMessage message={makeMessage()} />);

    fireEvent.click(screen.getByText('Edit'));

    const textarea = screen.getByRole('textbox', { name: /edit message/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello world');
  });

  it('shows Cancel, Edit in Place, and Fork Session buttons in edit mode', () => {
    render(<UserMessage message={makeMessage()} />);

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByRole('button', { name: /cancel editing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit message in place/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fork session/i })).toBeInTheDocument();
  });

  it('cancels editing and reverts content', () => {
    render(<UserMessage message={makeMessage()} />);

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox', { name: /edit message/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Changed text' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel editing/i }));

    // Should be back to normal display mode
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello world');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('calls onMessageUpdate with "fork" when Fork Session is clicked', () => {
    const onMessageUpdate = vi.fn();
    render(<UserMessage message={makeMessage()} onMessageUpdate={onMessageUpdate} />);

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox', { name: /edit message/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByRole('button', { name: /fork session/i }));

    expect(onMessageUpdate).toHaveBeenCalledWith('msg-1', 'Updated text', 'fork');
  });

  it('calls onMessageUpdate with "edit" when Edit in Place is clicked', () => {
    const onMessageUpdate = vi.fn();
    render(<UserMessage message={makeMessage()} onMessageUpdate={onMessageUpdate} />);

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox', { name: /edit message/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Edited text' } });
    fireEvent.click(screen.getByRole('button', { name: /edit message in place/i }));

    expect(onMessageUpdate).toHaveBeenCalledWith('msg-1', 'Edited text', 'edit');
  });

  it('does not call onMessageUpdate when content is unchanged', () => {
    const onMessageUpdate = vi.fn();
    render(<UserMessage message={makeMessage()} onMessageUpdate={onMessageUpdate} />);

    fireEvent.click(screen.getByText('Edit'));
    // Content unchanged, just save
    fireEvent.click(screen.getByRole('button', { name: /fork session/i }));

    expect(onMessageUpdate).not.toHaveBeenCalled();
  });

  it('shows error when trying to save empty content', () => {
    render(<UserMessage message={makeMessage()} />);

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox', { name: /edit message/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /fork session/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Message cannot be empty');
  });

  it('handles Escape key to cancel editing', () => {
    render(<UserMessage message={makeMessage()} />);

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox', { name: /edit message/i });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    // Should return to display mode
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('handles Cmd+Enter to save (fork)', () => {
    const onMessageUpdate = vi.fn();
    render(<UserMessage message={makeMessage()} onMessageUpdate={onMessageUpdate} />);

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox', { name: /edit message/i });
    fireEvent.change(textarea, { target: { value: 'New content' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(onMessageUpdate).toHaveBeenCalledWith('msg-1', 'New content', 'fork');
  });

  it('does not render text bubble when text content is empty', () => {
    const message = makeMessage({
      content: [
        { type: 'image' as const, data: 'abc', mimeType: 'image/png' },
      ],
    });
    render(<UserMessage message={message} />);

    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('image-preview')).toBeInTheDocument();
  });
});
