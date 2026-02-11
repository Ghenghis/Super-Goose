import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReflexionPanel from '../ReflexionPanel';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ReflexionPanel', () => {
  describe('Rendering', () => {
    it('renders the Reflexion heading', () => {
      render(<ReflexionPanel />);
      expect(screen.getByText('Reflexion')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<ReflexionPanel />);
      expect(
        screen.getByText('Learn from mistakes. The agent records failures and applies lessons to future sessions.')
      ).toBeInTheDocument();
    });

    it('renders the Reflexion Engine toggle label', () => {
      render(<ReflexionPanel />);
      expect(screen.getByText('Reflexion Engine')).toBeInTheDocument();
      expect(screen.getByText('Inject learned lessons into agent context')).toBeInTheDocument();
    });

    it('renders entry count stats', () => {
      render(<ReflexionPanel />);
      expect(screen.getByText('5 total entries')).toBeInTheDocument();
      expect(screen.getByText('4 applied to context')).toBeInTheDocument();
    });

    it('renders all failure entries (collapsed view)', () => {
      render(<ReflexionPanel />);
      // Each entry shows its failure text (truncated in collapsed view)
      expect(screen.getByText(/Attempted to modify a read-only file/)).toBeInTheDocument();
      expect(screen.getByText(/Generated SQL migration with DROP COLUMN/)).toBeInTheDocument();
      expect(screen.getByText(/Test assertions used toEqual on objects/)).toBeInTheDocument();
      expect(screen.getByText(/Kubernetes deployment YAML used latest tag/)).toBeInTheDocument();
      expect(screen.getByText(/Image processing function ran synchronously/)).toBeInTheDocument();
    });

    it('renders severity badges', () => {
      render(<ReflexionPanel />);
      const lowBadges = screen.getAllByText('low');
      const mediumBadges = screen.getAllByText('medium');
      const highBadges = screen.getAllByText('high');
      expect(lowBadges.length).toBe(1);
      expect(mediumBadges.length).toBe(2);
      expect(highBadges.length).toBe(2);
    });

    it('renders active badges for applied entries', () => {
      render(<ReflexionPanel />);
      const activeBadges = screen.getAllByText('active');
      expect(activeBadges.length).toBe(4); // 4 entries have applied: true
    });
  });

  describe('Expand/Collapse', () => {
    it('entries are collapsed by default', () => {
      render(<ReflexionPanel />);
      // "Lesson Learned" heading should not be visible in collapsed state
      expect(screen.queryByText('Lesson Learned')).not.toBeInTheDocument();
    });

    it('expands an entry to show failure and lesson details', async () => {
      const user = userEvent.setup();
      render(<ReflexionPanel />);

      // Click on the first entry
      const firstEntryButton = screen.getByText(/Attempted to modify a read-only file/).closest('button');
      expect(firstEntryButton).not.toBeNull();
      await user.click(firstEntryButton!);

      // Should now show the "Failure" and "Lesson Learned" labels
      expect(screen.getByText('Failure')).toBeInTheDocument();
      expect(screen.getByText('Lesson Learned')).toBeInTheDocument();

      // Should show the full lesson text
      expect(
        screen.getByText(/Always check file permissions before attempting write operations/)
      ).toBeInTheDocument();
    });

    it('collapses an expanded entry when clicked again', async () => {
      const user = userEvent.setup();
      render(<ReflexionPanel />);

      const firstEntryButton = screen.getByText(/Attempted to modify a read-only file/).closest('button');
      expect(firstEntryButton).not.toBeNull();

      // Expand
      await user.click(firstEntryButton!);
      expect(screen.getByText('Lesson Learned')).toBeInTheDocument();

      // Collapse
      await user.click(firstEntryButton!);
      expect(screen.queryByText('Lesson Learned')).not.toBeInTheDocument();
    });

    it('can expand multiple entries simultaneously', async () => {
      const user = userEvent.setup();
      render(<ReflexionPanel />);

      const firstEntry = screen.getByText(/Attempted to modify a read-only file/).closest('button');
      const secondEntry = screen.getByText(/Generated SQL migration with DROP COLUMN/).closest('button');

      await user.click(firstEntry!);
      await user.click(secondEntry!);

      // Both "Failure" labels should be visible
      const failureLabels = screen.getAllByText('Failure');
      expect(failureLabels.length).toBe(2);

      const lessonLabels = screen.getAllByText('Lesson Learned');
      expect(lessonLabels.length).toBe(2);
    });
  });

  describe('Session Names', () => {
    it('displays session names for each entry', () => {
      render(<ReflexionPanel />);
      expect(screen.getAllByText('Refactor authentication module').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Fix database connection pooling').length).toBeGreaterThanOrEqual(1);
    });
  });
});
