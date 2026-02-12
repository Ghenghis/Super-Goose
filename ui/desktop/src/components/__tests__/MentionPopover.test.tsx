import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Polyfill scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

vi.mock('../ItemIcon', () => ({
  ItemIcon: ({ item }: any) => (
    <span data-testid={`icon-${item.itemType}`}>{item.itemType}</span>
  ),
}));

vi.mock('../../api', () => ({
  getSlashCommands: vi.fn(() =>
    Promise.resolve({
      data: {
        commands: [
          { command: 'help', help: 'Show help', command_type: 'Builtin' },
          { command: 'test-recipe', help: 'Test recipe', command_type: 'Recipe' },
        ],
      },
    })
  ),
}));

vi.mock('../../utils/workingDir', () => ({
  getInitialWorkingDir: vi.fn(() => '/test/project'),
}));

import MentionPopover from '../MentionPopover';

describe('MentionPopover', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    position: { x: 100, y: 200 },
    query: '',
    isSlashCommand: false,
    selectedIndex: 0,
    onSelectedIndexChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.electron.listFiles for file scanning
    (window.electron as any).listFiles = vi.fn(() => Promise.resolve([]));
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MentionPopover {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the popover when isOpen is true', () => {
    render(<MentionPopover {...defaultProps} />);

    // The popover should render with a fixed position container
    const popover = document.querySelector('.fixed.z-50');
    expect(popover).toBeInTheDocument();
  });

  it('shows loading state while scanning files', () => {
    // listFiles is mocked to resolve immediately, but during the initial render
    // the component should show the scanning state
    (window.electron as any).listFiles = vi.fn(
      () => new Promise(() => {}) // Never resolves to keep loading state
    );

    render(<MentionPopover {...defaultProps} />);

    expect(screen.getByText('Scanning files...')).toBeInTheDocument();
  });

  it('loads slash commands when isSlashCommand is true', async () => {
    render(<MentionPopover {...defaultProps} isSlashCommand={true} />);

    await waitFor(() => {
      expect(screen.getByText('help')).toBeInTheDocument();
      expect(screen.getByText('test-recipe')).toBeInTheDocument();
    });
  });

  it('shows item count when items are found', async () => {
    const { getSlashCommands } = await import('../../api');

    render(<MentionPopover {...defaultProps} isSlashCommand={true} />);

    await waitFor(() => {
      expect(screen.getByText('2 items found')).toBeInTheDocument();
    });
  });

  it('shows "No items found" when query has no matches', async () => {
    (window.electron as any).listFiles = vi.fn(() => Promise.resolve([]));

    render(
      <MentionPopover {...defaultProps} query="nonexistent-file-xyz" />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No items found matching "nonexistent-file-xyz"/)
      ).toBeInTheDocument();
    });
  });

  it('calls onSelect and onClose when an item is clicked', async () => {
    const user = userEvent.setup();
    render(<MentionPopover {...defaultProps} isSlashCommand={true} />);

    await waitFor(() => {
      expect(screen.getByText('help')).toBeInTheDocument();
    });

    await user.click(screen.getByText('help'));

    expect(defaultProps.onSelect).toHaveBeenCalledWith('/help');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('closes when clicking outside the popover', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <MentionPopover {...defaultProps} isSlashCommand={true} />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByText('help')).toBeInTheDocument();
    });

    // Simulate mousedown outside
    await user.click(screen.getByTestId('outside'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('highlights the selected item', async () => {
    render(
      <MentionPopover {...defaultProps} isSlashCommand={true} selectedIndex={0} />
    );

    await waitFor(() => {
      expect(screen.getByText('help')).toBeInTheDocument();
    });

    const firstItem = screen.getByText('help').closest('[data-selected]');
    expect(firstItem).toHaveAttribute('data-selected', 'true');
  });

  it('positions the popover based on position prop', () => {
    render(
      <MentionPopover
        {...defaultProps}
        position={{ x: 150, y: 300 }}
        isSlashCommand={true}
      />
    );

    const popover = document.querySelector('.fixed.z-50') as HTMLElement;
    expect(popover).toBeInTheDocument();
    expect(popover.style.left).toBe('150px');
  });

  it('exposes imperative handle via ref', async () => {
    const ref = { current: null } as any;

    render(<MentionPopover {...defaultProps} isSlashCommand={true} ref={ref} />);

    await waitFor(() => {
      expect(screen.getByText('help')).toBeInTheDocument();
    });

    expect(ref.current).toBeDefined();
    expect(typeof ref.current.getDisplayFiles).toBe('function');
    expect(typeof ref.current.selectFile).toBe('function');
  });
});
