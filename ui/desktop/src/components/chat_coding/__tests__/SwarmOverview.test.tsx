import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { SwarmOverview } from '../SwarmOverview';
import type { AgentInfo } from '../SwarmOverview';

vi.mock('lucide-react', () => lucideReactMock);

const makeAgent = (overrides: Partial<AgentInfo> = {}): AgentInfo => ({
  id: 'agent-1',
  name: 'Planner',
  status: 'running',
  startedAt: Date.now() - 5000,
  toolCallCount: 3,
  ...overrides,
});

describe('SwarmOverview', () => {
  it('renders without crashing', () => {
    const { container } = render(<SwarmOverview agents={[]} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows "Agent Swarm" header', () => {
    render(<SwarmOverview agents={[makeAgent()]} />);
    expect(screen.getByText('Agent Swarm')).toBeInTheDocument();
  });

  it('shows active count badge for running agents', () => {
    const agents = [
      makeAgent({ id: '1', status: 'running' }),
      makeAgent({ id: '2', status: 'running' }),
      makeAgent({ id: '3', status: 'completed', completedAt: Date.now() }),
    ];
    render(<SwarmOverview agents={agents} />);
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('shows summary text with completion count', () => {
    const agents = [
      makeAgent({ id: '1', status: 'completed' }),
      makeAgent({ id: '2', status: 'running' }),
    ];
    render(<SwarmOverview agents={agents} />);
    expect(screen.getByText('1 of 2 agents complete')).toBeInTheDocument();
  });

  it('displays agent names', () => {
    const agents = [
      makeAgent({ id: '1', name: 'Researcher' }),
      makeAgent({ id: '2', name: 'Coder' }),
    ];
    render(<SwarmOverview agents={agents} />);
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(screen.getByText('Coder')).toBeInTheDocument();
  });

  it('has compact/expanded toggle', () => {
    render(<SwarmOverview agents={[makeAgent()]} />);
    expect(screen.getByLabelText('Compact view')).toBeInTheDocument();
  });
});
