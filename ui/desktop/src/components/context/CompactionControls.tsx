import { Loader2, Shrink } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { cn } from '../../utils';

interface CompactionControlsProps {
  canCompact: boolean;
  isCompacting: boolean;
  onCompact: () => void;
  tokenPercentage: number;
  className?: string;
}

export function CompactionControls({
  canCompact,
  isCompacting,
  onCompact,
  tokenPercentage,
  className,
}: CompactionControlsProps) {
  // Only show when usage exceeds 70%
  if (tokenPercentage < 70) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canCompact && !isCompacting) {
              onCompact();
            }
          }}
          disabled={!canCompact || isCompacting}
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1 text-xs transition-colors h-6 px-2',
            isCompacting
              ? 'text-text-muted cursor-wait'
              : tokenPercentage >= 90
                ? 'text-red-500 hover:text-red-600 hover:bg-red-500/10'
                : tokenPercentage >= 70
                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-500/10'
                  : 'text-text-default/70 hover:text-text-default',
            className
          )}
        >
          {isCompacting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[11px]">Compacting...</span>
            </>
          ) : (
            <>
              <Shrink className="w-3 h-3" />
              <span className="text-[11px]">Compact</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {isCompacting
            ? 'Summarizing conversation to free context space...'
            : 'Summarize conversation to free context space'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
