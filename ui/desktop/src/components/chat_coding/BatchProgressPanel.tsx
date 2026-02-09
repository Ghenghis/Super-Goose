/**
 * BatchProgressPanel - A panel that wraps BatchProgress for use in chat context.
 * Receives tool call notifications and converts them into batch progress items.
 */
import { memo, useMemo } from 'react';
import BatchProgress from './BatchProgress';
import type { BatchItem } from './BatchProgress';

export interface BatchProgressPanelProps {
  /** Map of tool request IDs to their status */
  toolStatuses: Map<string, { label: string; status: 'pending' | 'processing' | 'completed' | 'error'; result?: string }>;
  title?: string;
  className?: string;
}

const BatchProgressPanel = memo(function BatchProgressPanel({
  toolStatuses,
  title = 'Tool Execution Progress',
  className,
}: BatchProgressPanelProps) {
  const items = useMemo<BatchItem[]>(() => {
    const result: BatchItem[] = [];
    toolStatuses.forEach((value, id) => {
      result.push({
        id,
        label: value.label,
        status: value.status,
        result: value.result,
      });
    });
    return result;
  }, [toolStatuses]);

  if (items.length === 0) return null;

  return <BatchProgress items={items} title={title} className={className} />;
});

export default BatchProgressPanel;
