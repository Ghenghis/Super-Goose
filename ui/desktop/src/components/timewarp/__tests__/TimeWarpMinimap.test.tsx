import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import TimeWarpMinimap from '../TimeWarpMinimap';
import { TimeWarpProvider } from '../TimeWarpContext';

// Render the minimap wrapped in the TimeWarp context provider
function renderMinimap(props: { width?: number; height?: number } = {}) {
  return render(
    <TimeWarpProvider>
      <TimeWarpMinimap {...props} />
    </TimeWarpProvider>
  );
}

describe('TimeWarpMinimap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the minimap container', () => {
    const { container } = renderMinimap();
    const minimapDiv = container.querySelector('[title="Timeline overview"]');
    expect(minimapDiv).toBeInTheDocument();
  });

  it('renders with default width and height', () => {
    const { container } = renderMinimap();
    const minimapDiv = container.querySelector('[title="Timeline overview"]') as HTMLElement;
    expect(minimapDiv.style.width).toBe('120px');
    expect(minimapDiv.style.height).toBe('24px');
  });

  it('renders with custom width and height', () => {
    const { container } = renderMinimap({ width: 200, height: 40 });
    const minimapDiv = container.querySelector('[title="Timeline overview"]') as HTMLElement;
    expect(minimapDiv.style.width).toBe('200px');
    expect(minimapDiv.style.height).toBe('40px');
  });

  it('renders an SVG element', () => {
    const { container } = renderMinimap();
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders event dots as SVG circles', () => {
    const { container } = renderMinimap();
    const circles = container.querySelectorAll('circle');
    // The demo data has events on 'main' branch; should render multiple circles
    expect(circles.length).toBeGreaterThan(0);
  });

  it('renders event count badge', () => {
    const { container } = renderMinimap();
    // The badge shows the count of branch events
    const badges = container.querySelectorAll('.text-\\[8px\\]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders a baseline SVG line', () => {
    const { container } = renderMinimap();
    const lines = container.querySelectorAll('line');
    // At least 1 baseline line + possibly the current position marker
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('renders current position marker line', () => {
    const { container } = renderMinimap();
    const lines = container.querySelectorAll('line');
    // Should have baseline + current position marker (blue line)
    const blueMarker = Array.from(lines).find(
      (line) => line.getAttribute('stroke') === '#3b82f6'
    );
    expect(blueMarker).toBeTruthy();
  });
});
