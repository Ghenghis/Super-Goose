import { describe, it, expect } from 'vitest';

// Pure logic functions extracted for testing
// (These mirror the logic in goosed.ts supervisor)

const OTA_EXIT_CODE = 42;
const MAX_RESTARTS = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 60000;
const STABILITY_WINDOW_MS = 300000;

function calculateDelay(exitCode: number | null, restartCount: number): number {
  if (exitCode === OTA_EXIT_CODE) return 500;
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, restartCount), BACKOFF_CAP_MS);
}

function shouldRestart(
  _exitCode: number | null,
  restartCount: number,
  shuttingDown: boolean,
): boolean {
  if (shuttingDown) return false;
  if (restartCount >= MAX_RESTARTS) return false;
  return true;
}

function shouldResetCounter(processUptime: number): boolean {
  return processUptime > STABILITY_WINDOW_MS;
}

describe('Goosed Process Supervisor', () => {
  describe('calculateDelay', () => {
    it('returns 500ms for OTA exit code (42)', () => {
      expect(calculateDelay(OTA_EXIT_CODE, 0)).toBe(500);
      expect(calculateDelay(OTA_EXIT_CODE, 5)).toBe(500);
    });

    it('returns exponential backoff for crash exit codes', () => {
      expect(calculateDelay(1, 0)).toBe(1000);   // 1s
      expect(calculateDelay(1, 1)).toBe(2000);   // 2s
      expect(calculateDelay(1, 2)).toBe(4000);   // 4s
      expect(calculateDelay(1, 3)).toBe(8000);   // 8s
      expect(calculateDelay(1, 4)).toBe(16000);  // 16s
    });

    it('caps backoff at 60 seconds', () => {
      expect(calculateDelay(1, 10)).toBe(60000);
      expect(calculateDelay(1, 20)).toBe(60000);
    });

    it('handles null exit code like a crash', () => {
      expect(calculateDelay(null, 0)).toBe(1000);
    });

    it('handles exit code 0 with backoff (not OTA)', () => {
      // Exit 0 from old behavior — still gets backoff
      expect(calculateDelay(0, 0)).toBe(1000);
    });
  });

  describe('shouldRestart', () => {
    it('returns false when shutting down', () => {
      expect(shouldRestart(1, 0, true)).toBe(false);
      expect(shouldRestart(OTA_EXIT_CODE, 0, true)).toBe(false);
    });

    it('returns false when max restarts exceeded', () => {
      expect(shouldRestart(1, MAX_RESTARTS, false)).toBe(false);
      expect(shouldRestart(1, MAX_RESTARTS + 1, false)).toBe(false);
    });

    it('returns true for normal crash within limits', () => {
      expect(shouldRestart(1, 0, false)).toBe(true);
      expect(shouldRestart(1, 5, false)).toBe(true);
      expect(shouldRestart(1, MAX_RESTARTS - 1, false)).toBe(true);
    });

    it('returns true for OTA restart within limits', () => {
      expect(shouldRestart(OTA_EXIT_CODE, 0, false)).toBe(true);
      expect(shouldRestart(OTA_EXIT_CODE, 9, false)).toBe(true);
    });
  });

  describe('shouldResetCounter', () => {
    it('returns true after stability window', () => {
      expect(shouldResetCounter(STABILITY_WINDOW_MS + 1)).toBe(true);
      expect(shouldResetCounter(600000)).toBe(true);
    });

    it('returns false within stability window', () => {
      expect(shouldResetCounter(0)).toBe(false);
      expect(shouldResetCounter(60000)).toBe(false);
      expect(shouldResetCounter(STABILITY_WINDOW_MS)).toBe(false);
    });
  });

  describe('restart scenarios', () => {
    it('immediate restart after OTA update', () => {
      const delay = calculateDelay(OTA_EXIT_CODE, 0);
      const restart = shouldRestart(OTA_EXIT_CODE, 0, false);
      expect(restart).toBe(true);
      expect(delay).toBe(500);
    });

    it('escalating delays on repeated crashes', () => {
      const delays: number[] = [];
      for (let i = 0; i < 7; i++) {
        delays.push(calculateDelay(1, i));
      }
      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000]);
    });

    it('stops restarting after max attempts', () => {
      for (let i = 0; i < MAX_RESTARTS; i++) {
        expect(shouldRestart(1, i, false)).toBe(true);
      }
      expect(shouldRestart(1, MAX_RESTARTS, false)).toBe(false);
    });

    it('resets after long stable run then crashes again', () => {
      // Simulates: crash 3 times, then stable for 10 min, then crash again
      expect(shouldResetCounter(600001)).toBe(true); // would reset
      expect(shouldRestart(1, 0, false)).toBe(true); // fresh count
      expect(calculateDelay(1, 0)).toBe(1000); // base delay
    });
  });
});
