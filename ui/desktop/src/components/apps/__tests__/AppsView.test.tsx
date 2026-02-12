import { render, screen, waitFor } from '@testing-library/react';

// ── Mock data ──────────────────────────────────────────────────────────────────

const mockApps = [
  {
    name: 'my-cool-app',
    uri: 'http://localhost:3000/app/my-cool-app',
    description: 'A cool application',
    mcpServers: ['apps'],
  },
  {
    name: 'external-tool',
    uri: 'http://localhost:3000/app/external-tool',
    description: 'An external MCP tool',
    mcpServers: ['external-server'],
  },
];

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockListApps = vi.fn();
const mockExportApp = vi.fn();
const mockImportApp = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/apps', state: null }),
}));

vi.mock('../../../api', () => ({
  listApps: (...args: unknown[]) => mockListApps(...args),
  exportApp: (...args: unknown[]) => mockExportApp(...args),
  importApp: (...args: unknown[]) => mockImportApp(...args),
}));

vi.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => ({
    chat: { sessionId: 'test-session-id' },
  }),
}));

vi.mock('../../../utils/conversionUtils', () => ({
  formatAppName: (name: string) => name.replace(/-/g, ' '),
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-panel-layout">{children}</div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Download: () => <span data-testid="icon-download" />,
  Play: () => <span data-testid="icon-play" />,
  Upload: () => <span data-testid="icon-upload" />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import AppsView from '../AppsView';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AppsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApps.mockResolvedValue({ data: { apps: mockApps } });

    // Mock window.electron.launchApp
    Object.defineProperty(window, 'electron', {
      writable: true,
      value: {
        ...window.electron,
        launchApp: vi.fn(() => Promise.resolve()),
      },
    });
  });

  it('renders the page title "Apps"', async () => {
    render(<AppsView />);
    expect(screen.getByText('Apps')).toBeInTheDocument();
  });

  it('renders inside MainPanelLayout', () => {
    render(<AppsView />);
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockListApps.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AppsView />);
    expect(screen.getByText('Loading apps...')).toBeInTheDocument();
  });

  it('displays app names after loading', async () => {
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText('my cool app')).toBeInTheDocument();
      expect(screen.getByText('external tool')).toBeInTheDocument();
    });
  });

  it('displays app descriptions', async () => {
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText('A cool application')).toBeInTheDocument();
      expect(screen.getByText('An external MCP tool')).toBeInTheDocument();
    });
  });

  it('shows empty state when no apps available', async () => {
    mockListApps.mockResolvedValue({ data: { apps: [] } });
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText('No apps available')).toBeInTheDocument();
    });
  });

  it('shows error state when loading fails and no cached apps', async () => {
    mockListApps.mockRejectedValue(new Error('Server error'));
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading apps/)).toBeInTheDocument();
    });
  });

  it('renders Import App button', () => {
    render(<AppsView />);
    expect(screen.getByText('Import App')).toBeInTheDocument();
  });

  it('renders experimental feature warning', () => {
    render(<AppsView />);
    expect(screen.getByText(/Experimental feature/)).toBeInTheDocument();
  });

  it('shows Launch button for each app', async () => {
    render(<AppsView />);

    await waitFor(() => {
      const launchButtons = screen.getAllByText('Launch');
      expect(launchButtons.length).toBe(2);
    });
  });

  it('shows Custom app badge for apps from "apps" MCP server', async () => {
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText('Custom app')).toBeInTheDocument();
    });
  });

  it('shows MCP server name for non-custom apps', async () => {
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText('external-server')).toBeInTheDocument();
    });
  });

  it('shows Retry button on error state', async () => {
    mockListApps.mockRejectedValue(new Error('Network error'));
    render(<AppsView />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});
