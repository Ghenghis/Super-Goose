import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExtensionItem from '../ExtensionItem';

// Mock dependencies
vi.mock('../ExtensionList', () => ({
  getSubtitle: vi.fn((ext: any) => ({
    description: ext.description || 'Test description',
    command: ext.cmd ? `${ext.cmd} ${(ext.args || []).join(' ')}` : null,
  })),
  getFriendlyTitle: vi.fn((ext: any) => ext.display_name || ext.name || 'Unknown'),
}));

vi.mock('../../../../icons', () => ({
  Gear: ({ className }: { className?: string }) => (
    <span data-testid="gear-icon" className={className}>Gear</span>
  ),
}));

vi.mock('../../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    variant?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onCheckedChange}
      data-testid="toggle-switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

vi.mock('../../../../ui/card', () => ({
  Card: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) => (
    <div data-testid="extension-card" id={id} className={className}>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardAction: ({ children }: { children: React.ReactNode }) => <div data-testid="card-action">{children}</div>,
}));

vi.mock('lodash/kebabCase', () => ({
  default: (str: string) => str.toLowerCase().replace(/\s+/g, '-'),
}));

const createExtension = (overrides = {}) => ({
  name: 'developer',
  type: 'builtin' as const,
  enabled: true,
  display_name: 'Developer',
  description: 'Development tools',
  ...overrides,
});

describe('ExtensionItem', () => {
  const defaultProps = {
    extension: createExtension() as any,
    onToggle: vi.fn().mockResolvedValue(true),
    onConfigure: vi.fn(),
    isStatic: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the extension title', () => {
    render(<ExtensionItem {...defaultProps} />);
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('renders the toggle switch', () => {
    render(<ExtensionItem {...defaultProps} />);
    const toggle = screen.getByTestId('toggle-switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('renders OFF state for disabled extensions', () => {
    const extension = createExtension({ enabled: false });
    render(<ExtensionItem {...defaultProps} extension={extension as any} />);
    const toggle = screen.getByTestId('toggle-switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onToggle when switch is clicked', async () => {
    const user = userEvent.setup();
    render(<ExtensionItem {...defaultProps} />);

    await user.click(screen.getByTestId('toggle-switch'));
    expect(defaultProps.onToggle).toHaveBeenCalledWith(defaultProps.extension);
  });

  it('shows gear icon for editable (non-builtin) extensions', () => {
    const extension = createExtension({ type: 'stdio', name: 'custom-ext' });
    render(<ExtensionItem {...defaultProps} extension={extension as any} />);
    expect(screen.getByTestId('gear-icon')).toBeInTheDocument();
  });

  it('hides gear icon for builtin extensions', () => {
    const extension = createExtension({ type: 'builtin' });
    render(<ExtensionItem {...defaultProps} extension={extension as any} />);
    expect(screen.queryByTestId('gear-icon')).not.toBeInTheDocument();
  });

  it('hides gear icon for bundled extensions', () => {
    const extension = createExtension({ type: 'stdio', bundled: true });
    render(<ExtensionItem {...defaultProps} extension={extension as any} />);
    expect(screen.queryByTestId('gear-icon')).not.toBeInTheDocument();
  });

  it('hides gear icon when isStatic is true', () => {
    const extension = createExtension({ type: 'stdio' });
    render(<ExtensionItem {...defaultProps} extension={extension as any} isStatic={true} />);
    expect(screen.queryByTestId('gear-icon')).not.toBeInTheDocument();
  });

  it('calls onConfigure when gear icon is clicked', async () => {
    const user = userEvent.setup();
    const extension = createExtension({ type: 'stdio', name: 'my-ext' });
    render(<ExtensionItem {...defaultProps} extension={extension as any} />);

    await user.click(screen.getByTestId('gear-icon'));
    expect(defaultProps.onConfigure).toHaveBeenCalledWith(extension);
  });

  it('reverts visual state on toggle failure', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockRejectedValue(new Error('Toggle failed'));
    render(<ExtensionItem {...defaultProps} onToggle={onToggle} />);

    await user.click(screen.getByTestId('toggle-switch'));

    await waitFor(() => {
      // After failure, should revert back to original state
      expect(screen.getByTestId('toggle-switch')).toHaveAttribute('aria-checked', 'true');
    });
  });
});
