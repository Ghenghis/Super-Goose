import { render, screen, waitFor } from '@testing-library/react';

// ── Mock data ──────────────────────────────────────────────────────────────────

const mockRecipes = [
  {
    id: 'recipe-1',
    recipe: {
      title: 'Code Review Helper',
      description: 'Helps with reviewing code changes',
      activities: [],
    },
    last_modified: '2026-01-15T10:00:00Z',
    schedule_cron: null,
    slash_command: null,
  },
  {
    id: 'recipe-2',
    recipe: {
      title: 'Test Writer',
      description: 'Generates unit tests for your code',
      activities: [],
    },
    last_modified: '2026-01-16T14:00:00Z',
    schedule_cron: '0 0 14 * * *',
    slash_command: 'tests',
  },
];

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockListSavedRecipes = vi.fn();
const mockSetView = vi.fn();
const mockStartAgent = vi.fn();
const mockDeleteRecipe = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/recipes', state: null }),
}));

vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: () => mockSetView,
}));

vi.mock('../../../hooks/useEscapeKey', () => ({
  useEscapeKey: vi.fn(),
}));

vi.mock('../../../recipe/recipe_management', () => ({
  listSavedRecipes: () => mockListSavedRecipes(),
  convertToLocaleDateString: (d: string) => d,
}));

vi.mock('../../../api', () => ({
  deleteRecipe: (...args: unknown[]) => mockDeleteRecipe(...args),
  startAgent: (...args: unknown[]) => mockStartAgent(...args),
  scheduleRecipe: vi.fn(),
  setRecipeSlashCommand: vi.fn(),
  recipeToYaml: vi.fn(),
}));

vi.mock('../../../recipe', () => ({
  generateDeepLink: vi.fn(() => Promise.resolve('goose://recipe/test')),
  stripEmptyExtensions: (r: unknown) => r,
}));

vi.mock('../../../utils/workingDir', () => ({
  getInitialWorkingDir: () => '/home/user/project',
}));

vi.mock('../../../utils/analytics', () => ({
  trackRecipeDeleted: vi.fn(),
  trackRecipeStarted: vi.fn(),
  trackRecipeDeeplinkCopied: vi.fn(),
  trackRecipeYamlCopied: vi.fn(),
  trackRecipeExportedToFile: vi.fn(),
  trackRecipeScheduled: vi.fn(),
  trackRecipeSlashCommandSet: vi.fn(),
  getErrorType: vi.fn(() => 'unknown'),
}));

vi.mock('../../../utils/keyboardShortcuts', () => ({
  getSearchShortcutText: () => 'Ctrl+F',
}));

vi.mock('../../../utils/conversionUtils', () => ({
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
  formatAppName: (n: string) => n,
}));

vi.mock('../../../constants/events', () => ({
  AppEvents: { SESSION_CREATED: 'session-created' },
}));

vi.mock('../../../toasts', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('cronstrue', () => ({
  default: { toString: (c: string) => `Every day at ${c}` },
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

vi.mock('../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: (props: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    title?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={props.onClick} disabled={props.disabled} title={props.title} data-testid="button">
      {props.children}
    </button>
  ),
}));

vi.mock('../../ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="dropdown-item" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../../ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

vi.mock('../ImportRecipeForm', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="import-recipe-form">Import</div> : null,
  ImportRecipeButton: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="import-recipe-button" onClick={onClick}>
      Import
    </button>
  ),
}));

vi.mock('../CreateEditRecipeModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-edit-modal">Editor</div> : null,
}));

vi.mock('../../schedule/CronPicker', () => ({
  CronPicker: () => <div data-testid="cron-picker" />,
}));

vi.mock('lucide-react', () => ({
  FileText: () => <span data-testid="icon-file-text" />,
  Edit: () => <span />,
  Trash2: () => <span />,
  Play: () => <span />,
  Calendar: () => <span />,
  AlertCircle: () => <span data-testid="icon-alert" />,
  Link: () => <span />,
  Clock: () => <span />,
  Terminal: () => <span />,
  ExternalLink: () => <span />,
  Share2: () => <span />,
  Copy: () => <span />,
  Download: () => <span />,
}));

// ── Import component (after mocks) ────────────────────────────────────────────

import RecipesView from '../RecipesView';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RecipesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockListSavedRecipes.mockResolvedValue(mockRecipes);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the page title "Recipes"', async () => {
    render(<RecipesView />);
    expect(screen.getByText('Recipes')).toBeInTheDocument();
  });

  it('renders inside MainPanelLayout', async () => {
    render(<RecipesView />);
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('shows skeleton loading state initially', () => {
    mockListSavedRecipes.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RecipesView />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows recipe titles after loading completes', async () => {
    render(<RecipesView />);

    // Advance timers for skeleton delay
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Code Review Helper')).toBeInTheDocument();
      expect(screen.getByText('Test Writer')).toBeInTheDocument();
    });
  });

  it('shows error state when loading fails', async () => {
    mockListSavedRecipes.mockRejectedValue(new Error('Network error'));
    render(<RecipesView />);

    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Recipes')).toBeInTheDocument();
    });
  });

  it('shows empty state when no recipes are saved', async () => {
    mockListSavedRecipes.mockResolvedValue([]);
    render(<RecipesView />);

    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('No saved recipes')).toBeInTheDocument();
    });
  });

  it('renders the Create Recipe button', () => {
    render(<RecipesView />);
    expect(screen.getByText('Create Recipe')).toBeInTheDocument();
  });

  it('renders the Import button', () => {
    render(<RecipesView />);
    expect(screen.getByTestId('import-recipe-button')).toBeInTheDocument();
  });

  it('calls listSavedRecipes on mount', () => {
    render(<RecipesView />);
    expect(mockListSavedRecipes).toHaveBeenCalledTimes(1);
  });

  it('displays recipe descriptions after loading', async () => {
    render(<RecipesView />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Helps with reviewing code changes')).toBeInTheDocument();
      expect(screen.getByText('Generates unit tests for your code')).toBeInTheDocument();
    });
  });

  it('shows the Try Again button on error state', async () => {
    mockListSavedRecipes.mockRejectedValue(new Error('fail'));
    render(<RecipesView />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('shows the error message text on error state', async () => {
    mockListSavedRecipes.mockRejectedValue(new Error('Server unavailable'));
    render(<RecipesView />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    });
  });
});
