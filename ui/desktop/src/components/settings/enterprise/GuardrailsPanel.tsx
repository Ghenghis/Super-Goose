import { useState, useEffect, useCallback } from 'react';
import { Switch } from '../../ui/switch';
import { Card, CardContent } from '../../ui/card';
import CustomRadio from '../../ui/CustomRadio';

interface DetectorConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high';
}

interface GuardrailsConfig {
  detectors: DetectorConfig[];
  failMode: 'open' | 'closed';
}

const DEFAULT_DETECTORS: DetectorConfig[] = [
  {
    id: 'prompt_injection',
    name: 'Prompt Injection',
    description: 'Detect attempts to override system instructions',
    enabled: false,
    sensitivity: 'medium',
  },
  {
    id: 'pii_detection',
    name: 'PII Detection',
    description: 'Identify and redact personal identifiable information',
    enabled: false,
    sensitivity: 'medium',
  },
  {
    id: 'jailbreak',
    name: 'Jailbreak',
    description: 'Block attempts to bypass safety constraints',
    enabled: false,
    sensitivity: 'medium',
  },
  {
    id: 'topic_filter',
    name: 'Topic Filter',
    description: 'Restrict conversations to approved topics',
    enabled: false,
    sensitivity: 'medium',
  },
  {
    id: 'keyword_filter',
    name: 'Keyword Filter',
    description: 'Block messages containing specific keywords',
    enabled: false,
    sensitivity: 'medium',
  },
  {
    id: 'secret_scanner',
    name: 'Secret Scanner',
    description: 'Detect API keys, tokens, and credentials in output',
    enabled: false,
    sensitivity: 'medium',
  },
];

export default function GuardrailsPanel() {
  const [detectors, setDetectors] = useState<DetectorConfig[]>(DEFAULT_DETECTORS);
  const [failMode, setFailMode] = useState<'open' | 'closed'>('closed');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeCount = detectors.filter((d) => d.enabled).length;

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/enterprise/guardrails/config');
      if (response.ok) {
        const data: GuardrailsConfig = await response.json();
        if (data.detectors && data.detectors.length > 0) {
          setDetectors(data.detectors);
        }
        if (data.failMode) {
          setFailMode(data.failMode);
        }
      }
    } catch (err) {
      // Silently fall back to defaults if endpoint is unavailable
      console.debug('Enterprise guardrails config not available, using defaults');
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleDetectorToggle = (id: string, enabled: boolean) => {
    setDetectors((prev) => prev.map((d) => (d.id === id ? { ...d, enabled } : d)));
  };

  const handleSensitivityChange = (id: string, sensitivity: 'low' | 'medium' | 'high') => {
    setDetectors((prev) => prev.map((d) => (d.id === id ? { ...d, sensitivity } : d)));
  };

  const handleFailModeChange = (mode: 'open' | 'closed') => {
    setFailMode(mode);
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-background-muted rounded w-1/3"></div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-background-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 px-2">
        <p className="text-xs text-text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Status summary */}
      <div className="flex items-center justify-between px-2">
        <p className="text-xs text-text-muted">
          {activeCount}/{detectors.length} detectors active
        </p>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            activeCount > 0
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {activeCount > 0 ? 'Protected' : 'Inactive'}
        </span>
      </div>

      {/* Detector grid */}
      <div className="grid grid-cols-2 gap-3">
        {detectors.map((detector) => (
          <Card key={detector.id} className="rounded-lg py-3">
            <CardContent className="px-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-medium text-text-default truncate">
                    {detector.name}
                  </h4>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                    {detector.description}
                  </p>
                </div>
                <Switch
                  checked={detector.enabled}
                  onCheckedChange={(checked) => handleDetectorToggle(detector.id, checked)}
                  variant="mono"
                />
              </div>

              <div
                className={`transition-opacity duration-200 ${detector.enabled ? 'opacity-100' : 'opacity-40'}`}
              >
                <label className="text-xs text-text-muted">Sensitivity</label>
                <select
                  value={detector.sensitivity}
                  onChange={(e) =>
                    handleSensitivityChange(
                      detector.id,
                      e.target.value as 'low' | 'medium' | 'high'
                    )
                  }
                  disabled={!detector.enabled}
                  className={`w-full mt-0.5 px-2 py-1 text-xs border rounded ${
                    detector.enabled
                      ? 'border-border-default bg-background-default text-text-default cursor-pointer'
                      : 'border-border-default bg-background-muted text-text-muted cursor-not-allowed'
                  }`}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fail mode selector */}
      <div className="border-t border-border-default pt-4 px-2">
        <h4 className="text-xs font-medium text-text-default mb-1">Failure Mode</h4>
        <p className="text-xs text-text-muted mb-3">
          How the system responds when a guardrail check fails
        </p>
        <div className="space-y-1">
          <CustomRadio
            id="failmode-closed"
            name="failMode"
            value="closed"
            checked={failMode === 'closed'}
            onChange={() => handleFailModeChange('closed')}
            label="Fail Closed"
            secondaryLabel="Block the request when detection fails (recommended)"
          />
          <CustomRadio
            id="failmode-open"
            name="failMode"
            value="open"
            checked={failMode === 'open'}
            onChange={() => handleFailModeChange('open')}
            label="Fail Open"
            secondaryLabel="Allow the request when detection fails"
          />
        </div>
      </div>
    </div>
  );
}
