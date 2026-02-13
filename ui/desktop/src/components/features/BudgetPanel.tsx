import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, Settings2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { backendApi } from '../../utils/backendApi';
import { useSettingsBridge } from '../../utils/settingsBridge';
import type { CostModelBreakdown } from '../../utils/backendApi';

interface CostBreakdown {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  calls: number;
}

interface DailyUsage {
  date: string;
  cost: number;
}

const MOCK_COST_BREAKDOWN: CostBreakdown[] = [
  { model: 'claude-sonnet-4-20250514', provider: 'Anthropic', inputTokens: 245000, outputTokens: 62000, cost: 1.47, calls: 32 },
  { model: 'gpt-4o', provider: 'OpenAI', inputTokens: 180000, outputTokens: 45000, cost: 1.12, calls: 18 },
  { model: 'claude-haiku-3.5', provider: 'Anthropic', inputTokens: 520000, outputTokens: 130000, cost: 0.39, calls: 85 },
  { model: 'gpt-4o-mini', provider: 'OpenAI', inputTokens: 310000, outputTokens: 95000, cost: 0.18, calls: 42 },
];

const MOCK_DAILY_USAGE: DailyUsage[] = [
  { date: '02/04', cost: 0.42 },
  { date: '02/05', cost: 0.78 },
  { date: '02/06', cost: 0.95 },
  { date: '02/07', cost: 0.31 },
  { date: '02/08', cost: 1.24 },
  { date: '02/09', cost: 0.67 },
  { date: '02/10', cost: 0.79 },
];

/** Map API model breakdown to local CostBreakdown shape. */
function mapApiBreakdown(items: CostModelBreakdown[]): CostBreakdown[] {
  return items.map((item) => ({
    model: item.model,
    provider: item.provider,
    inputTokens: item.input_tokens,
    outputTokens: item.output_tokens,
    cost: item.cost,
    calls: 0, // Backend doesn't track per-model call counts
  }));
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

const BudgetPanel = () => {
  const { value: budgetLimitValue, setValue: setBudgetLimitValue, isLoading: budgetLoading } =
    useSettingsBridge<number>('super_goose_budget_limit', 10.00);
  const [budgetLimit, setBudgetLimit] = useState('10.00');
  const [isEditing, setIsEditing] = useState(false);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown[]>(MOCK_COST_BREAKDOWN);
  const [dailyUsage] = useState<DailyUsage[]>(MOCK_DAILY_USAGE);
  // Daily usage remains mock until a daily usage history endpoint is available

  // Sync budgetLimit display value with hook value
  useEffect(() => {
    if (!budgetLoading) {
      setBudgetLimit(budgetLimitValue.toFixed(2));
    }
  }, [budgetLimitValue, budgetLoading]);

  const fetchCostData = useCallback(async () => {
    try {
      const [summary, budget] = await Promise.all([
        backendApi.getCostSummary(),
        backendApi.getCostBudget(),
      ]);

      if (summary && summary.model_breakdown && summary.model_breakdown.length > 0) {
        setCostBreakdown(mapApiBreakdown(summary.model_breakdown));
      }
      // If the API returns a budget limit, sync it with our settings
      if (budget && budget.limit !== null && budget.limit !== undefined) {
        setBudgetLimit(budget.limit.toFixed(2));
        await setBudgetLimitValue(budget.limit);
      }
    } catch {
      // Fallback to mock data -- already set as defaults
    }
  }, [setBudgetLimitValue]);

  useEffect(() => {
    fetchCostData();
  }, [fetchCostData]);

  const totalCost = costBreakdown.reduce((sum, item) => sum + item.cost, 0);
  const budgetNum = parseFloat(budgetLimit) || 0;
  const budgetPct = budgetNum > 0 ? Math.min((totalCost / budgetNum) * 100, 100) : 0;
  const isOverBudget = totalCost > budgetNum && budgetNum > 0;
  const maxDaily = Math.max(...dailyUsage.map((d) => d.cost));

  const handleSaveBudget = async () => {
    setIsEditing(false);
    const limit = parseFloat(budgetLimit);
    if (!isNaN(limit)) {
      // Persist to both backend API and settings bridge
      await Promise.all([
        backendApi.setBudgetLimit(limit),
        setBudgetLimitValue(limit),
      ]);
    }
  };

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="bg-background-default px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <div className="flex justify-between items-center mb-1">
              <h1 className="text-4xl font-light">Budget & Costs</h1>
            </div>
            <p className="text-sm text-text-muted mt-2">
              Track spending across models and providers with configurable budget limits.
            </p>

            {/* Current session cost card */}
            <div className="mt-4 p-4 border border-border-default rounded-lg bg-background-default">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Current Session Cost</p>
                  <p className={`text-3xl font-light mt-1 ${isOverBudget ? 'text-red-500' : 'text-text-default'}`}>
                    ${totalCost.toFixed(2)}
                  </p>
                  {isOverBudget && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs text-red-500 font-medium">Over budget</span>
                    </div>
                  )}
                </div>
                <DollarSign className="w-8 h-8 text-text-muted opacity-30" />
              </div>

              {/* Budget bar */}
              {budgetNum > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                    <span>${totalCost.toFixed(2)} of ${budgetLimit} budget</span>
                    <span>{budgetPct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-background-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        budgetPct >= 90 ? 'bg-red-500' : budgetPct >= 70 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Budget setting */}
              <div className="mt-3 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-text-muted" />
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-muted">$</span>
                    <Input
                      type="number"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(e.target.value)}
                      className="w-24 h-7 text-sm"
                      step="0.50"
                      min="0"
                      autoFocus
                    />
                    <Button variant="outline" size="xs" onClick={handleSaveBudget}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-text-muted hover:text-text-default transition-colors"
                  >
                    Budget: ${budgetLimit} per session (click to edit)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-8">
            {/* Daily usage chart */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-text-muted" />
                <h2 className="text-sm font-medium text-text-default">Daily Usage (Last 7 days)</h2>
              </div>
              <div className="border border-border-default rounded-lg bg-background-default p-4">
                <div className="flex items-end gap-2 h-32">
                  {dailyUsage.map((day) => {
                    const heightPct = maxDaily > 0 ? (day.cost / maxDaily) * 100 : 0;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-text-muted">${day.cost.toFixed(2)}</span>
                        <div className="w-full flex items-end" style={{ height: '80px' }}>
                          <div
                            className="w-full rounded-t-sm bg-blue-500/70 dark:bg-blue-400/50 transition-all hover:bg-blue-500 dark:hover:bg-blue-400/70"
                            style={{ height: `${heightPct}%`, minHeight: '2px' }}
                          />
                        </div>
                        <span className="text-xs text-text-muted">{day.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cost breakdown by model */}
            <div>
              <h2 className="text-sm font-medium text-text-default mb-3">Cost Breakdown by Model</h2>
              <div className="border border-border-default rounded-lg bg-background-default overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-6 gap-2 px-4 py-2 bg-background-muted/50 text-xs text-text-muted font-medium">
                  <span className="col-span-2">Model</span>
                  <span className="text-right">Input</span>
                  <span className="text-right">Output</span>
                  <span className="text-right">Calls</span>
                  <span className="text-right">Cost</span>
                </div>
                {/* Table rows */}
                {costBreakdown.map((item, idx) => (
                  <div
                    key={item.model}
                    className={`grid grid-cols-6 gap-2 px-4 py-2.5 ${
                      idx < costBreakdown.length - 1 ? 'border-b border-border-default/50' : ''
                    } hover:bg-background-muted/30 transition-colors`}
                  >
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm text-text-default truncate">{item.model}</p>
                      <p className="text-xs text-text-muted">{item.provider}</p>
                    </div>
                    <span className="text-xs text-text-muted text-right self-center">
                      {formatTokens(item.inputTokens)}
                    </span>
                    <span className="text-xs text-text-muted text-right self-center">
                      {formatTokens(item.outputTokens)}
                    </span>
                    <span className="text-xs text-text-muted text-right self-center">
                      {item.calls}
                    </span>
                    <span className="text-sm font-medium text-text-default text-right self-center">
                      ${item.cost.toFixed(2)}
                    </span>
                  </div>
                ))}
                {/* Total row */}
                <div className="grid grid-cols-6 gap-2 px-4 py-2.5 border-t border-border-default bg-background-muted/30">
                  <span className="col-span-2 text-sm font-medium text-text-default">Total</span>
                  <span className="text-xs text-text-muted text-right self-center">
                    {formatTokens(costBreakdown.reduce((s, i) => s + i.inputTokens, 0))}
                  </span>
                  <span className="text-xs text-text-muted text-right self-center">
                    {formatTokens(costBreakdown.reduce((s, i) => s + i.outputTokens, 0))}
                  </span>
                  <span className="text-xs text-text-muted text-right self-center">
                    {costBreakdown.reduce((s, i) => s + i.calls, 0)}
                  </span>
                  <span className="text-sm font-semibold text-text-default text-right self-center">
                    ${totalCost.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </MainPanelLayout>
  );
};

export default BudgetPanel;
