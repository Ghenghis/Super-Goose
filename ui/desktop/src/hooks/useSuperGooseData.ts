import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:3284';

export interface LearningStats {
  total_experiences: number;
  success_rate: number;
  total_skills: number;
  verified_skills: number;
  total_insights: number;
  experiences_by_core: Record<string, number>;
}

export interface CostSummary {
  total_cost: number;
  session_cost: number;
  model_breakdown: { model: string; cost: number; calls: number }[];
  budget_limit: number | null;
  budget_used_percent: number;
}

export interface AutonomousStatus {
  running: boolean;
  task_count: number;
  uptime_seconds: number;
  circuit_breaker: { state: string; failure_count: number; max_failures: number };
}

export interface OtaStatus {
  state: string;
  last_update: string | null;
  version: string | null;
}

export function useSuperGooseData() {
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [autonomousStatus, setAutonomousStatus] = useState<AutonomousStatus | null>(null);
  const [otaStatus, setOtaStatus] = useState<OtaStatus | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { learningStats, costSummary, autonomousStatus, otaStatus, loading, refresh: fetchAll };
}
