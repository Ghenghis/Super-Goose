import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuardrailsPanel from '../GuardrailsPanel';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('GuardrailsPanel', () => {
  describe('Rendering', () => {
    it('renders the Guardrails heading', () => {
      render(<GuardrailsPanel />);
      expect(screen.getByText('Guardrails')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<GuardrailsPanel />);
      expect(
        screen.getByText('Input and output scanning for safety, secrets, PII, and policy compliance.')
      ).toBeInTheDocument();
    });

    it('renders the Guardrails Engine toggle label', () => {
      render(<GuardrailsPanel />);
      expect(screen.getByText('Guardrails Engine')).toBeInTheDocument();
      expect(screen.getByText('Scan all inputs and outputs for safety')).toBeInTheDocument();
    });

    it('renders pass/warn/block stats', () => {
      render(<GuardrailsPanel />);
      // 6 pass, 3 warn, 1 block
      expect(screen.getByText('6 passed')).toBeInTheDocument();
      expect(screen.getByText('3 warnings')).toBeInTheDocument();
      expect(screen.getByText('1 blocked')).toBeInTheDocument();
    });

    it('renders all detector names', () => {
      render(<GuardrailsPanel />);
      const promptInjection = screen.getAllByText('Prompt Injection');
      expect(promptInjection.length).toBe(2);
      const secretScanner = screen.getAllByText('Secret Scanner');
      expect(secretScanner.length).toBe(3);
      const piiDetection = screen.getAllByText('PII Detection');
      expect(piiDetection.length).toBe(2);
      expect(screen.getByText('Jailbreak')).toBeInTheDocument();
      expect(screen.getByText('Keyword Filter')).toBeInTheDocument();
      expect(screen.getByText('Topic Filter')).toBeInTheDocument();
    });
  });

  describe('Status Indicators', () => {
    it('renders Pass badges', () => {
      render(<GuardrailsPanel />);
      const passBadges = screen.getAllByText('Pass');
      expect(passBadges.length).toBe(6);
    });

    it('renders Warn badges', () => {
      render(<GuardrailsPanel />);
      const warnBadges = screen.getAllByText('Warn');
      expect(warnBadges.length).toBe(3);
    });

    it('renders Block badge', () => {
      render(<GuardrailsPanel />);
      const blockBadges = screen.getAllByText('Block');
      // 1 block result badge + the "Block" mode button
      expect(blockBadges.length).toBe(2);
    });
  });

  describe('Mode Selector', () => {
    it('renders mode selector with Warn Only and Block options', () => {
      render(<GuardrailsPanel />);
      expect(screen.getByText('Warn Only')).toBeInTheDocument();
      // "Block" button in mode selector
      const blockButtons = screen.getAllByText('Block');
      expect(blockButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('Warn Only mode is selected by default', () => {
      render(<GuardrailsPanel />);
      const warnButton = screen.getByText('Warn Only');
      // When selected, it has amber styling
      expect(warnButton.className).toContain('amber');
    });

    it('switches to Block mode when clicked', async () => {
      const user = userEvent.setup();
      render(<GuardrailsPanel />);

      // Find the Block mode button (not the badge)
      const modeButtons = screen.getByText('Mode:').parentElement;
      const blockModeButton = modeButtons?.querySelector('button:last-child');
      expect(blockModeButton).not.toBeNull();
      await user.click(blockModeButton!);

      // After clicking, the Block button should have red styling
      expect(blockModeButton!.className).toContain('red');
    });
  });

  describe('Expand/Collapse', () => {
    it('scan entries are collapsed by default', () => {
      render(<GuardrailsPanel />);
      expect(screen.queryByText('No injection patterns detected in user prompt.')).not.toBeInTheDocument();
    });

    it('expands a scan entry to show its message', async () => {
      const user = userEvent.setup();
      render(<GuardrailsPanel />);

      // Click on the first "Prompt Injection" entry
      const entries = screen.getAllByText('Prompt Injection');
      const firstEntryButton = entries[0].closest('button');
      await user.click(firstEntryButton!);

      expect(screen.getByText('No injection patterns detected in user prompt.')).toBeInTheDocument();
    });

    it('shows direction and session info when expanded', async () => {
      const user = userEvent.setup();
      render(<GuardrailsPanel />);

      // Click on first Prompt Injection entry
      const entries = screen.getAllByText('Prompt Injection');
      const firstEntryButton = entries[0].closest('button');
      await user.click(firstEntryButton!);

      expect(screen.getByText('input')).toBeInTheDocument();
    });

    it('collapses an expanded entry when clicked again', async () => {
      const user = userEvent.setup();
      render(<GuardrailsPanel />);

      const entries = screen.getAllByText('Prompt Injection');
      const firstEntryButton = entries[0].closest('button');

      await user.click(firstEntryButton!);
      expect(screen.getByText('No injection patterns detected in user prompt.')).toBeInTheDocument();

      await user.click(firstEntryButton!);
      expect(screen.queryByText('No injection patterns detected in user prompt.')).not.toBeInTheDocument();
    });

    it('shows block scan details when expanded', async () => {
      const user = userEvent.setup();
      render(<GuardrailsPanel />);

      // The block entry is "Secret Scanner" for database connection
      const secretScanners = screen.getAllByText('Secret Scanner');
      // Find the one in Fix database connection pooling session (index 1 if ordered by scan array)
      // We try clicking each until we find the one with "block" result
      for (const scanner of secretScanners) {
        const entryButton = scanner.closest('button');
        if (entryButton) {
          await user.click(entryButton);
          const blockMessage = screen.queryByText(
            'Database connection string with credentials detected and redacted from output.'
          );
          if (blockMessage) {
            expect(blockMessage).toBeInTheDocument();
            return;
          }
          // Collapse if not the right one
          await user.click(entryButton);
        }
      }
      // If we get here, the block entry was never found — fail explicitly
      throw new Error('Expected to find a "Secret Scanner" block entry with credentials message, but none was found');
    });
  });
});
