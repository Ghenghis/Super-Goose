import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatorPanel from '../CreatorPanel';

describe('CreatorPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the AI Creator header', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    render(<CreatorPanel />);
    expect(screen.getByText('AI Creator')).toBeInTheDocument();
  });

  it('renders input and Create button', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    render(<CreatorPanel />);
    expect(screen.getByLabelText('Creation command')).toBeInTheDocument();
    expect(screen.getByLabelText('Create artifact')).toBeInTheDocument();
  });

  it('disables Create button when input is empty', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    render(<CreatorPanel />);
    expect(screen.getByLabelText('Create artifact')).toBeDisabled();
  });

  it('enables Create button when input has text', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    render(<CreatorPanel />);
    await user.type(screen.getByLabelText('Creation command'), 'create a pirate personality');
    expect(screen.getByLabelText('Create artifact')).not.toBeDisabled();
  });

  it('shows success message after successful creation', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // First call: history fetch on mount
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    // Second call: create POST
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        artifact_type: 'personality',
        artifact_name: 'pirate',
        staging_path: '/tmp/staging/pirate',
        needs_validation: false,
      }),
    } as Response);

    // Third call: history refresh
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    render(<CreatorPanel />);
    await user.type(screen.getByLabelText('Creation command'), 'create a pirate personality');
    await user.click(screen.getByLabelText('Create artifact'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Created personality: pirate');
    });
  });

  it('shows error when creation fails', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid artifact type' }),
    } as Response);

    render(<CreatorPanel />);
    await user.type(screen.getByLabelText('Creation command'), 'bad input');
    await user.click(screen.getByLabelText('Create artifact'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid artifact type');
    });
  });

  it('shows error when API is unreachable', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: [] }),
    } as Response);

    fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));

    render(<CreatorPanel />);
    await user.type(screen.getByLabelText('Creation command'), 'test');
    await user.click(screen.getByLabelText('Create artifact'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Conscious API not reachable');
    });
  });

  it('renders history items with Promote button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        history: [
          { type: 'personality', name: 'pirate', timestamp: 1000, status: 'staged', staging_path: '/tmp/pirate' },
          { type: 'skill', name: 'greet', timestamp: 2000, status: 'promoted' },
        ],
      }),
    } as Response);

    render(<CreatorPanel />);
    await waitFor(() => {
      expect(screen.getByText('pirate')).toBeInTheDocument();
      expect(screen.getByText('greet')).toBeInTheDocument();
    });

    // Pirate has staging_path and is not promoted, so Promote button exists
    expect(screen.getByLabelText('Promote pirate')).toBeInTheDocument();
    // greet is already promoted, no Promote button
    expect(screen.queryByLabelText('Promote greet')).not.toBeInTheDocument();
  });
});
