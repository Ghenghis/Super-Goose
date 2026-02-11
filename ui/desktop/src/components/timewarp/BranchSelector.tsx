import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, ChevronDown, Check } from 'lucide-react';
import { useTimeWarp } from './TimeWarpContext';

interface BranchSelectorProps {
  compact?: boolean;
}

const BranchSelector: React.FC<BranchSelectorProps> = ({ compact = false }) => {
  const { state, setActiveBranch } = useTimeWarp();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeBranch = state.branches.find((b) => b.id === state.activeBranchId);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={[
          'flex items-center gap-1 rounded transition-colors',
          'hover:bg-white/10 text-text-muted hover:text-text-default',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400',
          compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
        ].join(' ')}
        title="Switch branch"
      >
        <GitBranch className="w-3 h-3" style={{ color: activeBranch?.color }} />
        {!compact && (
          <span className="text-[11px] font-medium max-w-[80px] truncate">
            {activeBranch?.name ?? 'main'}
          </span>
        )}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-1 left-0 min-w-[160px] z-50 bg-neutral-900/95 backdrop-blur border border-white/10 rounded-lg shadow-xl overflow-hidden">
          <div className="py-1">
            {state.branches.map((branch) => {
              const isActive = branch.id === state.activeBranchId;
              const eventCount = state.events.filter((e) => e.branchId === branch.id).length;

              return (
                <button
                  key={branch.id}
                  onClick={() => {
                    setActiveBranch(branch.id);
                    setIsOpen(false);
                  }}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                    isActive
                      ? 'bg-white/10 text-text-default'
                      : 'text-text-muted hover:bg-white/5 hover:text-text-default',
                  ].join(' ')}
                >
                  {/* Color indicator */}
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: branch.color }}
                  />

                  {/* Branch name */}
                  <span className="text-xs font-medium flex-1 truncate">{branch.name}</span>

                  {/* Event count */}
                  <span className="text-[10px] text-text-muted opacity-60">{eventCount}</span>

                  {/* Check mark for active */}
                  {isActive && <Check className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Branch info footer */}
          {state.branches.length > 1 && (
            <div className="border-t border-white/5 px-3 py-1">
              <span className="text-[10px] text-text-muted opacity-50">
                {state.branches.length} branches
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BranchSelector;
