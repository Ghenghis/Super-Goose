import { backendApi } from '../backendApi';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('backendApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeatureStatus', () => {
    it('returns feature list on success', async () => {
      const features = [{ name: 'memory', enabled: true }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(features),
      });
      const result = await backendApi.getFeatureStatus();
      expect(result).toEqual(features);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/features');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await backendApi.getFeatureStatus();
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await backendApi.getFeatureStatus();
      expect(result).toBeNull();
    });
  });

  describe('toggleFeature', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.toggleFeature('memory', true);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/features/memory',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: true }),
        })
      );
    });

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const result = await backendApi.toggleFeature('memory', false);
      expect(result).toBe(false);
    });
  });

  describe('getCostSummary', () => {
    it('returns cost summary on success', async () => {
      const summary = { totalCost: 1.5, sessionCost: 0.5, budgetLimit: 10, breakdown: {} };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(summary),
      });
      const result = await backendApi.getCostSummary();
      expect(result).toEqual(summary);
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getCostSummary();
      expect(result).toBeNull();
    });
  });

  describe('setBudgetLimit', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.setBudgetLimit(50);
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.setBudgetLimit(50);
      expect(result).toBe(false);
    });
  });

  describe('searchSessions', () => {
    it('URL-encodes the query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await backendApi.searchSessions('hello world');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/sessions/search?q=hello%20world'
      );
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.searchSessions('test');
      expect(result).toBeNull();
    });
  });

  describe('getBookmarks', () => {
    it('returns bookmarks on success', async () => {
      const bookmarks = [{ id: '1', sessionId: 's1', label: 'test', createdAt: '2026-01-01' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(bookmarks),
      });
      const result = await backendApi.getBookmarks();
      expect(result).toEqual(bookmarks);
    });
  });

  describe('createBookmark', () => {
    it('sends POST with sessionId and label', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.createBookmark('sess-1', 'My Bookmark');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/bookmarks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: 'sess-1', label: 'My Bookmark' }),
        })
      );
    });
  });

  describe('deleteBookmark', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.deleteBookmark('bk-1');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/bookmarks/bk-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
