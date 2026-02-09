import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { TokenState, Message } from '../api/types.gen';
import { ChatState } from '../types/chatState';

const STORAGE_KEY_AUTO_COMPACT = 'goose-auto-compact-enabled';
const COMPACTION_THRESHOLD_PERCENT = 50;
const DEFAULT_CONTEXT_WINDOW = 128_000;

export interface TokenUsage {
  current: number;
  max: number;
  percentage: number;
}

export interface CompactionHistoryEntry {
  timestamp: number;
  messagesBefore: number;
  messagesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
}

export interface UseContextManagementParams {
  tokenState: TokenState;
  messages: Message[];
  chatState: ChatState;
  contextWindowSize?: number;
  onSendMessage?: (text: string) => void;
}

export interface UseContextManagementReturn {
  tokenUsage: TokenUsage;
  messageCount: number;
  compactionHistory: CompactionHistoryEntry[];
  autoCompactEnabled: boolean;
  setAutoCompactEnabled: (enabled: boolean) => void;
  canCompact: boolean;
  isCompacting: boolean;
  compact: () => Promise<void>;
}

function readAutoCompactPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_AUTO_COMPACT) === 'true';
  } catch {
    return false;
  }
}

function writeAutoCompactPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_COMPACT, String(enabled));
  } catch {
    // localStorage unavailable (e.g. incognito/quota exceeded) — silently ignore
  }
}

/**
 * Manages context window tracking, compaction history, and auto-compaction.
 *
 * Consumes live `tokenState`, `messages`, and `chatState` from `useChatStream`
 * to derive token usage percentages, detect compaction transitions, and
 * maintain a running history of compaction events within the session.
 *
 * Compaction itself is handled by the goosed backend — when the context window
 * fills up, the backend emits a `systemNotification` with `thinkingMessage`
 * matching `'goose is compacting the conversation...'`, which causes
 * `useChatStream` to set `ChatState.Compacting`. This hook detects those
 * state transitions and records the before/after metrics.
 *
 * If `autoCompactEnabled` is true and token usage exceeds the threshold,
 * the hook will send a compaction request message via `onSendMessage`.
 */
export function useContextManagement({
  tokenState,
  messages,
  chatState,
  contextWindowSize = DEFAULT_CONTEXT_WINDOW,
  onSendMessage,
}: UseContextManagementParams): UseContextManagementReturn {
  const [autoCompactEnabled, setAutoCompactEnabledState] = useState(readAutoCompactPreference);
  const [compactionHistory, setCompactionHistory] = useState<CompactionHistoryEntry[]>([]);

  // Track state transitions for compaction detection
  const prevChatStateRef = useRef<ChatState>(chatState);
  const compactionStartRef = useRef<{
    timestamp: number;
    messageCount: number;
    totalTokens: number;
  } | null>(null);

  // Guard to prevent duplicate auto-compaction requests within a single threshold breach
  const hasRequestedAutoCompactRef = useRef(false);

  // Persist auto-compact preference to localStorage on change
  const setAutoCompactEnabled = useCallback((enabled: boolean) => {
    setAutoCompactEnabledState(enabled);
    writeAutoCompactPreference(enabled);
  }, []);

  // Compute token usage from real token state
  const tokenUsage: TokenUsage = useMemo(() => {
    const current = tokenState.accumulatedTotalTokens || tokenState.totalTokens;
    const max = contextWindowSize;
    const percentage = max > 0 ? Math.round((current / max) * 100) : 0;
    return { current, max, percentage: Math.min(percentage, 100) };
  }, [tokenState.accumulatedTotalTokens, tokenState.totalTokens, contextWindowSize]);

  const isCompacting = chatState === ChatState.Compacting;
  const messageCount = messages.length;
  const canCompact = tokenUsage.percentage >= COMPACTION_THRESHOLD_PERCENT && !isCompacting;

  // Detect compaction state transitions and record history entries
  useEffect(() => {
    const prevState = prevChatStateRef.current;
    prevChatStateRef.current = chatState;

    // Entering compaction: record the starting snapshot
    if (prevState !== ChatState.Compacting && chatState === ChatState.Compacting) {
      compactionStartRef.current = {
        timestamp: Date.now(),
        messageCount: messages.length,
        totalTokens: tokenState.accumulatedTotalTokens || tokenState.totalTokens,
      };
    }

    // Leaving compaction: record the completed entry
    if (prevState === ChatState.Compacting && chatState !== ChatState.Compacting) {
      const start = compactionStartRef.current;
      if (start) {
        const entry: CompactionHistoryEntry = {
          timestamp: start.timestamp,
          messagesBefore: start.messageCount,
          messagesAfter: messages.length,
          tokensBefore: start.totalTokens,
          tokensAfter: tokenState.accumulatedTotalTokens || tokenState.totalTokens,
        };
        setCompactionHistory((prev: CompactionHistoryEntry[]) => [...prev, entry]);
        compactionStartRef.current = null;
      }
    }
  }, [chatState, messages.length, tokenState.accumulatedTotalTokens, tokenState.totalTokens]);

  // Reset auto-compact guard when compaction finishes so it can fire again next cycle
  useEffect(() => {
    if (!canCompact) {
      hasRequestedAutoCompactRef.current = false;
    }
  }, [canCompact]);

  // Auto-compact: when enabled and threshold exceeded, request compaction once
  useEffect(() => {
    if (
      autoCompactEnabled &&
      canCompact &&
      chatState === ChatState.Idle &&
      onSendMessage &&
      !hasRequestedAutoCompactRef.current
    ) {
      hasRequestedAutoCompactRef.current = true;
      onSendMessage(
        'Please compact and summarize the conversation to reduce context usage while preserving key information.'
      );
    }
  }, [autoCompactEnabled, canCompact, chatState, onSendMessage]);

  // Manual compact: sends a compaction request message through the chat
  const compact = useCallback(async () => {
    if (!canCompact || !onSendMessage) return;
    onSendMessage(
      'Please compact and summarize the conversation to reduce context usage while preserving key information.'
    );
  }, [canCompact, onSendMessage]);

  return {
    tokenUsage,
    messageCount,
    compactionHistory,
    autoCompactEnabled,
    setAutoCompactEnabled,
    canCompact,
    isCompacting,
    compact,
  };
}
