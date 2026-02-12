import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConsciousSection from '../ConsciousSection';

// Mock all child components to isolate ConsciousSection
vi.mock('../../../conscious/VoiceToggle', () => ({
  default: () => <div data-testid="voice-toggle">VoiceToggle</div>,
}));

vi.mock('../../../conscious/OutputWaveform', () => ({
  default: ({ isActive }: { isActive: boolean }) => (
    <div data-testid="output-waveform">OutputWaveform active={String(isActive)}</div>
  ),
}));

vi.mock('../../../conscious/PersonalitySelector', () => ({
  default: () => <div data-testid="personality-selector">PersonalitySelector</div>,
}));

vi.mock('../../../conscious/EmotionVisualizer', () => ({
  default: () => <div data-testid="emotion-visualizer">EmotionVisualizer</div>,
}));

vi.mock('../../../conscious/MemoryPanel', () => ({
  default: () => <div data-testid="memory-panel">MemoryPanel</div>,
}));

vi.mock('../../../conscious/WakeWordIndicator', () => ({
  default: () => <div data-testid="wake-word-indicator">WakeWordIndicator</div>,
}));

vi.mock('../../../conscious/CapabilitiesList', () => ({
  default: () => <div data-testid="capabilities-list">CapabilitiesList</div>,
}));

vi.mock('../../../conscious/CreatorPanel', () => ({
  default: () => <div data-testid="creator-panel">CreatorPanel</div>,
}));

vi.mock('../../../conscious/TestingDashboard', () => ({
  default: () => <div data-testid="testing-dashboard">TestingDashboard</div>,
}));

vi.mock('../../../conscious/SkillManager', () => ({
  default: () => <div data-testid="skill-manager">SkillManager</div>,
}));

vi.mock('../../../conscious/ConsciousBridge', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: false,
  },
}));

describe('ConsciousSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch for API status calls
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false,
      json: async () => ({}),
    } as Response));
  });

  it('renders the Conscious Agent heading', () => {
    render(<ConsciousSection />);
    expect(screen.getByText('Conscious Agent')).toBeInTheDocument();
  });

  it('renders the subtitle description', () => {
    render(<ConsciousSection />);
    expect(
      screen.getByText('Voice AI + Emotion + Personality + Agentic Control')
    ).toBeInTheDocument();
  });

  it('shows Offline when API is not reachable', () => {
    render(<ConsciousSection />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows Connected when API responds', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('/api/agentic/status')) {
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            goose_reachable: true,
            queue_busy: false,
            queue_size: 0,
          }),
        } as Response;
      }
      if (urlStr.includes('/api/emotion/status')) {
        return {
          ok: true,
          json: async () => ({
            enabled: false,
            model_loaded: false,
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    render(<ConsciousSection />);
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('renders collapsible sections', () => {
    render(<ConsciousSection />);
    // Check section headers exist
    expect(screen.getByText('Emotion Visualizer')).toBeInTheDocument();
    expect(screen.getByText('Wake Word + VAD')).toBeInTheDocument();
    expect(screen.getByText('Conversation Memory')).toBeInTheDocument();
    expect(screen.getByText('AI Creator')).toBeInTheDocument();
    expect(screen.getByText('Skill Manager')).toBeInTheDocument();
  });

  it('toggles collapsible section on click', async () => {
    const user = userEvent.setup();
    render(<ConsciousSection />);

    // Wake Word + VAD section is collapsed by default
    expect(screen.queryByTestId('wake-word-indicator')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByLabelText('Expand Wake Word + VAD section'));
    expect(screen.getByTestId('wake-word-indicator')).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByLabelText('Collapse Wake Word + VAD section'));
    expect(screen.queryByTestId('wake-word-indicator')).not.toBeInTheDocument();
  });

  it('Emotion Visualizer is expanded by default', () => {
    render(<ConsciousSection />);
    expect(screen.getByTestId('emotion-visualizer')).toBeInTheDocument();
  });

  it('renders Agentic Layer toggle', () => {
    render(<ConsciousSection />);
    expect(screen.getByText('Agentic Layer')).toBeInTheDocument();
    expect(screen.getByLabelText(/agentic layer/i)).toBeInTheDocument();
  });

  it('renders Emotion Engine toggle', () => {
    render(<ConsciousSection />);
    expect(screen.getByText('Emotion Engine')).toBeInTheDocument();
    expect(screen.getByLabelText(/emotion engine/i)).toBeInTheDocument();
  });
});
