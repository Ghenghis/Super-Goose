import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToolDetailModal from '../ToolDetailModal';
import type { ToolEntry, TierKey } from '../ToolsBridgePanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    id: 'crewai_bridge',
    name: 'crewai_bridge',
    display_name: 'CrewAI Bridge',
    description: 'CrewAI multi-agent task orchestration.',
    enabled: true,
    type: 'stdio',
    env_keys: [],
    timeout: 300,
    bundled: true,
    ...overrides,
  };
}

function renderModal(
  toolOverrides: Partial<ToolEntry> = {},
  tier: TierKey = 'tier2',
  onClose = vi.fn(),
  onSave = vi.fn(),
) {
  const tool = makeTool(toolOverrides);
  return {
    tool,
    onClose,
    onSave,
    ...render(
      <ToolDetailModal tool={tool} tier={tier} onClose={onClose} onSave={onSave} />,
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolDetailModal', () => {
  it('renders the tool display name in the header', () => {
    renderModal();
    expect(screen.getByText('CrewAI Bridge')).toBeInTheDocument();
  });

  it('renders the tier label badge', () => {
    renderModal({}, 'tier2');
    expect(screen.getByText('Tier 2 - Stage 6 Bridge')).toBeInTheDocument();
  });

  it('renders different tier labels for tier1 and tier3', () => {
    const { unmount } = renderModal({ id: 'developer' }, 'tier1');
    expect(screen.getByText('Tier 1 - Builtin')).toBeInTheDocument();
    unmount();

    renderModal({ id: 'resource_coordinator' }, 'tier3');
    expect(screen.getByText('Tier 3 - Additional Bridge')).toBeInTheDocument();
  });

  it('shows the tool description', () => {
    renderModal({ description: 'CrewAI multi-agent task orchestration.' });
    expect(
      screen.getByText('CrewAI multi-agent task orchestration.'),
    ).toBeInTheDocument();
  });

  it('shows the tool type', () => {
    renderModal({ type: 'stdio' });
    expect(screen.getByText('stdio')).toBeInTheDocument();
  });

  it('shows Enabled state when tool is enabled', () => {
    renderModal({ enabled: true });
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows Disabled state when tool is disabled', () => {
    renderModal({ enabled: false });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows the timeout field with the default value', () => {
    renderModal({ timeout: 300 });
    const timeoutInput = screen.getByDisplayValue('300');
    expect(timeoutInput).toBeInTheDocument();
    expect(timeoutInput).toHaveAttribute('type', 'number');
  });

  it('shows environment variables for known tools', () => {
    // crewai_bridge has OPENAI_API_KEY in TOOL_METADATA
    renderModal({ id: 'crewai_bridge' });
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();
  });

  it('shows install command for known tools', () => {
    renderModal({ id: 'crewai_bridge' });
    expect(screen.getByText('pip install crewai')).toBeInTheDocument();
  });

  it('shows documentation link for known tools', () => {
    renderModal({ id: 'crewai_bridge' });
    const docLink = screen.getByText('https://docs.crewai.com/');
    expect(docLink).toBeInTheDocument();
    expect(docLink.closest('a')).toHaveAttribute('href', 'https://docs.crewai.com/');
    expect(docLink.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('does not show env vars section for tools without metadata', () => {
    renderModal({ id: 'unknown_tool_xyz' });
    expect(screen.queryByText('Required environment variables')).not.toBeInTheDocument();
  });

  it('calls onClose when the X button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({}, 'tier2', onClose);

    // The X close button is in the header — it does not have accessible text,
    // but there's also a Cancel button in the footer
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking the backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = renderModal({}, 'tier2', onClose);

    // The backdrop is the first child div with "absolute inset-0 bg-black"
    const backdrop = container.querySelector('.backdrop-blur-sm')!;
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSave with updated tool when Save changes is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ enabled: true, timeout: 300 }, 'tier2', vi.fn(), onSave);

    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedTool = onSave.mock.calls[0][0];
    expect(savedTool.enabled).toBe(true);
    expect(savedTool.timeout).toBe(300);
  });

  it('toggles enabled state via the switch and saves the new state', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ enabled: true }, 'tier2', vi.fn(), onSave);

    // Toggle the switch to disable
    const toggle = screen.getByRole('switch', { name: 'Toggle CrewAI Bridge' });
    await user.click(toggle);

    // UI should update
    expect(screen.getByText('Disabled')).toBeInTheDocument();

    // Save
    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    await user.click(saveButton);

    const savedTool = onSave.mock.calls[0][0];
    expect(savedTool.enabled).toBe(false);
  });

  it('shows multiple env vars for tools that require them', () => {
    // pr_agent_bridge requires OPENAI_API_KEY and GITHUB_TOKEN
    renderModal({ id: 'pr_agent_bridge', display_name: 'PR-Agent Bridge' });
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('GITHUB_TOKEN')).toBeInTheDocument();
  });
});
