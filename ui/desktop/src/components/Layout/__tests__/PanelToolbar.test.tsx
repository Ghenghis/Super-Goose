import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockToggleLocked = vi.fn();
const mockApplyPreset = vi.fn();
const mockTogglePanel = vi.fn();
const mockResetLayout = vi.fn();
let mockIsLocked = true;

const MockPanelIcon = ({ className }: { className?: string }) => (
  <span data-testid="mock-panel-icon" className={className} />
);

const MockPresetIcon = ({ className }: { className?: string }) => (
  <span data-testid="mock-preset-icon" className={className} />
);

vi.mock('../PanelSystem/PanelSystemProvider', () => ({
  usePanelSystem: () => ({
    layout: { presetId: 'standard' },
    isLocked: mockIsLocked,
    presets: [
      { id: 'focus', name: 'Focus', description: 'Chat only', icon: MockPresetIcon },
      { id: 'standard', name: 'Standard', description: 'Sidebar + Chat + Pipeline', icon: MockPresetIcon },
      { id: 'full', name: 'Full', description: 'All zones visible', icon: MockPresetIcon },
      { id: 'agent', name: 'Agent', description: 'Multi-agent workflows', icon: MockPresetIcon },
      { id: 'custom', name: 'Custom', description: 'User-saved layout', icon: MockPresetIcon },
    ],
    applyPreset: mockApplyPreset,
    toggleLocked: mockToggleLocked,
    togglePanel: mockTogglePanel,
    isPanelVisible: (id: string) => id === 'pipeline',
    resetLayout: mockResetLayout,
  }),
}));

vi.mock('../PanelSystem/PanelRegistry', () => ({
  getToggleablePanels: () => [
    { id: 'pipeline', title: 'Pipeline', icon: MockPanelIcon, closable: true },
    { id: 'terminal', title: 'Terminal', icon: MockPanelIcon, closable: true },
    { id: 'agentPanel', title: 'Agent', icon: MockPanelIcon, closable: true },
  ],
}));

vi.mock('lucide-react', () => ({
  Lock: () => <span data-testid="icon-lock" />,
  Unlock: () => <span data-testid="icon-unlock" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import { PanelToolbar } from '../PanelSystem/PanelToolbar';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PanelToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLocked = true;
  });

  it('renders preset selector button', () => {
    render(<PanelToolbar />);
    expect(screen.getByTitle('Layout preset')).toBeInTheDocument();
  });

  it('renders lock/unlock button', () => {
    render(<PanelToolbar />);
    expect(screen.getByTitle('Unlock layout (Ctrl+Shift+L)')).toBeInTheDocument();
  });

  it('shows "Locked" text when locked', () => {
    mockIsLocked = true;
    render(<PanelToolbar />);
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('shows "Unlocked" text when unlocked', () => {
    mockIsLocked = false;
    render(<PanelToolbar />);
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
  });

  it('toggles lock on button click', () => {
    render(<PanelToolbar />);
    fireEvent.click(screen.getByTitle('Unlock layout (Ctrl+Shift+L)'));
    expect(mockToggleLocked).toHaveBeenCalledTimes(1);
  });

  it('opens preset dropdown on click', () => {
    render(<PanelToolbar />);
    // Preset dropdown should not be visible initially
    expect(screen.queryByText('Focus')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Layout preset'));

    // All 5 presets should now be visible
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('renders all 5 presets in dropdown', () => {
    render(<PanelToolbar />);
    fireEvent.click(screen.getByTitle('Layout preset'));

    expect(screen.getByText('Focus')).toBeInTheDocument();
    // "Standard" appears both in the button label and the dropdown
    expect(screen.getAllByText('Standard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls applyPreset when preset clicked', () => {
    render(<PanelToolbar />);
    fireEvent.click(screen.getByTitle('Layout preset'));
    fireEvent.click(screen.getByText('Focus'));
    expect(mockApplyPreset).toHaveBeenCalledWith('focus');
  });

  it('shows panels dropdown when unlocked', () => {
    mockIsLocked = false;
    render(<PanelToolbar />);

    // The "Panels" button should be visible when unlocked
    const panelsButton = screen.getByTitle('Toggle panels');
    expect(panelsButton).toBeInTheDocument();
  });

  it('hides panels dropdown when locked', () => {
    mockIsLocked = true;
    render(<PanelToolbar />);

    // The "Panels" button should not be rendered when locked
    expect(screen.queryByTitle('Toggle panels')).not.toBeInTheDocument();
  });

  it('calls togglePanel when panel toggle clicked', () => {
    mockIsLocked = false;
    render(<PanelToolbar />);

    // Open the panels dropdown
    fireEvent.click(screen.getByTitle('Toggle panels'));

    // Click on a specific panel toggle
    fireEvent.click(screen.getByText('Terminal'));
    expect(mockTogglePanel).toHaveBeenCalledWith('terminal');
  });
});
