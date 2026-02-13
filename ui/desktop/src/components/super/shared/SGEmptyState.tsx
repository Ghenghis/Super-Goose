interface SGEmptyStateProps {
  icon?: string;
  message: string;
}

export default function SGEmptyState({ icon = '\uD83D\uDCED', message }: SGEmptyStateProps) {
  return (
    <div className="sg-card" style={{ color: 'var(--sg-text-4)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div>{message}</div>
    </div>
  );
}
