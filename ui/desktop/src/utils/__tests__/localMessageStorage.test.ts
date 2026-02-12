import { LocalMessageStorage } from '../localMessageStorage';

describe('LocalMessageStorage', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => storage[key] ?? null);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      storage[key] = value;
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation((key: string) => {
      delete storage[key];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a message to storage', () => {
    LocalMessageStorage.addMessage('hello');
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages).toContain('hello');
  });

  it('returns messages in reverse order (most recent first)', () => {
    LocalMessageStorage.addMessage('first');
    LocalMessageStorage.addMessage('second');
    LocalMessageStorage.addMessage('third');
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages[0]).toBe('third');
    expect(messages[1]).toBe('second');
    expect(messages[2]).toBe('first');
  });

  it('does not add empty/whitespace messages', () => {
    LocalMessageStorage.addMessage('   ');
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages).toHaveLength(0);
  });

  it('does not add duplicate of last message', () => {
    LocalMessageStorage.addMessage('hello');
    LocalMessageStorage.addMessage('hello');
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages).toHaveLength(1);
  });

  it('allows same message if not the last one', () => {
    LocalMessageStorage.addMessage('hello');
    LocalMessageStorage.addMessage('world');
    LocalMessageStorage.addMessage('hello');
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages).toHaveLength(3);
  });

  it('clears all history', () => {
    LocalMessageStorage.addMessage('hello');
    LocalMessageStorage.clearHistory();
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages).toHaveLength(0);
  });

  it('filters out expired messages (older than 30 days)', () => {
    const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000;
    storage['goose-chat-history'] = JSON.stringify([
      { content: 'old', timestamp: oldTimestamp },
      { content: 'new', timestamp: Date.now() },
    ]);
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages).toEqual(['new']);
  });

  it('limits to 500 messages', () => {
    const manyMessages = Array.from({ length: 505 }, (_, i) => ({
      content: `msg-${i}`,
      timestamp: Date.now(),
    }));
    storage['goose-chat-history'] = JSON.stringify(manyMessages);
    const messages = LocalMessageStorage.getRecentMessages();
    expect(messages.length).toBeLessThanOrEqual(500);
  });
});
