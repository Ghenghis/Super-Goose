import { useState, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { View } from '../../utils/navigationUtils';

interface VoiceStatusBadgeProps {
  setView: (view: View) => void;
}

export function VoiceStatusBadge({ setView }: VoiceStatusBadgeProps) {
  const [isActive, setIsActive] = useState(false);
  const [personalityName, setPersonalityName] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/enterprise/voice/status');
      if (response.ok) {
        const data = await response.json();
        setIsActive(data.active ?? false);
        setPersonalityName(data.personality ?? data.name ?? null);
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
    if (isActive && personalityName) {
      return `Voice: ${personalityName}`;
    }
    return isActive ? 'Voice: Active' : 'Voice: Off';
  };

  const getDisplayText = (): string | null => {
    if (isActive && personalityName) {
      return personalityName;
    }
    if (isActive) {
      return 'On';
    }
    return 'Off';
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setView('settings')}
          className={`flex items-center gap-0.5 cursor-pointer [&_svg]:size-4 hover:text-text-default text-xs transition-colors ${
            isActive ? 'text-green-500' : 'text-text-default/70'
          }`}
          title="Voice status"
        >
          <Mic className="h-3.5 w-3.5" />
          <span className="text-[10px] max-w-[48px] truncate">{getDisplayText()}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{getTooltipText()}</TooltipContent>
    </Tooltip>
  );
}
