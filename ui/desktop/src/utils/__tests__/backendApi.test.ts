import { backendApi } from '../backendApi';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('backendApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeatureStatus', () => {
    it('returns feature list on success', async () => {
      const features = [{ name: 'memory', enabled: true }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(features),
      });
      const result = await backendApi.getFeatureStatus();
      expect(result).toEqual(features);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/features');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await backendApi.getFeatureStatus();
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await backendApi.getFeatureStatus();
      expect(result).toBeNull();
    });
  });

  describe('toggleFeature', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.toggleFeature('memory', true);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/features/memory',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: true }),
        })
      );
    });

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const result = await backendApi.toggleFeature('memory', false);
      expect(result).toBe(false);
    });
  });

  describe('getCostSummary', () => {
    it('returns cost summary on success', async () => {
      const summary = { total_cost: 1.5, session_cost: 0.5, budget_limit: 10, budget_used_percent: 15, model_breakdown: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(summary),
      });
      const result = await backendApi.getCostSummary();
      expect(result).toEqual(summary);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/cost/summary');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getCostSummary();
      expect(result).toBeNull();
    });
  });

  describe('getCostBreakdown', () => {
    it('returns breakdown on success', async () => {
      const breakdown = [{ model: 'test', provider: 'test', input_tokens: 100, output_tokens: 50, cost: 0.5, calls: 3 }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(breakdown),
      });
      const result = await backendApi.getCostBreakdown();
      expect(result).toEqual(breakdown);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/cost/breakdown');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getCostBreakdown();
      expect(result).toBeNull();
    });
  });

  describe('getLearningStats', () => {
    it('returns stats on success', async () => {
      const stats = { total_experiences: 10, success_rate: 0.8, total_skills: 5, verified_skills: 3, total_insights: 7, experiences_by_core: {} };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(stats),
      });
      const result = await backendApi.getLearningStats();
      expect(result).toEqual(stats);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/learning/stats');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getLearningStats();
      expect(result).toBeNull();
    });
  });

  describe('getLearningExperiences', () => {
    it('sends limit and offset as query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await backendApi.getLearningExperiences(10, 5);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/learning/experiences?limit=10&offset=5');
    });

    it('omits query params when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await backendApi.getLearningExperiences();
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/learning/experiences');
    });
  });

  describe('getLearningInsights', () => {
    it('returns insights on success', async () => {
      const insights = [{ id: '1', category: 'test', pattern: 'p', confidence: 0.9, occurrences: 3, created_at: '2026-01-01' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(insights),
      });
      const result = await backendApi.getLearningInsights();
      expect(result).toEqual(insights);
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getLearningInsights();
      expect(result).toBeNull();
    });
  });

  describe('updateGuardrailsConfig', () => {
    it('sends PUT with config', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.updateGuardrailsConfig({ enabled: true, mode: 'block' });
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/guardrails/config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: true, mode: 'block' }),
        })
      );
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.updateGuardrailsConfig({ enabled: false });
      expect(result).toBe(false);
    });
  });

  describe('setBudgetLimit', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.setBudgetLimit(50);
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.setBudgetLimit(50);
      expect(result).toBe(false);
    });
  });

  describe('searchSessions', () => {
    it('URL-encodes the query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await backendApi.searchSessions('hello world');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/sessions/search?q=hello%20world'
      );
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.searchSessions('test');
      expect(result).toBeNull();
    });
  });

  describe('getBookmarks', () => {
    it('returns bookmarks on success', async () => {
      const bookmarks = [{ id: '1', sessionId: 's1', label: 'test', createdAt: '2026-01-01' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(bookmarks),
      });
      const result = await backendApi.getBookmarks();
      expect(result).toEqual(bookmarks);
    });
  });

  describe('createBookmark', () => {
    it('sends POST with sessionId and label', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.createBookmark('sess-1', 'My Bookmark');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/bookmarks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: 'sess-1', label: 'My Bookmark' }),
        })
      );
    });
  });

  describe('deleteBookmark', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.deleteBookmark('bk-1');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/bookmarks/bk-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('fetchGatewayStatus', () => {
    it('returns gateway status on success', async () => {
      const status = {
        healthy: true,
        uptime: '2h 30m',
        version: '1.24.05',
        auditLogging: true,
        permissions: { total: 100, granted: 95, denied: 5 },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(status),
      });
      const result = await backendApi.fetchGatewayStatus();
      expect(result).toEqual(status);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/gateway/status');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.fetchGatewayStatus();
      expect(result).toBeNull();
    });
  });

  describe('updateGatewayAuditLogging', () => {
    it('sends PUT request with enabled flag', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.updateGatewayAuditLogging(true);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/gateway/audit',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: true }),
        })
      );
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.updateGatewayAuditLogging(false);
      expect(result).toBe(false);
    });
  });

  describe('fetchHooksConfig', () => {
    it('returns hooks config on success', async () => {
      const config = {
        events: [
          { id: 'session_start', name: 'Session Start', category: 'session' as const, enabled: true, recentCount: 5 },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });
      const result = await backendApi.fetchHooksConfig();
      expect(result).toEqual(config);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/hooks/events');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.fetchHooksConfig();
      expect(result).toBeNull();
    });
  });

  describe('toggleHook', () => {
    it('sends POST request with enabled flag', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.toggleHook('session_start', true);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/hooks/events/session_start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ enabled: true }),
        })
      );
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.toggleHook('tool_error', false);
      expect(result).toBe(false);
    });
  });

  describe('fetchMemorySummary', () => {
    it('returns memory summary on success', async () => {
      const summary = {
        subsystems: [
          { id: 'working', name: 'Working', status: 'active' as const, itemCount: 42, decayRate: '0.5/hr' },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(summary),
      });
      const result = await backendApi.fetchMemorySummary();
      expect(result).toEqual(summary);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/memory/summary');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.fetchMemorySummary();
      expect(result).toBeNull();
    });
  });

  describe('fetchPolicyRules', () => {
    it('returns policy rules on success', async () => {
      const rules = {
        rules: [
          { id: 'r1', name: 'Block PII', condition: 'contains SSN', action: 'deny', enabled: true },
        ],
        dryRunMode: false,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rules),
      });
      const result = await backendApi.fetchPolicyRules();
      expect(result).toEqual(rules);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/policies/rules');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.fetchPolicyRules();
      expect(result).toBeNull();
    });
  });

  describe('togglePolicyRule', () => {
    it('sends POST request with enabled flag', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.togglePolicyRule('r1', false);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/policies/rules/r1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ enabled: false }),
        })
      );
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.togglePolicyRule('r2', true);
      expect(result).toBe(false);
    });
  });

  describe('updatePolicyDryRunMode', () => {
    it('sends PUT request with enabled flag', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.updatePolicyDryRunMode(true);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/policies/dry-run',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: true }),
        })
      );
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.updatePolicyDryRunMode(false);
      expect(result).toBe(false);
    });
  });

  describe('getEnterpriseGuardrails', () => {
    it('returns enterprise guardrails config on success', async () => {
      const config = { enabled: true, mode: 'block', rules: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });
      const result = await backendApi.getEnterpriseGuardrails();
      expect(result).toEqual(config);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/guardrails');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getEnterpriseGuardrails();
      expect(result).toBeNull();
    });
  });

  describe('updateEnterpriseGuardrails', () => {
    it('sends PUT with partial config and returns updated config', async () => {
      const updated = { enabled: true, mode: 'warn', rules: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updated),
      });
      const result = await backendApi.updateEnterpriseGuardrails({ mode: 'warn' });
      expect(result).toEqual(updated);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/guardrails',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ mode: 'warn' }),
        })
      );
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.updateEnterpriseGuardrails({ enabled: false });
      expect(result).toBeNull();
    });
  });

  describe('consolidateMemory', () => {
    it('returns consolidation response on success', async () => {
      const response = { success: true, message: 'Memory consolidation completed successfully' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      const result = await backendApi.consolidateMemory();
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/memory/consolidate',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.consolidateMemory();
      expect(result).toBeNull();
    });
  });

  describe('getObservabilityConfig', () => {
    it('returns observability config on success', async () => {
      const config = {
        costTrackingEnabled: true,
        usage: {
          totalTokens: 50000,
          promptTokens: 30000,
          completionTokens: 20000,
          estimatedCost: '$1.25',
          period: 'today',
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });
      const result = await backendApi.getObservabilityConfig();
      expect(result).toEqual(config);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/observability');
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.getObservabilityConfig();
      expect(result).toBeNull();
    });
  });

  describe('updateObservabilityConfig', () => {
    it('sends PUT with config and returns updated config', async () => {
      const updated = {
        costTrackingEnabled: true,
        usage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          estimatedCost: '$0.00',
          period: 'current session',
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updated),
      });
      const result = await backendApi.updateObservabilityConfig({ costTrackingEnabled: true });
      expect(result).toEqual(updated);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/enterprise/observability',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ costTrackingEnabled: true }),
        })
      );
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await backendApi.updateObservabilityConfig({ costTrackingEnabled: false });
      expect(result).toBeNull();
    });
  });

  describe('getGuardrailsScans', () => {
    it('returns scan entries on success', async () => {
      const scans = [
        {
          id: 'scan-001',
          timestamp: '2026-02-10T14:35:12Z',
          direction: 'input' as const,
          detector: 'Prompt Injection',
          result: 'pass' as const,
          message: 'No injection detected.',
          sessionName: 'Test session',
        },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ scans }),
      });
      const result = await backendApi.getGuardrailsScans();
      expect(result).toEqual(scans);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/enterprise/guardrails/scans');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await backendApi.getGuardrailsScans();
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await backendApi.getGuardrailsScans();
      expect(result).toBeNull();
    });
  });

  describe('getSetting', () => {
    it('returns setting value on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 'test-value' }),
      });
      const result = await backendApi.getSetting<string>('testKey');
      expect(result).toBe('test-value');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/settings/testKey');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const result = await backendApi.getSetting('testKey');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await backendApi.getSetting('testKey');
      expect(result).toBeNull();
    });

    it('URL-encodes the key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 42 }),
      });
      await backendApi.getSetting('my setting key');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3284/api/settings/my%20setting%20key');
    });
  });

  describe('setSetting', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await backendApi.setSetting('testKey', { foo: 'bar' });
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/settings/testKey',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ value: { foo: 'bar' } }),
        })
      );
    });

    it('returns false on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await backendApi.setSetting('testKey', 'value');
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await backendApi.setSetting('testKey', 'value');
      expect(result).toBe(false);
    });

    it('URL-encodes the key', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await backendApi.setSetting('my/setting/key', 123);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3284/api/settings/my%2Fsetting%2Fkey',
        expect.anything()
      );
    });
  });
});
