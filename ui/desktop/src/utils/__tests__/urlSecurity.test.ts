import { describe, it, expect } from 'vitest';
import {
  WEB_PROTOCOLS,
  BLOCKED_PROTOCOLS,
  SAFE_PROTOCOLS,
  isProtocolSafe,
  getProtocol,
} from '../urlSecurity';

describe('urlSecurity', () => {
  describe('constants', () => {
    it('WEB_PROTOCOLS contains http and https', () => {
      expect(WEB_PROTOCOLS).toContain('http:');
      expect(WEB_PROTOCOLS).toContain('https:');
    });

    it('BLOCKED_PROTOCOLS contains dangerous protocols', () => {
      expect(BLOCKED_PROTOCOLS).toContain('javascript:');
      expect(BLOCKED_PROTOCOLS).toContain('file:');
      expect(BLOCKED_PROTOCOLS).toContain('data:');
      expect(BLOCKED_PROTOCOLS).toContain('vbscript:');
    });

    it('SAFE_PROTOCOLS includes http and https', () => {
      expect(SAFE_PROTOCOLS).toContain('http:');
      expect(SAFE_PROTOCOLS).toContain('https:');
    });

    it('SAFE_PROTOCOLS includes common app protocols', () => {
      expect(SAFE_PROTOCOLS).toContain('mailto:');
      expect(SAFE_PROTOCOLS).toContain('tel:');
      expect(SAFE_PROTOCOLS).toContain('vscode:');
      expect(SAFE_PROTOCOLS).toContain('slack:');
    });

    it('blocked and safe protocols do not overlap', () => {
      const overlap = BLOCKED_PROTOCOLS.filter((p) => SAFE_PROTOCOLS.includes(p));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('isProtocolSafe', () => {
    it('returns true for https URLs', () => {
      expect(isProtocolSafe('https://example.com')).toBe(true);
    });

    it('returns true for http URLs', () => {
      expect(isProtocolSafe('http://example.com')).toBe(true);
    });

    it('returns true for mailto URLs', () => {
      expect(isProtocolSafe('mailto:user@example.com')).toBe(true);
    });

    it('returns true for vscode URLs', () => {
      expect(isProtocolSafe('vscode://extension/install')).toBe(true);
    });

    it('returns false for javascript URLs', () => {
      expect(isProtocolSafe('javascript:alert(1)')).toBe(false);
    });

    it('returns false for data URLs', () => {
      expect(isProtocolSafe('data:text/html,<h1>hi</h1>')).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isProtocolSafe('not a url')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isProtocolSafe('')).toBe(false);
    });

    it('returns true for goose protocol', () => {
      expect(isProtocolSafe('goose://action')).toBe(true);
    });
  });

  describe('getProtocol', () => {
    it('returns https: for https URLs', () => {
      expect(getProtocol('https://example.com')).toBe('https:');
    });

    it('returns http: for http URLs', () => {
      expect(getProtocol('http://example.com')).toBe('http:');
    });

    it('returns mailto: for mailto URLs', () => {
      expect(getProtocol('mailto:user@example.com')).toBe('mailto:');
    });

    it('returns null for invalid URLs', () => {
      expect(getProtocol('not a url')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getProtocol('')).toBeNull();
    });
  });
});
