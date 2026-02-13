/**
 * Backend API Client
 *
 * Typed stubs for the Rust goosed backend API.  Each function includes
 * error handling so callers get `null` (for GET) or `false` (for mutations)
 * instead of unhandled promise rejections when the backend is unreachable
 * or returns an error status.
 *
 * Base URL defaults to the local goosed server on port 3284.
 */

const API_BASE = 'http://localhost:3284';

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json' };

// ---------------------------------------------------------------------------
// Response types (extend as endpoints are implemented)
// ---------------------------------------------------------------------------

export interface FeatureStatusEntry {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface GuardrailsConfig {
  enabled: boolean;
  mode: 'warn' | 'block';
  rules: unknown[];
}

export interface GatewayConfig {
  enabled: boolean;
  endpoint?: string;
  policies: unknown[];
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

export interface CostBudget {
  limit: number | null;
  warning_threshold: number;
}

export interface LearningStats {
  total_experiences: number;
  success_rate: number;
  total_skills: number;
  verified_skills: number;
  total_insights: number;
  experiences_by_core: Record<string, number>;
}

export interface LearningExperience {
  id: string;
  task: string;
  core_type: string;
  outcome: string;
  insights: string[];
  timestamp: string;
}

export interface LearningInsight {
  id: string;
  category: string;
  pattern: string;
  confidence: number;
  occurrences: number;
  created_at: string;
}

export interface LearningSkill {
  id: string;
  name: string;
  description: string;
  verified: boolean;
  usage_count: number;
  created_at: string;
}

export interface Bookmark {
  id: string;
  sessionId: string;
  label: string;
  createdAt: string;
}

export interface ExtensionInfo {
  key: string;
  name: string;
  enabled: boolean;
  type: 'builtin' | 'stdio' | 'streamable_http' | 'platform' | 'frontend' | 'inline_python' | 'sse';
  description: string;
}

export interface SessionSearchResult {
  sessionId: string;
  title: string;
  snippet: string;
  timestamp: string;
}

export interface GatewayStatus {
  healthy: boolean;
  uptime: string;
  version: string;
  auditLogging: boolean;
  permissions: {
    total: number;
    granted: number;
    denied: number;
  };
}

export interface HookEvent {
  id: string;
  name: string;
  category: 'session' | 'tools' | 'flow';
  enabled: boolean;
  recentCount: number;
}

export interface HooksConfig {
  events: HookEvent[];
}

export interface MemorySubsystem {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'degraded';
  itemCount: number;
  decayRate: string;
}

export interface MemorySummary {
  subsystems: MemorySubsystem[];
}

export interface PolicyRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  enabled: boolean;
}

export interface PolicyRules {
  rules: PolicyRule[];
  dryRunMode: boolean;
}

export type ScanDirection = 'input' | 'output';
export type ScanResultType = 'pass' | 'warn' | 'block';

export interface GuardrailsScanEntry {
  id: string;
  timestamp: string;
  direction: ScanDirection;
  detector: string;
  result: ScanResultType;
  message: string;
  sessionName: string;
}

export interface GuardrailsScansResponse {
  scans: GuardrailsScanEntry[];
}

export interface EnterpriseGuardrailsConfig {
  enabled: boolean;
  mode: string;
  rules: unknown[];
}

export interface TokenUsageInfo {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: string;
  period: string;
}

export interface ObservabilityConfig {
  costTrackingEnabled: boolean;
  usage: TokenUsageInfo;
}

export interface MemoryConsolidateResponse {
  success: boolean;
  message: string;
}

/** Matches backend `ota_api.rs` VersionInfo. */
export interface VersionInfo {
  version: string;
  build_timestamp: string;
  git_hash: string;
  binary_path: string | null;
}

/** Matches backend `ota_api.rs` OtaTriggerResponse. */
export interface OtaTriggerResponse {
  triggered: boolean;
  cycle_id: string | null;
  message: string;
  restart_required: boolean;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const backendApi = {
  // -----------------------------------------------------------------------
  // Feature management
  // -----------------------------------------------------------------------

  /** Retrieve the status of all backend features. */
  getFeatureStatus: async (): Promise<FeatureStatusEntry[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/features`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as FeatureStatusEntry[];
    } catch (err) {
      console.warn('[backendApi] getFeatureStatus failed:', err);
      return null;
    }
  },

  /** Enable or disable a single backend feature. */
  toggleFeature: async (feature: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/features/${encodeURIComponent(feature)}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] toggleFeature failed:', err);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // Enterprise endpoints
  // -----------------------------------------------------------------------

  /** Fetch the current guardrails configuration. */
  getGuardrails: async (): Promise<GuardrailsConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/guardrails/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as GuardrailsConfig;
    } catch (err) {
      console.warn('[backendApi] getGuardrails failed:', err);
      return null;
    }
  },

  /** Fetch the gateway / proxy configuration. */
  getGatewayConfig: async (): Promise<GatewayConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/gateway`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as GatewayConfig;
    } catch (err) {
      console.warn('[backendApi] getGatewayConfig failed:', err);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Cost / Budget
  // -----------------------------------------------------------------------

  /** Get an aggregate cost summary for the current session & lifetime. */
  getCostSummary: async (): Promise<CostSummary | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/cost/summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as CostSummary;
    } catch (err) {
      console.warn('[backendApi] getCostSummary failed:', err);
      return null;
    }
  },

  /** Set (or clear) the budget limit in dollars. */
  setBudgetLimit: async (limit: number): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/cost/budget`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ limit }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] setBudgetLimit failed:', err);
      return false;
    }
  },

  /** Get detailed per-model cost breakdown. */
  getCostBreakdown: async (): Promise<CostModelBreakdown[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/cost/breakdown`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as CostModelBreakdown[];
    } catch (err) {
      console.warn('[backendApi] getCostBreakdown failed:', err);
      return null;
    }
  },

  /** Get current budget configuration. */
  getCostBudget: async (): Promise<CostBudget | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/cost/budget`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as CostBudget;
    } catch (err) {
      console.warn('[backendApi] getCostBudget failed:', err);
      return null;
    }
  },

  /** Update guardrails configuration. */
  updateGuardrailsConfig: async (config: Partial<GuardrailsConfig>): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/guardrails/config`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(config),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] updateGuardrailsConfig failed:', err);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // Learning
  // -----------------------------------------------------------------------

  /** Get aggregate learning statistics. */
  getLearningStats: async (): Promise<LearningStats | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/learning/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LearningStats;
    } catch (err) {
      console.warn('[backendApi] getLearningStats failed:', err);
      return null;
    }
  },

  /** Get paginated learning experiences. */
  getLearningExperiences: async (
    limit?: number,
    offset?: number
  ): Promise<LearningExperience[] | null> => {
    try {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      if (offset !== undefined) params.set('offset', String(offset));
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/api/learning/experiences${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LearningExperience[];
    } catch (err) {
      console.warn('[backendApi] getLearningExperiences failed:', err);
      return null;
    }
  },

  /** Get all learning insights. */
  getLearningInsights: async (): Promise<LearningInsight[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/learning/insights`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LearningInsight[];
    } catch (err) {
      console.warn('[backendApi] getLearningInsights failed:', err);
      return null;
    }
  },

  /** Get learning skills, optionally only verified. */
  getLearningSkills: async (verifiedOnly?: boolean): Promise<LearningSkill[] | null> => {
    try {
      const params = new URLSearchParams();
      if (verifiedOnly) params.set('verified_only', 'true');
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/api/learning/skills${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LearningSkill[];
    } catch (err) {
      console.warn('[backendApi] getLearningSkills failed:', err);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Autonomous / OTA status
  // -----------------------------------------------------------------------

  /** Get autonomous daemon status. */
  getAutonomousStatus: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/autonomous/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      console.warn('[backendApi] getAutonomousStatus failed:', err);
      return null;
    }
  },

  /** Get OTA self-build status. */
  getOtaStatus: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/ota/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      console.warn('[backendApi] getOtaStatus failed:', err);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  /** Full-text search across past sessions. */
  searchSessions: async (query: string): Promise<SessionSearchResult[] | null> => {
    try {
      const res = await fetch(
        `${API_BASE}/api/sessions/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SessionSearchResult[];
    } catch (err) {
      console.warn('[backendApi] searchSessions failed:', err);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Bookmarks
  // -----------------------------------------------------------------------

  /** List all saved bookmarks. */
  getBookmarks: async (): Promise<Bookmark[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/bookmarks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Bookmark[];
    } catch (err) {
      console.warn('[backendApi] getBookmarks failed:', err);
      return null;
    }
  },

  /** Create a new bookmark for a session. */
  createBookmark: async (sessionId: string, label: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/bookmarks`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ sessionId, label }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] createBookmark failed:', err);
      return false;
    }
  },

  /** Delete a bookmark by id. */
  deleteBookmark: async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/bookmarks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] deleteBookmark failed:', err);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // Extensions
  // -----------------------------------------------------------------------

  /** List all registered extensions (builtin + bundled + custom). */
  getExtensions: async (): Promise<ExtensionInfo[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/extensions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { extensions: ExtensionInfo[] };
      return data.extensions;
    } catch (err) {
      console.warn('[backendApi] getExtensions failed:', err);
      return null;
    }
  },

  /** Enable or disable an extension by key. */
  toggleExtension: async (key: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/extensions/${encodeURIComponent(key)}/toggle`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] toggleExtension failed:', err);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // Enterprise panels
  // -----------------------------------------------------------------------

  /** Fetch gateway status. */
  fetchGatewayStatus: async (): Promise<GatewayStatus | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/gateway/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as GatewayStatus;
    } catch (err) {
      console.warn('[backendApi] fetchGatewayStatus failed:', err);
      return null;
    }
  },

  /** Update gateway audit logging setting. */
  updateGatewayAuditLogging: async (enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/gateway/audit`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] updateGatewayAuditLogging failed:', err);
      return false;
    }
  },

  /** Fetch hooks configuration. */
  fetchHooksConfig: async (): Promise<HooksConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/hooks/events`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as HooksConfig;
    } catch (err) {
      console.warn('[backendApi] fetchHooksConfig failed:', err);
      return null;
    }
  },

  /** Toggle a hook event. */
  toggleHook: async (id: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/hooks/events/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] toggleHook failed:', err);
      return false;
    }
  },

  /** Fetch memory summary. */
  fetchMemorySummary: async (): Promise<MemorySummary | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/memory/summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as MemorySummary;
    } catch (err) {
      console.warn('[backendApi] fetchMemorySummary failed:', err);
      return null;
    }
  },

  /** Fetch policy rules. */
  fetchPolicyRules: async (): Promise<PolicyRules | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/policies/rules`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as PolicyRules;
    } catch (err) {
      console.warn('[backendApi] fetchPolicyRules failed:', err);
      return null;
    }
  },

  /** Toggle a policy rule. */
  togglePolicyRule: async (id: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/policies/rules/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] togglePolicyRule failed:', err);
      return false;
    }
  },

  /** Update policy dry-run mode. */
  updatePolicyDryRunMode: async (enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/policies/dry-run`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch (err) {
      console.warn('[backendApi] updatePolicyDryRunMode failed:', err);
      return false;
    }
  },

  /** Fetch enterprise guardrails configuration. */
  getEnterpriseGuardrails: async (): Promise<EnterpriseGuardrailsConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/guardrails`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as EnterpriseGuardrailsConfig;
    } catch (err) {
      console.warn('[backendApi] getEnterpriseGuardrails failed:', err);
      return null;
    }
  },

  /** Update enterprise guardrails configuration (partial merge). */
  updateEnterpriseGuardrails: async (
    config: Partial<EnterpriseGuardrailsConfig>
  ): Promise<EnterpriseGuardrailsConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/guardrails`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as EnterpriseGuardrailsConfig;
    } catch (err) {
      console.warn('[backendApi] updateEnterpriseGuardrails failed:', err);
      return null;
    }
  },

  /** Fetch guardrails scan history. */
  getGuardrailsScans: async (): Promise<GuardrailsScanEntry[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/guardrails/scans`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GuardrailsScansResponse;
      return data.scans;
    } catch (err) {
      console.warn('[backendApi] getGuardrailsScans failed:', err);
      return null;
    }
  },

  /** Trigger memory consolidation across all subsystems. */
  consolidateMemory: async (): Promise<MemoryConsolidateResponse | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/memory/consolidate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as MemoryConsolidateResponse;
    } catch (err) {
      console.warn('[backendApi] consolidateMemory failed:', err);
      return null;
    }
  },

  /** Fetch observability / telemetry configuration and usage data. */
  getObservabilityConfig: async (): Promise<ObservabilityConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/observability`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ObservabilityConfig;
    } catch (err) {
      console.warn('[backendApi] getObservabilityConfig failed:', err);
      return null;
    }
  },

  /** Update observability settings (e.g., toggle cost tracking). */
  updateObservabilityConfig: async (
    config: { costTrackingEnabled?: boolean }
  ): Promise<ObservabilityConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/observability`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ObservabilityConfig;
    } catch (err) {
      console.warn('[backendApi] updateObservabilityConfig failed:', err);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Version / OTA
  // -----------------------------------------------------------------------

  /** Get build version fingerprint (for OTA binary detection). */
  getVersion: async (): Promise<VersionInfo | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/version`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as VersionInfo;
    } catch (err) {
      console.warn('[backendApi] getVersion failed:', err);
      return null;
    }
  },

  /** Trigger an OTA self-improvement cycle. */
  triggerOta: async (sessionId: string, dryRun: boolean): Promise<OtaTriggerResponse | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/ota/trigger`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ session_id: sessionId, dry_run: dryRun }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OtaTriggerResponse;
    } catch (err) {
      console.warn('[backendApi] triggerOta failed:', err);
      return null;
    }
  },

  /** Request backend process restart (after OTA binary swap). */
  restartBackend: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/ota/restart`, {
        method: 'POST',
        headers: JSON_HEADERS,
      });
      return res.ok;
    } catch (err) {
      // Expected — process exits before response completes
      return true;
    }
  },

  // -----------------------------------------------------------------------
  // Agent Core Management
  // -----------------------------------------------------------------------

  /** Switch the active agent core. */
  switchCore: async (coreType: string, sessionId = 'default'): Promise<{ success: boolean; active_core: string; message: string } | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/switch-core`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ core_type: coreType, session_id: sessionId }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[backendApi] switchCore failed:', err);
      return null;
    }
  },

  /** Get the list of available cores with active status. */
  listCores: async (): Promise<Array<{ id: string; name: string; description: string; active: boolean }>> => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/cores`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('[backendApi] listCores failed:', err);
      return [];
    }
  },

  // -----------------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------------

  /** Get a single setting value from the backend. */
  getSetting: async <T = unknown>(key: string): Promise<T | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.value as T;
    } catch (err) {
      console.warn(`[backendApi] getSetting("${key}") failed:`, err);
      return null;
    }
  },

  /** Set a single setting value on the backend. */
  setSetting: async (key: string, value: unknown): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ value }),
      });
      return res.ok;
    } catch (err) {
      console.warn(`[backendApi] setSetting("${key}") failed:`, err);
      return false;
    }
  },
};
