/**
 * Tests for usePipelineBridge — syncs real ChatState, tokens, tool calls,
 * and message content into the PipelineContext.
 */
import { renderHook, act } from '@testing-library/react';
import { PipelineProvider, usePipeline } from '../PipelineContext';
import { usePipelineBridge } from '../usePipelineBridge';
import { ChatState } from '../../../types/chatState';

function wrapper({ children }: { children: React.ReactNode }) {
  return <PipelineProvider>{children}</PipelineProvider>;
}

/** Helper hook to combine bridge + pipeline state reads */
function useBridgeAndState(props: Parameters<typeof usePipelineBridge>[0]) {
  usePipelineBridge(props);
  return usePipeline();
}

describe('usePipelineBridge', () => {
  describe('chatState sync', () => {
    it('syncs initial Idle state', () => {
      const { result } = renderHook(
        () =>
          useBridgeAndState({
            chatState: ChatState.Idle,
            inputTokens: 0,
            outputTokens: 0,
          }),
        { wrapper }
      );
      expect(result.current.mode).toBe('waiting');
    });

    it('syncs transition to Thinking', () => {
      const { result, rerender } = renderHook(
        ({ chatState }) =>
          useBridgeAndState({
            chatState,
            inputTokens: 0,
            outputTokens: 0,
          }),
        { wrapper, initialProps: { chatState: ChatState.Idle } }
      );

      rerender({ chatState: ChatState.Thinking });

      expect(result.current.mode).toBe('active');
      expect(result.current.activeStage).toBe('plan');
    });

    it('syncs transition to Streaming', () => {
      const { result, rerender } = renderHook(
        ({ chatState }) =>
          useBridgeAndState({
            chatState,
            inputTokens: 0,
            outputTokens: 0,
          }),
        { wrapper, initialProps: { chatState: ChatState.Idle } }
      );

      rerender({ chatState: ChatState.Streaming });

      expect(result.current.mode).toBe('active');
      expect(result.current.activeStage).toBe('execute');
    });

    it('pushes activity on state change to Thinking', () => {
      const { result, rerender } = renderHook(
        ({ chatState }) =>
          useBridgeAndState({
            chatState,
            inputTokens: 0,
            outputTokens: 0,
          }),
        { wrapper, initialProps: { chatState: ChatState.Idle } }
      );

      rerender({ chatState: ChatState.Thinking });

      const thoughtEntries = result.current.activity.filter((a) => a.type === 'thought');
      expect(thoughtEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('pushes activity on state change to Streaming', () => {
      const { result, rerender } = renderHook(
        ({ chatState }) =>
          useBridgeAndState({
            chatState,
            inputTokens: 0,
            outputTokens: 0,
          }),
        { wrapper, initialProps: { chatState: ChatState.Idle } }
      );

      rerender({ chatState: ChatState.Streaming });

      const actionEntries = result.current.activity.filter((a) => a.type === 'action');
      expect(actionEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('does not re-sync when chatState stays the same', () => {
      const { result, rerender } = renderHook(
        ({ chatState }) =>
          useBridgeAndState({
            chatState,
            inputTokens: 0,
            outputTokens: 0,
          }),
        { wrapper, initialProps: { chatState: ChatState.Thinking } }
      );

      const activityCount = result.current.activity.length;
      rerender({ chatState: ChatState.Thinking });
      // Should not add duplicate activity entries
      expect(result.current.activity.length).toBe(activityCount);
    });
  });

  describe('token sync', () => {
    it('syncs token deltas (not totals)', () => {
      const { result, rerender } = renderHook(
        ({ input, output }) =>
          useBridgeAndState({
            chatState: ChatState.Streaming,
            inputTokens: input,
            outputTokens: output,
          }),
        { wrapper, initialProps: { input: 0, output: 0 } }
      );

      rerender({ input: 100, output: 200 });
      expect(result.current.totalTokens).toBe(300);

      rerender({ input: 150, output: 300 });
      // Should be 150+300 = 450, not 100+200+150+300
      expect(result.current.totalTokens).toBe(450);
    });

    it('does not sync when tokens stay the same', () => {
      const { result, rerender } = renderHook(
        ({ input, output }) =>
          useBridgeAndState({
            chatState: ChatState.Streaming,
            inputTokens: input,
            outputTokens: output,
          }),
        { wrapper, initialProps: { input: 100, output: 200 } }
      );

      const totalBefore = result.current.totalTokens;
      rerender({ input: 100, output: 200 });
      expect(result.current.totalTokens).toBe(totalBefore);
    });
  });

  describe('tool call detection', () => {
    it('records tool calls from latestToolName', () => {
      const { result, rerender } = renderHook(
        ({ tool }) =>
          useBridgeAndState({
            chatState: ChatState.Streaming,
            inputTokens: 0,
            outputTokens: 0,
            latestToolName: tool,
          }),
        { wrapper, initialProps: { tool: undefined as string | undefined } }
      );

      rerender({ tool: 'file_edit' });
      const toolActivity = result.current.activity.filter((a) => a.type === 'tool');
      expect(toolActivity.length).toBeGreaterThanOrEqual(1);
    });

    it('does not re-record same tool name', () => {
      const { result, rerender } = renderHook(
        ({ tool }) =>
          useBridgeAndState({
            chatState: ChatState.Streaming,
            inputTokens: 0,
            outputTokens: 0,
            latestToolName: tool,
          }),
        { wrapper, initialProps: { tool: 'bash' } }
      );

      const countBefore = result.current.activity.filter((a) => a.type === 'tool').length;
      rerender({ tool: 'bash' });
      const countAfter = result.current.activity.filter((a) => a.type === 'tool').length;
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('message content activity', () => {
    it('logs significant content changes as activity', () => {
      const { result, rerender } = renderHook(
        ({ content }) =>
          useBridgeAndState({
            chatState: ChatState.Streaming,
            inputTokens: 0,
            outputTokens: 0,
            latestMessageContent: content,
          }),
        { wrapper, initialProps: { content: '' } }
      );

      // Content must be > 20 chars to be logged
      rerender({
        content: 'This is a longer message about analyzing the codebase structure',
      });

      // Should have logged content as activity
      expect(result.current.activity.length).toBeGreaterThan(0);
    });

    it('skips tiny content increments', () => {
      const { result, rerender } = renderHook(
        ({ content }) =>
          useBridgeAndState({
            chatState: ChatState.Streaming,
            inputTokens: 0,
            outputTokens: 0,
            latestMessageContent: content,
          }),
        { wrapper, initialProps: { content: 'Hello' } }
      );

      const countBefore = result.current.activity.length;
      rerender({ content: 'Hello world' }); // Only 6 new chars, < 20
      expect(result.current.activity.length).toBe(countBefore);
    });
  });
});
