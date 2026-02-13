interface SGMetricCardProps {
  label: string;
  value: string;
  color?: string;
  trend?: 'up' | 'down' | 'flat';
}

const TREND_ICONS: Record<string, string> = {
  up: '\u2191',
  down: '\u2193',
  flat: '\u2192',
};

export default function SGMetricCard({ label, value, color = 'var(--sg-text-1)', trend }: SGMetricCardProps) {
  return (
    <div className="sg-card">
      <div className="text-xs" style={{ color: 'var(--sg-text-4)' }}>{label}</div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
        {trend && (
          <span style={{ color: trend === 'up' ? 'var(--sg-emerald)' : trend === 'down' ? 'var(--sg-red)' : 'var(--sg-text-4)', fontSize: '0.875rem' }}>
            {TREND_ICONS[trend]}
          </span>
        )}
      </div>
    </div>
  );
}
