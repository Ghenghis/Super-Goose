import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mock useAgUi ──────────────────────────────────────────────────────────────
let mockAgUi: Record<string, unknown>;

vi.mock('../../../ag-ui/useAgUi', () => ({
  useAgUi: () => mockAgUi,
}));

// ── Mock backendApi ───────────────────────────────────────────────────────────
const mockGetExtensions = vi.fn().mockResolvedValue(null);
const mockGetLearningSkills = vi.fn().mockResolvedValue(null);

vi.mock('../../../utils/backendApi', () => ({
  backendApi: {
    getExtensions: (...args: unknown[]) => mockGetExtensions(...args),
    getLearningSkills: (...args: unknown[]) => mockGetLearningSkills(...args),
  },
}));

import { AgentPanelProvider, useAgentPanel, extractTasksFromStream, buildConnectors, WELL_KNOWN_CONNECTORS } from '../AgentPanelContext';

// Helper component that exposes context values for testing
const ContextInspector: React.FC = () => {
  const ctx = useAgentPanel();
  return (
    <div>
      <span data-testid="mode">{ctx.state.mode}</span>
      <span data-testid="connected">{String(ctx.connected)}</span>
      <span data-testid="agent-count">{ctx.state.agents.length}</span>
      <span data-testid="first-agent-name">{ctx.state.agents[0]?.name ?? 'none'}</span>
      <span data-testid="first-agent-status">{ctx.state.agents[0]?.status ?? 'none'}</span>
      <span data-testid="skill-count">{ctx.state.skills.length}</span>
      <span data-testid="plugin-count">{ctx.state.plugins.length}</span>
      <span data-testid="connector-count">{ctx.state.connectors.length}</span>
      <span data-testid="file-activity-count">{ctx.state.fileActivity.length}</span>
      <span data-testid="tool-call-count">{ctx.state.toolCalls.length}</span>
      <span data-testid="task-count">{ctx.state.taskBoard.length}</span>
      <span data-testid="message-count">{ctx.state.messages.length}</span>
      <span data-testid="first-task-status">{ctx.state.taskBoard[0]?.status ?? 'none'}</span>
      <span data-testid="first-plugin-name">{ctx.state.plugins[0]?.name ?? 'none'}</span>
      <span data-testid="first-plugin-active">{String(ctx.state.plugins[0]?.active ?? 'none')}</span>
      <span data-testid="first-plugin-commands">{ctx.state.plugins[0]?.commands.join(',') ?? 'none'}</span>
      <span data-testid="first-skill-name">{ctx.state.skills[0]?.name ?? 'none'}</span>
      <span data-testid="first-skill-enabled">{String(ctx.state.skills[0]?.enabled ?? 'none')}</span>
      <span data-testid="first-skill-command">{ctx.state.skills[0]?.command ?? 'none'}</span>
      <span data-testid="first-connector-name">{ctx.state.connectors[0]?.name ?? 'none'}</span>
      <span data-testid="first-connector-state">{ctx.state.connectors[0]?.state ?? 'none'}</span>
      <span data-testid="first-connector-id">{ctx.state.connectors[0]?.id ?? 'none'}</span>
      <span data-testid="connector-names">{ctx.state.connectors.map(c => c.name).join(',')}</span>
      <span data-testid="connector-states">{ctx.state.connectors.map(c => c.state).join(',')}</span>
      <button data-testid="set-mode-code" onClick={() => ctx.setMode('code')} />
      <button data-testid="set-mode-cowork" onClick={() => ctx.setMode('cowork')} />
      <button
        data-testid="update-task"
        onClick={() => ctx.updateTask(1, { status: 'in_progress' })}
      />
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildDefaultMockAgUi(overrides: Partial<typeof mockAgUi> = {}): Record<string, unknown> {
  return {
    connected: true,
    isRunning: true,
    currentStep: 'Editing AppSidebar.tsx',
    agentState: { core_type: 'structured', model: 'claude-opus-4-6', context_usage: 42 },
    activeToolCalls: new Map([
      ['tc-1', { toolCallId: 'tc-1', toolCallName: 'Read', args: 'file.ts', status: 'success', timestamp: Date.now() - 5000 }],
      ['tc-2', { toolCallId: 'tc-2', toolCallName: 'Edit', args: 'main.tsx', status: 'active', timestamp: Date.now() - 1000 }],
    ]),
    activities: [
      { id: 'a-1', message: 'Modified src/App.tsx', metadata: { file_path: 'src/App.tsx', operation: 'modified' }, timestamp: Date.now() - 3000 },
      { id: 'a-2', message: 'Created src/new.ts', metadata: { file_path: 'src/new.ts', operation: 'created' }, timestamp: Date.now() - 2000 },
    ],
    customEvents: [],
    messages: [
      { messageId: 'msg-1', role: 'agent', content: 'Working on it', streaming: false, timestamp: Date.now() - 4000 },
      { messageId: 'msg-2', role: 'user', content: 'Fix the sidebar', streaming: false, timestamp: Date.now() - 6000 },
      { messageId: 'msg-3', role: 'agent', content: 'Still typing...', streaming: true, timestamp: Date.now() },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentPanelContext', () => {
  beforeEach(() => {
    mockAgUi = buildDefaultMockAgUi();
    mockGetExtensions.mockReset().mockResolvedValue(null);
    mockGetLearningSkills.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('derives agent status from AG-UI stream', async () => {
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('mode').textContent).toBe('both');
    expect(screen.getByTestId('connected').textContent).toBe('true');
    expect(Number(screen.getByTestId('agent-count').textContent)).toBe(1);
    expect(screen.getByTestId('first-agent-name').textContent).toBe('Super-Goose (structured)');
    expect(screen.getByTestId('first-agent-status').textContent).toBe('acting');
  });

  it('derives tool calls from activeToolCalls map', () => {
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('tool-call-count').textContent)).toBe(2);
  });

  it('derives file activity from activities', () => {
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('file-activity-count').textContent)).toBe(2);
  });

  it('derives messages from AG-UI messages (excludes streaming)', () => {
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    // msg-3 is streaming=true, so only 2 should appear
    expect(Number(screen.getByTestId('message-count').textContent)).toBe(2);
  });

  it('fetches extensions on mount and maps to plugins', async () => {
    mockGetExtensions.mockResolvedValue([
      { key: 'developer', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev tools' },
      { key: 'memory', name: 'Memory', enabled: false, type: 'stdio', description: 'Memory' },
    ]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    // Wait for the async fetch to resolve and state to update
    await waitFor(() => {
      expect(Number(screen.getByTestId('plugin-count').textContent)).toBe(2);
    });

    expect(screen.getByTestId('first-plugin-name').textContent).toBe('Developer');
    expect(screen.getByTestId('first-plugin-active').textContent).toBe('true');
    expect(screen.getByTestId('first-plugin-commands').textContent).toBe('builtin');
    expect(mockGetExtensions).toHaveBeenCalledTimes(1);
  });

  it('fetches learning skills on mount and maps to skills', async () => {
    mockGetLearningSkills.mockResolvedValue([
      { id: 'sk-1', name: 'code-review', description: 'Review code', verified: true, usage_count: 5, created_at: '2026-01-01' },
      { id: 'sk-2', name: 'refactor', description: 'Refactor code', verified: false, usage_count: 2, created_at: '2026-01-02' },
    ]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      expect(Number(screen.getByTestId('skill-count').textContent)).toBe(2);
    });

    expect(screen.getByTestId('first-skill-name').textContent).toBe('code-review');
    expect(screen.getByTestId('first-skill-enabled').textContent).toBe('true');
    expect(screen.getByTestId('first-skill-command').textContent).toBe('code-review');
    expect(mockGetLearningSkills).toHaveBeenCalledTimes(1);
  });

  it('keeps existing plugins when API returns null on subsequent poll', async () => {
    vi.useFakeTimers();

    // First fetch succeeds
    mockGetExtensions.mockResolvedValueOnce([
      { key: 'dev', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev' },
    ]);

    await act(async () => {
      render(
        <AgentPanelProvider>
          <ContextInspector />
        </AgentPanelProvider>
      );
    });

    // Flush initial promise
    await act(async () => { await Promise.resolve(); });

    expect(Number(screen.getByTestId('plugin-count').textContent)).toBe(1);

    // Second fetch returns null (API error)
    mockGetExtensions.mockResolvedValueOnce(null);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    // Should still show 1 plugin (data retained on error)
    expect(Number(screen.getByTestId('plugin-count').textContent)).toBe(1);
    vi.useRealTimers();
  });

  it('keeps existing skills when API returns null on subsequent poll', async () => {
    vi.useFakeTimers();

    // First fetch succeeds
    mockGetLearningSkills.mockResolvedValueOnce([
      { id: 'sk-1', name: 'test-skill', description: 'Test', verified: true, usage_count: 1, created_at: '2026-01-01' },
    ]);

    await act(async () => {
      render(
        <AgentPanelProvider>
          <ContextInspector />
        </AgentPanelProvider>
      );
    });

    await act(async () => { await Promise.resolve(); });

    expect(Number(screen.getByTestId('skill-count').textContent)).toBe(1);

    // Second fetch returns null (API error)
    mockGetLearningSkills.mockResolvedValueOnce(null);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    // Should still show 1 skill (data retained on error)
    expect(Number(screen.getByTestId('skill-count').textContent)).toBe(1);
    vi.useRealTimers();
  });

  it('polls extensions every 30 seconds', async () => {
    vi.useFakeTimers();
    mockGetExtensions.mockResolvedValue([]);

    await act(async () => {
      render(
        <AgentPanelProvider>
          <ContextInspector />
        </AgentPanelProvider>
      );
    });

    await act(async () => { await Promise.resolve(); });

    // Initial fetch
    expect(mockGetExtensions).toHaveBeenCalledTimes(1);

    // Advance 30s — second fetch
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(mockGetExtensions).toHaveBeenCalledTimes(2);

    // Advance another 30s — third fetch
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(mockGetExtensions).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('polls learning skills every 60 seconds', async () => {
    vi.useFakeTimers();
    mockGetLearningSkills.mockResolvedValue([]);

    await act(async () => {
      render(
        <AgentPanelProvider>
          <ContextInspector />
        </AgentPanelProvider>
      );
    });

    await act(async () => { await Promise.resolve(); });

    // Initial fetch
    expect(mockGetLearningSkills).toHaveBeenCalledTimes(1);

    // Advance 60s — second fetch
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mockGetLearningSkills).toHaveBeenCalledTimes(2);

    // Advance another 60s — third fetch
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mockGetLearningSkills).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('maps extension key to plugin id', async () => {
    mockGetExtensions.mockResolvedValue([
      { key: 'my-ext-key', name: 'My Extension', enabled: true, type: 'stdio', description: '' },
    ]);

    const PluginIdInspector = () => {
      const { state } = useAgentPanel();
      return <span data-testid="plugin-id">{state.plugins[0]?.id ?? 'none'}</span>;
    };

    render(
      <AgentPanelProvider>
        <PluginIdInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('plugin-id').textContent).toBe('my-ext-key');
    });
  });

  it('falls back to extension name when key is missing for plugin id', async () => {
    mockGetExtensions.mockResolvedValue([
      { key: '', name: 'Fallback Name', enabled: true, type: 'builtin', description: '' },
    ]);

    const PluginIdInspector = () => {
      const { state } = useAgentPanel();
      return <span data-testid="plugin-id">{state.plugins[0]?.id ?? 'none'}</span>;
    };

    render(
      <AgentPanelProvider>
        <PluginIdInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('plugin-id').textContent).toBe('Fallback Name');
    });
  });

  it('defaults skill.enabled to true when verified is undefined', async () => {
    mockGetLearningSkills.mockResolvedValue([
      { id: 'sk-x', name: 'no-verified-field', description: 'Test', usage_count: 0, created_at: '2026-01-01' },
    ]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('first-skill-enabled').textContent).toBe('true');
    });
  });

  it('shows well-known connectors as fallbacks when API returns null', () => {
    // mockGetExtensions defaults to null — no API data
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    // Should show 5 well-known connectors (all 'available')
    expect(Number(screen.getByTestId('connector-count').textContent)).toBe(5);
    expect(screen.getByTestId('connector-names').textContent).toBe(
      'GitHub,Docker Hub,Ollama,Claude API,OpenAI'
    );
    expect(screen.getByTestId('connector-states').textContent).toBe(
      'available,available,available,available,available'
    );
  });

  it('shows well-known connectors when API returns empty array', async () => {
    mockGetExtensions.mockResolvedValue([]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      // Still 5 well-known — empty extensions just means no overrides
      expect(Number(screen.getByTestId('connector-count').textContent)).toBe(5);
    });
  });

  it('maps extensions to connectors with correct state', async () => {
    mockGetExtensions.mockResolvedValue([
      { key: 'developer', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev tools' },
      { key: 'memory', name: 'Memory', enabled: false, type: 'stdio', description: 'Memory' },
    ]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      // 2 extension-derived + 5 well-known = 7
      expect(Number(screen.getByTestId('connector-count').textContent)).toBe(7);
    });

    // First connector is from extensions
    expect(screen.getByTestId('first-connector-name').textContent).toBe('Developer');
    expect(screen.getByTestId('first-connector-state').textContent).toBe('connected');
    expect(screen.getByTestId('first-connector-id').textContent).toBe('ext-developer');
  });

  it('extension-derived connectors override well-known by name (case-insensitive)', async () => {
    // "GitHub" extension overrides the well-known "GitHub" fallback
    mockGetExtensions.mockResolvedValue([
      { key: 'github-ext', name: 'GitHub', enabled: true, type: 'platform', description: 'GitHub integration' },
    ]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      // 1 extension-derived GitHub + 4 remaining well-known (Docker Hub, Ollama, Claude API, OpenAI) = 5
      expect(Number(screen.getByTestId('connector-count').textContent)).toBe(5);
    });

    // The GitHub connector should be from extension (connected), not well-known (available)
    expect(screen.getByTestId('first-connector-name').textContent).toBe('GitHub');
    expect(screen.getByTestId('first-connector-state').textContent).toBe('connected');
    expect(screen.getByTestId('first-connector-id').textContent).toBe('ext-github-ext');
  });

  it('disabled extension maps to available connector state', async () => {
    mockGetExtensions.mockResolvedValue([
      { key: 'custom-tool', name: 'CustomTool', enabled: false, type: 'stdio', description: 'A custom tool' },
    ]);

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    await waitFor(() => {
      expect(Number(screen.getByTestId('connector-count').textContent)).toBe(6); // 1 ext + 5 well-known
    });

    expect(screen.getByTestId('first-connector-name').textContent).toBe('CustomTool');
    expect(screen.getByTestId('first-connector-state').textContent).toBe('available');
  });

  it('starts with empty plugins and skills before API responds, but shows well-known connectors', () => {
    // Don't resolve the mocks — they stay pending
    mockGetExtensions.mockReturnValue(new Promise(() => {}));
    mockGetLearningSkills.mockReturnValue(new Promise(() => {}));

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('plugin-count').textContent)).toBe(0);
    expect(Number(screen.getByTestId('skill-count').textContent)).toBe(0);
    // Well-known connectors are available even before API responds
    expect(Number(screen.getByTestId('connector-count').textContent)).toBe(5);
  });

  it('agent status is idle when not connected', () => {
    mockAgUi = buildDefaultMockAgUi({ connected: false });
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('first-agent-status').textContent).toBe('idle');
  });

  it('agent status is complete when connected but not running', () => {
    mockAgUi = buildDefaultMockAgUi({ isRunning: false });
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('first-agent-status').textContent).toBe('complete');
  });

  it('handles empty AG-UI data gracefully', () => {
    mockAgUi = buildDefaultMockAgUi({
      activeToolCalls: new Map(),
      activities: [],
      messages: [],
      agentState: {},
    });

    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('tool-call-count').textContent)).toBe(0);
    expect(Number(screen.getByTestId('file-activity-count').textContent)).toBe(0);
    expect(Number(screen.getByTestId('message-count').textContent)).toBe(0);
    expect(screen.getByTestId('first-agent-name').textContent).toBe('Super-Goose (default)');
  });

  it('setMode changes the panel mode', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('mode').textContent).toBe('both');

    await user.click(screen.getByTestId('set-mode-code'));
    expect(screen.getByTestId('mode').textContent).toBe('code');

    await user.click(screen.getByTestId('set-mode-cowork'));
    expect(screen.getByTestId('mode').textContent).toBe('cowork');
  });

  it('taskBoard is empty when no task_update activities or events exist', () => {
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    // Default mock has no task_update activities
    expect(Number(screen.getByTestId('task-count').textContent)).toBe(0);
  });

  it('derives tasks from activities with activity_type task_update', () => {
    mockAgUi = buildDefaultMockAgUi({
      activities: [
        {
          id: 'a-task-1', message: 'Task created', level: 'info', timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: 1, title: 'Setup project', status: 'created', owner: 'Agent-1' },
        },
        {
          id: 'a-task-2', message: 'Task in progress', level: 'info', timestamp: 2000,
          metadata: { activity_type: 'task_update', task_id: 2, title: 'Write tests', status: 'in_progress' },
        },
        {
          id: 'a-task-3', message: 'Task done', level: 'info', timestamp: 3000,
          metadata: { activity_type: 'task_update', task_id: 3, title: 'Deploy', status: 'completed' },
        },
        {
          id: 'a-task-4', message: 'Task failed', level: 'error', timestamp: 4000,
          metadata: { activity_type: 'task_update', task_id: 4, title: 'Integration', status: 'failed', blocked_by: [2, 3] },
        },
      ],
    });

    const TaskInspector = () => {
      const { state } = useAgentPanel();
      return (
        <div>
          <span data-testid="task-count">{state.taskBoard.length}</span>
          {state.taskBoard.map((t) => (
            <div key={t.id} data-testid={`task-${t.id}`}>
              <span data-testid={`task-${t.id}-title`}>{t.title}</span>
              <span data-testid={`task-${t.id}-status`}>{t.status}</span>
              <span data-testid={`task-${t.id}-owner`}>{t.owner ?? 'none'}</span>
              <span data-testid={`task-${t.id}-blocked`}>{t.blockedBy?.join(',') ?? 'none'}</span>
            </div>
          ))}
        </div>
      );
    };

    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('task-count').textContent)).toBe(4);

    // Task 1: created -> pending
    expect(screen.getByTestId('task-1-title').textContent).toBe('Setup project');
    expect(screen.getByTestId('task-1-status').textContent).toBe('pending');
    expect(screen.getByTestId('task-1-owner').textContent).toBe('Agent-1');

    // Task 2: in_progress -> in_progress
    expect(screen.getByTestId('task-2-status').textContent).toBe('in_progress');

    // Task 3: completed -> completed
    expect(screen.getByTestId('task-3-status').textContent).toBe('completed');

    // Task 4: failed -> blocked, with blockedBy
    expect(screen.getByTestId('task-4-status').textContent).toBe('blocked');
    expect(screen.getByTestId('task-4-blocked').textContent).toBe('2,3');
  });

  it('derives tasks from customEvents with name task_update', () => {
    mockAgUi = buildDefaultMockAgUi({
      customEvents: [
        {
          name: 'task_update', timestamp: 5000,
          value: { task_id: 10, title: 'Custom event task', status: 'running', owner: 'Bot' },
        },
        {
          name: 'task_update', timestamp: 6000,
          value: { task_id: 11, title: 'Blocked task', status: 'blocked', blocked_by: [10] },
        },
        {
          name: 'other_event', timestamp: 7000,
          value: { task_id: 99, title: 'Should be ignored' },
        },
      ],
    });

    const TaskInspector = () => {
      const { state } = useAgentPanel();
      return (
        <div>
          <span data-testid="task-count">{state.taskBoard.length}</span>
          {state.taskBoard.map((t) => (
            <span key={t.id} data-testid={`task-${t.id}-status`}>{t.status}</span>
          ))}
        </div>
      );
    };

    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    // Only 2 tasks (ignores other_event)
    expect(Number(screen.getByTestId('task-count').textContent)).toBe(2);
    expect(screen.getByTestId('task-10-status').textContent).toBe('in_progress');
    expect(screen.getByTestId('task-11-status').textContent).toBe('blocked');
  });

  it('de-duplicates tasks by task_id keeping most recent timestamp', () => {
    mockAgUi = buildDefaultMockAgUi({
      activities: [
        {
          id: 'a-old', message: 'Old', level: 'info', timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: 1, title: 'Task v1', status: 'created' },
        },
        {
          id: 'a-new', message: 'New', level: 'info', timestamp: 5000,
          metadata: { activity_type: 'task_update', task_id: 1, title: 'Task v2', status: 'completed' },
        },
      ],
    });

    const TaskInspector = () => {
      const { state } = useAgentPanel();
      return (
        <div>
          <span data-testid="task-count">{state.taskBoard.length}</span>
          <span data-testid="task-1-title">{state.taskBoard[0]?.title ?? 'none'}</span>
          <span data-testid="task-1-status">{state.taskBoard[0]?.status ?? 'none'}</span>
        </div>
      );
    };

    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    // Only 1 task (de-duped), uses newest data
    expect(Number(screen.getByTestId('task-count').textContent)).toBe(1);
    expect(screen.getByTestId('task-1-title').textContent).toBe('Task v2');
    expect(screen.getByTestId('task-1-status').textContent).toBe('completed');
  });

  it('merges tasks from both activities and customEvents', () => {
    mockAgUi = buildDefaultMockAgUi({
      activities: [
        {
          id: 'a-1', message: 'Activity task', level: 'info', timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: 1, title: 'From activities', status: 'in_progress' },
        },
      ],
      customEvents: [
        {
          name: 'task_update', timestamp: 2000,
          value: { task_id: 2, title: 'From custom events', status: 'pending' },
        },
      ],
    });

    const TaskInspector = () => {
      const { state } = useAgentPanel();
      return <span data-testid="task-count">{state.taskBoard.length}</span>;
    };

    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('task-count').textContent)).toBe(2);
  });

  it('updateTask applies manual overrides on top of derived tasks', async () => {
    mockAgUi = buildDefaultMockAgUi({
      activities: [
        {
          id: 'a-1', message: 'Task', level: 'info', timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: 1, title: 'My task', status: 'created' },
        },
      ],
    });

    const TaskInspector = () => {
      const { state, updateTask } = useAgentPanel();
      return (
        <div>
          <span data-testid="task-count">{state.taskBoard.length}</span>
          <span data-testid="first-task-status">{state.taskBoard[0]?.status ?? 'none'}</span>
          <button data-testid="update-task" onClick={() => updateTask(1, { status: 'in_progress' })} />
        </div>
      );
    };

    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    // Initially derived as 'pending' (from 'created')
    expect(screen.getByTestId('first-task-status').textContent).toBe('pending');

    // Apply manual override
    await user.click(screen.getByTestId('update-task'));

    // Now should be 'in_progress' from the manual override
    expect(screen.getByTestId('first-task-status').textContent).toBe('in_progress');
  });

  it('handles task_id as string in activity metadata', () => {
    mockAgUi = buildDefaultMockAgUi({
      activities: [
        {
          id: 'a-str', message: 'String id task', level: 'info', timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: '42', title: 'String ID', status: 'done' },
        },
      ],
    });

    const TaskInspector = () => {
      const { state } = useAgentPanel();
      return (
        <div>
          <span data-testid="task-count">{state.taskBoard.length}</span>
          <span data-testid="task-status">{state.taskBoard[0]?.status ?? 'none'}</span>
        </div>
      );
    };

    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('task-count').textContent)).toBe(1);
    expect(screen.getByTestId('task-status').textContent).toBe('completed');
  });

  it('ignores activities with invalid task_id', () => {
    mockAgUi = buildDefaultMockAgUi({
      activities: [
        {
          id: 'a-bad', message: 'Bad task', level: 'info', timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: 'not-a-number', title: 'Bad', status: 'pending' },
        },
      ],
    });

    const TaskInspector = () => {
      const { state } = useAgentPanel();
      return <span data-testid="task-count">{state.taskBoard.length}</span>;
    };

    render(
      <AgentPanelProvider>
        <TaskInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('task-count').textContent)).toBe(0);
  });

  it('throws error when useAgentPanel is used outside provider', () => {
    const BrokenComponent = () => {
      useAgentPanel();
      return null;
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BrokenComponent />)).toThrow(
      'useAgentPanel must be used within an AgentPanelProvider.'
    );
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Pure function tests: buildConnectors
// ---------------------------------------------------------------------------

describe('buildConnectors', () => {
  it('returns only well-known connectors when extensions array is empty', () => {
    const result = buildConnectors([]);
    expect(result).toHaveLength(WELL_KNOWN_CONNECTORS.length);
    expect(result.every((c) => c.state === 'available')).toBe(true);
    expect(result.map((c) => c.name)).toEqual(
      WELL_KNOWN_CONNECTORS.map((c) => c.name)
    );
  });

  it('maps enabled extension to connected connector', () => {
    const exts = [
      { key: 'dev', name: 'Developer', enabled: true, type: 'builtin' as const, description: 'Dev' },
    ];
    const result = buildConnectors(exts);
    const devConnector = result.find((c) => c.name === 'Developer');
    expect(devConnector).toBeDefined();
    expect(devConnector!.state).toBe('connected');
    expect(devConnector!.id).toBe('ext-dev');
  });

  it('maps disabled extension to available connector', () => {
    const exts = [
      { key: 'mem', name: 'Memory', enabled: false, type: 'stdio' as const, description: 'Memory' },
    ];
    const result = buildConnectors(exts);
    const memConnector = result.find((c) => c.name === 'Memory');
    expect(memConnector).toBeDefined();
    expect(memConnector!.state).toBe('available');
  });

  it('removes well-known entry when extension has same name (case-insensitive)', () => {
    const exts = [
      { key: 'gh', name: 'GitHub', enabled: true, type: 'platform' as const, description: 'GitHub' },
    ];
    const result = buildConnectors(exts);

    // Only one GitHub connector (from extensions, not well-known)
    const githubConnectors = result.filter((c) => c.name.toLowerCase() === 'github');
    expect(githubConnectors).toHaveLength(1);
    expect(githubConnectors[0].id).toBe('ext-gh');
    expect(githubConnectors[0].state).toBe('connected');
  });

  it('preserves well-known entries that do not match any extension', () => {
    const exts = [
      { key: 'gh', name: 'GitHub', enabled: true, type: 'platform' as const, description: '' },
    ];
    const result = buildConnectors(exts);

    // GitHub replaced, but others remain
    const names = result.map((c) => c.name);
    expect(names).toContain('Docker Hub');
    expect(names).toContain('Ollama');
    expect(names).toContain('Claude API');
    expect(names).toContain('OpenAI');
    // Total: 1 ext + 4 remaining well-known = 5
    expect(result).toHaveLength(5);
  });

  it('places extension-derived connectors before well-known fallbacks', () => {
    const exts = [
      { key: 'custom', name: 'MyTool', enabled: true, type: 'stdio' as const, description: 'Custom' },
    ];
    const result = buildConnectors(exts);

    // First connector is from extensions
    expect(result[0].name).toBe('MyTool');
    expect(result[0].id).toBe('ext-custom');

    // Followed by all 5 well-known
    expect(result.slice(1).map((c) => c.name)).toEqual(
      WELL_KNOWN_CONNECTORS.map((c) => c.name)
    );
  });

  it('uses extension name as fallback id when key is empty', () => {
    const exts = [
      { key: '', name: 'NoKey', enabled: true, type: 'builtin' as const, description: '' },
    ];
    const result = buildConnectors(exts);
    const noKey = result.find((c) => c.name === 'NoKey');
    expect(noKey!.id).toBe('ext-NoKey');
  });

  it('sets description from extension type', () => {
    const exts = [
      { key: 'tool', name: 'ATool', enabled: true, type: 'streamable_http' as const, description: 'Desc' },
    ];
    const result = buildConnectors(exts);
    const tool = result.find((c) => c.name === 'ATool');
    expect(tool!.description).toBe('streamable_http');
  });
});

// ---------------------------------------------------------------------------
// Pure function tests: extractTasksFromStream
// ---------------------------------------------------------------------------

describe('extractTasksFromStream', () => {
  it('returns empty array when no task data', () => {
    const result = extractTasksFromStream([], []);
    expect(result).toEqual([]);
  });

  it('extracts tasks from activities with task_update metadata', () => {
    const activities = [
      {
        id: 'a-1', message: 'Created task', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'Setup', status: 'created', owner: 'Bot' },
      },
    ];
    const result = extractTasksFromStream(activities, []);
    expect(result).toEqual([
      { id: 1, title: 'Setup', status: 'pending', owner: 'Bot', blockedBy: undefined },
    ]);
  });

  it('extracts tasks from customEvents with name task_update', () => {
    const events = [
      {
        name: 'task_update', timestamp: 2000,
        value: { task_id: 5, title: 'Custom task', status: 'running', owner: 'Agent' },
      },
    ];
    const result = extractTasksFromStream([], events);
    expect(result).toEqual([
      { id: 5, title: 'Custom task', status: 'in_progress', owner: 'Agent', blockedBy: undefined },
    ]);
  });

  it('maps all status values correctly', () => {
    const statuses: Array<[string, string]> = [
      ['created', 'pending'],
      ['pending', 'pending'],
      ['in_progress', 'in_progress'],
      ['running', 'in_progress'],
      ['completed', 'completed'],
      ['done', 'completed'],
      ['failed', 'blocked'],
      ['blocked', 'blocked'],
      ['error', 'blocked'],
    ];

    for (const [input, expected] of statuses) {
      const result = extractTasksFromStream(
        [{
          id: `a-${input}`, message: '', level: 'info' as const, timestamp: 1000,
          metadata: { activity_type: 'task_update', task_id: 1, title: 'T', status: input },
        }],
        [],
      );
      expect(result[0].status).toBe(expected);
    }
  });

  it('defaults unknown status to pending', () => {
    const result = extractTasksFromStream(
      [{
        id: 'a', message: '', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'T', status: 'unknown_status' },
      }],
      [],
    );
    expect(result[0].status).toBe('pending');
  });

  it('de-duplicates by task_id keeping the most recent timestamp', () => {
    const activities = [
      {
        id: 'a-1', message: 'Old', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'Old title', status: 'created' },
      },
      {
        id: 'a-2', message: 'New', level: 'info' as const, timestamp: 5000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'New title', status: 'completed' },
      },
    ];
    const result = extractTasksFromStream(activities, []);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('New title');
    expect(result[0].status).toBe('completed');
  });

  it('de-duplicates across activities and customEvents', () => {
    const activities = [
      {
        id: 'a-1', message: '', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'From activity', status: 'created' },
      },
    ];
    const events = [
      {
        name: 'task_update', timestamp: 3000,
        value: { task_id: 1, title: 'From custom event (newer)', status: 'done' },
      },
    ];
    const result = extractTasksFromStream(activities, events);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('From custom event (newer)');
    expect(result[0].status).toBe('completed');
  });

  it('sorts results by task_id', () => {
    const activities = [
      {
        id: 'a-3', message: '', level: 'info' as const, timestamp: 3000,
        metadata: { activity_type: 'task_update', task_id: 3, title: 'Third', status: 'pending' },
      },
      {
        id: 'a-1', message: '', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'First', status: 'pending' },
      },
      {
        id: 'a-2', message: '', level: 'info' as const, timestamp: 2000,
        metadata: { activity_type: 'task_update', task_id: 2, title: 'Second', status: 'pending' },
      },
    ];
    const result = extractTasksFromStream(activities, []);
    expect(result.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('parses blocked_by array from metadata', () => {
    const result = extractTasksFromStream(
      [{
        id: 'a', message: '', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'T', status: 'blocked', blocked_by: [2, 3] },
      }],
      [],
    );
    expect(result[0].blockedBy).toEqual([2, 3]);
  });

  it('ignores non task_update activities', () => {
    const activities = [
      {
        id: 'a-file', message: 'Modified file.ts', level: 'info' as const, timestamp: 1000,
        metadata: { file_path: 'file.ts', operation: 'modified' },
      },
      {
        id: 'a-task', message: 'Task', level: 'info' as const, timestamp: 2000,
        metadata: { activity_type: 'task_update', task_id: 1, title: 'Real task', status: 'pending' },
      },
    ];
    const result = extractTasksFromStream(activities, []);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Real task');
  });

  it('uses message as fallback title when metadata.title is missing', () => {
    const result = extractTasksFromStream(
      [{
        id: 'a', message: 'Fallback message title', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 1, status: 'pending' },
      }],
      [],
    );
    expect(result[0].title).toBe('Fallback message title');
  });

  it('uses Task #N as fallback title when both title and message are missing', () => {
    const result = extractTasksFromStream(
      [],
      [{
        name: 'task_update', timestamp: 1000,
        value: { task_id: 7, status: 'pending' },
      }],
    );
    expect(result[0].title).toBe('Task #7');
  });

  it('ignores customEvents with non-task_update names', () => {
    const events = [
      { name: 'heartbeat', timestamp: 1000, value: {} },
      { name: 'status_update', timestamp: 2000, value: { task_id: 1, title: 'X', status: 'pending' } },
    ];
    const result = extractTasksFromStream([], events);
    expect(result).toHaveLength(0);
  });

  it('handles task_id as string that can be parsed to number', () => {
    const result = extractTasksFromStream(
      [{
        id: 'a', message: '', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: '42', title: 'String ID', status: 'done' },
      }],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
    expect(result[0].status).toBe('completed');
  });

  it('skips entries with invalid (non-numeric) task_id', () => {
    const result = extractTasksFromStream(
      [{
        id: 'a', message: '', level: 'info' as const, timestamp: 1000,
        metadata: { activity_type: 'task_update', task_id: 'abc', title: 'Bad', status: 'pending' },
      }],
      [],
    );
    expect(result).toHaveLength(0);
  });
});
