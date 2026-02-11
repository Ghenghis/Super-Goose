import React, { useState } from 'react';
import {
  ListChecks,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  Clock,
} from 'lucide-react';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';

type StepStatus = 'completed' | 'in_progress' | 'pending' | 'failed' | 'skipped';

interface PlanStep {
  id: string;
  description: string;
  status: StepStatus;
  duration?: string;
}

interface Plan {
  id: string;
  title: string;
  sessionName: string;
  timestamp: string;
  steps: PlanStep[];
  status: 'active' | 'completed' | 'failed';
}

const MOCK_PLANS: Plan[] = [
  {
    id: 'plan-001',
    title: 'Implement user authentication flow',
    sessionName: 'Refactor authentication module',
    timestamp: '2026-02-10T14:00:00Z',
    status: 'completed',
    steps: [
      { id: 's1', description: 'Analyze existing auth middleware code', status: 'completed', duration: '12s' },
      { id: 's2', description: 'Replace HS256 with RS256 JWT validation', status: 'completed', duration: '45s' },
      { id: 's3', description: 'Implement refresh token rotation', status: 'completed', duration: '38s' },
      { id: 's4', description: 'Update auth endpoint tests', status: 'completed', duration: '22s' },
      { id: 's5', description: 'Verify backward compatibility', status: 'completed', duration: '8s' },
    ],
  },
  {
    id: 'plan-002',
    title: 'Fix database pool exhaustion issue',
    sessionName: 'Fix database connection pooling',
    timestamp: '2026-02-09T10:30:00Z',
    status: 'active',
    steps: [
      { id: 's6', description: 'Profile current pool usage under load', status: 'completed', duration: '15s' },
      { id: 's7', description: 'Increase max pool size to 25', status: 'completed', duration: '5s' },
      { id: 's8', description: 'Add connection health check interval', status: 'in_progress' },
      { id: 's9', description: 'Implement exponential backoff retry', status: 'pending' },
      { id: 's10', description: 'Run load test to validate changes', status: 'pending' },
    ],
  },
  {
    id: 'plan-003',
    title: 'Increase payment webhook test coverage',
    sessionName: 'Add unit tests for payment service',
    timestamp: '2026-02-08T16:00:00Z',
    status: 'completed',
    steps: [
      { id: 's11', description: 'Create mock Stripe client', status: 'completed', duration: '30s' },
      { id: 's12', description: 'Write tests for payment_intent.succeeded', status: 'completed', duration: '25s' },
      { id: 's13', description: 'Write tests for payment_intent.failed', status: 'completed', duration: '20s' },
      { id: 's14', description: 'Add edge case tests for concurrent webhooks', status: 'completed', duration: '35s' },
    ],
  },
  {
    id: 'plan-004',
    title: 'Set up Kubernetes staging deployment',
    sessionName: 'Deploy staging environment',
    timestamp: '2026-02-07T09:00:00Z',
    status: 'failed',
    steps: [
      { id: 's15', description: 'Create deployment manifests', status: 'completed', duration: '20s' },
      { id: 's16', description: 'Configure resource limits and probes', status: 'completed', duration: '15s' },
      { id: 's17', description: 'Set up HPA with CPU/memory targets', status: 'completed', duration: '10s' },
      { id: 's18', description: 'Deploy to staging cluster', status: 'failed', duration: '5s' },
      { id: 's19', description: 'Run smoke tests', status: 'skipped' },
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

const statusConfig: Record<StepStatus, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  completed: { icon: CheckCircle2, color: 'text-green-500' },
  in_progress: { icon: Loader2, color: 'text-blue-500' },
  pending: { icon: Circle, color: 'text-text-muted' },
  failed: { icon: XCircle, color: 'text-red-500' },
  skipped: { icon: Circle, color: 'text-text-muted opacity-50' },
};

const planStatusColors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const PlanManagerPanel: React.FC = () => {
  const [structuredMode, setStructuredMode] = useState(true);
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({ 'plan-002': true });

  const completedPlans = MOCK_PLANS.filter((p) => p.status === 'completed').length;

  const togglePlan = (id: string) => {
    setExpandedPlans((prev) => ({
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
              <h1 className="text-4xl font-light">Plan Manager</h1>
            </div>
            <p className="text-sm text-text-muted mt-2">
              Structured execution plans with step-by-step progress tracking.
            </p>

            {/* Controls */}
            <div className="flex items-center justify-between mt-4 p-3 border border-border-default rounded-lg bg-background-default">
              <div className="flex items-center gap-3">
                <ListChecks className="w-5 h-5 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-text-default">Structured Execution Mode</p>
                  <p className="text-xs text-text-muted">
                    Break tasks into explicit plan steps before execution
                  </p>
                </div>
              </div>
              <Switch
                checked={structuredMode}
                onCheckedChange={setStructuredMode}
                variant="mono"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-xs text-text-muted">
                  {MOCK_PLANS.length} total plans
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-text-muted">
                  {completedPlans} completed
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Plans */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-3 pb-8">
            {MOCK_PLANS.map((plan) => {
              const isExpanded = expandedPlans[plan.id];
              const completedSteps = plan.steps.filter((s) => s.status === 'completed').length;
              const progress = Math.round((completedSteps / plan.steps.length) * 100);

              return (
                <div
                  key={plan.id}
                  className="border border-border-default rounded-lg bg-background-default overflow-hidden"
                >
                  <button
                    onClick={() => togglePlan(plan.id)}
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
                          <p className="text-sm font-medium text-text-default line-clamp-1">
                            {plan.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatTimestamp(plan.timestamp)}
                            </span>
                            <span className="text-xs text-text-muted">{plan.sessionName}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-background-muted rounded-full h-1.5 max-w-[200px]">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  plan.status === 'failed' ? 'bg-red-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-text-muted">
                              {completedSteps}/{plan.steps.length}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${planStatusColors[plan.status]}`}
                      >
                        {plan.status}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-default px-4 py-3">
                      <div className="space-y-1.5">
                        {plan.steps.map((step, idx) => {
                          const sc = statusConfig[step.status];
                          const StepIcon = sc.icon;
                          const isLast = idx === plan.steps.length - 1;

                          return (
                            <div key={step.id} className="flex items-start gap-2.5 relative">
                              {/* Connecting line */}
                              {!isLast && (
                                <div className="absolute left-[9px] top-5 w-px h-[calc(100%-4px)] bg-border-default" />
                              )}
                              <StepIcon
                                className={`w-[18px] h-[18px] flex-shrink-0 mt-0.5 ${sc.color} ${
                                  step.status === 'in_progress' ? 'animate-spin' : ''
                                }`}
                              />
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span
                                  className={`text-sm ${
                                    step.status === 'skipped'
                                      ? 'text-text-muted line-through'
                                      : step.status === 'pending'
                                        ? 'text-text-muted'
                                        : 'text-text-default'
                                  }`}
                                >
                                  {step.description}
                                </span>
                                {step.duration && (
                                  <span className="inline-flex items-center gap-1 text-xs text-text-muted flex-shrink-0">
                                    <Clock className="w-3 h-3" />
                                    {step.duration}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
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

export default PlanManagerPanel;
