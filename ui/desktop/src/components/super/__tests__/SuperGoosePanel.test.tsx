import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SuperGoosePanel from '../SuperGoosePanel';

// Mock fetch and EventSource for child panels that use hooks
class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SuperGoosePanel', () => {
  it('renders the sidebar with all 8 navigation items', () => {
    render(<SuperGoosePanel />);
    expect(screen.getByTitle('Dashboard')).toBeDefined();
    expect(screen.getByTitle('Studios')).toBeDefined();
    expect(screen.getByTitle('Agents')).toBeDefined();
    expect(screen.getByTitle('Marketplace')).toBeDefined();
    expect(screen.getByTitle('GPU')).toBeDefined();
    expect(screen.getByTitle('Connections')).toBeDefined();
    expect(screen.getByTitle('Monitor')).toBeDefined();
    expect(screen.getByTitle('Settings')).toBeDefined();
  });

  it('shows Dashboard panel by default', () => {
    render(<SuperGoosePanel />);
    expect(screen.getByText('Quick Actions')).toBeDefined();
    expect(screen.getByText('Hardware')).toBeDefined();
  });

  it('switches to Studios panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Studios'));
    expect(screen.getByText('Core Studio')).toBeDefined();
    expect(screen.getByText('Agent Studio')).toBeDefined();
  });

  it('switches to Agents panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Agents'));
    expect(screen.getByText('Cores')).toBeDefined();
  });

  it('switches to Monitor panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Monitor'));
    expect(screen.getByText('Cost Tracker')).toBeDefined();
    expect(screen.getByText('Live Logs')).toBeDefined();
  });

  it('shows Super-Goose badge', () => {
    render(<SuperGoosePanel />);
    expect(screen.getByText('Super-Goose')).toBeDefined();
  });

  it('has data-super attribute for CSS scoping', () => {
    const { container } = render(<SuperGoosePanel />);
    const panel = container.querySelector('[data-super="true"]');
    expect(panel).toBeDefined();
    expect(panel).not.toBeNull();
  });

  it('switches to Settings panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(screen.getByText('Feature Toggles')).toBeDefined();
    expect(screen.getByText('Experience Store')).toBeDefined();
  });

  it('switches to GPU panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('GPU'));
    expect(screen.getByText('Cluster')).toBeDefined();
    expect(screen.getByText('Local GPU')).toBeDefined();
  });

  it('switches to Connections panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Connections'));
    expect(screen.getByText('Services')).toBeDefined();
    expect(screen.getByText('GitHub')).toBeDefined();
  });

  it('switches to Marketplace panel on click', () => {
    render(<SuperGoosePanel />);
    fireEvent.click(screen.getByTitle('Marketplace'));
    expect(screen.getByText('Browse')).toBeDefined();
  });
});
