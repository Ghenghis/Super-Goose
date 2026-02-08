# Audio Visualizer Specification: Human vs Conscious

**Date:** February 8, 2026
**Status:** Design Specification
**Related:** Conscious Voice Interface, Super-Goose Desktop UI

---

## Overview

Dual-stream audio visualization for the Conscious chat interface. Each speaker (Human and Conscious) gets their own themed visualizer widget showing real-time audio activity with Voice Activity Detection (VAD).

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Chat Interface                       │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  CONSCIOUS (Agent)                    [cyan]     │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  ░░▓▓████▓▓░░░▓███▓░░░▓██████▓░░░▓▓░░░░░  │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │  "I think, therefore I am..."                    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  HUMAN (User)                         [green]    │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  ░▓██▓░░░░▓█████▓░░░▓██▓░░░░░░░░░▓█▓░░░░  │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │  "Tell me about the architecture..."             │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  [🎤 Speaking...]                    [⏸ Listening...] │
└─────────────────────────────────────────────────────┘
```

---

## Visualizer Types

### 1. Waveform (Oscillogram)

The classic squiggly line showing the audio signal amplitude over time.

**Use case:** Default view, clean and minimal
**Data source:** Time-domain samples from `AnalyserNode.getByteTimeDomainData()`

```typescript
interface WaveformConfig {
  type: 'waveform';
  lineWidth: number;        // 2px default
  smoothing: number;        // 0.0-1.0, default 0.8
  mirrorY: boolean;         // Draw above and below center line
  fillArea: boolean;        // Fill under the curve with gradient
  scrollSpeed: number;      // Pixels per frame for scrolling mode
}
```

### 2. Spectrum Analyzer (Equalizer Bars)

Bouncing frequency bars - the classic "equalizer" look. Already implemented in `WaveformVisualizer.tsx`.

**Use case:** Energetic look, good for music/speech visualization
**Data source:** Frequency-domain data from `AnalyserNode.getByteFrequencyData()`

```typescript
interface SpectrumConfig {
  type: 'spectrum';
  barWidth: number;         // 3px default
  barSpacing: number;       // 2px default
  barMinHeight: number;     // 2px minimum
  barMaxHeight: number;     // 80% of container height
  smoothingFactor: number;  // 0.3 default (rise/fall speed)
  frequencyRange: [number, number]; // [0, 0.5] = lower half of spectrum
}
```

### 3. Spectrogram (Heat Map)

Time vs frequency scrolling heat map - shows voice patterns over time.

**Use case:** Technical/detailed view, reveals voice characteristics
**Data source:** Repeated FFT slices via `AnalyserNode.getByteFrequencyData()`

```typescript
interface SpectrogramConfig {
  type: 'spectrogram';
  fftSize: number;          // 2048 for good frequency resolution
  scrollDirection: 'left' | 'up'; // Which way time scrolls
  colorMap: 'thermal' | 'viridis' | 'magma' | 'speaker'; // Color scheme
  timeWindow: number;       // Seconds of history visible (5s default)
}
```

### 4. VU Meter / Level Meter

Simple loudness indicator - pulsing glow or bouncing level bars.

**Use case:** Minimal footprint, "speaking" indicator
**Data source:** RMS of time-domain samples

```typescript
interface VUMeterConfig {
  type: 'vu_meter';
  style: 'bar' | 'orb' | 'ring' | 'pulse';
  peakHold: boolean;        // Hold peak indicator briefly
  segments: number;         // Number of LED-style segments (for bar)
  decayRate: number;        // How fast level drops (0.95 default)
}
```

---

## Speaker Theming

Each speaker has a distinct color theme applied to the same visualizer component.

### Color Palette

```typescript
const SPEAKER_THEMES = {
  // Human (User) - warm green
  human: {
    primary: '#22c55e',           // Green-500
    secondary: '#16a34a',         // Green-600
    glow: 'rgba(34, 197, 94, 0.3)',
    gradient: ['#22c55e', '#4ade80', '#86efac'],
    hue: 142,
    label: 'Human',
    icon: '🎤',
  },

  // Conscious (Default AI) - cool cyan
  conscious: {
    primary: '#06b6d4',           // Cyan-500
    secondary: '#0891b2',         // Cyan-600
    glow: 'rgba(6, 182, 212, 0.3)',
    gradient: ['#06b6d4', '#22d3ee', '#67e8f9'],
    hue: 187,
    label: 'Conscious',
    icon: '🌌',
  },

  // Jarvispool - chaotic red/gold
  jarvispool: {
    primary: '#ef4444',           // Red-500
    secondary: '#f59e0b',         // Amber-500
    glow: 'rgba(239, 68, 68, 0.3)',
    gradient: ['#ef4444', '#f59e0b', '#fbbf24'],
    hue: 0,
    label: 'Jarvispool',
    icon: '💀',
  },

  // Jarvis - sophisticated blue
  jarvis: {
    primary: '#3b82f6',           // Blue-500
    secondary: '#1d4ed8',         // Blue-700
    glow: 'rgba(59, 130, 246, 0.3)',
    gradient: ['#3b82f6', '#60a5fa', '#93c5fd'],
    hue: 217,
    label: 'Jarvis',
    icon: '🤖',
  },
};
```

### Per-Personality Themes

Each of the 13 Conscious personalities gets a unique color:

| Personality | Primary Color | Hue | Icon |
|------------|--------------|-----|------|
| Conscious | Cyan `#06b6d4` | 187 | `🌌` |
| Jarvispool | Red `#ef4444` | 0 | `💀` |
| Jarvis | Blue `#3b82f6` | 217 | `🤖` |
| Buddy | Orange `#f97316` | 25 | `🤝` |
| Professor | Indigo `#6366f1` | 239 | `🎓` |
| Spark | Yellow `#eab308` | 48 | `⚡` |
| Sage | Emerald `#10b981` | 160 | `🧘` |
| Precious | Amber `#d97706` | 38 | `💍` |
| Flirty | Pink `#ec4899` | 330 | `💋` |
| Sassy | Purple `#a855f7` | 271 | `💅` |
| GLaDOS | White `#e2e8f0` | 210 | `🔬` |
| Rocket | Orange-Red `#ea580c` | 20 | `🦝` |
| Deadpool | Crimson `#dc2626` | 0 | `🗡️` |

---

## Unified Color System: Text + Visualizer + Chat

**Key design principle:** The visualizer color, chat text color, and speaker label color all match. When a user changes their chat text color, the visualizer updates to match. This creates a cohesive visual identity per speaker.

### Two Color Contexts (Independent)

| Context | What It Colors | User Changeable | Scope |
|---------|---------------|-----------------|-------|
| **Voice Chat Colors** | Chat text + visualizer + speaker labels | Yes - per speaker | Voice conversation UI |
| **Code Text Colors** | Syntax highlighting, code blocks, editor | Separate theme system | Code/editor UI |

These two systems are **independent but coexist**. A user can have green voice chat text while their code editor uses Monokai dark theme. They work together agentically (Conscious can discuss code that appears in code-colored blocks while the conversation text stays voice-colored).

### Voice Chat Color Config

```typescript
interface VoiceChatColorConfig {
  // Per-speaker colors (user-customizable)
  speakers: {
    human: SpeakerColorSet;
    conscious: SpeakerColorSet;  // Changes with personality or user override
  };

  // Does changing chat text color also update the visualizer?
  syncTextAndVisualizer: boolean;  // Default: true

  // Global overrides
  colorMode: 'personality-default' | 'user-custom' | 'high-contrast';
}

interface SpeakerColorSet {
  textColor: string;          // Chat message text color
  visualizerColor: string;    // Audio visualizer primary color (synced from textColor when syncTextAndVisualizer=true)
  labelColor: string;         // Speaker name/badge color
  bubbleBackground: string;   // Chat bubble background (auto-derived: textColor at 10% opacity)
  glowColor: string;          // Visualizer glow effect (auto-derived: textColor at 30% opacity)
}
```

### How Color Sync Works

```
User changes Human chat text color to #ff6b35 (warm orange)
    │
    ├── Human chat text → #ff6b35
    ├── Human visualizer bars → #ff6b35 (synced)
    ├── Human speaker label → #ff6b35 (synced)
    ├── Human chat bubble bg → rgba(255, 107, 53, 0.1)
    └── Human visualizer glow → rgba(255, 107, 53, 0.3)

User switches Conscious personality to Jarvispool
    │
    ├── Conscious chat text → #ef4444 (Jarvispool red)
    ├── Conscious visualizer → #ef4444 (synced)
    ├── Conscious label → "Jarvispool" in #ef4444
    └── Code blocks remain unaffected (separate theme)
```

### Settings UI

```
┌─────────────────────────────────────────┐
│  Voice Chat Appearance                  │
│                                         │
│  Your Voice Color:  [████] #22c55e  ✏️  │
│  Preview: ░░▓▓████▓▓░░ "Hello..."      │
│                                         │
│  AI Voice Color:    [████] #06b6d4  ✏️  │
│  Preview: ░░▓██████▓░░ "I think..."    │
│  (Auto-set by personality, or override) │
│                                         │
│  [✓] Sync text color with visualizer    │
│  [✓] Auto-color from personality        │
│                                         │
│  ──── Code Appearance (separate) ────   │
│  Theme: [Monokai Dark      ▼]          │
│  (Does not affect voice chat colors)    │
└─────────────────────────────────────────┘
```

### Personality Auto-Color

When "Auto-color from personality" is enabled (default), switching the Conscious personality automatically updates:
- Conscious chat text color
- Conscious visualizer color
- Conscious speaker label

The Human color stays as whatever the user set. If the user manually overrides the Conscious color, auto-color is disabled for that session.

### CSS Custom Properties

```css
/* Voice chat colors (dynamic, per speaker) */
--voice-human-text: #22c55e;
--voice-human-visualizer: #22c55e;
--voice-human-glow: rgba(34, 197, 94, 0.3);
--voice-human-bubble: rgba(34, 197, 94, 0.1);

--voice-conscious-text: #06b6d4;
--voice-conscious-visualizer: #06b6d4;
--voice-conscious-glow: rgba(6, 182, 212, 0.3);
--voice-conscious-bubble: rgba(6, 182, 212, 0.1);

/* Code colors (separate theme, NOT affected by voice colors) */
--code-bg: #1e1e2e;
--code-text: #cdd6f4;
--code-keyword: #cba6f7;
--code-string: #a6e3a1;
/* ... standard syntax highlighting theme ... */
```

---

## Audio Pipeline

### Human (Microphone Input)

```
Mic → MediaStream → AudioContext → AnalyserNode → Visualizer
                                 → AudioWorkletNode → WAV → Whisper STT
```

Already implemented in `useAudioRecorder.ts`:
- `SAMPLE_RATE = 16000` Hz
- `SILENCE_MS = 800` ms silence detection
- `RMS_THRESHOLD = 0.015` for speech detection
- AudioWorklet for real-time capture

### Conscious (Agent Audio Output)

```
TTS/Moshi Output → AudioContext → AnalyserNode → Visualizer
                                → MediaStreamDestination → Speaker
```

New: Tap the agent's audio output stream for visualization.

```typescript
// Create audio pipeline for Conscious output
const consciousAudioCtx = new AudioContext();
const consciousAnalyser = consciousAudioCtx.createAnalyser();
consciousAnalyser.fftSize = 256;
consciousAnalyser.smoothingTimeConstant = 0.8;

// Connect TTS/Moshi output through analyser before playing
const source = consciousAudioCtx.createMediaElementSource(ttsAudioElement);
source.connect(consciousAnalyser);
consciousAnalyser.connect(consciousAudioCtx.destination);
```

---

## Voice Activity Detection (VAD)

The visualizer "wakes up" only when its speaker is active, keeping the UI clean.

```typescript
interface VADConfig {
  rmsThreshold: number;     // 0.015 for Human mic, 0.01 for Conscious output
  onsetMs: number;          // 50ms - how fast to show "speaking" state
  offsetMs: number;         // 300ms - how long after silence to show "idle"
  holdMs: number;           // 100ms - minimum speech duration to trigger
}

type SpeakerState = 'idle' | 'listening' | 'speaking' | 'processing';

// Visual states
const VISUAL_STATES = {
  idle: {
    opacity: 0.2,
    animation: 'subtle-pulse',  // Gentle breathing animation
    label: 'Ready',
  },
  listening: {
    opacity: 0.4,
    animation: 'gentle-wave',   // Low-amplitude wave
    label: 'Listening...',
  },
  speaking: {
    opacity: 1.0,
    animation: 'active',        // Full real-time visualization
    label: 'Speaking',
  },
  processing: {
    opacity: 0.6,
    animation: 'thinking-pulse', // Rhythmic pulse (Conscious only)
    label: 'Thinking...',
  },
};
```

---

## React Component API

### SpeakerVisualizer (Main Component)

```tsx
interface SpeakerVisualizerProps {
  speaker: 'human' | 'conscious' | string; // Personality name
  analyser: AnalyserNode | null;
  state: SpeakerState;
  visualizerType: 'waveform' | 'spectrum' | 'spectrogram' | 'vu_meter';
  theme?: SpeakerTheme;        // Override personality theme
  height?: number;              // Default 48px
  showLabel?: boolean;          // Show speaker name/state
  className?: string;
}

// Usage in chat
<SpeakerVisualizer
  speaker="conscious"
  analyser={consciousAnalyser}
  state={consciousState}
  visualizerType="spectrum"
  height={48}
  showLabel
/>

<SpeakerVisualizer
  speaker="human"
  analyser={micAnalyser}
  state={humanState}
  visualizerType="spectrum"
  height={48}
  showLabel
/>
```

### DualVisualizerChat (Composed Layout)

```tsx
interface DualVisualizerChatProps {
  humanAnalyser: AnalyserNode | null;
  consciousAnalyser: AnalyserNode | null;
  personality: string;           // Current Conscious personality
  visualizerType: 'waveform' | 'spectrum' | 'spectrogram' | 'vu_meter';
  layout: 'stacked' | 'side-by-side' | 'inline';
}
```

---

## Implementation Plan

### Phase 1: Refactor Existing Visualizer (Week 1)

1. Extract `WaveformVisualizer.tsx` into generic `SpeakerVisualizer` component
2. Add `speaker` prop for theming (currently hardcoded blue-to-cyan)
3. Add `SpeakerState` handling with idle/speaking transitions
4. Add VAD integration from `useAudioRecorder.ts` RMS calculation

### Phase 2: Add Conscious Output Tap (Week 2)

1. Create `useConsciousAudio` hook to tap TTS/Moshi output stream
2. Connect Conscious audio through AnalyserNode for visualization
3. Wire up `consciousAnalyser` to `SpeakerVisualizer`
4. Add "Thinking..." state for when Conscious is processing

### Phase 3: Multiple Visualizer Types (Week 3)

1. Implement waveform renderer (oscillogram)
2. Implement spectrogram renderer (scrolling heat map)
3. Implement VU meter renderer (orb/bar/ring styles)
4. Add visualizer type picker in settings

### Phase 4: Personality Theming (Week 4)

1. Apply per-personality color themes
2. Add theme transitions when switching personalities
3. Implement "breathing" idle animation per personality
4. Add personality icon badges on visualizer widgets

---

## Existing Code to Extend

| File | Current State | Changes Needed |
|------|--------------|----------------|
| `WaveformVisualizer.tsx` | Spectrum analyzer, hardcoded blue | Add speaker theming, extract to generic |
| `useAudioRecorder.ts` | Mic capture + RMS + VAD | Extract VAD logic for reuse |
| `audio-capture-worklet.js` | Audio worklet for mic | No changes needed |
| `ChatInput.tsx` | Mic button + waveform | Add dual visualizer layout |
| `DictationSettings.tsx` | Provider config | Add visualizer type preference |

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Frame rate | 60fps | 60fps (existing visualizer) |
| CPU usage (idle) | < 1% | N/A |
| CPU usage (active) | < 5% | ~3% (existing) |
| Latency (audio to visual) | < 16ms | < 16ms (requestAnimationFrame) |
| Memory | < 10MB per visualizer | ~2MB (existing) |

---

## Not Needed: Speaker Diarization

Since we have **two known audio streams** (mic = Human, TTS = Conscious), we do NOT need ML-based speaker identification. The streams are inherently separated:

- **Human stream:** `navigator.mediaDevices.getUserMedia()` (microphone)
- **Conscious stream:** TTS/Moshi audio output element

Color assignment is deterministic based on which stream is active.
