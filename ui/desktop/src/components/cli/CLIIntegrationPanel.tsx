import React, { useState } from 'react';
import {
  Terminal,
  Download,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Monitor,
  HardDrive,
  Cpu,
  FolderOpen,
  Play,
  Settings,
  ChevronRight,
  Power,
  Send,
} from 'lucide-react';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useCLI, type Platform, type Arch } from './CLIContext';
import CLISetupWizard from './CLISetupWizard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLATFORM_LABEL: Record<Platform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

const PLATFORM_ICON: Record<Platform, React.ComponentType<{ className?: string }>> = {
  windows: Monitor,
  macos: Monitor,
  linux: Monitor,
};

const ARCH_LABEL: Record<Arch, string> = {
  x64: 'x86_64',
  arm64: 'ARM64',
};

// ---------------------------------------------------------------------------
// Status Section — shown when CLI is installed
// ---------------------------------------------------------------------------

const StatusSection: React.FC = () => {
  const { state } = useCLI();

  if (!state.isInstalled) return null;

  return (
    <div className="space-y-2 px-1">
      {/* Version info */}
      <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        <span className="text-text-default">Installed</span>
        <span className="ml-auto text-text-muted font-mono">
          {state.installedVersion ?? 'unknown'}
        </span>
      </div>

      {/* Update available indicator */}
      {state.updateAvailable && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <span className="text-text-default">
            Update available: {state.latestVersion}
          </span>
        </div>
      )}

      {/* Install path */}
      {state.installPath && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
          <FolderOpen className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="text-text-muted font-mono truncate" title={state.installPath}>
            {state.installPath}
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Quick Actions — shown when CLI is installed
// ---------------------------------------------------------------------------

const QuickActions: React.FC = () => {
  const { state, openTerminal, checkForUpdates, installCLI, updateCLI } = useCLI();
  const [isExpanded, setIsExpanded] = useState(true);

  if (!state.isInstalled) return null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
          <Play className="w-3.5 h-3.5" />
          <span>Quick Actions</span>
          <ChevronRight
            className={`w-3.5 h-3.5 ml-auto text-text-muted transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="mt-1 space-y-1.5 px-1">
          {/* Open Terminal */}
          <Button
            variant="outline"
            size="sm"
            shape="pill"
            className="w-full justify-start text-xs"
            onClick={openTerminal}
          >
            <Terminal className="w-3.5 h-3.5" />
            Open Terminal
          </Button>

          {/* Check for Updates */}
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            className="w-full justify-start text-xs"
            onClick={checkForUpdates}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check for Updates
          </Button>

          {/* Update (only when update available) */}
          {state.updateAvailable && (
            <Button
              variant="default"
              size="sm"
              shape="pill"
              className="w-full justify-start text-xs"
              onClick={updateCLI}
            >
              <Download className="w-3.5 h-3.5" />
              Update to {state.latestVersion}
            </Button>
          )}

          {/* Reinstall */}
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            className="w-full justify-start text-xs"
            onClick={installCLI}
          >
            <Settings className="w-3.5 h-3.5" />
            Reinstall
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ---------------------------------------------------------------------------
// Platform Info Card
// ---------------------------------------------------------------------------

const PlatformInfoCard: React.FC = () => {
  const { state } = useCLI();
  const [isExpanded, setIsExpanded] = useState(false);

  const PlatformIconComponent = PLATFORM_ICON[state.platform];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
          <Cpu className="w-3.5 h-3.5" />
          <span>Platform Info</span>
          <span className="ml-auto text-[10px] text-text-muted">
            {PLATFORM_LABEL[state.platform]}
          </span>
          <ChevronRight
            className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="mt-1 space-y-1.5 px-1">
          <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
            <PlatformIconComponent className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <span className="text-text-muted">OS</span>
            <span className="ml-auto text-text-default">{PLATFORM_LABEL[state.platform]}</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
            <HardDrive className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <span className="text-text-muted">Architecture</span>
            <span className="ml-auto text-text-default">{ARCH_LABEL[state.arch]}</span>
          </div>
          {state.installPath && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
              <FolderOpen className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <span className="text-text-muted">Path</span>
              <span
                className="ml-auto text-text-default font-mono truncate max-w-[120px]"
                title={state.installPath}
              >
                {state.installPath}
              </span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ---------------------------------------------------------------------------
// Embedded Terminal
// ---------------------------------------------------------------------------

const EmbeddedTerminal: React.FC = () => {
  const { state, sendCommand, closeTerminal } = useCLI();
  const [input, setInput] = useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.terminalHistory.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendCommand(input.trim());
    setInput('');
  };

  if (!state.isTerminalOpen) return null;

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-2 py-1 bg-background-muted border-b border-border-default">
        <Terminal className="w-3 h-3 text-text-muted" />
        <span className="text-[10px] font-medium text-text-default flex-1">CLI Terminal</span>
        <button
          onClick={closeTerminal}
          className="p-0.5 rounded hover:bg-background-medium/50 transition-colors"
          title="Close terminal"
        >
          <Power className="w-3 h-3 text-text-muted" />
        </button>
      </div>

      {/* Terminal output */}
      <div
        ref={scrollRef}
        className="h-32 overflow-y-auto bg-gray-950 p-2 font-mono text-[11px] leading-relaxed"
      >
        {state.terminalHistory.map((entry) => (
          <div
            key={entry.id}
            className={
              entry.type === 'input'
                ? 'text-green-400'
                : entry.type === 'error'
                  ? 'text-red-400'
                  : entry.type === 'system'
                    ? 'text-yellow-400'
                    : 'text-gray-300'
            }
          >
            {entry.type === 'input' && <span className="text-blue-400">$ </span>}
            {entry.content}
          </div>
        ))}
      </div>

      {/* Input line */}
      <form onSubmit={handleSubmit} className="flex items-center border-t border-border-default">
        <span className="pl-2 text-[11px] text-blue-400 font-mono">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command..."
          className="flex-1 bg-transparent text-[11px] text-gray-300 font-mono px-1.5 py-1.5 outline-none placeholder:text-gray-600"
        />
        <button
          type="submit"
          className="p-1.5 hover:bg-background-medium/50 transition-colors"
          title="Send command"
        >
          <Send className="w-3 h-3 text-text-muted" />
        </button>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Not-Installed view — shows install prompt
// ---------------------------------------------------------------------------

const NotInstalledView: React.FC = () => {
  const { state, startSetup } = useCLI();

  // If setup wizard is active, show it
  if (state.setupStep !== 'idle') {
    return <CLISetupWizard embedded />;
  }

  return (
    <div className="space-y-3 px-1">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-background-muted border border-border-default">
        <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-text-default">CLI not installed</div>
          <div className="text-[10px] text-text-muted">
            Install the Super-Goose CLI to use terminal commands.
          </div>
        </div>
      </div>
      <Button
        variant="default"
        size="sm"
        shape="pill"
        className="w-full"
        onClick={startSetup}
      >
        <Download className="w-4 h-4" />
        Install CLI
      </Button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Panel Component
// ---------------------------------------------------------------------------

const CLIIntegrationPanel: React.FC = () => {
  const { state, toggleCLI } = useCLI();
  const [isExpanded, setIsExpanded] = useState(true);

  // If the setup wizard is running, always show it regardless of install state
  const isWizardActive = state.setupStep !== 'idle';

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          {/* Panel header */}
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <Terminal className="w-3.5 h-3.5" />
              <span>CLI Integration</span>

              {/* Status indicator */}
              <span className="ml-auto flex items-center gap-1.5">
                {state.isInstalled && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      state.cliEnabled ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                )}
                <ChevronRight
                  className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
              </span>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="mt-1 space-y-3 px-1">
              {/* Power toggle */}
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs text-text-muted">
                  {state.cliEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  variant="mono"
                  checked={state.cliEnabled}
                  onCheckedChange={toggleCLI}
                  aria-label="Toggle CLI integration"
                />
              </div>

              {/* Content — conditional on enabled state */}
              {state.cliEnabled ? (
                <>
                  {/* Show wizard if active, otherwise show installed/not-installed views */}
                  {isWizardActive ? (
                    <CLISetupWizard embedded />
                  ) : state.isInstalled ? (
                    <>
                      {/* Status section */}
                      <StatusSection />

                      {/* Quick actions */}
                      <QuickActions />

                      {/* Embedded terminal */}
                      <EmbeddedTerminal />
                    </>
                  ) : (
                    <NotInstalledView />
                  )}

                  {/* Platform info — always visible at bottom */}
                  <PlatformInfoCard />
                </>
              ) : (
                <div className="text-[10px] text-text-muted px-2 py-2">
                  CLI integration is disabled. Toggle the switch above to enable.
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default CLIIntegrationPanel;
