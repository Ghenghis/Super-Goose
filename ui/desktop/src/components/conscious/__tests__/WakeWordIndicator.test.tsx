import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WakeWordIndicator from '../WakeWordIndicator';

const mockStatus = {
  state: 'idle',
  always_listen: false,
  wake_word_loaded: true,
  vad_loaded: true,
};

describe('WakeWordIndicator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Wake Word + VAD header', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<WakeWordIndicator />);
    expect(screen.getByText('Wake Word + VAD')).toBeInTheDocument();
  });

  it('shows Idle state label when idle', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });
  });

  it('shows Listening state when listening', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockStatus, state: 'listening' }),
    } as Response);

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Listening...')).toBeInTheDocument();
    });
  });

  it('shows wake word hint when idle and not always-listening', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByText(/Hey Goose/)).toBeInTheDocument();
    });
  });

  it('renders "Wake Word Required" button when not always-listening', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByLabelText('Enable always-listen mode')).toBeInTheDocument();
      expect(screen.getByText('Wake Word Required')).toBeInTheDocument();
    });
  });

  it('renders "Always Listening" button when always-listen is on', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockStatus, always_listen: true }),
    } as Response);

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByLabelText('Disable always-listen mode')).toBeInTheDocument();
      expect(screen.getByText('Always Listening')).toBeInTheDocument();
    });
  });

  it('calls toggle API on button click', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByLabelText('Enable always-listen mode')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Enable always-listen mode'));

    await waitFor(() => {
      const toggleCall = fetchSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/api/wake-vad/toggle')
      );
      expect(toggleCall).toBeTruthy();
    });
  });

  it('shows error when API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<WakeWordIndicator />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Wake word API not reachable');
    });
  });
});
