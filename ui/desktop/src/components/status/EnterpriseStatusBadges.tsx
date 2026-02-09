import { useState, useEffect } from 'react';
import { GuardrailsStatusBadge } from './GuardrailsStatusBadge';
import { GatewayStatusBadge } from './GatewayStatusBadge';
import { MemoryStatusBadge } from './MemoryStatusBadge';
import { VoiceStatusBadge } from './VoiceStatusBadge';
import type { View } from '../../utils/navigationUtils';

interface EnterpriseStatusBadgesProps {
  setView: (view: View) => void;
}

/**
 * Container component that renders enterprise status badges in the bottom menu.
 * Checks whether enterprise features are available before rendering.
 * Shows badges conditionally: only when enterprise endpoints respond.
 */
export function EnterpriseStatusBadges({ setView }: EnterpriseStatusBadgesProps) {
  const [enterpriseAvailable, setEnterpriseAvailable] = useState(false);

  useEffect(() => {
    const checkEnterprise = async () => {
      try {
        // Probe any enterprise endpoint to see if the feature set is available
        const response = await fetch('/enterprise/status');
        if (response.ok) {
          setEnterpriseAvailable(true);
          return;
        }
      } catch {
        // Enterprise not available
      }

      // Fallback: check if any individual enterprise endpoint responds
      try {
        const guardrailsResp = await fetch('/enterprise/guardrails/status');
        if (guardrailsResp.ok) {
          setEnterpriseAvailable(true);
          return;
        }
      } catch {
        // Not available
      }

      setEnterpriseAvailable(false);
    };

    checkEnterprise();
    // Re-check periodically in case enterprise features get enabled
    const interval = setInterval(checkEnterprise, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!enterpriseAvailable) {
    return null;
  }

  return (
    <>
      <div className="w-px h-4 bg-border-default mx-1" />
      <div className="flex items-center gap-1.5">
        <GuardrailsStatusBadge setView={setView} />
        <GatewayStatusBadge setView={setView} />
        <MemoryStatusBadge setView={setView} />
        <VoiceStatusBadge setView={setView} />
      </div>
    </>
  );
}
