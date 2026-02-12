import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { TaskCard, TaskCardGroup } from '../TaskCard';
import type { TaskCardProps, TaskLog } from '../TaskCard';

vi.mock('lucide-react', () => lucideReactMock);

vi.mock('../TaskGraph', () => ({
  default: () => <div data-testid="task-graph" />,
}));

describe('TaskCard', () => {
  const defaultProps: TaskCardProps = {
    id: 'task-1',
    title: 'Build project',
    status: 'running',
  };

  it('renders without crashing', () => {
    const { container } = render(<TaskCard {...defaultProps} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('displays task title', () => {
    render(<TaskCard {...defaultProps} />);
    expect(screen.getByText('Build project')).toBeInTheDocument();
  });

  it('shows status pill', () => {
    render(<TaskCard {...defaultProps} status="success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('shows progress bar when running', () => {
    render(<TaskCard {...defaultProps} progress={60} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '60');
  });

  it('shows elapsed timer when startedAt is provided', () => {
    const now = Date.now();
    render(<TaskCard {...defaultProps} startedAt={now - 5000} />);
    expect(screen.getByText('5s')).toBeInTheDocument();
  });

  it('renders logs section when logs exist', () => {
    const logs: TaskLog[] = [
      { timestamp: Date.now(), level: 'info', message: 'Compiling...' },
    ];
    render(<TaskCard {...defaultProps} logs={logs} />);
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });
});

describe('TaskCardGroup', () => {
  const tasks: TaskCardProps[] = [
    { id: '1', title: 'Task A', status: 'success' },
    { id: '2', title: 'Task B', status: 'running' },
    { id: '3', title: 'Task C', status: 'pending' },
  ];

  it('renders group title', () => {
    render(<TaskCardGroup title="Build Pipeline" tasks={tasks} />);
    expect(screen.getByText('Build Pipeline')).toBeInTheDocument();
  });

  it('shows completion fraction', () => {
    render(<TaskCardGroup title="Build" tasks={tasks} />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('shows summary of task statuses', () => {
    render(<TaskCardGroup title="Build" tasks={tasks} />);
    expect(screen.getByText(/1 done/)).toBeInTheDocument();
    expect(screen.getByText(/1 running/)).toBeInTheDocument();
    expect(screen.getByText(/1 pending/)).toBeInTheDocument();
  });
});
