import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { TaskGraph } from '../TaskGraph';
import type { TaskGraphNode } from '../TaskGraph';

vi.mock('lucide-react', () => lucideReactMock);

const makeNode = (overrides: Partial<TaskGraphNode> = {}): TaskGraphNode => ({
  id: 1,
  tool: 'read_file',
  description: 'Read the source',
  depends_on: [],
  status: 'completed',
  ...overrides,
});

describe('TaskGraph', () => {
  it('shows "No tasks to display" when nodes is empty', () => {
    render(<TaskGraph nodes={[]} />);
    expect(screen.getByText('No tasks to display')).toBeInTheDocument();
  });

  it('renders SVG for graph nodes', () => {
    const nodes = [
      makeNode({ id: 1, tool: 'read_file' }),
      makeNode({ id: 2, tool: 'write_file', depends_on: [1] }),
    ];
    const { container } = render(<TaskGraph nodes={nodes} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders node labels (tool names)', () => {
    const nodes = [makeNode({ id: 1, tool: 'search' })];
    render(<TaskGraph nodes={nodes} />);
    expect(screen.getByText('search')).toBeInTheDocument();
  });

  it('renders edges between dependent nodes', () => {
    const nodes = [
      makeNode({ id: 1, tool: 'step1' }),
      makeNode({ id: 2, tool: 'step2', depends_on: [1] }),
    ];
    const { container } = render(<TaskGraph nodes={nodes} />);
    // Edges are rendered as path elements
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders duration badge when duration is set', () => {
    const nodes = [makeNode({ id: 1, tool: 'task', duration: 1500 })];
    render(<TaskGraph nodes={nodes} />);
    expect(screen.getByText('1s')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const nodes = [makeNode()];
    const { container } = render(<TaskGraph nodes={nodes} className="my-graph" />);
    expect(container.firstChild).toHaveClass('my-graph');
  });
});
