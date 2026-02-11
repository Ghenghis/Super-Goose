import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchSidebar from '../SearchSidebar';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('SearchSidebar', () => {
  describe('Rendering', () => {
    it('renders the search heading', () => {
      render(<SearchSidebar />);
      expect(screen.getByText('Search')).toBeInTheDocument();
    });

    it('renders the search input with placeholder', () => {
      render(<SearchSidebar />);
      const input = screen.getByPlaceholderText('Search sessions...');
      expect(input).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<SearchSidebar />);
      expect(
        screen.getByText('Search across all sessions for messages, code, and context.')
      ).toBeInTheDocument();
    });

    it('renders all session groups when no query is entered', () => {
      render(<SearchSidebar />);
      expect(screen.getByText('Refactor authentication module')).toBeInTheDocument();
      expect(screen.getByText('Fix database connection pooling')).toBeInTheDocument();
      expect(screen.getByText('Add unit tests for payment service')).toBeInTheDocument();
      expect(screen.getByText('Deploy staging environment')).toBeInTheDocument();
      expect(screen.getByText('Optimize image processing pipeline')).toBeInTheDocument();
    });

    it('displays result count badges for each session group', () => {
      render(<SearchSidebar />);
      // Auth module has 2 results, DB pooling has 3, etc.
      const badges = screen.getAllByText('2');
      expect(badges.length).toBeGreaterThanOrEqual(2); // at least "Refactor auth" and "Deploy staging"
      expect(screen.getByText('3')).toBeInTheDocument(); // DB pooling has 3 results
    });
  });

  describe('Search Filtering', () => {
    it('filters results when typing a search query', async () => {
      const user = userEvent.setup();
      render(<SearchSidebar />);

      const input = screen.getByPlaceholderText('Search sessions...');
      await user.type(input, 'JWT');

      // Should show the auth session (has "JWT" in snippet)
      expect(screen.getByText('Refactor authentication module')).toBeInTheDocument();
      // Should not show sessions without JWT matches
      expect(screen.queryByText('Optimize image processing pipeline')).not.toBeInTheDocument();
    });

    it('shows result count summary when query is entered', async () => {
      const user = userEvent.setup();
      render(<SearchSidebar />);

      const input = screen.getByPlaceholderText('Search sessions...');
      await user.type(input, 'connection');

      // Should display "X results across Y sessions" text
      expect(screen.getByText(/result/)).toBeInTheDocument();
      expect(screen.getByText(/session/)).toBeInTheDocument();
    });

    it('shows empty state when no results match', async () => {
      const user = userEvent.setup();
      render(<SearchSidebar />);

      const input = screen.getByPlaceholderText('Search sessions...');
      await user.type(input, 'xyznonexistent12345');

      expect(screen.getByText(/No results found for/)).toBeInTheDocument();
      expect(screen.getByText('Try different keywords or check spelling')).toBeInTheDocument();
    });

    it('matches case-insensitively', async () => {
      const user = userEvent.setup();
      render(<SearchSidebar />);

      const input = screen.getByPlaceholderText('Search sessions...');
      await user.type(input, 'jwt');

      // Should still find "JWT" even with lowercase query
      expect(screen.getByText('Refactor authentication module')).toBeInTheDocument();
    });
  });

  describe('Session Expand/Collapse', () => {
    it('sessions are expanded by default', () => {
      render(<SearchSidebar />);
      // Line numbers should be visible if expanded (e.g., "L42")
      expect(screen.getByText('L42')).toBeInTheDocument();
    });

    it('collapses a session group when clicked', async () => {
      const user = userEvent.setup();
      render(<SearchSidebar />);

      // Initially L42 (from first group) is visible
      expect(screen.getByText('L42')).toBeInTheDocument();

      // Click the first session group header to collapse it
      const sessionButton = screen.getByText('Refactor authentication module').closest('button');
      expect(sessionButton).not.toBeNull();
      await user.click(sessionButton!);

      // After collapsing, L42 should no longer be visible
      expect(screen.queryByText('L42')).not.toBeInTheDocument();
    });

    it('re-expands a collapsed session when clicked again', async () => {
      const user = userEvent.setup();
      render(<SearchSidebar />);

      const sessionButton = screen.getByText('Refactor authentication module').closest('button');
      expect(sessionButton).not.toBeNull();

      // Collapse
      await user.click(sessionButton!);
      expect(screen.queryByText('L42')).not.toBeInTheDocument();

      // Re-expand
      await user.click(sessionButton!);
      expect(screen.getByText('L42')).toBeInTheDocument();
    });
  });

  describe('Search Result Snippets', () => {
    it('displays line numbers for results', () => {
      render(<SearchSidebar />);
      expect(screen.getByText('L42')).toBeInTheDocument();
      expect(screen.getByText('L87')).toBeInTheDocument();
      expect(screen.getByText('L15')).toBeInTheDocument();
    });

    it('displays date for each session', () => {
      render(<SearchSidebar />);
      expect(screen.getByText('2026-02-10')).toBeInTheDocument();
      expect(screen.getByText('2026-02-09')).toBeInTheDocument();
    });
  });
});
