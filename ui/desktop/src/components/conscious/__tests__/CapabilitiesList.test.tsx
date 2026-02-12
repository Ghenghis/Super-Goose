import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CapabilitiesList from '../CapabilitiesList';

const mockCapabilities = [
  {
    name: 'web_search',
    description: 'Search the web for information',
    category: 'research',
    voice_triggers: ['search for', 'look up'],
  },
  {
    name: 'code_review',
    description: 'Review code quality',
    category: 'development',
    voice_triggers: ['review code', 'check code'],
  },
  {
    name: 'summarize',
    description: 'Summarize long text',
    category: 'research',
    voice_triggers: ['summarize', 'tldr'],
  },
];

describe('CapabilitiesList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders header with capability count after fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });
  });

  it('shows error when API is not reachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Capabilities API not reachable');
    });
  });

  it('does not show search or list when collapsed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Search capabilities')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('expands list on button click and shows capabilities', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expand capabilities list'));
    expect(screen.getByLabelText('Search capabilities')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('code_review')).toBeInTheDocument();
  });

  it('filters capabilities by search text', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expand capabilities list'));
    const searchInput = screen.getByLabelText('Search capabilities');
    await user.type(searchInput, 'code');

    expect(screen.getByText('code_review')).toBeInTheDocument();
    expect(screen.queryByText('web_search')).not.toBeInTheDocument();
    expect(screen.queryByText('summarize')).not.toBeInTheDocument();
  });

  it('shows "No capabilities match" when filter yields no results', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expand capabilities list'));
    await user.type(screen.getByLabelText('Search capabilities'), 'zzzzz');

    expect(screen.getByText('No capabilities match your search')).toBeInTheDocument();
  });

  it('groups capabilities by category', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expand capabilities list'));
    expect(screen.getByLabelText('research capabilities')).toBeInTheDocument();
    expect(screen.getByLabelText('development capabilities')).toBeInTheDocument();
  });

  it('collapses list when clicking Collapse button', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: mockCapabilities }),
    } as Response);

    render(<CapabilitiesList />);
    await waitFor(() => {
      expect(screen.getByText('Capabilities (3)')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Expand capabilities list'));
    expect(screen.getByText('web_search')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse capabilities list'));
    expect(screen.queryByText('web_search')).not.toBeInTheDocument();
  });
});
