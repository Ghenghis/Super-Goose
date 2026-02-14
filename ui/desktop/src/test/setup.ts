import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Polyfill scrollIntoView for jsdom (not implemented, used by AnimatedPipeline etc.)
Element.prototype.scrollIntoView = vi.fn();

// Polyfill ResizeObserver for jsdom (required by Radix ScrollArea, etc.)
globalThis.ResizeObserver = globalThis.ResizeObserver ?? class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Electron modules before any imports
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/test-user-data';
      if (name === 'temp') return '/tmp';
      if (name === 'home') return '/tmp/home';
      return '/tmp';
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// This is the standard setup to ensure that React Testing Library's
// automatic cleanup runs after each test.
afterEach(() => {
  cleanup();
});

// Mock console methods to avoid noise in tests
// eslint-disable-next-line no-undef
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock window.navigator.clipboard for copy functionality tests
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

// Mock localStorage and sessionStorage
const storageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

Object.defineProperty(window, 'localStorage', {
  value: storageMock,
  writable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: { ...storageMock },
  writable: true,
});

// Mock window.appConfig for getApiUrl() (used across all API-calling code)
Object.defineProperty(window, 'appConfig', {
  writable: true,
  value: {
    get: vi.fn((key: string) => {
      if (key === 'GOOSE_API_HOST') return 'http://localhost:3284';
      if (key === 'GOOSE_WORKING_DIR') return '/tmp/test-working-dir';
      return undefined;
    }),
    set: vi.fn(),
  },
});

// Mock window.electron for renderer process
Object.defineProperty(window, 'electron', {
  writable: true,
  value: {
    platform: 'darwin',
    getSettings: vi.fn(() =>
      Promise.resolve({
        envToggles: {
          GOOSE_SERVER__MEMORY: false,
          GOOSE_SERVER__COMPUTER_CONTROLLER: false,
        },
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        keyboardShortcuts: {
          focusWindow: 'CommandOrControl+Alt+G',
          quickLauncher: 'CommandOrControl+Alt+Shift+G',
          newChat: 'CommandOrControl+T',
          newChatWindow: 'CommandOrControl+N',
          openDirectory: 'CommandOrControl+O',
          settings: 'CommandOrControl+,',
          find: 'CommandOrControl+F',
          findNext: 'CommandOrControl+G',
          findPrevious: 'CommandOrControl+Shift+G',
          alwaysOnTop: 'CommandOrControl+Shift+T',
        },
      })
    ),
    saveSettings: vi.fn(() => Promise.resolve(true)),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
  },
});
