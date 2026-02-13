type StatusType = 'connected' | 'disconnected' | 'idle' | 'error';

interface SGStatusDotProps {
  status: StatusType;
  label?: string;
}

const STATUS_MAP: Record<StatusType, { cssClass: string; defaultLabel: string }> = {
  connected: { cssClass: 'sg-status-dot sg-status-active', defaultLabel: 'Connected' },
  disconnected: { cssClass: 'sg-status-dot sg-status-idle', defaultLabel: 'Disconnected' },
  idle: { cssClass: 'sg-status-dot sg-status-idle', defaultLabel: 'Idle' },
  error: { cssClass: 'sg-status-dot sg-status-error', defaultLabel: 'Error' },
};

export default function SGStatusDot({ status, label }: SGStatusDotProps) {
  const { cssClass, defaultLabel } = STATUS_MAP[status];
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: '0.8125rem' }}>
      <span className={cssClass} />
      <span style={{ color: 'var(--sg-text-3)' }}>{label ?? defaultLabel}</span>
    </span>
  );
}
