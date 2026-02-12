import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { SetupModal } from '../SetupModal';

describe('SetupModal', () => {
  const defaultProps = {
    title: 'Setting Up',
    message: 'Please wait while we configure your environment.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the modal with title and message', () => {
    render(<SetupModal {...defaultProps} />);

    expect(screen.getByText('Setting Up')).toBeInTheDocument();
    expect(
      screen.getByText('Please wait while we configure your environment.')
    ).toBeInTheDocument();
  });

  it('shows progress spinner when showProgress is true', () => {
    render(<SetupModal {...defaultProps} showProgress={true} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('does not show progress spinner when showProgress is false', () => {
    render(<SetupModal {...defaultProps} showProgress={false} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  it('shows Close button when onClose is provided', () => {
    const onClose = vi.fn();
    render(<SetupModal {...defaultProps} onClose={onClose} />);

    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('does not show Close button when onClose is not provided', () => {
    render(<SetupModal {...defaultProps} />);

    expect(screen.queryByText('Close')).not.toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SetupModal {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Retry Setup button when showRetry and onRetry are provided', () => {
    const onRetry = vi.fn();
    render(<SetupModal {...defaultProps} showRetry={true} onRetry={onRetry} />);

    expect(screen.getByText('Retry Setup')).toBeInTheDocument();
  });

  it('does not show Retry Setup button when showRetry is false', () => {
    render(<SetupModal {...defaultProps} showRetry={false} onRetry={vi.fn()} />);

    expect(screen.queryByText('Retry Setup')).not.toBeInTheDocument();
  });

  it('calls onRetry when Retry Setup button is clicked', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<SetupModal {...defaultProps} showRetry={true} onRetry={onRetry} />);

    await user.click(screen.getByText('Retry Setup'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after specified delay when autoClose and onClose are provided', async () => {
    const onClose = vi.fn();
    render(<SetupModal {...defaultProps} autoClose={3000} onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not auto-close when autoClose is provided but onClose is not', () => {
    // Should not throw
    render(<SetupModal {...defaultProps} autoClose={3000} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Still visible, no crash
    expect(screen.getByText('Setting Up')).toBeInTheDocument();
  });

  it('clears auto-close timer on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <SetupModal {...defaultProps} autoClose={5000} onClose={onClose} />
    );

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
