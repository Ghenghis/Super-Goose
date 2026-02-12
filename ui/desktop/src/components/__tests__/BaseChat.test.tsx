import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BaseChat from '../BaseChat';
import { ChatState } from '../../types/chatState';

// Mock all heavy child components and hooks
vi.mock('../ProgressiveMessageList', () => ({
  default: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="message-list">Messages: {messages.length}</div>
  ),
}));

vi.mock('../ChatInput', () => ({
  default: ({
    handleSubmit,
    chatState,
    sessionId,
  }: {
    handleSubmit: (input: { msg: string; images: never[] }) => void;
    chatState: string;
    sessionId: string;
  }) => (
    <div data-testid="chat-input-component">
      <span data-testid="chat-state">{chatState}</span>
      <span data-testid="chat-session-id">{sessionId}</span>
      <button
        data-testid="submit-btn"
        onClick={() => handleSubmit({ msg: 'test', images: [] })}
      >
        Submit
      </button>
    </div>
  ),
}));

vi.mock('../LoadingGoose', () => ({
  default: ({ chatState, message }: { chatState?: string; message?: string }) => (
    <div data-testid="loading-goose" data-state={chatState}>
      {message}
    </div>
  ),
}));

vi.mock('../PopularChatTopics', () => ({
  default: ({ append }: { append: (text: string) => void }) => (
    <div data-testid="popular-topics">
      <button onClick={() => append('popular topic')}>Topic</button>
    </div>
  ),
}));

vi.mock('../conversation/SearchView', () => ({
  SearchView: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="search-view">{children}</div>
  ),
}));

vi.mock('../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="main-panel-layout">{children}</div>,
}));

vi.mock('../ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    ref: _ref,
    ...props
  }: {
    children: React.ReactNode;
    ref?: unknown;
    [key: string]: unknown;
  }) => <div data-testid="scroll-area">{children}</div>,
  ScrollAreaHandle: {},
}));

vi.mock('../../hooks/useFileDrop', () => ({
  useFileDrop: () => ({
    droppedFiles: [],
    setDroppedFiles: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
  }),
}));

const mockUseChatStream = {
  session: null as Record<string, unknown> | null,
  messages: [] as unknown[],
  chatState: ChatState.Idle,
  setChatState: vi.fn(),
  handleSubmit: vi.fn(),
  submitElicitationResponse: vi.fn(),
  stopStreaming: vi.fn(),
  sessionLoadError: null as string | null,
  setRecipeUserParams: vi.fn(),
  tokenState: null,
  notifications: new Map(),
  onMessageUpdate: vi.fn(),
};

vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: () => mockUseChatStream,
}));

vi.mock('../../hooks/useAutoSubmit', () => ({
  useAutoSubmit: vi.fn(),
}));

vi.mock('../../hooks/useCostTracking', () => ({
  useCostTracking: () => ({
    sessionCosts: {},
  }),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: () => vi.fn(),
}));

vi.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
}));

vi.mock('../../utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../RecipeHeader', () => ({
  RecipeHeader: ({ title }: { title: string }) => (
    <div data-testid="recipe-header">{title}</div>
  ),
}));

vi.mock('../ui/RecipeWarningModal', () => ({
  RecipeWarningModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="recipe-warning-modal">RecipeWarning</div> : null,
}));

vi.mock('../../recipe', () => ({
  scanRecipe: vi.fn(async () => ({ has_security_warnings: false })),
}));

vi.mock('../recipes/RecipeActivities', () => ({
  default: () => <div data-testid="recipe-activities">RecipeActivities</div>,
}));

vi.mock('../alerts/useToolCount', () => ({
  useToolCount: () => 5,
}));

vi.mock('../ParameterInputModal', () => ({
  default: () => <div data-testid="parameter-modal">ParameterInputModal</div>,
}));

vi.mock('../../utils/providerUtils', () => ({
  substituteParameters: vi.fn((prompt: string) => prompt),
}));

vi.mock('../recipes/CreateRecipeFromSessionModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-recipe-modal">CreateRecipeModal</div> : null,
}));

vi.mock('../../toasts', () => ({
  toastSuccess: vi.fn(),
}));

vi.mock('../icons', () => ({
  Goose: ({ className }: { className?: string }) => (
    <span data-testid="goose-icon" className={className}>
      GooseIcon
    </span>
  ),
}));

vi.mock('../GooseSidebar/EnvironmentBadge', () => ({
  default: () => <span data-testid="env-badge">EnvBadge</span>,
}));

vi.mock('../chat_coding', () => ({
  SwarmOverview: () => null,
  SwarmProgress: () => null,
  CompactionIndicator: () => null,
  BatchProgressPanel: () => null,
  TaskCardGroup: () => null,
  SkillCard: () => null,
  AgentCommunication: () => null,
  BatchProgress: () => null,
  ChatCodingErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock window.electron extras
beforeEach(() => {
  (window.electron as Record<string, unknown>).hasAcceptedRecipeBefore = vi.fn(async () => true);
  (window.electron as Record<string, unknown>).recordRecipeHash = vi.fn(async () => {});
  (window.electron as Record<string, unknown>).logInfo = vi.fn();
  (window as Record<string, unknown>).appConfig = {
    get: vi.fn(() => undefined),
  };

  // Reset mock state
  mockUseChatStream.session = null;
  mockUseChatStream.messages = [];
  mockUseChatStream.chatState = ChatState.Idle;
  mockUseChatStream.sessionLoadError = null;
  mockUseChatStream.handleSubmit.mockClear();
});

const defaultProps = () => ({
  setChat: vi.fn(),
  sessionId: 'sess-1',
  isActiveSession: true,
  suppressEmptyState: false,
});

function renderBaseChat(props = {}) {
  return render(
    <MemoryRouter>
      <BaseChat {...defaultProps()} {...props} />
    </MemoryRouter>
  );
}

describe('BaseChat', () => {
  it('renders the main layout', () => {
    renderBaseChat();
    expect(screen.getByTestId('main-panel-layout')).toBeInTheDocument();
  });

  it('renders ChatInput component', () => {
    renderBaseChat();
    expect(screen.getByTestId('chat-input-component')).toBeInTheDocument();
  });

  it('passes sessionId to ChatInput', () => {
    renderBaseChat({ sessionId: 'my-session' });
    expect(screen.getByTestId('chat-session-id')).toHaveTextContent('my-session');
  });

  it('renders popular topics when no messages and idle', () => {
    mockUseChatStream.messages = [];
    mockUseChatStream.chatState = ChatState.Idle;
    renderBaseChat();
    expect(screen.getByTestId('popular-topics')).toBeInTheDocument();
  });

  it('does not render popular topics when messages exist', () => {
    mockUseChatStream.messages = [
      {
        id: 'msg-1',
        role: 'user',
        created: 1000,
        content: [{ type: 'text', text: 'Hello' }],
        metadata: { userVisible: true, agentVisible: true },
      },
    ];
    renderBaseChat();
    expect(screen.queryByTestId('popular-topics')).not.toBeInTheDocument();
  });

  it('renders message list when messages exist', () => {
    mockUseChatStream.messages = [
      {
        id: 'msg-1',
        role: 'user',
        created: 1000,
        content: [{ type: 'text', text: 'Hello' }],
        metadata: { userVisible: true, agentVisible: true },
      },
    ];
    renderBaseChat();
    expect(screen.getByTestId('message-list')).toHaveTextContent('Messages: 1');
  });

  it('renders error state when session load fails', () => {
    mockUseChatStream.sessionLoadError = 'Session not found';
    renderBaseChat();
    expect(screen.getByText('Failed to Load Session')).toBeInTheDocument();
    expect(screen.getByText('Session not found')).toBeInTheDocument();
  });

  it('renders "Go home" button on error', () => {
    mockUseChatStream.sessionLoadError = 'Error loading';
    renderBaseChat();
    expect(screen.getByText('Go home')).toBeInTheDocument();
  });

  it('shows LoadingGoose when not idle', () => {
    mockUseChatStream.chatState = ChatState.Streaming;
    renderBaseChat();
    expect(screen.getByTestId('loading-goose')).toBeInTheDocument();
  });

  it('does not show LoadingGoose when idle', () => {
    mockUseChatStream.chatState = ChatState.Idle;
    mockUseChatStream.messages = [];
    renderBaseChat();
    expect(screen.queryByTestId('loading-goose')).not.toBeInTheDocument();
  });

  it('renders goose icon link', () => {
    renderBaseChat();
    expect(screen.getByTestId('goose-icon')).toBeInTheDocument();
  });

  it('renders environment badge', () => {
    renderBaseChat();
    expect(screen.getByTestId('env-badge')).toBeInTheDocument();
  });

  it('renders custom header when renderHeader is provided', () => {
    const renderHeader = () => <div data-testid="custom-header">Custom Header</div>;
    renderBaseChat({ renderHeader });
    expect(screen.getByTestId('custom-header')).toBeInTheDocument();
  });

  it('renders recipe header when session has a recipe', () => {
    mockUseChatStream.session = {
      recipe: { title: 'My Recipe', description: 'desc' },
      name: 'Test Session',
    };
    renderBaseChat();
    expect(screen.getByTestId('recipe-header')).toHaveTextContent('My Recipe');
  });

  it('renders recipe activities when session has a recipe', () => {
    mockUseChatStream.session = {
      recipe: { title: 'My Recipe', description: 'desc', activities: [] },
      name: 'Test Session',
    };
    renderBaseChat();
    expect(screen.getByTestId('recipe-activities')).toBeInTheDocument();
  });

  it('dispatches session status update events', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderBaseChat();

    const statusEvents = dispatchSpy.mock.calls.filter(
      (call) => (call[0] as CustomEvent).type === 'session-status-update'
    );
    expect(statusEvents.length).toBeGreaterThan(0);
    dispatchSpy.mockRestore();
  });
});
