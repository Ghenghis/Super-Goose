/**
 * CLIPreferencesPanel.tsx
 *
 * Settings / preferences panel for CLI configuration. Allows users to
 * view and change the CLI install path, auto-update behaviour, default
 * provider, shell integration, terminal appearance, and advanced options.
 *
 * Follows the same form patterns as other settings panels in the project
 * (label styles, Switch, Button, Card, section borders).
 */

import { useState, useCallback } from 'react';
import {
  FolderOpen,
  RefreshCw,
  Globe,
  TerminalSquare,
  Settings2,
  RotateCcw,
} from 'lucide-react';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { detectPlatform, getInstallPath } from './CLIDownloadService';
import { useSettingsBridge, SettingsKeys } from '../../utils/settingsBridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All preferences managed by this panel. */
export interface CLIPreferences {
  cliPath: string;
  autoUpdate: boolean;
  defaultProvider: string;
  shellIntegration: boolean;
  fontSize: number;
  maxScrollback: number;
  showTimestamps: boolean;
  customArgs: string;
  debugMode: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Provider options for the default-provider dropdown. */
const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama' },
] as const;

/** Font-size range limits. */
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 18;
const FONT_SIZE_DEFAULT = 13;

/** Scrollback limits. */
const SCROLLBACK_MIN = 500;
const SCROLLBACK_MAX = 10_000;
const SCROLLBACK_DEFAULT = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UI-only terminal display preferences (kept in localStorage). */
interface TerminalDisplayPrefs {
  cliPath: string;
  fontSize: number;
  maxScrollback: number;
  showTimestamps: boolean;
}

/** Load UI-only terminal display prefs from localStorage. */
function loadTerminalDisplayPrefs(): TerminalDisplayPrefs {
  const platform = detectPlatform();
  return {
    cliPath: localStorage.getItem('cli_path') || getInstallPath(platform),
    fontSize: Number(localStorage.getItem('cli_font_size')) || FONT_SIZE_DEFAULT,
    maxScrollback: Number(localStorage.getItem('cli_max_scrollback')) || SCROLLBACK_DEFAULT,
    showTimestamps: localStorage.getItem('cli_show_timestamps') === 'true',
  };
}

/** Persist a single UI-only preference key to localStorage. */
function savePref(key: string, value: string): void {
  localStorage.setItem(key, value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CLIPreferencesPanel() {
  // -- Bridged settings (persisted via Electron settings API + backend) ------
  const { value: autoUpdate, setValue: setAutoUpdate } =
    useSettingsBridge<boolean>(SettingsKeys.CliAutoUpdate, true);
  const { value: defaultProvider, setValue: setDefaultProvider } =
    useSettingsBridge<string>(SettingsKeys.CliDefaultProvider, 'anthropic');
  const { value: customArgs, setValue: setCustomArgs } =
    useSettingsBridge<string>(SettingsKeys.CliCustomArgs, '');
  const { value: debugMode, setValue: setDebugMode } =
    useSettingsBridge<boolean>(SettingsKeys.CliDebugMode, false);
  const { value: shellIntegration, setValue: setShellIntegration } =
    useSettingsBridge<boolean>(SettingsKeys.CliShellIntegration, false);

  // -- UI-only terminal display prefs (localStorage only) --------------------
  const [displayPrefs, setDisplayPrefs] = useState<TerminalDisplayPrefs>(loadTerminalDisplayPrefs);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // -- Updater helpers --------------------------------------------------------

  /** Generic setter for UI-only display prefs that also persists to localStorage. */
  const updateDisplay = useCallback(
    <K extends keyof TerminalDisplayPrefs>(key: K, storageKey: string, value: TerminalDisplayPrefs[K]) => {
      setDisplayPrefs((prev) => ({ ...prev, [key]: value }));
      savePref(storageKey, String(value));
    },
    [],
  );

  /** Reset all CLI preferences to defaults. */
  const handleReset = useCallback(async () => {
    // Reset UI-only localStorage keys
    const localKeys = [
      'cli_path',
      'cli_font_size',
      'cli_max_scrollback',
      'cli_show_timestamps',
    ];
    localKeys.forEach((k) => localStorage.removeItem(k));
    setDisplayPrefs(loadTerminalDisplayPrefs());

    // Reset bridged settings to defaults
    await setAutoUpdate(true);
    await setDefaultProvider('anthropic');
    await setCustomArgs('');
    await setDebugMode(false);
    await setShellIntegration(false);

    setShowResetConfirm(false);
  }, [setAutoUpdate, setDefaultProvider, setCustomArgs, setDebugMode, setShellIntegration]);

  // -- Render -----------------------------------------------------------------

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1">
      {/* ================================================================== */}
      {/* CLI Path                                                           */}
      {/* ================================================================== */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-text-muted" />
            CLI Path
          </CardTitle>
          <CardDescription>Location of the goose CLI binary on disk</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 px-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={displayPrefs.cliPath}
              className="flex-1 px-3 py-1.5 text-xs font-mono border rounded bg-background-default text-text-default border-border-default"
            />
            <Button variant="secondary" size="sm" disabled title="Browse for CLI binary (not available in mock)">
              Browse
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Auto-Update & Default Provider                                     */}
      {/* ================================================================== */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-text-muted" />
            Updates &amp; Provider
          </CardTitle>
          <CardDescription>Configure automatic updates and default AI provider</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 px-4">
          {/* Auto-Update toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Auto-Update CLI</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Automatically check for and install CLI updates on app start
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={autoUpdate}
                onCheckedChange={(checked: boolean) => setAutoUpdate(checked)}
                variant="mono"
              />
            </div>
          </div>

          {/* Default Provider */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Default Provider</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                AI provider used by CLI commands when no override is specified
              </p>
            </div>
            <div className="flex items-center">
              <select
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                className="px-2 py-1 text-sm border rounded bg-background-default text-text-default border-border-default"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Shell Integration                                                  */}
      {/* ================================================================== */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-text-muted" />
            Shell Integration
          </CardTitle>
          <CardDescription>Add the goose CLI to your system PATH</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Add to PATH</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Make the <code className="px-1 bg-background-muted rounded">goose</code> command available
                in any terminal session
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={shellIntegration}
                onCheckedChange={(checked: boolean) => setShellIntegration(checked)}
                variant="mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Terminal Settings                                                  */}
      {/* ================================================================== */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-text-muted" />
            Terminal Settings
          </CardTitle>
          <CardDescription>Customize the embedded terminal appearance</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 px-4">
          {/* Font size slider */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Font Size</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Terminal font size ({FONT_SIZE_MIN}&ndash;{FONT_SIZE_MAX}px)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                value={displayPrefs.fontSize}
                onChange={(e) => updateDisplay('fontSize', 'cli_font_size', Number(e.target.value))}
                className="w-24 accent-zinc-500"
              />
              <span className="text-xs font-mono text-text-muted w-8 text-right">
                {displayPrefs.fontSize}px
              </span>
            </div>
          </div>

          {/* Max scrollback */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Max Scrollback Lines</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Number of lines kept in the terminal buffer ({SCROLLBACK_MIN.toLocaleString()}&ndash;
                {SCROLLBACK_MAX.toLocaleString()})
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={SCROLLBACK_MIN}
                max={SCROLLBACK_MAX}
                step={500}
                value={displayPrefs.maxScrollback}
                onChange={(e) => {
                  const val = Math.max(SCROLLBACK_MIN, Math.min(SCROLLBACK_MAX, Number(e.target.value)));
                  updateDisplay('maxScrollback', 'cli_max_scrollback', val);
                }}
                className="w-24 px-2 py-1 text-sm border rounded bg-background-default text-text-default border-border-default text-right"
              />
            </div>
          </div>

          {/* Show timestamps */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Show Timestamps</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Display a timestamp next to each terminal entry
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={displayPrefs.showTimestamps}
                onCheckedChange={(checked: boolean) =>
                  updateDisplay('showTimestamps', 'cli_show_timestamps', checked)
                }
                variant="mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Advanced                                                           */}
      {/* ================================================================== */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-text-muted" />
            Advanced
          </CardTitle>
          <CardDescription>Additional CLI configuration for power users</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 px-4">
          {/* Custom CLI args */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-text-default text-xs font-medium">Custom CLI Arguments</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Extra arguments appended to every CLI invocation
              </p>
            </div>
            <div className="flex items-center">
              <input
                type="text"
                value={customArgs}
                onChange={(e) => setCustomArgs(e.target.value)}
                placeholder="--verbose --no-color"
                className="w-48 px-2 py-1 text-xs font-mono border rounded bg-background-default text-text-default border-border-default placeholder:text-text-muted"
              />
            </div>
          </div>

          {/* Debug mode */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs font-medium">Debug Mode</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Enable verbose CLI logging and show raw protocol messages
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={debugMode}
                onCheckedChange={(checked: boolean) => setDebugMode(checked)}
                variant="mono"
              />
            </div>
          </div>

          {/* Reset button */}
          <div className="pt-2 border-t border-border-default">
            {!showResetConfirm ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset CLI Configuration
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">
                  Are you sure? This will reset all CLI settings to defaults.
                </span>
                <Button variant="destructive" size="sm" onClick={handleReset}>
                  Confirm Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
