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
  useSettingsStream,
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

  // -- New bridged keys --

  it('has ShowPricing key with correct value', () => {
    expect(SettingsKeys.ShowPricing).toBe('showPricing');
  });

  it('has CliDefaultProvider key with correct value', () => {
    expect(SettingsKeys.CliDefaultProvider).toBe('cliDefaultProvider');
  });

  it('has CliAutoUpdate key with correct value', () => {
    expect(SettingsKeys.CliAutoUpdate).toBe('cliAutoUpdate');
  });

  it('has CliCustomArgs key with correct value', () => {
    expect(SettingsKeys.CliCustomArgs).toBe('cliCustomArgs');
  });

  it('has CliDebugMode key with correct value', () => {
    expect(SettingsKeys.CliDebugMode).toBe('cliDebugMode');
  });

  it('has CliShellIntegration key with correct value', () => {
    expect(SettingsKeys.CliShellIntegration).toBe('cliShellIntegration');
  });

  it('has SessionSharingEnabled key with correct value', () => {
    expect(SettingsKeys.SessionSharingEnabled).toBe('sessionSharingEnabled');
  });

  it('has SessionSharingBaseUrl key with correct value', () => {
    expect(SettingsKeys.SessionSharingBaseUrl).toBe('sessionSharingBaseUrl');
  });

  it('contains all 25 expected keys', () => {
    const keys = Object.keys(SettingsKeys);
    expect(keys.length).toBe(25);
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

  // -- New bridged defaults --

  it('has showPricing set to true', () => {
    expect(defaultFeatureSettings.showPricing).toBe(true);
  });

  it('has cliDefaultProvider set to anthropic', () => {
    expect(defaultFeatureSettings.cliDefaultProvider).toBe('anthropic');
  });

  it('has cliAutoUpdate set to true', () => {
    expect(defaultFeatureSettings.cliAutoUpdate).toBe(true);
  });

  it('has cliCustomArgs set to empty string', () => {
    expect(defaultFeatureSettings.cliCustomArgs).toBe('');
  });

  it('has cliDebugMode set to false', () => {
    expect(defaultFeatureSettings.cliDebugMode).toBe(false);
  });

  it('has cliShellIntegration set to false', () => {
    expect(defaultFeatureSettings.cliShellIntegration).toBe(false);
  });

  it('has sessionSharingEnabled set to false', () => {
    expect(defaultFeatureSettings.sessionSharingEnabled).toBe(false);
  });

  it('has sessionSharingBaseUrl set to empty string', () => {
    expect(defaultFeatureSettings.sessionSharingBaseUrl).toBe('');
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
    expect(url).toBe('http://localhost:3284/api/settings/budgetLimit');
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
    expect(url).toBe('http://localhost:3284/api/settings/key%20with%20spaces');
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
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3284/api/settings/budgetLimit');
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

// ===========================================================================
// useSettingsBridge with new bridged keys
// ===========================================================================

describe('useSettingsBridge with new bridged keys', () => {
  it('loads ShowPricing from backend', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: false }),
    });

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>(SettingsKeys.ShowPricing, true),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(false);
  });

  it('loads CliDefaultProvider from backend', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'openai' }),
    });

    const { result } = renderHook(() =>
      useSettingsBridge<string>(SettingsKeys.CliDefaultProvider, 'anthropic'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe('openai');
  });

  it('loads CliAutoUpdate from localStorage fallback', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValueOnce(JSON.stringify(false));

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>(SettingsKeys.CliAutoUpdate, true),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(false);
    expect(mockLocalStorageGetItem).toHaveBeenCalledWith('settings:cliAutoUpdate');
  });

  it('persists CliCustomArgs to localStorage and backend', async () => {
    // Initial load returns nothing
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() =>
      useSettingsBridge<string>(SettingsKeys.CliCustomArgs, ''),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Set a new value
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.setValue('--verbose');
    });

    expect(result.current.value).toBe('--verbose');
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:cliCustomArgs',
      JSON.stringify('--verbose'),
    );
  });

  it('uses default for CliDebugMode when both backend and localStorage unavailable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>(SettingsKeys.CliDebugMode, false),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(false);
  });

  it('loads SessionSharingEnabled from backend', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: true }),
    });

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>(SettingsKeys.SessionSharingEnabled, false),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe(true);
  });

  it('loads SessionSharingBaseUrl from backend', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'https://share.example.com/api' }),
    });

    const { result } = renderHook(() =>
      useSettingsBridge<string>(SettingsKeys.SessionSharingBaseUrl, ''),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.value).toBe('https://share.example.com/api');
  });

  it('persists CliShellIntegration to both localStorage and backend', async () => {
    // Initial load returns nothing
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>(SettingsKeys.CliShellIntegration, false),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Set a new value
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.setValue(true);
    });

    expect(result.current.value).toBe(true);
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:cliShellIntegration',
      JSON.stringify(true),
    );
    // syncSettingToBackend should have been called
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 load + 1 sync
  });
});

// ===========================================================================
// useSettingsStream hook
// ===========================================================================

// Mock EventSource
class MockEventSource {
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState: number = 0; // 0 = CONNECTING
  private listeners: Map<string, Set<(event: MessageEvent) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // 1 = OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = 2; // 2 = CLOSED
  }

  // Test helper: simulate receiving an event from the server
  _simulateEvent(type: string, data: string): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = new MessageEvent('message', { data });
      listeners.forEach((listener) => listener(event));
    }
  }

  // Test helper: simulate a connection error
  _simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

describe('useSettingsStream', () => {
  let mockEventSource: MockEventSource | null = null;
  let originalEventSource: typeof EventSource | undefined;

  beforeEach(() => {
    // Save original EventSource
    originalEventSource = (globalThis as Record<string, unknown>).EventSource as typeof EventSource | undefined;

    // Mock global EventSource using a class that captures the instance
    const OriginalMock = MockEventSource;
    (globalThis as Record<string, unknown>).EventSource = class extends OriginalMock {
      constructor(url: string) {
        super(url);
        mockEventSource = this as unknown as MockEventSource;
      }
    } as unknown as typeof EventSource;
  });

  afterEach(() => {
    // Ensure real timers are restored (some tests use fake timers)
    vi.useRealTimers();
    // Restore original EventSource
    if (originalEventSource) {
      (globalThis as Record<string, unknown>).EventSource = originalEventSource;
    } else {
      delete (globalThis as Record<string, unknown>).EventSource;
    }
    mockEventSource = null;
  });

  it('should connect to the SSE endpoint on mount', async () => {
    const { result } = renderHook(() => useSettingsStream());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.error).toBeNull();
    expect(mockEventSource?.url).toBe('http://localhost:3284/api/settings/stream');
  });

  it('should use custom baseUrl when provided', async () => {
    const { result } = renderHook(() =>
      useSettingsStream({ baseUrl: 'http://custom:9999' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(mockEventSource?.url).toBe('http://custom:9999/api/settings/stream');
  });

  it('should invoke onSettingUpdate when a settings_update event is received', async () => {
    const onSettingUpdate = vi.fn();
    const { result } = renderHook(() => useSettingsStream({ onSettingUpdate }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Simulate receiving a settings_update event
    const eventData = JSON.stringify({
      event: 'settings_update',
      key: 'super_goose_guardrails_enabled',
      value: true,
      source: 'api',
    });

    mockEventSource?._simulateEvent('settings_update', eventData);

    await waitFor(() => {
      expect(onSettingUpdate).toHaveBeenCalledWith(
        'super_goose_guardrails_enabled',
        true,
        'api'
      );
    });
  });

  it('should handle heartbeat events without error', async () => {
    const { result } = renderHook(() => useSettingsStream());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const heartbeatData = JSON.stringify({
      event: 'heartbeat',
      timestamp: 1234567890,
    });

    // Should not throw
    mockEventSource?._simulateEvent('heartbeat', heartbeatData);

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should set error state on connection error', async () => {
    const { result } = renderHook(() =>
      useSettingsStream({ autoReconnect: false })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Simulate an error
    mockEventSource?._simulateError();

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).not.toBeNull();
    });
  });

  it('should auto-reconnect with exponential backoff on error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() =>
      useSettingsStream({ autoReconnect: true, maxReconnectDelay: 8000 })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Simulate an error
    mockEventSource?._simulateError();

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // Fast-forward 1 second (initial backoff) + 10ms for MockEventSource connect
    await vi.advanceTimersByTimeAsync(1010);

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Simulate another error
    mockEventSource?._simulateError();

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // Fast-forward 2 seconds (doubled backoff) + 10ms for MockEventSource connect
    await vi.advanceTimersByTimeAsync(2010);

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    vi.useRealTimers();
  });

  it('should close the connection on unmount', async () => {
    const { result, unmount } = renderHook(() => useSettingsStream());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const closeSpy = vi.spyOn(mockEventSource!, 'close');

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle malformed JSON in events gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSettingUpdate = vi.fn();

    const { result } = renderHook(() => useSettingsStream({ onSettingUpdate }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Send malformed JSON
    mockEventSource?._simulateEvent('settings_update', '{invalid json}');

    // Should warn but not crash
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(onSettingUpdate).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('should not call onSettingUpdate if callback is not provided', async () => {
    const { result } = renderHook(() => useSettingsStream());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const eventData = JSON.stringify({
      event: 'settings_update',
      key: 'test_key',
      value: 'test_value',
      source: 'test',
    });

    // Should not throw
    mockEventSource?._simulateEvent('settings_update', eventData);

    expect(result.current.isConnected).toBe(true);
  });

  it('should cap reconnect delay at maxReconnectDelay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() =>
      useSettingsStream({ autoReconnect: true, maxReconnectDelay: 4000 })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // First error: 1s backoff
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await vi.advanceTimersByTimeAsync(1010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Second error: 2s backoff
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await vi.advanceTimersByTimeAsync(2010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Third error: would be 4s, capped at maxReconnectDelay (4s)
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await vi.advanceTimersByTimeAsync(4010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Fourth error: would be 8s, still capped at 4s
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await vi.advanceTimersByTimeAsync(4010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    vi.useRealTimers();
  });
});

// ===========================================================================
// INTEGRATION TESTS — SSE Stream
// ===========================================================================

describe('SSE Stream integration', () => {
  let mockEventSource: MockEventSource | null = null;
  let originalEventSource: typeof EventSource | undefined;

  beforeEach(() => {
    originalEventSource = (globalThis as Record<string, unknown>).EventSource as typeof EventSource | undefined;
    const OriginalMock = MockEventSource;
    (globalThis as Record<string, unknown>).EventSource = class extends OriginalMock {
      constructor(url: string) {
        super(url);
        mockEventSource = this as unknown as MockEventSource;
      }
    } as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalEventSource) {
      (globalThis as Record<string, unknown>).EventSource = originalEventSource;
    } else {
      delete (globalThis as Record<string, unknown>).EventSource;
    }
    mockEventSource = null;
  });

  it('resets backoff delay after a successful reconnection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() =>
      useSettingsStream({ autoReconnect: true, maxReconnectDelay: 16000 })
    );

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // First error -> 1s backoff
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await vi.advanceTimersByTimeAsync(1010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Second error -> 2s backoff
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await vi.advanceTimersByTimeAsync(2010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Connection is stable now — backoff should have been reset to 1s
    // Third error -> should be 1s again (not 4s) because the successful connection reset it
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));

    // After 1010ms it should reconnect (proving backoff was reset)
    await vi.advanceTimersByTimeAsync(1010);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    vi.useRealTimers();
  });

  it('receives multiple sequential events correctly', async () => {
    const updates: Array<{ key: string; value: unknown }> = [];
    const onSettingUpdate = vi.fn((key: string, value: unknown) => {
      updates.push({ key, value });
    });

    const { result } = renderHook(() => useSettingsStream({ onSettingUpdate }));

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Send 3 events in sequence
    mockEventSource?._simulateEvent(
      'settings_update',
      JSON.stringify({ event: 'settings_update', key: 'budgetLimit', value: 100, source: 'api' })
    );
    mockEventSource?._simulateEvent(
      'settings_update',
      JSON.stringify({ event: 'settings_update', key: 'guardrailsEnabled', value: false, source: 'ui' })
    );
    mockEventSource?._simulateEvent(
      'settings_update',
      JSON.stringify({ event: 'settings_update', key: 'executionMode', value: 'structured', source: 'cli' })
    );

    await waitFor(() => {
      expect(onSettingUpdate).toHaveBeenCalledTimes(3);
    });

    expect(updates[0]).toEqual({ key: 'budgetLimit', value: 100 });
    expect(updates[1]).toEqual({ key: 'guardrailsEnabled', value: false });
    expect(updates[2]).toEqual({ key: 'executionMode', value: 'structured' });
  });

  it('does not call onSettingUpdate after unmount', async () => {
    const onSettingUpdate = vi.fn();
    const { result, unmount } = renderHook(() => useSettingsStream({ onSettingUpdate }));

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    const capturedEventSource = mockEventSource;
    unmount();

    // Send an event after unmount — mountedRef is false so callback should not fire
    capturedEventSource?._simulateEvent(
      'settings_update',
      JSON.stringify({ event: 'settings_update', key: 'test', value: true, source: 'api' })
    );

    expect(onSettingUpdate).not.toHaveBeenCalled();
  });

  it('clears reconnect timer on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result, unmount } = renderHook(() =>
      useSettingsStream({ autoReconnect: true })
    );

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Trigger error to start reconnect timer
    mockEventSource?._simulateError();
    await waitFor(() => expect(result.current.isConnected).toBe(false));

    // Unmount before the reconnect timer fires
    unmount();

    // Advance past the reconnect delay — should not throw or create new connections
    await vi.advanceTimersByTimeAsync(5000);

    vi.useRealTimers();
  });
});

// ===========================================================================
// INTEGRATION TESTS — Backend Sync
// ===========================================================================

describe('Backend sync integration', () => {
  it('loadSettingFromBackend returns typed boolean correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: false }),
    });

    const result = await loadSettingFromBackend<boolean>('guardrailsEnabled');
    expect(result).toBe(false);
    expect(typeof result).toBe('boolean');
  });

  it('loadSettingFromBackend returns null values correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: null }),
    });

    const result = await loadSettingFromBackend<number | null>('budgetLimit');
    expect(result).toBeNull();
  });

  it('syncSettingToBackend sends boolean values correctly', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await syncSettingToBackend('guardrailsEnabled', true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ value: true });
  });

  it('syncSettingToBackend sends null values correctly', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await syncSettingToBackend('budgetLimit', null);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ value: null });
  });

  it('syncSettingToBackend sends complex string values', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await syncSettingToBackend('cliCustomArgs', '--verbose --timeout=30');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ value: '--verbose --timeout=30' });
  });

  it('loadSettingFromBackend handles network timeout gracefully', async () => {
    // Simulate an AbortError (timeout)
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const result = await loadSettingFromBackend('budgetLimit');
    expect(result).toBeUndefined();
  });

  it('syncSettingToBackend handles network timeout gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const result = await syncSettingToBackend('budgetLimit', 100);
    expect(result).toBe(false);
  });

  it('loadSettingFromBackend handles 500 server error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await loadSettingFromBackend('executionMode');
    expect(result).toBeUndefined();
  });

  it('syncSettingToBackend handles 503 service unavailable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await syncSettingToBackend('executionMode', 'structured');
    expect(result).toBe(false);
  });
});

// ===========================================================================
// INTEGRATION TESTS — useSettingsBridge backend/localStorage fallback
// ===========================================================================

describe('useSettingsBridge fallback integration', () => {
  it('falls back to localStorage when backend fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockLocalStorageGetItem.mockReturnValueOnce(JSON.stringify(42));

    const { result } = renderHook(() => useSettingsBridge<number>('rateLimitCallsPerMin', 50));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.value).toBe(42);
  });

  it('uses default when backend throws and localStorage is empty', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() => useSettingsBridge<string>('executionMode', 'standard'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.value).toBe('standard');
  });

  it('uses default when backend returns undefined and localStorage has corrupt data', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    // Simulate corrupt JSON in localStorage
    mockLocalStorageGetItem.mockReturnValueOnce('not-valid-json{{{');

    const { result } = renderHook(() => useSettingsBridge<boolean>('compactionEnabled', true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Should fall back to default because JSON.parse throws
    expect(result.current.value).toBe(true);
  });

  it('setValue writes to localStorage even when backend sync fails', async () => {
    // Initial load — backend unavailable
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() => useSettingsBridge<number>('rateLimitCallsPerMin', 50));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Backend sync will fail
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await act(async () => {
      await result.current.setValue(100);
    });

    // Value should still be updated locally
    expect(result.current.value).toBe(100);
    // localStorage should have been written
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:rateLimitCallsPerMin',
      JSON.stringify(100)
    );
  });

  it('prefers backend value over localStorage', async () => {
    // Backend returns a value
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'extended' }),
    });
    // localStorage also has a value (should be ignored)
    mockLocalStorageGetItem.mockReturnValueOnce(JSON.stringify('budget'));

    const { result } = renderHook(() =>
      useSettingsBridge<string>('reasoningMode', 'standard')
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Backend value wins
    expect(result.current.value).toBe('extended');
  });
});

// ===========================================================================
// INTEGRATION TESTS — useFeatureSettings (additional)
// ===========================================================================

describe('useFeatureSettings integration', () => {
  it('resetAll restores all settings to defaults', async () => {
    mockGetSettings.mockResolvedValue({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: { budgetLimit: 999, executionMode: 'structured' },
    });
    mockSaveSettings.mockResolvedValue(true);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.budgetLimit).toBe(999);

    await act(async () => {
      await result.current.resetAll();
    });

    expect(result.current.settings.budgetLimit).toBe(null);
    expect(result.current.settings.executionMode).toBe('standard');
    expect(result.current.settings).toEqual(defaultFeatureSettings);
  });

  it('returns all default keys in the settings object', async () => {
    mockGetSettings.mockResolvedValue({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
    });

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Every key in defaultFeatureSettings should exist
    for (const key of Object.keys(defaultFeatureSettings)) {
      expect(result.current.settings).toHaveProperty(key);
    }
  });

  it('updateSetting triggers backend persistence via saveFeatureSettings', async () => {
    mockGetSettings.mockResolvedValue({
      showMenuBarIcon: true,
      showDockIcon: true,
      enableWakelock: false,
      spellcheckEnabled: true,
      featureSettings: {},
    });
    mockSaveSettings.mockResolvedValue(true);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateSetting('guardrailsEnabled', false);
    });

    expect(result.current.settings.guardrailsEnabled).toBe(false);
    // saveSettings should have been called with the updated featureSettings
    expect(mockSaveSettings).toHaveBeenCalled();
    const savedArg = mockSaveSettings.mock.calls[mockSaveSettings.mock.calls.length - 1][0];
    expect(savedArg.featureSettings.guardrailsEnabled).toBe(false);
  });

  it('updateSetting reverts on backend failure', async () => {
    // Initial load succeeds
    mockGetSettings
      .mockResolvedValueOnce({
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        featureSettings: { budgetLimit: 50 },
      })
      // saveFeatureSettings calls getSettings again
      .mockRejectedValueOnce(new Error('IPC failed'))
      // revert calls loadFeatureSettings -> getSettings
      .mockResolvedValueOnce({
        showMenuBarIcon: true,
        showDockIcon: true,
        enableWakelock: false,
        spellcheckEnabled: true,
        featureSettings: { budgetLimit: 50 },
      });

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.budgetLimit).toBe(50);

    await act(async () => {
      await result.current.updateSetting('budgetLimit', 999);
    });

    // After the save fails, it reloads and reverts
    await waitFor(() => {
      expect(result.current.settings.budgetLimit).toBe(50);
    });
  });
});

// ===========================================================================
// INTEGRATION TESTS — Cross-module compatibility
// ===========================================================================

describe('Cross-module compatibility', () => {
  it('localStorage key format uses settings: prefix', async () => {
    // Initial load — backend unavailable
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>('guardrailsEnabled', true)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Set a value and verify the localStorage key format
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.setValue(false);
    });

    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:guardrailsEnabled',
      JSON.stringify(false)
    );
  });

  it('localStorage getItem reads with settings: prefix', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValueOnce(JSON.stringify('structured'));

    const { result } = renderHook(() =>
      useSettingsBridge<string>('executionMode', 'standard')
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockLocalStorageGetItem).toHaveBeenCalledWith('settings:executionMode');
    expect(result.current.value).toBe('structured');
  });

  it('SettingsKeys enum contains all 25 expected keys', () => {
    const expectedKeys = [
      'BudgetLimit',
      'BudgetWarningThreshold',
      'CostTrackingEnabled',
      'ExecutionMode',
      'ReasoningMode',
      'GuardrailsEnabled',
      'GuardrailsMode',
      'ReflexionEnabled',
      'ReflexionMaxRetries',
      'BookmarksEnabled',
      'SearchEnabled',
      'CompactionEnabled',
      'CompactionThreshold',
      'RateLimitCallsPerMin',
      'RateLimitBackpressureMs',
      'ProjectAutoDetection',
      'ModelHotSwitch',
      'ShowPricing',
      'CliDefaultProvider',
      'CliAutoUpdate',
      'CliCustomArgs',
      'CliDebugMode',
      'CliShellIntegration',
      'SessionSharingEnabled',
      'SessionSharingBaseUrl',
    ];

    const actualKeys = Object.keys(SettingsKeys);
    expect(actualKeys).toHaveLength(25);

    for (const key of expectedKeys) {
      expect(actualKeys).toContain(key);
    }
  });

  it('every SettingsKeys value maps to a matching defaultFeatureSettings key', () => {
    const settingValues = Object.values(SettingsKeys);
    const defaultKeys = Object.keys(defaultFeatureSettings);

    // Every value in SettingsKeys should correspond to a key in defaults
    for (const val of settingValues) {
      expect(defaultKeys).toContain(val);
    }
  });

  it('setValue round-trips through localStorage correctly for each type', async () => {
    // Test number round-trip
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result: numResult } = renderHook(() =>
      useSettingsBridge<number>('budgetLimit', 0)
    );

    await waitFor(() => expect(numResult.current.isLoading).toBe(false));
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await numResult.current.setValue(42);
    });

    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:budgetLimit',
      '42' // JSON.stringify(42)
    );

    // Test boolean round-trip
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result: boolResult } = renderHook(() =>
      useSettingsBridge<boolean>('reflexionEnabled', false)
    );

    await waitFor(() => expect(boolResult.current.isLoading).toBe(false));
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await boolResult.current.setValue(true);
    });

    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:reflexionEnabled',
      'true' // JSON.stringify(true)
    );

    // Test string round-trip
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result: strResult } = renderHook(() =>
      useSettingsBridge<string>('cliCustomArgs', '')
    );

    await waitFor(() => expect(strResult.current.isLoading).toBe(false));
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await strResult.current.setValue('--debug --verbose');
    });

    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:cliCustomArgs',
      '"--debug --verbose"' // JSON.stringify wraps strings in quotes
    );
  });

  it('setValue triggers both localStorage write and backend sync', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockLocalStorageGetItem.mockReturnValue(null);

    const { result } = renderHook(() =>
      useSettingsBridge<boolean>('costTrackingEnabled', true)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.setValue(false);
    });

    // localStorage was written
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      'settings:costTrackingEnabled',
      JSON.stringify(false)
    );

    // Backend sync was attempted (POST call)
    const syncCall = mockFetch.mock.calls[1]; // [0] was the initial load, [1] is the sync
    expect(syncCall[0]).toBe('http://localhost:3284/api/settings/costTrackingEnabled');
    expect(syncCall[1].method).toBe('POST');
    expect(JSON.parse(syncCall[1].body)).toEqual({ value: false });
  });
});
