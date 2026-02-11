import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookmarkManager from '../BookmarkManager';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('BookmarkManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the Bookmarks heading', () => {
      render(<BookmarkManager />);
      expect(screen.getByText('Bookmarks')).toBeInTheDocument();
    });

    it('renders bookmark count summary', () => {
      render(<BookmarkManager />);
      // "10 bookmarks across 5 sessions"
      expect(screen.getByText(/10 bookmarks/)).toBeInTheDocument();
      expect(screen.getByText(/5 sessions/)).toBeInTheDocument();
    });

    it('renders the Create Bookmark button', () => {
      render(<BookmarkManager />);
      expect(screen.getByText('Create Bookmark')).toBeInTheDocument();
    });

    it('renders bookmark labels', () => {
      render(<BookmarkManager />);
      expect(screen.getByText('Auth flow fix')).toBeInTheDocument();
      expect(screen.getByText('Database schema migration')).toBeInTheDocument();
      expect(screen.getByText('Stripe webhook handler')).toBeInTheDocument();
      expect(screen.getByText('K8s health probes')).toBeInTheDocument();
      expect(screen.getByText('Image optimization results')).toBeInTheDocument();
    });

    it('renders bookmark descriptions', () => {
      render(<BookmarkManager />);
      expect(
        screen.getByText(/Fixed the OAuth2 callback handling/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Created migration script/)
      ).toBeInTheDocument();
    });

    it('renders session group headers', () => {
      render(<BookmarkManager />);
      // Session names appear as group headers (uppercase)
      const headers = screen.getAllByText('Refactor authentication module');
      expect(headers.length).toBeGreaterThanOrEqual(1);
    });

    it('displays message indices', () => {
      render(<BookmarkManager />);
      expect(screen.getByText('Message #12')).toBeInTheDocument();
      expect(screen.getByText('Message #8')).toBeInTheDocument();
    });
  });

  describe('Create Bookmark', () => {
    it('shows hint when Create Bookmark button is clicked', async () => {
      const user = userEvent.setup();
      render(<BookmarkManager />);

      const createBtn = screen.getByText('Create Bookmark');
      await user.click(createBtn);

      expect(
        screen.getByText('Use /bookmark in a chat session to create a bookmark at the current point.')
      ).toBeInTheDocument();
    });
  });

  describe('Jump Action', () => {
    it('has Jump buttons with correct title', () => {
      render(<BookmarkManager />);
      const jumpButtons = screen.getAllByTitle('Jump to this bookmark');
      expect(jumpButtons.length).toBe(10); // 10 bookmarks
    });

    it('calls console.log when Jump button is clicked', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'log');
      render(<BookmarkManager />);

      const jumpButtons = screen.getAllByTitle('Jump to this bookmark');
      await user.click(jumpButtons[0]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Jumping to session')
      );
    });
  });

  describe('Delete Action', () => {
    it('has Delete buttons with correct title', () => {
      render(<BookmarkManager />);
      const deleteButtons = screen.getAllByTitle('Delete bookmark');
      expect(deleteButtons.length).toBe(10);
    });

    it('removes a bookmark when Delete is clicked', async () => {
      const user = userEvent.setup();
      render(<BookmarkManager />);

      // Verify the first bookmark in DOM exists (sorted by session name alphabetically,
      // "Add unit tests for payment service" comes first, containing "Stripe webhook handler")
      expect(screen.getByText('Stripe webhook handler')).toBeInTheDocument();

      // Click delete on the first bookmark in the rendered list
      const deleteButtons = screen.getAllByTitle('Delete bookmark');
      await user.click(deleteButtons[0]);

      // The bookmark should be removed after state update
      await waitFor(() => {
        expect(screen.queryByText('Stripe webhook handler')).not.toBeInTheDocument();
      });
    });

    it('updates count after deleting a bookmark', async () => {
      const user = userEvent.setup();
      render(<BookmarkManager />);

      expect(screen.getByText(/10 bookmarks/)).toBeInTheDocument();

      const deleteButtons = screen.getAllByTitle('Delete bookmark');
      await user.click(deleteButtons[0]);

      expect(screen.getByText(/9 bookmarks/)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when all bookmarks are deleted', async () => {
      const user = userEvent.setup();
      render(<BookmarkManager />);

      // Delete all 10 bookmarks
      for (let i = 0; i < 10; i++) {
        const deleteButtons = screen.getAllByTitle('Delete bookmark');
        await user.click(deleteButtons[0]);
      }

      expect(screen.getByText('No bookmarks yet')).toBeInTheDocument();
      expect(
        screen.getByText('Use /bookmark in a chat to save important points')
      ).toBeInTheDocument();
    });
  });
});
