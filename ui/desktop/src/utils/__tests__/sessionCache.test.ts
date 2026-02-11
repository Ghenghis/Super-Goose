import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearSessionCache,
  clearAllSessionCache,
  isSessionCached,
  getCachedSession,
  preloadSession,
  getCacheSize,
  loadSession,
} from '../sessionCache';
import type { Session } from '../../api';

// Mock config module
vi.mock('../../config', () => ({
  getApiUrl: vi.fn((endpoint: string) => `http://localhost:3000${endpoint}`),
}));

// Provide window.electron.getSecretKey
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electron = {
    ...window.electron,
    getSecretKey: vi.fn(() => Promise.resolve('test-secret')),
  };
});

function makeSession(id: string): Session {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    extension_data: {},
    message_count: 0,
    name: `session-${id}`,
    working_dir: '/tmp',
  };
}

describe('sessionCache', () => {
  beforeEach(() => {
    clearAllSessionCache();
    vi.restoreAllMocks();
  });

  describe('preloadSession', () => {
    it('adds a session to the cache', () => {
      const session = makeSession('abc');
      preloadSession(session);
      expect(isSessionCached('abc')).toBe(true);
    });
  });

  describe('getCachedSession', () => {
    it('returns undefined for uncached session', () => {
      expect(getCachedSession('nonexistent')).toBeUndefined();
    });

    it('returns the cached session', () => {
      const session = makeSession('def');
      preloadSession(session);
      expect(getCachedSession('def')).toEqual(session);
    });
  });

  describe('isSessionCached', () => {
    it('returns false for uncached session', () => {
      expect(isSessionCached('nope')).toBe(false);
    });

    it('returns true after preloading', () => {
      preloadSession(makeSession('yes'));
      expect(isSessionCached('yes')).toBe(true);
    });
  });

  describe('clearSessionCache', () => {
    it('removes a specific session from cache', () => {
      preloadSession(makeSession('a'));
      preloadSession(makeSession('b'));
      clearSessionCache('a');
      expect(isSessionCached('a')).toBe(false);
      expect(isSessionCached('b')).toBe(true);
    });
  });

  describe('clearAllSessionCache', () => {
    it('removes all sessions from cache', () => {
      preloadSession(makeSession('x'));
      preloadSession(makeSession('y'));
      clearAllSessionCache();
      expect(getCacheSize()).toBe(0);
    });
  });

  describe('getCacheSize', () => {
    it('returns 0 for empty cache', () => {
      expect(getCacheSize()).toBe(0);
    });

    it('returns correct count after preloading', () => {
      preloadSession(makeSession('1'));
      preloadSession(makeSession('2'));
      preloadSession(makeSession('3'));
      expect(getCacheSize()).toBe(3);
    });
  });

  describe('loadSession', () => {
    it('returns cached session without fetching when available', async () => {
      const session = makeSession('cached-id');
      preloadSession(session);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await loadSession('cached-id');
      expect(result).toEqual(session);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetches from API when not cached', async () => {
      const session = makeSession('remote-id');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(session),
      } as Response);

      const result = await loadSession('remote-id');
      expect(result).toEqual(session);
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('throws on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      } as unknown as Response);

      await expect(loadSession('missing-id')).rejects.toThrow('Error loading session');
    });

    it('bypasses cache when forceRefresh is true', async () => {
      const oldSession = makeSession('refresh-id');
      preloadSession(oldSession);

      const newSession = { ...makeSession('refresh-id'), name: 'updated' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(newSession),
      } as Response);

      const result = await loadSession('refresh-id', true);
      expect(result.name).toBe('updated');
    });
  });
});
