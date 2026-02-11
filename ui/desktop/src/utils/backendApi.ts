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

export interface CostSummary {
  totalCost: number;
  sessionCost: number;
  budgetLimit: number | null;
  breakdown: Record<string, number>;
}

export interface Bookmark {
  id: string;
  sessionId: string;
  label: string;
  createdAt: string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  enabled: boolean;
  type: 'builtin' | 'bundled' | 'custom';
}

export interface SessionSearchResult {
  sessionId: string;
  title: string;
  snippet: string;
  timestamp: string;
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
  // Enterprise endpoints (stubs -- backend not yet implemented)
  // -----------------------------------------------------------------------

  /** Fetch the current guardrails configuration. */
  getGuardrails: async (): Promise<GuardrailsConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/guardrails`);
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
      const res = await fetch(`${API_BASE}/api/cost`);
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
      return (await res.json()) as ExtensionInfo[];
    } catch (err) {
      console.warn('[backendApi] getExtensions failed:', err);
      return null;
    }
  },

  /** Enable or disable an extension by id. */
  toggleExtension: async (id: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/extensions/${encodeURIComponent(id)}`, {
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
};
