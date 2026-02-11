/**
 * Settings Bridge Utility
 *
 * Bridges localStorage feature toggles to the Electron settings API so that
 * feature panels (Budget, Guardrails, Reflexion, etc.) can read and write
 * their persisted state through a single, type-safe interface.
 *
 * Persistence flow:
 *   UI component -> useFeatureSettings() -> window.electron.saveSettings()
 *                                        <- window.electron.getSettings()
 *
 * The feature settings live under the `featureSettings` key inside the
 * top-level Settings object that Electron already persists to disk.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Settings } from './settings';

// ---------------------------------------------------------------------------
// Settings Keys Enum
// ---------------------------------------------------------------------------

/**
 * Canonical enum of all settings keys used across the app.
 * Components should reference these instead of raw strings so that
 * renames are caught by the type-checker.
 */
export enum SettingsKeys {
  // Budget & cost
  BudgetLimit = 'budgetLimit',
  BudgetWarningThreshold = 'budgetWarningThreshold',
  CostTrackingEnabled = 'costTrackingEnabled',

  // Execution
  ExecutionMode = 'executionMode',
  ReasoningMode = 'reasoningMode',

  // Guardrails
  GuardrailsEnabled = 'guardrailsEnabled',
  GuardrailsMode = 'guardrailsMode',

  // Reflexion
  ReflexionEnabled = 'reflexionEnabled',
  ReflexionMaxRetries = 'reflexionMaxRetries',

  // Bookmarks & search
  BookmarksEnabled = 'bookmarksEnabled',
  SearchEnabled = 'searchEnabled',

  // Compaction
  CompactionEnabled = 'compactionEnabled',
  CompactionThreshold = 'compactionThreshold',

  // Rate limiting
  RateLimitCallsPerMin = 'rateLimitCallsPerMin',
  RateLimitBackpressureMs = 'rateLimitBackpressureMs',

  // Misc
  ProjectAutoDetection = 'projectAutoDetection',
  ModelHotSwitch = 'modelHotSwitch',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeatureSettings {
  /** Maximum cost in dollars. `null` means unlimited. */
  budgetLimit: number | null;
  /** Fraction (0-1) at which the budget warning fires. */
  budgetWarningThreshold: number;
  /** Execution strategy used by the agent loop. */
  executionMode: 'standard' | 'structured' | 'auto';
  /** Reasoning depth control. */
  reasoningMode: 'standard' | 'extended' | 'budget';
  /** Whether input/output guardrails are active. */
  guardrailsEnabled: boolean;
  /** Guardrail behaviour on violation. */
  guardrailsMode: 'warn' | 'block';
  /** Whether the reflexion (self-critique) loop is active. */
  reflexionEnabled: boolean;
  /** Maximum retry attempts for the reflexion loop. */
  reflexionMaxRetries: number;
  /** Whether the bookmark system is active. */
  bookmarksEnabled: boolean;
  /** Whether automatic context compaction is active. */
  compactionEnabled: boolean;
  /** Context usage fraction (0-1) that triggers compaction. */
  compactionThreshold: number;
  /** Maximum API calls per minute before back-pressure kicks in. */
  rateLimitCallsPerMin: number;
  /** Milliseconds of back-pressure delay when rate-limited. */
  rateLimitBackpressureMs: number;
  /** Whether per-message cost tracking is active. */
  costTrackingEnabled: boolean;
  /** Whether cross-session search is available. */
  searchEnabled: boolean;
  /** Whether the agent auto-detects project type. */
  projectAutoDetection: boolean;
  /** Whether /model hot-switch is available. */
  modelHotSwitch: boolean;
}

/**
 * Extended Settings type that includes the featureSettings sub-object.
 * This is what actually gets persisted via the Electron settings file.
 */
interface SettingsWithFeatures extends Settings {
  featureSettings?: Partial<FeatureSettings>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const defaultFeatureSettings: FeatureSettings = {
  budgetLimit: null,
  budgetWarningThreshold: 0.8,
  executionMode: 'standard',
  reasoningMode: 'standard',
  guardrailsEnabled: true,
  guardrailsMode: 'warn',
  reflexionEnabled: true,
  reflexionMaxRetries: 3,
  bookmarksEnabled: true,
  compactionEnabled: true,
  compactionThreshold: 0.8,
  rateLimitCallsPerMin: 50,
  rateLimitBackpressureMs: 500,
  costTrackingEnabled: true,
  searchEnabled: true,
  projectAutoDetection: true,
  modelHotSwitch: true,
};

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Load the current feature settings from Electron's persisted settings file.
 * Any keys missing from the stored object are filled in from defaults.
 */
export async function loadFeatureSettings(): Promise<FeatureSettings> {
  try {
    const settings = (await window.electron.getSettings()) as SettingsWithFeatures;
    const stored = settings.featureSettings ?? {};
    return { ...defaultFeatureSettings, ...stored };
  } catch (err) {
    console.warn('[settingsBridge] Failed to load feature settings, using defaults:', err);
    return { ...defaultFeatureSettings };
  }
}

/**
 * Merge a partial update into the persisted feature settings.
 * Only the keys present in `update` are overwritten; the rest are kept.
 *
 * Returns `true` on success, `false` on failure.
 */
export async function saveFeatureSettings(update: Partial<FeatureSettings>): Promise<boolean> {
  try {
    const settings = (await window.electron.getSettings()) as SettingsWithFeatures;
    const current = settings.featureSettings ?? {};
    const merged: FeatureSettings = { ...defaultFeatureSettings, ...current, ...update };

    const next: SettingsWithFeatures = { ...settings, featureSettings: merged };
    return await window.electron.saveSettings(next as Settings);
  } catch (err) {
    console.warn('[settingsBridge] Failed to save feature settings:', err);
    return false;
  }
}

/**
 * Reset every feature setting back to its default value.
 *
 * Returns `true` on success, `false` on failure.
 */
export async function resetFeatureSettings(): Promise<boolean> {
  try {
    const settings = (await window.electron.getSettings()) as SettingsWithFeatures;
    const next: SettingsWithFeatures = {
      ...settings,
      featureSettings: { ...defaultFeatureSettings },
    };
    return await window.electron.saveSettings(next as Settings);
  } catch (err) {
    console.warn('[settingsBridge] Failed to reset feature settings:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

interface UseFeatureSettingsReturn {
  /** Current feature settings (filled with defaults while loading). */
  settings: FeatureSettings;
  /** Update a single setting key and persist immediately. */
  updateSetting: <K extends keyof FeatureSettings>(
    key: K,
    value: FeatureSettings[K]
  ) => Promise<void>;
  /** Reset all settings to their defaults and persist. */
  resetAll: () => Promise<void>;
  /** `true` while the initial load is in progress. */
  isLoading: boolean;
}

/**
 * React hook that loads feature settings on mount and exposes helpers
 * for updating individual keys or resetting everything.
 *
 * ```tsx
 * const { settings, updateSetting, resetAll, isLoading } = useFeatureSettings();
 * ```
 */
export function useFeatureSettings(): UseFeatureSettingsReturn {
  const [settings, setSettings] = useState<FeatureSettings>({ ...defaultFeatureSettings });
  const [isLoading, setIsLoading] = useState(true);

  // Guard against state updates after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadFeatureSettings();
      if (!cancelled && mountedRef.current) {
        setSettings(loaded);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof FeatureSettings>(key: K, value: FeatureSettings[K]): Promise<void> => {
      // Optimistic local update.
      setSettings((prev) => ({ ...prev, [key]: value }));

      const ok = await saveFeatureSettings({ [key]: value });
      if (!ok) {
        // Revert on failure by reloading the persisted state.
        const reloaded = await loadFeatureSettings();
        if (mountedRef.current) {
          setSettings(reloaded);
        }
      }
    },
    []
  );

  const resetAll = useCallback(async (): Promise<void> => {
    const ok = await resetFeatureSettings();
    if (ok && mountedRef.current) {
      setSettings({ ...defaultFeatureSettings });
    }
  }, []);

  return { settings, updateSetting, resetAll, isLoading };
}

// ---------------------------------------------------------------------------
// Backend sync helpers
// ---------------------------------------------------------------------------

/**
 * POST a single setting value to the backend REST API.
 *
 * The endpoint is expected to be `POST /api/settings/{key}` with a JSON body
 * `{ value }`.  If the backend is unreachable or returns an error the call
 * resolves to `false` and logs a warning.
 */
export async function syncSettingToBackend(key: string, value: unknown): Promise<boolean> {
  try {
    const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    return response.ok;
  } catch (err) {
    console.warn(`[settingsBridge] syncSettingToBackend("${key}") failed, falling back to localStorage:`, err);
    return false;
  }
}

/**
 * GET a single setting value from the backend REST API.
 *
 * The endpoint is expected to be `GET /api/settings/{key}` and should return
 * `{ value }`.  Returns `undefined` when the backend is unavailable.
 */
export async function loadSettingFromBackend<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const response = await fetch(`/api/settings/${encodeURIComponent(key)}`);
    if (response.ok) {
      const data = await response.json();
      return data.value as T;
    }
    return undefined;
  } catch (err) {
    console.warn(`[settingsBridge] loadSettingFromBackend("${key}") failed, falling back to localStorage:`, err);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Generic settings bridge hook
// ---------------------------------------------------------------------------

interface UseSettingsBridgeReturn<T> {
  /** Current value (starts with `defaultValue` until the load completes). */
  value: T;
  /** Update the value locally AND persist it (localStorage + optional backend). */
  setValue: (next: T) => Promise<void>;
  /** `true` while the initial load is in flight. */
  isLoading: boolean;
}

/**
 * Generic React hook that manages a single settings value.
 *
 * Persistence strategy (layered):
 *   1. localStorage  -- immediate, always available
 *   2. Backend API    -- best-effort POST/GET, falls back silently
 *
 * ```tsx
 * const { value, setValue, isLoading } = useSettingsBridge<number>('budgetLimit', 100);
 * ```
 */
export function useSettingsBridge<T>(key: string, defaultValue: T): UseSettingsBridgeReturn<T> {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial load: try backend first, fall back to localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Try backend
      const backendValue = await loadSettingFromBackend<T>(key);
      if (!cancelled && mountedRef.current && backendValue !== undefined) {
        setValueState(backendValue);
        setIsLoading(false);
        return;
      }

      // 2. Fall back to localStorage
      try {
        const stored = localStorage.getItem(`settings:${key}`);
        if (stored !== null && !cancelled && mountedRef.current) {
          setValueState(JSON.parse(stored) as T);
        }
      } catch {
        // corrupt localStorage entry -- ignore, use default
      }

      if (!cancelled && mountedRef.current) {
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, defaultValue]);

  const setValue = useCallback(
    async (next: T): Promise<void> => {
      // Optimistic local update
      setValueState(next);

      // Persist to localStorage (synchronous, always works)
      try {
        localStorage.setItem(`settings:${key}`, JSON.stringify(next));
      } catch {
        console.warn(`[settingsBridge] localStorage write failed for key "${key}"`);
      }

      // Best-effort backend sync
      await syncSettingToBackend(key, next);
    },
    [key]
  );

  return { value, setValue, isLoading };
}
