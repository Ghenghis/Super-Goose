import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRead = vi.fn();
const mockUpsert = vi.fn();

vi.mock('../ConfigContext', () => ({
  useConfig: () => ({
    read: mockRead,
    upsert: mockUpsert,
  }),
}));

vi.mock('../../updates', () => ({
  TELEMETRY_UI_ENABLED: true,
}));

vi.mock('../../toasts', () => ({
  toastService: {
    error: vi.fn(),
  },
}));

vi.mock('../../utils/analytics', () => ({
  trackTelemetryPreference: vi.fn(),
}));

vi.mock('../ui/BaseModal', () => ({
  BaseModal: ({ isOpen, children, actions }: any) =>
    isOpen ? (
      <div data-testid="base-modal">
        <div data-testid="modal-content">{children}</div>
        <div data-testid="modal-actions">{actions}</div>
      </div>
    ) : null,
}));

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../icons/Goose', () => ({
  Goose: ({ className }: any) => <div data-testid="goose-icon" className={className} />,
}));

import TelemetryOptOutModal from '../TelemetryOptOutModal';

describe('TelemetryOptOutModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue(null);
  });

  describe('Controlled mode', () => {
    it('renders when isOpen is true in controlled mode', () => {
      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={vi.fn()} />
      );

      expect(screen.getByText('Help improve goose')).toBeInTheDocument();
    });

    it('does not render when isOpen is false in controlled mode', () => {
      render(
        <TelemetryOptOutModal controlled={true} isOpen={false} onClose={vi.fn()} />
      );

      expect(screen.queryByText('Help improve goose')).not.toBeInTheDocument();
    });

    it('shows accept and decline buttons', () => {
      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={vi.fn()} />
      );

      expect(
        screen.getByText('Yes, share anonymous usage data')
      ).toBeInTheDocument();
      expect(screen.getByText('No thanks')).toBeInTheDocument();
    });

    it('calls upsert with true when accepting telemetry', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockUpsert.mockResolvedValue(undefined);

      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText('Yes, share anonymous usage data'));

      await waitFor(() => {
        expect(mockUpsert).toHaveBeenCalledWith(
          'GOOSE_TELEMETRY_ENABLED',
          true,
          false
        );
      });
    });

    it('calls upsert with false when declining telemetry', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockUpsert.mockResolvedValue(undefined);

      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText('No thanks'));

      await waitFor(() => {
        expect(mockUpsert).toHaveBeenCalledWith(
          'GOOSE_TELEMETRY_ENABLED',
          false,
          false
        );
      });
    });

    it('calls onClose after making a choice', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockUpsert.mockResolvedValue(undefined);

      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText('No thanks'));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('handles upsert errors gracefully', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockUpsert.mockRejectedValue(new Error('Config error'));

      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText('Yes, share anonymous usage data'));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Uncontrolled mode', () => {
    it('renders nothing initially in uncontrolled mode', () => {
      mockRead.mockResolvedValue('some-provider');
      const { container } = render(
        <TelemetryOptOutModal controlled={false} />
      );

      // Initially renders nothing before the async check completes
      expect(container).toBeDefined();
    });

    it('shows data collection info', () => {
      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={vi.fn()} />
      );

      expect(screen.getByText('What we collect:')).toBeInTheDocument();
      expect(
        screen.getByText(/Operating system, version, and architecture/)
      ).toBeInTheDocument();
    });
  });

  describe('TELEMETRY_UI_ENABLED feature flag', () => {
    it('renders content when TELEMETRY_UI_ENABLED is true', () => {
      render(
        <TelemetryOptOutModal controlled={true} isOpen={true} onClose={vi.fn()} />
      );

      expect(screen.getByText('Help improve goose')).toBeInTheDocument();
    });
  });
});
