import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionItem from '../SessionItem';
import { shouldShowNewChatTitle } from '../../../sessions';

// Mock dependencies
vi.mock('../../../utils/date', () => ({
  formatDate: vi.fn((date: string) => `Formatted: ${date}`),
}));

vi.mock('../../../sessions', () => ({
  shouldShowNewChatTitle: vi.fn(() => false),
}));

vi.mock('../../../contexts/ChatContext', () => ({
  DEFAULT_CHAT_TITLE: 'New Chat',
}));

vi.mock('../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

describe('SessionItem', () => {
  const mockSession = {
    id: 'session-1',
    name: 'Test Session',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    message_count: 42,
    working_dir: '/home/user/project',
    extension_data: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the session name', () => {
    render(<SessionItem session={mockSession} />);
    expect(screen.getByText('Test Session')).toBeInTheDocument();
  });

  it('renders the formatted date', () => {
    render(<SessionItem session={mockSession} />);
    expect(screen.getByText(/Formatted: 2026-01-15T12:00:00Z/)).toBeInTheDocument();
  });

  it('renders the message count', () => {
    render(<SessionItem session={mockSession} />);
    expect(screen.getByText(/42 messages/)).toBeInTheDocument();
  });

  it('renders the working directory', () => {
    render(<SessionItem session={mockSession} />);
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();
  });

  it('renders inside a Card component', () => {
    render(<SessionItem session={mockSession} />);
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('renders extra actions when provided', () => {
    render(
      <SessionItem
        session={mockSession}
        extraActions={<button data-testid="extra-action">Delete</button>}
      />
    );
    expect(screen.getByTestId('extra-action')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not render extra actions section when not provided', () => {
    const { container } = render(<SessionItem session={mockSession} />);
    expect(container.querySelector('[data-testid="extra-action"]')).toBeNull();
  });

  it('shows DEFAULT_CHAT_TITLE when shouldShowNewChatTitle returns true', () => {
    vi.mocked(shouldShowNewChatTitle).mockReturnValue(true);

    render(<SessionItem session={mockSession} />);
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });
});
