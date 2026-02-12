import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_ERROR_MESSAGE_LENGTH,
  createExtensionRecoverHints,
  formatExtensionErrorMessage,
  showExtensionLoadResults,
} from '../extensionErrorUtils';

vi.mock('../../toasts', () => ({
  toastService: {
    error: vi.fn(),
    extensionLoading: vi.fn(),
  },
}));

describe('extensionErrorUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MAX_ERROR_MESSAGE_LENGTH', () => {
    it('is 70', () => {
      expect(MAX_ERROR_MESSAGE_LENGTH).toBe(70);
    });
  });

  describe('createExtensionRecoverHints', () => {
    it('includes the error message in the hint', () => {
      const result = createExtensionRecoverHints('ECONNREFUSED');
      expect(result).toContain('ECONNREFUSED');
    });

    it('mentions extension installation context', () => {
      const result = createExtensionRecoverHints('some error');
      expect(result).toContain('trying to install an extension');
    });

    it('mentions VPN/WARP as a common cause', () => {
      const result = createExtensionRecoverHints('network error');
      expect(result).toContain('WARP');
    });
  });

  describe('formatExtensionErrorMessage', () => {
    it('returns the error message if shorter than MAX_ERROR_MESSAGE_LENGTH', () => {
      const shortMsg = 'Connection refused';
      expect(formatExtensionErrorMessage(shortMsg)).toBe(shortMsg);
    });

    it('returns fallback when message is too long', () => {
      const longMsg = 'x'.repeat(MAX_ERROR_MESSAGE_LENGTH + 10);
      expect(formatExtensionErrorMessage(longMsg)).toBe('Failed to add extension');
    });

    it('uses custom fallback when provided', () => {
      const longMsg = 'x'.repeat(100);
      expect(formatExtensionErrorMessage(longMsg, 'Custom fallback')).toBe('Custom fallback');
    });

    it('returns short message at exactly MAX_ERROR_MESSAGE_LENGTH - 1', () => {
      const exactMsg = 'x'.repeat(MAX_ERROR_MESSAGE_LENGTH - 1);
      expect(formatExtensionErrorMessage(exactMsg)).toBe(exactMsg);
    });
  });

  describe('showExtensionLoadResults', () => {
    it('does nothing for null input', async () => {
      const { toastService } = await import('../../toasts');
      showExtensionLoadResults(null);
      expect(toastService.error).not.toHaveBeenCalled();
      expect(toastService.extensionLoading).not.toHaveBeenCalled();
    });

    it('does nothing for empty array', async () => {
      const { toastService } = await import('../../toasts');
      showExtensionLoadResults([]);
      expect(toastService.error).not.toHaveBeenCalled();
      expect(toastService.extensionLoading).not.toHaveBeenCalled();
    });

    it('shows individual error toast for single failed extension', async () => {
      const { toastService } = await import('../../toasts');
      showExtensionLoadResults([
        { name: 'my-ext', success: false, error: 'ECONNREFUSED' },
      ]);
      expect(toastService.error).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'my-ext',
          msg: 'ECONNREFUSED',
          traceback: 'ECONNREFUSED',
        })
      );
    });

    it('shows grouped toast for multiple extensions', async () => {
      const { toastService } = await import('../../toasts');
      showExtensionLoadResults([
        { name: 'ext-a', success: true },
        { name: 'ext-b', success: false, error: 'timeout' },
      ]);
      expect(toastService.extensionLoading).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'ext-a', status: 'success' }),
          expect.objectContaining({ name: 'ext-b', status: 'error', error: 'timeout' }),
        ]),
        2,
        true
      );
    });

    it('uses "Unknown error" when error is undefined', async () => {
      const { toastService } = await import('../../toasts');
      showExtensionLoadResults([
        { name: 'ext-c', success: false, error: undefined as unknown as string },
      ]);
      expect(toastService.error).toHaveBeenCalledWith(
        expect.objectContaining({
          traceback: 'Unknown error',
        })
      );
    });
  });
});
