/**
 * Tests for AnimatedPipeline — SVG rendering, stage display,
 * waiting mode, activity log, and quantum particle rendering.
 */
import { render, screen } from '@testing-library/react';
import AnimatedPipeline from '../AnimatedPipeline';
import { PipelineProvider, usePipeline } from '../PipelineContext';
import { ChatState } from '../../../types/chatState';
import { useEffect } from 'react';

// Mock scrollIntoView — not available in jsdom
Element.prototype.scrollIntoView = vi.fn();

// Mock requestAnimationFrame for particle loop
vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
  return setTimeout(() => cb(Date.now()), 0) as unknown as number;
});
vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id));

/** Wrapper that sets up pipeline in a specific state before rendering AnimatedPipeline */
function TestPipeline({ chatState }: { chatState?: ChatState }) {
  return (
    <PipelineProvider>
      {chatState && <StateSetter chatState={chatState} />}
      <AnimatedPipeline />
    </PipelineProvider>
  );
}

/** Helper to set pipeline state before render */
function StateSetter({ chatState }: { chatState: ChatState }) {
  const { syncChatState } = usePipeline();
  useEffect(() => {
    syncChatState(chatState);
  }, [chatState, syncChatState]);
  return null;
}

describe('AnimatedPipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic rendering', () => {
    it('renders the pipeline container', () => {
      const { container } = render(<TestPipeline />);
      expect(container.querySelector('.pipeline-container')).not.toBeNull();
    });

    it('renders the header with pipeline title', () => {
      render(<TestPipeline />);
      expect(screen.getByText('SUPER-GOOSE PIPELINE')).toBeDefined();
    });

    it('renders the SVG title text', () => {
      render(<TestPipeline />);
      expect(screen.getByText('SUPER-GOOSE END-TO-END PIPELINE')).toBeDefined();
    });

    it('renders input and output connection lines', () => {
      const { container } = render(<TestPipeline />);
      // Input/output are now SVG lines (arrows), not text labels
      const lines = container.querySelectorAll('svg line');
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe('stage cards', () => {
    it('renders all 6 stage labels', () => {
      render(<TestPipeline />);
      expect(screen.getByText('PLAN')).toBeDefined();
      expect(screen.getByText('TEAM')).toBeDefined();
      expect(screen.getByText('EXECUTE')).toBeDefined();
      expect(screen.getByText('EVOLVE')).toBeDefined();
      expect(screen.getByText('REVIEW')).toBeDefined();
      expect(screen.getByText('OBSERVE')).toBeDefined();
    });

    it('renders stage icons', () => {
      render(<TestPipeline />);
      // Brain emoji for PLAN
      expect(screen.getByText('\u{1F9E0}')).toBeDefined();
      // Lightning for EXECUTE
      expect(screen.getByText('\u{26A1}')).toBeDefined();
    });
  });

  describe('waiting mode', () => {
    it('shows WAITING status when idle', () => {
      render(<TestPipeline />);
      expect(screen.getByText('WAITING')).toBeDefined();
    });

    it('shows quantum waiting pulse animation when idle', () => {
      const { container } = render(<TestPipeline />);
      // Waiting mode renders animated circles instead of text
      const waitingPulse = container.querySelector('.pipeline-waiting-pulse');
      expect(waitingPulse).not.toBeNull();
    });

    it('shows pipeline idle message in activity log when waiting', () => {
      render(<TestPipeline />);
      expect(screen.getByText('Pipeline idle — waiting for agent activity')).toBeDefined();
    });

    it('shows idle message in activity log when waiting', () => {
      render(<TestPipeline />);
      expect(screen.getByText('Pipeline idle — waiting for agent activity')).toBeDefined();
    });
  });

  describe('active mode', () => {
    it('shows chatState in header when active', () => {
      render(<TestPipeline chatState={ChatState.Thinking} />);
      expect(screen.getByText('THINKING')).toBeDefined();
    });

    it('shows chatState in header when streaming', () => {
      render(<TestPipeline chatState={ChatState.Streaming} />);
      // Header shows chatState in uppercase
      expect(screen.getByText('STREAMING')).toBeDefined();
    });

    it('shows sub-label for active stage', () => {
      render(<TestPipeline chatState={ChatState.Thinking} />);
      expect(screen.getByText('Analyzing task')).toBeDefined();
    });
  });

  describe('SVG structure', () => {
    it('renders SVG with correct viewBox', () => {
      const { container } = render(<TestPipeline />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 420 65');
    });

    it('renders glow filters for each stage', () => {
      const { container } = render(<TestPipeline />);
      expect(container.querySelector('#glow-plan')).not.toBeNull();
      expect(container.querySelector('#glow-execute')).not.toBeNull();
      expect(container.querySelector('#glow-observe')).not.toBeNull();
    });

    it('renders quantum field gradients for each stage', () => {
      const { container } = render(<TestPipeline />);
      expect(container.querySelector('#quantum-field-plan')).not.toBeNull();
      expect(container.querySelector('#quantum-field-execute')).not.toBeNull();
    });

    it('renders particle glow gradient', () => {
      const { container } = render(<TestPipeline />);
      expect(container.querySelector('#particleGlow')).not.toBeNull();
    });
  });

  describe('CSS animations', () => {
    it('injects animation keyframes via style tag', () => {
      const { container } = render(<TestPipeline />);
      const styleTag = container.querySelector('style');
      expect(styleTag).not.toBeNull();
      expect(styleTag?.textContent).toContain('pipeline-glow-pulse');
      expect(styleTag?.textContent).toContain('status-blink');
      expect(styleTag?.textContent).toContain('status-slow-pulse');
    });

    it('includes quantum effect animations', () => {
      const { container } = render(<TestPipeline />);
      const styleTag = container.querySelector('style');
      expect(styleTag?.textContent).toContain('pipeline-glow-outer');
      expect(styleTag?.textContent).toContain('pipeline-glow-mid');
      expect(styleTag?.textContent).toContain('spark-pulse');
      expect(styleTag?.textContent).toContain('energy-flow-dash');
    });
  });

  describe('activity log', () => {
    it('renders activity log container', () => {
      const { container } = render(<TestPipeline />);
      // The activity log is a div with scrollable content after the SVG
      const logContainer = container.querySelector('.pipeline-container > div:last-of-type');
      expect(logContainer).not.toBeNull();
    });
  });
});
