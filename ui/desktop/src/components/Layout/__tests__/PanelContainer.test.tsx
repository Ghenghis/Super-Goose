import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PanelConfig } from '../PanelSystem/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockTogglePanel = vi.fn();
const mockToggleZoneCollapsed = vi.fn();
let mockIsLocked = true;

vi.mock('../PanelSystem/PanelSystemProvider', () => ({
  usePanelSystem: () => ({
    isLocked: mockIsLocked,
    togglePanel: mockTogglePanel,
    toggleZoneCollapsed: mockToggleZoneCollapsed,
  }),
}));

vi.mock('lucide-react', () => ({
  GripVertical: () => <span data-testid="icon-grip-vertical" />,
  Minimize2: () => <span data-testid="icon-minimize2" />,
  Maximize2: () => <span data-testid="icon-maximize2" />,
  X: () => <span data-testid="icon-x" />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import { PanelContainer } from '../PanelSystem/PanelContainer';

// ── Test helpers ───────────────────────────────────────────────────────────────

const MockIcon = ({ className }: { className?: string }) => (
  <span data-testid="panel-icon" className={className} />
);

function createMockConfig(overrides: Partial<PanelConfig> = {}): PanelConfig {
  return {
    id: 'pipeline',
    title: 'Test Panel',
    icon: MockIcon,
    component: () => null,
    defaultZone: 'bottom',
    collapsible: true,
    closable: true,
    order: 0,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PanelContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLocked = true;
  });

  it('renders children content', () => {
    const config = createMockConfig();
    render(
      <PanelContainer config={config} zone="bottom">
        <div data-testid="child-content">Hello</div>
      </PanelContainer>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toHaveTextContent('Hello');
  });

  it('shows panel header when not hidden', () => {
    const config = createMockConfig();
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
  });

  it('hides panel header when hideHeader is true', () => {
    const config = createMockConfig();
    render(
      <PanelContainer config={config} zone="bottom" hideHeader>
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.queryByText('Test Panel')).not.toBeInTheDocument();
  });

  it('hides header for center zone when locked', () => {
    mockIsLocked = true;
    const config = createMockConfig({ id: 'chat', defaultZone: 'center' });
    render(
      <PanelContainer config={config} zone="center">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.queryByText('Test Panel')).not.toBeInTheDocument();
  });

  it('shows header for center zone when unlocked', () => {
    mockIsLocked = false;
    const config = createMockConfig({ id: 'chat', defaultZone: 'center' });
    render(
      <PanelContainer config={config} zone="center">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
  });

  it('shows drag grip when unlocked', () => {
    mockIsLocked = false;
    const config = createMockConfig();
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.getByTestId('icon-grip-vertical')).toBeInTheDocument();
  });

  it('hides drag grip when locked', () => {
    mockIsLocked = true;
    const config = createMockConfig();
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.queryByTestId('icon-grip-vertical')).not.toBeInTheDocument();
  });

  it('shows close button for closable panels', () => {
    const config = createMockConfig({ closable: true });
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.getByTitle('Close')).toBeInTheDocument();
  });

  it('hides close button for non-closable panels', () => {
    const config = createMockConfig({ closable: false });
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument();
  });

  it('calls togglePanel when close button clicked', () => {
    const config = createMockConfig({ closable: true });
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    fireEvent.click(screen.getByTitle('Close'));
    expect(mockTogglePanel).toHaveBeenCalledWith('pipeline');
  });

  it('calls toggleZoneCollapsed when minimize clicked', () => {
    const config = createMockConfig({ collapsible: true });
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    fireEvent.click(screen.getByTitle('Minimize'));
    expect(mockToggleZoneCollapsed).toHaveBeenCalledWith('bottom');
  });

  it('renders panel icon and title', () => {
    const config = createMockConfig();
    render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    expect(screen.getByTestId('panel-icon')).toBeInTheDocument();
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
  });

  it('has data-panel-id attribute', () => {
    const config = createMockConfig({ id: 'terminal' });
    const { container } = render(
      <PanelContainer config={config} zone="bottom">
        <div>Content</div>
      </PanelContainer>
    );
    const wrapper = container.querySelector('[data-panel-id="terminal"]');
    expect(wrapper).toBeInTheDocument();
  });
});
