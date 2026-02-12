import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { SwarmProgress } from '../SwarmProgress';

vi.mock('lucide-react', () => lucideReactMock);

describe('SwarmProgress', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <SwarmProgress totalAgents={5} completedAgents={2} failedAgents={0} />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('shows "Swarm in progress" when not complete', () => {
    render(
      <SwarmProgress totalAgents={5} completedAgents={2} failedAgents={0} />
    );
    expect(screen.getByText('Swarm in progress')).toBeInTheDocument();
  });

  it('shows "Swarm complete" when all agents finished', () => {
    render(
      <SwarmProgress totalAgents={3} completedAgents={3} failedAgents={0} />
    );
    expect(screen.getByText('Swarm complete')).toBeInTheDocument();
  });

  it('shows "Swarm completed with errors" when there are failures', () => {
    render(
      <SwarmProgress totalAgents={3} completedAgents={2} failedAgents={1} />
    );
    expect(screen.getByText('Swarm completed with errors')).toBeInTheDocument();
  });

  it('shows agent count as fraction', () => {
    render(
      <SwarmProgress totalAgents={10} completedAgents={4} failedAgents={1} />
    );
    expect(screen.getByText('5/10 agents')).toBeInTheDocument();
  });

  it('shows current phase when provided', () => {
    render(
      <SwarmProgress
        totalAgents={5}
        completedAgents={2}
        failedAgents={0}
        currentPhase="Analysis"
      />
    );
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('has expand/collapse toggle', () => {
    render(
      <SwarmProgress totalAgents={5} completedAgents={2} failedAgents={0} />
    );
    expect(screen.getByLabelText('Expand details')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Expand details'));
    expect(screen.getByLabelText('Collapse details')).toBeInTheDocument();
  });
});
