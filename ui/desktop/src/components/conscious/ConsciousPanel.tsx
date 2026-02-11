import React, { useState } from 'react';
import { Sparkles, Mic, Brain, Palette, Zap, TestTube } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import PersonalitySelector from './PersonalitySelector';
import VoiceToggle from './VoiceToggle';
import OutputWaveform from './OutputWaveform';
import EmotionVisualizer from './EmotionVisualizer';
import SkillManager from './SkillManager';
import CapabilitiesList from './CapabilitiesList';
import MemoryPanel from './MemoryPanel';
import TestingDashboard from './TestingDashboard';

type ConsciousTab = 'personality' | 'voice' | 'emotions' | 'skills' | 'memory' | 'testing';

interface TabConfig {
  id: ConsciousTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { id: 'personality', label: 'Personality', icon: Brain },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'emotions', label: 'Emotions', icon: Palette },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'testing', label: 'Testing', icon: TestTube },
];

const ConsciousPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConsciousTab>('personality');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'personality':
        return (
          <div className="p-6 space-y-6">
            <PersonalitySelector />
          </div>
        );
      case 'voice':
        return (
          <div className="p-6 space-y-6">
            <VoiceToggle />
            <div className="border border-border-default rounded-lg p-4 bg-background-default">
              <h3 className="text-sm font-medium text-text-default mb-3">Output Waveform</h3>
              <OutputWaveform isActive={false} />
            </div>
          </div>
        );
      case 'emotions':
        return (
          <div className="p-6 space-y-6">
            <EmotionVisualizer />
          </div>
        );
      case 'skills':
        return (
          <div className="p-6 space-y-6">
            <SkillManager />
            <div className="border-t border-border-default pt-6">
              <CapabilitiesList />
            </div>
          </div>
        );
      case 'memory':
        return (
          <div className="p-6 space-y-6">
            <MemoryPanel />
          </div>
        );
      case 'testing':
        return (
          <div className="p-6 space-y-6">
            <TestingDashboard />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="bg-background-default px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-8 h-8 text-purple-500" />
              <h1 className="text-4xl font-light">Conscious AI</h1>
            </div>
            <p className="text-sm text-text-muted mt-2">
              AI personality, voice, and emotion system
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-6 border-b border-border-default">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
                    isActive
                      ? 'border-purple-500 text-text-default'
                      : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <ScrollArea className="flex-1 min-h-0">
          {renderTabContent()}
        </ScrollArea>
      </div>
    </MainPanelLayout>
  );
};

export default ConsciousPanel;
