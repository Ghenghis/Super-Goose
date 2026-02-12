import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FeatureStatusDashboard from '../FeatureStatusDashboard';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <FeatureStatusDashboard />
    </MemoryRouter>
  );
}

describe('FeatureStatusDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Backend Feature Status heading', () => {
    renderDashboard();
    expect(screen.getByText('Backend Feature Status')).toBeInTheDocument();
  });

  it('shows correct counts in summary bar', () => {
    renderDashboard();
    // 8 working, 2 partial, 10 total
    expect(screen.getByText('8 working, 2 partial, 10 total')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });

  it('renders all 10 feature cards', () => {
    renderDashboard();
    expect(screen.getByText('CostTracker / Budget')).toBeInTheDocument();
    expect(screen.getByText('Reflexion')).toBeInTheDocument();
    expect(screen.getByText('Guardrails')).toBeInTheDocument();
    expect(screen.getByText('Code-Test-Fix')).toBeInTheDocument();
    expect(screen.getByText('/model Hot-Switch')).toBeInTheDocument();
    expect(screen.getByText('Compaction Manager')).toBeInTheDocument();
    expect(screen.getByText('Cross-Session Search')).toBeInTheDocument();
    expect(screen.getByText('Project Auto-Detection')).toBeInTheDocument();
    expect(screen.getByText('Rate Limiting')).toBeInTheDocument();
    expect(screen.getByText('Bookmarks')).toBeInTheDocument();
  });

  it('shows Working badges for working features', () => {
    renderDashboard();
    const workingBadges = screen.getAllByText('Working');
    expect(workingBadges.length).toBe(8);
  });

  it('shows Partial badges for partial features', () => {
    renderDashboard();
    const partialBadges = screen.getAllByText('Partial');
    expect(partialBadges.length).toBe(2);
  });

  it('shows status notes for features that have them', () => {
    renderDashboard();
    expect(screen.getByText('(warn-only)')).toBeInTheDocument();
    expect(screen.getByText('(ExecutionMode exists)')).toBeInTheDocument();
    expect(screen.getByText('(Instantiated only)')).toBeInTheDocument();
  });

  it('navigates when clicking a feature with a link', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // CostTracker has link: '/budget'
    const budgetButton = screen.getByText('CostTracker / Budget').closest('button')!;
    await user.click(budgetButton);
    expect(mockNavigate).toHaveBeenCalledWith('/budget');
  });

  it('does not navigate when clicking a feature without a link', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Rate Limiting has no link
    const rateLimitButton = screen.getByText('Rate Limiting').closest('button')!;
    expect(rateLimitButton).toBeDisabled();
    await user.click(rateLimitButton);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
