import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock all the heavy dependencies
vi.mock('../../ui/sidebar', () => ({
  SidebarContent: ({ children }: any) => <div data-testid="sidebar-content">{children}</div>,
  SidebarGroup: ({ children }: any) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: any) => <div>{children}</div>,
  SidebarMenu: ({ children }: any) => <nav data-testid="sidebar-menu">{children}</nav>,
  SidebarMenuButton: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} data-testid={props['data-testid']}>{children}</button>
  ),
  SidebarMenuItem: ({ children }: any) => <div>{children}</div>,
  SidebarSeparator: () => <hr />,
}));
vi.mock('../../ui/collapsible', () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../../icons', () => ({
  Gear: ({ className: _className }: any) => <span data-testid="gear-icon" />,
}));
vi.mock('../../../contexts/ChatContext', () => ({
  DEFAULT_CHAT_TITLE: 'New Chat',
  useChatContext: () => ({ chat: { name: '' }, setChat: vi.fn() }),
}));
vi.mock('../../../api', () => ({
  listSessions: vi.fn(() => Promise.resolve({ data: { sessions: [] } })),
  updateSessionName: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../../../sessions', () => ({
  resumeSession: vi.fn(),
  startNewSession: vi.fn(),
  shouldShowNewChatTitle: vi.fn(() => false),
}));
vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: () => vi.fn(),
}));
vi.mock('../../SessionIndicators', () => ({
  SessionIndicators: () => <span data-testid="session-indicators" />,
}));
vi.mock('../../../hooks/useSidebarSessionStatus', () => ({
  useSidebarSessionStatus: () => ({
    getSessionStatus: vi.fn(),
    clearUnread: vi.fn(),
  }),
}));
vi.mock('../../../utils/workingDir', () => ({
  getInitialWorkingDir: () => '/home/user',
}));
vi.mock('../../ConfigContext', () => ({
  useConfig: () => ({ extensionsList: [] }),
}));
vi.mock('../../common/InlineEditText', () => ({
  InlineEditText: ({ value }: any) => <span>{value}</span>,
}));
vi.mock('../AgentPanelContext', () => ({
  useAgentPanel: () => ({
    state: { mode: 'code', agents: [] },
    setMode: vi.fn(),
  }),
}));
vi.mock('../AgentStatusPanel', () => ({ default: () => <div data-testid="agent-status" /> }));
vi.mock('../TaskBoardPanel', () => ({ default: () => <div data-testid="task-board" /> }));
vi.mock('../SkillsPluginsPanel', () => ({ default: () => <div data-testid="skills" /> }));
vi.mock('../ConnectorStatusPanel', () => ({ default: () => <div data-testid="connectors" /> }));
vi.mock('../FileActivityPanel', () => ({ default: () => <div data-testid="file-activity" /> }));
vi.mock('../ToolCallLog', () => ({ default: () => <div data-testid="tool-log" /> }));
vi.mock('../AgentMessagesPanel', () => ({ default: () => <div data-testid="agent-msgs" /> }));
vi.mock('../../../constants/events', () => ({
  AppEvents: {
    SESSION_CREATED: 'session-created',
    SESSION_NEEDS_NAME_UPDATE: 'session-needs-name-update',
    SESSION_DELETED: 'session-deleted',
    SESSION_RENAMED: 'session-renamed',
    TRIGGER_NEW_CHAT: 'trigger-new-chat',
  },
}));

import AppSidebar from '../AppSidebar';

const renderSidebar = (props = {}) =>
  render(
    <MemoryRouter>
      <AppSidebar
        onSelectSession={vi.fn()}
        currentPath="/"
        {...props}
      />
    </MemoryRouter>
  );

describe('AppSidebar', () => {
  it('renders the Home button', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-home-button')).toBeInTheDocument();
  });

  it('renders the Chat/new chat button', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-new-chat-button')).toBeInTheDocument();
  });

  it('renders Settings menu item', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-settings-button')).toBeInTheDocument();
  });

  it('renders Extensions menu item', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-extensions-button')).toBeInTheDocument();
  });

  it('renders Search menu item', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-search-button')).toBeInTheDocument();
  });

  it('renders Recipes menu item', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-recipes-button')).toBeInTheDocument();
  });
});
