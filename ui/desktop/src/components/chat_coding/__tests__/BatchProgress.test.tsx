import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock, polyfillScrollIntoView } from './helpers';
import { BatchProgress } from '../BatchProgress';
import type { BatchItem } from '../BatchProgress';

vi.mock('lucide-react', () => lucideReactMock);

beforeAll(() => {
  polyfillScrollIntoView();
});

const makeItem = (overrides: Partial<BatchItem> = {}): BatchItem => ({
  id: 'item-1',
  label: 'Test item',
  status: 'pending',
  ...overrides,
});

describe('BatchProgress', () => {
  it('renders with default title "Batch Progress"', () => {
    const items = [makeItem()];
    render(<BatchProgress items={items} />);
    expect(screen.getByText('Batch Progress')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    const items = [makeItem()];
    render(<BatchProgress items={items} title="File Operations" />);
    expect(screen.getByText('File Operations')).toBeInTheDocument();
  });

  it('shows overall progress bar', () => {
    const items = [
      makeItem({ id: '1', status: 'completed' }),
      makeItem({ id: '2', status: 'pending' }),
    ];
    render(<BatchProgress items={items} />);
    const progressBar = screen.getByRole('progressbar', { name: 'Overall batch progress' });
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows completion count (done/total)', () => {
    const items = [
      makeItem({ id: '1', status: 'completed' }),
      makeItem({ id: '2', status: 'processing' }),
      makeItem({ id: '3', status: 'pending' }),
    ];
    render(<BatchProgress items={items} />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('shows error summary when items have errors', () => {
    const items = [
      makeItem({ id: '1', status: 'error', label: 'Task A', error: 'Network failure' }),
      makeItem({ id: '2', status: 'completed' }),
    ];
    render(<BatchProgress items={items} />);
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText(/Task A.*Network failure/)).toBeInTheDocument();
  });

  it('renders hide/show completed toggle when completed items exist', () => {
    const items = [
      makeItem({ id: '1', status: 'completed' }),
      makeItem({ id: '2', status: 'pending' }),
    ];
    render(<BatchProgress items={items} />);
    const toggle = screen.getByText(/Hide 1 completed/);
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText(/Show 1 completed/)).toBeInTheDocument();
  });
});
