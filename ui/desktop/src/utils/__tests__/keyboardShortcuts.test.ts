import { getNavigationShortcutText, getSearchShortcutText } from '../keyboardShortcuts';

describe('keyboardShortcuts', () => {
  describe('getNavigationShortcutText', () => {
    it('returns Mac shortcut on darwin', () => {
      (window as any).electron = { platform: 'darwin' };
      const result = getNavigationShortcutText();
      expect(result).toContain('⌘↑');
      expect(result).toContain('⌘↓');
      expect(result).toContain('to navigate messages');
    });

    it('returns Ctrl shortcut on non-Mac platforms', () => {
      (window as any).electron = { platform: 'win32' };
      const result = getNavigationShortcutText();
      expect(result).toContain('Ctrl+↑');
      expect(result).toContain('Ctrl+↓');
    });

    it('returns Ctrl shortcut when platform is linux', () => {
      (window as any).electron = { platform: 'linux' };
      const result = getNavigationShortcutText();
      expect(result).toContain('Ctrl+');
    });

    it('returns Ctrl shortcut when electron.platform is undefined', () => {
      (window as any).electron = {};
      const result = getNavigationShortcutText();
      expect(result).toContain('Ctrl+');
    });
  });

  describe('getSearchShortcutText', () => {
    it('returns Cmd+F on Mac', () => {
      (window as any).electron = { platform: 'darwin' };
      const result = getSearchShortcutText();
      expect(result).toBe('⌘F');
    });

    it('returns Ctrl+F on non-Mac', () => {
      (window as any).electron = { platform: 'win32' };
      const result = getSearchShortcutText();
      expect(result).toBe('Ctrl+F');
    });
  });
});
