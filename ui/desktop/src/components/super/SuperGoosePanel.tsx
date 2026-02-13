import { useState } from 'react';
import DashboardPanel from './DashboardPanel';
import StudiosPanel from './StudiosPanel';
import AgentsPanel from './AgentsPanel';
import MarketplacePanel from './MarketplacePanel';
import GPUPanel from './GPUPanel';
import ConnectionsPanel from './ConnectionsPanel';
import MonitorPanel from './MonitorPanel';
import SGSettingsPanel from './SGSettingsPanel';
import RecipeBrowser from './RecipeBrowser';
import PromptLibrary from './PromptLibrary';
import SkillsPanel from './SkillsPanel';
import DeeplinkGenerator from './DeeplinkGenerator';
import AgenticFeatures from './AgenticFeatures';

type PanelId = 'dashboard' | 'agentic' | 'studios' | 'agents' | 'recipes' | 'prompts' | 'skills' | 'marketplace' | 'deeplinks' | 'gpu' | 'connections' | 'monitor' | 'settings';

interface NavItem {
  id: PanelId;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: '\u26A1', label: 'Dashboard' },
  { id: 'agentic', icon: '\uD83E\uDDE0', label: 'Agentic' },
  { id: 'studios', icon: '\uD83E\uDDEA', label: 'Studios' },
  { id: 'agents', icon: '\uD83E\uDD16', label: 'Agents' },
  { id: 'recipes', icon: '\uD83D\uDCD6', label: 'Recipes' },
  { id: 'prompts', icon: '\uD83D\uDCAC', label: 'Prompts' },
  { id: 'skills', icon: '\uD83C\uDFAF', label: 'Skills' },
  { id: 'marketplace', icon: '\uD83D\uDED2', label: 'Marketplace' },
  { id: 'deeplinks', icon: '\uD83D\uDD17', label: 'Deeplinks' },
  { id: 'gpu', icon: '\uD83D\uDDA5\uFE0F', label: 'GPU' },
  { id: 'connections', icon: '\uD83D\uDD0C', label: 'Connections' },
  { id: 'monitor', icon: '\uD83D\uDCCA', label: 'Monitor' },
  { id: 'settings', icon: '\u2699\uFE0F', label: 'Settings' },
];

export default function SuperGoosePanel() {
  const [activePanel, setActivePanel] = useState<PanelId>('dashboard');

  const renderPanel = () => {
    switch (activePanel) {
      case 'dashboard': return <DashboardPanel />;
      case 'agentic': return <AgenticFeatures />;
      case 'studios': return <StudiosPanel />;
      case 'agents': return <AgentsPanel />;
      case 'recipes': return <RecipeBrowser />;
      case 'prompts': return <PromptLibrary />;
      case 'skills': return <SkillsPanel />;
      case 'marketplace': return <MarketplacePanel />;
      case 'deeplinks': return <DeeplinkGenerator />;
      case 'gpu': return <GPUPanel />;
      case 'connections': return <ConnectionsPanel />;
      case 'monitor': return <MonitorPanel />;
      case 'settings': return <SGSettingsPanel />;
    }
  };

  return (
    <div data-super="true" className="super-goose-panel flex h-full min-h-0" style={{ background: 'var(--sg-bg)' }}>
      {/* Left sidebar nav */}
      <nav className="sg-sidebar">
        <div className="mb-4 text-lg font-bold" style={{ color: 'var(--sg-gold)' }}>SG</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setActivePanel(item.id)}
            className={`sg-sidebar-item ${activePanel === item.id ? 'active' : ''}`}
            title={item.label}
          >
            <span className="text-lg">{item.icon}</span>
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: 'var(--sg-surface)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--sg-border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--sg-text-1)' }}>
            {NAV_ITEMS.find(n => n.id === activePanel)?.label}
          </h2>
          <span className="sg-badge sg-badge-gold">Super-Goose</span>
        </div>

        {/* Panel content */}
        <div className="p-3">
          {renderPanel()}
        </div>
      </div>
    </div>
  );
}
