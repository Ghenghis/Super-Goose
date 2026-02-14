import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudiosPanel from '../StudiosPanel';

// --- Mocks ----------------------------------------------------------------

// Mock StudioPipeline so we can assert it renders without pulling in all sub-tabs
vi.mock('../studio', () => ({
  StudioPipeline: ({ defaultTab }: { defaultTab?: string }) => (
    <div data-testid="studio-pipeline" data-default-tab={defaultTab}>
      StudioPipeline mock
    </div>
  ),
}));

afterEach(() => vi.restoreAllMocks());

// --- Tests -----------------------------------------------------------------

describe('StudiosPanel', () => {
  // -- Grid rendering -------------------------------------------------------

  it('renders all 6 studio cards in the grid', () => {
    render(<StudiosPanel />);

    expect(screen.getByTestId('studio-card-core')).toBeDefined();
    expect(screen.getByTestId('studio-card-agent')).toBeDefined();
    expect(screen.getByTestId('studio-card-data')).toBeDefined();
    expect(screen.getByTestId('studio-card-eval')).toBeDefined();
    expect(screen.getByTestId('studio-card-deploy')).toBeDefined();
    expect(screen.getByTestId('studio-card-vision')).toBeDefined();
  });

  it('renders studio names and descriptions', () => {
    render(<StudiosPanel />);

    expect(screen.getByText('Core Studio')).toBeDefined();
    expect(screen.getByText('Agent Studio')).toBeDefined();
    expect(screen.getByText('Data Studio')).toBeDefined();
    expect(screen.getByText('Eval Studio')).toBeDefined();
    expect(screen.getByText('Deploy Studio')).toBeDefined();
    expect(screen.getByText('Vision Studio')).toBeDefined();
    expect(screen.getByText('Build and test agent cores')).toBeDefined();
    expect(screen.getByText('Design multi-agent workflows')).toBeDefined();
    expect(screen.getByText('Curate, transform, and validate training datasets')).toBeDefined();
    expect(screen.getByText('Run benchmarks, A/B tests, and quality evaluations')).toBeDefined();
    expect(screen.getByText('Package agents and deploy to staging or production')).toBeDefined();
    expect(screen.getByText('Build agents with image, video, and audio capabilities')).toBeDefined();
  });

  it('does not show any "Coming Soon" badges', () => {
    render(<StudiosPanel />);

    expect(screen.queryByText('Coming Soon')).toBeNull();
  });

  // -- All cards are interactive ----------------------------------------------

  it('applies interactive styling to all cards', () => {
    render(<StudiosPanel />);

    const ids = ['core', 'agent', 'data', 'eval', 'deploy', 'vision'];
    for (const id of ids) {
      const card = screen.getByTestId(`studio-card-${id}`);
      expect(card.className).toContain('cursor-pointer');
      expect(card.className).not.toContain('opacity-50');
      expect(card.getAttribute('aria-disabled')).toBe('false');
      expect(card.getAttribute('tabindex')).toBe('0');
    }
  });

  it('shows "Open <name>" tooltip on all cards', () => {
    render(<StudiosPanel />);

    expect(screen.getByTestId('studio-card-core').getAttribute('title')).toBe('Open Core Studio');
    expect(screen.getByTestId('studio-card-agent').getAttribute('title')).toBe('Open Agent Studio');
    expect(screen.getByTestId('studio-card-data').getAttribute('title')).toBe('Open Data Studio');
    expect(screen.getByTestId('studio-card-eval').getAttribute('title')).toBe('Open Eval Studio');
    expect(screen.getByTestId('studio-card-deploy').getAttribute('title')).toBe('Open Deploy Studio');
    expect(screen.getByTestId('studio-card-vision').getAttribute('title')).toBe('Open Vision Studio');
  });

  // -- Click any studio opens pipeline ----------------------------------------

  it('opens StudioPipeline when clicking Core Studio', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-core'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('plan');
    expect(screen.getByText('Core Studio')).toBeDefined();
    expect(screen.queryByTestId('studio-card-agent')).toBeNull();
  });

  it('opens StudioPipeline when clicking Agent Studio', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-agent'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('plan');
    expect(screen.getByText('Agent Studio')).toBeDefined();
  });

  it('opens StudioPipeline when clicking Data Studio with plan tab', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-data'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('plan');
    expect(screen.getByText('Data Studio')).toBeDefined();
  });

  it('opens StudioPipeline when clicking Eval Studio with test tab', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-eval'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('test');
    expect(screen.getByText('Eval Studio')).toBeDefined();
  });

  it('opens StudioPipeline when clicking Deploy Studio with deploy tab', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-deploy'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('deploy');
    expect(screen.getByText('Deploy Studio')).toBeDefined();
  });

  it('opens StudioPipeline when clicking Vision Studio with code tab', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-vision'));

    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('code');
    expect(screen.getByText('Vision Studio')).toBeDefined();
  });

  // -- Back button returns to grid ------------------------------------------

  it('renders back button when a studio is open', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-core'));

    expect(screen.getByTestId('back-to-studios')).toBeDefined();
    expect(screen.getByText('Back to Studios')).toBeDefined();
  });

  it('clicking back button returns to the grid view', () => {
    render(<StudiosPanel />);

    // Open a studio
    fireEvent.click(screen.getByTestId('studio-card-core'));
    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.queryByTestId('studio-card-agent')).toBeNull();

    // Click back
    fireEvent.click(screen.getByTestId('back-to-studios'));

    // Grid is restored
    expect(screen.queryByTestId('studio-pipeline')).toBeNull();
    expect(screen.getByTestId('studio-card-core')).toBeDefined();
    expect(screen.getByTestId('studio-card-agent')).toBeDefined();
    expect(screen.getByTestId('studio-card-data')).toBeDefined();
  });

  it('can open a different studio after going back', () => {
    render(<StudiosPanel />);

    // Open Core Studio
    fireEvent.click(screen.getByTestId('studio-card-core'));
    expect(screen.getByText('Core Studio')).toBeDefined();

    // Go back
    fireEvent.click(screen.getByTestId('back-to-studios'));

    // Open Agent Studio
    fireEvent.click(screen.getByTestId('studio-card-agent'));
    expect(screen.getByText('Agent Studio')).toBeDefined();
    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
  });

  it('can navigate from grid to Data Studio and back to Deploy Studio', () => {
    render(<StudiosPanel />);

    // Open Data Studio
    fireEvent.click(screen.getByTestId('studio-card-data'));
    expect(screen.getByText('Data Studio')).toBeDefined();
    expect(screen.getByTestId('studio-pipeline').getAttribute('data-default-tab')).toBe('plan');

    // Go back
    fireEvent.click(screen.getByTestId('back-to-studios'));

    // Open Deploy Studio
    fireEvent.click(screen.getByTestId('studio-card-deploy'));
    expect(screen.getByText('Deploy Studio')).toBeDefined();
    expect(screen.getByTestId('studio-pipeline').getAttribute('data-default-tab')).toBe('deploy');
  });

  // -- Keyboard accessibility -----------------------------------------------

  it('opens studio on Enter key press', () => {
    render(<StudiosPanel />);

    const coreCard = screen.getByTestId('studio-card-core');
    fireEvent.keyDown(coreCard, { key: 'Enter' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Core Studio')).toBeDefined();
  });

  it('opens studio on Space key press', () => {
    render(<StudiosPanel />);

    const agentCard = screen.getByTestId('studio-card-agent');
    fireEvent.keyDown(agentCard, { key: ' ' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Agent Studio')).toBeDefined();
  });

  it('opens Data Studio on Enter key press', () => {
    render(<StudiosPanel />);

    const dataCard = screen.getByTestId('studio-card-data');
    fireEvent.keyDown(dataCard, { key: 'Enter' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Data Studio')).toBeDefined();
  });

  it('opens Vision Studio on Space key press', () => {
    render(<StudiosPanel />);

    const visionCard = screen.getByTestId('studio-card-vision');
    fireEvent.keyDown(visionCard, { key: ' ' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Vision Studio')).toBeDefined();
  });
});
