import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { SkillCard } from '../SkillCard';
import type { SkillToolCall } from '../SkillCard';

vi.mock('lucide-react', () => lucideReactMock);

const makeToolCall = (overrides: Partial<SkillToolCall> = {}): SkillToolCall => ({
  tool: 'read_file',
  status: 'completed',
  ...overrides,
});

describe('SkillCard', () => {
  const defaultProps = {
    name: 'Code Review',
    description: 'Reviewing code changes',
    toolCalls: [
      makeToolCall({ tool: 'read_file', status: 'completed' }),
      makeToolCall({ tool: 'write_file', status: 'running' }),
    ],
    status: 'running' as const,
  };

  it('renders without crashing', () => {
    const { container } = render(<SkillCard {...defaultProps} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('displays skill name', () => {
    render(<SkillCard {...defaultProps} />);
    expect(screen.getByText('Code Review')).toBeInTheDocument();
  });

  it('displays description', () => {
    render(<SkillCard {...defaultProps} />);
    expect(screen.getByText('Reviewing code changes')).toBeInTheDocument();
  });

  it('shows status badge', () => {
    render(<SkillCard {...defaultProps} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows tool call count (done/total)', () => {
    render(<SkillCard {...defaultProps} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('shows result summary when completed with no errors', () => {
    const props = {
      ...defaultProps,
      status: 'completed' as const,
      toolCalls: [
        makeToolCall({ status: 'completed' }),
        makeToolCall({ tool: 'lint', status: 'completed' }),
      ],
    };
    render(<SkillCard {...props} />);
    expect(screen.getByText('All 2 tool calls completed successfully')).toBeInTheDocument();
  });

  it('shows progress bar when running', () => {
    const { container } = render(<SkillCard {...defaultProps} />);
    // Progress bar is a div inside a bg-gray div
    const progressDiv = container.querySelector('.bg-blue-500');
    expect(progressDiv).toBeTruthy();
  });
});
