import React from 'react';
import { ChevronRight, Puzzle, Zap } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel } from './AgentPanelContext';

// --- Panel ---

const SkillsPluginsPanel: React.FC = () => {
  const { state } = useAgentPanel();
  const [isExpanded, setIsExpanded] = React.useState(true);

  const activePluginCount = state.plugins.filter((p) => p.active).length;
  const enabledSkillCount = state.skills.filter((s) => s.enabled).length;

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <Puzzle className="w-3.5 h-3.5" />
              <span>Skills &amp; Plugins</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {enabledSkillCount + activePluginCount}
              </span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="mt-1 px-2">
              {/* Skills badges */}
              {state.skills.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider px-1 mb-1">
                    Skills
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {state.skills.map((skill) => (
                      <span
                        key={skill.id}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          skill.enabled
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                            : 'bg-background-muted text-text-muted border border-border-strong'
                        }`}
                        title={`${skill.command} - ${skill.enabled ? 'Enabled' : 'Disabled'}`}
                      >
                        <Zap className="w-2.5 h-2.5" />
                        {skill.command}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Active plugins */}
              {state.plugins.length > 0 && (
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider px-1 mb-1">
                    Plugins
                  </div>
                  <div className="space-y-0.5">
                    {state.plugins.map((plugin) => (
                      <div
                        key={plugin.id}
                        className="flex items-start gap-1.5 py-1 px-1 rounded-md text-xs hover:bg-background-medium/50 transition-colors"
                        title={`${plugin.name}: ${plugin.commands.join(', ')}`}
                      >
                        {/* Active indicator */}
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                            plugin.active ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-text-default truncate block">{plugin.name}</span>
                          <span className="text-[10px] text-text-muted truncate block">
                            {plugin.commands.join(', ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {state.skills.length === 0 && state.plugins.length === 0 && (
                <div className="text-[10px] text-text-muted px-1 py-2">
                  No skills or plugins loaded
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default SkillsPluginsPanel;
