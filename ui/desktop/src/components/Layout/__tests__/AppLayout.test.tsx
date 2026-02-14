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

// Mock Super-Goose right panel components
vi.mock('../../GooseSidebar/AgentStatusPanel', () => ({
  default: () => <div data-testid="agent-status-panel">Agent Status</div>,
}));
vi.mock('../../GooseSidebar/TaskBoardPanel', () => ({
  default: () => <div data-testid="task-board-panel">Task Board</div>,
}));
vi.mock('../../GooseSidebar/FileActivityPanel', () => ({
  default: () => <div data-testid="file-activity-panel">File Activity</div>,
}));
vi.mock('../../GooseSidebar/SkillsPluginsPanel', () => ({
  default: () => <div data-testid="skills-plugins-panel">Skills</div>,
}));
vi.mock('../../GooseSidebar/ConnectorStatusPanel', () => ({
  default: () => <div data-testid="connector-status-panel">Connectors</div>,
}));
vi.mock('../../GooseSidebar/AgentMessagesPanel', () => ({
  default: () => <div data-testid="agent-messages-panel">Messages</div>,
}));
vi.mock('../../super/SuperGoosePanel', () => ({
  default: () => <div data-testid="super-goose-panel">Super Goose</div>,
}));

vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    title,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
    [key: string]: unknown;
  }) => {
    const dataProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k.startsWith('data-')) dataProps[k] = v;
    }
    return (
      <button onClick={onClick} title={title} data-testid="button" {...dataProps}>
        {children}
      </button>
    );
  },
}));

vi.mock('lucide-react', () => ({
  AppWindowMac: () => <span data-testid="icon-mac-window" />,
  AppWindow: () => <span data-testid="icon-window" />,
  PanelLeftIcon: () => <span data-testid="icon-panel-left-icon" />,
  PanelRightIcon: () => <span data-testid="icon-panel-right" />,
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
    expect(screen.getByTestId('sidebar-provider')).toBeInTheDocument();
  });

  it('renders the sidebar component', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders AppSidebar inside the sidebar', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
  });

  it('renders SidebarInset as the content area', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('sidebar-inset')).toBeInTheDocument();
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

  it('renders right panel toggle button', () => {
    render(<AppLayout {...defaultProps} />);
    const toggle = screen.getByTitle('Open right panel');
    expect(toggle).toBeInTheDocument();
  });

  it('opens right panel on toggle click', () => {
    render(<AppLayout {...defaultProps} />);
    const toggle = screen.getByTitle('Open right panel');
    fireEvent.click(toggle);
    // After opening, button title changes
    expect(screen.getByTitle('Close right panel')).toBeInTheDocument();
  });
});
