import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock react-resizable-panels
vi.mock('react-resizable-panels', () => ({
  Group: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="resizable-group" data-orientation={props.orientation}>
      {children}
    </div>
  ),
  Panel: ({ children, id }: { children: React.ReactNode; id?: string; [key: string]: unknown }) => (
    <div data-testid={`resizable-panel-${id ?? 'unknown'}`}>{children}</div>
  ),
  Separator: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="resizable-separator">{children}</div>
  ),
}));

// Track usePanelSystem mock return value so individual tests can override
const defaultPanelSystemValue = {
  layout: {
    zones: {
      left: { panels: ['sidebar'], sizePercent: 15, collapsed: false, visible: true },
      center: { panels: ['chat'], sizePercent: 60, collapsed: false, visible: true },
      right: { panels: ['agentPanel'], sizePercent: 25, collapsed: false, visible: true },
      bottom: { panels: ['pipeline'], sizePercent: 20, collapsed: false, visible: true },
    },
    presetId: 'standard',
    locked: false,
  },
  isLocked: false,
  panels: {},
  presets: [],
  isPanelVisible: () => true,
  getPanelZone: () => null,
  updateZone: vi.fn(),
  toggleZoneCollapsed: vi.fn(),
  toggleZoneVisible: vi.fn(),
  setActivePanel: vi.fn(),
  movePanel: vi.fn(),
  togglePanel: vi.fn(),
  applyPreset: vi.fn(),
  toggleLocked: vi.fn(),
  setLocked: vi.fn(),
  resetLayout: vi.fn(),
  saveCustomLayout: vi.fn(),
  handlePanelResize: vi.fn(),
};

const mockUsePanelSystem = vi.fn(() => defaultPanelSystemValue);

vi.mock('../PanelSystem/PanelSystemProvider', () => ({
  PanelSystemProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-system-provider">{children}</div>
  ),
  usePanelSystem: () => mockUsePanelSystem(),
}));

// Mock zone components to capture props
vi.mock('../zones/LeftZone', () => ({
  LeftZone: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="left-zone">{children}</div>
  ),
}));

vi.mock('../zones/CenterZone', () => ({
  CenterZone: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="center-zone">{children}</div>
  ),
}));

vi.mock('../zones/RightZone', () => ({
  RightZone: ({ panelComponents }: { panelComponents?: Record<string, React.ReactNode> }) => (
    <div data-testid="right-zone">
      {panelComponents && Object.keys(panelComponents).map((key) => (
        <div key={key} data-testid={`right-panel-${key}`}>
          {panelComponents[key]}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../zones/BottomZone', () => ({
  BottomZone: ({ panelComponents }: { panelComponents?: Record<string, React.ReactNode> }) => (
    <div data-testid="bottom-zone">
      {panelComponents && Object.keys(panelComponents).map((key) => (
        <div key={key} data-testid={`bottom-panel-${key}`}>
          {panelComponents[key]}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../zones/StatusBar', () => ({
  StatusBar: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="status-bar">{children}</div>
  ),
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import { ResizableLayout } from '../ResizableLayout';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ResizableLayout', () => {
  const defaultProps = {
    leftContent: <div data-testid="left-content">Sidebar</div>,
    centerContent: <div data-testid="center-content">Chat</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePanelSystem.mockReturnValue(defaultPanelSystemValue);
  });

  it('renders the resizable-layout container', () => {
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.getByTestId('resizable-layout')).toBeInTheDocument();
  });

  it('renders left zone when visible', () => {
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.getByTestId('left-zone')).toBeInTheDocument();
  });

  it('hides left zone when not visible', () => {
    mockUsePanelSystem.mockReturnValue({
      ...defaultPanelSystemValue,
      layout: {
        ...defaultPanelSystemValue.layout,
        zones: {
          ...defaultPanelSystemValue.layout.zones,
          left: { panels: ['sidebar'], sizePercent: 15, collapsed: false, visible: false },
        },
      },
    });
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.queryByTestId('left-zone')).not.toBeInTheDocument();
  });

  it('always renders center zone', () => {
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.getByTestId('center-zone')).toBeInTheDocument();
  });

  it('renders right zone when visible with panels', () => {
    render(
      <ResizableLayout
        {...defaultProps}
        rightPanelComponents={{ agentPanel: <div>Agent</div> }}
      />
    );
    expect(screen.getByTestId('right-zone')).toBeInTheDocument();
  });

  it('hides right zone when no panels', () => {
    mockUsePanelSystem.mockReturnValue({
      ...defaultPanelSystemValue,
      layout: {
        ...defaultPanelSystemValue.layout,
        zones: {
          ...defaultPanelSystemValue.layout.zones,
          right: { panels: [], sizePercent: 0, collapsed: true, visible: true },
        },
      },
    });
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.queryByTestId('right-zone')).not.toBeInTheDocument();
  });

  it('renders bottom zone when visible with panels', () => {
    render(
      <ResizableLayout
        {...defaultProps}
        bottomPanelComponents={{ pipeline: <div>Pipeline</div> }}
      />
    );
    expect(screen.getByTestId('bottom-zone')).toBeInTheDocument();
  });

  it('renders status bar always', () => {
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('passes leftContent to LeftZone', () => {
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.getByTestId('left-content')).toBeInTheDocument();
    expect(screen.getByTestId('left-content')).toHaveTextContent('Sidebar');
  });

  it('passes centerContent to CenterZone', () => {
    render(<ResizableLayout {...defaultProps} />);
    expect(screen.getByTestId('center-content')).toBeInTheDocument();
    expect(screen.getByTestId('center-content')).toHaveTextContent('Chat');
  });

  it('passes panelComponents to RightZone', () => {
    render(
      <ResizableLayout
        {...defaultProps}
        rightPanelComponents={{ agentPanel: <div data-testid="agent-content">Agent Panel</div> }}
      />
    );
    expect(screen.getByTestId('right-panel-agentPanel')).toBeInTheDocument();
    expect(screen.getByTestId('agent-content')).toHaveTextContent('Agent Panel');
  });

  it('passes panelComponents to BottomZone', () => {
    render(
      <ResizableLayout
        {...defaultProps}
        bottomPanelComponents={{ pipeline: <div data-testid="pipeline-content">Pipeline</div> }}
      />
    );
    expect(screen.getByTestId('bottom-panel-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('pipeline-content')).toHaveTextContent('Pipeline');
  });
});
