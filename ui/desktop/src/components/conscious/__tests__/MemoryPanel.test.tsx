import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemoryPanel from '../MemoryPanel';

const mockStatus = {
  session: {
    session_id: 'abc-123',
    entry_count: 42,
    session_duration_s: 300,
    speakers: { user: 20, conscious: 22 },
  },
  recent_transcript: ['Hello', 'How can I help?'],
};

describe('MemoryPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Conversation Memory header', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<MemoryPanel />);
    expect(screen.getByText('Conversation Memory')).toBeInTheDocument();
  });

  it('shows session stats when data is available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<MemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('22')).toBeInTheDocument();
      expect(screen.getByText('Conscious')).toBeInTheDocument();
    });
  });

  it('shows "Memory unavailable" when no session data', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<MemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText('Memory unavailable')).toBeInTheDocument();
    });
  });

  it('renders Clear button', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<MemoryPanel />);
    expect(screen.getByLabelText('Clear conversation history')).toBeInTheDocument();
  });

  it('Clear button is disabled when entry_count is 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { ...mockStatus.session, entry_count: 0 },
        recent_transcript: [],
      }),
    } as Response);

    render(<MemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Clear conversation history')).toBeDisabled();
  });

  it('calls clear memory API and refreshes on click', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Initial status fetch
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    // Clear memory POST
    fetchSpy.mockResolvedValueOnce({ ok: true } as Response);

    // Refresh status after clear
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: { ...mockStatus.session, entry_count: 0, speakers: { user: 0, conscious: 0 } },
        recent_transcript: [],
      }),
    } as Response);

    render(<MemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Clear conversation history'));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8999/api/agent/execute',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows error on clear failure', async () => {
    const user = userEvent.setup();
    let executeAttempted = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/api/agent/execute')) {
        executeAttempted = true;
        // Clear memory POST always fails
        return { ok: false } as Response;
      }
      // After clear failure, the refetch also fails so the error is not overwritten
      if (executeAttempted && urlStr.includes('/api/memory/status')) {
        return { ok: false } as Response;
      }
      // Initial status fetches return data
      return {
        ok: true,
        json: async () => mockStatus,
      } as Response;
    });

    render(<MemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Clear conversation history'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
