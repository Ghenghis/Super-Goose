import { useState, useCallback, useEffect, useMemo } from 'react';

export interface CompactionHistoryEntry {
  timestamp: number;
  tokensBefore: number;
  tokensAfter: number;
  summary: string;
}

export interface TokenUsage {
  current: number;
  max: number;
  percentage: number;
}

interface UseContextManagementProps {
  totalTokens?: number;
  tokenLimit: number;
  messageCount: number;
  onCompact: () => void;
}

interface UseContextManagementReturn {
  tokenUsage: TokenUsage;
  canCompact: boolean;
  isCompacting: boolean;
  compactionHistory: CompactionHistoryEntry[];
  compact: () => Promise<void>;
  autoCompactEnabled: boolean;
  setAutoCompact: (enabled: boolean) => void;
}

const COMPACTION_HISTORY_KEY = 'goose-compaction-history';
const AUTO_COMPACT_KEY = 'goose-auto-compact-enabled';

function loadCompactionHistory(): CompactionHistoryEntry[] {
  try {
    const stored = localStorage.getItem(COMPACTION_HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading compaction history:', err);
  }
  return [];
}

function saveCompactionHistory(history: CompactionHistoryEntry[]): void {
  try {
    // Keep only the last 50 entries to prevent unbounded growth
    const trimmed = history.slice(-50);
    localStorage.setItem(COMPACTION_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Error saving compaction history:', err);
  }
}

function loadAutoCompactSetting(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_COMPACT_KEY);
    return stored !== 'false'; // Default to true
  } catch {
    return true;
  }
}

export function useContextManagement({
  totalTokens,
  tokenLimit,
  messageCount,
  onCompact,
}: UseContextManagementProps): UseContextManagementReturn {
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactionHistory, setCompactionHistory] = useState<CompactionHistoryEntry[]>(
    loadCompactionHistory
  );
  const [autoCompactEnabled, setAutoCompactEnabledState] = useState<boolean>(
    loadAutoCompactSetting
  );

  const tokenUsage: TokenUsage = useMemo(() => {
    const current = totalTokens || 0;
    const max = tokenLimit;
    const percentage = max > 0 ? Math.round((current / max) * 100) : 0;
    return { current, max, percentage };
  }, [totalTokens, tokenLimit]);

  const canCompact = tokenUsage.percentage >= 70 && messageCount > 0 && !isCompacting;

  const compact = useCallback(async () => {
    if (isCompacting) return;

    const tokensBefore = tokenUsage.current;
    setIsCompacting(true);

    try {
      // Trigger compaction through the existing '/compact' mechanism
      onCompact();

      // Record the compaction in history
      // The actual tokens saved will be approximate since we record at trigger time
      const entry: CompactionHistoryEntry = {
        timestamp: Date.now(),
        tokensBefore,
        tokensAfter: 0, // Will be updated when new token count arrives
        summary: `Manual compaction at ${tokenUsage.percentage}% usage`,
      };

      setCompactionHistory((prev) => {
        const updated = [...prev, entry];
        saveCompactionHistory(updated);
        return updated;
      });
    } catch (err) {
      console.error('Error triggering compaction:', err);
    } finally {
      // Reset compacting state after a delay to show feedback
      setTimeout(() => {
        setIsCompacting(false);
      }, 2000);
    }
  }, [isCompacting, tokenUsage, onCompact]);

  // Update the last compaction entry when token count changes after compaction
  useEffect(() => {
    if (compactionHistory.length > 0 && totalTokens) {
      const lastEntry = compactionHistory[compactionHistory.length - 1];
      // If the last entry has tokensAfter=0, and this is a recent compaction (within 30s),
      // update it with the new token count
      if (lastEntry.tokensAfter === 0 && Date.now() - lastEntry.timestamp < 30000) {
        const updatedHistory = [...compactionHistory];
        updatedHistory[updatedHistory.length - 1] = {
          ...lastEntry,
          tokensAfter: totalTokens,
          summary: `Saved ${Math.max(0, lastEntry.tokensBefore - totalTokens).toLocaleString()} tokens`,
        };
        setCompactionHistory(updatedHistory);
        saveCompactionHistory(updatedHistory);
      }
    }
  }, [totalTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAutoCompact = useCallback((enabled: boolean) => {
    setAutoCompactEnabledState(enabled);
    try {
      localStorage.setItem(AUTO_COMPACT_KEY, JSON.stringify(enabled));
    } catch (err) {
      console.error('Error saving auto-compact setting:', err);
    }
  }, []);

  return {
    tokenUsage,
    canCompact,
    isCompacting,
    compactionHistory,
    compact,
    autoCompactEnabled,
    setAutoCompact,
  };
}
