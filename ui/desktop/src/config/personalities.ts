export interface VoiceConfig {
  rate: number;
  pitch: number;
  volume: number;
  voiceName?: string;
}

export interface Personality {
  id: string;
  name: string;
  description: string;
  icon: string;
  emoji: string;
  voice: VoiceConfig;
  voiceConfig: VoiceConfig;
}

export const DEFAULT_PERSONALITY_ID = 'default';

export const personalities: Personality[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clear and neutral assistant voice',
    icon: '🤖',
    emoji: '🤖',
    voice: { rate: 1.0, pitch: 1.0, volume: 1.0 },
    voiceConfig: { rate: 1.0, pitch: 1.0, volume: 1.0 },
  },
  {
    id: 'friendly',
    name: 'Friendly',
    description: 'Warm and approachable tone',
    icon: '😊',
    emoji: '😊',
    voice: { rate: 1.05, pitch: 1.1, volume: 1.0 },
    voiceConfig: { rate: 1.05, pitch: 1.1, volume: 1.0 },
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Crisp and business-like delivery',
    icon: '💼',
    emoji: '💼',
    voice: { rate: 0.95, pitch: 0.95, volume: 1.0 },
    voiceConfig: { rate: 0.95, pitch: 0.95, volume: 1.0 },
  },
  {
    id: 'calm',
    name: 'Calm',
    description: 'Relaxed and soothing pace',
    icon: '🧘',
    emoji: '🧘',
    voice: { rate: 0.85, pitch: 0.9, volume: 0.9 },
    voiceConfig: { rate: 0.85, pitch: 0.9, volume: 0.9 },
  },
  {
    id: 'energetic',
    name: 'Energetic',
    description: 'Upbeat and enthusiastic',
    icon: '⚡',
    emoji: '⚡',
    voice: { rate: 1.15, pitch: 1.15, volume: 1.0 },
    voiceConfig: { rate: 1.15, pitch: 1.15, volume: 1.0 },
  },
  {
    id: 'storyteller',
    name: 'Storyteller',
    description: 'Expressive and dramatic narration',
    icon: '📖',
    emoji: '📖',
    voice: { rate: 0.9, pitch: 1.05, volume: 1.0 },
    voiceConfig: { rate: 0.9, pitch: 1.05, volume: 1.0 },
  },
];

export function getPersonality(id: string): Personality {
  return personalities.find((p) => p.id === id) ?? personalities[0];
}
