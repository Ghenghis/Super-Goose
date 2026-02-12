import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutputWaveform from '../OutputWaveform';

describe('OutputWaveform', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with default props', () => {
    render(<OutputWaveform />);
    const waveform = screen.getByRole('img');
    expect(waveform).toBeInTheDocument();
    expect(waveform).toHaveAttribute('aria-label', 'Audio output idle');
  });

  it('renders the correct number of bars (default 16)', () => {
    const { container } = render(<OutputWaveform />);
    const bars = container.querySelectorAll('.rounded-full');
    expect(bars).toHaveLength(16);
  });

  it('renders custom bar count', () => {
    const { container } = render(<OutputWaveform barCount={8} />);
    const bars = container.querySelectorAll('.rounded-full');
    expect(bars).toHaveLength(8);
  });

  it('shows idle aria-label when not active', () => {
    render(<OutputWaveform isActive={false} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Audio output idle');
  });

  it('shows active aria-label when active', () => {
    render(<OutputWaveform isActive={true} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Audio output active');
  });

  it('bars have low opacity when idle', () => {
    const { container } = render(<OutputWaveform isActive={false} />);
    const bars = container.querySelectorAll('.rounded-full');
    bars.forEach((bar) => {
      expect((bar as HTMLElement).style.opacity).toBe('0.2');
    });
  });

  it('bars use custom color when active', () => {
    const { container } = render(<OutputWaveform isActive={true} color="#FF0000" />);
    const bars = container.querySelectorAll('.rounded-full');
    bars.forEach((bar) => {
      expect((bar as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)');
    });
  });

  it('starts animation interval when active', () => {
    render(<OutputWaveform isActive={true} />);
    // Animation is via setInterval at 80ms; just confirm we can advance time without errors
    vi.advanceTimersByTime(320);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Audio output active');
  });
});
