import { describe, it, expect } from 'vitest';
import {
  getKeyboardShortcuts,
  defaultKeyboardShortcuts,
  type Settings,
  type KeyboardShortcuts,
} from '../settings';

describe('settings', () => {
  describe('defaultKeyboardShortcuts', () => {
    it('has all expected shortcut keys', () => {
      expect(defaultKeyboardShortcuts.focusWindow).toBe('CommandOrControl+Alt+G');
      expect(defaultKeyboardShortcuts.quickLauncher).toBe('CommandOrControl+Alt+Shift+G');
      expect(defaultKeyboardShortcuts.newChat).toBe('CommandOrControl+T');
      expect(defaultKeyboardShortcuts.newChatWindow).toBe('CommandOrControl+N');
      expect(defaultKeyboardShortcuts.openDirectory).toBe('CommandOrControl+O');
      expect(defaultKeyboardShortcuts.settings).toBe('CommandOrControl+,');
      expect(defaultKeyboardShortcuts.find).toBe('CommandOrControl+F');
      expect(defaultKeyboardShortcuts.findNext).toBe('CommandOrControl+G');
      expect(defaultKeyboardShortcuts.findPrevious).toBe('CommandOrControl+Shift+G');
      expect(defaultKeyboardShortcuts.alwaysOnTop).toBe('CommandOrControl+Shift+T');
    });
  });

  describe('getKeyboardShortcuts', () => {
    it('returns default shortcuts when settings has no keyboardShortcuts or globalShortcut', () => {
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
      };
      const result = getKeyboardShortcuts(settings);
      expect(result).toEqual(defaultKeyboardShortcuts);
    });

    it('returns custom keyboardShortcuts when provided', () => {
      const custom: KeyboardShortcuts = {
        focusWindow: 'Alt+F1',
        quickLauncher: 'Alt+F2',
        newChat: 'Ctrl+T',
        newChatWindow: 'Ctrl+N',
        openDirectory: 'Ctrl+O',
        settings: 'Ctrl+,',
        find: 'Ctrl+F',
        findNext: 'Ctrl+G',
        findPrevious: 'Ctrl+Shift+G',
        alwaysOnTop: null,
      };
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        keyboardShortcuts: custom,
      };
      const result = getKeyboardShortcuts(settings);
      expect(result).toEqual(custom);
    });

    it('migrates globalShortcut to focusWindow when keyboardShortcuts is absent', () => {
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        globalShortcut: 'CommandOrControl+Alt+X',
      };
      const result = getKeyboardShortcuts(settings);
      expect(result.focusWindow).toBe('CommandOrControl+Alt+X');
    });

    it('derives quickLauncher by adding Shift to globalShortcut', () => {
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        globalShortcut: 'CommandOrControl+Alt+G',
      };
      const result = getKeyboardShortcuts(settings);
      expect(result.quickLauncher).toBe('CommandOrControl+Alt+Shift+G');
    });

    it('keeps quickLauncher same as focusWindow if it already contains Shift', () => {
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        globalShortcut: 'CommandOrControl+Shift+G',
      };
      const result = getKeyboardShortcuts(settings);
      expect(result.quickLauncher).toBe('CommandOrControl+Shift+G');
    });

    it('handles null globalShortcut', () => {
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        globalShortcut: null,
      };
      const result = getKeyboardShortcuts(settings);
      expect(result.focusWindow).toBeNull();
      expect(result.quickLauncher).toBeNull();
    });

    it('preserves other default shortcuts when migrating globalShortcut', () => {
      const settings: Settings = {
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        globalShortcut: 'Alt+G',
      };
      const result = getKeyboardShortcuts(settings);
      expect(result.newChat).toBe(defaultKeyboardShortcuts.newChat);
      expect(result.settings).toBe(defaultKeyboardShortcuts.settings);
    });
  });
});
