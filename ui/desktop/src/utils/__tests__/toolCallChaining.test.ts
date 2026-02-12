vi.mock('../../types/message', () => ({
  getToolRequests: (msg: any) => msg._toolRequests || [],
  getToolResponses: (msg: any) => msg._toolResponses || [],
  getTextAndImageContent: (msg: any) => ({
    textContent: msg._text || '',
    imageContent: [],
  }),
}));

import {
  identifyConsecutiveToolCalls,
  shouldHideTimestamp,
  isInChain,
} from '../toolCallChaining';

const makeMessage = (opts: {
  toolRequests?: any[];
  toolResponses?: any[];
  text?: string;
}) => ({
  _toolRequests: opts.toolRequests || [],
  _toolResponses: opts.toolResponses || [],
  _text: opts.text || '',
});

describe('identifyConsecutiveToolCalls', () => {
  it('returns empty chains for empty messages', () => {
    expect(identifyConsecutiveToolCalls([])).toEqual([]);
  });

  it('returns empty chains for text-only messages', () => {
    const messages = [
      makeMessage({ text: 'Hello' }),
      makeMessage({ text: 'World' }),
    ];
    expect(identifyConsecutiveToolCalls(messages as any)).toEqual([]);
  });

  it('returns empty chains for single tool call', () => {
    const messages = [
      makeMessage({ toolRequests: [{ name: 'shell' }] }),
    ];
    // Single tool call is not a chain (chain requires > 1)
    expect(identifyConsecutiveToolCalls(messages as any)).toEqual([]);
  });

  it('identifies chain of consecutive tool-only calls', () => {
    const messages = [
      makeMessage({ toolRequests: [{ name: 'shell' }] }),
      makeMessage({ toolRequests: [{ name: 'text_editor' }] }),
      makeMessage({ toolRequests: [{ name: 'search' }] }),
    ];
    const chains = identifyConsecutiveToolCalls(messages as any);
    expect(chains).toEqual([[0, 1, 2]]);
  });

  it('breaks chain when text message appears', () => {
    const messages = [
      makeMessage({ toolRequests: [{ name: 'shell' }] }),
      makeMessage({ toolRequests: [{ name: 'text_editor' }] }),
      makeMessage({ text: 'Here is the result' }),
      makeMessage({ toolRequests: [{ name: 'search' }] }),
    ];
    const chains = identifyConsecutiveToolCalls(messages as any);
    expect(chains).toEqual([[0, 1]]);
  });

  it('skips tool response-only messages', () => {
    const messages = [
      makeMessage({ toolRequests: [{ name: 'shell' }] }),
      makeMessage({ toolResponses: [{ result: 'ok' }] }),
      makeMessage({ toolRequests: [{ name: 'text_editor' }] }),
    ];
    const chains = identifyConsecutiveToolCalls(messages as any);
    expect(chains).toEqual([[0, 2]]);
  });
});

describe('shouldHideTimestamp', () => {
  it('returns true for non-last messages in a chain', () => {
    const chains = [[0, 1, 2]];
    expect(shouldHideTimestamp(0, chains)).toBe(true);
    expect(shouldHideTimestamp(1, chains)).toBe(true);
  });

  it('returns false for last message in a chain', () => {
    const chains = [[0, 1, 2]];
    expect(shouldHideTimestamp(2, chains)).toBe(false);
  });

  it('returns false for messages not in any chain', () => {
    const chains = [[0, 1]];
    expect(shouldHideTimestamp(5, chains)).toBe(false);
  });
});

describe('isInChain', () => {
  it('returns true for messages that are in a chain', () => {
    const chains = [[0, 1, 2]];
    expect(isInChain(0, chains)).toBe(true);
    expect(isInChain(1, chains)).toBe(true);
    expect(isInChain(2, chains)).toBe(true);
  });

  it('returns false for messages not in a chain', () => {
    const chains = [[0, 1]];
    expect(isInChain(3, chains)).toBe(false);
  });

  it('handles multiple chains', () => {
    const chains = [[0, 1], [5, 6, 7]];
    expect(isInChain(1, chains)).toBe(true);
    expect(isInChain(5, chains)).toBe(true);
    expect(isInChain(3, chains)).toBe(false);
  });
});
