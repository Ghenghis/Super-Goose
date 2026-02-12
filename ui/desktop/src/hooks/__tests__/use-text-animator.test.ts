import { renderHook } from '@testing-library/react';

// Mock SplitType
vi.mock('split-type', () => ({
  default: class MockSplitType {
    lines: HTMLElement[] = [];
    words: HTMLElement[] = [];
    chars: HTMLElement[] = [];

    constructor(el: HTMLElement) {
      // Create mock char elements
      const text = el.textContent || '';
      this.chars = text.split('').map((ch) => {
        const span = document.createElement('span');
        span.textContent = ch;
        return span;
      });
    }

    split() {
      return this;
    }
  },
}));

import { TextSplitter, TextAnimator, useTextAnimator } from '../use-text-animator';

describe('TextSplitter', () => {
  it('throws on invalid element', () => {
    expect(() => new TextSplitter(null as any)).toThrow('Invalid text element provided.');
  });

  it('creates a splitter from a valid element', () => {
    const el = document.createElement('div');
    el.textContent = 'Hello';
    const splitter = new TextSplitter(el);
    expect(splitter.getChars().length).toBe(5);
  });

  it('returns lines from split text', () => {
    const el = document.createElement('div');
    el.textContent = 'Test';
    const splitter = new TextSplitter(el);
    expect(splitter.getLines()).toEqual([]);
  });

  it('accepts custom split types', () => {
    const el = document.createElement('div');
    el.textContent = 'Test';
    const splitter = new TextSplitter(el, { splitTypeTypes: ['chars'] });
    expect(splitter.getChars().length).toBe(4);
  });
});

describe('TextAnimator', () => {
  it('throws on invalid element', () => {
    expect(() => new TextAnimator(null as any)).toThrow('Invalid text element provided.');
  });

  it('creates animator from valid element', () => {
    const el = document.createElement('div');
    el.textContent = 'Hi';
    const animator = new TextAnimator(el);
    expect(animator.originalChars).toEqual(['H', 'i']);
  });

  it('reset restores original characters', () => {
    const el = document.createElement('div');
    el.textContent = 'AB';
    const animator = new TextAnimator(el);

    // Modify chars
    const chars = animator.splitter.getChars();
    chars[0].textContent = 'X';

    animator.reset();
    expect(chars[0].textContent).toBe('A');
    expect(chars[1].textContent).toBe('B');
  });
});

describe('useTextAnimator', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() => useTextAnimator({ text: 'Hello' }));
    expect(result.current).toHaveProperty('current');
  });

  it('ref is initially null', () => {
    const { result } = renderHook(() => useTextAnimator({ text: 'Hello' }));
    expect(result.current.current).toBeNull();
  });
});
