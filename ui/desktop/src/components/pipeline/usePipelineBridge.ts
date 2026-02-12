/**
 * usePipelineBridge — Wires PipelineContext to the REAL useChatStream state.
 *
 * Call this hook inside a component that has access to both useChatStream and usePipeline.
 * It watches the real ChatState and token counts, syncing them into the pipeline visualization.
 *
 * This is NOT mocked, NOT simulated. It reads real agent activity:
 * - ChatState changes (Idle → Thinking → Streaming → etc.)
 * - Token counts from the real SSE stream
 * - Tool call detection from message content
 * - Error detection from message content
 *
 * When the agent stops (ChatState.Idle / WaitingForUserInput), the pipeline
 * enters "waiting mode" with ambient slow particles.
 */

import { useEffect, useRef } from 'react';
import { ChatState } from '../../types/chatState';
import { usePipeline, type PipelineStage } from './PipelineContext';

interface BridgeProps {
  /** Current ChatState from useChatStream */
  chatState: ChatState;
  /** Token state from the stream — accumulated totals */
  inputTokens: number;
  outputTokens: number;
  /** Latest message text (for detecting tool calls and activity) */
  latestMessageContent?: string;
  /** Latest tool name if a tool is being called */
  latestToolName?: string;
}

/** Infer which pipeline stage from message content keywords */
function inferStage(content: string): PipelineStage {
  const lower = content.toLowerCase();
  if (lower.includes('plan') || lower.includes('analyz') || lower.includes('think')) return 'plan';
  if (lower.includes('agent') || lower.includes('specialist') || lower.includes('team')) return 'team';
  if (lower.includes('review') || lower.includes('check') || lower.includes('verify')) return 'review';
  if (lower.includes('refactor') || lower.includes('improv') || lower.includes('evolv')) return 'evolve';
  if (lower.includes('monitor') || lower.includes('observe') || lower.includes('metric')) return 'observe';
  return 'execute'; // Default — most activity is code execution
}

/** Infer activity type from message content */
function inferType(content: string): 'action' | 'thought' | 'tool' | 'result' | 'error' {
  const lower = content.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) return 'error';
  if (lower.includes('result') || lower.includes('output') || lower.includes('success')) return 'result';
  if (lower.includes('think') || lower.includes('consider') || lower.includes('analyz')) return 'thought';
  return 'action';
}

export function usePipelineBridge({
  chatState,
  inputTokens,
  outputTokens,
  latestMessageContent,
  latestToolName,
}: BridgeProps) {
  const { syncChatState, syncTokens, pushActivity, recordToolCall } = usePipeline();
  const prevTokensRef = useRef({ input: 0, output: 0 });
  const prevChatStateRef = useRef(chatState);
  const prevToolRef = useRef('');
  const prevContentRef = useRef('');

  // Sync ChatState changes
  useEffect(() => {
    if (chatState !== prevChatStateRef.current) {
      syncChatState(chatState);
      prevChatStateRef.current = chatState;

      // Log state transitions as activity
      if (chatState === ChatState.Thinking) {
        pushActivity({ stage: 'plan', message: 'Agent thinking...', type: 'thought' });
      } else if (chatState === ChatState.Streaming) {
        pushActivity({ stage: 'execute', message: 'Agent responding...', type: 'action' });
      } else if (chatState === ChatState.Compacting) {
        pushActivity({ stage: 'evolve', message: 'Compacting conversation...', type: 'action' });
      } else if (chatState === ChatState.Idle) {
        pushActivity({ stage: 'observe', message: 'Waiting for input', type: 'result' });
      }
    }
  }, [chatState, syncChatState, pushActivity]);

  // Sync token deltas (only send new tokens, not re-send totals)
  useEffect(() => {
    const deltaIn = inputTokens - prevTokensRef.current.input;
    const deltaOut = outputTokens - prevTokensRef.current.output;
    if (deltaIn > 0 || deltaOut > 0) {
      syncTokens(deltaIn, deltaOut);
      prevTokensRef.current = { input: inputTokens, output: outputTokens };
    }
  }, [inputTokens, outputTokens, syncTokens]);

  // Detect tool calls from message content
  useEffect(() => {
    if (latestToolName && latestToolName !== prevToolRef.current) {
      recordToolCall(latestToolName);
      prevToolRef.current = latestToolName;
    }
  }, [latestToolName, recordToolCall]);

  // Log message content changes as activity
  useEffect(() => {
    if (latestMessageContent && latestMessageContent !== prevContentRef.current) {
      // Only log meaningful content changes (skip tiny increments during streaming)
      const newContent = latestMessageContent.slice(prevContentRef.current.length);
      if (newContent.length > 20) {
        const firstLine = newContent.split('\n')[0].slice(0, 80);
        if (firstLine.trim()) {
          pushActivity({
            stage: inferStage(firstLine),
            message: firstLine,
            type: inferType(firstLine),
          });
        }
      }
      prevContentRef.current = latestMessageContent;
    }
  }, [latestMessageContent, pushActivity]);
}
