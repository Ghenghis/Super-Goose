/**
 * LeftZone — resizable left sidebar.
 *
 * Wraps the existing AppSidebar component inside the new panel system.
 * In the new layout, the sidebar width is controlled by react-resizable-panels
 * instead of the fixed 12rem CSS variable.
 */

import { cn } from '../../../utils';

interface LeftZoneProps {
  children: React.ReactNode;
  className?: string;
}

export function LeftZone({ children, className }: LeftZoneProps) {
  return (
    <div
      className={cn('h-full overflow-hidden flex flex-col', className)}
      data-testid="left-zone"
    >
      {children}
    </div>
  );
}

export default LeftZone;
