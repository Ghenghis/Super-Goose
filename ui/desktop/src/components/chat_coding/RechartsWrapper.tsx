import { memo, useMemo } from 'react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RechartsWrapperProps {
  data: Array<Record<string, any>>;
  type: 'bar' | 'line' | 'area' | 'pie';
  xKey: string;
  yKey: string;
  title?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const CHART_HEIGHT = 260;
const MIN_CHART_WIDTH = 300;

/** Palette pulled from the existing chat coding dark theme. */
const COLORS = {
  bg: '#1e1e2e',
  surface: '#282840',
  border: '#3b3b5c',
  textPrimary: '#e6e6e6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  accent: '#7c3aed',
  accentAlt: '#3B82F6',
  series: [
    '#7c3aed',
    '#3B82F6',
    '#22C55E',
    '#F59E0B',
    '#EF4444',
    '#EC4899',
    '#06B6D4',
    '#8B5CF6',
  ],
  gridLine: '#3b3b5c',
};
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive numeric extents from data for a given key. */
function extent(data: Array<Record<string, any>>, key: string): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    const v = Number(d[key]);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

/** Linear scale: domain -> range. */
function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
) {
  const domainSpan = domainMax - domainMin || 1;
  return (value: number) =>
    rangeMin + ((value - domainMin) / domainSpan) * (rangeMax - rangeMin);
}

/** Format a number for axis labels (compact). */
function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `M`;
  if (Math.abs(n) >= 1_000) return `K`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

/** Generate ~5 nice tick values for an axis. */
function niceTicks(min: number, max: number, count = 5): number[] {
  const range = max - min || 1;
  const rough = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  let step: number;
  if (residual <= 1.5) step = mag;
  else if (residual <= 3) step = 2 * mag;
  else if (residual <= 7) step = 5 * mag;
  else step = 10 * mag;

  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 0.01; t += step) {
    ticks.push(parseFloat(t.toFixed(10)));
  }
  return ticks;
}

/** Truncate label text to a max number of characters. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}