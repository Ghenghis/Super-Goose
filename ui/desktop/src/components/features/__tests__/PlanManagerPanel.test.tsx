import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanManagerPanel from '../PlanManagerPanel';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('PlanManagerPanel', () => {
  describe('Rendering', () => {
    it('renders the Plan Manager heading', () => {
      render(<PlanManagerPanel />);
      expect(screen.getByText('Plan Manager')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<PlanManagerPanel />);
      expect(
        screen.getByText('Structured execution plans with step-by-step progress tracking.')
      ).toBeInTheDocument();
    });

    it('renders the Structured Execution Mode toggle label', () => {
      render(<PlanManagerPanel />);
      expect(screen.getByText('Structured Execution Mode')).toBeInTheDocument();
      expect(screen.getByText('Break tasks into explicit plan steps before execution')).toBeInTheDocument();
    });

    it('renders plan count stats', () => {
      render(<PlanManagerPanel />);
      expect(screen.getByText('4 total plans')).toBeInTheDocument();
      expect(screen.getByText('2 completed')).toBeInTheDocument();
    });

    it('renders all plan titles', () => {
      render(<PlanManagerPanel />);
      expect(screen.getByText('Implement user authentication flow')).toBeInTheDocument();
      expect(screen.getByText('Fix database pool exhaustion issue')).toBeInTheDocument();
      expect(screen.getByText('Increase payment webhook test coverage')).toBeInTheDocument();
      expect(screen.getByText('Set up Kubernetes staging deployment')).toBeInTheDocument();
    });
  });

  describe('Status Indicators', () => {
    it('renders plan status badges', () => {
      render(<PlanManagerPanel />);
      const completedBadges = screen.getAllByText('completed');
      expect(completedBadges.length).toBe(2);
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('renders progress fractions for plans', () => {
      render(<PlanManagerPanel />);
      // Plan 1: 5/5 (all completed)
      expect(screen.getByText('5/5')).toBeInTheDocument();
      // Plan 2: 2/5 (2 completed, 1 in_progress, 2 pending)
      expect(screen.getByText('2/5')).toBeInTheDocument();
      // Plan 3: 4/4
      expect(screen.getByText('4/4')).toBeInTheDocument();
      // Plan 4: 3/5 (3 completed, 1 failed, 1 skipped)
      expect(screen.getByText('3/5')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse', () => {
    it('plan-002 is expanded by default (active plan)', () => {
      render(<PlanManagerPanel />);
      // The active plan (plan-002) is expanded by default, so its steps should be visible
      expect(screen.getByText('Profile current pool usage under load')).toBeInTheDocument();
      expect(screen.getByText('Increase max pool size to 25')).toBeInTheDocument();
      expect(screen.getByText('Add connection health check interval')).toBeInTheDocument();
    });

    it('other plans are collapsed by default', () => {
      render(<PlanManagerPanel />);
      // Plan 1 steps should NOT be visible
      expect(screen.queryByText('Analyze existing auth middleware code')).not.toBeInTheDocument();
    });

    it('expands a plan to show its steps', async () => {
      const user = userEvent.setup();
      render(<PlanManagerPanel />);

      const plan1Button = screen.getByText('Implement user authentication flow').closest('button');
      await user.click(plan1Button!);

      expect(screen.getByText('Analyze existing auth middleware code')).toBeInTheDocument();
      expect(screen.getByText('Replace HS256 with RS256 JWT validation')).toBeInTheDocument();
      expect(screen.getByText('Implement refresh token rotation')).toBeInTheDocument();
    });

    it('shows step durations when expanded', async () => {
      const user = userEvent.setup();
      render(<PlanManagerPanel />);

      const plan1Button = screen.getByText('Implement user authentication flow').closest('button');
      await user.click(plan1Button!);

      expect(screen.getByText('12s')).toBeInTheDocument();
      expect(screen.getByText('45s')).toBeInTheDocument();
      expect(screen.getByText('38s')).toBeInTheDocument();
    });

    it('collapses an expanded plan when clicked again', async () => {
      const user = userEvent.setup();
      render(<PlanManagerPanel />);

      // plan-002 is expanded by default
      expect(screen.getByText('Profile current pool usage under load')).toBeInTheDocument();

      const plan2Button = screen.getByText('Fix database pool exhaustion issue').closest('button');
      await user.click(plan2Button!);

      expect(screen.queryByText('Profile current pool usage under load')).not.toBeInTheDocument();
    });
  });

  describe('Step Status', () => {
    it('shows skipped step with strikethrough styling', async () => {
      const user = userEvent.setup();
      render(<PlanManagerPanel />);

      const plan4Button = screen.getByText('Set up Kubernetes staging deployment').closest('button');
      await user.click(plan4Button!);

      // The "Run smoke tests" step is skipped, should have line-through class
      const skippedStep = screen.getByText('Run smoke tests');
      expect(skippedStep).toHaveClass('line-through');
    });

    it('shows all step types when failed plan is expanded', async () => {
      const user = userEvent.setup();
      render(<PlanManagerPanel />);

      const plan4Button = screen.getByText('Set up Kubernetes staging deployment').closest('button');
      await user.click(plan4Button!);

      expect(screen.getByText('Create deployment manifests')).toBeInTheDocument();
      expect(screen.getByText('Deploy to staging cluster')).toBeInTheDocument();
      expect(screen.getByText('Run smoke tests')).toBeInTheDocument();
    });
  });
});
