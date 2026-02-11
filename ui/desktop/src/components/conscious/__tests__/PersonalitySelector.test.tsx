import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonalitySelector from '../PersonalitySelector';

describe('PersonalitySelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should render nothing when no personalities are returned', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ personalities: [], active: 'default' }),
    });

    const { container } = render(<PersonalitySelector />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should render nothing when fetch fails (API offline)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { container } = render(<PersonalitySelector />);

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it('should render dropdown trigger when personalities exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          personalities: [
            { name: 'default', description: 'Default personality' },
            { name: 'creative', description: 'Creative mode' },
          ],
          active: 'default',
        }),
    });

    render(<PersonalitySelector />);

    await waitFor(() => {
      expect(screen.getByText('default')).toBeInTheDocument();
    });

    // The trigger button should have the aria-label
    expect(screen.getByLabelText('Select personality profile')).toBeInTheDocument();
  });

  it('should show active personality name on the trigger', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          personalities: [
            { name: 'creative', description: 'Creative mode' },
            { name: 'analytical', description: 'Analytical mode' },
          ],
          active: 'creative',
        }),
    });

    render(<PersonalitySelector />);

    await waitFor(() => {
      expect(screen.getByText('creative')).toBeInTheDocument();
    });
  });

  it('should open dropdown when trigger is clicked', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          personalities: [
            { name: 'default', description: 'Default personality' },
            { name: 'creative', description: 'Creative mode' },
          ],
          active: 'default',
        }),
    });

    render(<PersonalitySelector />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select personality profile')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Select personality profile'));

    // Dropdown should show listbox with personality options
    expect(screen.getByRole('listbox', { name: /personality profiles/i })).toBeInTheDocument();
  });

  it('should render personality descriptions in dropdown', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          personalities: [
            { name: 'default', description: 'Default personality' },
            { name: 'creative', description: 'Creative mode' },
          ],
          active: 'default',
        }),
    });

    render(<PersonalitySelector />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select personality profile')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Select personality profile'));

    expect(screen.getByText('Default personality')).toBeInTheDocument();
    expect(screen.getByText('Creative mode')).toBeInTheDocument();
  });

  it('should call switch API when a personality is selected', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            personalities: [
              { name: 'default' },
              { name: 'creative' },
            ],
            active: 'default',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    global.fetch = fetchMock;

    render(<PersonalitySelector />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select personality profile')).toBeInTheDocument();
    });

    // Open dropdown
    await user.click(screen.getByLabelText('Select personality profile'));

    // Click the "creative" option
    const creativeOption = screen.getByRole('option', { name: /creative/i });
    await user.click(creativeOption);

    // Should have called the switch endpoint
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8999/api/personality/switch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'creative' }),
      })
    );
  });

  it('should set aria-expanded to true when open', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          personalities: [{ name: 'default' }],
          active: 'default',
        }),
    });

    render(<PersonalitySelector />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select personality profile')).toBeInTheDocument();
    });

    const trigger = screen.getByLabelText('Select personality profile');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
