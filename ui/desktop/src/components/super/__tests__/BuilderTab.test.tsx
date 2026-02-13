import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentsPanel from '../AgentsPanel';

// Mock hooks and API
const mockUseAgentStream = vi.fn();
vi.mock('../../../hooks/useAgentStream', () => ({
  useAgentStream: (...args: unknown[]) => mockUseAgentStream(...args),
}));

vi.mock('../../../utils/backendApi', () => ({
  backendApi: {
    switchCore: vi.fn().mockResolvedValue({ success: true, active_core: 'freeform', message: 'ok' }),
    listCores: vi.fn().mockResolvedValue([]),
    getCoreConfig: vi.fn().mockResolvedValue(null),
    setCoreConfig: vi.fn().mockResolvedValue({ success: true, message: 'Configuration saved' }),
  },
}));

beforeEach(() => {
  mockUseAgentStream.mockReturnValue({
    events: [],
    connected: false,
    latestStatus: null,
    clearEvents: vi.fn(),
  });
});
afterEach(() => vi.restoreAllMocks());

function goToBuilder() {
  render(<AgentsPanel />);
  fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
}

describe('Builder Tab - Core Configuration', () => {
  it('renders auto-selection toggle', () => {
    goToBuilder();
    const toggle = screen.getByLabelText('Enable auto-selection');
    expect(toggle).toBeDefined();
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });

  it('renders confidence threshold slider', () => {
    goToBuilder();
    const slider = screen.getByLabelText('Confidence threshold') as HTMLInputElement;
    expect(slider).toBeDefined();
    expect(slider.value).toBe('0.7');
  });

  it('renders preferred core dropdown with all 6 cores', () => {
    goToBuilder();
    const select = screen.getByLabelText('Preferred core') as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.options.length).toBe(6);
  });

  it('renders priority list with all 6 cores', () => {
    goToBuilder();
    expect(screen.getByText('Core Priority Order')).toBeDefined();
    // Core names appear in both the dropdown and the priority list, so use getAllByText
    expect(screen.getAllByText('FreeformCore').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('AdversarialCore').length).toBeGreaterThanOrEqual(1);
    // Verify all 6 move-up buttons exist (one per core in priority list)
    expect(screen.getAllByLabelText(/Move .* up/).length).toBe(6);
  });

  it('can toggle auto-selection off', () => {
    goToBuilder();
    const toggle = screen.getByLabelText('Enable auto-selection') as HTMLInputElement;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
  });

  it('can change confidence threshold', () => {
    goToBuilder();
    const slider = screen.getByLabelText('Confidence threshold') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.3' } });
    expect(screen.getByText(/0\.3/)).toBeDefined();
  });

  it('can change preferred core', () => {
    goToBuilder();
    const select = screen.getByLabelText('Preferred core') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'orchestrator' } });
    expect(select.value).toBe('orchestrator');
  });

  it('renders save button', () => {
    goToBuilder();
    expect(screen.getByText('Save Configuration')).toBeDefined();
  });

  it('renders move up/down buttons for priority reorder', () => {
    goToBuilder();
    // First core should have move down but not move up (disabled)
    const moveUpBtns = screen.getAllByLabelText(/Move .* up/);
    const moveDownBtns = screen.getAllByLabelText(/Move .* down/);
    expect(moveUpBtns.length).toBe(6);
    expect(moveDownBtns.length).toBe(6);
    // First up button should be disabled
    expect(moveUpBtns[0]).toHaveProperty('disabled', true);
    // Last down button should be disabled
    expect(moveDownBtns[moveDownBtns.length - 1]).toHaveProperty('disabled', true);
  });

  it('can reorder priorities with move down', () => {
    goToBuilder();
    // Click move down on first core (FreeformCore)
    const moveDownBtns = screen.getAllByLabelText(/Move .* down/);
    fireEvent.click(moveDownBtns[0]);
    // After move, StructuredCore should now be #1 (first move-up button label)
    // FreeformCore moves to #2
    const moveUpBtns = screen.getAllByLabelText(/Move .* up/);
    expect(moveUpBtns[0].getAttribute('aria-label')).toBe('Move StructuredCore up');
    expect(moveUpBtns[1].getAttribute('aria-label')).toBe('Move FreeformCore up');
  });
});
