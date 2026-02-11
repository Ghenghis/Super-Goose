import { describe, it, expect, vi } from 'vitest';

// Note: pathUtils.ts imports `node:path` and `node:os` which Vite externalizes
// in jsdom environment. We mock node:os so that os.homedir() works for the
// `~ === filePath` branch, but path.join cannot be mocked for the source module
// due to Vite's SSR externalization. Tests that require path.join are skipped.

vi.mock('node:os', () => ({
  default: { homedir: () => '/home/testuser' },
  homedir: () => '/home/testuser',
}));

import { expandTilde } from '../pathUtils';

describe('pathUtils', () => {
  describe('expandTilde', () => {
    it('returns empty string as-is', () => {
      expect(expandTilde('')).toBe('');
    });

    it('returns null as-is', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(expandTilde(null as any)).toBeNull();
    });

    it('returns undefined as-is', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(expandTilde(undefined as any)).toBeUndefined();
    });

    it('returns non-string values as-is', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(expandTilde(123 as any)).toBe(123);
    });

    it('expands bare tilde to home directory', () => {
      // The `~` exact-match branch uses os.homedir() directly, no path.join needed
      expect(expandTilde('~')).toBe('/home/testuser');
    });

    it('leaves an absolute path unchanged', () => {
      expect(expandTilde('/usr/local/bin')).toBe('/usr/local/bin');
    });

    it('leaves a relative path without tilde unchanged', () => {
      expect(expandTilde('relative/path')).toBe('relative/path');
    });

    it('leaves a Windows absolute path unchanged', () => {
      expect(expandTilde('C:\\Users\\test')).toBe('C:\\Users\\test');
    });

    it('leaves a dot path unchanged', () => {
      expect(expandTilde('.')).toBe('.');
    });

    it('leaves a double-dot path unchanged', () => {
      expect(expandTilde('..')).toBe('..');
    });

    // Note: Tests for `~/path` and `~somepath` branches require path.join,
    // which is unavailable due to Vite's jsdom externalization of node:path.
    // Those code paths are integration-tested in the Electron runtime.
  });
});
