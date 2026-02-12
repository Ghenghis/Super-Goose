import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockUseLocation = vi.fn(() => ({ pathname: '/', state: null }));
const mockCreateChatWindow = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
  Outlet: () => <div data-testid="outlet">Outlet Content</div>,
}));

vi.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => ({
    chat: { sessionId: 'test-session' },
    setChat: vi.fn(),
  }),
}));

vi.mock('../../ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-provider">{children}</div>
  ),
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar">{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-inset">{children}</div>
  ),
  SidebarTrigger: ({ className: _className }: { className?: string }) => (
    <button data-testid="sidebar-trigger">Toggle</button>
  ),
  useSidebar: () => ({
    isMobile: false,
    openMobile: false,
  }),
}));

vi.mock('../../GooseSidebar/AppSidebar', () => ({
  default: ({
    onSelectSession,
    setView,
    currentPath,
  }: {
    onSelectSession: (id: string) => void;
    setView: (view: string) => void;
    currentPath: string;
  }) => (
    <div data-testid="app-sidebar">
      <span data-testid="current-path">{currentPath}</span>
      <button data-testid="sidebar-select-session" onClick={() => onSelectSession('sess-1')}>
        Select Session
      </button>
      <button data-testid="sidebar-nav-settings" onClick={() => setView('settings')}>
        Settings
      </button>
    </div>
  ),
}));

vi.mock('../../ChatSessionsContainer', () => ({
  default: () => <div data-testid="chat-sessions-container">Sessions Container</div>,
}));

vi.mock('../../timewarp', () => ({
  TimeWarpProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="timewarp-provider">{children}</div>
  ),
  TimeWarpBar: () => <div data-testid="timewarp-bar">TimeWarp</div>,
}));

vi.mock('../../GooseSidebar/AgentPanelContext', () => ({
  AgentPanelProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="agent-panel-provider">{children}</div>
  ),
}));

vi.mock('../../cli/CLIContext', () => ({
  CLIProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cli-provider">{children}</div>
  ),
}));

vi.mock('../PanelSystem', () => ({
  PanelSystemProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-system-provider">{children}</div>
  ),
  usePanelSystem: () => ({
    layout: {
      zones: {
        left: { panels: ['sidebar'], sizePercent: 15, collapsed: false, visible: true },
        center: { panels: ['chat'], sizePercent: 85, collapsed: false, visible: true },
        right: { panels: [], sizePercent: 0, collapsed: true, visible: false },
        bottom: { panels: ['pipeline'], sizePercent: 25, collapsed: false, visible: true },
      },
      presetId: 'standard',
      locked: true,
    },
    isLocked: true,
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
  }),
}));

vi.mock('../ResizableLayout', () => ({
  ResizableLayout: ({
    leftContent,
    centerContent,
  }: {
    leftContent: React.ReactNode;
    centerContent: React.ReactNode;
    bottomPanelComponents?: Record<string, React.ReactNode>;
  }) => (
    <div data-testid="resizable-layout">
      <div data-testid="left-zone">{leftContent}</div>
      <div data-testid="center-zone">{centerContent}</div>
    </div>
  ),
}));

vi.mock('../../pipeline', () => ({
  AnimatedPipeline: () => <div data-testid="animated-pipeline">Pipeline</div>,
  usePipeline: () => ({
    isVisible: true,
    isExpanded: false,
    toggleExpanded: vi.fn(),
  }),
}));

vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} title={title} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  AppWindowMac: () => <span data-testid="icon-mac-window" />,
  AppWindow: () => <span data-testid="icon-window" />,
  // Icons used by PanelRegistry (imported transitively via PanelSystemProvider)
  PanelLeft: () => <span data-testid="icon-panel-left" />,
  MessageSquare: () => <span data-testid="icon-message-square" />,
  Workflow: () => <span data-testid="icon-workflow" />,
  TerminalSquare: () => <span data-testid="icon-terminal" />,
  Bot: () => <span data-testid="icon-bot" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  ScrollText: () => <span data-testid="icon-scroll-text" />,
  Search: () => <span data-testid="icon-search" />,
  Bookmark: () => <span data-testid="icon-bookmark" />,
  // Icons used by PanelLayoutPresets
  Maximize: () => <span data-testid="icon-maximize" />,
  Layout: () => <span data-testid="icon-layout" />,
  LayoutDashboard: () => <span data-testid="icon-layout-dashboard" />,
  Settings2: () => <span data-testid="icon-settings2" />,
  // Icons used by PanelToolbar
  Lock: () => <span data-testid="icon-lock" />,
  Unlock: () => <span data-testid="icon-unlock" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  Eye: () => <span data-testid="icon-eye" />,
  EyeOff: () => <span data-testid="icon-eye-off" />,
  // Icons used by PanelContainer
  GripVertical: () => <span data-testid="icon-grip-vertical" />,
  Minimize2: () => <span data-testid="icon-minimize2" />,
  Maximize2: () => <span data-testid="icon-maximize2" />,
  X: () => <span data-testid="icon-x" />,
  // Icons used by BottomZone
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import { AppLayout } from '../AppLayout';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AppLayout', () => {
  const defaultProps = {
    activeSessions: [] as Array<{ sessionId: string }>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation.mockReturnValue({ pathname: '/', state: null });

    Object.defineProperty(window, 'electron', {
      writable: true,
      value: {
        ...window.electron,
        platform: 'darwin',
        createChatWindow: mockCreateChatWindow,
      },
    });

    Object.defineProperty(window, 'appConfig', {
      writable: true,
      value: {
        get: vi.fn((key: string) => {
          if (key === 'GOOSE_WORKING_DIR') return '/home/user';
          return undefined;
        }),
      },
    });
  });

  it('renders the provider hierarchy', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('timewarp-provider')).toBeInTheDocument();
    expect(screen.getByTestId('agent-panel-provider')).toBeInTheDocument();
    expect(screen.getByTestId('cli-provider')).toBeInTheDocument();
    expect(screen.getByTestId('panel-system-provider')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-provider')).toBeInTheDocument();
  });

  it('renders the resizable layout', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('resizable-layout')).toBeInTheDocument();
  });

  it('renders AppSidebar in the left zone', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('left-zone')).toBeInTheDocument();
  });

  it('renders the Outlet for routed content', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('renders the TimeWarpBar', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('timewarp-bar')).toBeInTheDocument();
  });

  it('renders the sidebar trigger button', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('sidebar-trigger')).toBeInTheDocument();
  });

  it('renders the new window button', () => {
    render(<AppLayout {...defaultProps} />);
    const newWindowBtn = screen.getByTitle('Start a new session in a new window');
    expect(newWindowBtn).toBeInTheDocument();
  });

  it('calls createChatWindow when new window button is clicked', () => {
    render(<AppLayout {...defaultProps} />);
    const btn = screen.getByTitle('Start a new session in a new window');
    fireEvent.click(btn);
    expect(mockCreateChatWindow).toHaveBeenCalled();
  });

  it('passes current pathname to AppSidebar', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('current-path')).toHaveTextContent('/');
  });

  it('navigates when sidebar session is selected', () => {
    render(<AppLayout {...defaultProps} />);
    fireEvent.click(screen.getByTestId('sidebar-select-session'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { state: { sessionId: 'sess-1' } });
  });

  it('renders ChatSessionsContainer', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('chat-sessions-container')).toBeInTheDocument();
  });

  it('renders macOS window icon when platform is darwin', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('icon-mac-window')).toBeInTheDocument();
  });
});
