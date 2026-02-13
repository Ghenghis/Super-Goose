import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PoliciesPanel from '../PoliciesPanel';

// Mock UI components
vi.mock('../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    variant?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      data-testid="switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

vi.mock('../../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('../../../ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

describe('PoliciesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));
  });

  it('shows loading state initially', () => {
    const { container } = render(<PoliciesPanel />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows "No policy rules configured" when no rules exist', async () => {
    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('No policy rules configured')).toBeInTheDocument();
      expect(screen.getByText('Import a YAML file to add rules')).toBeInTheDocument();
    });
  });

  it('displays "0 active rules" count when no rules', async () => {
    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('0 active rules')).toBeInTheDocument();
    });
  });

  it('renders Dry-Run Mode toggle', async () => {
    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Dry-Run Mode')).toBeInTheDocument();
      expect(screen.getByText('Log policy violations without enforcing them')).toBeInTheDocument();
    });
  });

  it('renders Import YAML button', async () => {
    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Import YAML')).toBeInTheDocument();
    });
  });

  it('displays rules from API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          rules: [
            {
              id: 'rule-1',
              name: 'Block PII',
              condition: 'message contains PII',
              action: 'block',
              enabled: true,
            },
            {
              id: 'rule-2',
              name: 'Rate Limit',
              condition: 'requests > 100',
              action: 'throttle',
              enabled: false,
            },
          ],
          dryRunMode: true,
        }),
    } as Response);

    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Block PII')).toBeInTheDocument();
      expect(screen.getByText('Rate Limit')).toBeInTheDocument();
      expect(screen.getByText('1 active rule')).toBeInTheDocument();
    });
  });

  it('shows Dry Run badge when dryRunMode is active', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          rules: [],
          dryRunMode: true,
        }),
    } as Response);

    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Dry Run')).toBeInTheDocument();
    });
  });

  it('toggles dry-run mode', async () => {
    // The toggle handler calls backendApi.updatePolicyDryRunMode which uses fetch.
    // If fetch rejects, the toggle reverts. So we need fetch to succeed for the toggle.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/dry-run')) {
        return Promise.resolve({ ok: true } as Response);
      }
      return Promise.reject(new Error('Not available'));
    });

    const user = userEvent.setup();
    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Dry-Run Mode')).toBeInTheDocument();
    });

    // Find the dry-run switch (last switch on the page)
    const switches = screen.getAllByTestId('switch');
    const dryRunSwitch = switches[switches.length - 1];

    await user.click(dryRunSwitch);

    await waitFor(() => {
      expect(dryRunSwitch).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('displays rule conditions and actions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          rules: [
            {
              id: 'r1',
              name: 'Test Rule',
              condition: 'input matches pattern',
              action: 'warn user',
              enabled: true,
            },
          ],
          dryRunMode: false,
        }),
    } as Response);

    render(<PoliciesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/input matches pattern/)).toBeInTheDocument();
      expect(screen.getByText(/warn user/)).toBeInTheDocument();
    });
  });

  it('has a hidden file input for YAML import', async () => {
    const { container } = render(<PoliciesPanel />);

    await waitFor(() => {
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', '.yaml,.yml');
      expect(fileInput).toHaveClass('hidden');
    });
  });
});
