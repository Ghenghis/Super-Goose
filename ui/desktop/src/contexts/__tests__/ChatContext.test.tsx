import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatProvider, useChatContext, DEFAULT_CHAT_TITLE } from '../ChatContext';
import type { ChatType } from '../../types/chat';
import type { Recipe } from '../../recipe';

// Helper component to consume and expose context values
function ChatContextConsumer({
  onContext,
}: {
  onContext?: (ctx: ReturnType<typeof useChatContext>) => void;
}) {
  const ctx = useChatContext();
  if (onContext) onContext(ctx);
  return (
    <div>
      <span data-testid="session-id">{ctx?.chat.sessionId ?? 'none'}</span>
      <span data-testid="chat-name">{ctx?.chat.name ?? 'none'}</span>
      <span data-testid="has-active">{String(ctx?.hasActiveSession ?? false)}</span>
      <span data-testid="context-key">{ctx?.contextKey ?? 'none'}</span>
      <button data-testid="reset-btn" onClick={() => ctx?.resetChat()}>
        Reset
      </button>
      <button
        data-testid="set-recipe-btn"
        onClick={() =>
          ctx?.setRecipe({ title: 'Test Recipe', description: 'desc' } as Recipe)
        }
      >
        Set Recipe
      </button>
      <button data-testid="clear-recipe-btn" onClick={() => ctx?.clearRecipe()}>
        Clear Recipe
      </button>
    </div>
  );
}

function renderWithProvider(
  chat: ChatType,
  setChat: (chat: ChatType) => void,
  contextKey?: string
) {
  return render(
    <ChatProvider chat={chat} setChat={setChat} contextKey={contextKey}>
      <ChatContextConsumer />
    </ChatProvider>
  );
}

const makeChat = (overrides: Partial<ChatType> = {}): ChatType => ({
  sessionId: 'sess-1',
  name: 'Test Chat',
  messages: [],
  recipe: null,
  ...overrides,
});

describe('ChatContext', () => {
  it('provides chat data to consumers', () => {
    const chat = makeChat();
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-1');
    expect(screen.getByTestId('chat-name')).toHaveTextContent('Test Chat');
  });

  it('returns null when used outside provider', () => {
    let contextValue: ReturnType<typeof useChatContext> = undefined as unknown as ReturnType<typeof useChatContext>;
    render(<ChatContextConsumer onContext={(ctx) => (contextValue = ctx)} />);
    expect(contextValue).toBeNull();
  });

  it('hasActiveSession is false when messages are empty', () => {
    const chat = makeChat({ messages: [] });
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    expect(screen.getByTestId('has-active')).toHaveTextContent('false');
  });

  it('hasActiveSession is true when messages exist', () => {
    const chat = makeChat({
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          created: 1000,
          content: [{ type: 'text', text: 'Hello' }],
          metadata: { userVisible: true, agentVisible: true },
        },
      ],
    });
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    expect(screen.getByTestId('has-active')).toHaveTextContent('true');
  });

  it('uses default context key "hub" when not provided', () => {
    const chat = makeChat();
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    expect(screen.getByTestId('context-key')).toHaveTextContent('hub');
  });

  it('uses custom context key when provided', () => {
    const chat = makeChat();
    const setChat = vi.fn();
    renderWithProvider(chat, setChat, 'pair-sess-1');

    expect(screen.getByTestId('context-key')).toHaveTextContent('pair-sess-1');
  });

  it('resetChat calls setChat with default values', () => {
    const chat = makeChat({ sessionId: 'sess-1', name: 'My Chat' });
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    fireEvent.click(screen.getByTestId('reset-btn'));

    expect(setChat).toHaveBeenCalledWith({
      sessionId: '',
      name: DEFAULT_CHAT_TITLE,
      messages: [],
      recipe: null,
      recipeParameterValues: null,
    });
  });

  it('setRecipe calls setChat with recipe attached', () => {
    const chat = makeChat();
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    fireEvent.click(screen.getByTestId('set-recipe-btn'));

    expect(setChat).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: expect.objectContaining({ title: 'Test Recipe' }),
        recipeParameterValues: null,
      })
    );
  });

  it('clearRecipe calls setChat with recipe set to null', () => {
    const chat = makeChat({
      recipe: { title: 'Existing', description: 'recipe' } as Recipe,
    });
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    fireEvent.click(screen.getByTestId('clear-recipe-btn'));

    expect(setChat).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: null,
      })
    );
  });

  it('preserves other chat properties when setting recipe', () => {
    const chat = makeChat({ sessionId: 'sess-42', name: 'Preserved' });
    const setChat = vi.fn();
    renderWithProvider(chat, setChat);

    fireEvent.click(screen.getByTestId('set-recipe-btn'));

    expect(setChat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-42',
        name: 'Preserved',
      })
    );
  });

  it('DEFAULT_CHAT_TITLE is "New Chat"', () => {
    expect(DEFAULT_CHAT_TITLE).toBe('New Chat');
  });

  it('renders children correctly', () => {
    const chat = makeChat();
    const setChat = vi.fn();
    render(
      <ChatProvider chat={chat} setChat={setChat}>
        <div data-testid="child">Hello Child</div>
      </ChatProvider>
    );

    expect(screen.getByTestId('child')).toHaveTextContent('Hello Child');
  });
});
