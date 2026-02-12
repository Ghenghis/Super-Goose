/**
 * Tests for PipelineContext — state management, ChatState mapping,
 * particle spawning, metrics tracking, and activity logging.
 */
import { renderHook, act } from '@testing-library/react';
import { PipelineProvider, usePipeline, STAGE_COLORS } from '../PipelineContext';
import { ChatState } from '../../../types/chatState';
import type { PipelineStage } from '../PipelineContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <PipelineProvider>{children}</PipelineProvider>;
}

describe('PipelineContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in waiting mode with no active stage', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.mode).toBe('waiting');
      expect(result.current.activeStage).toBeNull();
      expect(result.current.previousStage).toBeNull();
      expect(result.current.chatState).toBe(ChatState.Idle);
    });

    it('starts with zero tokens and elapsed time', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.totalTokens).toBe(0);
      expect(result.current.elapsedMs).toBe(0);
    });

    it('starts with empty activity and particles', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(result.current.activity).toEqual([]);
      expect(result.current.particles).toEqual([]);
    });

    it('starts with all metrics idle', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      const stages: PipelineStage[] = ['plan', 'team', 'execute', 'evolve', 'review', 'observe'];
      for (const stage of stages) {
        expect(result.current.metrics[stage].status).toBe('idle');
        expect(result.current.metrics[stage].tokensUsed).toBe(0);
        expect(result.current.metrics[stage].toolCalls).toBe(0);
        expect(result.current.metrics[stage].duration).toBe(0);
      }
    });
  });

  describe('STAGE_COLORS', () => {
    it('has colors for all 6 stages', () => {
      expect(Object.keys(STAGE_COLORS)).toHaveLength(6);
      expect(STAGE_COLORS.plan).toBe('#00BFFF');
      expect(STAGE_COLORS.team).toBe('#4488CC');
      expect(STAGE_COLORS.execute).toBe('#FF9900');
      expect(STAGE_COLORS.evolve).toBe('#9966FF');
      expect(STAGE_COLORS.review).toBe('#FF3366');
      expect(STAGE_COLORS.observe).toBe('#00CC66');
    });
  });

  describe('syncChatState', () => {
    it('maps Thinking to plan stage and active mode', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Thinking));
      expect(result.current.mode).toBe('active');
      expect(result.current.activeStage).toBe('plan');
    });

    it('maps Streaming to execute stage and active mode', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Streaming));
      expect(result.current.mode).toBe('active');
      expect(result.current.activeStage).toBe('execute');
    });

    it('maps Compacting to evolve stage and active mode', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Compacting));
      expect(result.current.mode).toBe('active');
      expect(result.current.activeStage).toBe('evolve');
    });

    it('maps RestartingAgent to team stage and active mode', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.RestartingAgent));
      expect(result.current.mode).toBe('active');
      expect(result.current.activeStage).toBe('team');
    });

    it('maps Idle to waiting mode with null stage', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      // First go active, then back to idle
      act(() => result.current.syncChatState(ChatState.Thinking));
      act(() => result.current.syncChatState(ChatState.Idle));
      expect(result.current.mode).toBe('waiting');
      expect(result.current.activeStage).toBeNull();
    });

    it('maps WaitingForUserInput to waiting mode', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.WaitingForUserInput));
      expect(result.current.mode).toBe('waiting');
    });

    it('maps LoadingConversation to waiting mode', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.LoadingConversation));
      expect(result.current.mode).toBe('waiting');
    });

    it('tracks previousStage on transition', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Thinking));
      act(() => result.current.syncChatState(ChatState.Streaming));
      expect(result.current.previousStage).toBe('plan');
      expect(result.current.activeStage).toBe('execute');
    });

    it('spawns particles on stage transition', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Thinking));
      const particlesBefore = result.current.particles.length;
      act(() => result.current.syncChatState(ChatState.Streaming));
      // Should have spawned burst particles (8 on transition)
      expect(result.current.particles.length).toBeGreaterThan(particlesBefore);
    });

    it('marks stage as complete when transitioning away', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Thinking));
      expect(result.current.metrics.plan.status).toBe('active');
      act(() => result.current.syncChatState(ChatState.Streaming));
      expect(result.current.metrics.plan.status).toBe('complete');
      expect(result.current.metrics.execute.status).toBe('active');
    });

    it('marks active stage complete when going to waiting', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Streaming));
      act(() => result.current.syncChatState(ChatState.Idle));
      expect(result.current.metrics.execute.status).toBe('complete');
    });
  });

  describe('syncTokens', () => {
    it('accumulates total tokens', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncTokens(100, 200));
      expect(result.current.totalTokens).toBe(300);
      act(() => result.current.syncTokens(50, 50));
      expect(result.current.totalTokens).toBe(400);
    });

    it('attributes tokens to active stage metrics', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Thinking));
      act(() => result.current.syncTokens(100, 200));
      expect(result.current.metrics.plan.tokensUsed).toBe(300);
    });

    it('does not attribute tokens to stage when no active stage', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncTokens(100, 200));
      // Tokens added to total but not to any stage
      expect(result.current.totalTokens).toBe(300);
      expect(result.current.metrics.plan.tokensUsed).toBe(0);
      expect(result.current.metrics.execute.tokensUsed).toBe(0);
    });
  });

  describe('pushActivity', () => {
    it('adds activity entries with auto-generated id and timestamp', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => {
        result.current.pushActivity({
          stage: 'execute',
          message: 'Writing code',
          type: 'action',
        });
      });
      expect(result.current.activity).toHaveLength(1);
      expect(result.current.activity[0].message).toBe('Writing code');
      expect(result.current.activity[0].stage).toBe('execute');
      expect(result.current.activity[0].type).toBe('action');
      expect(result.current.activity[0].id).toMatch(/^act-/);
      expect(result.current.activity[0].timestamp).toBeGreaterThan(0);
    });

    it('keeps max 50 entries', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.pushActivity({
            stage: 'execute',
            message: `Entry ${i}`,
            type: 'action',
          });
        }
      });
      expect(result.current.activity.length).toBeLessThanOrEqual(50);
      // Last entry should be the most recent
      expect(result.current.activity[result.current.activity.length - 1].message).toBe('Entry 59');
    });
  });

  describe('recordToolCall', () => {
    it('increments tool call count on active stage', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Streaming));
      act(() => result.current.recordToolCall('file_edit'));
      expect(result.current.metrics.execute.toolCalls).toBe(1);
      act(() => result.current.recordToolCall('bash'));
      expect(result.current.metrics.execute.toolCalls).toBe(2);
    });

    it('records to specified stage when provided', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Streaming));
      act(() => result.current.recordToolCall('linter', 'review'));
      expect(result.current.metrics.review.toolCalls).toBe(1);
      expect(result.current.metrics.execute.toolCalls).toBe(0);
    });

    it('adds activity entry for tool call', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      act(() => result.current.syncChatState(ChatState.Streaming));
      act(() => result.current.recordToolCall('file_edit'));
      const toolEntries = result.current.activity.filter((a) => a.type === 'tool');
      expect(toolEntries.length).toBeGreaterThanOrEqual(1);
      expect(toolEntries[toolEntries.length - 1].message).toBe('Tool: file_edit');
    });

    it('does nothing when no active stage and no stage specified', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      const metricsBefore = { ...result.current.metrics };
      act(() => result.current.recordToolCall('bash'));
      // Tool calls on all stages should remain 0
      expect(result.current.metrics.plan.toolCalls).toBe(metricsBefore.plan.toolCalls);
      expect(result.current.metrics.execute.toolCalls).toBe(metricsBefore.execute.toolCalls);
    });
  });

  describe('context value stability', () => {
    it('provides all expected methods', () => {
      const { result } = renderHook(() => usePipeline(), { wrapper });
      expect(typeof result.current.syncChatState).toBe('function');
      expect(typeof result.current.syncTokens).toBe('function');
      expect(typeof result.current.pushActivity).toBe('function');
      expect(typeof result.current.recordToolCall).toBe('function');
    });
  });
});
