interface SGApprovalGateProps {
  action: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  onApprove: () => void;
  onReject: () => void;
  toolName?: string;
}

/** Shared hover handlers for opacity-based button hover effect. */
const hoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.opacity = '0.85';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.opacity = '1';
  },
};

/** Base style for approve/reject action buttons. */
const actionButtonBase: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 1rem',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'white',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};

const riskConfig = {
  low: {
    borderColor: 'var(--sg-emerald)',
    icon: '🛡️',
    label: 'Low Risk',
  },
  medium: {
    borderColor: 'var(--sg-amber)',
    icon: '⚠️',
    label: 'Medium Risk',
  },
  high: {
    borderColor: 'var(--sg-red)',
    icon: '🔒',
    label: 'High Risk',
  },
};

export default function SGApprovalGate({
  action,
  description,
  risk,
  onApprove,
  onReject,
  toolName,
}: SGApprovalGateProps) {
  const config = riskConfig[risk];

  return (
    <div
      className="sg-card"
      role="alert"
      style={{
        borderLeft: `4px solid ${config.borderColor}`,
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.125rem' }}>{config.icon}</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--sg-text-1)' }}>
            Approval Required
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.75rem',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.25rem',
              backgroundColor: `${config.borderColor}22`,
              color: config.borderColor,
              fontWeight: 500,
            }}
          >
            {config.label}
          </span>
        </div>

        {/* Action */}
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--sg-text-2)', marginBottom: '0.25rem' }}>
            {action}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--sg-text-3)', lineHeight: '1.4' }}>
            {description}
          </div>
        </div>

        {/* Tool name if provided */}
        {toolName && (
          <div style={{ fontSize: '0.75rem', color: 'var(--sg-text-4)', fontFamily: 'monospace' }}>
            Tool: {toolName}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button
            onClick={onApprove}
            aria-label={`Approve: ${action}`}
            style={{ ...actionButtonBase, backgroundColor: 'var(--sg-emerald)' }}
            {...hoverHandlers}
          >
            ✓ Approve
          </button>
          <button
            onClick={onReject}
            aria-label={`Reject: ${action}`}
            style={{ ...actionButtonBase, backgroundColor: 'var(--sg-red)' }}
            {...hoverHandlers}
          >
            ✗ Reject
          </button>
        </div>
      </div>
    </div>
  );
}
