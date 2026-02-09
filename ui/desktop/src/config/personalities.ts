/**
 * Voice personality definitions for TTS output.
 *
 * Each personality maps to a Web Speech API voice configuration.
 * The voiceName field is a preferred system voice substring match;
 * the TTS hook falls back to the default voice when no match is found.
 */

export interface VoiceConfig {
  /** Pitch multiplier (0.1 - 2, default 1) */
  pitch: number;
  /** Rate multiplier (0.1 - 10, default 1) */
  rate: number;
  /** Volume (0 - 1, default 1) */
  volume: number;
  /** Preferred system voice name substring (case-insensitive match) */
  voiceName: string;
}

export interface Personality {
  id: string;
  name: string;
  description: string;
  icon: string;
  voiceConfig: VoiceConfig;
}

export const DEFAULT_PERSONALITY_ID = 'conscious';

export const personalities: Personality[] = [
  {
    id: 'conscious',
    name: 'Conscious',
    description: 'Calm, thoughtful, and self-aware. The default Goose voice.',
    icon: '\u{1F9E0}', // brain emoji
    voiceConfig: {
      pitch: 1.0,
      rate: 0.95,
      volume: 1.0,
      voiceName: 'Google UK English Female',
    },
  },
  {
    id: 'jarvis',
    name: 'Jarvis',
    description: 'Precise, efficient, and confident. Your AI butler.',
    icon: '\u{1F916}', // robot emoji
    voiceConfig: {
      pitch: 0.85,
      rate: 1.0,
      volume: 1.0,
      voiceName: 'Google UK English Male',
    },
  },
  {
    id: 'buddy',
    name: 'Buddy',
    description: 'Friendly, upbeat, and encouraging. A supportive companion.',
    icon: '\u{1F44B}', // waving hand emoji
    voiceConfig: {
      pitch: 1.15,
      rate: 1.05,
      volume: 1.0,
      voiceName: 'Google US English',
    },
  },
  {
    id: 'professor',
    name: 'Professor',
    description: 'Measured, articulate, and thorough. Explains with depth.',
    icon: '\u{1F393}', // graduation cap emoji
    voiceConfig: {
      pitch: 0.9,
      rate: 0.85,
      volume: 0.95,
      voiceName: 'Daniel',
    },
  },
  {
    id: 'spark',
    name: 'Spark',
    description: 'Quick, witty, and energetic. Gets straight to the point.',
    icon: '\u{26A1}', // lightning emoji
    voiceConfig: {
      pitch: 1.1,
      rate: 1.2,
      volume: 1.0,
      voiceName: 'Samantha',
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Wise, patient, and reflective. Speaks with gravitas.',
    icon: '\u{1F33F}', // herb emoji
    voiceConfig: {
      pitch: 0.75,
      rate: 0.8,
      volume: 0.9,
      voiceName: 'Alex',
    },
  },
];

/** Look up a personality by id, falling back to the default. */
export function getPersonality(id: string): Personality {
  return personalities.find((p) => p.id === id) ?? personalities[0];
}
