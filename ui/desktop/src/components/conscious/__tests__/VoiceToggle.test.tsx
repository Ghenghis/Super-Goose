import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoiceToggle from '../VoiceToggle';

const mockStatus = {
  enabled: true,
  listening_state: 'listening',
  wake_loaded: true,
  vad_loaded: true,
  always_listen: false,
};

describe('VoiceToggle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when status is null (API unreachable)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const { container } = render(<VoiceToggle />);
    // Component returns null when status is null
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('renders voice controls when status is loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<VoiceToggle />);
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Voice controls' })).toBeInTheDocument();
    });
  });

  it('shows always-listen toggle button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<VoiceToggle />);
    await waitFor(() => {
      expect(screen.getByLabelText('Enable always-listen mode')).toBeInTheDocument();
    });
  });

  it('shows mute/unmute button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<VoiceToggle />);
    await waitFor(() => {
      expect(screen.getByLabelText('Mute audio output')).toBeInTheDocument();
    });
  });

  it('toggles mute state on click', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<VoiceToggle />);
    await waitFor(() => {
      expect(screen.getByLabelText('Mute audio output')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Mute audio output'));
    expect(screen.getByLabelText('Unmute audio output')).toBeInTheDocument();
  });

  it('shows listening state text when not idle', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockStatus, listening_state: 'listening' }),
    } as Response);

    render(<VoiceToggle />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Listening');
    });
  });

  it('calls toggle API when always-listen is clicked', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<VoiceToggle />);
    await waitFor(() => {
      expect(screen.getByLabelText('Enable always-listen mode')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Enable always-listen mode'));

    await waitFor(() => {
      const calls = fetchSpy.mock.calls;
      const toggleCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/api/wake-vad/toggle')
      );
      expect(toggleCall).toBeTruthy();
    });
  });
});
