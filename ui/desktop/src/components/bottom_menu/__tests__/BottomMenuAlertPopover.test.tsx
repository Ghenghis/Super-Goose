import { render, screen, fireEvent, act } from '@testing-library/react';
import { AlertType } from '../../alerts';
import type { Alert } from '../../alerts';

vi.mock('../../../constants/events', () => ({
  AppEvents: { HIDE_ALERT_POPOVER: 'hide-alert-popover' },
}));

vi.mock('react-icons/fa', () => ({
  FaCircle: ({ size: _size }: any) => <span data-testid="fa-circle" />,
}));

vi.mock('../../alerts', () => ({
  AlertType: { Error: 'error', Warning: 'warning', Info: 'info' },
  AlertBox: ({ alert }: any) => <div data-testid="alert-box">{alert.message}</div>,
}));

import BottomMenuAlertPopover from '../BottomMenuAlertPopover';

describe('BottomMenuAlertPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when there are no alerts', () => {
    const { container } = render(<BottomMenuAlertPopover alerts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders trigger dot when alerts are present', () => {
    const alerts: Alert[] = [
      { type: AlertType.Info, message: 'Context loaded' },
    ];
    render(<BottomMenuAlertPopover alerts={alerts} />);
    expect(screen.getByTestId('fa-circle')).toBeInTheDocument();
  });

  it('opens popover on click', () => {
    const alerts: Alert[] = [
      { type: AlertType.Warning, message: 'Token limit close' },
    ];
    render(<BottomMenuAlertPopover alerts={alerts} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('alert-box')).toBeInTheDocument();
    expect(screen.getByText('Token limit close')).toBeInTheDocument();
  });

  it('renders multiple alerts', () => {
    const alerts: Alert[] = [
      { type: AlertType.Error, message: 'Connection lost' },
      { type: AlertType.Info, message: 'Reconnecting...' },
    ];
    render(<BottomMenuAlertPopover alerts={alerts} />);
    fireEvent.click(screen.getByRole('button'));
    const alertBoxes = screen.getAllByTestId('alert-box');
    expect(alertBoxes).toHaveLength(2);
  });

  it('auto-shows popover for alerts with autoShow: true', () => {
    const alerts: Alert[] = [
      { type: AlertType.Info, message: 'Auto alert', autoShow: true },
    ];
    render(<BottomMenuAlertPopover alerts={alerts} />);
    // Should auto-show without click
    expect(screen.getByTestId('alert-box')).toBeInTheDocument();
  });

  it('auto-hides popover after 3 seconds when auto-shown', () => {
    const alerts: Alert[] = [
      { type: AlertType.Info, message: 'Temporary alert', autoShow: true },
    ];
    render(<BottomMenuAlertPopover alerts={alerts} />);
    expect(screen.getByTestId('alert-box')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.queryByTestId('alert-box')).not.toBeInTheDocument();
  });
});
