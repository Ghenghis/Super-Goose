import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from '../GooseSidebar/AppSidebar';
import { View, ViewOptions } from '../../utils/navigationUtils';
import { AppWindowMac, AppWindow } from 'lucide-react';
import { Button } from '../ui/button';
import { SidebarProvider, SidebarTrigger, useSidebar } from '../ui/sidebar';
import ChatSessionsContainer from '../ChatSessionsContainer';
import { useChatContext } from '../../contexts/ChatContext';
import { UserInput } from '../../types/message';
import { TimeWarpProvider, TimeWarpBar } from '../timewarp';
import { AgentPanelProvider } from '../GooseSidebar/AgentPanelContext';
import { CLIProvider } from '../cli/CLIContext';
import { PanelSystemProvider } from './PanelSystem';
import { ResizableLayout } from './ResizableLayout';
import { AnimatedPipeline, usePipeline } from '../pipeline';
import AgentStatusPanel from '../GooseSidebar/AgentStatusPanel';
import TaskBoardPanel from '../GooseSidebar/TaskBoardPanel';
import FileActivityPanel from '../GooseSidebar/FileActivityPanel';
import SkillsPluginsPanel from '../GooseSidebar/SkillsPluginsPanel';
import ConnectorStatusPanel from '../GooseSidebar/ConnectorStatusPanel';
import AgentMessagesPanel from '../GooseSidebar/AgentMessagesPanel';
import SuperGoosePanel from '../super/SuperGoosePanel';

interface AppLayoutContentProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
  }>;
}

const AppLayoutContent: React.FC<AppLayoutContentProps> = ({ activeSessions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const safeIsMacOS = (window?.electron?.platform || 'darwin') === 'darwin';
  const { isMobile, openMobile } = useSidebar();
  const chatContext = useChatContext();
  const isOnPairRoute = location.pathname === '/pair';
  const { isVisible: pipelineVisible } = usePipeline();

  if (!chatContext) {
    throw new Error('AppLayoutContent must be used within ChatProvider');
  }

  const { setChat } = chatContext;

  // Calculate padding based on sidebar state and macOS
  const headerPadding = safeIsMacOS ? 'pl-21' : 'pl-4';

  // Hide buttons when mobile sheet is showing
  const shouldHideButtons = isMobile && openMobile;

  const setView = (view: View, viewOptions?: ViewOptions) => {
    switch (view) {
      case 'chat':
        navigate('/');
        break;
      case 'pair':
        navigate('/pair');
        break;
      case 'settings':
        navigate('/settings', { state: viewOptions });
        break;
      case 'extensions':
        navigate('/extensions', { state: viewOptions });
        break;
      case 'sessions':
        navigate('/sessions');
        break;
      case 'schedules':
        navigate('/schedules');
        break;
      case 'recipes':
        navigate('/recipes');
        break;
      case 'permission':
        navigate('/permission', { state: viewOptions });
        break;
      case 'ConfigureProviders':
        navigate('/configure-providers');
        break;
      case 'sharedSession':
        navigate('/shared-session', { state: viewOptions });
        break;
      case 'welcome':
        navigate('/welcome');
        break;
      default:
        navigate('/');
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    navigate('/', { state: { sessionId } });
  };

  const handleNewWindow = () => {
    window.electron.createChatWindow(
      undefined,
      window.appConfig.get('GOOSE_WORKING_DIR') as string | undefined
    );
  };

  // ── Left zone content (sidebar) ──────────────────────────────────────
  const leftContent = (
    <>
      {!shouldHideButtons && (
        <div className={`${headerPadding} absolute top-3 z-100 flex items-center`}>
          <SidebarTrigger
            className="no-drag hover:border-border-strong hover:text-text-default hover:!bg-background-medium hover:scale-105"
          />
          <Button
            onClick={handleNewWindow}
            className="no-drag hover:!bg-background-medium"
            variant="ghost"
            size="xs"
            title="Start a new session in a new window"
          >
            {safeIsMacOS ? <AppWindowMac className="w-4 h-4" /> : <AppWindow className="w-4 h-4" />}
          </Button>
        </div>
      )}
      <AppSidebar
        onSelectSession={handleSelectSession}
        setView={setView}
        currentPath={location.pathname}
      />
    </>
  );

  // ── Center zone content (outlet + sessions) ──────────────────────────
  const centerContent = (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
        <div className={isOnPairRoute ? 'contents' : 'hidden'}>
          <ChatSessionsContainer setChat={setChat} activeSessions={activeSessions} />
        </div>
      </div>
      <TimeWarpBar />
    </div>
  );

  // ── Right zone panel components ──────────────────────────────────────
  const rightPanelComponents = {
    agentPanel: (
      <div className="flex flex-col gap-2 p-2 overflow-y-auto h-full">
        <AgentStatusPanel />
        <TaskBoardPanel />
        <FileActivityPanel />
        <SkillsPluginsPanel />
        <ConnectorStatusPanel />
        <AgentMessagesPanel />
      </div>
    ),
    superGoose: <SuperGoosePanel />,
  };

  // ── Bottom zone panel components ─────────────────────────────────────
  const bottomPanelComponents = {
    pipeline: pipelineVisible ? (
      <div className="px-4 py-2 h-full">
        <AnimatedPipeline />
      </div>
    ) : (
      <div className="flex items-center justify-center h-full text-xs text-text-muted">
        Pipeline hidden — enable in Settings &gt; App
      </div>
    ),
  };

  return (
    <div className="flex flex-1 w-full min-h-0 relative animate-fade-in">
      <ResizableLayout
        leftContent={leftContent}
        centerContent={centerContent}
        rightPanelComponents={rightPanelComponents}
        bottomPanelComponents={bottomPanelComponents}
      />
    </div>
  );
};

interface AppLayoutProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
  }>;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ activeSessions }) => {
  return (
    <TimeWarpProvider>
      <AgentPanelProvider>
        <CLIProvider>
          <PanelSystemProvider>
            <SidebarProvider>
              <AppLayoutContent activeSessions={activeSessions} />
            </SidebarProvider>
          </PanelSystemProvider>
        </CLIProvider>
      </AgentPanelProvider>
    </TimeWarpProvider>
  );
};
