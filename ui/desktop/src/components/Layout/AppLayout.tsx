import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from '../GooseSidebar/AppSidebar';
import { View, ViewOptions } from '../../utils/navigationUtils';
import { AppWindowMac, AppWindow, PanelRightIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '../ui/sidebar';
import ChatSessionsContainer from '../ChatSessionsContainer';
import { useChatContext } from '../../contexts/ChatContext';
import { UserInput } from '../../types/message';
import { TimeWarpProvider, TimeWarpBar } from '../timewarp';
import { AgentPanelProvider } from '../GooseSidebar/AgentPanelContext';
import { CLIProvider } from '../cli/CLIContext';
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

// ── Right Panel (Super-Goose addition) ────────────────────────────────────
// Simple CSS-based right panel with toggle — no react-resizable-panels needed.
const RIGHT_PANEL_WIDTH = '20rem'; // 320px

function RightPanel({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const [activeTab, setActiveTab] = useState<'agent' | 'super'>('agent');

  return (
    <>
      {/* Toggle button — always visible */}
      <Button
        variant="ghost"
        size="xs"
        className="fixed top-3 right-3 z-50 no-drag hover:!bg-background-medium hover:scale-105"
        onClick={onToggle}
        title={isOpen ? 'Close right panel' : 'Open right panel'}
      >
        <PanelRightIcon className="w-4 h-4" />
      </Button>

      {/* Panel — slides in/out */}
      <div
        className="border-l border-border bg-background flex flex-col h-full overflow-hidden transition-[width,min-width] duration-300 ease-out"
        style={{
          width: isOpen ? RIGHT_PANEL_WIDTH : '0px',
          minWidth: isOpen ? RIGHT_PANEL_WIDTH : '0px',
        }}
      >
        {isOpen && (
          <>
            {/* Tab strip */}
            <div className="flex border-b border-border shrink-0">
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'agent'
                    ? 'text-text-default border-b-2 border-primary'
                    : 'text-text-muted hover:text-text-default'
                }`}
                onClick={() => setActiveTab('agent')}
              >
                Agent
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'super'
                    ? 'text-text-default border-b-2 border-primary'
                    : 'text-text-muted hover:text-text-default'
                }`}
                onClick={() => setActiveTab('super')}
              >
                Super Goose
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'agent' ? (
                <div className="flex flex-col gap-2 p-2">
                  <AgentStatusPanel />
                  <TaskBoardPanel />
                  <FileActivityPanel />
                  <SkillsPluginsPanel />
                  <ConnectorStatusPanel />
                  <AgentMessagesPanel />
                </div>
              ) : (
                <SuperGoosePanel />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const AppLayoutContent: React.FC<AppLayoutContentProps> = ({ activeSessions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const safeIsMacOS = (window?.electron?.platform || 'darwin') === 'darwin';
  const { isMobile, openMobile } = useSidebar();
  const chatContext = useChatContext();
  const isOnPairRoute = location.pathname === '/pair';

  // Right panel state (Super-Goose addition)
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

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

  return (
    <div className="flex flex-1 w-full min-h-0 relative animate-fade-in">
      {/* Header buttons */}
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

      {/* Left sidebar — upstream shadcn pattern, proven working */}
      <Sidebar variant="inset" collapsible="offcanvas">
        <AppSidebar
          onSelectSession={handleSelectSession}
          setView={setView}
          currentPath={location.pathname}
        />
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        <div className="flex flex-1 min-h-0 h-full">
          {/* Center content */}
          <div className="flex flex-col min-h-0 flex-1 min-w-0">
            <div className="flex-1 min-h-0 overflow-auto">
              <Outlet />
              <div className={isOnPairRoute ? 'contents' : 'hidden'}>
                <ChatSessionsContainer setChat={setChat} activeSessions={activeSessions} />
              </div>
            </div>
            <TimeWarpBar />
          </div>

          {/* Right panel — Super-Goose addition */}
          <RightPanel
            isOpen={rightPanelOpen}
            onToggle={() => setRightPanelOpen((v) => !v)}
          />
        </div>
      </SidebarInset>
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
          <SidebarProvider>
            <AppLayoutContent activeSessions={activeSessions} />
          </SidebarProvider>
        </CLIProvider>
      </AgentPanelProvider>
    </TimeWarpProvider>
  );
};
