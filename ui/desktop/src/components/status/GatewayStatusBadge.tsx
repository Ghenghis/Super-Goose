import { useState, useEffect, useCallback } from 'react';
import { Link2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { View } from '../../utils/navigationUtils';

type GatewayState = 'connected' | 'disconnected' | 'not_configured';

interface GatewayStatusBadgeProps {
  setView: (view: View) => void;
}

export function GatewayStatusBadge({ setView }: GatewayStatusBadgeProps) {
  const [gatewayState, setGatewayState] = useState<GatewayState>('not_configured');
  const [isAvailable, setIsAvailable] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/enterprise/gateway/status');
      if (response.ok) {
        const data = await response.json();
        const state = data.state ?? data.status ?? 'not_configured';
        if (state === 'connected' || state === 'disconnected' || state === 'not_configured') {
          setGatewayState(state as GatewayState);
        } else {
          setGatewayState('not_configured');
        }
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

  const getStatusColor = (): string => {
    switch (gatewayState) {
      case 'connected':
        return 'text-green-500';
      case 'disconnected':
        return 'text-red-500';
      case 'not_configured':
      default:
        return 'text-text-default/40';
    }
  };

  const getTooltipText = (): string => {
    switch (gatewayState) {
      case 'connected':
        return 'MCP Gateway: Connected';
      case 'disconnected':
        return 'MCP Gateway: Disconnected';
      case 'not_configured':
      default:
        return 'MCP Gateway: Not configured';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setView('settings')}
          className={`flex items-center cursor-pointer [&_svg]:size-4 hover:text-text-default text-xs transition-colors ${getStatusColor()}`}
          title="Gateway status"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{getTooltipText()}</TooltipContent>
    </Tooltip>
  );
}
