import { useState, useEffect, useRef } from 'react';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import UpdateSection from './UpdateSection';
import TunnelSection from '../tunnel/TunnelSection';

import { COST_TRACKING_ENABLED, UPDATES_ENABLED } from '../../../updates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import ThemeSelector from '../../GooseSidebar/ThemeSelector';
import BlockLogoBlack from './icons/block-lockup_black.png';
import BlockLogoWhite from './icons/block-lockup_white.png';
import TelemetrySettings from './TelemetrySettings';
import { trackSettingToggled } from '../../../utils/analytics';

interface AppSettingsSectionProps {
  scrollToSection?: string;
}

export default function AppSettingsSection({ scrollToSection }: AppSettingsSectionProps) {
  const [menuBarIconEnabled, setMenuBarIconEnabled] = useState(true);
  const [dockIconEnabled, setDockIconEnabled] = useState(true);
  const [wakelockEnabled, setWakelockEnabled] = useState(true);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isDockSwitchDisabled, setIsDockSwitchDisabled] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showPricing, setShowPricing] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const updateSectionRef = useRef<HTMLDivElement>(null);

  // Check if GOOSE_VERSION is set to determine if Updates section should be shown
  const shouldShowUpdates = !window.appConfig.get('GOOSE_VERSION');

  // Check if running on macOS
  useEffect(() => {
    setIsMacOS(window.electron.platform === 'darwin');
  }, []);

  // Detect theme changes
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    // Initial check
    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Load show pricing setting
  useEffect(() => {
    const stored = localStorage.getItem('show_pricing');
    setShowPricing(stored !== 'false');
  }, []);

  // Handle scrolling to update section
  useEffect(() => {
    if (scrollToSection === 'update' && updateSectionRef.current) {
      // Use a timeout to ensure the DOM is ready
      setTimeout(() => {
        updateSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [scrollToSection]);

  // Load menu bar and dock icon states
  useEffect(() => {
    window.electron.getMenuBarIconState().then((enabled) => {
      setMenuBarIconEnabled(enabled);
    });

    window.electron.getWakelockState().then((enabled) => {
      setWakelockEnabled(enabled);
    });

    if (isMacOS) {
      window.electron.getDockIconState().then((enabled) => {
        setDockIconEnabled(enabled);
      });
    }
  }, [isMacOS]);

  const handleMenuBarIconToggle = async () => {
    const newState = !menuBarIconEnabled;
    // If we're turning off the menu bar icon and the dock icon is hidden,
    // we need to show the dock icon to maintain accessibility
    if (!newState && !dockIconEnabled && isMacOS) {
      const success = await window.electron.setDockIcon(true);
      if (success) {
        setDockIconEnabled(true);
      }
    }
    const success = await window.electron.setMenuBarIcon(newState);
    if (success) {
      setMenuBarIconEnabled(newState);
      trackSettingToggled('menu_bar_icon', newState);
    }
  };

  const handleDockIconToggle = async () => {
    const newState = !dockIconEnabled;
    // If we're turning off the dock icon and the menu bar icon is hidden,
    // we need to show the menu bar icon to maintain accessibility
    if (!newState && !menuBarIconEnabled) {
      const success = await window.electron.setMenuBarIcon(true);
      if (success) {
        setMenuBarIconEnabled(true);
      }
    }

    // Disable the switch to prevent rapid toggling
    setIsDockSwitchDisabled(true);
    setTimeout(() => {
      setIsDockSwitchDisabled(false);
    }, 1000);

    // Set the dock icon state
    const success = await window.electron.setDockIcon(newState);
    if (success) {
      setDockIconEnabled(newState);
      trackSettingToggled('dock_icon', newState);
    }
  };

  const handleWakelockToggle = async () => {
    const newState = !wakelockEnabled;
    const success = await window.electron.setWakelock(newState);
    if (success) {
      setWakelockEnabled(newState);
      trackSettingToggled('prevent_sleep', newState);
    }
  };

  const handleShowPricingToggle = (checked: boolean) => {
    setShowPricing(checked);
    localStorage.setItem('show_pricing', String(checked));
    trackSettingToggled('cost_tracking', checked);
    // Trigger storage event for other components
    window.dispatchEvent(new CustomEvent('storage'));
  };

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1">
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="">Appearance</CardTitle>
          <CardDescription>Configure how goose appears on your system</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Notifications</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Notifications are managed by your OS{' - '}
                <span
                  className="underline hover:cursor-pointer"
                  onClick={() => setShowNotificationModal(true)}
                >
                  Configuration guide
                </span>
              </p>
            </div>
            <div className="flex items-center">
              <Button
                className="flex items-center gap-2 justify-center"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await window.electron.openNotificationsSettings();
                  } catch (error) {
                    console.error('Failed to open notification settings:', error);
                  }
                }}
              >
                <Settings />
                Open Settings
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Menu bar icon</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Show goose in the menu bar
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={menuBarIconEnabled}
                onCheckedChange={handleMenuBarIconToggle}
                variant="mono"
              />
            </div>
          </div>

          {isMacOS && (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-text-default text-xs">Dock icon</h3>
                <p className="text-xs text-text-muted max-w-md mt-[2px]">Show goose in the dock</p>
              </div>
              <div className="flex items-center">
                <Switch
                  disabled={isDockSwitchDisabled}
                  checked={dockIconEnabled}
                  onCheckedChange={handleDockIconToggle}
                  variant="mono"
                />
              </div>
            </div>
          )}

          {/* Prevent Sleep */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Prevent Sleep</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Keep your computer awake while goose is running a task (screen can still lock)
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={wakelockEnabled}
                onCheckedChange={handleWakelockToggle}
                variant="mono"
              />
            </div>
          </div>

          {/* Cost Tracking */}
          {COST_TRACKING_ENABLED && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-text-default">Cost Tracking</h3>
                <p className="text-xs text-text-muted max-w-md mt-[2px]">
                  Show model pricing and usage costs
                </p>
              </div>
              <div className="flex items-center">
                <Switch
                  checked={showPricing}
                  onCheckedChange={handleShowPricingToggle}
                  variant="mono"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Super-Goose Features */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="">Super-Goose Features</CardTitle>
          <CardDescription>Configure advanced AI agent capabilities</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 px-4">
          {/* Budget Limit */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Session Budget Limit</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Maximum spend per session (0 = unlimited)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">$</span>
              <input
                type="number"
                min="0"
                step="0.50"
                defaultValue={localStorage.getItem('super_goose_budget_limit') || '0'}
                className="w-20 px-2 py-1 text-sm border rounded bg-background-default text-text-default border-border-default"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    localStorage.setItem('super_goose_budget_limit', val.toString());
                  }
                }}
              />
            </div>
          </div>

          {/* Guardrails */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Input/Output Guardrails</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Scan messages for secrets, PII, prompt injection
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
            </div>
          </div>

          {/* Reflexion */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Reflexion Learning</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Learn from past failures to improve responses
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
            </div>
          </div>

          {/* Rate Limiting */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Rate Limiting</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                50 tool calls/min per tool, 500ms backpressure
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
            </div>
          </div>

          {/* Execution Mode */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Execution Mode</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Freeform (default) or Structured (Code-Test-Fix)
              </p>
            </div>
            <div className="flex items-center">
              <select
                className="px-2 py-1 text-sm border rounded bg-background-default text-text-default border-border-default"
                defaultValue={localStorage.getItem('super_goose_execution_mode') || 'freeform'}
                onChange={(e) => {
                  localStorage.setItem('super_goose_execution_mode', e.target.value);
                }}
              >
                <option value="freeform">Freeform</option>
                <option value="structured">Structured</option>
              </select>
            </div>
          </div>

          {/* Reasoning Mode */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Reasoning Mode</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Choose how the agent approaches problems
              </p>
            </div>
            <div className="flex items-center">
              <select
                className="px-2 py-1 text-sm border rounded bg-background-default text-text-default border-border-default"
                defaultValue={localStorage.getItem('super_goose_reasoning_mode') || 'standard'}
                onChange={(e) => {
                  localStorage.setItem('super_goose_reasoning_mode', e.target.value);
                }}
              >
                <option value="standard">Standard</option>
                <option value="react">ReAct (Reason + Act)</option>
                <option value="cot">Chain-of-Thought</option>
                <option value="tot">Tree-of-Thoughts</option>
              </select>
            </div>
          </div>

          {/* Auto-Checkpoint */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Auto-Checkpoint</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Save checkpoints every 10 minutes and after each tool
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
            </div>
          </div>

          {/* Memory System */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Memory System</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Working, Episodic, and Semantic memory tiers
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
            </div>
          </div>

          {/* HITL Breakpoints */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-default text-xs">Human-in-the-Loop</h3>
              <p className="text-xs text-text-muted max-w-md mt-[2px]">
                Breakpoints, feedback injection, plan approval
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">Theme</CardTitle>
          <CardDescription>Customize the look and feel of goose</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <ThemeSelector className="w-auto" hideTitle horizontal />
        </CardContent>
      </Card>

      <TunnelSection />

      <TelemetrySettings isWelcome={false} />

      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">Help & feedback</CardTitle>
          <CardDescription>
            Help us improve goose by reporting issues or requesting new features
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <div className="flex space-x-4">
            <Button
              onClick={() => {
                window.open(
                  'https://github.com/Ghenghis/Super-Goose/issues/new?template=bug_report.md',
                  '_blank'
                );
              }}
              variant="secondary"
              size="sm"
            >
              Report a Bug
            </Button>
            <Button
              onClick={() => {
                window.open(
                  'https://github.com/Ghenghis/Super-Goose/issues/new?template=feature_request.md',
                  '_blank'
                );
              }}
              variant="secondary"
              size="sm"
            >
              Request a Feature
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version Section - only show if GOOSE_VERSION is set */}
      {!shouldShowUpdates && (
        <Card className="rounded-lg">
          <CardHeader className="pb-0">
            <CardTitle className="mb-1">Version</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-4">
            <div className="flex items-center gap-3">
              <img
                src={isDarkMode ? BlockLogoWhite : BlockLogoBlack}
                alt="Block Logo"
                className="h-8 w-auto"
              />
              <span className="text-2xl font-mono text-black dark:text-white">
                {String(window.appConfig.get('GOOSE_VERSION') || 'Development')}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Section - only show if GOOSE_VERSION is NOT set */}
      {UPDATES_ENABLED && shouldShowUpdates && (
        <div ref={updateSectionRef}>
          <Card className="rounded-lg">
            <CardHeader className="pb-0">
              <CardTitle className="mb-1">Updates</CardTitle>
              <CardDescription>
                Check for and install updates to keep goose running at its best
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <UpdateSection />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Slash Commands Reference */}
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">Slash Commands</CardTitle>
          <CardDescription>Available commands in the chat input</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/compact</code> <span className="text-text-muted">Compact conversation context</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/model</code> <span className="text-text-muted">Switch AI model mid-session</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/bookmark</code> <span className="text-text-muted">Save/restore checkpoints</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/memory</code> <span className="text-text-muted">View/manage memory system</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/pause</code> <span className="text-text-muted">Pause agent execution</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/resume</code> <span className="text-text-muted">Resume with feedback</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/breakpoint</code> <span className="text-text-muted">Set tool breakpoints</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/inspect</code> <span className="text-text-muted">Inspect current state</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/plan</code> <span className="text-text-muted">Show/approve/reject plans</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/clear</code> <span className="text-text-muted">Clear conversation history</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/prompts</code> <span className="text-text-muted">List available prompts</span></div>
            <div className="flex gap-2"><code className="px-1 bg-background-muted rounded">/summarize</code> <span className="text-text-muted">Summarize conversation</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Instructions Modal */}
      <Dialog
        open={showNotificationModal}
        onOpenChange={(open) => !open && setShowNotificationModal(false)}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="text-iconStandard" size={24} />
              How to Enable Notifications
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {/* OS-specific instructions */}
            {isMacOS ? (
              <div className="space-y-4">
                <p>To enable notifications on macOS:</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Open System Preferences</li>
                  <li>Click on Notifications</li>
                  <li>Find and select goose in the application list</li>
                  <li>Enable notifications and adjust settings as desired</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-4">
                <p>To enable notifications on Windows:</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Open Settings</li>
                  <li>Go to System &gt; Notifications</li>
                  <li>Find and select goose in the application list</li>
                  <li>Toggle notifications on and adjust settings as desired</li>
                </ol>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotificationModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
