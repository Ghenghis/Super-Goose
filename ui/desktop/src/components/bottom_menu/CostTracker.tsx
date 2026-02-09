import { useState, useEffect, useRef, useCallback } from 'react';
import { useModelAndProvider } from '../ModelAndProviderContext';
import { CoinIcon } from '../icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { fetchModelPricing } from '../../utils/pricing';
import { PricingData } from '../../api';

interface CostTrackerProps {
  inputTokens?: number;
  outputTokens?: number;
  sessionCosts?: {
    [key: string]: {
      inputTokens: number;
      outputTokens: number;
      totalCost: number;
    };
  };
  setView?: (view: string) => void;
}

export function CostTracker({ inputTokens = 0, outputTokens = 0, sessionCosts, setView }: CostTrackerProps) {
  const { currentModel, currentProvider } = useModelAndProvider();
  const [costInfo, setCostInfo] = useState<PricingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPricing, setShowPricing] = useState(true);
  const [pricingFailed, setPricingFailed] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Check if pricing is enabled
  useEffect(() => {
    const checkPricingSetting = () => {
      const stored = localStorage.getItem('show_pricing');
      setShowPricing(stored !== 'false');
    };

    checkPricingSetting();
    window.addEventListener('storage', checkPricingSetting);
    return () => window.removeEventListener('storage', checkPricingSetting);
  }, []);

  useEffect(() => {
    const loadCostInfo = async () => {
      if (!currentModel || !currentProvider) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const costData = await fetchModelPricing(currentProvider, currentModel);
        if (costData) {
          setCostInfo(costData);
          setPricingFailed(false);
        } else {
          setPricingFailed(true);
          setCostInfo(null);
        }
      } catch {
        setPricingFailed(true);
        setCostInfo(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadCostInfo();
  }, [currentModel, currentProvider]);

  // Calculate popover position
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 280;
    const popoverHeight = 200;
    const offset = 8;

    let top = triggerRect.top - popoverHeight - offset;
    let left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;

    const viewportWidth = window.innerWidth;

    if (left < 10) {
      left = 10;
    } else if (left + popoverWidth > viewportWidth - 10) {
      left = viewportWidth - popoverWidth - 10;
    }

    if (top < 10) {
      top = triggerRect.bottom + offset;
    }

    setPopoverPosition({ top, left });
  }, []);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    };

    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopoverOpen]);

  // Recalculate position when popover opens
  useEffect(() => {
    if (isPopoverOpen) {
      calculatePosition();
      const handleResize = () => calculatePosition();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    return undefined;
  }, [isPopoverOpen, calculatePosition]);

  // Return null early if pricing is disabled
  if (!showPricing) {
    return null;
  }

  const calculateCost = (): number => {
    // If we have session costs, calculate the total across all models
    if (sessionCosts) {
      let totalCost = 0;

      // Add up all historical costs from different models
      Object.values(sessionCosts).forEach((modelCost) => {
        totalCost += modelCost.totalCost;
      });

      // Add current model cost if we have pricing info
      if (
        costInfo &&
        (costInfo.input_token_cost !== undefined || costInfo.output_token_cost !== undefined)
      ) {
        const currentInputCost = inputTokens * (costInfo.input_token_cost || 0);
        const currentOutputCost = outputTokens * (costInfo.output_token_cost || 0);
        totalCost += currentInputCost + currentOutputCost;
      }

      return totalCost;
    }

    // Fallback to simple calculation for current model only
    if (
      !costInfo ||
      (costInfo.input_token_cost === undefined && costInfo.output_token_cost === undefined)
    ) {
      return 0;
    }

    const inputCost = inputTokens * (costInfo.input_token_cost || 0);
    const outputCost = outputTokens * (costInfo.output_token_cost || 0);
    const total = inputCost + outputCost;

    return total;
  };

  const formatCost = (cost: number): string => {
    // Always show 4 decimal places for consistency
    return cost.toFixed(4);
  };

  const currency = costInfo?.currency || '$';

  const handleTriggerClick = () => {
    setIsPopoverOpen((prev) => !prev);
  };

  const renderBreakdownPopover = () => {
    if (!isPopoverOpen) return null;

    const inputCost = inputTokens * (costInfo?.input_token_cost || 0);
    const outputCost = outputTokens * (costInfo?.output_token_cost || 0);
    const totalCost = calculateCost();

    return (
      <div
        ref={popoverRef}
        className="fixed w-[280px] rounded-lg overflow-hidden bg-app border border-border-default z-50 shadow-lg text-left"
        style={{
          top: `${popoverPosition.top}px`,
          left: `${popoverPosition.left}px`,
          visibility: popoverPosition.top === 0 ? 'hidden' : 'visible',
        }}
      >
        <div className="p-3">
          <div className="text-xs font-medium text-text-default mb-2">Session Cost Breakdown</div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Input tokens</span>
              <span className="font-mono text-text-default">
                {inputTokens.toLocaleString()} ({currency}{inputCost.toFixed(6)})
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Output tokens</span>
              <span className="font-mono text-text-default">
                {outputTokens.toLocaleString()} ({currency}{outputCost.toFixed(6)})
              </span>
            </div>
            {sessionCosts && Object.keys(sessionCosts).length > 0 && (
              <>
                <div className="border-t border-border-default my-1.5" />
                <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
                  By Model
                </div>
                {Object.entries(sessionCosts).map(([modelKey, cost]) => (
                  <div key={modelKey} className="flex justify-between text-xs">
                    <span className="text-text-muted truncate max-w-[140px]" title={modelKey}>
                      {modelKey}
                    </span>
                    <span className="font-mono text-text-default">
                      {currency}{cost.totalCost.toFixed(6)}
                    </span>
                  </div>
                ))}
              </>
            )}
            <div className="border-t border-border-default my-1.5" />
            <div className="flex justify-between text-xs font-medium">
              <span className="text-text-default">Session total</span>
              <span className="font-mono text-text-default">
                {currency}{totalCost.toFixed(6)}
              </span>
            </div>
          </div>
          {setView && (
            <button
              onClick={() => {
                setIsPopoverOpen(false);
                setView('settings');
              }}
              className="mt-2.5 text-[10px] text-text-muted hover:text-text-default transition-colors cursor-pointer"
            >
              View Report →
            </button>
          )}
        </div>
      </div>
    );
  };

  // Show loading state or when we don't have model/provider info
  if (!currentModel || !currentProvider) {
    return null;
  }

  // If still loading, show a placeholder
  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-full text-text-muted translate-y-[1px]">
          <span className="text-xs font-mono">...</span>
        </div>
        <div className="w-px h-4 bg-border-default mx-2" />
      </>
    );
  }

  // If no cost info found, try to return a default
  if (
    !costInfo ||
    (costInfo.input_token_cost === undefined && costInfo.output_token_cost === undefined)
  ) {
    // If it's a known free/local provider, show $0.000000 without "not available" message
    const freeProviders = ['ollama', 'local', 'localhost'];
    if (freeProviders.includes(currentProvider.toLowerCase())) {
      return (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center h-full text-text-default/70 hover:text-text-default transition-colors cursor-default translate-y-[1px]">
                <CoinIcon className="mr-1" size={16} />
                <span className="text-xs font-mono">0.0000</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {`Local model (${inputTokens.toLocaleString()} input, ${outputTokens.toLocaleString()} output tokens)`}
            </TooltipContent>
          </Tooltip>
          <div className="w-px h-4 bg-border-default mx-2" />
        </>
      );
    }

    // Otherwise show as unavailable
    const getUnavailableTooltip = () => {
      if (pricingFailed) {
        return `Pricing data unavailable for ${currentModel}`;
      }
      return `Cost data not available for ${currentModel} (${inputTokens.toLocaleString()} input, ${outputTokens.toLocaleString()} output tokens)`;
    };

    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center h-full transition-colors cursor-default translate-y-[1px] text-text-default/70 hover:text-text-default">
              <CoinIcon className="mr-1" size={16} />
              <span className="text-xs font-mono">0.0000</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{getUnavailableTooltip()}</TooltipContent>
        </Tooltip>
        <div className="w-px h-4 bg-border-default mx-2" />
      </>
    );
  }

  const totalCost = calculateCost();

  // Build tooltip content
  const getTooltipContent = (): string => {
    if (isPopoverOpen) return '';

    // Handle error states first
    if (pricingFailed) {
      return `Pricing data unavailable for ${currentProvider}/${currentModel}`;
    }

    // Handle session costs
    if (sessionCosts && Object.keys(sessionCosts).length > 0) {
      // Show session breakdown
      let tooltip = 'Session cost breakdown:\n';

      Object.entries(sessionCosts).forEach(([modelKey, cost]) => {
        const costStr = `${costInfo?.currency || '$'}${cost.totalCost.toFixed(6)}`;
        tooltip += `${modelKey}: ${costStr} (${cost.inputTokens.toLocaleString()} in, ${cost.outputTokens.toLocaleString()} out)\n`;
      });

      // Add current model if it has costs
      if (costInfo && (inputTokens > 0 || outputTokens > 0)) {
        const currentCost =
          inputTokens * (costInfo.input_token_cost || 0) +
          outputTokens * (costInfo.output_token_cost || 0);
        if (currentCost > 0) {
          tooltip += `${currentProvider}/${currentModel} (current): ${costInfo.currency || '$'}${currentCost.toFixed(6)} (${inputTokens.toLocaleString()} in, ${outputTokens.toLocaleString()} out)\n`;
        }
      }

      tooltip += `\nTotal session cost: ${costInfo?.currency || '$'}${totalCost.toFixed(6)}`;
      tooltip += '\nClick for details';
      return tooltip;
    }

    // Default tooltip for single model
    return `Input: ${inputTokens.toLocaleString()} tokens | Output: ${outputTokens.toLocaleString()} tokens\nClick for details`;
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={triggerRef}
            onClick={handleTriggerClick}
            className="flex items-center justify-center h-full transition-colors cursor-pointer translate-y-[1px] text-text-default/70 hover:text-text-default"
          >
            <CoinIcon className="mr-1" size={16} />
            <span className="text-xs font-mono">{formatCost(totalCost)}</span>
          </div>
        </TooltipTrigger>
        {!isPopoverOpen && <TooltipContent>{getTooltipContent()}</TooltipContent>}
      </Tooltip>
      {renderBreakdownPopover()}
      <div className="w-px h-4 bg-border-default mx-2" />
    </>
  );
}
