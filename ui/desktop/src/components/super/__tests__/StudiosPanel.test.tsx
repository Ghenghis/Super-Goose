import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudiosPanel from '../StudiosPanel';

// --- Mocks ----------------------------------------------------------------

vi.mock('../../../config', () => ({
  getApiUrl: vi.fn((endpoint: string) => `http://localhost:3000${endpoint}`),
}));

// Mock StudioPipeline so we can assert it renders without pulling in all sub-tabs
vi.mock('../studio', () => ({
  StudioPipeline: ({ defaultTab }: { defaultTab?: string }) => (
    <div data-testid="studio-pipeline" data-default-tab={defaultTab}>
      StudioPipeline mock
    </div>
  ),
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);

  // Default: return empty extensions (so only the 6 default studios show)
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ extensions: [] }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- Helpers ---------------------------------------------------------------

function mockExtensions(extensions: Array<{
  key: string;
  name: string;
  type: string;
  enabled: boolean;
  description: string;
}>) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ extensions }),
  });
}

function mockFetchError() {
  mockFetch.mockRejectedValue(new Error('Network error'));
}

// --- Tests -----------------------------------------------------------------

describe('StudiosPanel', () => {
  // -- Grid rendering -------------------------------------------------------

  it('renders all 6 default studio cards after loading', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    expect(screen.getByTestId('studio-card-agent')).toBeDefined();
    expect(screen.getByTestId('studio-card-data')).toBeDefined();
    expect(screen.getByTestId('studio-card-eval')).toBeDefined();
    expect(screen.getByTestId('studio-card-deploy')).toBeDefined();
    expect(screen.getByTestId('studio-card-vision')).toBeDefined();
  });

  it('renders studio names and descriptions', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByText('Core Studio')).toBeDefined();
    });

    expect(screen.getByText('Agent Studio')).toBeDefined();
    expect(screen.getByText('Data Studio')).toBeDefined();
    expect(screen.getByText('Eval Studio')).toBeDefined();
    expect(screen.getByText('Deploy Studio')).toBeDefined();
    expect(screen.getByText('Vision Studio')).toBeDefined();
    expect(screen.getByText('Build and test agent cores')).toBeDefined();
    expect(screen.getByText('Design multi-agent workflows')).toBeDefined();
  });

  it('shows loading state initially', () => {
    // Never resolve the fetch
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<StudiosPanel />);

    expect(screen.getByTestId('studios-loading')).toBeDefined();
    expect(screen.getByText('Loading extensions...')).toBeDefined();
  });

  it('calls the extensions API on mount', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/extensions',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  // -- Extensions integration -----------------------------------------------

  it('shows extension count when extensions are available', async () => {
    mockExtensions([
      { key: 'ext1', name: 'My Extension', type: 'stdio', enabled: true, description: 'Test ext' },
      { key: 'ext2', name: 'Disabled Ext', type: 'builtin', enabled: false, description: 'Disabled' },
    ]);

    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('extension-count')).toBeDefined();
    });

    expect(screen.getByText('1 of 2 extensions enabled')).toBeDefined();
  });

  it('adds enabled extensions as additional studio cards', async () => {
    mockExtensions([
      { key: 'custom-ext', name: 'Custom Extension', type: 'stdio', enabled: true, description: 'A custom tool' },
    ]);

    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-custom-ext')).toBeDefined();
    });

    expect(screen.getByText('Custom Extension')).toBeDefined();
    expect(screen.getByText('A custom tool')).toBeDefined();
    // Default studios are still there
    expect(screen.getByTestId('studio-card-core')).toBeDefined();
  });

  it('does not add disabled extensions as studio cards', async () => {
    mockExtensions([
      { key: 'disabled-ext', name: 'Disabled Extension', type: 'stdio', enabled: false, description: 'Disabled' },
    ]);

    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    expect(screen.queryByTestId('studio-card-disabled-ext')).toBeNull();
  });

  it('does not duplicate default studios when extension key matches', async () => {
    // Extension with same key as a default studio (e.g., "core")
    mockExtensions([
      { key: 'core', name: 'Core Override', type: 'builtin', enabled: true, description: 'Override' },
    ]);

    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    // Should only be one "core" card
    const coreCards = screen.getAllByTestId('studio-card-core');
    expect(coreCards.length).toBe(1);
  });

  // -- Error state ----------------------------------------------------------

  it('shows fallback message and default studios on API error', async () => {
    mockFetchError();

    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studios-error')).toBeDefined();
    });

    expect(screen.getByText('Extensions API unavailable. Showing default studios.')).toBeDefined();
    // Default studios are still rendered
    expect(screen.getByTestId('studio-card-core')).toBeDefined();
    expect(screen.getByTestId('studio-card-agent')).toBeDefined();
  });

  // -- All cards are interactive ----------------------------------------------

  it('applies interactive styling to all cards', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    const ids = ['core', 'agent', 'data', 'eval', 'deploy', 'vision'];
    for (const id of ids) {
      const card = screen.getByTestId(`studio-card-${id}`);
      expect(card.className).toContain('cursor-pointer');
      expect(card.getAttribute('aria-disabled')).toBe('false');
      expect(card.getAttribute('tabindex')).toBe('0');
    }
  });

  it('shows "Open <name>" tooltip on all cards', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    expect(screen.getByTestId('studio-card-core').getAttribute('title')).toBe('Open Core Studio');
    expect(screen.getByTestId('studio-card-agent').getAttribute('title')).toBe('Open Agent Studio');
    expect(screen.getByTestId('studio-card-data').getAttribute('title')).toBe('Open Data Studio');
    expect(screen.getByTestId('studio-card-eval').getAttribute('title')).toBe('Open Eval Studio');
    expect(screen.getByTestId('studio-card-deploy').getAttribute('title')).toBe('Open Deploy Studio');
    expect(screen.getByTestId('studio-card-vision').getAttribute('title')).toBe('Open Vision Studio');
  });

  // -- Click any studio opens pipeline ----------------------------------------

  it('opens StudioPipeline when clicking Core Studio', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('studio-card-core'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('plan');
    expect(screen.getByText('Core Studio')).toBeDefined();
    expect(screen.queryByTestId('studio-card-agent')).toBeNull();
  });

  it('opens StudioPipeline when clicking Eval Studio with test tab', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-eval')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('studio-card-eval'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('test');
    expect(screen.getByText('Eval Studio')).toBeDefined();
  });

  it('opens StudioPipeline when clicking Deploy Studio with deploy tab', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-deploy')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('studio-card-deploy'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('deploy');
  });

  it('opens StudioPipeline when clicking Vision Studio with code tab', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-vision')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('studio-card-vision'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('code');
  });

  // -- Back button returns to grid ------------------------------------------

  it('renders back button when a studio is open', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('studio-card-core'));

    expect(screen.getByTestId('back-to-studios')).toBeDefined();
    expect(screen.getByText('Back to Studios')).toBeDefined();
  });

  it('clicking back button returns to the grid view', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    // Open a studio
    fireEvent.click(screen.getByTestId('studio-card-core'));
    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.queryByTestId('studio-card-agent')).toBeNull();

    // Click back
    fireEvent.click(screen.getByTestId('back-to-studios'));

    // Grid is restored
    expect(screen.queryByTestId('studio-pipeline')).toBeNull();
    expect(screen.getByTestId('studio-card-core')).toBeDefined();
    expect(screen.getByTestId('studio-card-agent')).toBeDefined();
  });

  it('can open a different studio after going back', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    // Open Core Studio
    fireEvent.click(screen.getByTestId('studio-card-core'));
    expect(screen.getByText('Core Studio')).toBeDefined();

    // Go back
    fireEvent.click(screen.getByTestId('back-to-studios'));

    // Open Agent Studio
    fireEvent.click(screen.getByTestId('studio-card-agent'));
    expect(screen.getByText('Agent Studio')).toBeDefined();
    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
  });

  // -- Keyboard accessibility -----------------------------------------------

  it('opens studio on Enter key press', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-core')).toBeDefined();
    });

    const coreCard = screen.getByTestId('studio-card-core');
    fireEvent.keyDown(coreCard, { key: 'Enter' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Core Studio')).toBeDefined();
  });

  it('opens studio on Space key press', async () => {
    render(<StudiosPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-card-agent')).toBeDefined();
    });

    const agentCard = screen.getByTestId('studio-card-agent');
    fireEvent.keyDown(agentCard, { key: ' ' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Agent Studio')).toBeDefined();
  });
});
