import React, { useEffect, useRef } from 'react';

interface OutputWaveformProps {
  /** The AnalyserNode from the useTts hook. */
  analyser: AnalyserNode | null;
  /** Whether TTS speech is currently playing. */
  isPlaying: boolean;
}

/**
 * Frequency-bar visualiser for TTS output.
 *
 * Mirrors the existing WaveformVisualizer used for microphone input
 * but uses a purple/pink colour scheme so users can instantly
 * distinguish AI speech output from their own voice input.
 */
export const OutputWaveform: React.FC<OutputWaveformProps> = ({
  analyser,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser || !isPlaying) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI support
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Analyser setup
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Bar geometry
    const barWidth = 3;
    const barSpacing = 2;
    const barCount = Math.floor(rect.width / (barWidth + barSpacing));
    const barMaxHeight = rect.height * 0.8;
    const barMinHeight = 2;

    // Smoothing buffers
    const smoothedHeights = new Array(barCount).fill(0);
    const targetHeights = new Array(barCount).fill(0);

    const draw = () => {
      if (!isPlaying) return;

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Compute target heights from frequency data
      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength * 0.5);
        const value = dataArray[dataIndex] / 255;
        const randomFactor = 0.85 + Math.random() * 0.3;
        targetHeights[i] = Math.max(barMinHeight, value * barMaxHeight * randomFactor);
      }

      // Smooth toward targets
      for (let i = 0; i < barCount; i++) {
        const diff = targetHeights[i] - smoothedHeights[i];
        smoothedHeights[i] += diff * 0.3;
      }

      // Draw bars with purple/pink gradient
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + barSpacing) + barSpacing;
        const barHeight = smoothedHeights[i];
        const y = (rect.height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);

        const intensity = barHeight / barMaxHeight;
        // Purple (270) shifting toward pink (320) as intensity increases
        const hue = 270 + intensity * 50;
        const saturation = 50 + intensity * 40;
        const lightness = 50 + intensity * 20;

        gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`);
        gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`);
        gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying]);

  if (!isPlaying) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.9 }}
    />
  );
};
