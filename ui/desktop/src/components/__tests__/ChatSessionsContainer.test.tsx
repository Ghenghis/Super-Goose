import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChatSessionsContainer from '../ChatSessionsContainer';
// ChatType used implicitly by mock typing

// Mock BaseChat entirely since it's a heavy component
vi.mock('../BaseChat', () => ({
  default: ({
    sessionId,
    isActiveSession,
  }: {
    sessionId: string;
    isActiveSession: boolean;
  }) => (
    <div
      data-testid={`base-chat-${sessionId}`}
      data-active={isActiveSession}
    >
      BaseChat: {sessionId} (active: {String(isActiveSession)})
    </div>
  ),
}));

const defaultSetChat = vi.fn();

function renderWithRouter(
  activeSessions: Array<{ sessionId: string; initialMessage?: { msg: string; images: never[] } }>,
  searchParams = ''
) {
  return render(
    <MemoryRouter initialEntries={[`/pair?${searchParams}`]}>
      <ChatSessionsContainer
        setChat={defaultSetChat}
        activeSessions={activeSessions}
      />
    </MemoryRouter>
  );
}

describe('ChatSessionsContainer', () => {
  beforeEach(() => {
    defaultSetChat.mockClear();
  });

  it('returns null when no current session and no active sessions', () => {
    const { container } = renderWithRouter([], '');
    expect(container.innerHTML).toBe('');
  });

  it('renders a single active session', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }],
      'resumeSessionId=sess-1'
    );

    expect(screen.getByTestId('base-chat-sess-1')).toBeInTheDocument();
  });

  it('marks the current session as active (visible)', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }, { sessionId: 'sess-2' }],
      'resumeSessionId=sess-1'
    );

    expect(screen.getByTestId('base-chat-sess-1')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('base-chat-sess-2')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('renders multiple sessions, only one visible', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }, { sessionId: 'sess-2' }, { sessionId: 'sess-3' }],
      'resumeSessionId=sess-2'
    );

    expect(screen.getByTestId('base-chat-sess-1')).toBeInTheDocument();
    expect(screen.getByTestId('base-chat-sess-2')).toBeInTheDocument();
    expect(screen.getByTestId('base-chat-sess-3')).toBeInTheDocument();

    // Only sess-2 is active
    expect(screen.getByTestId('base-chat-sess-2')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  it('adds currentSessionId to render list if not in activeSessions', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }],
      'resumeSessionId=sess-new'
    );

    // Both sess-1 and sess-new should be rendered
    expect(screen.getByTestId('base-chat-sess-1')).toBeInTheDocument();
    expect(screen.getByTestId('base-chat-sess-new')).toBeInTheDocument();
  });

  it('applies hidden class to non-active sessions', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }, { sessionId: 'sess-2' }],
      'resumeSessionId=sess-1'
    );

    const sess1Container = screen.getByTestId('base-chat-sess-1').parentElement!;
    const sess2Container = screen.getByTestId('base-chat-sess-2').parentElement!;

    expect(sess1Container.className).toContain('block');
    expect(sess2Container.className).toContain('hidden');
  });

  it('sets data-session-id attribute on each session wrapper', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }, { sessionId: 'sess-2' }],
      'resumeSessionId=sess-1'
    );

    const containers = document.querySelectorAll('[data-session-id]');
    expect(containers).toHaveLength(2);
    expect(containers[0].getAttribute('data-session-id')).toBe('sess-1');
    expect(containers[1].getAttribute('data-session-id')).toBe('sess-2');
  });

  it('renders sessions even without resumeSessionId when activeSessions exist', () => {
    renderWithRouter([{ sessionId: 'sess-1' }], '');

    // activeSessions is non-empty so it should render
    expect(screen.getByTestId('base-chat-sess-1')).toBeInTheDocument();
  });

  it('does not mark any session active when resumeSessionId is absent', () => {
    renderWithRouter([{ sessionId: 'sess-1' }], '');

    expect(screen.getByTestId('base-chat-sess-1')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('does not duplicate session when currentSessionId matches an active session', () => {
    renderWithRouter(
      [{ sessionId: 'sess-1' }, { sessionId: 'sess-2' }],
      'resumeSessionId=sess-2'
    );

    // sess-2 should appear exactly once
    const sess2Elements = screen.getAllByTestId('base-chat-sess-2');
    expect(sess2Elements).toHaveLength(1);
  });
});
