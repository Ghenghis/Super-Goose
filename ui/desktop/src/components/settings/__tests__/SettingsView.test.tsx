import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockTrackSettingsTabViewed = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/settings', state: null }),
}));

vi.mock('../../../updates', () => ({
  CONFIGURATION_ENABLED: true,
}));

vi.mock('../../../utils/analytics', () => ({
  trackSettingsTabViewed: (...args: unknown[]) => mockTrackSettingsTabViewed(...args),
}));

vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-panel-layout">{children}</div>
  ),
}));

vi.mock('../../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

vi.mock('../../ui/tabs', () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="tabs" data-value={value}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tabs-list" role="tablist">
      {children}
    </div>
  ),
  TabsTrigger: ({
    children,
    value,
    ...rest
  }: {
    children: React.ReactNode;
    value: string;
    [key: string]: unknown;
  }) => (
    <button
      role="tab"
      data-testid={`tab-trigger-${value}`}
      data-value={value}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </button>
  ),
  TabsContent: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
    [key: string]: unknown;
  }) => (
    <div data-testid={`tab-content-${value}`} role="tabpanel">
      {children}
    </div>
  ),
}));

vi.mock('../models/ModelsSection', () => ({
  default: () => <div data-testid="models-section">Models</div>,
}));

vi.mock('../sessions/SessionSharingSection', () => ({
  default: () => <div data-testid="session-sharing-section">Session Sharing</div>,
}));

vi.mock('../app/ExternalBackendSection', () => ({
  default: () => <div data-testid="external-backend-section">External Backend</div>,
}));

vi.mock('../app/AppSettingsSection', () => ({
  default: ({ scrollToSection }: { scrollToSection?: string }) => (
    <div data-testid="app-settings-section">App Settings (section: {scrollToSection ?? 'none'})</div>
  ),
}));

vi.mock('../config/ConfigSettings', () => ({
  default: () => <div data-testid="config-settings">Config</div>,
}));

vi.mock('../PromptsSettingsSection', () => ({
  default: () => <div data-testid="prompts-section">Prompts</div>,
}));

vi.mock('../chat/ChatSettingsSection', () => ({
  default: () => <div data-testid="chat-settings-section">Chat Settings</div>,
}));

vi.mock('../keyboard/KeyboardShortcutsSection', () => ({
  default: () => <div data-testid="keyboard-section">Keyboard Shortcuts</div>,
}));

vi.mock('../devices/DevicesSection', () => ({
  default: () => <div data-testid="devices-section">Devices</div>,
}));

vi.mock('../conscious/ConsciousSection', () => ({
  default: () => <div data-testid="conscious-section">Conscious</div>,
}));

vi.mock('../enterprise/EnterpriseSettingsSection', () => ({
  default: () => <div data-testid="enterprise-section">Enterprise</div>,
}));

vi.mock('../features/FeatureStatusDashboard', () => ({
  default: () => <div data-testid="features-section">Features Dashboard</div>,
}));

vi.mock('lucide-react', () => ({
  Bot: () => <span />,
  Share2: () => <span />,
  Monitor: () => <span />,
  MessageSquare: () => <span />,
  FileText: () => <span />,
  Keyboard: () => <span />,
  Wifi: () => <span />,
  Brain: () => <span />,
  Shield: () => <span />,
  Zap: () => <span />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import SettingsView from '../SettingsView';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SettingsView', () => {
  const defaultProps = {
    onClose: vi.fn(),
    setView: vi.fn(),
    viewOptions: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title "Settings"', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders inside MainPanelLayout', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('renders all tab triggers', () => {
    render(<SettingsView {...defaultProps} />);
    // The source component passes data-testid props like "settings-models-tab"
    expect(screen.getByTestId('settings-models-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-chat-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-sharing-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-prompts-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-keyboard-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-devices-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-conscious-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-features-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-enterprise-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-app-tab')).toBeInTheDocument();
  });

  it('defaults to the models tab', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-value', 'models');
  });

  it('renders the ModelsSection content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('models-section')).toBeInTheDocument();
  });

  it('renders the ChatSettingsSection content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('chat-settings-section')).toBeInTheDocument();
  });

  it('renders the SessionSharingSection content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('session-sharing-section')).toBeInTheDocument();
  });

  it('renders the PromptsSection content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('prompts-section')).toBeInTheDocument();
  });

  it('renders the KeyboardShortcutsSection content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('keyboard-section')).toBeInTheDocument();
  });

  it('renders the EnterpriseSettingsSection content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('enterprise-section')).toBeInTheDocument();
  });

  it('renders the FeatureStatusDashboard content', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('features-section')).toBeInTheDocument();
  });

  it('renders ConfigSettings when CONFIGURATION_ENABLED is true', () => {
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByTestId('config-settings')).toBeInTheDocument();
  });

  it('tracks the initial tab view on mount', () => {
    render(<SettingsView {...defaultProps} />);
    expect(mockTrackSettingsTabViewed).toHaveBeenCalledWith('models');
  });

  it('sets active tab based on viewOptions.section', () => {
    render(
      <SettingsView {...defaultProps} viewOptions={{ section: 'enterprise' }} />
    );
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-value', 'enterprise');
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<SettingsView {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders tab labels with correct text', () => {
    render(<SettingsView {...defaultProps} />);
    // Use getAllByText since tab labels may overlap with section content text
    expect(screen.getAllByText('Models').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Prompts').length).toBeGreaterThanOrEqual(1);
    // "Session" is the tab label for sharing tab
    expect(screen.getByTestId('settings-sharing-tab')).toHaveTextContent('Session');
    // "App" is the app tab label
    expect(screen.getByTestId('settings-app-tab')).toHaveTextContent('App');
  });
});
