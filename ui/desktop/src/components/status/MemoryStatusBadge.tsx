import { useState, useEffect, useCallback } from 'react';
import { Brain } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { View } from '../../utils/navigationUtils';

interface MemoryStatusBadgeProps {
  setView: (view: View) => void;
}

export function MemoryStatusBadge({ setView }: MemoryStatusBadgeProps) {
  const [itemCount, setItemCount] = useState<number>(0);
  const [isAvailable, setIsAvailable] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/enterprise/memory/status');
      if (response.ok) {
        const data = await response.json();
        setItemCount(data.count ?? data.items ?? 0);
        setIsAvailable(true);
      } else {
        setIsAvailable(false);
      }
    } catch {
      setIsAvailable(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!isAvailable) {
    return null;
  }

  const getTooltipText = (): string => {
    return `Memory: ${itemCount} item${itemCount !== 1 ? 's' : ''} stored`;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setView('settings')}
          className="flex items-center cursor-pointer [&_svg]:size-4 text-text-default/70 hover:text-text-default text-xs transition-colors"
          title="Memory status"
        >
          <Brain className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{getTooltipText()}</TooltipContent>
    </Tooltip>
  );
}
