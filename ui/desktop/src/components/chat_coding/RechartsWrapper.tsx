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
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
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

// ---------------------------------------------------------------------------
// RechartsWrapper - SVG-based chart renderer (no recharts dependency)
// ---------------------------------------------------------------------------

const RechartsWrapper = memo<RechartsWrapperProps>(
  ({ data, type, xKey, yKey, title, className }) => {
    const chartWidth = MIN_CHART_WIDTH;
    const [yMin, yMax] = useMemo(() => extent(data, yKey), [data, yKey]);
    const yTicks = useMemo(() => niceTicks(yMin, yMax), [yMin, yMax]);
    const yScale = useMemo(
      () => linearScale(yMin, yMax, CHART_HEIGHT - CHART_PADDING.bottom, CHART_PADDING.top),
      [yMin, yMax]
    );

    if (!data || data.length === 0) {
      return (
        <div className={cn('rounded-lg p-4 text-center text-sm', className)}
          style={{ background: COLORS.bg, color: COLORS.textSecondary }}>
          No data to display
        </div>
      );
    }

    const barWidth = Math.max(
      4,
      (chartWidth - CHART_PADDING.left - CHART_PADDING.right) / data.length - 4
    );

    return (
      <div className={cn('rounded-lg overflow-hidden', className)}
        style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
        {title && (
          <div className="px-3 py-2 text-xs font-medium"
            style={{ color: COLORS.textPrimary, borderBottom: `1px solid ${COLORS.border}` }}>
            {title}
          </div>
        )}
        <svg
          width={chartWidth}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          className="w-full"
        >
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <line
              key={i}
              x1={CHART_PADDING.left}
              x2={chartWidth - CHART_PADDING.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={COLORS.gridLine}
              strokeDasharray="3 3"
            />
          ))}

          {/* Y axis labels */}
          {yTicks.map((tick, i) => (
            <text
              key={`yl-${i}`}
              x={CHART_PADDING.left - 8}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill={COLORS.textMuted}
              fontSize={10}
            >
              {formatNumber(tick)}
            </text>
          ))}

          {/* Bars / points */}
          {type === 'bar' && data.map((d, i) => {
            const x = CHART_PADDING.left + i * (barWidth + 4) + 2;
            const y = yScale(Number(d[yKey]) || 0);
            const height = CHART_HEIGHT - CHART_PADDING.bottom - y;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(0, height)}
                rx={2}
                fill={COLORS.series[i % COLORS.series.length]}
                opacity={0.85}
              />
            );
          })}

          {/* X axis labels */}
          {data.map((d, i) => {
            const x = CHART_PADDING.left + i * (barWidth + 4) + barWidth / 2 + 2;
            return (
              <text
                key={`xl-${i}`}
                x={x}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                fill={COLORS.textMuted}
                fontSize={9}
              >
                {truncate(String(d[xKey] ?? ''), 10)}
              </text>
            );
          })}
        </svg>
      </div>
    );
  }
);

RechartsWrapper.displayName = 'RechartsWrapper';

export default RechartsWrapper;