import { describe, it, expect } from 'vitest';
import { errorMessage, formatAppName } from '../conversionUtils';

// Note: safeJsonParse and compressImageDataUrl require complex mocks
// (Response, Image, Canvas) and are tested lightly here.

describe('conversionUtils', () => {
  describe('errorMessage', () => {
    it('returns message from Error instance', () => {
      expect(errorMessage(new Error('test error'))).toBe('test error');
    });

    it('returns message from object with message property', () => {
      expect(errorMessage({ message: 'obj error' })).toBe('obj error');
    });

    it('returns default_value for non-Error non-object values', () => {
      expect(errorMessage('string error', 'default')).toBe('default');
    });

    it('returns stringified value when no default provided', () => {
      expect(errorMessage('raw string')).toBe('raw string');
    });

    it('returns stringified value for number', () => {
      expect(errorMessage(42)).toBe('42');
    });

    it('handles null', () => {
      expect(errorMessage(null, 'fallback')).toBe('fallback');
    });

    it('handles undefined', () => {
      expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    });

    it('handles null without default', () => {
      expect(errorMessage(null)).toBe('null');
    });
  });

  describe('formatAppName', () => {
    it('formats hyphenated names', () => {
      expect(formatAppName('my-app-name')).toBe('My App Name');
    });

    it('formats underscored names', () => {
      expect(formatAppName('my_app_name')).toBe('My App Name');
    });

    it('formats space-separated names', () => {
      expect(formatAppName('my app name')).toBe('My App Name');
    });

    it('formats mixed separators', () => {
      expect(formatAppName('my-app_name test')).toBe('My App Name Test');
    });

    it('handles single word', () => {
      expect(formatAppName('hello')).toBe('Hello');
    });

    it('handles empty string', () => {
      expect(formatAppName('')).toBe('');
    });

    it('handles uppercase input', () => {
      expect(formatAppName('MY-APP')).toBe('My App');
    });

    it('filters out extra separators', () => {
      expect(formatAppName('my--app')).toBe('My App');
    });
  });
});
