import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestingDashboard from '../TestingDashboard';

describe('TestingDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Testing & Self-Healing header', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    render(<TestingDashboard />);
    // The & is encoded as &amp; in JSX
    expect(screen.getByText(/Testing/)).toBeInTheDocument();
  });

  it('renders feature input, Validate and Heal buttons', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    render(<TestingDashboard />);
    expect(screen.getByLabelText('Feature name to validate')).toBeInTheDocument();
    expect(screen.getByLabelText('Run validation')).toBeInTheDocument();
    expect(screen.getByLabelText('Run self-healing')).toBeInTheDocument();
  });

  it('Heal button is disabled when no failures', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    render(<TestingDashboard />);
    expect(screen.getByLabelText('Run self-healing')).toBeDisabled();
  });

  it('shows success result after validation passes', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // History fetch
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    // Validate POST
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'passed',
        total: 5,
        passed: 5,
        failed: 0,
        failures: [],
        duration_ms: 1234,
      }),
    } as Response);

    // History refresh
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    render(<TestingDashboard />);
    await user.click(screen.getByLabelText('Run validation'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('5/5 passed');
      expect(screen.getByRole('status')).toHaveTextContent('1.2s');
    });
  });

  it('shows failure result and enables Heal button', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'failed',
        total: 5,
        passed: 3,
        failed: 2,
        failures: ['test_foo: assertion error', 'test_bar: timeout'],
        duration_ms: 2500,
      }),
    } as Response);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    render(<TestingDashboard />);

    // Need to type a feature name first for Heal to work
    await user.type(screen.getByLabelText('Feature name to validate'), 'auth');
    await user.click(screen.getByLabelText('Run validation'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('3/5 passed');
    });

    // Check failure list
    expect(screen.getByRole('list', { name: 'Test failures' })).toBeInTheDocument();
    expect(screen.getByText('test_foo: assertion error')).toBeInTheDocument();
    expect(screen.getByText('test_bar: timeout')).toBeInTheDocument();

    // Heal button should now be enabled
    expect(screen.getByLabelText('Run self-healing')).not.toBeDisabled();
  });

  it('shows error when API is unreachable', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ validation_history: [], healing_history: [] }),
    } as Response);

    fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));

    render(<TestingDashboard />);
    await user.click(screen.getByLabelText('Run validation'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Conscious API not reachable');
    });
  });

  it('shows history count when entries exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        validation_history: [
          { type: 'validation', timestamp: 1000, success: true, details: 'OK' },
          { type: 'validation', timestamp: 2000, success: false, details: 'Failed' },
        ],
        healing_history: [],
      }),
    } as Response);

    render(<TestingDashboard />);
    await waitFor(() => {
      expect(screen.getByText('2 recent test runs in history')).toBeInTheDocument();
    });
  });
});
