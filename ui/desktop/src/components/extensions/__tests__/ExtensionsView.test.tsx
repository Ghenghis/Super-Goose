import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockAddExtension = vi.fn();
const mockActivateExtensionDefault = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/extensions', state: null }),
}));

vi.mock('../../ConfigContext', () => ({
  useConfig: () => ({
    addExtension: mockAddExtension,
  }),
}));

vi.mock('../../settings/extensions', () => ({
  activateExtensionDefault: (...args: unknown[]) => mockActivateExtensionDefault(...args),
}));

vi.mock('../../settings/extensions/utils', () => ({
  getDefaultFormData: () => ({
    name: '',
    type: 'stdio',
    command: '',
    args: [],
    envVars: [],
    timeout: 300,
  }),
  createExtensionConfig: vi.fn((data: unknown) => ({ name: 'test-ext', ...data as object })),
  ExtensionFormData: {},
}));

vi.mock('../../../utils/keyboardShortcuts', () => ({
  getSearchShortcutText: () => 'Ctrl+F',
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
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('../../ui/icons', () => ({
  GPSIcon: () => <span data-testid="gps-icon" />,
}));

vi.mock('../../settings/extensions/ExtensionsSection', () => ({
  default: ({
    searchTerm,
    hideButtons,
  }: {
    searchTerm?: string;
    hideButtons?: boolean;
    [key: string]: unknown;
  }) => (
    <div data-testid="extensions-section">
      <span data-testid="search-term">{searchTerm ?? ''}</span>
      <span data-testid="hide-buttons">{String(hideButtons)}</span>
    </div>
  ),
}));

vi.mock('../../settings/extensions/modal/ExtensionModal', () => ({
  default: ({
    title,
    onClose,
    onSubmit,
  }: {
    title: string;
    onClose: () => void;
    onSubmit: (data: unknown) => void;
    [key: string]: unknown;
  }) => (
    <div data-testid="extension-modal">
      <span data-testid="modal-title">{title}</span>
      <button data-testid="modal-close" onClick={onClose}>
        Close
      </button>
      <button data-testid="modal-submit" onClick={() => onSubmit({ name: 'new-ext' })}>
        Submit
      </button>
    </div>
  ),
}));

vi.mock('../../conversation/SearchView', () => ({
  SearchView: ({
    children,
  }: {
    children: React.ReactNode;
    onSearch: (t: string) => void;
    placeholder?: string;
  }) => <div data-testid="search-view">{children}</div>,
}));

vi.mock('lodash/kebabCase', () => ({
  default: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
}));

vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="icon-plus" />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import ExtensionsView from '../ExtensionsView';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ExtensionsView', () => {
  const defaultProps = {
    onClose: vi.fn(),
    setView: vi.fn(),
    viewOptions: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActivateExtensionDefault.mockResolvedValue(undefined);
  });

  it('renders the page title "Extensions"', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByText('Extensions')).toBeInTheDocument();
  });

  it('renders inside MainPanelLayout', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('renders the Add custom extension button', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByText('Add custom extension')).toBeInTheDocument();
  });

  it('renders the Browse extensions button', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByText('Browse extensions')).toBeInTheDocument();
  });

  it('renders the ExtensionsSection component', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByTestId('extensions-section')).toBeInTheDocument();
  });

  it('passes hideButtons=true to ExtensionsSection', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByTestId('hide-buttons')).toHaveTextContent('true');
  });

  it('does not show the modal by default', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.queryByTestId('extension-modal')).not.toBeInTheDocument();
  });

  it('opens the add modal when Add custom extension is clicked', () => {
    render(<ExtensionsView {...defaultProps} />);
    fireEvent.click(screen.getByText('Add custom extension'));
    expect(screen.getByTestId('extension-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Add custom extension');
  });

  it('closes the modal when close button is clicked', () => {
    render(<ExtensionsView {...defaultProps} />);
    fireEvent.click(screen.getByText('Add custom extension'));
    expect(screen.getByTestId('extension-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('extension-modal')).not.toBeInTheDocument();
  });

  it('calls activateExtensionDefault when modal submit is clicked', async () => {
    render(<ExtensionsView {...defaultProps} />);
    fireEvent.click(screen.getByText('Add custom extension'));
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockActivateExtensionDefault).toHaveBeenCalled();
    });
  });

  it('renders the SearchView wrapper', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(screen.getByTestId('search-view')).toBeInTheDocument();
  });

  it('renders MCP description text', () => {
    render(<ExtensionsView {...defaultProps} />);
    expect(
      screen.getByText(/These extensions use the Model Context Protocol/)
    ).toBeInTheDocument();
  });
});
