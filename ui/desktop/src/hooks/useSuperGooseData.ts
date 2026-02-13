import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:3284';

/** Default polling interval in milliseconds (5 seconds). */
const DEFAULT_POLL_INTERVAL = 5000;

export interface LearningStats {
  total_experiences: number;
  success_rate: number;
  total_skills: number;
  verified_skills: number;
  total_insights: number;
  experiences_by_core: Record<string, number>;
}

/** Matches backend `cost.rs` CostSummary. */
export interface CostSummary {
  total_spend: number;
  session_spend: number;
  budget_limit: number | null;
  budget_remaining: number | null;
  budget_warning_threshold: number;
  is_over_budget: boolean;
  model_breakdown: CostModelBreakdown[];
}

export interface CostModelBreakdown {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

/** Matches backend `ota_api.rs` AutonomousStatus. */
export interface AutonomousStatus {
  running: boolean;
  uptime_seconds: number;
  tasks_completed: number;
  tasks_failed: number;
  circuit_breaker: {
    state: string;
    consecutive_failures: number;
    max_failures: number;
    last_failure: string | null;
  };
  current_task: string | null;
}

/** Matches backend `ota_api.rs` OtaStatus. */
export interface OtaStatus {
  state: string;
  last_build_time: string | null;
  last_build_result: string | null;
  current_version: string;
  pending_improvements: number;
}

export function useSuperGooseData(pollInterval: number = DEFAULT_POLL_INTERVAL) {
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [autonomousStatus, setAutonomousStatus] = useState<AutonomousStatus | null>(null);
  const [otaStatus, setOtaStatus] = useState<OtaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, costRes, autoRes, otaRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/learning/stats`),
        fetch(`${API_BASE}/api/cost/summary`),
        fetch(`${API_BASE}/api/autonomous/status`),
        fetch(`${API_BASE}/api/ota/status`),
      ]);
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        setLearningStats(await statsRes.value.json());
      }
      if (costRes.status === 'fulfilled' && costRes.value.ok) {
        setCostSummary(await costRes.value.json());
      }
      if (autoRes.status === 'fulfilled' && autoRes.value.ok) {
        setAutonomousStatus(await autoRes.value.json());
      }
      if (otaRes.status === 'fulfilled' && otaRes.value.ok) {
        setOtaStatus(await otaRes.value.json());
      }
    } catch {
      /* silent — backend may be unreachable */
    }
    setLoading(false);
  }, []);

  // Fetch once on mount, then poll at interval
  useEffect(() => {
    fetchAll();
    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchAll, pollInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll, pollInterval]);

  return { learningStats, costSummary, autonomousStatus, otaStatus, loading, refresh: fetchAll };
}
