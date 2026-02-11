import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatMessageTimestamp } from '../timeUtils';

describe('timeUtils', () => {
  describe('formatMessageTimestamp', () => {
    let now: Date;

    beforeEach(() => {
      now = new Date('2026-02-11T14:30:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns just time for a timestamp from today', () => {
      // Unix timestamp in seconds for 2026-02-11T10:00:00Z
      const todayTimestamp = Math.floor(new Date('2026-02-11T10:00:00Z').getTime() / 1000);
      const result = formatMessageTimestamp(todayTimestamp);
      // Should be just time, no date portion
      expect(result).not.toContain('/');
      // Should contain AM or PM
      expect(result).toMatch(/AM|PM/);
    });

    it('returns date and time for a timestamp from a different day', () => {
      // Unix timestamp in seconds for 2026-01-15T10:00:00Z
      const pastTimestamp = Math.floor(new Date('2026-01-15T10:00:00Z').getTime() / 1000);
      const result = formatMessageTimestamp(pastTimestamp);
      // Should contain a date portion with slashes
      expect(result).toContain('/');
      // Should contain AM or PM
      expect(result).toMatch(/AM|PM/);
    });

    it('returns current time when no timestamp is provided', () => {
      const result = formatMessageTimestamp();
      // Since it uses "now", it should be today and thus only show time
      expect(result).not.toContain('/');
      expect(result).toMatch(/AM|PM/);
    });

    it('treats timestamp of 0 as falsy (uses current time)', () => {
      // In the source code, `timestamp ? ... : new Date()` treats 0 as falsy
      // so it falls back to current time, which is today
      const result = formatMessageTimestamp(0);
      // Should produce the same result as calling with no argument (today's time only)
      expect(result).not.toContain('/');
      expect(result).toMatch(/AM|PM/);
    });

    it('returns date+time for a past timestamp', () => {
      // Use a real past timestamp (Jan 1 2020 00:00:00 UTC = 1577836800)
      const result = formatMessageTimestamp(1577836800);
      expect(result).toContain('/');
      expect(result).toMatch(/AM|PM/);
    });
  });
});
