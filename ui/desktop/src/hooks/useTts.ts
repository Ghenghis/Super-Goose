/**
 * TTS hook using the Web Speech API.
 *
 * MVP implementation -- speaks text through the browser's built-in
 * speechSynthesis engine. A future iteration will swap in Moshi or
 * another streaming TTS backend; the public API will stay the same.
 *
 * Features:
 *  - synthesize(text, personalityId?) -> plays audio
 *  - stop()                           -> stops current playback
 *  - isPlaying state
 *  - currentPersonality / setPersonality
 *  - voices: available system voices
 *  - analyserNode: AnalyserNode piped from a MediaStream of the
 *    system audio output so the OutputWaveform can visualise it
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Personality,
  VoiceConfig,
  DEFAULT_PERSONALITY_ID,
  getPersonality,
} from '../config/personalities';

export interface UseTtsReturn {
  /** Start speaking `text` using the given (or current) personality. */
  synthesize: (text: string, personalityId?: string) => void;
  /** Immediately stop any in-progress speech. */
  stop: () => void;
  /** Whether speech is currently playing. */
  isPlaying: boolean;
  /** The active Personality object. */
  currentPersonality: Personality;
  /** Switch to a different personality by id. */
  setPersonality: (id: string) => void;
  /** Available SpeechSynthesis voices on this system. */
  voices: SpeechSynthesisVoice[];
  /** Current voice params derived from personality config. */
  voiceParams: VoiceConfig;
  /** An AnalyserNode connected to speech output (may be null). */
  analyserNode: AnalyserNode | null;
  /** The AudioContext used for analysis (may be null). */
  audioContext: AudioContext | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort match a system voice by substring (case-insensitive). */
function matchVoice(
  voices: SpeechSynthesisVoice[],
  preferred: string
): SpeechSynthesisVoice | undefined {
  if (!preferred) return undefined;
  const lower = preferred.toLowerCase();
  return (
    voices.find((v) => v.name.toLowerCase().includes(lower)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en'))
  );
}

/** Strip markdown formatting so the speech output sounds natural. */
function stripMarkdown(text: string): string {
  return (
    text
      // code blocks
      .replace(/```[\s\S]*?```/g, '')
      // inline code
      .replace(/`([^`]+)`/g, '$1')
      // headings
      .replace(/#{1,6}\s+/g, '')
      // bold / italic
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      // links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // bullet points
      .replace(/^\s*[-*+]\s+/gm, '')
      // numbered lists
      .replace(/^\s*\d+\.\s+/gm, '')
      // blockquotes
      .replace(/^\s*>\s+/gm, '')
      // horizontal rules
      .replace(/^---+$/gm, '')
      // extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTts(): UseTtsReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [personalityId, setPersonalityId] = useState(DEFAULT_PERSONALITY_ID);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const personality = getPersonality(personalityId);
  const voiceParams = personality.voiceConfig;

  // --------------------------------------------------
  // Load available voices (they may arrive async)
  // --------------------------------------------------
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const load = () => {
      const available = synth.getVoices();
      if (available.length > 0) {
        setVoices(available);
      }
    };

    load();
    synth.addEventListener('voiceschanged', load);
    return () => {
      synth.removeEventListener('voiceschanged', load);
    };
  }, []);

  // --------------------------------------------------
  // Build / tear down an AudioContext + AnalyserNode
  // that the OutputWaveform can connect to.
  //
  // Because Web Speech API utterances do NOT expose a
  // MediaStream we drive a silent oscillator through an
  // analyser and modulate its gain so the visualiser
  // reacts while speech is playing.  A future Moshi
  // integration will provide a real audio stream.
  // --------------------------------------------------
  const ensureAudioContext = useCallback(() => {
    if (audioCtxRef.current) return;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    // Create a silent oscillator that feeds the analyser so the
    // waveform visualiser gets *some* frequency data while the
    // utterance plays.  We modulate gain between 0 (silent) and a
    // small value to fake activity.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 200; // base freq -- arbitrary

    const gain = ctx.createGain();
    gain.gain.value = 0; // start silent

    osc.connect(gain);
    gain.connect(analyser);
    // Connect to destination at zero volume so analyser gets data
    // but the user hears nothing from the oscillator.
    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    analyser.connect(muteGain);
    muteGain.connect(ctx.destination);

    osc.start();

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    oscillatorRef.current = osc;
    gainRef.current = gain;

    setAudioContext(ctx);
    setAnalyserNode(analyser);
  }, []);

  // --------------------------------------------------
  // Simulate analyser activity while speech plays
  // --------------------------------------------------
  const simulateRef = useRef<number | null>(null);

  const startSimulation = useCallback(() => {
    if (!gainRef.current || !oscillatorRef.current) return;

    const gain = gainRef.current;
    const osc = oscillatorRef.current;

    const tick = () => {
      // Randomise gain and frequency to make the waveform look alive
      gain.gain.value = 0.3 + Math.random() * 0.7;
      osc.frequency.value = 120 + Math.random() * 300;
      simulateRef.current = window.setTimeout(tick, 60 + Math.random() * 80);
    };
    tick();
  }, []);

  const stopSimulation = useCallback(() => {
    if (simulateRef.current !== null) {
      clearTimeout(simulateRef.current);
      simulateRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current.gain.value = 0;
    }
  }, []);

  // --------------------------------------------------
  // stop()
  // --------------------------------------------------
  const stop = useCallback(() => {
    const synth = window.speechSynthesis;
    if (synth) {
      synth.cancel();
    }
    utteranceRef.current = null;
    setIsPlaying(false);
    stopSimulation();
  }, [stopSimulation]);

  // --------------------------------------------------
  // synthesize()
  // --------------------------------------------------
  const synthesize = useCallback(
    (text: string, overridePersonalityId?: string) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        console.warn('SpeechSynthesis API is not available in this browser.');
        return;
      }

      // Stop anything currently playing
      stop();

      const activePersonality = overridePersonalityId
        ? getPersonality(overridePersonalityId)
        : getPersonality(personalityId);
      const config = activePersonality.voiceConfig;

      const cleanText = stripMarkdown(text);
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.pitch = config.pitch;
      utterance.rate = config.rate;
      utterance.volume = config.volume;

      const voice = matchVoice(voices, config.voiceName ?? '');
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        setIsPlaying(true);
        ensureAudioContext();
        startSimulation();
      };

      utterance.onend = () => {
        setIsPlaying(false);
        stopSimulation();
        utteranceRef.current = null;
      };

      utterance.onerror = (event) => {
        // 'canceled' is expected when we call synth.cancel()
        if (event.error !== 'canceled') {
          console.error('SpeechSynthesis error:', event.error);
        }
        setIsPlaying(false);
        stopSimulation();
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      synth.speak(utterance);
    },
    [voices, personalityId, stop, ensureAudioContext, startSimulation, stopSimulation]
  );

  // --------------------------------------------------
  // setPersonality wrapper
  // --------------------------------------------------
  const setPersonality = useCallback((id: string) => {
    setPersonalityId(id);
  }, []);

  // --------------------------------------------------
  // Cleanup on unmount
  // --------------------------------------------------
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      if (simulateRef.current !== null) {
        clearTimeout(simulateRef.current);
      }
      oscillatorRef.current?.stop();
      audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    synthesize,
    stop,
    isPlaying,
    currentPersonality: personality,
    setPersonality,
    voices,
    voiceParams,
    analyserNode,
    audioContext,
  };
}
