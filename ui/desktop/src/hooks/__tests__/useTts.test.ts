import { renderHook, act } from '@testing-library/react';

// Mock the personalities module
vi.mock('../../config/personalities', () => ({
  DEFAULT_PERSONALITY_ID: 'default',
  getPersonality: (id: string) => ({
    id,
    name: id === 'default' ? 'Default' : 'Custom',
    description: 'Test personality',
    icon: '🤖',
    emoji: '🤖',
    voice: { rate: 1.0, pitch: 1.0, volume: 1.0 },
    voiceConfig: { rate: 1.0, pitch: 1.0, volume: 1.0, voiceName: '' },
  }),
  personalities: [
    {
      id: 'default',
      name: 'Default',
      description: 'Test',
      icon: '🤖',
      emoji: '🤖',
      voice: { rate: 1.0, pitch: 1.0, volume: 1.0 },
      voiceConfig: { rate: 1.0, pitch: 1.0, volume: 1.0 },
    },
  ],
}));

// Mock SpeechSynthesis API
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
const mockGetVoices = vi.fn(() => []);

Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: mockGetVoices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
});

// Mock SpeechSynthesisUtterance
(globalThis as any).SpeechSynthesisUtterance = class {
  text = '';
  pitch = 1;
  rate = 1;
  volume = 1;
  voice: any = null;
  onstart: any = null;
  onend: any = null;
  onerror: any = null;
  constructor(text: string) {
    this.text = text;
  }
};

// Mock AudioContext
(globalThis as any).AudioContext = class {
  createAnalyser() {
    return { fftSize: 0, smoothingTimeConstant: 0, connect: vi.fn() };
  }
  createOscillator() {
    return { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
  createGain() {
    return { gain: { value: 0 }, connect: vi.fn() };
  }
  close = vi.fn();
  get destination() { return {}; }
};

import { useTts } from '../useTts';

describe('useTts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useTts());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentPersonality.id).toBe('default');
    expect(result.current.voices).toEqual([]);
  });

  it('returns synthesize and stop functions', () => {
    const { result } = renderHook(() => useTts());
    expect(typeof result.current.synthesize).toBe('function');
    expect(typeof result.current.stop).toBe('function');
  });

  it('synthesize calls speechSynthesis.speak', () => {
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.synthesize('Hello world');
    });
    expect(mockSpeak).toHaveBeenCalled();
  });

  it('stop calls speechSynthesis.cancel', () => {
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.stop();
    });
    expect(mockCancel).toHaveBeenCalled();
  });

  it('setPersonality changes the active personality', () => {
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.setPersonality('friendly');
    });
    expect(result.current.currentPersonality.id).toBe('friendly');
  });

  it('strips markdown from text before speaking', () => {
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.synthesize('**bold text**');
    });
    expect(mockSpeak).toHaveBeenCalled();
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe('bold text');
  });

  it('does not speak empty text after stripping', () => {
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.synthesize('```\ncode block\n```');
    });
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('voiceParams reflect the current personality config', () => {
    const { result } = renderHook(() => useTts());
    expect(result.current.voiceParams.rate).toBe(1.0);
    expect(result.current.voiceParams.pitch).toBe(1.0);
    expect(result.current.voiceParams.volume).toBe(1.0);
  });
});
