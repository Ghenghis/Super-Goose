import React from 'react';
import { Check } from 'lucide-react';
import { personalities, Personality } from '../../config/personalities';
import { cn } from '../../utils';

interface PersonalitySelectorProps {
  /** Currently selected personality id. */
  selectedId: string;
  /** Called when the user picks a personality. */
  onSelect: (id: string) => void;
}

/**
 * A grid of personality cards that lets the user choose a TTS voice
 * personality for Goose's spoken responses.
 *
 * Displays the 6 safe, built-in personalities. A note at the bottom
 * hints that more personalities will be available behind a future
 * content gate.
 */
export const PersonalitySelector: React.FC<PersonalitySelectorProps> = ({
  selectedId,
  onSelect,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-text-default text-sm font-medium">Voice Personality</h3>
        <p className="text-xs text-text-muted mt-1">
          Choose how Goose sounds when speaking responses aloud
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {personalities.map((p) => (
          <PersonalityCard
            key={p.id}
            personality={p}
            isSelected={p.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <p className="text-xs text-text-muted text-center pt-2">
        More personalities coming soon.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Internal card component
// ---------------------------------------------------------------------------

interface PersonalityCardProps {
  personality: Personality;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const PersonalityCard: React.FC<PersonalityCardProps> = ({
  personality,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(personality.id)}
      className={cn(
        'relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
        'hover:bg-background-muted',
        isSelected
          ? 'border-purple-500 bg-purple-500/5'
          : 'border-border-default bg-background-default'
      )}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-white">
          <Check className="h-3 w-3" />
        </div>
      )}

      {/* Icon */}
      <span className="text-2xl leading-none" role="img" aria-label={personality.name}>
        {personality.icon}
      </span>

      {/* Name */}
      <span
        className={cn(
          'text-sm font-medium',
          isSelected ? 'text-purple-400' : 'text-text-default'
        )}
      >
        {personality.name}
      </span>

      {/* Description */}
      <span className="text-xs text-text-muted line-clamp-2">
        {personality.description}
      </span>
    </button>
  );
};
