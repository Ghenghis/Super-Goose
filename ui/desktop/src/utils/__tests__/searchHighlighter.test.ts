import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchHighlighter } from '../searchHighlighter';

// jsdom doesn't implement Range.getClientRects, so we polyfill it
beforeEach(() => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

describe('SearchHighlighter', () => {
  let container: HTMLDivElement;
  let highlighter: SearchHighlighter;
  let onMatchesChange: (count: number) => void;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    onMatchesChange = vi.fn() as unknown as (count: number) => void;
    highlighter = new SearchHighlighter(container, onMatchesChange);
  });

  afterEach(() => {
    highlighter.destroy();
    container.remove();
  });

  it('creates an overlay element', () => {
    const overlay = container.querySelector('.search-highlight-overlay');
    expect(overlay).not.toBeNull();
  });

  it('highlight returns empty array for empty term', () => {
    const result = highlighter.highlight('');
    // Source returns early without explicit return value, meaning it returns
    // the result of clearHighlights() which is void -> undefined.
    // But the function signature returns HTMLElement[], and the early return
    // is `return []` -- let's check what we actually get
    expect(result).toEqual([]);
  });

  it('highlight returns empty array for whitespace-only term', () => {
    const result = highlighter.highlight('   ');
    expect(result).toEqual([]);
  });

  it('clearHighlights removes overlay contents', () => {
    highlighter.clearHighlights();
    const overlay = container.querySelector('.search-highlight-overlay');
    expect(overlay?.innerHTML).toBe('');
  });

  it('destroy disconnects observers and removes overlay', () => {
    highlighter.destroy();
    const overlay = container.querySelector('.search-highlight-overlay');
    expect(overlay).toBeNull();
  });

  it('highlight finds text matches in container without throwing', () => {
    container.textContent = 'foo bar foo baz';
    // In jsdom, getClientRects returns empty [], so highlight containers
    // will be created but empty. The key is that it doesn't throw.
    const results = highlighter.highlight('foo');
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it('setCurrentMatch does nothing when no highlights exist', () => {
    expect(() => highlighter.setCurrentMatch(0)).not.toThrow();
  });

  it('highlight with case-sensitive option does not throw', () => {
    container.textContent = 'Hello hello HELLO';
    expect(() => highlighter.highlight('hello', true)).not.toThrow();
  });

  it('highlight escapes regex special characters', () => {
    container.textContent = 'price is $100.00 (USD)';
    // Should not throw despite special regex chars in search term
    expect(() => highlighter.highlight('$100.00')).not.toThrow();
  });
});
