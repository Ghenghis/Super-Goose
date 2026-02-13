type BadgeVariant = 'gold' | 'emerald' | 'indigo' | 'red' | 'violet' | 'sky' | 'amber';

interface SGBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function SGBadge({ variant, children, className = '' }: SGBadgeProps) {
  return (
    <span className={`sg-badge sg-badge-${variant} ${className}`}>
      {children}
    </span>
  );
}
