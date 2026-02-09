import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '../../utils';

interface VoiceToggleProps {
  /** Whether voice output (auto-speak) is enabled. */
  enabled: boolean;
  /** Toggle voice output on or off. */
  onToggle: () => void;
  /** Display name of the active personality. */
  personalityName: string;
  /** Whether TTS is currently speaking. */
  isPlaying: boolean;
}

/**
 * A compact toggle button for the chat area bottom bar.
 *
 * When enabled the AI responses are automatically spoken aloud
 * using the currently selected personality voice.
 */
export const VoiceToggle: React.FC<VoiceToggleProps> = ({
  enabled,
  onToggle,
  personalityName,
  isPlaying,
}) => {
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={enabled ? `Voice: ${personalityName} (click to disable)` : 'Enable voice output'}
      className={cn(
        'flex items-center cursor-pointer [&_svg]:size-4 text-xs transition-colors',
        'hover:text-text-default',
        enabled
          ? 'text-text-default/90 hover:text-text-default'
          : 'text-text-default/70 hover:text-text-default'
      )}
    >
      <Icon
        className={cn(
          'mr-1 h-4 w-4',
          isPlaying && 'animate-pulse text-purple-400'
        )}
      />
      {enabled ? personalityName.toLowerCase() : 'voice'}
    </button>
  );
};
