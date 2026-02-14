import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MarketplacePanel from '../MarketplacePanel';

// --- Mocks -------------------------------------------------------------------

const mockListCores = vi.fn();
const mockGetExtensions = vi.fn();
const mockGetCoreConfig = vi.fn();
const mockSwitchCore = vi.fn();
const mockToggleExtension = vi.fn();

vi.mock('../../../utils/backendApi', () => ({
  backendApi: {
    listCores: (...args: unknown[]) => mockListCores(...args),
    getExtensions: (...args: unknown[]) => mockGetExtensions(...args),
    getCoreConfig: (...args: unknown[]) => mockGetCoreConfig(...args),
    switchCore: (...args: unknown[]) => mockSwitchCore(...args),
    toggleExtension: (...args: unknown[]) => mockToggleExtension(...args),
  },
}));

// --- Test data ---------------------------------------------------------------

const MOCK_CORES = [
  { id: 'freeform', name: 'FreeformCore', description: 'Chat and research', active: true },
  { id: 'structured', name: 'StructuredCore', description: 'Code-Test-Fix', active: false },
  { id: 'orchestrator', name: 'OrchestratorCore', description: 'Multi-agent', active: false },
  { id: 'swarm', name: 'SwarmCore', description: 'Parallel pool', active: false },
  { id: 'workflow', name: 'WorkflowCore', description: 'Template pipelines', active: false },
  { id: 'adversarial', name: 'AdversarialCore', description: 'Coach/Player review', active: false },
];

const MOCK_EXTENSIONS = [
  { key: 'developer', name: 'Developer Tools', enabled: true, type: 'builtin' as const, description: 'Core development tools' },
  { key: 'web-search', name: 'Web Search', enabled: false, type: 'stdio' as const, description: 'Search the web' },
  { key: 'memory', name: 'Memory', enabled: true, type: 'builtin' as const, description: 'Persistent memory' },
];

// --- Setup / Teardown --------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockListCores.mockResolvedValue(MOCK_CORES);
  mockGetExtensions.mockResolvedValue(MOCK_EXTENSIONS);
  mockGetCoreConfig.mockResolvedValue(null);
  mockSwitchCore.mockResolvedValue({ success: true, active_core: 'structured', message: 'Switched' });
  mockToggleExtension.mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

// --- Tests -------------------------------------------------------------------

describe('MarketplacePanel', () => {
  // ==========================================================================
  // Tab navigation
  // ==========================================================================

  it('renders all 5 tabs', async () => {
    render(<MarketplacePanel />);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Browse' })).toBeDefined();
    });
    expect(screen.getByRole('tab', { name: 'My Cores' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Sell' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Extensions' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Community' })).toBeDefined();
  });

  it('shows Browse tab selected by default', () => {
    render(<MarketplacePanel />);
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    expect(browseTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches tabs on click', () => {
    render(<MarketplacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));
    expect(screen.getByRole('tab', { name: 'Extensions' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Browse' }).getAttribute('aria-selected')).toBe('false');
  });

  it('has correct ARIA region label', () => {
    render(<MarketplacePanel />);
    expect(screen.getByRole('region', { name: 'Marketplace Panel' })).toBeDefined();
  });

  it('has tablist with correct label', () => {
    render(<MarketplacePanel />);
    expect(screen.getByRole('tablist', { name: 'Marketplace views' })).toBeDefined();
  });

  // ==========================================================================
  // Browse tab — core cards
  // ==========================================================================

  describe('Browse tab', () => {
    it('calls listCores on mount', () => {
      render(<MarketplacePanel />);
      expect(mockListCores).toHaveBeenCalled();
    });

    it('shows loading state initially', () => {
      // Make listCores hang
      mockListCores.mockImplementation(() => new Promise(() => {}));
      render(<MarketplacePanel />);
      expect(screen.getByText('Loading cores...')).toBeDefined();
    });

    it('renders core cards after data loads', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByTestId('core-name-freeform')).toBeDefined();
      });

      expect(screen.getByTestId('core-name-structured')).toBeDefined();
      expect(screen.getByTestId('core-name-orchestrator')).toBeDefined();
      expect(screen.getByTestId('core-name-swarm')).toBeDefined();
      expect(screen.getByTestId('core-name-workflow')).toBeDefined();
      expect(screen.getByTestId('core-name-adversarial')).toBeDefined();
    });

    it('renders 6 core cards', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      expect(screen.getByText('StructuredCore')).toBeDefined();
      expect(screen.getByText('OrchestratorCore')).toBeDefined();
      expect(screen.getByText('SwarmCore')).toBeDefined();
      expect(screen.getByText('WorkflowCore')).toBeDefined();
      expect(screen.getByText('AdversarialCore')).toBeDefined();
    });

    it('shows core descriptions', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('Chat and research')).toBeDefined();
      });
      expect(screen.getByText('Code-Test-Fix')).toBeDefined();
    });

    it('shows Active badge on active core', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeDefined();
      });
    });

    it('shows empty state when no cores returned', async () => {
      mockListCores.mockResolvedValue([]);
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('No cores available in marketplace')).toBeDefined();
      });
    });

    it('renders tabpanel with correct id', async () => {
      render(<MarketplacePanel />);
      await waitFor(() => {
        const panel = screen.getByRole('tabpanel');
        expect(panel.getAttribute('id')).toBe('marketplace-tabpanel-browse');
      });
    });
  });

  // ==========================================================================
  // My Cores tab — active core + switch
  // ==========================================================================

  describe('My Cores tab', () => {
    it('shows active core prominently', async () => {
      render(<MarketplacePanel />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        expect(screen.getByText('Currently Active')).toBeDefined();
      });
    });

    it('renders Switch buttons for non-active cores', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        const switchButtons = screen.getAllByText('Switch');
        expect(switchButtons.length).toBe(5); // 6 cores - 1 active
      });
    });

    it('shows Active on the active core button', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        const btn = screen.getByTestId('switch-core-freeform');
        expect(btn.textContent).toBe('Active');
      });
    });

    it('disables the active core button', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        const btn = screen.getByTestId('switch-core-freeform');
        expect(btn).toHaveProperty('disabled', true);
      });
    });

    it('calls switchCore when Switch button clicked', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        expect(screen.getByTestId('switch-core-structured')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('switch-core-structured'));

      await waitFor(() => {
        expect(mockSwitchCore).toHaveBeenCalledWith('structured');
      });
    });

    it('updates active core after successful switch', async () => {
      mockSwitchCore.mockResolvedValue({ success: true, active_core: 'structured', message: 'Switched' });

      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        expect(screen.getByTestId('switch-core-structured')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('switch-core-structured'));

      await waitFor(() => {
        const btn = screen.getByTestId('switch-core-structured');
        expect(btn.textContent).toBe('Active');
      });
    });

    it('shows empty state when no cores', async () => {
      mockListCores.mockResolvedValue([]);
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(mockListCores).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        expect(screen.getByText('No cores configured')).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Extensions tab — list with toggle
  // ==========================================================================

  describe('Extensions tab', () => {
    it('calls getExtensions on mount', () => {
      render(<MarketplacePanel />);
      expect(mockGetExtensions).toHaveBeenCalled();
    });

    it('shows loading state initially', () => {
      mockGetExtensions.mockImplementation(() => new Promise(() => {}));
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));
      expect(screen.getByText('Loading extensions...')).toBeDefined();
    });

    it('renders extension list', async () => {
      render(<MarketplacePanel />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByTestId('ext-name-developer')).toBeDefined();
      });

      expect(screen.getByTestId('ext-name-web-search')).toBeDefined();
      expect(screen.getByTestId('ext-name-memory')).toBeDefined();
    });

    it('renders extension names correctly', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByText('Developer Tools')).toBeDefined();
      });
      expect(screen.getByText('Web Search')).toBeDefined();
      expect(screen.getByText('Memory')).toBeDefined();
    });

    it('shows extension descriptions', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByText('Core development tools')).toBeDefined();
      });
      expect(screen.getByText('Search the web')).toBeDefined();
    });

    it('shows type badges for extensions', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        const builtinBadges = screen.getAllByText('builtin');
        expect(builtinBadges.length).toBe(2); // developer + memory
      });
      expect(screen.getByText('stdio')).toBeDefined();
    });

    it('renders toggle checkboxes', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByTestId('ext-toggle-developer')).toBeDefined();
      });
      expect(screen.getByTestId('ext-toggle-web-search')).toBeDefined();
      expect(screen.getByTestId('ext-toggle-memory')).toBeDefined();
    });

    it('toggle reflects enabled state', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        const devToggle = screen.getByTestId('ext-toggle-developer') as HTMLInputElement;
        expect(devToggle.checked).toBe(true);
      });

      const searchToggle = screen.getByTestId('ext-toggle-web-search') as HTMLInputElement;
      expect(searchToggle.checked).toBe(false);
    });

    it('calls toggleExtension when toggle clicked', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByTestId('ext-toggle-web-search')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('ext-toggle-web-search'));

      await waitFor(() => {
        expect(mockToggleExtension).toHaveBeenCalledWith('web-search', true);
      });
    });

    it('updates extension state after successful toggle', async () => {
      mockToggleExtension.mockResolvedValue(true);

      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        const toggle = screen.getByTestId('ext-toggle-web-search') as HTMLInputElement;
        expect(toggle.checked).toBe(false);
      });

      fireEvent.click(screen.getByTestId('ext-toggle-web-search'));

      await waitFor(() => {
        const toggle = screen.getByTestId('ext-toggle-web-search') as HTMLInputElement;
        expect(toggle.checked).toBe(true);
      });
    });

    it('does not update state on failed toggle', async () => {
      mockToggleExtension.mockResolvedValue(false);

      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        const toggle = screen.getByTestId('ext-toggle-web-search') as HTMLInputElement;
        expect(toggle.checked).toBe(false);
      });

      fireEvent.click(screen.getByTestId('ext-toggle-web-search'));

      // Should remain false after failed toggle
      await waitFor(() => {
        expect(mockToggleExtension).toHaveBeenCalled();
      });

      const toggle = screen.getByTestId('ext-toggle-web-search') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it('shows empty state when no extensions', async () => {
      mockGetExtensions.mockResolvedValue([]);
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(mockGetExtensions).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByText('No extensions available')).toBeDefined();
      });
    });

    it('shows empty state when API returns null', async () => {
      mockGetExtensions.mockResolvedValue(null);
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(mockGetExtensions).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByText('No extensions available')).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Sell tab
  // ==========================================================================

  describe('Sell tab', () => {
    it('shows coming soon message', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Sell' }));
      expect(screen.getByText('Core Marketplace -- Coming Soon')).toBeDefined();
    });

    it('shows description about creating cores', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Sell' }));
      expect(screen.getByText('Create and share your custom agent cores with the community.')).toBeDefined();
    });

    it('renders tabpanel with correct id', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Sell' }));
      const panel = screen.getByRole('tabpanel');
      expect(panel.getAttribute('id')).toBe('marketplace-tabpanel-sell');
    });
  });

  // ==========================================================================
  // Community tab
  // ==========================================================================

  describe('Community tab', () => {
    it('shows coming soon message', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
      expect(screen.getByText('Community -- Coming Soon')).toBeDefined();
    });

    it('shows GitHub link', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
      const link = screen.getByTestId('community-github-link');
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe('https://github.com/Ghenghis/Super-Goose');
      expect(link.textContent).toBe('Join the Super-Goose community on GitHub');
    });

    it('GitHub link opens in new tab', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
      const link = screen.getByTestId('community-github-link');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders tabpanel with correct id', () => {
      render(<MarketplacePanel />);
      fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
      const panel = screen.getByRole('tabpanel');
      expect(panel.getAttribute('id')).toBe('marketplace-tabpanel-community');
    });
  });

  // ==========================================================================
  // Empty states when API unreachable
  // ==========================================================================

  describe('API unreachable', () => {
    it('shows empty Browse when listCores returns empty array', async () => {
      mockListCores.mockResolvedValue([]);
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('No cores available in marketplace')).toBeDefined();
      });
    });

    it('shows empty Extensions when getExtensions returns null', async () => {
      mockGetExtensions.mockResolvedValue(null);
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(mockGetExtensions).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Extensions' }));

      await waitFor(() => {
        expect(screen.getByText('No extensions available')).toBeDefined();
      });
    });

    it('getCoreConfig returns null gracefully', async () => {
      mockGetCoreConfig.mockResolvedValue(null);
      render(<MarketplacePanel />);

      // Should not crash — verify Browse tab still renders
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Browse' })).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Data fetching on mount
  // ==========================================================================

  describe('Data fetching', () => {
    it('fetches cores, extensions, and core-config on mount', () => {
      render(<MarketplacePanel />);

      expect(mockListCores).toHaveBeenCalledTimes(1);
      expect(mockGetExtensions).toHaveBeenCalledTimes(1);
      expect(mockGetCoreConfig).toHaveBeenCalledTimes(1);
    });

    it('sets activeCore from listCores active flag', async () => {
      render(<MarketplacePanel />);

      await waitFor(() => {
        expect(screen.getByText('FreeformCore')).toBeDefined();
      });

      // Verify Active badge appears (freeform is active in mock data)
      expect(screen.getByText('Active')).toBeDefined();
    });

    it('prefers getCoreConfig preferred_core for activeCore', async () => {
      mockGetCoreConfig.mockResolvedValue({
        auto_select: true,
        threshold: 0.7,
        preferred_core: 'orchestrator',
        priorities: [],
      });

      render(<MarketplacePanel />);

      // Switch to My Cores to check active indicator
      await waitFor(() => {
        expect(mockGetCoreConfig).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('tab', { name: 'My Cores' }));

      await waitFor(() => {
        const btn = screen.getByTestId('switch-core-orchestrator');
        expect(btn.textContent).toBe('Active');
      });
    });
  });
});
