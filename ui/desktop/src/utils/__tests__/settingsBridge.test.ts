import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  SettingsKeys,
  defaultFeatureSettings,
  loadFeatureSettings,
  saveFeatureSettings,
  resetFeatureSettings,
  syncSettingToBackend,
  loadSettingFromBackend,
  useFeatureSettings,
  useSettingsBridge,
} from '../settingsBridge';

// ---------------------------------------------------------------------------
// Global mocks — window.electron is set up in setup.ts, augment per-test
// ---------------------------------------------------------------------------

const mockGetSettings = window.electron.getSettings as ReturnType<typeof vi.fn>;
const mockSaveSettings = window.electron.saveSettings as ReturnType<typeof vi.fn>;
const mockLocalStorageGetItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const mockLocalStorageSetItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;

// We need to mock fetch since it is used by syncSettingToBackend / loadSettingFromBackend
const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  // @ts-expect-error cleaning up global
  delete globalThis.fetch;
});

// ===========================================================================
// SettingsKeys enum
// ===========================================================================

describe('SettingsKeys enum', () => {
  it('has BudgetLimit key with correct value', () => {
    expect(SettingsKeys.BudgetLimit).toBe('budgetLimit');
  });

  it('has CostTrackingEnabled key with correct value', () => {
    expect(SettingsKeys.CostTrackingEnabled).toBe('costTrackingEnabled');
  });

  it('has ExecutionMode key with correct value', () => {
    expect(SettingsKeys.ExecutionMode).toBe('executionMode');
  });

  it('has ReasoningMode key with correct value', () => {
    expect(SettingsKeys.ReasoningMode).toBe('reasoningMode');
  });

  it('has GuardrailsEnabled key with correct value', () => {
    expect(SettingsKeys.GuardrailsEnabled).toBe('guardrailsEnabled');
  });

  it('has ReflexionEnabled key with correct value', () => {
    expect(SettingsKeys.ReflexionEnabled).toBe('reflexionEnabled');
  });

  it('has BookmarksEnabled key with correct value', () => {
    expect(SettingsKeys.BookmarksEnabled).toBe('bookmarksEnabled');
  });

  it('has CompactionEnabled key with correct value', () => {
    expect(SettingsKeys.CompactionEnabled).toBe('compactionEnabled');
  });

  it('has RateLimitCallsPerMin key with correct value', () => {
    expect(SettingsKeys.RateLimitCallsPerMin).toBe('rateLimitCallsPerMin');
  });

  it('has ProjectAutoDetection key with correct value', () => {
    expect(SettingsKeys.ProjectAutoDetection).toBe('projectAutoDetection');
  });

  it('has ModelHotSwitch key with correct value', () => {
    expect(SettingsKeys.ModelHotSwitch).toBe('modelHotSwitch');
  });

  it('contains all 17 expected keys', () => {
    const keys = Object.keys(SettingsKeys);
    expect(keys.length).toBe(17);
  });
});

// ===========================================================================
// defaultFeatureSettings
// ===========================================================================

describe('defaultFeatureSettings', () => {
  it('has budgetLimit set to null', () => {
    expect(defaultFeatureSettings.budgetLimit).toBeNull();
  });

  it('has executionMode set to standard', () => {
    expect(defaultFeatureSettings.executionMode).toBe('standard');
  });

  it('has guardrailsEnabled set to true', () => {
    expect(defaultFeatureSettings.guardrailsEnabled).toBe(true);
  });

  it('has rateLimitCallsPerMin set to 50', () => {
    expect(defaultFeatureSettings.rateLimitCallsPerMin).toBe(50);
  });

  it('has rateLimitBackpressureMs set to 500', () => {
    expect(defaultFeatureSettings.rateLimitBackpressureMs).toBe(500);
  });
});

// ===========================================================================
// syncSettingToBackend
// ===========================================================================

describe('syncSettingToBackend', () => {
  it('calls fetch with POST and correct URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await syncSettingToBackend('budgetLimit', 100);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/settings/budgetLimit');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(result).toBe(true);
  });

  it('sends the value in the request body as JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await syncSettingToBackend('executionMode', 'structured');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ value: 'structured' });
  });

  it('encodes special characters in the key', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await syncSettingToBackend('key with spaces', 42);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe('/api/settings/key%20with%20spaces');
  });

  it('returns false when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await syncSettingToBackend('budgetLimit', 100);
    expect(result).toBe(false);
  });

  it('returns false when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await syncSettingToBackend('budgetLimit', 100);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// loadSettingFromBackend
// ===========================================================================

describe('loadSettingFromBackend', () => {
  it('calls fetch with GET and correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 42 }),
    });

    const result = await loadSettingFromBackend<number>('budgetLimit');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/settings/budgetLimit');
    expect(result).toBe(42);
  });

  it('returns the value typed correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'structured' }),
    });

    const result = await loadSettingFromBackend<string>('executionMode');
    expect(result).toBe('structured');
  });

  it('returns undefined when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await loadSettingFromBackend('budgetLimit');
    expect(result).toBeUndefined();
  });

  it('returns undefined when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await loadSettingFromBackend('budgetLimit');
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// loadFeatureSettings
// ===========================================================================

describe('loadFeatureSettings', () => {
  it('returns merged settings when Electron has stored values', async () => {
    mockGetSettings.mockResolvedValueOnce({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: {
        budgetLimit: 50,
        executionMode: 'structured',
      },
    });

    const result = await loadFeatureSettings();

    expect(result.budgetLimit).toBe(50);
    expect(result.executionMode).toBe('structured');
    // Defaults should fill in the rest
    expect(result.guardrailsEnabled).toBe(true);
    expect(result.rateLimitCallsPerMin).toBe(50);
  });

  it('returns defaults when no featureSettings are stored', async () => {
    mockGetSettings.mockResolvedValueOnce({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
    });

    const result = await loadFeatureSettings();
    expect(result).toEqual(defaultFeatureSettings);
  });

  it('returns defaults when getSettings throws', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('IPC failed'));

    const result = await loadFeatureSettings();
    expect(result).toEqual(defaultFeatureSettings);
  });
});

// ===========================================================================
// saveFeatureSettings
// ===========================================================================

describe('saveFeatureSettings', () => {
  it('merges the update with existing settings and saves', async () => {
    mockGetSettings.mockResolvedValueOnce({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: { budgetLimit: 50 },
    });
    mockSaveSettings.mockResolvedValueOnce(true);

    const result = await saveFeatureSettings({ executionMode: 'structured' });

    expect(result).toBe(true);
    expect(mockSaveSettings).toHaveBeenCalledTimes(1);

    const saved = mockSaveSettings.mock.calls[0][0];
    expect(saved.featureSettings.executionMode).toBe('structured');
    // Existing value should be preserved
    expect(saved.featureSettings.budgetLimit).toBe(50);
  });

  it('returns false when getSettings throws', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('IPC failed'));

    const result = await saveFeatureSettings({ budgetLimit: 100 });
    expect(result).toBe(false);
  });
});

// ===========================================================================
// resetFeatureSettings
// ===========================================================================

describe('resetFeatureSettings', () => {
  it('saves default settings', async () => {
    mockGetSettings.mockResolvedValueOnce({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: { budgetLimit: 999 },
    });
    mockSaveSettings.mockResolvedValueOnce(true);

    const result = await resetFeatureSettings();

    expect(result).toBe(true);
    const saved = mockSaveSettings.mock.calls[0][0];
    expect(saved.featureSettings).toEqual(defaultFeatureSettings);
  });
});

// ===========================================================================
// useFeatureSettings hook
// ===========================================================================

describe('useFeatureSettings', () => {
  it('starts with default values and isLoading true', () => {
    // Never-resolving promise so loading stays true
    mockGetSettings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFeatureSettings());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.settings).toEqual(defaultFeatureSettings);
  });

  it('loads settings and sets isLoading to false', async () => {
    mockGetSettings.mockResolvedValue({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: { budgetLimit: 77 },
    });

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings.budgetLimit).toBe(77);
  });

  it('updateSetting updates the value optimistically', async () => {
    mockGetSettings.mockResolvedValue({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: {},
    });
    mockSaveSettings.mockResolvedValue(true);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSetting('budgetLimit', 200);
    });

    expect(result.current.settings.budgetLimit).toBe(200);
  });
});

// ===========================================================================
// useSettingsBridge hook
// ===========================================================================

describe('useSettingsBridge', () => {
  it('returns the default value initially', () => {
    // Make loadSettingFromBackend return undefined (backend unavailable)
    mockFetch.mockResolvedValue({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() => useSettingsBridge<number>('budgetLimit', 100));

    expect(result.current.value).toBe(100);
    expect(result.current.isLoading).toBe(true);
  });

  it('loads value from backend on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 250 }),
    });

    const { result } = renderHook(() => useSettingsBridge<number>('budgetLimit', 100));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(250);
  });

  it('falls back to localStorage when backend is unavailable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValueOnce(JSON.stringify(333));

    const { result } = renderHook(() => useSettingsBridge<number>('budgetLimit', 100));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(333);
    expect(mockLocalStorageGetItem).toHaveBeenCalledWith('settings:budgetLimit');
  });

  it('uses default when both backend and localStorage are unavailable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() => useSettingsBridge<number>('budgetLimit', 100));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(100);
  });

  it('setValue updates value locally and persists to localStorage + backend', async () => {
    // Initial load returns nothing
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() => useSettingsBridge<number>('budgetLimit', 100));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Now set a new value; the second fetch call is the sync to backend
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.setValue(500);
    });

    expect(result.current.value).toBe(500);
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:budgetLimit',
      JSON.stringify(500),
    );
    // syncSettingToBackend should have been called
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 load + 1 sync
  });
});
