import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DirSwitcher } from '../DirSwitcher';

// Mock dependencies
vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  FolderDot: ({ className }: { className?: string; size?: number }) => (
    <span data-testid="folder-icon" className={className}>
      FolderDot
    </span>
  ),
}));

vi.mock('../../../api', () => ({
  updateWorkingDir: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('DirSwitcher', () => {
  const defaultProps = {
    className: 'test-class',
    sessionId: 'session-123',
    workingDir: '/home/user/projects',
    onWorkingDirChange: vi.fn(),
    onRestartStart: vi.fn(),
    onRestartEnd: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the working directory text', () => {
    render(<DirSwitcher {...defaultProps} />);
    const matches = screen.getAllByText('/home/user/projects');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the folder icon', () => {
    render(<DirSwitcher {...defaultProps} />);
    expect(screen.getByTestId('folder-icon')).toBeInTheDocument();
  });

  it('renders a button element', () => {
    render(<DirSwitcher {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('shows the working directory in tooltip', () => {
    render(<DirSwitcher {...defaultProps} />);
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent('/home/user/projects');
  });

  it('applies the provided className', () => {
    render(<DirSwitcher {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('test-class');
  });

  it('renders with different working directory', () => {
    render(<DirSwitcher {...defaultProps} workingDir="/usr/local/bin" />);
    const matches = screen.getAllByText('/usr/local/bin');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders without sessionId', () => {
    render(<DirSwitcher {...defaultProps} sessionId={undefined} />);
    const matches = screen.getAllByText('/home/user/projects');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
