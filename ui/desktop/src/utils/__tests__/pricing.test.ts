import { describe, it, expect, vi } from 'vitest';
import { fetchModelPricing } from '../pricing';

// Mock the api module
vi.mock('../../api', () => ({
  getPricing: vi.fn(),
}));

import { getPricing } from '../../api';

const mockedGetPricing = vi.mocked(getPricing);

describe('pricing', () => {
  describe('fetchModelPricing', () => {
    it('returns pricing data when API responds with data', async () => {
      const mockPricing = { input: 0.01, output: 0.03 };
      mockedGetPricing.mockResolvedValue({
        data: { pricing: [mockPricing] },
      } as never);

      const result = await fetchModelPricing('openai', 'gpt-4');
      expect(result).toEqual(mockPricing);
      expect(mockedGetPricing).toHaveBeenCalledWith({
        body: { provider: 'openai', model: 'gpt-4' },
        throwOnError: false,
      });
    });

    it('returns null when API responds with no data', async () => {
      mockedGetPricing.mockResolvedValue({
        data: undefined,
      } as never);

      const result = await fetchModelPricing('openai', 'gpt-4');
      expect(result).toBeNull();
    });

    it('returns null when pricing array is empty', async () => {
      mockedGetPricing.mockResolvedValue({
        data: { pricing: [] },
      } as never);

      const result = await fetchModelPricing('openai', 'gpt-4');
      expect(result).toBeNull();
    });

    it('returns null when API throws', async () => {
      mockedGetPricing.mockRejectedValue(new Error('network error'));

      const result = await fetchModelPricing('openai', 'gpt-4');
      expect(result).toBeNull();
    });

    it('returns the first pricing entry when multiple exist', async () => {
      const first = { input: 0.01, output: 0.03 };
      const second = { input: 0.02, output: 0.06 };
      mockedGetPricing.mockResolvedValue({
        data: { pricing: [first, second] },
      } as never);

      const result = await fetchModelPricing('anthropic', 'claude-3');
      expect(result).toEqual(first);
    });
  });
});
