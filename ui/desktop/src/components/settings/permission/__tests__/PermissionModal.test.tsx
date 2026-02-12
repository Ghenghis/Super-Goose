import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetTools = vi.fn();
const mockUpsertPermissions = vi.fn();

vi.mock('../../../../api', () => ({
  getTools: (...args: any[]) => mockGetTools(...args),
  upsertPermissions: (...args: any[]) => mockUpsertPermissions(...args),
}));

vi.mock('../../../../contexts/ChatContext', () => ({
  useChatContext: () => ({
    chat: { sessionId: 'test-session-123' },
  }),
}));

// Mock Radix Dialog with simple HTML
vi.mock('../../../ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: any) =>
    open ? (
      <div data-testid="dialog" role="dialog">
        {children}
        <button data-testid="dialog-overlay" onClick={() => onOpenChange(false)}>
          overlay
        </button>
      </div>
    ) : null,
  DialogContent: ({ children, className }: any) => (
    <div className={className} data-testid="dialog-content">
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children, className }: any) => (
    <h2 className={className} data-testid="dialog-title">
      {children}
    </h2>
  ),
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('../../../ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children, className }: any) => (
    <div data-testid="dropdown-trigger" className={className}>
      {children}
    </div>
  ),
  DropdownMenuContent: ({ children }: any) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onSelect }: any) => (
    <button data-testid="dropdown-item" onClick={onSelect}>
      {children}
    </button>
  ),
}));

import PermissionModal from '../PermissionModal';

describe('PermissionModal', () => {
  const defaultProps = {
    extensionName: 'developer',
    onClose: vi.fn(),
  };

  const mockTools = [
    {
      name: 'shell_execute',
      description: 'Execute shell commands. This tool runs commands in the terminal.',
      permission: 'ask_before',
    },
    {
      name: 'file_read',
      description: 'Read file contents. Returns text content of the file.',
      permission: 'always_allow',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTools.mockResolvedValue({ data: mockTools, error: undefined });
    mockUpsertPermissions.mockResolvedValue({ error: undefined });
  });

  it('renders with extension name in the title', async () => {
    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('developer')).toBeInTheDocument();
    });
  });

  it('shows loading spinner while fetching tools', () => {
    mockGetTools.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<PermissionModal {...defaultProps} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('displays tools after loading', async () => {
    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('shell_execute')).toBeInTheDocument();
      expect(screen.getByText('file_read')).toBeInTheDocument();
    });
  });

  it('shows first sentence of tool description', async () => {
    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Execute shell commands.')).toBeInTheDocument();
      expect(screen.getByText('Read file contents.')).toBeInTheDocument();
    });
  });

  it('filters out platform__read_resource and platform__list_resources', async () => {
    mockGetTools.mockResolvedValue({
      data: [
        ...mockTools,
        { name: 'platform__read_resource', description: 'Read resource.', permission: 'always_allow' },
        { name: 'platform__list_resources', description: 'List resources.', permission: 'always_allow' },
      ],
      error: undefined,
    });

    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('shell_execute')).toBeInTheDocument();
      expect(screen.queryByText('platform__read_resource')).not.toBeInTheDocument();
      expect(screen.queryByText('platform__list_resources')).not.toBeInTheDocument();
    });
  });

  it('shows "No tools available" when extension has no tools', async () => {
    mockGetTools.mockResolvedValue({ data: [], error: undefined });

    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText('No tools available for this extension.')
      ).toBeInTheDocument();
    });
  });

  it('shows error state when getTools API fails with exception', async () => {
    mockGetTools.mockRejectedValue(new Error('Network error'));

    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load tools')).toBeInTheDocument();
    });
  });

  it('shows "Failed to load tools" when API returns error', async () => {
    mockGetTools.mockResolvedValue({ data: undefined, error: 'API Error' });

    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load tools')).toBeInTheDocument();
    });
  });

  it('disables Save button when no changes have been made', async () => {
    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('shell_execute')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    expect(saveButton).toBeDisabled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('shell_execute')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when dialog overlay is clicked', async () => {
    const user = userEvent.setup();
    render(<PermissionModal {...defaultProps} />);

    await user.click(screen.getByTestId('dialog-overlay'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows "Close" text instead of "Cancel" when there is a load error', async () => {
    mockGetTools.mockResolvedValue({ data: undefined, error: 'API Error' });

    render(<PermissionModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
      expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    });
  });
});
