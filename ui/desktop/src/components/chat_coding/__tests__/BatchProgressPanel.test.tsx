import { render, screen } from '@testing-library/react';
import { lucideReactMock, polyfillScrollIntoView } from './helpers';
import BatchProgressPanel from '../BatchProgressPanel';

vi.mock('lucide-react', () => lucideReactMock);

beforeAll(() => {
  polyfillScrollIntoView();
});

describe('BatchProgressPanel', () => {
  it('returns null when toolStatuses is empty', () => {
    const { container } = render(
      <BatchProgressPanel toolStatuses={new Map()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders BatchProgress with items derived from toolStatuses', () => {
    const statuses = new Map([
      ['req-1', { label: 'Read file', status: 'completed' as const }],
      ['req-2', { label: 'Write file', status: 'processing' as const }],
    ]);
    render(<BatchProgressPanel toolStatuses={statuses} />);
    expect(screen.getByText('Tool Execution Progress')).toBeInTheDocument();
    expect(screen.getByText('Read file')).toBeInTheDocument();
    expect(screen.getByText('Write file')).toBeInTheDocument();
  });

  it('uses custom title when provided', () => {
    const statuses = new Map([
      ['req-1', { label: 'Task', status: 'pending' as const }],
    ]);
    render(<BatchProgressPanel toolStatuses={statuses} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('passes className to BatchProgress', () => {
    const statuses = new Map([
      ['req-1', { label: 'Item', status: 'pending' as const }],
    ]);
    const { container } = render(
      <BatchProgressPanel toolStatuses={statuses} className="custom-cls" />
    );
    expect(container.querySelector('.custom-cls')).toBeTruthy();
  });

  it('renders result text for completed items', () => {
    const statuses = new Map([
      ['req-1', { label: 'Done task', status: 'completed' as const, result: 'All good' }],
    ]);
    render(<BatchProgressPanel toolStatuses={statuses} />);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
