import { useState, useEffect, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { View } from '../../utils/navigationUtils';

interface GuardrailsStatus {
  active: number;
  total: number;
  status: 'pass' | 'warn' | 'blocked';
}

interface GuardrailsStatusBadgeProps {
  setView: (view: View) => void;
}

export function GuardrailsStatusBadge({ setView }: GuardrailsStatusBadgeProps) {
  const [status, setStatus] = useState<GuardrailsStatus | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/enterprise/guardrails/status');
      if (response.ok) {
        const data = await response.json();
        setStatus({
          active: data.active ?? 0,
          total: data.total ?? 6,
          status: data.status ?? 'pass',
        });
        setIsAvailable(true);
      } else {
        setIsAvailable(false);
        setStatus(null);
      }
    } catch {
      // Endpoint not available yet - show fallback
      setIsAvailable(false);
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const getStatusColor = (): string => {
    if (!isAvailable || !status) {
      return 'text-text-default/40';
    }
    switch (status.status) {
      case 'pass':
        return 'text-green-500';
      case 'warn':
        return 'text-yellow-500';
      case 'blocked':
        return 'text-red-500';
      default:
        return 'text-text-default/40';
    }
  };

  const getTooltipText = (): string => {
    if (!isAvailable || !status) {
      return 'Guardrails';
    }
    return `Guardrails: ${status.active}/${status.total} active`;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setView('settings')}
          className={`flex items-center cursor-pointer [&_svg]:size-4 hover:text-text-default text-xs transition-colors ${getStatusColor()}`}
          title="Guardrails status"
        >
          <Shield className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{getTooltipText()}</TooltipContent>
    </Tooltip>
  );
}
