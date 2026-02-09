import { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Goose } from './icons/Goose';
import { Check } from 'lucide-react';
import { cn } from '../utils';
import FeatureHighlights from './onboarding/FeatureHighlights';

const WELCOMED_KEY = 'super-goose-welcomed';
const PERSONALITY_KEY = 'super-goose-personality';

export interface Personality {
  id: string;
  emoji: string;
  name: string;
  description: string;
}

const personalities: Personality[] = [
  {
    id: 'conscious',
    emoji: '\uD83E\uDDE0',
    name: 'Conscious',
    description: 'Thoughtful and deliberate responses',
  },
  {
    id: 'jarvis',
    emoji: '\uD83E\uDD16',
    name: 'Jarvis',
    description: 'Efficient and technically precise',
  },
  {
    id: 'buddy',
    emoji: '\uD83D\uDC4B',
    name: 'Buddy',
    description: 'Friendly and approachable helper',
  },
  {
    id: 'professor',
    emoji: '\uD83C\uDF93',
    name: 'Professor',
    description: 'Detailed explanations and teaching',
  },
  {
    id: 'spark',
    emoji: '\u26A1',
    name: 'Spark',
    description: 'Creative and energetic assistant',
  },
  {
    id: 'sage',
    emoji: '\uD83E\uDDD9',
    name: 'Sage',
    description: 'Calm wisdom and deep insight',
  },
];

function PersonalityCard({
  personality,
  isSelected,
  onSelect,
}: {
  personality: Personality;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all cursor-pointer',
        'hover:bg-background-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border-background-accent bg-background-accent/5 ring-1 ring-background-accent'
          : 'border-border-default bg-background-default'
      )}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 rounded-full bg-background-accent p-0.5">
          <Check className="size-3 text-text-on-accent" />
        </div>
      )}
      <span className="text-2xl" role="img" aria-label={personality.name}>
        {personality.emoji}
      </span>
      <div>
        <p className="text-sm font-medium text-text-default">{personality.name}</p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{personality.description}</p>
      </div>
    </button>
  );
}

export function isFirstLaunch(): boolean {
  return localStorage.getItem(WELCOMED_KEY) !== 'true';
}

export function getSelectedPersonality(): string {
  return localStorage.getItem(PERSONALITY_KEY) || 'conscious';
}

interface WelcomeScreenProps {
  onComplete: () => void;
}

export default function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [selectedPersonality, setSelectedPersonality] = useState<string>('conscious');

  const handleGetStarted = useCallback(() => {
    localStorage.setItem(WELCOMED_KEY, 'true');
    localStorage.setItem(PERSONALITY_KEY, selectedPersonality);
    onComplete();
  }, [selectedPersonality, onComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(WELCOMED_KEY, 'true');
    localStorage.setItem(PERSONALITY_KEY, 'conscious');
    onComplete();
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-sm">
      <Card className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[90vh] bg-background-default rounded-xl shadow-xl overflow-hidden flex flex-col p-0">
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-8 pt-8 pb-6 space-y-6">
            {/* Header */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <Goose className="size-12 text-text-default" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-text-default">
                  Welcome to Super-Goose v1.24.2
                </h1>
                <p className="text-sm text-text-muted mt-1">
                  Your AI-powered development companion
                </p>
              </div>
            </div>

            {/* Personality Selection */}
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-medium text-text-default">Choose your personality</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Select how your assistant communicates. You can change this later in settings.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {personalities.map((personality) => (
                  <PersonalityCard
                    key={personality.id}
                    personality={personality}
                    isSelected={selectedPersonality === personality.id}
                    onSelect={() => setSelectedPersonality(personality.id)}
                  />
                ))}
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-text-default">{"What's new"}</h2>
              <FeatureHighlights />
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border-default px-8 py-4 flex items-center justify-between bg-background-default">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-text-muted hover:text-text-default"
          >
            Skip
          </Button>
          <Button variant="default" onClick={handleGetStarted}>
            Get Started
          </Button>
        </div>
      </Card>
    </div>
  );
}
