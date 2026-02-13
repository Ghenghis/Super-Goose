interface SGCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function SGCard({ children, className = '', style }: SGCardProps) {
  return (
    <div className={`sg-card ${className}`} style={style}>
      {children}
    </div>
  );
}
