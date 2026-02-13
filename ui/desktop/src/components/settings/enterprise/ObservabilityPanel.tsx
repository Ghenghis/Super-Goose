import { useState, useEffect, useCallback } from 'react';
import { Switch } from '../../ui/switch';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { backendApi } from '../../../utils/backendApi';

interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: string;
  period: string;
}

const DEFAULT_USAGE: TokenUsage = {
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  estimatedCost: '$0.00',
  period: 'current session',
};

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export default function ObservabilityPanel() {
  const [costTrackingEnabled, setCostTrackingEnabled] = useState(false);
  const [usage, setUsage] = useState<TokenUsage>(DEFAULT_USAGE);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      setIsLoading(true);
      // Try the enterprise observability endpoint first
      const obsData = await backendApi.getObservabilityConfig();
      if (obsData) {
        setCostTrackingEnabled(obsData.costTrackingEnabled);
        setUsage(obsData.usage);
      } else {
        // Fallback: try the cost summary endpoint for backward compatibility
        const costData = await backendApi.getCostSummary();
        if (costData && costData.model_breakdown) {
          const totalInput = costData.model_breakdown.reduce((s, m) => s + m.input_tokens, 0);
          const totalOutput = costData.model_breakdown.reduce((s, m) => s + m.output_tokens, 0);
          setUsage({
            totalTokens: totalInput + totalOutput,
            promptTokens: totalInput,
            completionTokens: totalOutput,
            estimatedCost: `$${(costData.total_cost || 0).toFixed(2)}`,
            period: 'current session',
          });
        } else {
          setUsage(DEFAULT_USAGE);
        }
      }
    } catch {
      console.debug('Observability data not available, using defaults');
      setUsage(DEFAULT_USAGE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const handleCostTrackingToggle = async (enabled: boolean) => {
    setCostTrackingEnabled(enabled);
    const result = await backendApi.updateObservabilityConfig({ costTrackingEnabled: enabled });
    if (!result) {
      // Revert on failure
      setCostTrackingEnabled(!enabled);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    const data = {
      exportedAt: new Date().toISOString(),
      format,
      usage,
      costTrackingEnabled,
    };

    const blob =
      format === 'json'
        ? new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        : new Blob(
            [
              'metric,value\n' +
                `total_tokens,${usage.totalTokens}\n` +
                `prompt_tokens,${usage.promptTokens}\n` +
                `completion_tokens,${usage.completionTokens}\n` +
                `estimated_cost,"${usage.estimatedCost}"\n` +
                `period,"${usage.period}"\n`,
            ],
            { type: 'text/csv' }
          );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goose-usage-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-background-muted rounded w-1/2"></div>
          <div className="h-24 bg-background-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Cost tracking toggle */}
      <div className="flex items-center justify-between px-2 py-2 hover:bg-background-muted rounded-lg transition-all">
        <div>
          <h4 className="text-xs font-medium text-text-default">Cost Tracking</h4>
          <p className="text-xs text-text-muted max-w-md mt-[2px]">
            Track token usage and estimated costs across all sessions
          </p>
        </div>
        <Switch
          checked={costTrackingEnabled}
          onCheckedChange={handleCostTrackingToggle}
          variant="mono"
        />
      </div>

      {/* Token usage summary */}
      <Card className="rounded-lg py-3">
        <CardContent className="px-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-text-default">Token Usage</h4>
            <span className="text-xs text-text-muted">{usage.period}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-text-muted">Total Tokens</p>
              <p className="text-lg font-semibold text-text-default">
                {formatTokenCount(usage.totalTokens)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Estimated Cost</p>
              <p className="text-lg font-semibold text-text-default">{usage.estimatedCost}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Prompt Tokens</p>
              <p className="text-sm font-medium text-text-default">
                {formatTokenCount(usage.promptTokens)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Completion Tokens</p>
              <p className="text-sm font-medium text-text-default">
                {formatTokenCount(usage.completionTokens)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics display placeholder */}
      <Card className="rounded-lg py-3">
        <CardContent className="px-3">
          <h4 className="text-xs font-medium text-text-default mb-2">Metrics</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Avg. response time</span>
              <span className="text-text-default font-medium">--</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Requests today</span>
              <span className="text-text-default font-medium">--</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Error rate</span>
              <span className="text-text-default font-medium">--</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Cache hit rate</span>
              <span className="text-text-default font-medium">--</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export buttons */}
      <div className="flex gap-2 px-2">
        <Button variant="secondary" size="sm" onClick={() => handleExport('json')}>
          Export JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={() => handleExport('csv')}>
          Export CSV
        </Button>
      </div>
    </div>
  );
}
