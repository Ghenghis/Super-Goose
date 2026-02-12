import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

// Setup localStorage mock with actual backing store
let storageBackend: Record<string, string> = {};

beforeEach(() => {
  storageBackend = {};
  vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => storageBackend[key] ?? null);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    storageBackend[key] = value;
  });

  // Reset document classes
  document.documentElement.classList.remove('dark', 'light');

  // Mock window.matchMedia for system theme detection
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, // default to light system theme
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Ensure window.electron is mocked
  (window as any).electron = {
    ...(window as any).electron,
    broadcastThemeChange: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('ThemeProvider', () => {
  it('provides default light theme when no saved preference', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.userThemePreference).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('loads dark theme from localStorage', () => {
    storageBackend['theme'] = 'dark';
    storageBackend['use_system_theme'] = 'false';
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.userThemePreference).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('loads system preference from localStorage', () => {
    storageBackend['use_system_theme'] = 'true';
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.userThemePreference).toBe('system');
  });

  it('setUserThemePreference updates preference and saves to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setUserThemePreference('dark');
    });

    expect(result.current.userThemePreference).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(storageBackend['theme']).toBe('dark');
    expect(storageBackend['use_system_theme']).toBe('false');
  });

  it('setUserThemePreference to system saves use_system_theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setUserThemePreference('system');
    });

    expect(result.current.userThemePreference).toBe('system');
    expect(storageBackend['use_system_theme']).toBe('true');
  });

  it('broadcasts theme change to other windows via electron', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setUserThemePreference('dark');
    });

    expect((window as any).electron.broadcastThemeChange).toHaveBeenCalledWith({
      mode: 'dark',
      useSystemTheme: false,
      theme: 'dark',
    });
  });

  it('applies theme class to document element', () => {
    renderHook(() => useTheme(), { wrapper });
    // Default is light
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});

describe('useTheme without provider', () => {
  it('throws when used outside ThemeProvider', () => {
    // Suppress console.error for expected error
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider'
    );
    errorSpy.mockRestore();
  });
});

describe('ThemeProvider renders children', () => {
  it('renders children correctly', () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Hello</div>
      </ThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
