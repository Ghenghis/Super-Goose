import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
} from 'lucide-react';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { backendApi } from '../../utils/backendApi';
import type { GuardrailsScanEntry, ScanResultType } from '../../utils/backendApi';
import { useSettingsBridge } from '../../utils/settingsBridge';

// Fallback data used when the backend API is unreachable.
const FALLBACK_SCANS: GuardrailsScanEntry[] = [
  {
    id: 'scan-001',
    timestamp: '2026-02-10T14:35:12Z',
    direction: 'input',
    detector: 'Prompt Injection',
    result: 'pass',
    message: 'No injection patterns detected in user prompt.',
    sessionName: 'Refactor authentication module',
  },
  {
    id: 'scan-002',
    timestamp: '2026-02-10T14:35:14Z',
    direction: 'output',
    detector: 'Secret Scanner',
    result: 'warn',
    message: 'Potential API key pattern detected in generated code. Pattern: sk-...',
    sessionName: 'Refactor authentication module',
  },
  {
    id: 'scan-003',
    timestamp: '2026-02-10T14:32:05Z',
    direction: 'input',
    detector: 'PII Detection',
    result: 'pass',
    message: 'No personal identifiable information found.',
    sessionName: 'Refactor authentication module',
  },
  {
    id: 'scan-004',
    timestamp: '2026-02-09T11:10:22Z',
    direction: 'output',
    detector: 'Secret Scanner',
    result: 'block',
    message: 'Database connection string with credentials detected and redacted from output.',
    sessionName: 'Fix database connection pooling',
  },
  {
    id: 'scan-005',
    timestamp: '2026-02-09T11:10:18Z',
    direction: 'input',
    detector: 'Jailbreak',
    result: 'pass',
    message: 'No jailbreak attempts detected.',
    sessionName: 'Fix database connection pooling',
  },
  {
    id: 'scan-006',
    timestamp: '2026-02-08T16:42:30Z',
    direction: 'output',
    detector: 'Keyword Filter',
    result: 'warn',
    message: 'Test data contains email addresses that may be real. Flagged for review.',
    sessionName: 'Add unit tests for payment service',
  },
  {
    id: 'scan-007',
    timestamp: '2026-02-08T16:42:28Z',
    direction: 'input',
    detector: 'Topic Filter',
    result: 'pass',
    message: 'Message topic within approved boundaries.',
    sessionName: 'Add unit tests for payment service',
  },
  {
    id: 'scan-008',
    timestamp: '2026-02-07T09:15:44Z',
    direction: 'input',
    detector: 'Prompt Injection',
    result: 'warn',
    message: 'Input contains system prompt override language. Allowed but flagged.',
    sessionName: 'Deploy staging environment',
  },
  {
    id: 'scan-009',
    timestamp: '2026-02-07T09:15:47Z',
    direction: 'output',
    detector: 'PII Detection',
    result: 'pass',
    message: 'No PII found in output.',
    sessionName: 'Deploy staging environment',
  },
  {
    id: 'scan-010',
    timestamp: '2026-02-06T13:45:10Z',
    direction: 'output',
    detector: 'Secret Scanner',
    result: 'pass',
    message: 'No secrets or credentials in output.',
    sessionName: 'Optimize image processing pipeline',
  },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const resultConfig: Record<ScanResultType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pass: {
    label: 'Pass',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: ShieldCheck,
  },
  warn: {
    label: 'Warn',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    icon: ShieldAlert,
  },
  block: {
    label: 'Block',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: ShieldX,
  },
};

const GuardrailsPanel = () => {
  const { value: guardrailsEnabled, setValue: setGuardrailsEnabled } =
    useSettingsBridge<boolean>('super_goose_guardrails_enabled', true);
  const { value: guardrailsMode, setValue: setGuardrailsMode } =
    useSettingsBridge<'warn' | 'block'>('super_goose_guardrails_mode', 'warn');
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<'warn' | 'block'>('warn');
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [scans, setScans] = useState<GuardrailsScanEntry[]>(FALLBACK_SCANS);
  const [scansLoading, setScansLoading] = useState(true);

  // Sync local state with settings bridge values
  useEffect(() => {
    setEnabled(guardrailsEnabled);
    setMode(guardrailsMode);
  }, [guardrailsEnabled, guardrailsMode]);

  // Fetch guardrails config from backend on mount
  const fetchConfig = useCallback(async () => {
    try {
      const config = await backendApi.getGuardrails();
      if (config) {
        setEnabled(config.enabled);
        setMode(config.mode);
        await setGuardrailsEnabled(config.enabled);
        await setGuardrailsMode(config.mode);
      }
    } catch {
      // Fallback to settings bridge values (already loaded)
    }
  }, [setGuardrailsEnabled, setGuardrailsMode]);

  // Fetch scan history from backend, falling back to FALLBACK_SCANS
  const fetchScans = useCallback(async () => {
    setScansLoading(true);
    try {
      const data = await backendApi.getGuardrailsScans();
      if (data && data.length > 0) {
        setScans(data);
      }
      // If data is null or empty, keep the fallback scans already in state
    } catch {
      // Keep fallback data on error
    } finally {
      setScansLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchScans();
  }, [fetchConfig, fetchScans]);

  // Persist enabled toggle to both backend and settings bridge
  const handleEnabledChange = useCallback(async (checked: boolean) => {
    setEnabled(checked);
    await Promise.all([
      backendApi.updateGuardrailsConfig({ enabled: checked, mode }),
      setGuardrailsEnabled(checked),
    ]);
  }, [mode, setGuardrailsEnabled]);

  // Persist mode change to both backend and settings bridge
  const handleModeChange = useCallback(async (newMode: 'warn' | 'block') => {
    setMode(newMode);
    await Promise.all([
      backendApi.updateGuardrailsConfig({ enabled, mode: newMode }),
      setGuardrailsMode(newMode),
    ]);
  }, [enabled, setGuardrailsMode]);

  const passCount = scans.filter((s) => s.result === 'pass').length;
  const warnCount = scans.filter((s) => s.result === 'warn').length;
  const blockCount = scans.filter((s) => s.result === 'block').length;

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="bg-background-default px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <div className="flex justify-between items-center mb-1">
              <h1 className="text-4xl font-light">Guardrails</h1>
            </div>
            <p className="text-sm text-text-muted mt-2">
              Input and output scanning for safety, secrets, PII, and policy compliance.
            </p>

            {/* Controls */}
            <div className="flex items-center justify-between mt-4 p-3 border border-border-default rounded-lg bg-background-default">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-text-default">Guardrails Engine</p>
                  <p className="text-xs text-text-muted">
                    Scan all inputs and outputs for safety
                  </p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={handleEnabledChange}
                variant="mono"
              />
            </div>

            {/* Mode selector */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-text-muted">Mode:</span>
              <button
                onClick={() => handleModeChange('warn')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'warn'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-background-muted text-text-muted hover:text-text-default'
                }`}
              >
                Warn Only
              </button>
              <button
                onClick={() => handleModeChange('block')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'block'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-background-muted text-text-muted hover:text-text-default'
                }`}
              >
                Block
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-text-muted">{passCount} passed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-text-muted">{warnCount} warnings</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-text-muted">{blockCount} blocked</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scan history */}
        <ScrollArea className="flex-1 px-6">
          {scansLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              <span className="ml-2 text-xs text-text-muted">Loading scan history...</span>
            </div>
          )}
          <div className="space-y-2 pb-8">
            {scans.map((scan) => {
              const isExpanded = expandedEntries[scan.id];
              const rc = resultConfig[scan.result];
              const ResultIcon = rc.icon;

              return (
                <div
                  key={scan.id}
                  className="border border-border-default rounded-lg bg-background-default overflow-hidden"
                >
                  <button
                    onClick={() => toggleEntry(scan.id)}
                    className="w-full px-4 py-2.5 hover:bg-background-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                        )}
                        {scan.direction === 'input' ? (
                          <ArrowDownToLine className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        ) : (
                          <ArrowUpFromLine className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-text-default">{scan.detector}</span>
                        <span className="text-xs text-text-muted hidden sm:inline">{scan.sessionName}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(scan.timestamp)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${rc.color}`}
                        >
                          <ResultIcon className="w-3 h-3" />
                          {rc.label}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-default px-4 py-2.5">
                      <p className="text-xs text-text-muted">{scan.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-text-muted">
                          Direction:{' '}
                          <span className="font-medium text-text-default capitalize">{scan.direction}</span>
                        </span>
                        <span className="text-xs text-text-muted">
                          Session:{' '}
                          <span className="font-medium text-text-default">{scan.sessionName}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </MainPanelLayout>
  );
};

export default GuardrailsPanel;
