import { useState, useEffect, useCallback } from 'react';
import { Eye, ThumbsUp, ThumbsDown, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { backendApi } from '../../utils/backendApi';
import { useSettingsBridge } from '../../utils/settingsBridge';
import type { LearningInsight } from '../../utils/backendApi';

interface CriticEvaluation {
  id: string;
  timestamp: string;
  sessionName: string;
  taskSummary: string;
  scores: {
    correctness: number;
    completeness: number;
    efficiency: number;
    safety: number;
  };
  overallScore: number;
  verdict: 'good' | 'acceptable' | 'needs_improvement';
  suggestions: string[];
}

const MOCK_EVALUATIONS: CriticEvaluation[] = [
  {
    id: 'crit-001',
    timestamp: '2026-02-10T14:35:00Z',
    sessionName: 'Refactor authentication module',
    taskSummary: 'Refactored JWT validation to use RS256 and added refresh token rotation.',
    scores: { correctness: 9, completeness: 8, efficiency: 7, safety: 9 },
    overallScore: 8.3,
    verdict: 'good',
    suggestions: [
      'Consider adding token blacklist for revoked refresh tokens.',
      'Add rate limiting on the token refresh endpoint.',
    ],
  },
  {
    id: 'crit-002',
    timestamp: '2026-02-09T11:20:00Z',
    sessionName: 'Fix database connection pooling',
    taskSummary: 'Increased pool size and added health checks with retry logic.',
    scores: { correctness: 8, completeness: 9, efficiency: 8, safety: 7 },
    overallScore: 8.0,
    verdict: 'good',
    suggestions: [
      'Add connection pool metrics to observability dashboard.',
    ],
  },
  {
    id: 'crit-003',
    timestamp: '2026-02-08T16:50:00Z',
    sessionName: 'Add unit tests for payment service',
    taskSummary: 'Created mock Stripe client and increased webhook test coverage to 92%.',
    scores: { correctness: 7, completeness: 6, efficiency: 8, safety: 8 },
    overallScore: 7.3,
    verdict: 'acceptable',
    suggestions: [
      'Add integration tests for the full payment flow, not just unit tests.',
      'Test failure scenarios like network timeouts and partial charges.',
      'Add test for concurrent webhook delivery handling.',
    ],
  },
  {
    id: 'crit-004',
    timestamp: '2026-02-07T09:25:00Z',
    sessionName: 'Deploy staging environment',
    taskSummary: 'Configured K8s manifests with resource limits, HPA, and health probes.',
    scores: { correctness: 6, completeness: 5, efficiency: 7, safety: 5 },
    overallScore: 5.8,
    verdict: 'needs_improvement',
    suggestions: [
      'Missing network policies to restrict pod-to-pod communication.',
      'No PodDisruptionBudget defined for graceful rolling updates.',
      'Resource limits should be validated with load testing data.',
      'Add pod security context with non-root user.',
    ],
  },
  {
    id: 'crit-005',
    timestamp: '2026-02-06T13:55:00Z',
    sessionName: 'Optimize image processing pipeline',
    taskSummary: 'Migrated from ImageMagick to Sharp with WebP support and lazy loading.',
    scores: { correctness: 9, completeness: 8, efficiency: 9, safety: 8 },
    overallScore: 8.5,
    verdict: 'good',
    suggestions: [
      'Add fallback for browsers that do not support WebP format.',
    ],
  },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const verdictConfig = {
  good: {
    label: 'Good',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: ThumbsUp,
  },
  acceptable: {
    label: 'Acceptable',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    icon: Minus,
  },
  needs_improvement: {
    label: 'Needs Work',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: ThumbsDown,
  },
};

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-600 dark:text-green-400';
  if (score >= 6) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = (value / 10) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-background-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${
            value >= 8 ? 'bg-green-500' : value >= 6 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium w-6 text-right ${scoreColor(value)}`}>{value}</span>
    </div>
  );
}

/** Map API insight to a CriticEvaluation for display. */
function mapInsightToEvaluation(insight: LearningInsight, idx: number): CriticEvaluation {
  const score = Math.round(insight.confidence * 10 * 10) / 10; // 0-1 -> 0-10 scale
  return {
    id: insight.id || `insight-${idx}`,
    timestamp: insight.created_at,
    sessionName: insight.category || 'Insight',
    taskSummary: insight.pattern,
    scores: {
      correctness: score,
      completeness: score,
      efficiency: score,
      safety: score,
    },
    overallScore: score,
    verdict: score >= 8 ? 'good' : score >= 6 ? 'acceptable' : 'needs_improvement',
    suggestions: [],
  };
}

const CriticManagerPanel = () => {
  const { value: criticEnabled, setValue: setCriticEnabled } =
    useSettingsBridge<boolean>('super_goose_critic_enabled', true);
  const [enabled, setEnabled] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [evaluations, setEvaluations] = useState<CriticEvaluation[]>(MOCK_EVALUATIONS);

  // Sync local state with settings bridge value
  useEffect(() => {
    setEnabled(criticEnabled);
  }, [criticEnabled]);

  const fetchInsights = useCallback(async () => {
    try {
      const insights = await backendApi.getLearningInsights();
      if (insights && insights.length > 0) {
        setEvaluations(insights.map(mapInsightToEvaluation));
      }
      // If empty or null, keep mock data
    } catch {
      // Fallback to mock data
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleEnabledChange = useCallback(async (checked: boolean) => {
    setEnabled(checked);
    await setCriticEnabled(checked);
  }, [setCriticEnabled]);

  const avgScore =
    evaluations.reduce((sum, e) => sum + e.overallScore, 0) / (evaluations.length || 1);

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
              <h1 className="text-4xl font-light">Critic</h1>
            </div>
            <p className="text-sm text-text-muted mt-2">
              Automated quality assessment of agent outputs with scoring and suggestions.
            </p>

            {/* Controls */}
            <div className="flex items-center justify-between mt-4 p-3 border border-border-default rounded-lg bg-background-default">
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-text-default">Critic Engine</p>
                  <p className="text-xs text-text-muted">
                    Evaluate quality of agent responses
                  </p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={handleEnabledChange}
                variant="mono"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs text-text-muted">
                  {evaluations.length} evaluations
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${avgScore >= 7 ? 'bg-green-500' : 'bg-amber-500'}`} />
                <span className="text-xs text-text-muted">
                  {avgScore.toFixed(1)} avg score
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Evaluations */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-3 pb-8">
            {evaluations.map((evaluation) => {
              const isExpanded = expandedEntries[evaluation.id];
              const vc = verdictConfig[evaluation.verdict];
              const VerdictIcon = vc.icon;

              return (
                <div
                  key={evaluation.id}
                  className="border border-border-default rounded-lg bg-background-default overflow-hidden"
                >
                  <button
                    onClick={() => toggleEntry(evaluation.id)}
                    className="w-full px-4 py-3 hover:bg-background-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0 text-left">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-text-default line-clamp-1">
                            {evaluation.taskSummary}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatTimestamp(evaluation.timestamp)}
                            </span>
                            <span className="text-xs text-text-muted">
                              {evaluation.sessionName}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-sm font-semibold ${scoreColor(evaluation.overallScore)}`}>
                          {evaluation.overallScore.toFixed(1)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${vc.color}`}
                        >
                          <VerdictIcon className="w-3 h-3" />
                          {vc.label}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-default px-4 py-3 space-y-4">
                      {/* Score breakdown */}
                      <div>
                        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                          Score Breakdown
                        </h4>
                        <div className="space-y-1.5">
                          <ScoreBar value={evaluation.scores.correctness} label="Correctness" />
                          <ScoreBar value={evaluation.scores.completeness} label="Completeness" />
                          <ScoreBar value={evaluation.scores.efficiency} label="Efficiency" />
                          <ScoreBar value={evaluation.scores.safety} label="Safety" />
                        </div>
                      </div>

                      {/* Suggestions */}
                      {evaluation.suggestions.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                            Suggestions
                          </h4>
                          <ul className="space-y-1.5">
                            {evaluation.suggestions.map((suggestion, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-xs text-amber-500 mt-0.5 flex-shrink-0">
                                  {'\u2022'}
                                </span>
                                <span className="text-xs text-text-muted">{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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

export default CriticManagerPanel;
