/**
 * CenterZone — the always-visible main content area.
 *
 * Renders the React Router <Outlet /> which shows the chat, settings, etc.
 * The chat input remains inside the center zone. This zone cannot be
 * collapsed or closed.
 */

import { cn } from '../../../utils';

interface CenterZoneProps {
  children: React.ReactNode;
  className?: string;
}

export function CenterZone({ children, className }: CenterZoneProps) {
  return (
    <div
      className={cn('h-full overflow-hidden flex flex-col min-w-0', className)}
      data-testid="center-zone"
    >
      {children}
    </div>
  );
}

export default CenterZone;
