import { describe, it, expect, vi } from 'vitest';

// Logger imports electron modules (app, path), so we mock them.
// logger.ts imports `path from 'node:path'` which Vite externalizes,
// so we must mock it before the import.

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/test-user-data';
      return '/tmp';
    }),
    isPackaged: false,
  },
}));

vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...parts: string[]) => parts.join('/')),
  },
}));

vi.mock('electron-log', () => {
  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: {
      file: {
        resolvePathFn: null as (() => string) | null,
        level: 'info',
      },
      console: {
        level: 'debug' as string | boolean,
      },
    },
  };
  return { default: mockLog };
});

// Import the module after all mocks are set up (vi.mock is hoisted)
import log from '../logger';

describe('logger', () => {
  it('exports a log object', () => {
    expect(log).toBeDefined();
  });

  it('has transports.file configuration', () => {
    expect(log.transports).toBeDefined();
    expect(log.transports.file).toBeDefined();
  });

  it('has transports.console configuration', () => {
    expect(log.transports.console).toBeDefined();
  });

  it('sets file resolvePathFn', () => {
    // After import, resolvePathFn should have been set by logger.ts
    expect(typeof log.transports.file.resolvePathFn).toBe('function');
  });

  it('resolvePathFn returns a path containing "main.log"', () => {
    const fn = log.transports.file.resolvePathFn as () => string;
    const result = fn();
    expect(result).toContain('main.log');
  });
});
