import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupSessionsByDate } from '../dateUtils';
import type { Session } from '../../api';

// Minimal session factory for testing
function makeSession(overrides: Partial<Session> & { id: string; updated_at: string }): Session {
  return {
    created_at: overrides.updated_at,
    extension_data: {},
    message_count: 0,
    name: 'test',
    working_dir: '/tmp',
    ...overrides,
  };
}

describe('dateUtils', () => {
  describe('groupSessionsByDate', () => {
    let now: Date;

    beforeEach(() => {
      // Fix "now" to 2026-02-11T12:00:00Z
      now = new Date('2026-02-11T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns an empty array for empty input', () => {
      expect(groupSessionsByDate([])).toEqual([]);
    });

    it('groups a session from today under "Today"', () => {
      const session = makeSession({
        id: '1',
        updated_at: '2026-02-11T10:00:00Z',
      });
      const groups = groupSessionsByDate([session]);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Today');
      expect(groups[0].sessions).toHaveLength(1);
    });

    it('groups a session from yesterday under "Yesterday"', () => {
      const session = makeSession({
        id: '2',
        updated_at: '2026-02-10T15:00:00Z',
      });
      const groups = groupSessionsByDate([session]);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Yesterday');
    });

    it('groups an older session from the same year with weekday+month+day label', () => {
      const session = makeSession({
        id: '3',
        updated_at: '2026-01-15T10:00:00Z',
      });
      const groups = groupSessionsByDate([session]);
      expect(groups).toHaveLength(1);
      // Should contain month name and day number (locale-dependent but en-US)
      expect(groups[0].label).toContain('January');
      expect(groups[0].label).toContain('15');
    });

    it('groups a session from a previous year with month+day+year label', () => {
      const session = makeSession({
        id: '4',
        updated_at: '2025-06-01T10:00:00Z',
      });
      const groups = groupSessionsByDate([session]);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toContain('June');
      expect(groups[0].label).toContain('2025');
    });

    it('groups multiple sessions on the same day together', () => {
      const s1 = makeSession({ id: '5', updated_at: '2026-02-11T08:00:00Z' });
      const s2 = makeSession({ id: '6', updated_at: '2026-02-11T09:00:00Z' });
      const groups = groupSessionsByDate([s1, s2]);
      expect(groups).toHaveLength(1);
      expect(groups[0].sessions).toHaveLength(2);
    });

    it('separates sessions from different days into different groups', () => {
      const todaySession = makeSession({ id: '7', updated_at: '2026-02-11T08:00:00Z' });
      const yesterdaySession = makeSession({ id: '8', updated_at: '2026-02-10T08:00:00Z' });
      const olderSession = makeSession({ id: '9', updated_at: '2026-01-05T08:00:00Z' });
      const groups = groupSessionsByDate([todaySession, yesterdaySession, olderSession]);
      expect(groups).toHaveLength(3);
    });

    it('sorts groups by date descending (newest first)', () => {
      const olderSession = makeSession({ id: '10', updated_at: '2026-01-01T08:00:00Z' });
      const todaySession = makeSession({ id: '11', updated_at: '2026-02-11T08:00:00Z' });
      const groups = groupSessionsByDate([olderSession, todaySession]);
      expect(groups[0].label).toBe('Today');
    });
  });
});
