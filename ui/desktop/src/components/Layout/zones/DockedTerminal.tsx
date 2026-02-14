/**
 * DockedTerminal — zone-compatible wrapper for EmbeddedTerminal.
 *
 * When used inside the BottomZone, the zone handles sizing via
 * react-resizable-panels. This component auto-opens the terminal and
 * fills the available height (no internal height management).
 */

import { useEffect } from 'react';
import { useCLI } from '../../cli/CLIContext';
import EmbeddedTerminal from '../../cli/EmbeddedTerminal';

export default function DockedTerminal() {
  const { openTerminal, state } = useCLI();

  // Auto-open the terminal when mounted in the zone
  useEffect(() => {
    if (!state.isTerminalOpen) {
      openTerminal();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full w-full overflow-hidden [&>div]:!h-full [&>div]:!border-t-0">
      <EmbeddedTerminal />
    </div>
  );
}
