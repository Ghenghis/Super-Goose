import { useState, useEffect, useRef } from 'react';

interface OutputWaveformProps {
  isActive?: boolean;
  barCount?: number;
  color?: string;
}

export default function OutputWaveform({
  isActive = false,
  barCount = 16,
  color = '#7C3AED',
}: OutputWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(2));
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive) {
      animRef.current = setInterval(() => {
        setBars((prev) =>
          prev.map(() => Math.random() * 28 + 4)
        );
      }, 80);
    } else {
      if (animRef.current) clearInterval(animRef.current);
      setBars(Array(barCount).fill(2));
    }
    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [isActive, barCount]);

  return (
    <div
      className="flex items-end gap-0.5 h-8"
      role="img"
      aria-label={isActive ? 'Audio output active' : 'Audio output idle'}
    >
      {bars.map((height, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-75"
          style={{
            width: '3px',
            height: `${height}px`,
            backgroundColor: isActive ? color : 'currentColor',
            opacity: isActive ? 0.8 : 0.2,
          }}
        />
      ))}
    </div>
  );
}