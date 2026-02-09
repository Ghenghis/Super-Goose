import { useState } from 'react';
import { Refresh } from '../icons';

interface RegenerateButtonProps {
  onRegenerate: () => void;
}

export default function RegenerateButton({ onRegenerate }: RegenerateButtonProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      onRegenerate();
    } finally {
      // Reset after a brief delay to prevent rapid re-clicks
      setTimeout(() => setIsRegenerating(false), 1000);
    }
  };

  return (
    <button
      onClick={handleRegenerate}
      disabled={isRegenerating}
      className="flex font-mono items-center gap-1 text-xs text-text-muted hover:cursor-pointer hover:text-text-default transition-all duration-200 opacity-0 group-hover:opacity-100 -translate-y-4 group-hover:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Regenerate response"
      title="Regenerate response"
    >
      <Refresh className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
      <span>{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
    </button>
  );
}
