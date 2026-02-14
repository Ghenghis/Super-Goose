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
    expect(screen.getByText('Build and test agent cores')).toBeDefined();
    expect(screen.getByText('Design multi-agent workflows')).toBeDefined();
  });

  it('shows "Coming Soon" badges on coming-soon studios', () => {
    render(<StudiosPanel />);

    // 4 coming-soon studios should have badges
    const badges = screen.getAllByText('Coming Soon');
    expect(badges.length).toBe(4);
  });

  // -- Filter tabs ----------------------------------------------------------

  it('filters to only available studios when "Available" tab is clicked', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByText('Available'));

    expect(screen.getByTestId('studio-card-core')).toBeDefined();
    expect(screen.getByTestId('studio-card-agent')).toBeDefined();
    expect(screen.queryByTestId('studio-card-data')).toBeNull();
    expect(screen.queryByTestId('studio-card-eval')).toBeNull();
    expect(screen.queryByTestId('studio-card-deploy')).toBeNull();
    expect(screen.queryByTestId('studio-card-vision')).toBeNull();
  });

  it('shows all studios again when "All Studios" tab is clicked after filtering', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByText('Available'));
    expect(screen.queryByTestId('studio-card-data')).toBeNull();

    fireEvent.click(screen.getByText('All Studios'));
    expect(screen.getByTestId('studio-card-data')).toBeDefined();
  });

  // -- Click available studio opens pipeline --------------------------------

  it('opens StudioPipeline when clicking an available studio (Core)', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-core'));

    // Pipeline should be rendered
    const pipeline = screen.getByTestId('studio-pipeline');
    expect(pipeline).toBeDefined();
    expect(pipeline.getAttribute('data-default-tab')).toBe('plan');

    // Studio name should appear in header
    expect(screen.getByText('Core Studio')).toBeDefined();

    // Grid should be gone
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

  // -- Click coming-soon studio does NOT open pipeline ----------------------

  it('does NOT open StudioPipeline when clicking a coming-soon studio', () => {
    render(<StudiosPanel />);

    fireEvent.click(screen.getByTestId('studio-card-data'));

    // Pipeline should NOT appear
    expect(screen.queryByTestId('studio-pipeline')).toBeNull();

    // Grid should still be visible
    expect(screen.getByTestId('studio-card-core')).toBeDefined();
    expect(screen.getByTestId('studio-card-data')).toBeDefined();
  });

  it('does NOT open pipeline for any coming-soon studio', () => {
    render(<StudiosPanel />);

    const comingSoonIds = ['data', 'eval', 'deploy', 'vision'];
    for (const id of comingSoonIds) {
      fireEvent.click(screen.getByTestId(`studio-card-${id}`));
      expect(screen.queryByTestId('studio-pipeline')).toBeNull();
    }
  });

  // -- Coming-soon styling --------------------------------------------------

  it('applies disabled styling to coming-soon cards', () => {
    render(<StudiosPanel />);

    const dataCard = screen.getByTestId('studio-card-data');
    expect(dataCard.className).toContain('opacity-50');
    expect(dataCard.className).toContain('cursor-not-allowed');
    expect(dataCard.getAttribute('aria-disabled')).toBe('true');
    expect(dataCard.getAttribute('tabindex')).toBe('-1');
  });

  it('applies interactive styling to available cards', () => {
    render(<StudiosPanel />);

    const coreCard = screen.getByTestId('studio-card-core');
    expect(coreCard.className).toContain('cursor-pointer');
    expect(coreCard.className).not.toContain('opacity-50');
    expect(coreCard.getAttribute('aria-disabled')).toBe('false');
    expect(coreCard.getAttribute('tabindex')).toBe('0');
  });

  // -- Coming-soon tooltip --------------------------------------------------

  it('shows tooltip text on coming-soon cards', () => {
    render(<StudiosPanel />);

    const dataCard = screen.getByTestId('studio-card-data');
    expect(dataCard.getAttribute('title')).toContain('Coming soon');
    expect(dataCard.getAttribute('title')).toContain('under development');
  });

  it('shows "Open <name>" tooltip on available cards', () => {
    render(<StudiosPanel />);

    const coreCard = screen.getByTestId('studio-card-core');
    expect(coreCard.getAttribute('title')).toBe('Open Core Studio');
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

  // -- Keyboard accessibility -----------------------------------------------

  it('opens studio on Enter key press for available cards', () => {
    render(<StudiosPanel />);

    const coreCard = screen.getByTestId('studio-card-core');
    fireEvent.keyDown(coreCard, { key: 'Enter' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Core Studio')).toBeDefined();
  });

  it('opens studio on Space key press for available cards', () => {
    render(<StudiosPanel />);

    const agentCard = screen.getByTestId('studio-card-agent');
    fireEvent.keyDown(agentCard, { key: ' ' });

    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
    expect(screen.getByText('Agent Studio')).toBeDefined();
  });
});
