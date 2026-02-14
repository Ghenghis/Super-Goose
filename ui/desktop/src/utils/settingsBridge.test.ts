import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the config module
vi.mock('../config', () => ({
  getApiUrl: vi.fn((endpoint: string) => `http://localhost:3284${endpoint}`),
}));

// ---------------------------------------------------------------------------
// Mock window.electron — the setup.ts already defines it with writable: true,
// so we override it via direct assignment (NOT Object.defineProperty).
// ---------------------------------------------------------------------------
const mockGetSettings = vi.fn();
const mockSaveSettings = vi.fn();

// Direct assignment works because setup.ts defines window.electron with writable: true
(window as unknown as Record<string, unknown>).electron = {
  getSettings: mockGetSettings,
  saveSettings: mockSaveSettings,
};

import {
  SettingsKeys,
  defaultFeatureSettings,
  loadFeatureSettings,
  saveFeatureSettings,
  resetFeatureSettings,
  useFeatureSettings,
  syncSettingToBackend,
  loadSettingFromBackend,
  useSettingsBridge,
} from './settingsBridge';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

// localStorage backing store for tests that need real get/set behavior
let localStore: Record<string, string>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  mockGetSettings.mockReset();
  mockSaveSettings.mockReset();
  mockGetSettings.mockResolvedValue({});
  mockSaveSettings.mockResolvedValue(true);

  // Reassign window.electron in case a prior test altered it
  (window as unknown as Record<string, unknown>).electron = {
    getSettings: mockGetSettings,
    saveSettings: mockSaveSettings,
  };

  // Set up localStorage with real backing store so get/set/clear work properly
  localStore = {};
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string) => localStore[key] ?? null
  );
  (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string, value: string) => { localStore[key] = value; }
  );
  (localStorage.removeItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string) => { delete localStore[key]; }
  );
  (localStorage.clear as ReturnType<typeof vi.fn>).mockImplementation(
    () => { localStore = {}; }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// SettingsKeys enum
// ---------------------------------------------------------------------------

describe('SettingsKeys', () => {
  it('has budget-related keys', () => {
    expect(SettingsKeys.BudgetLimit).toBe('budgetLimit');
    expect(SettingsKeys.BudgetWarningThreshold).toBe('budgetWarningThreshold');
    expect(SettingsKeys.CostTrackingEnabled).toBe('costTrackingEnabled');
  });

  it('has execution keys', () => {
    expect(SettingsKeys.ExecutionMode).toBe('executionMode');
    expect(SettingsKeys.ReasoningMode).toBe('reasoningMode');
  });

  it('has CLI keys', () => {
    expect(SettingsKeys.CliDefaultProvider).toBe('cliDefaultProvider');
    expect(SettingsKeys.CliAutoUpdate).toBe('cliAutoUpdate');
    expect(SettingsKeys.CliDebugMode).toBe('cliDebugMode');
  });

  it('has session sharing keys', () => {
    expect(SettingsKeys.SessionSharingEnabled).toBe('sessionSharingEnabled');
    expect(SettingsKeys.SessionSharingBaseUrl).toBe('sessionSharingBaseUrl');
  });
});

// ---------------------------------------------------------------------------
// defaultFeatureSettings
// ---------------------------------------------------------------------------

describe('defaultFeatureSettings', () => {
  it('has sensible defaults', () => {
    expect(defaultFeatureSettings.budgetLimit).toBeNull();
    expect(defaultFeatureSettings.budgetWarningThreshold).toBe(0.8);
    expect(defaultFeatureSettings.executionMode).toBe('standard');
    expect(defaultFeatureSettings.guardrailsEnabled).toBe(true);
    expect(defaultFeatureSettings.reflexionEnabled).toBe(true);
    expect(defaultFeatureSettings.reflexionMaxRetries).toBe(3);
    expect(defaultFeatureSettings.costTrackingEnabled).toBe(true);
    expect(defaultFeatureSettings.showPricing).toBe(true);
    expect(defaultFeatureSettings.cliDefaultProvider).toBe('anthropic');
    expect(defaultFeatureSettings.sessionSharingEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadFeatureSettings
// ---------------------------------------------------------------------------

describe('loadFeatureSettings', () => {
  it('returns defaults when no stored settings', async () => {
    mockGetSettings.mockResolvedValue({});
    const result = await loadFeatureSettings();
    expect(result).toEqual(defaultFeatureSettings);
  });

  it('merges stored settings with defaults', async () => {
    mockGetSettings.mockResolvedValue({
      featureSettings: { budgetLimit: 50, guardrailsEnabled: false },
    });
    const result = await loadFeatureSettings();
    expect(result.budgetLimit).toBe(50);
    expect(result.guardrailsEnabled).toBe(false);
    // Other defaults are preserved
    expect(result.executionMode).toBe('standard');
  });

  it('returns defaults on error', async () => {
    mockGetSettings.mockRejectedValue(new Error('No electron'));
    const result = await loadFeatureSettings();
    expect(result).toEqual(defaultFeatureSettings);
  });
});

// ---------------------------------------------------------------------------
// saveFeatureSettings
// ---------------------------------------------------------------------------

describe('saveFeatureSettings', () => {
  it('merges update into existing settings', async () => {
    mockGetSettings.mockResolvedValue({
      featureSettings: { budgetLimit: 50 },
    });

    await saveFeatureSettings({ guardrailsEnabled: false });

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        featureSettings: expect.objectContaining({
          budgetLimit: 50,
          guardrailsEnabled: false,
        }),
      })
    );
  });

  it('returns true on success', async () => {
    mockSaveSettings.mockResolvedValue(true);
    const result = await saveFeatureSettings({ budgetLimit: 100 });
    expect(result).toBe(true);
  });

  it('returns false on error', async () => {
    mockGetSettings.mockRejectedValue(new Error('fail'));
    const result = await saveFeatureSettings({ budgetLimit: 100 });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resetFeatureSettings
// ---------------------------------------------------------------------------

describe('resetFeatureSettings', () => {
  it('saves defaults', async () => {
    await resetFeatureSettings();
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        featureSettings: defaultFeatureSettings,
      })
    );
  });

  it('returns false on error', async () => {
    mockGetSettings.mockRejectedValue(new Error('fail'));
    const result = await resetFeatureSettings();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// syncSettingToBackend
// ---------------------------------------------------------------------------

describe('syncSettingToBackend', () => {
  it('sends POST to backend API', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const result = await syncSettingToBackend('theme', 'dark');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3284/api/settings/theme',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'dark' }),
      })
    );
    expect(result).toBe(true);
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await syncSettingToBackend('theme', 'dark');
    expect(result).toBe(false);
  });

  it('encodes special characters in key', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await syncSettingToBackend('my key', 'value');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3284/api/settings/my%20key',
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// loadSettingFromBackend
// ---------------------------------------------------------------------------

describe('loadSettingFromBackend', () => {
  it('returns value from backend', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: 42 }),
    });
    const result = await loadSettingFromBackend<number>('count');
    expect(result).toBe(42);
  });

  it('returns undefined on HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const result = await loadSettingFromBackend('missing');
    expect(result).toBeUndefined();
  });

  it('returns undefined on network error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await loadSettingFromBackend('test');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useFeatureSettings hook
// ---------------------------------------------------------------------------

describe('useFeatureSettings', () => {
  it('starts with defaults while loading', () => {
    mockGetSettings.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useFeatureSettings());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.settings).toEqual(defaultFeatureSettings);
  });

  it('loads settings on mount', async () => {
    mockGetSettings.mockResolvedValue({
      featureSettings: { budgetLimit: 75 },
    });

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings.budgetLimit).toBe(75);
  });

  it('updateSetting persists the change', async () => {
    mockGetSettings.mockResolvedValue({});
    mockSaveSettings.mockResolvedValue(true);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSetting('budgetLimit', 200);
    });

    expect(result.current.settings.budgetLimit).toBe(200);
    expect(mockSaveSettings).toHaveBeenCalled();
  });

  it('resetAll reverts to defaults', async () => {
    mockGetSettings.mockResolvedValue({
      featureSettings: { budgetLimit: 75 },
    });
    mockSaveSettings.mockResolvedValue(true);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.settings.budgetLimit).toBe(75);
    });

    await act(async () => {
      await result.current.resetAll();
    });

    expect(result.current.settings).toEqual(defaultFeatureSettings);
  });
});

// ---------------------------------------------------------------------------
// useSettingsBridge hook
// ---------------------------------------------------------------------------

describe('useSettingsBridge', () => {
  it('starts with default value while loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSettingsBridge<number>('count', 42));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.value).toBe(42);
  });

  it('loads value from backend first', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: 99 }),
    });

    const { result } = renderHook(() => useSettingsBridge<number>('count', 0));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(99);
  });

  it('falls back to localStorage when backend is unavailable', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    // Pre-populate the localStorage backing store
    localStore['settings:count'] = '77';

    const { result } = renderHook(() => useSettingsBridge<number>('count', 0));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(77);
  });

  it('uses default when both backend and localStorage are empty', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const { result } = renderHook(() => useSettingsBridge<string>('theme', 'light'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe('light');
  });

  it('setValue updates local state and persists to localStorage', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 'initial' }) });

    const { result } = renderHook(() => useSettingsBridge<string>('theme', 'light'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Reset fetch to succeed for the sync
    fetchMock.mockResolvedValue({ ok: true });

    await act(async () => {
      await result.current.setValue('dark');
    });

    expect(result.current.value).toBe('dark');
    expect(localStore['settings:theme']).toBe('"dark"');
  });

  it('setValue attempts backend sync', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 10 }) });

    const { result } = renderHook(() => useSettingsBridge<number>('count', 0));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    fetchMock.mockResolvedValue({ ok: true });

    await act(async () => {
      await result.current.setValue(42);
    });

    // Should have called fetch for the sync
    const syncCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => (c[1] as { method?: string })?.method === 'POST'
    );
    expect(syncCalls.length).toBeGreaterThanOrEqual(1);
  });
});
