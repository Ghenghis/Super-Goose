/**
 * AudioPlayer - Compact audio player for voice messages or TTS output
 *
 * Features:
 * - Play/pause button
 * - Progress bar with seek
 * - Duration display (elapsed / total)
 * - Playback speed control (0.5x, 1x, 1.5x, 2x)
 * - Volume slider
 * - Waveform visualization (simple canvas bars)
 */
import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Gauge,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioPlayerProps {
  /** Audio source URL or data URI. */
  src: string;
  /** Known duration in seconds (optional, will be read from audio element). */
  duration?: number;
  /** Additional CSS classes. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
const WAVEFORM_BAR_COUNT = 40;
const WAVEFORM_HEIGHT = 32;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as "m:ss". */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate deterministic pseudo-random waveform bar heights from the src string.
 * This gives a consistent visual pattern per audio file without needing
 * to decode the actual waveform (which requires AudioContext + decodeAudioData).
 */
function generateWaveformBars(src: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = (hash * 31 + src.charCodeAt(i)) | 0;
  }

  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = (hash * 16807 + 7) | 0;
    const normalized = ((hash & 0x7fffffff) % 100) / 100;
    // Keep bars between 20% and 100% height for visual appeal
    bars.push(0.2 + normalized * 0.8);
  }
  return bars;
}

// ---------------------------------------------------------------------------
// WaveformCanvas - simple canvas bars showing progress over waveform
// ---------------------------------------------------------------------------

const WaveformCanvas = memo(function WaveformCanvas({
  bars,
  progress,
  isPlaying,
  onSeek,
}: {
  bars: number[];
  progress: number; // 0-1
  isPlaying: boolean;
  onSeek: (fraction: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw the waveform whenever progress or bars change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const barWidth = Math.max(1, (width / bars.length) * 0.6);
    const gap = (width / bars.length) * 0.4;
    const totalBarSlot = barWidth + gap;

    for (let i = 0; i < bars.length; i++) {
      const barHeight = bars[i] * height * 0.9;
      const x = i * totalBarSlot + gap / 2;
      const y = (height - barHeight) / 2;

      const barProgress = i / bars.length;
      if (barProgress <= progress) {
        ctx.fillStyle = isPlaying ? '#a78bfa' : '#8b5cf6'; // purple-400 / purple-500
      } else {
        ctx.fillStyle = '#374151'; // gray-700
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    }
  }, [bars, progress, isPlaying]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(fraction);
    },
    [onSeek]
  );

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer flex-1 min-w-0"
      onClick={handleClick}
      role="slider"
      aria-label="Audio progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: WAVEFORM_HEIGHT }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// SpeedSelector - cycle through playback speeds
// ---------------------------------------------------------------------------

const SpeedSelector = memo(function SpeedSelector({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (speed: number) => void;
}) {
  const handleClick = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed as (typeof SPEED_OPTIONS)[number]);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    onChange(SPEED_OPTIONS[nextIndex]);
  }, [speed, onChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold',
        'transition-colors duration-150 select-none',
        speed === 1
          ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          : 'text-purple-400 bg-purple-500/10 hover:bg-purple-500/20'
      )}
      title={`Playback speed: ${speed}x (click to change)`}
      aria-label={`Playback speed ${speed}x`}
    >
      <Gauge className="w-3 h-3" />
      {speed}x
    </button>
  );
});

// ---------------------------------------------------------------------------
// VolumeControl
// ---------------------------------------------------------------------------

const VolumeControl = memo(function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="flex items-center gap-1 relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={onToggleMute}
        className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
        title={isMuted ? 'Unmute' : 'Mute'}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        <VolumeIcon className="w-3.5 h-3.5" />
      </button>

      {/* Volume slider - appears on hover */}
      <div
        className={cn(
          'transition-all duration-200 overflow-hidden',
          isHovered ? 'w-16 opacity-100' : 'w-0 opacity-0'
        )}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full h-1 rounded-full appearance-none cursor-pointer accent-purple-500 bg-gray-700"
          aria-label="Volume"
        />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// AudioPlayer
// ---------------------------------------------------------------------------

const AudioPlayer = memo(function AudioPlayer({
  src,
  duration: initialDuration,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const animFrameRef = useRef<number>(0);

  // Generate static waveform bars from src
  const waveformBars = useMemo(
    () => generateWaveformBars(src, WAVEFORM_BAR_COUNT),
    [src]
  );

  // Progress fraction 0-1
  const progress = duration > 0 ? currentTime / duration : 0;

  // -- Audio event handlers --

  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, updateTime]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
    setIsLoaded(true);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, []);

  // -- Controls --

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying]);

  const handleSeek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const newTime = fraction * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = false;
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((m) => {
      const next = !m;
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  return (
    <div
      className={cn(
        'rounded-lg border border-border-default overflow-hidden',
        'bg-background-default',
        className
      )}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <div className="flex items-center gap-2 px-3 py-2">
        {/* Play / Pause button */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={!isLoaded && !initialDuration}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full shrink-0',
            'transition-colors duration-150',
            isPlaying
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Waveform / progress */}
        <WaveformCanvas
          bars={waveformBars}
          progress={progress}
          isPlaying={isPlaying}
          onSeek={handleSeek}
        />

        {/* Time display */}
        <span className="text-xs font-mono tabular-nums text-text-muted select-none shrink-0 min-w-[70px] text-right">
          {formatTime(currentTime)}
          <span className="text-gray-600 mx-0.5">/</span>
          {formatTime(duration)}
        </span>
      </div>

      {/* Bottom controls row */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border-default bg-background-muted">
        {/* Speed selector */}
        <SpeedSelector speed={speed} onChange={handleSpeedChange} />

        {/* Volume control */}
        <VolumeControl
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
        />
      </div>
    </div>
  );
});
AudioPlayer.displayName = 'AudioPlayer';

export default AudioPlayer;
