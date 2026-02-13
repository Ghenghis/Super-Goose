import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock lucide-react icons used by zones and PanelToolbar
vi.mock('lucide-react', () => ({
  ChevronDown: (props: { className?: string }) => <span data-testid="icon-chevron-down" className={props.className} />,
  ChevronUp: (props: { className?: string }) => <span data-testid="icon-chevron-up" className={props.className} />,
  Lock: (props: { className?: string }) => <span data-testid="icon-lock" className={props.className} />,
  Unlock: (props: { className?: string }) => <span data-testid="icon-unlock" className={props.className} />,
  PanelLeft: (props: { className?: string }) => <span data-testid="icon-panel-left" className={props.className} />,
  MessageSquare: (props: { className?: string }) => <span data-testid="icon-message-square" className={props.className} />,
  Workflow: (props: { className?: string }) => <span data-testid="icon-workflow" className={props.className} />,
  TerminalSquare: (props: { className?: string }) => <span data-testid="icon-terminal" className={props.className} />,
  Bot: (props: { className?: string }) => <span data-testid="icon-bot" className={props.className} />,
  Sparkles: (props: { className?: string }) => <span data-testid="icon-sparkles" className={props.className} />,
  ScrollText: (props: { className?: string }) => <span data-testid="icon-scroll-text" className={props.className} />,
  Search: (props: { className?: string }) => <span data-testid="icon-search" className={props.className} />,
  Bookmark: (props: { className?: string }) => <span data-testid="icon-bookmark" className={props.className} />,
  Eye: (props: { className?: string }) => <span data-testid="icon-eye" className={props.className} />,
  EyeOff: (props: { className?: string }) => <span data-testid="icon-eye-off" className={props.className} />,
}));

// Mock PanelToolbar so StatusBar doesn't pull in full PanelSystem wiring
vi.mock('../PanelSystem/PanelToolbar', () => ({
  PanelToolbar: () => <div data-testid="panel-toolbar">PanelToolbar</div>,
}));

// Mock PANEL_REGISTRY with minimal entries for RightZone and BottomZone tab rendering
vi.mock('../PanelSystem/PanelRegistry', () => ({
  PANEL_REGISTRY: {
    agentPanel: {
      id: 'agentPanel',
      title: 'Agent',
      icon: (props: { className?: string }) => <span data-testid="icon-agent" className={props.className} />,
      defaultZone: 'right',
      collapsible: true,
      closable: true,
      order: 0,
    },
    superGoose: {
      id: 'superGoose',
      title: 'Super-Goose',
      icon: (props: { className?: string }) => <span data-testid="icon-super-goose" className={props.className} />,
      defaultZone: 'right',
      collapsible: true,
      closable: true,
      order: 1,
    },
    pipeline: {
      id: 'pipeline',
      title: 'Pipeline',
      icon: (props: { className?: string }) => <span data-testid="icon-pipeline" className={props.className} />,
      defaultZone: 'bottom',
      collapsible: true,
      closable: true,
      order: 0,
    },
    terminal: {
      id: 'terminal',
      title: 'Terminal',
      icon: (props: { className?: string }) => <span data-testid="icon-terminal-tab" className={props.className} />,
      defaultZone: 'bottom',
      collapsible: true,
      closable: true,
      order: 1,
    },
  },
  getPanelsForZone: vi.fn(),
  getPanelConfig: vi.fn(),
  getAllPanelIds: vi.fn(),
  getToggleablePanels: vi.fn(() => []),
}));

// usePanelSystem mock — configurable per test
const mockSetActivePanel = vi.fn();
const mockToggleZoneCollapsed = vi.fn();

const defaultPanelSystemValue = {
  layout: {
    zones: {
      left: { panels: ['sidebar'], sizePercent: 15, collapsed: false, visible: true },
      center: { panels: ['chat'], sizePercent: 60, collapsed: false, visible: true },
      right: { panels: ['agentPanel', 'superGoose'], sizePercent: 25, collapsed: false, visible: true, activePanel: 'agentPanel' },
      bottom: { panels: ['pipeline', 'terminal'], sizePercent: 20, collapsed: false, visible: true, activePanel: 'pipeline' },
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
  toggleZoneCollapsed: mockToggleZoneCollapsed,
  toggleZoneVisible: vi.fn(),
  setActivePanel: mockSetActivePanel,
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

// ── Import components (after mocks) ──────────────────────────────────────────

import { LeftZone } from '../zones/LeftZone';
import { CenterZone } from '../zones/CenterZone';
import { RightZone } from '../zones/RightZone';
import { BottomZone } from '../zones/BottomZone';
import { StatusBar } from '../zones/StatusBar';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LeftZone', () => {
  it('renders children', () => {
    render(<LeftZone><span data-testid="child">Hello</span></LeftZone>);
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('has data-testid="left-zone"', () => {
    render(<LeftZone><span>Content</span></LeftZone>);
    expect(screen.getByTestId('left-zone')).toBeInTheDocument();
  });
});

describe('CenterZone', () => {
  it('renders children', () => {
    render(<CenterZone><span data-testid="child">Chat Area</span></CenterZone>);
    expect(screen.getByTestId('child')).toHaveTextContent('Chat Area');
  });

  it('has data-testid="center-zone"', () => {
    render(<CenterZone><span>Content</span></CenterZone>);
    expect(screen.getByTestId('center-zone')).toBeInTheDocument();
  });
});

describe('RightZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePanelSystem.mockReturnValue(defaultPanelSystemValue);
  });

  it('renders null when no panels', () => {
    mockUsePanelSystem.mockReturnValue({
      ...defaultPanelSystemValue,
      layout: {
        ...defaultPanelSystemValue.layout,
        zones: {
          ...defaultPanelSystemValue.layout.zones,
          right: { panels: [] as string[], sizePercent: 0, collapsed: true, visible: false, activePanel: '' },
        },
      },
    });
    const { container } = render(<RightZone />);
    expect(container.innerHTML).toBe('');
  });

  it('renders tab strip with multiple panels', () => {
    render(<RightZone />);
    expect(screen.getByTestId('right-zone')).toBeInTheDocument();
    // With two panels in the right zone, both tab buttons should appear
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Super-Goose')).toBeInTheDocument();
  });

  it('renders active panel content from panelComponents', () => {
    render(
      <RightZone
        panelComponents={{
          agentPanel: <div data-testid="agent-content">Agent Panel Content</div>,
          superGoose: <div data-testid="sg-content">Super-Goose Content</div>,
        }}
      />
    );
    // Active panel is agentPanel per the mock
    expect(screen.getByTestId('agent-content')).toHaveTextContent('Agent Panel Content');
  });
});

describe('BottomZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePanelSystem.mockReturnValue(defaultPanelSystemValue);
  });

  it('renders null when no panels', () => {
    mockUsePanelSystem.mockReturnValue({
      ...defaultPanelSystemValue,
      layout: {
        ...defaultPanelSystemValue.layout,
        zones: {
          ...defaultPanelSystemValue.layout.zones,
          bottom: { panels: [] as string[], sizePercent: 0, collapsed: true, visible: false, activePanel: '' },
        },
      },
    });
    const { container } = render(<BottomZone />);
    expect(container.innerHTML).toBe('');
  });

  it('renders tab strip', () => {
    render(<BottomZone />);
    expect(screen.getByTestId('bottom-zone')).toBeInTheDocument();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('renders collapse toggle', () => {
    render(<BottomZone />);
    // The non-collapsed state shows a "Collapse panel" button
    const collapseBtn = screen.getByTitle('Collapse panel');
    expect(collapseBtn).toBeInTheDocument();
  });

  it('hides content when collapsed', () => {
    mockUsePanelSystem.mockReturnValue({
      ...defaultPanelSystemValue,
      layout: {
        ...defaultPanelSystemValue.layout,
        zones: {
          ...defaultPanelSystemValue.layout.zones,
          bottom: { panels: ['pipeline', 'terminal'], sizePercent: 20, collapsed: true, visible: true, activePanel: 'pipeline' },
        },
      },
    });
    render(
      <BottomZone
        panelComponents={{
          pipeline: <div data-testid="pipeline-content">Pipeline Viz</div>,
        }}
      />
    );
    // The bottom zone container should exist (tab strip visible)
    expect(screen.getByTestId('bottom-zone')).toBeInTheDocument();
    // But the panel content should NOT be rendered when collapsed
    expect(screen.queryByTestId('pipeline-content')).not.toBeInTheDocument();
    // Expand button should show instead of collapse
    expect(screen.getByTitle('Expand panel')).toBeInTheDocument();
  });
});

describe('StatusBar', () => {
  it('renders children', () => {
    render(<StatusBar><span data-testid="child">Model: GPT-4</span></StatusBar>);
    expect(screen.getByTestId('child')).toHaveTextContent('Model: GPT-4');
  });

  it('has data-testid="status-bar"', () => {
    render(<StatusBar><span>Content</span></StatusBar>);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('renders PanelToolbar', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('panel-toolbar')).toBeInTheDocument();
  });
});
