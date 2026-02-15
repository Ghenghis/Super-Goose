import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemoryPanel from '../MemoryPanel';

// Mock UI components
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
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    type?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../../ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    type,
    className,
  }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    className?: string;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      className={className}
      data-testid="search-input"
    />
  ),
}));

describe('MemoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    const { container } = render(<MemoryPanel />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders all four memory subsystems after loading', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Working')).toBeInTheDocument();
      expect(screen.getByText('Episodic')).toBeInTheDocument();
      expect(screen.getByText('Semantic')).toBeInTheDocument();
      expect(screen.getByText('Procedural')).toBeInTheDocument();
    });
  });

  it('shows inactive status for all subsystems by default', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      const inactiveLabels = screen.getAllByText('inactive');
      expect(inactiveLabels.length).toBe(4);
    });
  });

  it('shows Items and Decay Rate for each subsystem', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      const itemsLabels = screen.getAllByText('Items');
      expect(itemsLabels.length).toBe(4);
      const decayLabels = screen.getAllByText('Decay Rate');
      expect(decayLabels.length).toBe(4);
    });
  });

  it('renders memory search input', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search memory...')).toBeInTheDocument();
    });
  });

  it('renders Search button', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Search')).toBeInTheDocument();
    });
  });

  it('renders Consolidate button', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Consolidate')).toBeInTheDocument();
    });
  });

  it('renders Export button', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
  });

  it('renders Import button', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument();
    });
  });

  it('changes Consolidate button text during consolidation', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not available'));

    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Consolidate')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Consolidate'));

    expect(screen.getByText('Consolidating...')).toBeInTheDocument();
  });

  it('allows typing in search input', async () => {
    const user = userEvent.setup();
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('search-input'), 'test query');
    expect(screen.getByTestId('search-input')).toHaveValue('test query');
  });

  it('displays API data when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          subsystems: [
            { id: 'working', name: 'Working', status: 'active', itemCount: 42, decayRate: '0.1/hr' },
            { id: 'episodic', name: 'Episodic', status: 'active', itemCount: 128, decayRate: '0.05/hr' },
            { id: 'semantic', name: 'Semantic', status: 'degraded', itemCount: 15, decayRate: '0.01/hr' },
            { id: 'procedural', name: 'Procedural', status: 'inactive', itemCount: 0, decayRate: 'N/A' },
          ],
        }),
    } as Response);

    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('128')).toBeInTheDocument();
      expect(screen.getByText('0.1/hr')).toBeInTheDocument();
    });
  });

  it('has a hidden file input for import', async () => {
    const { container } = render(<MemoryPanel />);

    await waitFor(() => {
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', '.json');
      expect(fileInput).toHaveClass('hidden');
    });
  });
});
