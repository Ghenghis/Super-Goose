import { useState } from 'react';
import { ChevronDown, ChevronUp } from '../icons';

export interface GuardrailFlag {
  reason: string;
  action: string;
}

interface GuardrailBannerProps {
  flags: GuardrailFlag[];
}

export default function GuardrailBanner({ flags }: GuardrailBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!flags || flags.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/10 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs text-yellow-800 dark:text-yellow-300 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20 transition-colors duration-150 cursor-pointer"
        aria-expanded={isExpanded}
        aria-label={`Guardrail triggered: ${flags.length} ${flags.length === 1 ? 'flag' : 'flags'}. Click to ${isExpanded ? 'collapse' : 'expand'} details.`}
      >
        {/* Shield icon */}
        <svg
          className="h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span className="font-medium">
          Guardrail triggered ({flags.length} {flags.length === 1 ? 'flag' : 'flags'})
        </span>
        <span className="ml-auto">
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {flags.map((flag, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-300/80 pl-6"
            >
              <span className="flex-shrink-0 mt-0.5 w-1 h-1 rounded-full bg-yellow-500" />
              <span>
                <span className="font-medium">{flag.reason}</span>
                {flag.action && (
                  <span className="text-yellow-600 dark:text-yellow-400"> &mdash; {flag.action}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
