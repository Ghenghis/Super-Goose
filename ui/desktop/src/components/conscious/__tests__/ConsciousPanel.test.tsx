import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import ConsciousPanel from '../ConsciousPanel';

// Mock all child components — they each call fetch to localhost:8999
vi.mock('../PersonalitySelector', () => ({
  default: () => <div data-testid="personality-selector">PersonalitySelector</div>,
}));

vi.mock('../VoiceToggle', () => ({
  default: () => <div data-testid="voice-toggle">VoiceToggle</div>,
}));

vi.mock('../OutputWaveform', () => ({
  default: ({ isActive }: { isActive: boolean }) => (
    <div data-testid="output-waveform">OutputWaveform active={String(isActive)}</div>
  ),
}));

vi.mock('../EmotionVisualizer', () => ({
  default: () => <div data-testid="emotion-visualizer">EmotionVisualizer</div>,
}));

vi.mock('../SkillManager', () => ({
  default: () => <div data-testid="skill-manager">SkillManager</div>,
}));

vi.mock('../CapabilitiesList', () => ({
  default: () => <div data-testid="capabilities-list">CapabilitiesList</div>,
}));

vi.mock('../MemoryPanel', () => ({
  default: () => <div data-testid="memory-panel">MemoryPanel</div>,
}));

vi.mock('../TestingDashboard', () => ({
  default: () => <div data-testid="testing-dashboard">TestingDashboard</div>,
}));

// Mock the MainPanelLayout (just renders children)
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock the ScrollArea (just renders children)
vi.mock('../../ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe('ConsciousPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the Conscious AI header', () => {
    render(<ConsciousPanel />);
    expect(screen.getByText('Conscious AI')).toBeInTheDocument();
  });

  it('should render the subtitle', () => {
    render(<ConsciousPanel />);
    expect(screen.getByText('AI personality, voice, and emotion system')).toBeInTheDocument();
  });

  it('should render all 6 tabs', () => {
    render(<ConsciousPanel />);
    expect(screen.getByText('Personality')).toBeInTheDocument();
    expect(screen.getByText('Voice')).toBeInTheDocument();
    expect(screen.getByText('Emotions')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });

  it('should show PersonalitySelector by default (Personality tab)', () => {
    render(<ConsciousPanel />);
    expect(screen.getByTestId('personality-selector')).toBeInTheDocument();
  });

  it('should switch to Voice tab and show VoiceToggle', async () => {
    const user = userEvent.setup();
    render(<ConsciousPanel />);

    await user.click(screen.getByText('Voice'));
    expect(screen.getByTestId('voice-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('output-waveform')).toBeInTheDocument();
  });

  it('should switch to Emotions tab and show EmotionVisualizer', async () => {
    const user = userEvent.setup();
    render(<ConsciousPanel />);

    await user.click(screen.getByText('Emotions'));
    expect(screen.getByTestId('emotion-visualizer')).toBeInTheDocument();
  });

  it('should switch to Skills tab and show SkillManager and CapabilitiesList', async () => {
    const user = userEvent.setup();
    render(<ConsciousPanel />);

    await user.click(screen.getByText('Skills'));
    expect(screen.getByTestId('skill-manager')).toBeInTheDocument();
    expect(screen.getByTestId('capabilities-list')).toBeInTheDocument();
  });

  it('should switch to Memory tab and show MemoryPanel', async () => {
    const user = userEvent.setup();
    render(<ConsciousPanel />);

    await user.click(screen.getByText('Memory'));
    expect(screen.getByTestId('memory-panel')).toBeInTheDocument();
  });

  it('should switch to Testing tab and show TestingDashboard', async () => {
    const user = userEvent.setup();
    render(<ConsciousPanel />);

    await user.click(screen.getByText('Testing'));
    expect(screen.getByTestId('testing-dashboard')).toBeInTheDocument();
  });

  it('should hide previous tab content when switching tabs', async () => {
    const user = userEvent.setup();
    render(<ConsciousPanel />);

    // Start on Personality
    expect(screen.getByTestId('personality-selector')).toBeInTheDocument();

    // Switch to Voice
    await user.click(screen.getByText('Voice'));
    expect(screen.queryByTestId('personality-selector')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-toggle')).toBeInTheDocument();
  });
});
