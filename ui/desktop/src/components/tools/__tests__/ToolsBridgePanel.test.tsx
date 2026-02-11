import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Use vi.hoisted so that MOCK_EXTENSIONS is available when vi.mock hoists.
const { MOCK_EXTENSIONS } = vi.hoisted(() => ({
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
}));

vi.mock('../../settings/extensions/bundled-extensions.json', () => ({
  default: MOCK_EXTENSIONS,
}));

// Must import after mock is set up
import ToolsBridgePanel from '../ToolsBridgePanel';

describe('ToolsBridgePanel', () => {
  it('renders the header with correct total and enabled counts', () => {
    render(<ToolsBridgePanel />);
    // 6 total, 1 enabled (developer)
    expect(screen.getByText(/6 registered/)).toBeInTheDocument();
    expect(screen.getByText(/1 enabled/)).toBeInTheDocument();
  });

  it('renders all three tier sections with labels', () => {
    render(<ToolsBridgePanel />);
    expect(screen.getByText('Builtin (Rust)')).toBeInTheDocument();
    expect(screen.getByText('Stage 6 Python Bridges')).toBeInTheDocument();
    expect(screen.getByText('Additional Bridges')).toBeInTheDocument();
  });

  it('shows the correct extension count badge per tier', () => {
    render(<ToolsBridgePanel />);
    // Tier 1 (builtin): developer, memory = 2
    // Tier 2 (stage 6): crewai_bridge, langgraph_bridge = 2
    // Tier 3 (additional): resource_coordinator, playwright_bridge = 2
    // The badges are inside the tier header buttons; count text nodes
    // Tier 1 count badge
    const builtinSection = screen.getByText('Builtin (Rust)').closest('button')!;
    expect(within(builtinSection).getByText('2')).toBeInTheDocument();

    const stage6Section = screen.getByText('Stage 6 Python Bridges').closest('button')!;
    expect(within(stage6Section).getByText('2')).toBeInTheDocument();

    const additionalSection = screen.getByText('Additional Bridges').closest('button')!;
    expect(within(additionalSection).getByText('2')).toBeInTheDocument();
  });

  it('displays tool display names within the tier sections', () => {
    render(<ToolsBridgePanel />);
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('CrewAI Bridge')).toBeInTheDocument();
    expect(screen.getByText('LangGraph Bridge')).toBeInTheDocument();
    expect(screen.getByText('Resource Coordinator')).toBeInTheDocument();
    expect(screen.getByText('Playwright Bridge')).toBeInTheDocument();
  });

  it('renders the search input with placeholder', () => {
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
    // The toggle is identified by aria-label
    const devToggle = screen.getByRole('switch', { name: 'Toggle Developer' });
    expect(devToggle).toHaveAttribute('data-state', 'checked');

    // Click to disable
    await user.click(devToggle);
    expect(devToggle).toHaveAttribute('data-state', 'unchecked');

    // Header should update: 0 enabled now
    expect(screen.getByText(/0 enabled/)).toBeInTheDocument();
  });

  it('renders toggle switches for all tools', () => {
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
    // Tier sections with 0 results during search are not rendered (return null)
    expect(screen.queryByText('Stage 6 Python Bridges')).not.toBeInTheDocument();
    expect(screen.queryByText('Additional Bridges')).not.toBeInTheDocument();
  });
});
