import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CriticManagerPanel from '../CriticManagerPanel';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('CriticManagerPanel', () => {
  describe('Rendering', () => {
    it('renders the Critic heading', () => {
      render(<CriticManagerPanel />);
      expect(screen.getByText('Critic')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<CriticManagerPanel />);
      expect(
        screen.getByText('Automated quality assessment of agent outputs with scoring and suggestions.')
      ).toBeInTheDocument();
    });

    it('renders the Critic Engine toggle label', () => {
      render(<CriticManagerPanel />);
      expect(screen.getByText('Critic Engine')).toBeInTheDocument();
      expect(screen.getByText('Evaluate quality of agent responses')).toBeInTheDocument();
    });

    it('renders evaluation count stats', () => {
      render(<CriticManagerPanel />);
      expect(screen.getByText('5 evaluations')).toBeInTheDocument();
    });

    it('renders average score stats', () => {
      render(<CriticManagerPanel />);
      // Average: (8.3 + 8.0 + 7.3 + 5.8 + 8.5) / 5 = 7.6 (rounded to 1 decimal)
      expect(screen.getByText('7.6 avg score')).toBeInTheDocument();
    });

    it('renders all evaluation task summaries', () => {
      render(<CriticManagerPanel />);
      expect(screen.getByText(/Refactored JWT validation to use RS256/)).toBeInTheDocument();
      expect(screen.getByText(/Increased pool size and added health checks/)).toBeInTheDocument();
      expect(screen.getByText(/Created mock Stripe client/)).toBeInTheDocument();
      expect(screen.getByText(/Configured K8s manifests/)).toBeInTheDocument();
      expect(screen.getByText(/Migrated from ImageMagick to Sharp/)).toBeInTheDocument();
    });
  });

  describe('Score Display', () => {
    it('renders overall scores for each evaluation', () => {
      render(<CriticManagerPanel />);
      expect(screen.getByText('8.3')).toBeInTheDocument();
      expect(screen.getByText('8.0')).toBeInTheDocument();
      expect(screen.getByText('7.3')).toBeInTheDocument();
      expect(screen.getByText('5.8')).toBeInTheDocument();
      expect(screen.getByText('8.5')).toBeInTheDocument();
    });

    it('renders verdict badges', () => {
      render(<CriticManagerPanel />);
      const goodBadges = screen.getAllByText('Good');
      expect(goodBadges.length).toBe(3); // 3 "good" evaluations
      expect(screen.getByText('Acceptable')).toBeInTheDocument();
      expect(screen.getByText('Needs Work')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse', () => {
    it('evaluations are collapsed by default', () => {
      render(<CriticManagerPanel />);
      expect(screen.queryByText('Score Breakdown')).not.toBeInTheDocument();
    });

    it('expands an evaluation to show score breakdown', async () => {
      const user = userEvent.setup();
      render(<CriticManagerPanel />);

      const firstEval = screen.getByText(/Refactored JWT validation/).closest('button');
      expect(firstEval).not.toBeNull();
      await user.click(firstEval!);

      expect(screen.getByText('Score Breakdown')).toBeInTheDocument();
      expect(screen.getByText('Correctness')).toBeInTheDocument();
      expect(screen.getByText('Completeness')).toBeInTheDocument();
      expect(screen.getByText('Efficiency')).toBeInTheDocument();
      expect(screen.getByText('Safety')).toBeInTheDocument();
    });

    it('shows individual score values when expanded', async () => {
      const user = userEvent.setup();
      render(<CriticManagerPanel />);

      const firstEval = screen.getByText(/Refactored JWT validation/).closest('button');
      await user.click(firstEval!);

      // First evaluation: correctness: 9, completeness: 8, efficiency: 7, safety: 9
      // ScoreBar shows value as text
      const nines = screen.getAllByText('9');
      expect(nines.length).toBeGreaterThanOrEqual(1);
    });

    it('shows suggestions when expanded', async () => {
      const user = userEvent.setup();
      render(<CriticManagerPanel />);

      const firstEval = screen.getByText(/Refactored JWT validation/).closest('button');
      await user.click(firstEval!);

      expect(screen.getByText('Suggestions')).toBeInTheDocument();
      expect(
        screen.getByText('Consider adding token blacklist for revoked refresh tokens.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Add rate limiting on the token refresh endpoint.')
      ).toBeInTheDocument();
    });

    it('collapses an expanded evaluation when clicked again', async () => {
      const user = userEvent.setup();
      render(<CriticManagerPanel />);

      const firstEval = screen.getByText(/Refactored JWT validation/).closest('button');
      await user.click(firstEval!);
      expect(screen.getByText('Score Breakdown')).toBeInTheDocument();

      await user.click(firstEval!);
      expect(screen.queryByText('Score Breakdown')).not.toBeInTheDocument();
    });

    it('can expand multiple evaluations simultaneously', async () => {
      const user = userEvent.setup();
      render(<CriticManagerPanel />);

      const firstEval = screen.getByText(/Refactored JWT validation/).closest('button');
      const secondEval = screen.getByText(/Increased pool size/).closest('button');

      await user.click(firstEval!);
      await user.click(secondEval!);

      const breakdowns = screen.getAllByText('Score Breakdown');
      expect(breakdowns.length).toBe(2);
    });
  });

  describe('Session Names', () => {
    it('displays session names for each evaluation', () => {
      render(<CriticManagerPanel />);
      expect(screen.getAllByText('Refactor authentication module').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Fix database connection pooling').length).toBeGreaterThanOrEqual(1);
    });
  });
});
