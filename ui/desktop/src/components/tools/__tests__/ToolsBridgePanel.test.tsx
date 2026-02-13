import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Use vi.hoisted so that MOCK_EXTENSIONS and mockBackendApi are available when vi.mock hoists.
const { MOCK_EXTENSIONS, mockBackendApi } = vi.hoisted(() => ({
  MOCK_EXTENSIONS: [
    {
      id: 'developer', name: 'developer', display_name: 'Developer',
      description: 'General development tools useful for software engineering.',
      enabled: true, type: 'builtin', env_keys: [] as string[], timeout: 300, bundled: true,
    },
    {
      id: 'memory', name: 'memory', display_name: 'Memory',
      description: 'Teach goose your preferences as you go.',
      enabled: false, type: 'builtin', env_keys: [] as string[], timeout: 300, bundled: true,
    },
    {
      id: 'crewai_bridge', name: 'crewai_bridge', display_name: 'CrewAI Bridge',
      description: 'CrewAI multi-agent task orchestration.',
      enabled: false, type: 'stdio', env_keys: [] as string[], timeout: 300, bundled: true,
    },
    {
      id: 'langgraph_bridge', name: 'langgraph_bridge', display_name: 'LangGraph Bridge',
      description: 'LangGraph stateful agent workflows.',
      enabled: false, type: 'stdio', env_keys: [] as string[], timeout: 300, bundled: true,
    },
    {
      id: 'resource_coordinator', name: 'resource_coordinator', display_name: 'Resource Coordinator',
      description: 'Resource allocation and management across agents.',
      enabled: false, type: 'stdio', env_keys: [] as string[], timeout: 300, bundled: true,
    },
    {
      id: 'playwright_bridge', name: 'playwright_bridge', display_name: 'Playwright Bridge',
      description: 'Playwright browser automation and testing.',
      enabled: false, type: 'stdio', env_keys: [] as string[], timeout: 300, bundled: true,
    },
  ],
  mockBackendApi: {
    getExtensions: vi.fn(),
    toggleExtension: vi.fn(),
  },
}));

vi.mock('../../settings/extensions/bundled-extensions.json', () => ({
  default: MOCK_EXTENSIONS,
}));

vi.mock('../../../utils/backendApi', () => ({
  backendApi: mockBackendApi,
}));

// Must import after mocks are set up
import ToolsBridgePanel from '../ToolsBridgePanel';

// ---------------------------------------------------------------------------
// Rendering & UI tests (bundled fallback)
// ---------------------------------------------------------------------------

describe('ToolsBridgePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: backend unavailable (returns null)
    mockBackendApi.getExtensions.mockResolvedValue(null);
    mockBackendApi.toggleExtension.mockResolvedValue(true);
  });

  it('renders the header with correct total and enabled counts', async () => {
    render(<ToolsBridgePanel />);
    await waitFor(() => {
      expect(screen.getByText(/6 registered/)).toBeInTheDocument();
      expect(screen.getByText(/1 enabled/)).toBeInTheDocument();
    });
  });

  it('renders all three tier sections with labels', async () => {
    render(<ToolsBridgePanel />);
    await waitFor(() => {
      expect(screen.getByText('Builtin (Rust)')).toBeInTheDocument();
      expect(screen.getByText('Stage 6 Python Bridges')).toBeInTheDocument();
      expect(screen.getByText('Additional Bridges')).toBeInTheDocument();
    });
  });

  it('shows the correct extension count badge per tier', async () => {
    render(<ToolsBridgePanel />);
    await waitFor(() => {
      // Tier 1 (builtin): developer, memory = 2
      const builtinSection = screen.getByText('Builtin (Rust)').closest('button')!;
      expect(within(builtinSection).getByText('2')).toBeInTheDocument();

      // Tier 2 (stage 6): crewai_bridge, langgraph_bridge = 2
      const stage6Section = screen.getByText('Stage 6 Python Bridges').closest('button')!;
      expect(within(stage6Section).getByText('2')).toBeInTheDocument();

      // Tier 3 (additional): resource_coordinator, playwright_bridge = 2
      const additionalSection = screen.getByText('Additional Bridges').closest('button')!;
      expect(within(additionalSection).getByText('2')).toBeInTheDocument();
    });
  });

  it('displays tool display names within the tier sections', async () => {
    render(<ToolsBridgePanel />);
    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('Memory')).toBeInTheDocument();
      expect(screen.getByText('CrewAI Bridge')).toBeInTheDocument();
      expect(screen.getByText('LangGraph Bridge')).toBeInTheDocument();
      expect(screen.getByText('Resource Coordinator')).toBeInTheDocument();
      expect(screen.getByText('Playwright Bridge')).toBeInTheDocument();
    });
  });

  it('renders the search input with placeholder', async () => {
    render(<ToolsBridgePanel />);
    const searchInput = screen.getByPlaceholderText('Search tools...');
    expect(searchInput).toBeInTheDocument();
  });

  it('filters tools by search query matching display_name', async () => {
    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    const searchInput = screen.getByPlaceholderText('Search tools...');
    await user.type(searchInput, 'crew');

    // CrewAI Bridge should remain
    expect(screen.getByText('CrewAI Bridge')).toBeInTheDocument();
    // Others should be filtered out
    expect(screen.queryByText('Developer')).not.toBeInTheDocument();
    expect(screen.queryByText('Memory')).not.toBeInTheDocument();
    expect(screen.queryByText('LangGraph Bridge')).not.toBeInTheDocument();
  });

  it('filters tools by search query matching description', async () => {
    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    const searchInput = screen.getByPlaceholderText('Search tools...');
    await user.type(searchInput, 'software engineering');

    // Only Developer matches by description
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.queryByText('CrewAI Bridge')).not.toBeInTheDocument();
  });

  it('collapses a tier section when its header is clicked', async () => {
    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    // "Developer" should be visible initially (tier1 expanded by default)
    expect(screen.getByText('Developer')).toBeInTheDocument();

    // Click the Builtin tier header to collapse
    const builtinHeader = screen.getByText('Builtin (Rust)').closest('button')!;
    await user.click(builtinHeader);

    // "Developer" should now be hidden because tier1 is collapsed
    expect(screen.queryByText('Developer')).not.toBeInTheDocument();
    // Memory should also be hidden
    expect(screen.queryByText('Memory')).not.toBeInTheDocument();

    // Other tier tools should still be visible
    expect(screen.getByText('CrewAI Bridge')).toBeInTheDocument();
  });

  it('re-expands a collapsed tier section when header is clicked again', async () => {
    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    const builtinHeader = screen.getByText('Builtin (Rust)').closest('button')!;

    // Collapse
    await user.click(builtinHeader);
    expect(screen.queryByText('Developer')).not.toBeInTheDocument();

    // Re-expand
    await user.click(builtinHeader);
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('toggles a tool enabled state when its switch is clicked', async () => {
    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    // Developer starts enabled; Memory starts disabled
    const devToggle = screen.getByRole('switch', { name: 'Toggle Developer' });
    expect(devToggle).toHaveAttribute('data-state', 'checked');

    // Click to disable
    await user.click(devToggle);
    expect(devToggle).toHaveAttribute('data-state', 'unchecked');

    // Header should update: 0 enabled now
    expect(screen.getByText(/0 enabled/)).toBeInTheDocument();
  });

  it('renders toggle switches for all tools', async () => {
    render(<ToolsBridgePanel />);

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBe(6); // one per tool
  });

  it('hides empty tier sections when search has no results for that tier', async () => {
    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    const searchInput = screen.getByPlaceholderText('Search tools...');
    await user.type(searchInput, 'Developer');

    // Only tier1 has matches; tier2 and tier3 should be hidden
    expect(screen.getByText('Builtin (Rust)')).toBeInTheDocument();
    expect(screen.queryByText('Stage 6 Python Bridges')).not.toBeInTheDocument();
    expect(screen.queryByText('Additional Bridges')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Backend API integration tests
// ---------------------------------------------------------------------------

describe('ToolsBridgePanel — API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackendApi.toggleExtension.mockResolvedValue(true);
  });

  it('shows loading indicator while fetching extensions', async () => {
    // Create a promise we control so the loading state is visible
    let resolveExtensions!: (value: unknown) => void;
    mockBackendApi.getExtensions.mockReturnValue(
      new Promise((resolve) => {
        resolveExtensions = resolve;
      })
    );

    render(<ToolsBridgePanel />);

    // Loading indicator should be visible
    expect(screen.getByText(/Loading\.\.\./)).toBeInTheDocument();

    // Resolve the promise to finish loading
    await act(async () => {
      resolveExtensions(null);
    });

    // Loading indicator should disappear
    await waitFor(() => {
      expect(screen.queryByText(/Loading\.\.\./)).not.toBeInTheDocument();
    });
  });

  it('fetches extensions from backend API on mount', async () => {
    const apiExtensions = [
      { key: 'developer', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev tools' },
      { key: 'memory', name: 'Memory', enabled: false, type: 'builtin', description: 'Memory system' },
      { key: 'custom_ext', name: 'Custom Extension', enabled: true, type: 'stdio', description: 'A custom tool' },
    ];
    mockBackendApi.getExtensions.mockResolvedValue(apiExtensions);

    render(<ToolsBridgePanel />);

    await waitFor(() => {
      expect(mockBackendApi.getExtensions).toHaveBeenCalledTimes(1);
    });

    // Should display API data, not bundled data
    await waitFor(() => {
      expect(screen.getByText(/3 registered/)).toBeInTheDocument();
      expect(screen.getByText(/2 enabled/)).toBeInTheDocument();
    });

    // Custom Extension from API should appear
    expect(screen.getByText('Custom Extension')).toBeInTheDocument();
  });

  it('falls back to bundled data when backend returns null', async () => {
    mockBackendApi.getExtensions.mockResolvedValue(null);

    render(<ToolsBridgePanel />);

    await waitFor(() => {
      expect(mockBackendApi.getExtensions).toHaveBeenCalledTimes(1);
    });

    // Should show fallback indicator
    await waitFor(() => {
      expect(screen.getByText(/Using fallback data/)).toBeInTheDocument();
    });

    // Should display bundled data (6 tools)
    expect(screen.getByText(/6 registered/)).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('falls back to bundled data when backend throws an error', async () => {
    mockBackendApi.getExtensions.mockRejectedValue(new Error('Network error'));

    render(<ToolsBridgePanel />);

    await waitFor(() => {
      expect(mockBackendApi.getExtensions).toHaveBeenCalledTimes(1);
    });

    // Should show fallback indicator
    await waitFor(() => {
      expect(screen.getByText(/Using fallback data/)).toBeInTheDocument();
    });

    // Should still display the bundled extensions
    expect(screen.getByText(/6 registered/)).toBeInTheDocument();
  });

  it('falls back to bundled data when backend returns empty array', async () => {
    mockBackendApi.getExtensions.mockResolvedValue([]);

    render(<ToolsBridgePanel />);

    await waitFor(() => {
      expect(screen.getByText(/Using fallback data/)).toBeInTheDocument();
    });

    // Should display bundled data
    expect(screen.getByText(/6 registered/)).toBeInTheDocument();
  });

  it('calls backendApi.toggleExtension when backend is available and toggle is clicked', async () => {
    const apiExtensions = [
      { key: 'developer', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev tools' },
      { key: 'memory', name: 'Memory', enabled: false, type: 'builtin', description: 'Memory system' },
    ];
    mockBackendApi.getExtensions.mockResolvedValue(apiExtensions);

    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    // Wait for API data to load
    await waitFor(() => {
      expect(screen.getByText(/2 registered/)).toBeInTheDocument();
    });

    // Toggle Developer off
    const devToggle = screen.getByRole('switch', { name: 'Toggle Developer' });
    await user.click(devToggle);

    expect(mockBackendApi.toggleExtension).toHaveBeenCalledTimes(1);
    expect(mockBackendApi.toggleExtension).toHaveBeenCalledWith('developer', false);
  });

  it('does NOT call backendApi.toggleExtension when backend is unavailable', async () => {
    mockBackendApi.getExtensions.mockResolvedValue(null);

    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    // Wait for fallback to load
    await waitFor(() => {
      expect(screen.getByText(/Using fallback data/)).toBeInTheDocument();
    });

    // Toggle Developer off — should only update local state, not call API
    const devToggle = screen.getByRole('switch', { name: 'Toggle Developer' });
    await user.click(devToggle);

    expect(mockBackendApi.toggleExtension).not.toHaveBeenCalled();
  });

  it('rolls back toggle on backend failure', async () => {
    const apiExtensions = [
      { key: 'developer', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev tools' },
    ];
    mockBackendApi.getExtensions.mockResolvedValue(apiExtensions);
    mockBackendApi.toggleExtension.mockResolvedValue(false); // simulate failure

    const user = userEvent.setup();
    render(<ToolsBridgePanel />);

    // Wait for API data
    await waitFor(() => {
      expect(screen.getByText(/1 registered/)).toBeInTheDocument();
    });

    const devToggle = screen.getByRole('switch', { name: 'Toggle Developer' });
    expect(devToggle).toHaveAttribute('data-state', 'checked');

    // Click to disable — optimistic update happens then rolls back
    await user.click(devToggle);

    // After rollback, should be back to checked
    await waitFor(() => {
      expect(devToggle).toHaveAttribute('data-state', 'checked');
    });
  });

  it('categorizes backend extensions into correct tiers', async () => {
    const apiExtensions = [
      { key: 'developer', name: 'Developer', enabled: true, type: 'builtin', description: 'Dev tools' },
      { key: 'crewai_bridge', name: 'CrewAI Bridge', enabled: false, type: 'stdio', description: 'CrewAI' },
      { key: 'my_custom_tool', name: 'My Custom Tool', enabled: true, type: 'streamable_http', description: 'Custom' },
    ];
    mockBackendApi.getExtensions.mockResolvedValue(apiExtensions);

    render(<ToolsBridgePanel />);

    await waitFor(() => {
      expect(screen.getByText(/3 registered/)).toBeInTheDocument();
    });

    // developer -> tier1 (Builtin)
    const builtinSection = screen.getByText('Builtin (Rust)').closest('button')!;
    expect(within(builtinSection).getByText('1')).toBeInTheDocument();

    // crewai_bridge -> tier2 (Stage 6 Python Bridges)
    const stage6Section = screen.getByText('Stage 6 Python Bridges').closest('button')!;
    expect(within(stage6Section).getByText('1')).toBeInTheDocument();

    // my_custom_tool -> tier3 (Additional Bridges)
    const additionalSection = screen.getByText('Additional Bridges').closest('button')!;
    expect(within(additionalSection).getByText('1')).toBeInTheDocument();

    // Verify the tool names appear
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('CrewAI Bridge')).toBeInTheDocument();
    expect(screen.getByText('My Custom Tool')).toBeInTheDocument();
  });
});
