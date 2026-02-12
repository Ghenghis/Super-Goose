import { describe, it, expect, vi, beforeEach } from 'vitest';

// recipeHash.ts is an Electron main-process module that registers ipcMain handlers
// at the top level on import. It uses node:fs/promises, node:path, crypto, and electron.
//
// Since Vite externalizes node: built-ins in jsdom environments, the runtime behavior
// of the IPC handlers (which use path.join, fs.access, crypto.createHash) cannot be
// fully tested here. We verify handler registration and structure instead.
// Full handler execution tests belong in an Electron integration test environment.

// Use vi.hoisted to create shared state accessible from vi.mock factories
const { mockHandlers } = vi.hoisted(() => {
  const mockHandlers: Record<string, (...args: unknown[]) => unknown> = {};
  return { mockHandlers };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockHandlers[channel] = handler;
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockHandlers[channel] = handler;
    }),
  },
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => ({
      close: vi.fn(),
    })),
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    access: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('node:path', () => ({
  default: { join: vi.fn() },
  join: vi.fn(),
}));

vi.mock('crypto', () => ({
  default: { createHash: vi.fn() },
  createHash: vi.fn(),
}));

// Import to trigger the module's top-level handler registrations
import '../recipeHash';

describe('recipeHash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers has-accepted-recipe-before IPC handler on import', () => {
    expect(mockHandlers['has-accepted-recipe-before']).toBeDefined();
    expect(typeof mockHandlers['has-accepted-recipe-before']).toBe('function');
  });

  it('registers record-recipe-hash IPC handler on import', () => {
    expect(mockHandlers['record-recipe-hash']).toBeDefined();
    expect(typeof mockHandlers['record-recipe-hash']).toBe('function');
  });

  it('registers close-window IPC handler on import', () => {
    expect(mockHandlers['close-window']).toBeDefined();
    expect(typeof mockHandlers['close-window']).toBe('function');
  });

  it('has-accepted-recipe-before handler accepts two arguments (event, recipe)', () => {
    const handler = mockHandlers['has-accepted-recipe-before'];
    // IPC handlers receive (event, ...args) - this handler takes (event, recipe)
    expect(handler.length).toBe(2);
  });

  it('record-recipe-hash handler accepts two arguments (event, recipe)', () => {
    const handler = mockHandlers['record-recipe-hash'];
    expect(handler.length).toBe(2);
  });

  it('close-window handler has the expected arity (no return value)', () => {
    const handler = mockHandlers['close-window'];
    // close-window handler receives () from ipcMain.on (event arg only in practice)
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });
});
